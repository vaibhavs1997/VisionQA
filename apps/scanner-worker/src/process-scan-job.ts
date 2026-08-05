import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Pool } from "pg";
import { resolveViewports, Viewport, UiIssue, parseProjectSettings, ScanInsights, CrawlMode } from "@ui-quality/shared";
import { PlaywrightBrowserAdapter, collectPageContext, assertUrlIsSafe } from "@ui-quality/scanner-core";
import { DetectorRegistry, OPTIONAL_DETECTORS } from "@ui-quality/detectors";
import { discoverUrls } from "@ui-quality/crawler";
import {
  validateCandidates,
  deduplicateCandidates,
  computeUiQualityScore,
  assembleIssues,
  applyResponsiveDelta,
  deduplicateViewportInvariantIssues,
} from "@ui-quality/issue-engine";
import { AiProvider, AnthropicProvider, MockAiProvider, AiCostTracker, enhanceWithAi } from "@ui-quality/ai-engine";
import { ObjectStorage } from "@ui-quality/storage";
import { Logger, MetricsRegistry } from "@ui-quality/observability";
import {
  updateScanProgress,
  completeScan,
  createScanPage,
  insertIssues,
  IssueRow,
  recordUsageEvent,
  getScan,
} from "@ui-quality/database";
import { ScanJobPayload, ScanJobResult } from "@ui-quality/queue";

function resolveAiProvider(mode: "off" | "mock" | "anthropic"): AiProvider | null {
  if (mode === "off") return null;
  if (mode === "mock") return new MockAiProvider();
  return new AnthropicProvider();
}

/**
 * Uploads every screenshot the collector wrote to a local temp dir into
 * object storage, returning the storage keys. This is the piece that
 * makes a worker process disposable/scalable: nothing it produces lives
 * on the worker's own disk once the job finishes — it's all in
 * Postgres + object storage, so any worker instance can pick up any job.
 */
async function uploadScreenshots(
  storage: ObjectStorage,
  scanId: string,
  pageUrl: string,
  viewportName: string,
  localScreenshotPaths: { path: string; kind: string }[]
): Promise<string[]> {
  const pageKey = Buffer.from(pageUrl).toString("base64url").slice(0, 16);
  const keys: string[] = [];
  for (const shot of localScreenshotPaths) {
    const key = `scans/${scanId}/screenshots/${pageKey}-${viewportName}-${shot.kind === "full-page" ? "full" : "viewport"}.png`;
    const body = fs.readFileSync(shot.path);
    await storage.putObject({ key, body, contentType: "image/png" });
    keys.push(key);
  }
  return keys;
}

function issueToRow(issue: UiIssue, scanPageId: string): IssueRow {
  return {
    issueId: issue.issueId,
    scanId: issue.scanId,
    scanPageId,
    category: issue.category,
    issueType: issue.issueType,
    title: issue.title,
    description: issue.description,
    severity: issue.severity,
    confidence: issue.confidence,
    url: issue.url,
    viewport: issue.viewport,
    selector: issue.element?.selector,
    boundingBox: issue.element?.boundingBox as unknown as Record<string, number> | undefined,
    evidence: issue.evidence,
    aiExplanation: issue.aiExplanation,
    aiValidation: issue.aiValidation as unknown as Record<string, unknown> | undefined,
    suggestedFix: issue.suggestedFix,
    detector: issue.detector,
    rootCauseSignature: issue.rootCauseSignature,
    affectedElementCount: issue.affectedElementCount,
    responsiveRecurrence: issue.responsiveRecurrence as unknown as Record<string, unknown> | undefined,
  };
}

export interface ProcessScanJobDeps {
  pool: Pool;
  storage: ObjectStorage;
  chromiumExecutablePath?: string;
  logger?: Logger;
  metrics?: MetricsRegistry;
}

/**
 * The actual scan pipeline — reuses scanner-core/detectors/issue-engine/
 * ai-engine exactly as the CLI and Phase 3 API do (same pipeline, third
 * time now), differing only in where the output lands: Postgres rows and
 * object storage keys instead of a local report.json and screenshots
 * directory. This is deliberately the ONLY thing that changes between
 * "run via CLI," "run via Phase 3 API," and "run via a Phase 4 queue
 * worker" — the detection engine itself has no idea which one it's in.
 */
export async function processScanJob(payload: ScanJobPayload, deps: ProcessScanJobDeps): Promise<ScanJobResult> {
  const { pool, storage } = deps;
  const { scanId } = payload;
  const viewports: Viewport[] = resolveViewports(payload.viewports);
  const projectSettings = parseProjectSettings(payload.projectSettings);
  const crawlMode: CrawlMode = payload.crawlMode ?? projectSettings.defaultCrawlMode;
  const maxPages = payload.maxPages ?? projectSettings.defaultMaxPages;
  const registry = new DetectorRegistry().withOptional(projectSettings.runAxe ? OPTIONAL_DETECTORS : []);
  const aiProvider = resolveAiProvider(payload.aiMode);
  const aiCostTracker = new AiCostTracker();
  const startedAtMs = Date.now();

  const existing = await getScan(pool, payload.workspaceId, scanId);
  if (existing?.status === "FAILED" && existing.failureReason === "Cancelled by user") {
    return { status: "FAILED", failureReason: "Cancelled by user" };
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `scan-worker-${scanId}-`));
  const allIssues: UiIssue[] = [];
  let finalUrl = payload.requestedUrl;
  let anyViewportFailed = false;
  let allViewportsFailed = true;

  await updateScanProgress(pool, scanId, { status: "INITIALIZING" });

  const discoverAdapter = new PlaywrightBrowserAdapter({ executablePath: deps.chromiumExecutablePath });
  let pageUrls = [payload.requestedUrl];
  try {
    await discoverAdapter.open();
    pageUrls = await discoverUrls({
      mode: crawlMode,
      entryUrl: payload.requestedUrl,
      maxPages,
      fetchText: async (url) => {
        try {
          await assertUrlIsSafe(url);
        } catch {
          return { ok: false };
        }
        const res = await discoverAdapter.fetchExternal(url);
        return { ok: res.ok, body: res.body, status: res.status };
      },
    });
  } catch {
    pageUrls = [payload.requestedUrl];
  } finally {
    await discoverAdapter.close();
  }

  let scanInsights: ScanInsights = {
    crawl: { mode: crawlMode, pagesPlanned: pageUrls.length, pagesCompleted: 0, urls: pageUrls },
    detectorChecklist: registry.list().map((d) => ({ id: d.id, category: d.category, ran: true })),
  };

  try {
    let pagesCompleted = 0;
    for (const pageUrl of pageUrls) {
      for (const viewport of viewports) {
      const adapter = new PlaywrightBrowserAdapter({ executablePath: deps.chromiumExecutablePath });
      const viewportOutDir = path.join(tempDir, viewport.name);

      try {
        await updateScanProgress(pool, scanId, { status: "LOADING_PAGE", currentStep: `viewport:${viewport.name}` });

        const pageContext = await collectPageContext(adapter, {
          scanId,
          requestedUrl: pageUrl,
          viewport,
          outDir: viewportOutDir,
          linkCheck: {
            maxLinksToCheck: projectSettings.maxLinksToCheck,
            scope: projectSettings.linkCheckScope,
          },
          runAxe: projectSettings.runAxe,
        });
        finalUrl = pageContext.page.finalUrl;
        if (viewport.name === "desktop" && pageUrl === pageUrls[0]) {
          scanInsights = {
            ...scanInsights,
            navigation: pageContext.page.navigation,
            linkCheck: pageContext.page.linkCheckMeta,
          };
        }
        allViewportsFailed = false;

        await updateScanProgress(pool, scanId, { status: "RUNNING_DETECTORS", currentStep: `viewport:${viewport.name}` });
        const candidates = await registry.runAll(pageContext);
        const { accepted } = validateCandidates(candidates);
        const deduplicated = deduplicateCandidates(accepted);

        let enhancedCandidates = deduplicated.map((d) => d.candidate);
        if (aiProvider) {
          await updateScanProgress(pool, scanId, { status: "AI_ANALYSIS", currentStep: `viewport:${viewport.name}` });
          const fullPageScreenshot = pageContext.screenshots.find((s) => s.kind === "full-page")?.path;
          enhancedCandidates = await enhanceWithAi(enhancedCandidates, pageContext, {
            provider: aiProvider,
            costTracker: aiCostTracker,
            viewportScreenshotPath: fullPageScreenshot,
            cropOutDir: path.join(viewportOutDir, "ai-evidence"),
          });
        }

        const signatureOf = (c: (typeof deduplicated)[number]["candidate"]) =>
          c.rootCauseSignature ?? `${c.issueType}:${c.element?.selector ?? "unknown"}`;
        const affectedCounts = new Map(deduplicated.map((d) => [signatureOf(d.candidate), d.affectedElementCount]));
        const enhancedDeduplicated = enhancedCandidates.map((candidate) => ({
          candidate,
          affectedElementCount: affectedCounts.get(signatureOf(candidate)) ?? 1,
        }));

        await updateScanProgress(pool, scanId, { status: "PROCESSING_RESULTS", currentStep: `viewport:${viewport.name}` });

        const screenshotKeys = await uploadScreenshots(storage, scanId, pageUrl, viewport.name, pageContext.screenshots);
        const scanPage = await createScanPage(pool, {
          scanId,
          url: pageContext.page.finalUrl,
          viewportName: viewport.name,
          viewportWidth: viewport.width,
          viewportHeight: viewport.height,
          loadState: pageContext.page.loadState,
          screenshotStorageKeys: screenshotKeys,
        });

        const issues = assembleIssues(enhancedDeduplicated, {
          scanId,
          pageId: scanPage.id,
          url: pageContext.page.finalUrl,
          viewport,
        });
        allIssues.push(...issues);
      } catch (err) {
        anyViewportFailed = true;
        const reason = err instanceof Error ? err.constructor.name : "unknown";
        deps.metrics?.workerFailuresTotal.inc({ reason });
        deps.logger?.error({ scanId, viewport: viewport.name, err }, "viewport scan failed");
        // eslint-disable-next-line no-console
        console.error(`[scanner-worker] viewport ${viewport.name} failed for scan ${scanId}:`, err);
      } finally {
        await adapter.close();
      }
    }
      pagesCompleted += 1;
      if (scanInsights.crawl) scanInsights.crawl.pagesCompleted = pagesCompleted;
    }

    if (allViewportsFailed) {
      deps.metrics?.scanJobsTotal.inc({ status: "FAILED" });
      deps.metrics?.scanDurationSeconds.observe({ status: "FAILED" }, (Date.now() - startedAtMs) / 1000);
      await completeScan(pool, scanId, { status: "FAILED", failureReason: "All viewport scans failed." });
      return { status: "FAILED", failureReason: "All viewport scans failed." };
    }

    const viewportNames = viewports.map((v) => String(v.name));
    const correlatedIssues = deduplicateViewportInvariantIssues(
      applyResponsiveDelta(allIssues, viewportNames)
    );

    const scoreInputs = correlatedIssues.map((issue) => ({
      issue: { candidate: issue, affectedElementCount: issue.affectedElementCount },
      viewportName: issue.viewport.name,
    }));
    const { score } = computeUiQualityScore(scoreInputs);

    if (correlatedIssues.length > 0) {
      const rows = correlatedIssues.map((issue) => issueToRow(issue, issue.pageId));
      await insertIssues(pool, rows);
    }

    const aiSummary = aiProvider ? aiCostTracker.summarize() : null;
    const status = anyViewportFailed ? "PARTIALLY_COMPLETED" : "COMPLETED";

    if (aiSummary && aiProvider) {
      deps.metrics?.aiCostUsdTotal.inc({ provider: aiProvider.name }, aiSummary.totalEstimatedCostUsd);
      for (const [issueType, breakdown] of Object.entries(aiSummary.byIssueType)) {
        if (breakdown.confirmed > 0) deps.metrics?.aiCallsTotal.inc({ provider: aiProvider.name, decision: "confirm" }, breakdown.confirmed);
        if (breakdown.suppressed > 0) deps.metrics?.aiCallsTotal.inc({ provider: aiProvider.name, decision: "suppress" }, breakdown.suppressed);
        if (breakdown.needsMoreEvidence > 0)
          deps.metrics?.aiCallsTotal.inc({ provider: aiProvider.name, decision: "needs_more_evidence" }, breakdown.needsMoreEvidence);
        void issueType;
      }
    }
    deps.metrics?.scanJobsTotal.inc({ status });
    deps.metrics?.scanDurationSeconds.observe({ status }, (Date.now() - startedAtMs) / 1000);
    deps.logger?.info({ scanId, status, score: undefined, issueCount: correlatedIssues.length }, "scan job finished");

    await completeScan(pool, scanId, {
      status,
      finalUrl,
      score,
      scanMetadata: scanInsights as unknown as Record<string, unknown>,
      pagesCompleted: scanInsights.crawl?.pagesCompleted,
      aiTelemetry: aiSummary
        ? {
            provider: aiProvider!.name,
            totalCalls: aiSummary.totalCalls,
            succeededCalls: aiSummary.succeededCalls,
            failedCalls: aiSummary.failedCalls,
            totalEstimatedCostUsd: aiSummary.totalEstimatedCostUsd,
            avgLatencyMs: aiSummary.avgLatencyMs,
            costPerConfirmedIssueUsd: aiSummary.costPerConfirmedIssueUsd,
          }
        : undefined,
    });

    await recordUsageEvent(pool, {
      workspaceId: payload.workspaceId,
      eventType: "scan.completed",
      quantity: 1,
      metadata: { scanId, viewports: viewportNames, aiCalls: aiSummary?.totalCalls ?? 0 },
    });

    return { status, score };
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

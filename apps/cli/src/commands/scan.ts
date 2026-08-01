import path from "node:path";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { resolveViewports, Viewport, UiIssue } from "@ui-quality/shared";
import {
  PlaywrightBrowserAdapter,
  collectPageContext,
  UrlSecurityError,
} from "@ui-quality/scanner-core";
import { DetectorRegistry } from "@ui-quality/detectors";
import {
  validateCandidates,
  deduplicateCandidates,
  computeUiQualityScore,
  assembleIssues,
  writeReport,
  writeHtmlReport,
  applyResponsiveDelta,
  ScanReportMeta,
} from "@ui-quality/issue-engine";
import { AiProvider, AnthropicProvider, MockAiProvider, AiCostTracker, enhanceWithAi } from "@ui-quality/ai-engine";

export interface ScanCommandOptions {
  url: string;
  viewports: string[];
  outDir: string;
  navigationTimeoutMs: number;
  /** "off" (default — no AI calls, no cost, no API key required),
   * "mock" (deterministic offline heuristic provider, for exercising the
   * pipeline without API access), or "anthropic" (real vision-LLM calls,
   * requires ANTHROPIC_API_KEY). Defaults to "off" so a scan never
   * incurs AI cost or requires a key unless explicitly requested. */
  ai?: "off" | "mock" | "anthropic";
}

function resolveAiProvider(mode: "off" | "mock" | "anthropic"): AiProvider | null {
  if (mode === "off") return null;
  if (mode === "mock") return new MockAiProvider();
  return new AnthropicProvider(); // throws a clear error if ANTHROPIC_API_KEY is unset
}

export async function runScanCommand(options: ScanCommandOptions): Promise<{
  outDir: string;
  report: ReturnType<typeof writeReport>;
}> {
  const viewports: Viewport[] = resolveViewports(options.viewports);
  const scanId = `scan_${randomUUID()}`;
  const startedAt = new Date().toISOString();
  const registry = new DetectorRegistry();
  const aiMode = options.ai ?? "off";
  const aiProvider = resolveAiProvider(aiMode);
  const aiCostTracker = new AiCostTracker();
  const aiEvidenceDir = path.join(options.outDir, "ai-evidence");
  if (aiProvider) fs.mkdirSync(aiEvidenceDir, { recursive: true });

  const allIssues: UiIssue[] = [];
  let finalUrl = options.url;
  let anyViewportFailed = false;
  let allViewportsFailed = true;

  for (const viewport of viewports) {
    const viewportOutDir = path.join(options.outDir, "screenshots");
    const adapter = new PlaywrightBrowserAdapter({
      navigationTimeoutMs: options.navigationTimeoutMs,
    });

    try {
      const pageContext = await collectPageContext(adapter, {
        scanId,
        requestedUrl: options.url,
        viewport,
        outDir: viewportOutDir,
        navigationTimeoutMs: options.navigationTimeoutMs,
      });

      finalUrl = pageContext.page.finalUrl;
      allViewportsFailed = false;

      if (pageContext.page.loadState !== "loaded") {
        anyViewportFailed = true;
      }

      const candidates = await registry.runAll(pageContext);
      const { accepted } = validateCandidates(candidates);
      const deduplicated = deduplicateCandidates(accepted);

      let enhancedCandidates = deduplicated.map((d) => d.candidate);
      if (aiProvider) {
        const fullPageScreenshot = pageContext.screenshots.find((s) => s.kind === "full-page")?.path;
        enhancedCandidates = await enhanceWithAi(enhancedCandidates, pageContext, {
          provider: aiProvider,
          costTracker: aiCostTracker,
          viewportScreenshotPath: fullPageScreenshot,
          cropOutDir: aiEvidenceDir,
        });
      }

      // enhanceWithAi may return new object instances for confirmed/demoted
      // candidates (it spreads rather than mutates), so affectedElementCount
      // must be looked up by a stable signature, not object identity.
      const signatureOf = (c: (typeof deduplicated)[number]["candidate"]) =>
        c.rootCauseSignature ?? `${c.issueType}:${c.element?.selector ?? "unknown"}`;
      const affectedCounts = new Map(deduplicated.map((d) => [signatureOf(d.candidate), d.affectedElementCount]));
      const enhancedDeduplicated = enhancedCandidates.map((candidate) => ({
        candidate,
        affectedElementCount: affectedCounts.get(signatureOf(candidate)) ?? 1,
      }));

      const pageId = `${scanId}_${viewport.name}`;
      const issues = assembleIssues(enhancedDeduplicated, {
        scanId,
        pageId,
        url: pageContext.page.finalUrl,
        viewport,
      });

      allIssues.push(...issues);
    } catch (err) {
      anyViewportFailed = true;
      if (err instanceof UrlSecurityError) {
        // Fail the whole scan immediately on a security rejection —
        // there is no partial-credit for scanning an unsafe URL.
        throw err;
      }
      // eslint-disable-next-line no-console
      console.error(
        `[scan] viewport "${viewport.name}" failed: ${err instanceof Error ? err.message : err}`
      );
    } finally {
      await adapter.close();
    }
  }

  if (allViewportsFailed) {
    throw new Error("All viewport scans failed — no report was generated.");
  }

  // Cross-viewport correlation: must run after every viewport's issues
  // are assembled, since it compares the same root cause across
  // viewports — something no single-viewport detector run can see.
  const viewportNames = viewports.map((v) => String(v.name));
  const correlatedIssues = applyResponsiveDelta(allIssues, viewportNames);

  // Score is computed globally across all viewports/issues collected.
  const scoreInputs = correlatedIssues.map((issue) => ({
    issue: {
      candidate: issue,
      affectedElementCount: issue.affectedElementCount,
    },
    viewportName: issue.viewport.name,
  }));
  const { score } = computeUiQualityScore(scoreInputs);

  const scanMeta: ScanReportMeta = {
    scanId,
    requestedUrl: options.url,
    finalUrl,
    startedAt,
    completedAt: new Date().toISOString(),
    status: anyViewportFailed ? "partially_completed" : "completed",
    viewports: viewportNames,
    score,
    ...(aiProvider
      ? {
          aiTelemetry: {
            provider: aiProvider.name,
            ...(() => {
              const s = aiCostTracker.summarize();
              return {
                totalCalls: s.totalCalls,
                succeededCalls: s.succeededCalls,
                failedCalls: s.failedCalls,
                schemaValidationFailures: s.schemaValidationFailures,
                totalEstimatedCostUsd: s.totalEstimatedCostUsd,
                avgLatencyMs: s.avgLatencyMs,
                costPerConfirmedIssueUsd: s.costPerConfirmedIssueUsd,
              };
            })(),
          },
        }
      : {}),
  };

  const report = writeReport(options.outDir, scanMeta, correlatedIssues);
  writeHtmlReport(options.outDir, report);

  return { outDir: options.outDir, report };
}

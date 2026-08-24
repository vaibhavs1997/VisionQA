import http from "node:http";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { VIEWPORT_PRESETS } from "@ui-quality/shared";
import { PlaywrightBrowserAdapter, collectPageContext, ScannerNetworkPolicy } from "@ui-quality/scanner-core";
import { DetectorRegistry } from "@ui-quality/detectors";
import {
  validateCandidates,
  deduplicateCandidates,
  assembleIssues,
  applyResponsiveDelta,
  computeUiQualityScore,
  writeReport,
  writeHtmlReport,
} from "@ui-quality/issue-engine";
import { MockAiProvider, AiCostTracker, enhanceWithAi } from "@ui-quality/ai-engine";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PAGES_DIR = path.join(__dirname, "..", "pages");
const OUT_DIR = path.join(__dirname, "..", "..", "scan-output", "ai-demo");

function startStaticServer(): Promise<{ port: number; close: () => Promise<void> }> {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const filePath = path.join(PAGES_DIR, decodeURIComponent((req.url ?? "/").split("?")[0]));
      fs.readFile(filePath, (err, data) => {
        if (err) {
          res.writeHead(404);
          res.end();
          return;
        }
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(data);
      });
    });
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      resolve({ port: (addr as any).port, close: () => new Promise((r) => server.close(() => r())) });
    });
  });
}

async function main() {
  const { port, close } = await startStaticServer();
  const scanId = `ai_demo_${randomUUID()}`;
  const startedAt = new Date().toISOString();
  const registry = new DetectorRegistry();
  const provider = new MockAiProvider({ simulatedLatencyMs: 5 });
  const costTracker = new AiCostTracker();
  const aiEvidenceDir = path.join(OUT_DIR, "ai-evidence");
  fs.mkdirSync(aiEvidenceDir, { recursive: true });

  const allIssues = [];
  const viewport = VIEWPORT_PRESETS.desktop;
  const url = `http://127.0.0.1:${port}/phase1-layout-issues.html`;
  const networkPolicy = ScannerNetworkPolicy.forTestFixtures();
  const adapter = new PlaywrightBrowserAdapter({ executablePath: process.env.UI_SCAN_CHROMIUM_PATH, networkPolicy });

  const outDir = path.join(OUT_DIR, "screenshots");
  const pageContext = await collectPageContext(adapter, {
    scanId,
    requestedUrl: url,
    viewport,
    outDir,
    networkPolicy,
  });

  const candidates = await registry.runAll(pageContext);
  const { accepted } = validateCandidates(candidates);
  const deduplicated = deduplicateCandidates(accepted);

  console.log(`\nDeterministic candidates before AI: ${deduplicated.length}`);
  for (const d of deduplicated) {
    console.log(`  - ${d.candidate.issueType} (confidence ${d.candidate.confidence.toFixed(2)}, severity ${d.candidate.severity})`);
  }

  const beforeAi = deduplicated.map((d) => d.candidate);
  const afterAi = await enhanceWithAi(beforeAi, pageContext, {
    provider,
    costTracker,
    viewportScreenshotPath: pageContext.screenshots.find((s) => s.kind === "full-page")?.path,
    cropOutDir: aiEvidenceDir,
  });

  console.log(`\nCandidates after AI validation: ${afterAi.length}`);
  for (const c of afterAi) {
    const aiInfo = c.aiValidation ? ` [AI: ${c.aiValidation.decision}, aiConfidence=${c.aiValidation.aiConfidence.toFixed(2)}]` : " [not AI-eligible]";
    console.log(`  - ${c.issueType} (confidence ${c.confidence.toFixed(2)}, severity ${c.severity})${aiInfo}`);
    if (c.aiExplanation) console.log(`      explanation: ${c.aiExplanation}`);
    if (c.aiValidation?.cropPath) console.log(`      crop: ${c.aiValidation.cropPath} (exists: ${fs.existsSync(c.aiValidation.cropPath)})`);
  }

  const signatureOf = (c: (typeof deduplicated)[number]["candidate"]) =>
    c.rootCauseSignature ?? `${c.issueType}:${c.element?.selector ?? "unknown"}`;
  const affectedCounts = new Map(deduplicated.map((d) => [signatureOf(d.candidate), d.affectedElementCount]));
  const enhancedDeduplicated = afterAi.map((candidate) => ({
    candidate,
    affectedElementCount: affectedCounts.get(signatureOf(candidate)) ?? 1,
  }));

  const issues = assembleIssues(enhancedDeduplicated, {
    scanId,
    pageId: `${scanId}_${viewport.name}`,
    url: pageContext.page.finalUrl,
    viewport,
  });
  allIssues.push(...issues);

  const correlated = applyResponsiveDelta(allIssues, [viewport.name]);
  const { score } = computeUiQualityScore(
    correlated.map((issue) => ({ issue: { candidate: issue, affectedElementCount: issue.affectedElementCount }, viewportName: issue.viewport.name }))
  );

  const summary = costTracker.summarize();
  const report = writeReport(OUT_DIR, {
    scanId,
    requestedUrl: url,
    finalUrl: pageContext.page.finalUrl,
    startedAt,
    completedAt: new Date().toISOString(),
    status: "completed",
    viewports: [viewport.name],
    score,
    aiTelemetry: {
      provider: provider.name,
      totalCalls: summary.totalCalls,
      succeededCalls: summary.succeededCalls,
      failedCalls: summary.failedCalls,
      schemaValidationFailures: summary.schemaValidationFailures,
      totalEstimatedCostUsd: summary.totalEstimatedCostUsd,
      avgLatencyMs: summary.avgLatencyMs,
      costPerConfirmedIssueUsd: summary.costPerConfirmedIssueUsd,
    },
  }, correlated);
  writeHtmlReport(OUT_DIR, report);

  console.log(`\nAI telemetry: ${JSON.stringify(summary, null, 2)}`);
  console.log(`\nReport written to ${OUT_DIR}/report.json and report.html`);

  await adapter.close();
  await close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

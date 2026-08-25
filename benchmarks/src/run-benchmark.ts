import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { VIEWPORT_PRESETS } from "@ui-quality/shared";
import { PlaywrightBrowserAdapter, collectPageContext, ScannerNetworkPolicy } from "@ui-quality/scanner-core";
import { DetectorRegistry } from "@ui-quality/detectors";
import { validateCandidates, deduplicateCandidates } from "@ui-quality/issue-engine";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PAGES_DIR = path.join(__dirname, "..", "pages");
const EXPECTED_PATH = path.join(__dirname, "..", "expected", "expected-issues.json");
const OUT_DIR = path.join(__dirname, "..", "..", "scan-output", "benchmark");

interface ExpectedEntry {
  expectedIssueTypes: string[];
  minExpectedCount: number;
  notes: string;
}

function startStaticServer(): Promise<{ port: number; close: () => Promise<void> }> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const filePath = path.join(PAGES_DIR, decodeURIComponent((req.url ?? "/").split("?")[0]));
      if (!filePath.startsWith(PAGES_DIR)) {
        res.writeHead(403);
        res.end("Forbidden");
        return;
      }
      fs.readFile(filePath, (err, data) => {
        if (err) {
          res.writeHead(404);
          res.end("Not found");
          return;
        }
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(data);
      });
    });
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address && typeof address === "object") {
        resolve({
          port: address.port,
          close: () => new Promise((r) => server.close(() => r())),
        });
      } else {
        reject(new Error("Failed to determine static server port"));
      }
    });
  });
}

async function scanFixture(
  baseUrl: string,
  fixtureFile: string,
  scanId: string
): Promise<{ issueTypes: Set<string>; durationMs: number }> {
  const url = `${baseUrl}/${fixtureFile}`;
  const foundIssueTypes = new Set<string>();
  const registry = new DetectorRegistry();
  const started = Date.now();

  for (const viewport of [VIEWPORT_PRESETS.desktop, VIEWPORT_PRESETS.mobile]) {
    const networkPolicy = ScannerNetworkPolicy.forTestFixtures();
    const adapter = new PlaywrightBrowserAdapter({
      executablePath: process.env.UI_SCAN_CHROMIUM_PATH,
      networkPolicy,
    });
    try {
      const outDir = path.join(OUT_DIR, fixtureFile.replace(".html", ""), viewport.name);
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
      for (const { candidate } of deduplicated) {
        foundIssueTypes.add(candidate.issueType);
      }
    } finally {
      await adapter.close();
    }
  }

  return { issueTypes: foundIssueTypes, durationMs: Date.now() - started };
}

async function main() {
  const expected: Record<string, ExpectedEntry> = JSON.parse(fs.readFileSync(EXPECTED_PATH, "utf-8"));
  const { port, close } = await startStaticServer();
  const baseUrl = `http://127.0.0.1:${port}`;
  const scanId = `benchmark_${randomUUID()}`;

  let truePositives = 0;
  let falseNegatives = 0;
  let falsePositives = 0;
  let cleanPageFalsePositives = 0;
  let totalDurationMs = 0;

  const perPageResults: Array<{
    page: string;
    expected: string[];
    found: string[];
    matched: string[];
    missed: string[];
    unexpected: string[];
    durationMs: number;
  }> = [];

  console.log(`\nStarting benchmark against ${Object.keys(expected).length} fixture pages...\n`);

  for (const [fixtureFile, entry] of Object.entries(expected)) {
    process.stdout.write(`  Scanning ${fixtureFile} ... `);
    const { issueTypes, durationMs } = await scanFixture(baseUrl, fixtureFile, scanId);
    totalDurationMs += durationMs;

    const expectedSet = new Set(entry.expectedIssueTypes);
    const matched = [...expectedSet].filter((t) => issueTypes.has(t));
    const missed = [...expectedSet].filter((t) => !issueTypes.has(t));
    const unexpected = [...issueTypes].filter((t) => !expectedSet.has(t));

    truePositives += matched.length;
    falseNegatives += missed.length;
    falsePositives += unexpected.length;
    if (entry.expectedIssueTypes.length === 0) {
      cleanPageFalsePositives += unexpected.length;
    }

    perPageResults.push({
      page: fixtureFile,
      expected: entry.expectedIssueTypes,
      found: [...issueTypes],
      matched,
      missed,
      unexpected,
      durationMs,
    });

    console.log(`done (${(durationMs / 1000).toFixed(1)}s) — found: [${[...issueTypes].join(", ") || "none"}]`);
  }

  await close();

  const precision = truePositives + falsePositives > 0 ? truePositives / (truePositives + falsePositives) : 1;
  const recall = truePositives + falseNegatives > 0 ? truePositives / (truePositives + falseNegatives) : 1;
  const avgDurationS = totalDurationMs / Object.keys(expected).length / 1000;

  console.log("\n--- Benchmark Results ---\n");
  for (const r of perPageResults) {
    console.log(`${r.page}`);
    console.log(`  expected: [${r.expected.join(", ") || "none"}]`);
    console.log(`  found:    [${r.found.join(", ") || "none"}]`);
    if (r.missed.length) console.log(`  MISSED:     [${r.missed.join(", ")}]`);
    if (r.unexpected.length) console.log(`  UNEXPECTED: [${r.unexpected.join(", ")}]`);
    console.log("");
  }

  console.log("--- Aggregate Metrics ---");
  console.log(`True Positives:  ${truePositives}`);
  console.log(`False Negatives: ${falseNegatives}`);
  console.log(`False Positives: ${falsePositives} (of which ${cleanPageFalsePositives} on the clean control page)`);
  console.log(`Precision:       ${(precision * 100).toFixed(1)}%  (target >= 90%)`);
  console.log(`Recall:          ${(recall * 100).toFixed(1)}%  (target >= 80%)`);
  console.log(`Avg scan time:   ${avgDurationS.toFixed(1)}s per fixture page, 2 viewports  (target < 60s)`);

  const passed = precision >= 0.9 && recall >= 0.8 && avgDurationS < 60;
  console.log(`\nPhase 0 acceptance gate: ${passed ? "PASS" : "FAIL"}\n`);

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(OUT_DIR, "benchmark-results.json"),
    JSON.stringify({ truePositives, falseNegatives, falsePositives, precision, recall, avgDurationS, perPageResults }, null, 2)
  );

  process.exit(passed ? 0 : 1);
}

main().catch((err) => {
  console.error("Benchmark run failed:", err);
  process.exit(1);
});

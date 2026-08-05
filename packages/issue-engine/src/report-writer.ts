import fs from "node:fs";
import path from "node:path";
import { UiIssue, IssueSeverity } from "@ui-quality/shared";

export interface ScanReportMeta {
  scanId: string;
  requestedUrl: string;
  finalUrl: string;
  startedAt: string;
  completedAt: string;
  status: "completed" | "partially_completed" | "failed";
  viewports: string[];
  score: number;
  scanInsights?: import("@ui-quality/shared").ScanInsights;
  /** Present only when Phase 2 AI validation ran during this scan.
   * Loosely typed here (rather than importing AiTelemetrySummary from
   * @ui-quality/ai-engine) so issue-engine's only dependency stays
   * @ui-quality/shared — this is a pure data pass-through, not a real
   * dependency on the AI layer's behavior. */
  aiTelemetry?: {
    provider: string;
    totalCalls: number;
    succeededCalls: number;
    failedCalls: number;
    schemaValidationFailures: number;
    totalEstimatedCostUsd: number;
    avgLatencyMs: number;
    costPerConfirmedIssueUsd?: number;
  };
}

export interface ScanReport {
  scan: ScanReportMeta;
  summary: {
    totalIssues: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  issues: UiIssue[];
}

function summarize(issues: UiIssue[]): ScanReport["summary"] {
  const counts: Record<IssueSeverity, number> = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const issue of issues) counts[issue.severity]++;
  return {
    totalIssues: issues.length,
    critical: counts.critical,
    high: counts.high,
    medium: counts.medium,
    low: counts.low,
  };
}

export function writeReport(outDir: string, scan: ScanReportMeta, issues: UiIssue[]): ScanReport {
  fs.mkdirSync(outDir, { recursive: true });
  const evidenceDir = path.join(outDir, "evidence");
  fs.mkdirSync(evidenceDir, { recursive: true });

  const report: ScanReport = { scan, summary: summarize(issues), issues };

  fs.writeFileSync(path.join(outDir, "report.json"), JSON.stringify(report, null, 2), "utf-8");

  issues.forEach((issue, idx) => {
    const filename = `issue-${String(idx + 1).padStart(3, "0")}.json`;
    fs.writeFileSync(path.join(evidenceDir, filename), JSON.stringify(issue, null, 2), "utf-8");
  });

  return report;
}

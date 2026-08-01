import { ScanReport } from "@ui-quality/issue-engine";

export function printConsoleSummary(report: ScanReport, outDir: string): void {
  const { scan, summary } = report;
  const lines = [
    "",
    "Scan completed",
    `URL: ${scan.requestedUrl}`,
    `Final URL: ${scan.finalUrl}`,
    `Viewports: ${scan.viewports.join(", ")}`,
    `Status: ${scan.status}`,
    `Issues: ${summary.totalIssues}`,
    `Critical: ${summary.critical}, High: ${summary.high}, Medium: ${summary.medium}, Low: ${summary.low}`,
    `UI Quality Score: ${scan.score}/100`,
  ];

  if (scan.aiTelemetry) {
    const t = scan.aiTelemetry;
    lines.push(
      "",
      `AI validation (${t.provider}): ${t.totalCalls} calls (${t.succeededCalls} ok, ${t.failedCalls} failed, ${t.schemaValidationFailures} rejected by schema)`,
      `AI cost: $${t.totalEstimatedCostUsd.toFixed(4)} total` +
        (t.costPerConfirmedIssueUsd !== undefined ? `, $${t.costPerConfirmedIssueUsd.toFixed(4)} per confirmed issue` : ""),
      `AI avg latency: ${t.avgLatencyMs.toFixed(0)}ms`
    );
  }

  lines.push(`Output: ${outDir}`, "");
  // eslint-disable-next-line no-console
  console.log(lines.join("\n"));
}

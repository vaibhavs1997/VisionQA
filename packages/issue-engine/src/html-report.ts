import fs from "node:fs";
import path from "node:path";
import { UiIssue, IssueSeverity } from "@ui-quality/shared";
import { ScanReport } from "./report-writer";

const SEVERITY_COLOR: Record<IssueSeverity, string> = {
  critical: "#b91c1c",
  high: "#c2410c",
  medium: "#a16207",
  low: "#4b5563",
};

const SEVERITY_ORDER: IssueSeverity[] = ["critical", "high", "medium", "low"];

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function scoreColor(score: number): string {
  if (score >= 85) return "#15803d";
  if (score >= 60) return "#a16207";
  return "#b91c1c";
}

function renderIssueCard(issue: UiIssue): string {
  const screenshotRel = `screenshots/${issue.viewport.name}-viewport.png`;
  const recurrence = issue.responsiveRecurrence;
  const recurrenceBadge = recurrence
    ? recurrence.narrowViewportOnly
      ? `<span class="badge badge-narrow">narrow-viewport only</span>`
      : recurrence.viewportsAffected.length > 1
      ? `<span class="badge badge-recurs">recurs on ${recurrence.viewportsAffected.join(", ")}</span>`
      : ""
    : "";
  const aiBadge = issue.aiValidation
    ? `<span class="badge badge-ai" title="Validated by ${escapeHtml(issue.aiValidation.provider)}/${escapeHtml(
        issue.aiValidation.model
      )}">AI: ${issue.aiValidation.decision.replace(/_/g, " ")}</span>`
    : "";

  return `
  <div class="issue-card severity-${issue.severity}">
    <div class="issue-header">
      <span class="severity-tag" style="background:${SEVERITY_COLOR[issue.severity]}">${issue.severity.toUpperCase()}</span>
      <span class="category-tag">${escapeHtml(issue.category)}</span>
      <span class="confidence-tag">confidence ${(issue.confidence * 100).toFixed(0)}%</span>
      ${issue.affectedElementCount > 1 ? `<span class="badge">${issue.affectedElementCount} elements</span>` : ""}
      ${recurrenceBadge}
      ${aiBadge}
    </div>
    <h3>${escapeHtml(issue.title)}</h3>
    <p class="description">${escapeHtml(issue.description)}</p>
    ${issue.aiExplanation ? `<p class="ai-explanation"><strong>AI explanation:</strong> ${escapeHtml(issue.aiExplanation)}</p>` : ""}
    ${issue.element?.selector ? `<code class="selector">${escapeHtml(issue.element.selector)}</code>` : ""}
    <div class="meta-grid">
      <div><strong>Viewport:</strong> ${escapeHtml(issue.viewport.name)} (${issue.viewport.width}x${issue.viewport.height})</div>
      <div><strong>Detector:</strong> ${escapeHtml(issue.detector.id)}</div>
      ${issue.evidence.measuredValue ? `<div><strong>Measured:</strong> ${escapeHtml(issue.evidence.measuredValue)}</div>` : ""}
      ${issue.evidence.expectedValue ? `<div><strong>Expected:</strong> ${escapeHtml(issue.evidence.expectedValue)}</div>` : ""}
      ${issue.evidence.resourceUrl ? `<div><strong>Resource:</strong> ${escapeHtml(issue.evidence.resourceUrl)}</div>` : ""}
    </div>
    ${issue.suggestedFix ? `<p class="fix"><strong>Suggested fix:</strong> ${escapeHtml(issue.suggestedFix)}</p>` : ""}
    <details>
      <summary>Screenshot (${escapeHtml(issue.viewport.name)})</summary>
      <img src="${screenshotRel}" alt="Viewport screenshot" loading="lazy" />
    </details>
  </div>`;
}

/**
 * Writes a single self-contained report.html next to report.json — no
 * external dependencies, no build step, just something a developer can
 * double-click open. This is a Phase 1 deliverable specifically so
 * detection quality can be reviewed before any SaaS dashboard exists.
 */
export function writeHtmlReport(outDir: string, report: ScanReport): string {
  const bySeverity = new Map<IssueSeverity, UiIssue[]>();
  for (const sev of SEVERITY_ORDER) bySeverity.set(sev, []);
  for (const issue of report.issues) bySeverity.get(issue.severity)!.push(issue);

  const sections = SEVERITY_ORDER.filter((sev) => bySeverity.get(sev)!.length > 0)
    .map(
      (sev) => `
    <section>
      <h2>${sev.toUpperCase()} <span class="count">(${bySeverity.get(sev)!.length})</span></h2>
      ${bySeverity
        .get(sev)!
        .map(renderIssueCard)
        .join("\n")}
    </section>`
    )
    .join("\n");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>UI Quality Report — ${escapeHtml(report.scan.finalUrl)}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 0; padding: 32px; background: #f9fafb; color: #111827; }
  header { margin-bottom: 32px; }
  header h1 { font-size: 20px; margin: 0 0 4px; }
  header .url { color: #6b7280; font-size: 14px; }
  .score-badge { display: inline-block; font-size: 40px; font-weight: 700; margin-top: 12px; }
  .summary-bar { display: flex; gap: 16px; margin-top: 16px; }
  .summary-chip { padding: 6px 12px; border-radius: 6px; font-size: 13px; font-weight: 600; color: white; }
  section { margin-bottom: 28px; }
  section h2 { font-size: 15px; text-transform: uppercase; letter-spacing: 0.05em; color: #374151; border-bottom: 1px solid #e5e7eb; padding-bottom: 6px; }
  .count { color: #9ca3af; font-weight: 400; }
  .issue-card { background: white; border: 1px solid #e5e7eb; border-left: 4px solid #9ca3af; border-radius: 6px; padding: 16px; margin-bottom: 12px; }
  .issue-card.severity-critical { border-left-color: ${SEVERITY_COLOR.critical}; }
  .issue-card.severity-high { border-left-color: ${SEVERITY_COLOR.high}; }
  .issue-card.severity-medium { border-left-color: ${SEVERITY_COLOR.medium}; }
  .issue-card.severity-low { border-left-color: ${SEVERITY_COLOR.low}; }
  .issue-header { display: flex; gap: 8px; align-items: center; margin-bottom: 8px; flex-wrap: wrap; }
  .severity-tag { color: white; font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 4px; }
  .category-tag, .confidence-tag, .badge { font-size: 11px; color: #4b5563; background: #f3f4f6; padding: 2px 8px; border-radius: 4px; }
  .badge-narrow { background: #fef3c7; color: #92400e; }
  .badge-recurs { background: #fee2e2; color: #991b1b; }
  .badge-ai { background: #ede9fe; color: #5b21b6; }
  .ai-explanation { font-size: 12px; background: #f5f3ff; padding: 8px; border-radius: 4px; margin: 4px 0 8px; border-left: 2px solid #7c3aed; }
  .ai-telemetry { font-size: 12px; color: #6b7280; margin-top: 8px; }
  h3 { margin: 4px 0 6px; font-size: 15px; }
  .description { color: #374151; font-size: 13px; margin: 0 0 8px; }
  .selector { display: block; background: #f3f4f6; padding: 4px 8px; border-radius: 4px; font-size: 12px; margin-bottom: 8px; overflow-x: auto; }
  .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; font-size: 12px; color: #4b5563; margin-bottom: 8px; }
  .fix { font-size: 12px; background: #eff6ff; padding: 8px; border-radius: 4px; margin: 8px 0; }
  details { font-size: 12px; }
  details img { max-width: 100%; border: 1px solid #e5e7eb; border-radius: 4px; margin-top: 8px; }
</style>
</head>
<body>
  <header>
    <h1>UI Quality Report</h1>
    <div class="url">${escapeHtml(report.scan.finalUrl)} — scanned ${escapeHtml(report.scan.completedAt)}</div>
    <div class="score-badge" style="color:${scoreColor(report.scan.score)}">${report.scan.score}/100</div>
    <div class="summary-bar">
      <span class="summary-chip" style="background:${SEVERITY_COLOR.critical}">Critical: ${report.summary.critical}</span>
      <span class="summary-chip" style="background:${SEVERITY_COLOR.high}">High: ${report.summary.high}</span>
      <span class="summary-chip" style="background:${SEVERITY_COLOR.medium}">Medium: ${report.summary.medium}</span>
      <span class="summary-chip" style="background:${SEVERITY_COLOR.low}">Low: ${report.summary.low}</span>
    </div>
    ${
      report.scan.aiTelemetry
        ? `<div class="ai-telemetry">AI validation (${escapeHtml(report.scan.aiTelemetry.provider)}): ${
            report.scan.aiTelemetry.totalCalls
          } calls, $${report.scan.aiTelemetry.totalEstimatedCostUsd.toFixed(4)} total${
            report.scan.aiTelemetry.costPerConfirmedIssueUsd !== undefined
              ? ` ($${report.scan.aiTelemetry.costPerConfirmedIssueUsd.toFixed(4)}/confirmed issue)`
              : ""
          }, ${report.scan.aiTelemetry.avgLatencyMs.toFixed(0)}ms avg latency</div>`
        : ""
    }
  </header>
  ${sections || "<p>No issues found.</p>"}
</body>
</html>`;

  const filePath = path.join(outDir, "report.html");
  fs.writeFileSync(filePath, html, "utf-8");
  return filePath;
}

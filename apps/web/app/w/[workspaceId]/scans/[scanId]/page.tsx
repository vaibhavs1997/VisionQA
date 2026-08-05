import Link from "next/link";
import { api } from "@/lib/api-client";
import { ScorePanel } from "@/components/score-panel";
import { IssueCard } from "@/components/issue-card";
import { IssueFilterBar } from "@/components/issue-filter-bar";
import { ScanProgressPoller } from "@/components/scan-progress-poller";
import { ScreenshotViewer } from "@/components/screenshot-viewer";
import { ScanInsightsPanel } from "@/components/scan-insights-panel";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

const TERMINAL_STATUSES = new Set(["COMPLETED", "PARTIALLY_COMPLETED", "FAILED"]);

export default async function ScanPage({
  params,
  searchParams,
}: {
  params: { workspaceId: string; scanId: string };
  searchParams: { severity?: string; category?: string; viewport?: string };
}) {
  const { scan, summary, pages } = await api.getScan(params.workspaceId, params.scanId);
  const isTerminal = TERMINAL_STATUSES.has(scan.status);

  const { issues } = isTerminal ? await api.getScanIssues(params.workspaceId, params.scanId, searchParams) : { issues: [] };

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/w/${params.workspaceId}/projects/${scan.projectId}`}
          className="font-mono text-xs uppercase tracking-wide text-ink-faint hover:text-ink"
        >
          ← Back to project
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-ink">Scan results</h1>
        <p className="font-mono text-sm text-ink-faint">{scan.finalUrl ?? scan.requestedUrl}</p>
      </div>

      {!isTerminal && <ScanProgressPoller workspaceId={params.workspaceId} scanId={scan.id} initialStatus={scan.status} />}

      {scan.status === "FAILED" && (
        <div className="viewfinder rounded-lg border border-critical/30 bg-critical-soft p-6 text-critical">
          <span className="vf-br" />
          <span className="vf-bl" />
          <p className="font-medium text-critical-ink">
            {scan.failureReason === "Cancelled by user" ? "Scan cancelled" : "Scan failed"}
          </p>
          <p className="mt-1 text-sm text-critical-ink/80">{scan.failureReason ?? "An unknown error occurred."}</p>
        </div>
      )}

      {isTerminal && scan.status !== "FAILED" && (
        <>
          <ScorePanel score={scan.score} summary={summary} />

          <ScanInsightsPanel insights={scan.scanMetadata as Record<string, unknown> | undefined} />

          <p className="text-sm">
            <a
              className="font-mono text-signal hover:underline"
              href={`${API_URL}/api/workspaces/${params.workspaceId}/scans/${scan.id}/export.csv`}
            >
              Export issues (CSV)
            </a>
            <span className="text-ink-faint"> — requires session cookie / Bearer in browser extensions</span>
          </p>

          {scan.status === "PARTIALLY_COMPLETED" && (
            <div className="rounded-lg border border-medium/30 bg-medium-soft p-4 text-sm text-medium-ink">
              One or more viewports failed to complete — results below reflect only the viewports that succeeded.
            </div>
          )}

          {scan.aiTelemetry && (
            <div className="rounded-lg border border-signal/30 bg-signal-soft p-4 font-mono text-sm text-signal-ink">
              AI validation ({String(scan.aiTelemetry.provider)}): {String(scan.aiTelemetry.totalCalls)} calls, $
              {Number(scan.aiTelemetry.totalEstimatedCostUsd).toFixed(4)} total
            </div>
          )}

          <div>
            <h2 className="label-eyebrow mb-3">Screenshots</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {pages.map((page) => (
                <div key={page.id}>
                  <p className="mb-1.5 font-mono text-xs uppercase tracking-wide text-ink-faint">{page.viewportName}</p>
                  <ScreenshotViewer url={page.screenshotUrls[0]} label={page.viewportName} />
                </div>
              ))}
            </div>
          </div>

          <div>
            <h2 className="label-eyebrow mb-3">Issues ({issues.length})</h2>
            <IssueFilterBar />
            {issues.length === 0 ? (
              <p className="rounded-lg border border-dashed border-line-strong p-6 text-center text-ink-faint">
                No issues match the current filters.
              </p>
            ) : (
              <div className="space-y-2">
                {issues.map((issue) => (
                  <IssueCard key={issue.issueId} issue={issue} workspaceId={params.workspaceId} />
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

import Link from "next/link";
import { api } from "@/lib/api-client";
import { ScorePanel } from "@/components/score-panel";
import { IssueCard } from "@/components/issue-card";
import { IssueFilterBar } from "@/components/issue-filter-bar";
import { ScanProgressPoller } from "@/components/scan-progress-poller";
import { ScreenshotViewer } from "@/components/screenshot-viewer";

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

  const { issues } = isTerminal
    ? await api.getScanIssues(params.workspaceId, params.scanId, searchParams)
    : { issues: [] };

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/w/${params.workspaceId}/projects/${scan.projectId}`} className="text-sm text-gray-500 hover:text-gray-700">
          ← Back to project
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-gray-900">Scan results</h1>
        <p className="text-gray-600">{scan.finalUrl ?? scan.requestedUrl}</p>
      </div>

      {!isTerminal && (
        <ScanProgressPoller workspaceId={params.workspaceId} scanId={scan.id} initialStatus={scan.status} />
      )}

      {scan.status === "FAILED" && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-6">
          <p className="font-medium text-red-900">Scan failed</p>
          <p className="mt-1 text-sm text-red-700">{scan.failureReason ?? "An unknown error occurred."}</p>
        </div>
      )}

      {isTerminal && scan.status !== "FAILED" && (
        <>
          <ScorePanel score={scan.score} summary={summary} />

          {scan.status === "PARTIALLY_COMPLETED" && (
            <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800">
              One or more viewports failed to complete — results below reflect only the viewports that succeeded.
            </div>
          )}

          {scan.aiTelemetry && (
            <div className="rounded-lg border border-violet-200 bg-violet-50 p-4 text-sm text-violet-800">
              AI validation ({String(scan.aiTelemetry.provider)}): {String(scan.aiTelemetry.totalCalls)} calls, $
              {Number(scan.aiTelemetry.totalEstimatedCostUsd).toFixed(4)} total
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {pages.map((page) => (
              <div key={page.id}>
                <p className="mb-1 text-xs font-medium uppercase text-gray-500">{page.viewportName}</p>
                <ScreenshotViewer url={page.screenshotUrls[0]} label={page.viewportName} />
              </div>
            ))}
          </div>

          <div>
            <h2 className="mb-3 text-lg font-semibold text-gray-900">
              Issues <span className="font-normal text-gray-400">({issues.length})</span>
            </h2>
            <IssueFilterBar />
            {issues.length === 0 ? (
              <p className="rounded-lg border border-dashed border-gray-300 p-6 text-center text-gray-500">
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

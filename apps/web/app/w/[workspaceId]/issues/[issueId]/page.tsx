import Link from "next/link";
import { api } from "@/lib/api-client";
import { ScreenshotViewer } from "@/components/screenshot-viewer";
import { FeedbackButtons } from "@/components/feedback-buttons";
import { IssueCard } from "@/components/issue-card";

const SEVERITY_STYLES: Record<string, string> = {
  critical: "bg-red-100 text-critical",
  high: "bg-orange-100 text-high",
  medium: "bg-yellow-100 text-medium",
  low: "bg-gray-100 text-low",
};

export default async function IssueDetailPage({
  params,
}: {
  params: { workspaceId: string; issueId: string };
}) {
  const { issue, relatedIssues } = await api.getIssue(params.workspaceId, params.issueId);
  const { pages } = await api.getScan(params.workspaceId, issue.scanId);
  const matchingPage = pages.find((p) => p.viewportName === issue.viewport.name);

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/w/${params.workspaceId}/scans/${issue.scanId}`} className="text-sm text-gray-500 hover:text-gray-700">
          ← Back to scan results
        </Link>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className={`rounded px-2 py-0.5 text-xs font-bold uppercase ${SEVERITY_STYLES[issue.severity]}`}>
            {issue.severity}
          </span>
          <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{issue.category}</span>
          <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
            confidence {(issue.confidence * 100).toFixed(0)}%
          </span>
          {issue.affectedElementCount > 1 && (
            <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
              affects {issue.affectedElementCount} elements
            </span>
          )}
          {issue.responsiveRecurrence?.narrowViewportOnly && (
            <span className="rounded bg-yellow-100 px-2 py-0.5 text-xs text-yellow-800">narrow-viewport only</span>
          )}
        </div>

        <h1 className="mb-2 text-xl font-bold text-gray-900">{issue.title}</h1>
        <p className="mb-4 text-gray-700">{issue.description}</p>

        {issue.aiExplanation && (
          <div className="mb-4 rounded-md border-l-2 border-violet-500 bg-violet-50 p-3 text-sm text-violet-900">
            <p className="mb-1 font-medium">
              AI explanation
              {issue.aiValidation && (
                <span className="ml-2 font-normal text-violet-600">
                  ({issue.aiValidation.provider}/{issue.aiValidation.model}, decision: {issue.aiValidation.decision})
                </span>
              )}
            </p>
            {issue.aiExplanation}
          </div>
        )}

        {issue.element?.selector && (
          <code className="mb-4 block overflow-x-auto rounded bg-gray-50 px-3 py-2 text-xs text-gray-600">
            {issue.element.selector}
          </code>
        )}

        <div className="mb-4 grid grid-cols-2 gap-2 text-sm text-gray-600 sm:grid-cols-3">
          <div>
            <span className="text-gray-400">Viewport: </span>
            {issue.viewport.name} ({issue.viewport.width}x{issue.viewport.height})
          </div>
          <div>
            <span className="text-gray-400">Detector: </span>
            {issue.detector.id}
          </div>
          <div>
            <span className="text-gray-400">Page: </span>
            <a href={issue.url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">
              {issue.url}
            </a>
          </div>
        </div>

        {Object.keys(issue.evidence).length > 0 && (
          <details className="mb-4">
            <summary className="cursor-pointer text-sm font-medium text-gray-700">Technical evidence</summary>
            <pre className="mt-2 overflow-x-auto rounded bg-gray-50 p-3 text-xs text-gray-600">
              {JSON.stringify(issue.evidence, null, 2)}
            </pre>
          </details>
        )}

        {issue.suggestedFix && (
          <div className="mb-4 rounded-md bg-blue-50 p-3 text-sm text-blue-900">
            <p className="mb-1 font-medium">Suggested fix</p>
            {issue.suggestedFix}
          </div>
        )}

        <div className="mb-4">
          <ScreenshotViewer url={matchingPage?.screenshotUrls[0]} label={issue.viewport.name} />
        </div>

        <FeedbackButtons issue={issue} workspaceId={params.workspaceId} />
      </div>

      {relatedIssues.length > 0 && (
        <div>
          <h2 className="mb-3 text-lg font-semibold text-gray-900">Related issues</h2>
          <div className="space-y-2">
            {relatedIssues.map((related) => (
              <IssueCard key={related.issueId} issue={related} workspaceId={params.workspaceId} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

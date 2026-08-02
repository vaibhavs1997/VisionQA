import Link from "next/link";
import { api } from "@/lib/api-client";
import { ScreenshotViewer } from "@/components/screenshot-viewer";
import { FeedbackButtons } from "@/components/feedback-buttons";
import { IssueCard } from "@/components/issue-card";
import { SeverityBadge, Badge } from "@/components/ui/badge";

export default async function IssueDetailPage({ params }: { params: { workspaceId: string; issueId: string } }) {
  const { issue, relatedIssues } = await api.getIssue(params.workspaceId, params.issueId);
  const { pages } = await api.getScan(params.workspaceId, issue.scanId);
  const matchingPage = pages.find((p) => p.viewportName === issue.viewport.name);

  return (
    <div className="space-y-6">
      <Link
        href={`/w/${params.workspaceId}/scans/${issue.scanId}`}
        className="font-mono text-xs uppercase tracking-wide text-ink-faint hover:text-ink"
      >
        ← Back to scan results
      </Link>

      <div className="rounded-lg border border-line bg-surface p-6 shadow-panel">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <SeverityBadge severity={issue.severity} />
          <Badge>{issue.category}</Badge>
          <Badge>
            <span className="font-mono">{(issue.confidence * 100).toFixed(0)}%</span>&nbsp;confidence
          </Badge>
          {issue.affectedElementCount > 1 && <Badge>affects {issue.affectedElementCount} elements</Badge>}
          {issue.responsiveRecurrence?.narrowViewportOnly && <Badge tone="warning">narrow-viewport only</Badge>}
        </div>

        <h1 className="mb-2 text-xl font-semibold text-ink">{issue.title}</h1>
        <p className="mb-4 text-ink-faint">{issue.description}</p>

        {issue.aiExplanation && (
          <div className="mb-4 rounded border-l-2 border-signal bg-signal-soft p-3 text-sm text-signal-ink">
            <p className="mb-1 font-medium">
              AI explanation
              {issue.aiValidation && (
                <span className="ml-2 font-mono text-xs font-normal opacity-70">
                  ({issue.aiValidation.provider}/{issue.aiValidation.model}, decision: {issue.aiValidation.decision})
                </span>
              )}
            </p>
            {issue.aiExplanation}
          </div>
        )}

        {issue.element?.selector && (
          <code className="mb-4 block overflow-x-auto rounded bg-paper px-3 py-2 font-mono text-xs text-ink-faint">
            {issue.element.selector}
          </code>
        )}

        <div className="mb-4 grid grid-cols-2 gap-2 text-sm text-ink-faint sm:grid-cols-3">
          <div>
            <span className="label-eyebrow mr-1 inline">Viewport</span>
            <br />
            <span className="font-mono text-ink">
              {issue.viewport.name} ({issue.viewport.width}×{issue.viewport.height})
            </span>
          </div>
          <div>
            <span className="label-eyebrow mr-1 inline">Detector</span>
            <br />
            <span className="font-mono text-ink">{issue.detector.id}</span>
          </div>
          <div>
            <span className="label-eyebrow mr-1 inline">Page</span>
            <br />
            <a href={issue.url} target="_blank" rel="noreferrer" className="font-mono text-signal-ink hover:underline">
              {issue.url}
            </a>
          </div>
        </div>

        {Object.keys(issue.evidence).length > 0 && (
          <details className="mb-4">
            <summary className="cursor-pointer text-sm font-medium text-ink">Technical evidence</summary>
            <pre className="mt-2 overflow-x-auto rounded bg-paper p-3 font-mono text-xs text-ink-faint">
              {JSON.stringify(issue.evidence, null, 2)}
            </pre>
          </details>
        )}

        {issue.suggestedFix && (
          <div className="mb-4 rounded bg-paper p-3 text-sm text-ink">
            <p className="label-eyebrow mb-1">Suggested fix</p>
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
          <h2 className="label-eyebrow mb-3">Related issues</h2>
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

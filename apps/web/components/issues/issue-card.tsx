import Link from "next/link";
import { UiIssue } from "@/lib/types";
import { SeverityBadge, Badge } from "@/components/ui/badge";

export function IssueCard({ issue, workspaceId }: { issue: UiIssue; workspaceId: string }) {
  return (
    <Link
      href={`/w/${workspaceId}/issues/${issue.issueId}`}
      className="group block rounded-lg border border-line bg-surface p-4 transition hover:border-signal hover:shadow-panel"
    >
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <SeverityBadge severity={issue.severity} />
        <Badge>{issue.category}</Badge>
        <Badge>
          <span className="font-mono">{(issue.confidence * 100).toFixed(0)}%</span>&nbsp;confidence
        </Badge>
        {issue.affectedElementCount > 1 && <Badge>{issue.affectedElementCount} elements</Badge>}
        {issue.aiValidation && <Badge tone="signal">AI: {issue.aiValidation.decision.replace(/_/g, " ")}</Badge>}
        {issue.feedbackStatus !== "open" && <Badge tone="warning">{issue.feedbackStatus.replace(/_/g, " ")}</Badge>}
      </div>
      <h3 className="font-medium text-ink group-hover:text-signal-ink">{issue.title}</h3>
      <p className="mt-1 text-sm text-ink-faint">{issue.description}</p>
      {issue.element?.selector && (
        <code className="mt-2 block truncate rounded bg-paper px-2 py-1 font-mono text-xs text-ink-faint">
          {issue.element.selector}
        </code>
      )}
      <p className="mt-2 font-mono text-xs uppercase tracking-wide text-ink-faint/70">{issue.viewport.name} viewport</p>
    </Link>
  );
}

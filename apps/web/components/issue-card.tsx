import Link from "next/link";
import { UiIssue } from "@/lib/types";

const SEVERITY_STYLES: Record<string, string> = {
  critical: "bg-red-100 text-critical",
  high: "bg-orange-100 text-high",
  medium: "bg-yellow-100 text-medium",
  low: "bg-gray-100 text-low",
};

export function IssueCard({ issue, workspaceId }: { issue: UiIssue; workspaceId: string }) {
  return (
    <Link
      href={`/w/${workspaceId}/issues/${issue.issueId}`}
      className="block rounded-lg border border-gray-200 bg-white p-4 transition hover:border-gray-300 hover:shadow-sm"
    >
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className={`rounded px-2 py-0.5 text-xs font-bold uppercase ${SEVERITY_STYLES[issue.severity]}`}>
          {issue.severity}
        </span>
        <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{issue.category}</span>
        <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
          confidence {(issue.confidence * 100).toFixed(0)}%
        </span>
        {issue.affectedElementCount > 1 && (
          <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
            {issue.affectedElementCount} elements
          </span>
        )}
        {issue.aiValidation && (
          <span className="rounded bg-violet-100 px-2 py-0.5 text-xs text-violet-700">
            AI: {issue.aiValidation.decision.replace(/_/g, " ")}
          </span>
        )}
        {issue.feedbackStatus !== "open" && (
          <span className="rounded bg-blue-100 px-2 py-0.5 text-xs text-blue-700">
            {issue.feedbackStatus.replace(/_/g, " ")}
          </span>
        )}
      </div>
      <h3 className="font-medium text-gray-900">{issue.title}</h3>
      <p className="mt-1 text-sm text-gray-600">{issue.description}</p>
      {issue.element?.selector && (
        <code className="mt-2 block truncate rounded bg-gray-50 px-2 py-1 text-xs text-gray-500">
          {issue.element.selector}
        </code>
      )}
      <p className="mt-2 text-xs text-gray-400">{issue.viewport.name} viewport</p>
    </Link>
  );
}

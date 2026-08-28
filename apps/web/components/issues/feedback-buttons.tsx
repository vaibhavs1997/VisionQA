"use client";

import { useState } from "react";
import { api } from "@/lib/api-client";
import { UiIssue } from "@/lib/types";

const OPTIONS: { value: "valid" | "false_positive" | "ignored"; label: string; style: string }[] = [
  { value: "valid", label: "Valid issue", style: "border-signal/50 text-signal-ink hover:bg-signal-soft" },
  { value: "false_positive", label: "False positive", style: "border-critical/40 text-critical-ink hover:bg-critical-soft" },
  { value: "ignored", label: "Ignore", style: "border-line-strong text-ink-faint hover:bg-paper" },
];

export function FeedbackButtons({ issue, workspaceId }: { issue: UiIssue; workspaceId: string }) {
  const [status, setStatus] = useState(issue.feedbackStatus);
  const [submitting, setSubmitting] = useState<string | null>(null);

  async function handleClick(feedback: "valid" | "false_positive" | "ignored") {
    setSubmitting(feedback);
    try {
      await api.submitFeedback(workspaceId, issue.issueId, feedback);
      setStatus(feedback);
    } finally {
      setSubmitting(null);
    }
  }

  return (
    <div>
      <p className="mb-2 text-sm font-medium text-ink">
        Is this a real issue?
        {status !== "open" && (
          <span className="ml-2 font-mono text-xs font-normal text-ink-faint">(marked as {status.replace(/_/g, " ")})</span>
        )}
      </p>
      <div className="flex flex-wrap gap-2">
        {OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => handleClick(opt.value)}
            disabled={submitting !== null}
            className={`rounded border bg-surface px-3 py-1.5 text-sm font-medium transition disabled:opacity-50 ${opt.style} ${
              status === opt.value ? "ring-2 ring-offset-1 ring-offset-surface" : ""
            }`}
          >
            {submitting === opt.value ? "Saving…" : opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

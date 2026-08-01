"use client";

import { useState } from "react";
import { api } from "@/lib/api-client";
import { UiIssue } from "@/lib/types";

const OPTIONS: { value: "valid" | "false_positive" | "ignored"; label: string; style: string }[] = [
  { value: "valid", label: "Valid issue", style: "border-green-300 text-green-700 hover:bg-green-50" },
  { value: "false_positive", label: "False positive", style: "border-red-300 text-red-700 hover:bg-red-50" },
  { value: "ignored", label: "Ignore", style: "border-gray-300 text-gray-600 hover:bg-gray-50" },
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
      <p className="mb-2 text-sm font-medium text-gray-700">
        Is this a real issue?
        {status !== "open" && (
          <span className="ml-2 text-xs font-normal text-gray-500">
            (marked as {status.replace(/_/g, " ")})
          </span>
        )}
      </p>
      <div className="flex gap-2">
        {OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => handleClick(opt.value)}
            disabled={submitting !== null}
            className={`rounded-md border bg-white px-3 py-1.5 text-sm font-medium transition disabled:opacity-50 ${
              opt.style
            } ${status === opt.value ? "ring-2 ring-offset-1" : ""}`}
          >
            {submitting === opt.value ? "Saving..." : opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

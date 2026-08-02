"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api-client";
import { setClientWorkspaceId } from "@/lib/session";

export function CreateWorkspaceForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const workspace = await api.createWorkspace({ name });
      setClientWorkspaceId(workspace.id);
      router.push(`/w/${workspace.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create workspace.");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="viewfinder rounded-lg border border-line bg-surface p-6 text-line-strong">
      <span className="vf-br" />
      <span className="vf-bl" />
      <h2 className="mb-4 text-sm font-semibold text-ink">New workspace</h2>
      <div className="mb-4">
        <label className="mb-1 block text-sm font-medium text-ink">Workspace name</label>
        <input
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Acme Inc."
          className="w-full rounded border border-line bg-paper px-3 py-2 text-sm text-ink focus:border-signal focus:outline-none"
        />
      </div>
      {error && <p className="mb-4 text-sm text-critical">{error}</p>}
      <button
        type="submit"
        disabled={submitting}
        className="rounded bg-ink px-4 py-2 text-sm font-medium text-paper transition hover:bg-ink-soft disabled:opacity-50"
      >
        {submitting ? "Creating…" : "Create workspace"}
      </button>
    </form>
  );
}

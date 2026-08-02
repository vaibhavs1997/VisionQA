"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api-client";

export function CreateProjectForm({ workspaceId }: { workspaceId: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [targetUrl, setTargetUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const project = await api.createProject(workspaceId, { name, baseUrl: targetUrl });
      router.push(`/w/${workspaceId}/projects/${project.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create project.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="viewfinder rounded-lg border border-line bg-surface p-6 text-line-strong">
      <span className="vf-br" />
      <span className="vf-bl" />
      <h2 className="mb-4 text-sm font-semibold text-ink">New project</h2>
      <div className="mb-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-ink">Project name</label>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My Website"
            className="w-full rounded border border-line bg-paper px-3 py-2 text-sm text-ink focus:border-signal focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-ink">Website URL</label>
          <input
            type="url"
            required
            value={targetUrl}
            onChange={(e) => setTargetUrl(e.target.value)}
            placeholder="https://example.com"
            className="w-full rounded border border-line bg-paper px-3 py-2 font-mono text-sm text-ink focus:border-signal focus:outline-none"
          />
        </div>
      </div>
      {error && <p className="mb-4 text-sm text-critical">{error}</p>}
      <button
        type="submit"
        disabled={submitting}
        className="rounded bg-ink px-4 py-2 text-sm font-medium text-paper transition hover:bg-ink-soft disabled:opacity-50"
      >
        {submitting ? "Creating…" : "Create project"}
      </button>
    </form>
  );
}

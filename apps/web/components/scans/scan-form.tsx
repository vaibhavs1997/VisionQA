"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api-client";

const VIEWPORT_OPTIONS = ["desktop", "tablet", "mobile"] as const;

export function ScanForm({ workspaceId, projectId }: { workspaceId: string; projectId: string }) {
  const router = useRouter();
  const [selectedViewports, setSelectedViewports] = useState<string[]>(["desktop", "mobile"]);
  const [aiMode, setAiMode] = useState<"off" | "mock" | "anthropic">("off");
  const [crawlMode, setCrawlMode] = useState<"single" | "sitemap" | "bfs">("single");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleViewport(viewport: string) {
    setSelectedViewports((prev) => (prev.includes(viewport) ? prev.filter((v) => v !== viewport) : [...prev, viewport]));
  }

  async function handleScan() {
    if (selectedViewports.length === 0) {
      setError("Select at least one viewport.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const { scanId } = await api.createScan(workspaceId, {
        projectId,
        viewports: selectedViewports,
        crawlMode,
        options: { ai: aiMode },
      });
      router.push(`/w/${workspaceId}/scans/${scanId}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to start scan.");
      setSubmitting(false);
    }
  }

  return (
    <div className="viewfinder rounded-lg border border-line bg-surface p-6 text-line-strong">
      <span className="vf-br" />
      <span className="vf-bl" />
      <p className="label-eyebrow mb-1">New scan</p>
      <h2 className="mb-5 text-base font-semibold text-ink">Run the detector suite against this project</h2>

      <div className="mb-5">
        <p className="mb-2 text-sm font-medium text-ink">Viewports</p>
        <div className="flex gap-2">
          {VIEWPORT_OPTIONS.map((viewport) => (
            <button
              key={viewport}
              type="button"
              onClick={() => toggleViewport(viewport)}
              className={`rounded border px-3 py-1.5 font-mono text-sm capitalize transition ${
                selectedViewports.includes(viewport)
                  ? "border-ink bg-ink text-paper"
                  : "border-line bg-paper text-ink-faint hover:border-line-strong"
              }`}
            >
              {viewport}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-5">
        <p className="mb-2 text-sm font-medium text-ink">Scan scope</p>
        <select
          value={crawlMode}
          onChange={(e) => setCrawlMode(e.target.value as typeof crawlMode)}
          className="w-full rounded border border-line bg-paper px-3 py-2 text-sm text-ink focus:border-signal focus:outline-none sm:w-auto"
        >
          <option value="single">Single URL (project base URL)</option>
          <option value="sitemap">Sitemap crawl (bounded)</option>
          <option value="bfs">Same-site link crawl (bounded)</option>
        </select>
      </div>

      <div className="mb-6">
        <p className="mb-2 text-sm font-medium text-ink">AI validation</p>
        <select
          value={aiMode}
          onChange={(e) => setAiMode(e.target.value as typeof aiMode)}
          className="w-full rounded border border-line bg-paper px-3 py-2 text-sm text-ink focus:border-signal focus:outline-none sm:w-auto"
        >
          <option value="off">Off — deterministic detectors only</option>
          <option value="mock">Mock — offline heuristic, no cost</option>
          <option value="anthropic">Anthropic — real AI, requires server-side API key</option>
        </select>
      </div>

      {error && <p className="mb-4 text-sm text-critical">{error}</p>}

      <button
        type="button"
        onClick={handleScan}
        disabled={submitting}
        className="rounded bg-signal px-5 py-2.5 text-sm font-semibold text-ink transition hover:bg-signal/90 disabled:opacity-50"
      >
        {submitting ? "Starting scan…" : "Scan UI →"}
      </button>
    </div>
  );
}

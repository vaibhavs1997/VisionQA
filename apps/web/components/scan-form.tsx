"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api-client";

const VIEWPORT_OPTIONS = ["desktop", "tablet", "mobile"] as const;

export function ScanForm({ workspaceId, projectId }: { workspaceId: string; projectId: string }) {
  const router = useRouter();
  const [selectedViewports, setSelectedViewports] = useState<string[]>(["desktop", "mobile"]);
  const [aiMode, setAiMode] = useState<"off" | "mock" | "anthropic">("off");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleViewport(viewport: string) {
    setSelectedViewports((prev) =>
      prev.includes(viewport) ? prev.filter((v) => v !== viewport) : [...prev, viewport]
    );
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
        options: { ai: aiMode },
      });
      router.push(`/w/${workspaceId}/scans/${scanId}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to start scan.");
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6">
      <h2 className="mb-4 text-lg font-semibold text-gray-900">Start a new scan</h2>

      <div className="mb-4">
        <p className="mb-2 text-sm font-medium text-gray-700">Viewports</p>
        <div className="flex gap-2">
          {VIEWPORT_OPTIONS.map((viewport) => (
            <button
              key={viewport}
              type="button"
              onClick={() => toggleViewport(viewport)}
              className={`rounded-md border px-3 py-1.5 text-sm capitalize transition ${
                selectedViewports.includes(viewport)
                  ? "border-gray-900 bg-gray-900 text-white"
                  : "border-gray-300 bg-white text-gray-700 hover:border-gray-400"
              }`}
            >
              {viewport}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-4">
        <p className="mb-2 text-sm font-medium text-gray-700">AI validation</p>
        <select
          value={aiMode}
          onChange={(e) => setAiMode(e.target.value as typeof aiMode)}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
        >
          <option value="off">Off (deterministic detectors only)</option>
          <option value="mock">Mock (offline heuristic, no cost)</option>
          <option value="anthropic">Anthropic (real AI, requires API key configured on the server)</option>
        </select>
      </div>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      <button
        type="button"
        onClick={handleScan}
        disabled={submitting}
        className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
      >
        {submitting ? "Starting scan..." : "Scan UI"}
      </button>
    </div>
  );
}

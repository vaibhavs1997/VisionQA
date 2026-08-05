import Link from "next/link";
import { api } from "@/lib/api-client";
import { ScanForm } from "@/components/scan-form";
import { Badge } from "@/components/ui/badge";
import { ProjectTrendsPanel } from "@/components/project-trends-panel";

const STATUS_TONE: Record<string, "signal" | "warning" | "neutral"> = {
  COMPLETED: "signal",
  PARTIALLY_COMPLETED: "warning",
  FAILED: "neutral",
};

export default async function ProjectPage({ params }: { params: { workspaceId: string; projectId: string } }) {
  const project = await api.getProject(params.workspaceId, params.projectId);
  const { scans } = await api.listScansForProject(params.workspaceId, params.projectId);
  const { trends } = await api.getProjectTrends(params.workspaceId, params.projectId).catch(() => ({ trends: [] }));

  return (
    <div className="space-y-8">
      <div>
        <Link href={`/w/${params.workspaceId}`} className="font-mono text-xs uppercase tracking-wide text-ink-faint hover:text-ink">
          ← All projects
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-ink">{project.name}</h1>
        <p className="font-mono text-sm text-ink-faint">{project.baseUrl}</p>
      </div>

      <ScanForm workspaceId={params.workspaceId} projectId={project.id} />

      <ProjectTrendsPanel trends={trends} />

      <div>
        <h2 className="label-eyebrow mb-3">Scan history ({scans.length})</h2>
        {scans.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line-strong p-6 text-center text-ink-faint">
            No scans yet — start one above.
          </p>
        ) : (
          <div className="space-y-2">
            {scans.map((scan) => (
              <Link
                key={scan.id}
                href={`/w/${params.workspaceId}/scans/${scan.id}`}
                className="flex items-center justify-between rounded-lg border border-line bg-surface p-4 transition hover:border-signal hover:shadow-panel"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <Badge tone={STATUS_TONE[scan.status] ?? "neutral"}>{scan.status.replace(/_/g, " ")}</Badge>
                    <span className="font-mono text-xs text-ink-faint">{scan.viewports.join(", ")}</span>
                  </div>
                  <p className="mt-1 text-sm text-ink-faint">{new Date(scan.createdAt).toLocaleString()}</p>
                </div>
                {scan.score !== null && <p className="font-mono text-xl font-bold text-ink">{scan.score}/100</p>}
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

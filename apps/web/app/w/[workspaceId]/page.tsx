import Link from "next/link";
import { api } from "@/lib/api-client";
import { CreateProjectForm } from "@/components/create-project-form";

export default async function WorkspaceDashboardPage({ params }: { params: { workspaceId: string } }) {
  const { projects } = await api.listProjects(params.workspaceId);

  return (
    <div className="space-y-8">
      <div>
        <p className="label-eyebrow mb-1">Dashboard</p>
        <h1 className="mb-2 text-2xl font-semibold text-ink">Projects</h1>
        <p className="text-ink-faint">Enter a URL, start a scan, and review UI quality reports.</p>
      </div>

      <CreateProjectForm workspaceId={params.workspaceId} />

      <div>
        <h2 className="label-eyebrow mb-3">Your projects ({projects.length})</h2>
        {projects.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line-strong p-6 text-center text-ink-faint">
            No projects yet — create one above to run your first scan.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {projects.map((project) => (
              <Link
                key={project.id}
                href={`/w/${params.workspaceId}/projects/${project.id}`}
                className="group rounded-lg border border-line bg-surface p-4 transition hover:border-signal hover:shadow-panel"
              >
                <p className="font-medium text-ink group-hover:text-signal-ink">{project.name}</p>
                <p className="mt-0.5 truncate font-mono text-xs text-ink-faint">{project.baseUrl}</p>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

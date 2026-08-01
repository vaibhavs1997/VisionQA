import Link from "next/link";
import { api } from "@/lib/api-client";
import { CreateProjectForm } from "@/components/create-project-form";

export default async function WorkspaceDashboardPage({ params }: { params: { workspaceId: string } }) {
  const { projects } = await api.listProjects(params.workspaceId);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="mb-2 text-2xl font-bold text-gray-900">Projects</h1>
        <p className="text-gray-600">Enter a URL, start a scan, and review UI quality reports.</p>
      </div>

      <CreateProjectForm workspaceId={params.workspaceId} />

      <div>
        <h2 className="mb-3 text-lg font-semibold text-gray-900">Your projects</h2>
        {projects.length === 0 ? (
          <p className="rounded-lg border border-dashed border-gray-300 p-6 text-center text-gray-500">
            No projects yet — create one above to run your first scan.
          </p>
        ) : (
          <div className="space-y-2">
            {projects.map((project) => (
              <Link
                key={project.id}
                href={`/w/${params.workspaceId}/projects/${project.id}`}
                className="block rounded-lg border border-gray-200 bg-white p-4 transition hover:border-gray-300 hover:shadow-sm"
              >
                <p className="font-medium text-gray-900">{project.name}</p>
                <p className="text-sm text-gray-500">{project.baseUrl}</p>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

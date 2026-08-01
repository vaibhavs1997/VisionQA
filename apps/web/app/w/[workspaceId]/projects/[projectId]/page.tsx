import Link from "next/link";
import { api } from "@/lib/api-client";
import { ScanForm } from "@/components/scan-form";

const STATUS_STYLES: Record<string, string> = {
  COMPLETED: "bg-green-100 text-green-700",
  PARTIALLY_COMPLETED: "bg-yellow-100 text-yellow-700",
  FAILED: "bg-red-100 text-red-700",
};

export default async function ProjectPage({ params }: { params: { workspaceId: string; projectId: string } }) {
  const project = await api.getProject(params.workspaceId, params.projectId);
  const { scans } = await api.listScansForProject(params.workspaceId, params.projectId);

  return (
    <div className="space-y-8">
      <div>
        <Link href={`/w/${params.workspaceId}`} className="text-sm text-gray-500 hover:text-gray-700">
          ← All projects
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-gray-900">{project.name}</h1>
        <p className="text-gray-600">{project.baseUrl}</p>
      </div>

      <ScanForm workspaceId={params.workspaceId} projectId={project.id} />

      <div>
        <h2 className="mb-3 text-lg font-semibold text-gray-900">Scan history</h2>
        {scans.length === 0 ? (
          <p className="rounded-lg border border-dashed border-gray-300 p-6 text-center text-gray-500">
            No scans yet — start one above.
          </p>
        ) : (
          <div className="space-y-2">
            {scans.map((scan) => (
              <Link
                key={scan.id}
                href={`/w/${params.workspaceId}/scans/${scan.id}`}
                className="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-4 transition hover:border-gray-300 hover:shadow-sm"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded px-2 py-0.5 text-xs font-medium ${
                        STATUS_STYLES[scan.status] ?? "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {scan.status.replace(/_/g, " ")}
                    </span>
                    <span className="text-xs text-gray-400">{scan.viewports.join(", ")}</span>
                  </div>
                  <p className="mt-1 text-sm text-gray-500">{new Date(scan.createdAt).toLocaleString()}</p>
                </div>
                {scan.score !== null && <p className="text-xl font-bold text-gray-900">{scan.score}/100</p>}
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

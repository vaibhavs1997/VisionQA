import Link from "next/link";
import { api } from "@/lib/api-client";
import { CreateWorkspaceForm } from "@/components/create-workspace-form";
import { LogoutButton } from "@/components/logout-button";

export default async function WorkspacePickerPage() {
  const { workspaces } = await api.listWorkspaces();

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="mb-2 text-2xl font-bold text-gray-900">Your workspaces</h1>
          <p className="text-gray-600">Pick a workspace, or create a new one.</p>
        </div>
        <LogoutButton />
      </div>

      {workspaces.length > 0 && (
        <div className="space-y-2">
          {workspaces.map((workspace) => (
            <Link
              key={workspace.id}
              href={`/w/${workspace.id}`}
              className="block rounded-lg border border-gray-200 bg-white p-4 transition hover:border-gray-300 hover:shadow-sm"
            >
              <p className="font-medium text-gray-900">{workspace.name}</p>
              <p className="text-sm text-gray-500 capitalize">{workspace.role ?? "member"}</p>
            </Link>
          ))}
        </div>
      )}

      <CreateWorkspaceForm />
    </div>
  );
}

import Link from "next/link";
import { api } from "@/lib/api-client";
import { CreateWorkspaceForm } from "@/components/workspaces/create-workspace-form";
import { LogoutButton } from "@/components/auth/logout-button";
import { BrandMark } from "@/components/ui/brand-mark";

export default async function WorkspacePickerPage() {
  const { workspaces } = await api.listWorkspaces();

  return (
    <div className="mx-auto min-h-screen max-w-2xl px-6 py-12">
      <div className="mb-10 flex items-center justify-between">
        <div className="flex items-center gap-2 text-ink">
          <BrandMark className="h-6 w-6 text-signal" />
          <span className="font-mono text-sm font-semibold uppercase tracking-wider">UI Quality Platform</span>
        </div>
        <LogoutButton />
      </div>

      <p className="label-eyebrow mb-2">Workspaces</p>
      <h1 className="mb-8 text-2xl font-semibold text-ink">Pick a workspace to continue</h1>

      {workspaces.length > 0 && (
        <div className="mb-8 space-y-2">
          {workspaces.map((workspace) => (
            <Link
              key={workspace.id}
              href={`/w/${workspace.id}`}
              className="group flex items-center justify-between rounded-lg border border-line bg-surface p-4 transition hover:border-signal hover:shadow-panel"
            >
              <div>
                <p className="font-medium text-ink">{workspace.name}</p>
                <p className="font-mono text-xs uppercase tracking-wide text-ink-faint">{workspace.role ?? "member"}</p>
              </div>
              <span className="text-ink-faint transition group-hover:translate-x-0.5 group-hover:text-signal-ink">→</span>
            </Link>
          ))}
        </div>
      )}

      <CreateWorkspaceForm />
    </div>
  );
}

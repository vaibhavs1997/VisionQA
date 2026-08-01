import Link from "next/link";
import { api } from "@/lib/api-client";
import { LogoutButton } from "@/components/logout-button";

export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { workspaceId: string };
}) {
  const workspace = await api.getWorkspace(params.workspaceId);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between border-b border-gray-200 pb-4">
        <div>
          <Link href="/" className="text-xs text-gray-400 hover:text-gray-600">
            ← All workspaces
          </Link>
          <p className="font-medium text-gray-900">{workspace.name}</p>
        </div>
        <LogoutButton />
      </div>
      {children}
    </div>
  );
}

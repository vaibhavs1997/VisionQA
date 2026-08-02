import Link from "next/link";
import { api } from "@/lib/api-client";
import { LogoutButton } from "@/components/logout-button";
import { BrandMark } from "@/components/ui/brand-mark";

export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { workspaceId: string };
}) {
  const workspace = await api.getWorkspace(params.workspaceId);

  return (
    <div className="flex min-h-screen">
      {/* Instrument-panel sidebar — dark, persistent, deliberately distinct
          from the paper-colored content area it frames. */}
      <aside className="flex w-60 shrink-0 flex-col justify-between bg-ink px-5 py-6 text-paper">
        <div>
          <Link href="/" className="mb-8 flex items-center gap-2">
            <BrandMark className="h-5 w-5 text-signal" />
            <span className="font-mono text-xs font-semibold uppercase tracking-wider">UI Quality</span>
          </Link>

          <p className="mb-1 font-mono text-[11px] uppercase tracking-wide text-paper/40">Workspace</p>
          <p className="mb-6 truncate font-medium">{workspace.name}</p>

          <nav className="space-y-1">
            <Link
              href={`/w/${params.workspaceId}`}
              className="block rounded px-3 py-2 text-sm text-paper/80 transition hover:bg-paper/10 hover:text-paper"
            >
              Projects
            </Link>
          </nav>
        </div>

        <div className="flex items-center justify-between border-t border-paper/10 pt-4">
          <Link href="/" className="font-mono text-xs text-paper/50 hover:text-paper/80">
            ← switch workspace
          </Link>
          <LogoutButton variant="dark" />
        </div>
      </aside>

      <main className="flex-1 px-8 py-8">
        <div className="mx-auto max-w-4xl">{children}</div>
      </main>
    </div>
  );
}

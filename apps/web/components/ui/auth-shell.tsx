import { BrandMark } from "./brand-mark";

/** Shared chrome for the pre-auth screens (login, register, workspace
 * picker) — a quiet, centered instrument-panel frame around the form. */
export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 py-16">
      <div className="mb-8 flex items-center gap-2 text-ink">
        <BrandMark className="h-6 w-6 text-signal" />
        <span className="font-mono text-sm font-semibold uppercase tracking-wider">UI Quality Platform</span>
      </div>
      {children}
    </div>
  );
}

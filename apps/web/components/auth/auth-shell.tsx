import { BrandMark } from "../ui/brand-mark";

export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[#e9efed] p-3 text-ink sm:p-5 lg:p-8">
      <div className="auth-grid absolute inset-0 opacity-60" aria-hidden="true" />
      <div className="relative mx-auto grid min-h-[calc(100vh-2rem)] max-w-[1480px] gap-4 sm:min-h-[calc(100vh-2.5rem)] lg:min-h-[calc(100vh-4rem)] lg:grid-cols-[minmax(420px,0.95fr)_minmax(560px,1.05fr)] lg:gap-5">
        <aside className="relative hidden overflow-hidden rounded-[2rem] bg-ink px-10 py-10 text-white shadow-[0_24px_70px_-32px_rgba(18,21,27,0.55)] lg:flex lg:flex-col lg:px-14 lg:py-14">
          <div className="absolute -right-32 -top-32 h-96 w-96 rounded-full bg-signal/20 blur-3xl" />
          <div className="absolute -bottom-48 -left-24 h-[30rem] w-[30rem] rounded-full border border-white/10" />
          <div className="relative flex items-center gap-3"><span className="rounded-lg bg-signal p-2 text-ink"><BrandMark className="h-5 w-5" /></span><span className="font-mono text-sm font-semibold uppercase tracking-[0.18em]">UI Quality</span></div>
          <div className="relative mt-auto max-w-lg pb-10">
            <p className="mb-5 font-mono text-xs uppercase tracking-[0.22em] text-signal">Ship with confidence</p>
            <h1 className="max-w-md text-5xl font-semibold leading-[1.05] tracking-[-0.04em]">Find the defects your users would notice first.</h1>
            <p className="mt-6 max-w-md text-base leading-7 text-white/60">Visual regressions, accessibility gaps, and layout issues — caught in one calm, focused workspace.</p>
            <div className="mt-12 grid grid-cols-3 gap-6 border-t border-white/10 pt-6">
              <div><p className="font-mono text-2xl font-semibold">24/7</p><p className="mt-1 text-xs text-white/45">coverage</p></div><div><p className="font-mono text-2xl font-semibold">3×</p><p className="mt-1 text-xs text-white/45">faster QA</p></div><div><p className="font-mono text-2xl font-semibold text-signal">99.9%</p><p className="mt-1 text-xs text-white/45">signal clarity</p></div>
            </div>
          </div>
          <p className="relative font-mono text-[10px] uppercase tracking-[0.18em] text-white/30">Precision tooling for better interfaces</p>
        </aside>
        <main className="relative flex flex-col justify-center overflow-hidden rounded-[2rem] border border-white/80 bg-white px-6 py-8 shadow-[0_24px_70px_-32px_rgba(18,21,27,0.35)] sm:px-12 lg:px-16 lg:py-14">
          <div className="pointer-events-none absolute -right-24 -top-28 h-72 w-72 rounded-full bg-signal/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-40 right-10 h-80 w-80 rounded-full border border-signal/10" />
          <div className="relative mx-auto w-full max-w-[460px]">
            <div className="mb-12 flex items-center gap-2 text-ink lg:hidden"><BrandMark className="h-6 w-6 text-signal" /><span className="font-mono text-sm font-semibold uppercase tracking-wider">UI Quality</span></div>
            {children}
            <p className="mt-10 text-center font-mono text-[10px] uppercase tracking-[0.16em] text-ink-faint/70">Secure workspace access <span className="mx-2">·</span> v0.1</p>
          </div>
        </main>
      </div>
    </div>
  );
}

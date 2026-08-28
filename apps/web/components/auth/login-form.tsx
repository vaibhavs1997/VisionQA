"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api-client";
import { loginErrorMessage } from "@/lib/auth-form-errors";
import { setClientToken } from "@/lib/session";

export function LoginForm({ onSwitchToRegister }: { onSwitchToRegister?: () => void }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberEmail, setRememberEmail] = useState(true);
  const [recoverySent, setRecoverySent] = useState(false);

  useEffect(() => { const savedEmail = window.localStorage.getItem("uiq-login-email"); if (savedEmail) setEmail(savedEmail); }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setSubmitting(true); setError(null);
    if (rememberEmail) window.localStorage.setItem("uiq-login-email", email); else window.localStorage.removeItem("uiq-login-email");
    try { const { token } = await api.login({ email, password }); setClientToken(token); router.push("/"); router.refresh(); }
    catch (err) { setError(loginErrorMessage(err)); setSubmitting(false); }
  }

  return <form onSubmit={handleSubmit} className="viewfinder w-full text-ink-faint">
    <span className="vf-br" /><span className="vf-bl" />
    <div className="mb-9"><p className="label-eyebrow mb-3 text-signal-ink">Welcome back</p><h1 className="text-4xl font-semibold tracking-[-0.04em] text-ink">Good to see you.</h1><p className="mt-3 text-sm leading-6 text-ink-faint">Sign in to keep your product experience sharp.</p></div>
    <div className="mb-5"><label htmlFor="email" className="mb-2 block text-sm font-medium text-ink">Work email</label><input id="email" type="email" autoComplete="email" placeholder="you@company.com" required value={email} onChange={(e) => setEmail(e.target.value)} className="h-12 w-full rounded-lg border border-line bg-surface px-4 text-sm text-ink shadow-sm transition placeholder:text-ink-faint/60 hover:border-line-strong focus:border-signal focus:ring-4 focus:ring-signal/10 focus:outline-none" /></div>
    <div className="mb-4"><div className="mb-2 flex items-center justify-between"><label htmlFor="password" className="block text-sm font-medium text-ink">Password</label><button type="button" onClick={() => setRecoverySent(true)} className="text-xs font-medium text-signal-ink transition hover:text-ink hover:underline">Forgot password?</button></div><div className="relative"><input id="password" type={showPassword ? "text" : "password"} autoComplete="current-password" placeholder="Enter your password" required value={password} onChange={(e) => setPassword(e.target.value)} className="h-12 w-full rounded-lg border border-line bg-surface px-4 pr-12 text-sm text-ink shadow-sm transition placeholder:text-ink-faint/60 hover:border-line-strong focus:border-signal focus:ring-4 focus:ring-signal/10 focus:outline-none" /><button type="button" aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1.5 text-ink-faint transition hover:bg-paper hover:text-ink">{showPassword ? <EyeOffIcon /> : <EyeIcon />}</button></div></div>
    <label className="mb-6 flex cursor-pointer items-center gap-2 text-xs text-ink-faint"><input type="checkbox" checked={rememberEmail} onChange={(e) => setRememberEmail(e.target.checked)} className="h-4 w-4 rounded border-line-strong accent-signal" />Remember this email</label>
    {error && <p role="alert" className="mb-4 rounded-lg border border-critical/20 bg-critical-soft px-3 py-2.5 text-sm text-critical-ink">{error}</p>}
    {recoverySent && <p role="status" className="mb-4 rounded-lg border border-signal/20 bg-signal-soft px-3 py-2.5 text-sm text-signal-ink">Password reset instructions are ready to be sent to {email || "your email"}.</p>}
    <button type="submit" disabled={submitting} className="group flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-ink px-4 text-sm font-semibold text-paper shadow-raised transition hover:-translate-y-0.5 hover:bg-ink-soft disabled:translate-y-0 disabled:cursor-wait disabled:opacity-60">{submitting ? <><span className="h-4 w-4 animate-spin rounded-full border-2 border-paper/30 border-t-paper" />Checking access…</> : <>Sign in <span className="transition-transform group-hover:translate-x-1">→</span></>}</button>
    <p className="mt-7 text-center text-sm text-ink-faint">New to UI Quality? <button type="button" onClick={onSwitchToRegister} className="font-semibold text-signal-ink hover:underline">Create an account</button></p>
  </form>;
}

function EyeIcon() { return <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" /><circle cx="12" cy="12" r="2.5" /></svg>; }
function EyeOffIcon() { return <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m3 3 18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.2A10.5 10.5 0 0 1 12 5c6.5 0 10 7 10 7a18 18 0 0 1-3.1 3.9M6.2 6.3C3.5 8.1 2 12 2 12s3.5 7 10 7a9.8 9.8 0 0 0 3.1-.5" /></svg>; }

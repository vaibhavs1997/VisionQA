"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api-client";
import { registerErrorMessage } from "@/lib/auth-form-errors";

export function RegisterForm({ onSwitchToLogin }: { onSwitchToLogin?: () => void }) {
  const router = useRouter();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (firstName.trim().length < 1 || firstName.trim().length > 100 || lastName.trim().length < 1 || lastName.trim().length > 100) {
      setError("First and last names must be between 1 and 100 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setSubmitting(true);
    try {
      // The API currently provisions accounts from email and password. The
      // name fields are collected here so the form is ready for profile data.
      await api.register({ firstName: firstName.trim(), lastName: lastName.trim(), email: email.trim().toLowerCase(), password });
      window.localStorage.setItem("uiq-login-email", email);
      setSuccess(true);
    } catch (err) {
      setError(registerErrorMessage(err));
      setSubmitting(false);
    }
  }

  if (success) {
    return <section className="viewfinder w-full text-center text-ink-faint" role="status">
      <span className="vf-br" /><span className="vf-bl" />
      <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-signal-soft text-signal-ink">
        <svg aria-hidden="true" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m5 12 4 4L19 6" /></svg>
      </div>
      <p className="label-eyebrow mb-3 text-signal-ink">Account created</p>
      <h1 className="text-4xl font-semibold tracking-[-0.04em] text-ink">You’re ready to go.</h1>
      <p className="mx-auto mt-4 max-w-sm text-sm leading-6 text-ink-faint">Your UI Quality account has been created successfully. Log in to start finding issues before your users do.</p>
      <button type="button" onClick={onSwitchToLogin ?? (() => router.push("/login"))} className="mt-8 flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-ink px-4 text-sm font-semibold text-paper shadow-raised transition hover:-translate-y-0.5 hover:bg-ink-soft">Continue to login <span>→</span></button>
    </section>;
  }

  const inputClass = "h-12 w-full rounded-lg border border-line bg-surface px-4 text-sm text-ink shadow-sm transition placeholder:text-ink-faint/60 hover:border-line-strong focus:border-signal focus:ring-4 focus:ring-signal/10 focus:outline-none";
  return <form onSubmit={handleSubmit} className="viewfinder w-full text-ink-faint">
    <span className="vf-br" /><span className="vf-bl" />
    <div className="mb-8"><p className="label-eyebrow mb-3 text-signal-ink">Start building confidence</p><h1 className="text-4xl font-semibold tracking-[-0.04em] text-ink">Create your account.</h1><p className="mt-3 text-sm leading-6 text-ink-faint">Set up your workspace and catch UI issues earlier.</p></div>
    <div className="mb-5 grid gap-4 sm:grid-cols-2"><div><label htmlFor="firstName" className="mb-2 block text-sm font-medium text-ink">First Name</label><input id="firstName" type="text" autoComplete="given-name" placeholder="Alex" required value={firstName} onChange={(e) => setFirstName(e.target.value)} className={inputClass} /></div><div><label htmlFor="lastName" className="mb-2 block text-sm font-medium text-ink">Last Name</label><input id="lastName" type="text" autoComplete="family-name" placeholder="Morgan" required value={lastName} onChange={(e) => setLastName(e.target.value)} className={inputClass} /></div></div>
    <div className="mb-5"><label htmlFor="register-email" className="mb-2 block text-sm font-medium text-ink">Email</label><input id="register-email" type="email" autoComplete="email" placeholder="you@company.com" required value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} /></div>
    <div className="mb-5 grid gap-4 sm:grid-cols-2"><div><label htmlFor="register-password" className="mb-2 block text-sm font-medium text-ink">Password</label><input id="register-password" type="password" autoComplete="new-password" placeholder="8+ characters" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} /></div><div><label htmlFor="confirm-password" className="mb-2 block text-sm font-medium text-ink">Confirm Password</label><input id="confirm-password" type="password" autoComplete="new-password" placeholder="Repeat password" required minLength={8} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className={inputClass} /></div></div>
    {error && <p role="alert" className="mb-4 rounded-lg border border-critical/20 bg-critical-soft px-3 py-2.5 text-sm text-critical-ink">{error}</p>}
    <button type="submit" disabled={submitting} className="group flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-ink px-4 text-sm font-semibold text-paper shadow-raised transition hover:-translate-y-0.5 hover:bg-ink-soft disabled:translate-y-0 disabled:cursor-wait disabled:opacity-60">{submitting ? <><span className="h-4 w-4 animate-spin rounded-full border-2 border-paper/30 border-t-paper" />Creating account…</> : <>Create account <span className="transition-transform group-hover:translate-x-1">→</span></>}</button>
    <p className="mt-7 text-center text-sm text-ink-faint">Already have an account? <button type="button" onClick={onSwitchToLogin} className="font-semibold text-signal-ink hover:underline">Log in</button></p>
  </form>;
}

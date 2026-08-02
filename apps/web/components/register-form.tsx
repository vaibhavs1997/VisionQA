"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api-client";
import { setClientToken } from "@/lib/session";

export function RegisterForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const { token } = await api.register({ email, password });
      setClientToken(token);
      router.push("/");
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) setError("An account with that email already exists.");
      else if (err instanceof ApiError && err.status === 400) setError("Password must be at least 8 characters.");
      else setError("Something went wrong.");
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="viewfinder w-full max-w-sm rounded-lg border border-line bg-surface p-6 shadow-panel"
    >
      <span className="vf-br" />
      <span className="vf-bl" />
      <h1 className="mb-5 text-lg font-semibold text-ink">Create an account</h1>
      <div className="mb-4">
        <label className="mb-1 block text-sm font-medium text-ink">Email</label>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded border border-line bg-paper px-3 py-2 text-sm text-ink focus:border-signal focus:outline-none"
        />
      </div>
      <div className="mb-5">
        <label className="mb-1 block text-sm font-medium text-ink">Password</label>
        <input
          type="password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded border border-line bg-paper px-3 py-2 text-sm text-ink focus:border-signal focus:outline-none"
        />
        <p className="mt-1 font-mono text-xs text-ink-faint">min. 8 characters</p>
      </div>
      {error && <p className="mb-4 text-sm text-critical">{error}</p>}
      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded bg-ink px-4 py-2 text-sm font-medium text-paper transition hover:bg-ink-soft disabled:opacity-50"
      >
        {submitting ? "Creating account…" : "Create account"}
      </button>
      <p className="mt-4 text-center text-sm text-ink-faint">
        Already have an account?{" "}
        <a href="/login" className="text-signal-ink hover:underline">
          Log in
        </a>
      </p>
    </form>
  );
}

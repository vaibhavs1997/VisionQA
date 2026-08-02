"use client";

import { useRouter } from "next/navigation";
import { clearClientToken } from "@/lib/session";

export function LogoutButton({ variant = "light" }: { variant?: "light" | "dark" }) {
  const router = useRouter();

  function handleLogout() {
    clearClientToken();
    router.push("/login");
    router.refresh();
  }

  const colorClass = variant === "dark" ? "text-paper/50 hover:text-paper" : "text-ink-faint hover:text-ink";

  return (
    <button type="button" onClick={handleLogout} className={`font-mono text-xs uppercase tracking-wide ${colorClass}`}>
      Log out
    </button>
  );
}

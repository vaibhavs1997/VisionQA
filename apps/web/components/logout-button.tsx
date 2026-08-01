"use client";

import { useRouter } from "next/navigation";
import { clearClientToken } from "@/lib/session";

export function LogoutButton() {
  const router = useRouter();

  function handleLogout() {
    clearClientToken();
    router.push("/login");
    router.refresh();
  }

  return (
    <button type="button" onClick={handleLogout} className="text-sm text-gray-500 hover:text-gray-700">
      Log out
    </button>
  );
}

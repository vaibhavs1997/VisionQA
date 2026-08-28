"use client";

import { useState } from "react";
import { LoginForm } from "@/components/auth/login-form";
import { RegisterForm } from "@/components/auth/register-form";

export function AuthSwitcher({ initialMode }: { initialMode: "login" | "register" }) {
  const [mode, setMode] = useState(initialMode);

  function switchMode(nextMode: "login" | "register") {
    setMode(nextMode);
    window.history.replaceState(null, "", nextMode === "login" ? "/login" : "/register");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return mode === "login" ? <LoginForm onSwitchToRegister={() => switchMode("register")} /> : <RegisterForm onSwitchToLogin={() => switchMode("login")} />;
}

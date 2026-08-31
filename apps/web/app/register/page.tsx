import { AuthSwitcher } from "@/components/auth/auth-switcher";
import { AuthShell } from "@/components/auth/auth-shell";

export default function RegisterPage() {
  return (
    <AuthShell>
      <AuthSwitcher initialMode="register" />
    </AuthShell>
  );
}

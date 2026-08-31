import { AuthSwitcher } from "@/components/auth/auth-switcher";
import { AuthShell } from "@/components/auth/auth-shell";

export default function LoginPage() {
  return (
    <AuthShell>
      <AuthSwitcher initialMode="login" />
    </AuthShell>
  );
}

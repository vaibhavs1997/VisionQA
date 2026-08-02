import { RegisterForm } from "@/components/register-form";
import { AuthShell } from "@/components/ui/auth-shell";

export default function RegisterPage() {
  return (
    <AuthShell>
      <RegisterForm />
    </AuthShell>
  );
}

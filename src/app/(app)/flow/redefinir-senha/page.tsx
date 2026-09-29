import type { Metadata } from "next";

import { AuthFrame } from "@/components/flow/auth/AuthFrame";
import { ResetPasswordForm } from "@/components/flow/auth/ResetPasswordForm";

export const metadata: Metadata = {
  title: { absolute: "Nova senha · Wuavy Flow" },
  robots: { index: false },
};

export default function ResetPasswordPage() {
  return (
    <AuthFrame title="Nova senha" lead="Escolha a nova senha da sua conta do Flow. Depois, é só entrar com ela.">
      <ResetPasswordForm />
    </AuthFrame>
  );
}

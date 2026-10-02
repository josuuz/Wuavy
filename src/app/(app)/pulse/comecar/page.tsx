import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AuthFrame } from "@/components/flow/auth/AuthFrame";
import { ClinicForm } from "@/components/flow/auth/ClinicForm";
import { getSession } from "@/lib/flow/session";

export const metadata: Metadata = {
  title: { absolute: "Criar clínica · Wuavy Pulse" },
  robots: { index: false },
};

export default async function CreateClinicPage() {
  const session = await getSession();
  if (!session) redirect("/pulse/entrar");
  if (session.member) redirect("/pulse/app");

  return (
    <AuthFrame title="Sua clínica" lead="Um passo: o nome da clínica e o seu. Você entra como responsável e pode começar a cadastrar.">
      <ClinicForm />
    </AuthFrame>
  );
}

import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AuthFrame } from "@/components/flow/auth/AuthFrame";
import { SignInForm } from "@/components/flow/auth/SignInForm";
import { getSession } from "@/lib/flow/session";

export const metadata: Metadata = {
  title: { absolute: "Entrar · Wuavy Flow" },
  robots: { index: false },
};

export default async function SignInPage(props: PageProps<"/flow/entrar">) {
  const session = await getSession();
  if (session) redirect(session.member ? "/flow/app" : "/flow/comecar");
  const { erro, modo, senha } = await props.searchParams;

  return (
    <AuthFrame title="Entrar no Flow" lead="Os dados da sua clínica, com o acesso restrito a quem trabalha nela.">
      <SignInForm
        linkFailed={erro === "link"}
        initialMode={modo === "recuperar" ? "recuperar" : "entrar"}
        notice={senha === "redefinida" ? "Senha redefinida. Entre com a nova senha." : undefined}
      />
    </AuthFrame>
  );
}

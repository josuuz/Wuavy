import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AuthFrame } from "@/components/flow/auth/AuthFrame";
import { SignInForm } from "@/components/flow/auth/SignInForm";
import { CHECKOUT } from "@/components/flow/demo/copy";
import { getSession } from "@/lib/flow/session";

export const metadata: Metadata = {
  title: { absolute: "Entrar · Wuavy Pulse" },
  robots: { index: false },
};

export default async function SignInPage(props: PageProps<"/pulse/entrar">) {
  const { erro, modo, senha, depois } = await props.searchParams;
  // Where to go after: only the checkout, by name, so the link can't send anyone elsewhere.
  const then = depois === "assinar" ? CHECKOUT : undefined;
  const session = await getSession();
  if (session) redirect(then ?? (session.member ? "/pulse/app" : "/pulse/comecar"));

  return (
    <AuthFrame
      title={then ? "Sua conta no Pulse" : "Entrar no Pulse"}
      lead={
        then
          ? "Crie a conta (ou entre) para assinar. É nela que ficam os dados da sua clínica, com acesso só de quem trabalha nela."
          : "Os dados da sua clínica, com o acesso restrito a quem trabalha nela."
      }
    >
      <SignInForm
        linkFailed={erro === "link"}
        initialMode={modo === "recuperar" ? "recuperar" : modo === "criar" ? "criar" : "entrar"}
        notice={senha === "redefinida" ? "Senha redefinida. Entre com a nova senha." : undefined}
        then={then}
      />
    </AuthFrame>
  );
}

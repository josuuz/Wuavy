import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AuthFrame } from "@/components/flow/auth/AuthFrame";
import { SignInForm, type SignInIntent } from "@/components/flow/auth/SignInForm";
import { BASE, CHECKOUT } from "@/components/flow/demo/copy";
import { getSession, homePath } from "@/lib/flow/session";

export const metadata: Metadata = {
  title: { absolute: "Entrar · Wuavy Pulse" },
  robots: { index: false },
};

const INTENTS: Record<SignInIntent, { then: string; title: string; lead: string }> = {
  demo: {
    then: BASE,
    title: "Conheça o Wuavy Pulse",
    lead: "Crie sua conta gratuitamente para explorar a demonstração.",
  },
  assinar: {
    then: CHECKOUT,
    title: "Sua conta no Pulse",
    lead: "Crie a conta (ou entre) para assinar. É nela que ficam os dados da sua clínica, com acesso só de quem trabalha nela.",
  },
};

export default async function SignInPage(props: PageProps<"/pulse/entrar">) {
  const { erro, modo, senha, depois } = await props.searchParams;
  // Where to go after: only the demo or the checkout, by name, so the link can't send anyone elsewhere.
  const intent: SignInIntent | undefined = depois === "demo" || depois === "assinar" ? depois : undefined;
  const context = intent ? INTENTS[intent] : undefined;
  const session = await getSession();
  if (session) redirect(context?.then ?? (await homePath()));

  const mode = modo === "recuperar" ? "recuperar" : modo === "criar" ? "criar" : modo === "entrar" ? "entrar" : intent === "demo" ? "criar" : "entrar";
  return (
    <AuthFrame
      title={context?.title ?? "Entrar no Pulse"}
      lead={context?.lead ?? "Os dados da sua clínica, com o acesso restrito a quem trabalha nela."}
    >
      <SignInForm
        linkFailed={erro === "link"}
        initialMode={mode}
        notice={senha === "redefinida" ? "Senha redefinida. Entre com a nova senha." : undefined}
        intent={intent}
        then={context?.then}
      />
    </AuthFrame>
  );
}

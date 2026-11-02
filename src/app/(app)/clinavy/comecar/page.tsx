import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AuthFrame } from "@/components/flow/auth/AuthFrame";
import { AwaitingPayment } from "@/components/flow/auth/AwaitingPayment";
import { ClinicForm } from "@/components/flow/auth/ClinicForm";
import { releases } from "@/lib/flow/access";
import { paymentEvidence } from "@/lib/flow/billing";
import { getSession, getStanding, SubscriptionReadError } from "@/lib/flow/session";

export const metadata: Metadata = {
  title: { absolute: "Configurar o Clinavy · Clinavy" },
  robots: { index: false },
};

/* Onboarding: only after the subscription is confirmed by the server, and only once. */
export default async function CreateClinicPage() {
  const session = await getSession();
  if (!session) redirect("/clinavy/entrar");
  if (session.member) redirect("/clinavy/app");
  let subscription: Awaited<ReturnType<typeof getStanding>>;
  try {
    subscription = await getStanding();
  } catch (error) {
    // Leitura que falha: sem prova, sem onboarding. A tela de assinatura explica.
    if (!(error instanceof SubscriptionReadError)) throw error;
    redirect("/clinavy/assinar");
  }
  if (!subscription || !releases(subscription.status) || subscription.organization_id) redirect("/clinavy/assinar");

  // O status sozinho não prova pagamento (createClinic exige a cobrança aprovada): sem a
  // prova, a tela de espera ocupa o lugar do formulário — sem a pessoa preencher a clínica
  // inteira só para ser recusada no envio. Não redireciona: a tela de assinatura manda
  // para cá, e um redirecionamento de volta faria um laço.
  const evidence = await paymentEvidence(subscription);
  if (evidence !== "confirmed") {
    return (
      <AuthFrame>
        <AwaitingPayment unavailable={evidence === "unavailable"} />
      </AuthFrame>
    );
  }

  return (
    <AuthFrame>
      <ClinicForm name={(session.user.user_metadata?.name as string | undefined) ?? ""} />
    </AuthFrame>
  );
}

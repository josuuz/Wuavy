import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AuthFrame } from "@/components/flow/auth/AuthFrame";
import { Checkout } from "@/components/flow/auth/Checkout";
import { releases } from "@/lib/flow/access";
import { billingReady, payerEmail, testMode } from "@/lib/flow/billing";
import { getSession, getStanding, getSubscription, markJourney, SubscriptionReadError } from "@/lib/flow/session";
import { check } from "./actions";

export const metadata: Metadata = {
  title: { absolute: "Assinar · Clinavy" },
  robots: { index: false },
};

/*
  The checkout. A visitor without an account creates one first (or signs in)
  and comes back here. A clinic that pays has nothing to do here. Where the
  person stands comes from the server: a payment already confirmed shows the
  confirmation, one still pending shows that it is being confirmed. Without
  Mercado Pago configured, it says the online subscription is coming and
  how to contract meanwhile (activated by hand, migration 0004).

  A row that already has a provider_subscription_id and is still "pending" is
  never taken at its stored word here: the person may be returning from
  Mercado Pago's hosted page this very moment, and the webhook may not have
  landed yet. check() (pulse/assinar/actions.ts) asks Mercado Pago again —
  the same syncSubscription the webhook itself uses — before the page decides
  what to show. Query parameters Mercado Pago may attach to the back_url are
  never read for this: only a confirmed read counts.
*/
export default async function SubscribePage() {
  const session = await getSession();
  if (!session) redirect("/clinavy/entrar?modo=criar&depois=assinar");
  // `paid` é sobre a clínica inteira (getStanding): uma tentativa pendente ao
  // lado de uma assinatura ativa não pode fazer esta tela pedir pagamento de
  // novo. `subscription` segue sendo a tentativa, que é o que esta tela acompanha.
  // A leitura das assinaturas pode FALHAR (uma queda, uma coluna que ainda não
  // existe). Isso não é "sem assinatura": cair no formulário abriria um segundo
  // pagamento para quem talvez já pague. Vai para o desfecho "ainda não
  // confirmamos", que manda esperar e não tentar de novo.
  let standing: Awaited<ReturnType<typeof getStanding>> = null;
  let subscription: Awaited<ReturnType<typeof getSubscription>> = null;
  let unreadable = false;
  try {
    standing = await getStanding();
    subscription = await getSubscription();
  } catch (error) {
    if (!(error instanceof SubscriptionReadError)) throw error;
    unreadable = true;
  }
  const paid = releases(standing?.status);
  if (paid && session.member) redirect("/clinavy/app");

  const pendingWithId = subscription?.status === "pending" && Boolean(subscription.provider_subscription_id);
  const stage = unreadable ? "unresolved" : paid ? "active" : pendingWithId ? await check() : "form";
  if (stage === "form") await markJourney("checkout");
  return (
    <AuthFrame>
      <Checkout
        stage={stage}
        email={payerEmail(session.user.email ?? "")}
        hasClinic={Boolean(session.member)}
        canDeclarePayer={!session.member || session.member.role === "owner"}
        ready={billingReady()}
        test={testMode()}
        // Quem o Mercado Pago vai pedir nesta tentativa. Só a tentativa VIVA (pendente)
        // tem pagador a mostrar: uma linha cancelada ou recusada já não é o que o próximo
        // "Assinar" envia — esse envia o e-mail da conta. Mostrar o pagador de uma linha
        // encerrada mandaria a pessoa entrar no Mercado Pago com uma conta que não é a
        // da assinatura nova, que é o erro original. Lido sob a row-level security.
        payer={payerEmail((subscription?.status === "pending" ? subscription.payer_email : null) ?? session.user.email ?? "")}
      />
    </AuthFrame>
  );
}

import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AuthFrame } from "@/components/flow/auth/AuthFrame";
import { Checkout } from "@/components/flow/auth/Checkout";
import { releases } from "@/lib/flow/access";
import { billingReady, payerEmail, testMode } from "@/lib/flow/billing";
import { getSession, getSubscription, markJourney } from "@/lib/flow/session";
import { check } from "./actions";

export const metadata: Metadata = {
  title: { absolute: "Assinar · Wuavy Pulse" },
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
  if (!session) redirect("/pulse/entrar?modo=criar&depois=assinar");
  const subscription = await getSubscription();
  const paid = releases(subscription?.status);
  if (paid && session.member) redirect("/pulse/app");

  const pendingWithId = subscription?.status === "pending" && Boolean(subscription.provider_subscription_id);
  const stage = paid ? "active" : pendingWithId ? await check() : "form";
  if (stage === "form") await markJourney("checkout");
  return (
    <AuthFrame>
      <Checkout
        stage={stage}
        email={payerEmail(session.user.email ?? "")}
        hasClinic={Boolean(session.member)}
        ready={billingReady()}
        test={testMode()}
      />
    </AuthFrame>
  );
}

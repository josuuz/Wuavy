import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AuthFrame } from "@/components/flow/auth/AuthFrame";
import { Checkout } from "@/components/flow/auth/Checkout";
import { releases } from "@/lib/flow/access";
import { billingReady, testMode } from "@/lib/flow/billing";
import { getSession, getSubscription, markJourney } from "@/lib/flow/session";

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
*/
export default async function SubscribePage() {
  const session = await getSession();
  if (!session) redirect("/pulse/entrar?modo=criar&depois=assinar");
  const subscription = await getSubscription();
  const paid = releases(subscription?.status);
  if (paid && session.member) redirect("/pulse/app");

  const stage = paid ? "active" : subscription?.status === "pending" && subscription.provider_subscription_id ? "pending" : "form";
  if (stage === "form") await markJourney("checkout");
  return (
    <AuthFrame>
      <Checkout
        stage={stage}
        email={session.user.email ?? ""}
        hasClinic={Boolean(session.member)}
        // Both keys or neither: without the server's, the card form would only lead to "unavailable".
        publicKey={billingReady() ? (process.env.NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY ?? "") : ""}
        test={testMode()}
      />
    </AuthFrame>
  );
}

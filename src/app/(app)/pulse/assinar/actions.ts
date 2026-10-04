"use server";

import { redirect } from "next/navigation";

import { releases, type SubscriptionStatus } from "@/lib/flow/access";
import { billingReady, createSubscription, describeError, MercadoPagoError, syncSubscription, testMode } from "@/lib/flow/billing";
import { getSession, getSubscription } from "@/lib/flow/session";
import { absoluteUrl } from "@/lib/seo";
import { createAdminClient } from "@/lib/supabase/admin";

/*
  The checkout's two calls. Subscribing takes only the card token the
  Mercado Pago Brick made in the browser (never the card) and the payer's
  e-mail; who is paying comes from the verified session. The answer is what
  Mercado Pago said, read on the server. Checking reads it again. Neither
  ever tells the browser more than the four outcomes below.
*/

export type CheckoutOutcome = "active" | "pending" | "rejected" | "unavailable";

/** The outcome, and in test mode only, why Mercado Pago refused. */
export interface Subscribed {
  outcome: CheckoutOutcome;
  detail?: string;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CARD_TOKEN = /^[\w-]{8,128}$/;

const outcome = (status: SubscriptionStatus | null): CheckoutOutcome =>
  releases(status) ? "active" : status === "cancelled" ? "rejected" : "pending";

export async function subscribe(input: { token: string; email: string }): Promise<Subscribed> {
  const session = await getSession();
  if (!session) redirect("/pulse/entrar?depois=assinar");

  const current = await getSubscription();
  // Already paying, or already waiting on one: never a second subscription.
  if (current && releases(current.status)) return { outcome: "active" };
  if (current?.status === "pending" && current.provider_subscription_id) return { outcome: await check() };

  if (!billingReady()) return { outcome: "unavailable" };
  if (typeof input?.token !== "string" || !CARD_TOKEN.test(input.token)) return { outcome: "rejected" };
  const email = typeof input.email === "string" && EMAIL.test(input.email.trim()) ? input.email.trim() : session.user.email;
  if (!email) return { outcome: "rejected" };

  let admin;
  try {
    admin = createAdminClient();
  } catch (error) {
    console.error("subscribe:", error);
    return { outcome: "unavailable" };
  }

  // Our row first: its id goes to Mercado Pago as the reference, so every notice finds it.
  // A pending row that never reached Mercado Pago (a timeout) is reused with the same key.
  let rowId = current?.status === "pending" && !current.provider_subscription_id ? current.id : null;
  if (!rowId) {
    const { data, error } = await admin
      .from("subscriptions")
      .insert({ user_id: session.user.id, organization_id: session.member?.organization_id ?? null, status: "pending" })
      .select("id")
      .single();
    if (error) {
      console.error("subscribe: row", error);
      return { outcome: "unavailable" };
    }
    rowId = data.id;
  }

  try {
    const created = await createSubscription({
      reference: rowId,
      email,
      cardToken: input.token,
      backUrl: absoluteUrl("/pulse/assinar"),
    });
    await admin.from("subscriptions").update({ provider_subscription_id: created.id }).eq("id", rowId);
    return { outcome: outcome(await syncSubscription(created.id)) };
  } catch (error) {
    if (error instanceof MercadoPagoError && error.status < 500) {
      // Refused (card, data): the attempt never became a subscription. A new one gets a new row and key.
      console.warn("subscribe: refused by Mercado Pago", error.status, JSON.stringify(error.body));
      await admin.from("subscriptions").delete().eq("id", rowId).is("provider_subscription_id", null);
      return { outcome: "rejected", detail: testMode() ? describeError(error) : undefined };
    }
    // Unknown outcome (an outage, a timeout): the row stays; retrying reuses its key, so no second charge.
    console.error("subscribe: Mercado Pago unreachable", error);
    return { outcome: "pending" };
  }
}

/** Where the signed-in person's subscription stands, read again from Mercado Pago while it is pending. */
export async function check(): Promise<CheckoutOutcome> {
  const session = await getSession();
  if (!session) redirect("/pulse/entrar?depois=assinar");
  const current = await getSubscription();
  if (!current) return "rejected";
  if (current.status !== "pending" || !current.provider_subscription_id) return outcome(current.status);
  try {
    return outcome(await syncSubscription(current.provider_subscription_id));
  } catch (error) {
    console.error("check: Mercado Pago", error);
    return "pending";
  }
}

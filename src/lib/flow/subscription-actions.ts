"use server";

import { refresh } from "next/cache";

import { createAdminClient } from "@/lib/supabase/admin";
import { paidThrough, PRICE, type SubscriptionStatus } from "./access";
import { billingReady, cancelSubscription, changeCard, describeError, MercadoPagoError, payerEmail, testMode } from "./billing";
import { getSession, getSubscription } from "./session";

/*
  Managing the subscription from inside the Pulse: cancelling it, and pointing
  it at another card. Four rules shape every action here.

  - Which subscription is never asked of the browser. It comes from the
    verified session's clinic, so a request cannot name someone else's.
  - Only the clinic's owner. Reception and professionals do not see the
    section and are refused here too, whatever the screen showed.
  - The card never reaches us. The browser tokenizes it with Mercado Pago's
    own Brick (the same one the checkout uses) and only the token comes here.
  - No outcome is reported from what Mercado Pago answered. The status is read
    back from Mercado Pago (syncSubscription, the one path the checkout and the
    webhook also use), and only that decides what the person is told: a 200
    that changed nothing cannot become a false success.

  Neither action sends the amount. The five founding clinics keep R$ 297
  because it is stored inside their subscription at Mercado Pago, and nothing
  here writes it (lib/flow/billing.ts).
*/

/**
 * What the person is told. Three states, not two, because "it failed" and "we
 * do not know yet" are different things to say: `done` only ever comes from a
 * status read back from Mercado Pago, and `unconfirmed` means the change was
 * accepted there while the state could not be read back — the one case where
 * the screen must not invite another attempt.
 */
export type SubscriptionResult =
  | { state: "done"; status: SubscriptionStatus; paidUntil: string | null }
  | { state: "unconfirmed" }
  | { state: "failed"; error: string };

/** A refusal, in the shape the screen reads. */
const failed = (error: string): SubscriptionResult => ({ state: "failed", error });

/** What the card form needs to be built, asked for only when the owner opens it. */
export interface CardForm {
  ready: boolean;
  publicKey: string;
  email: string;
  /** Test credentials in use: the screen says so, and says why a card was refused. */
  test: boolean;
  /** In reais, for the Brick to show. Never sent back as the subscription's amount. */
  amount: number;
}

const REFUSED = "Não foi possível falar com o Mercado Pago agora. Tente de novo em alguns minutos.";
const NOT_OWNER = "Só o responsável pela clínica pode gerenciar a assinatura.";
const NO_SUBSCRIPTION = "Não encontramos uma assinatura nesta clínica.";
const BILLING_OFF = "A gestão online da assinatura está indisponível agora. Fale com a Wuavy.";
const CARD_TOKEN = /^[\w-]{8,128}$/;

/** The word the second step of the screen sends. A call without it cancels nothing. */
const CONFIRM = "CANCELAR";

/**
 * The owner of the signed-in clinic, and their subscription. Everything below
 * starts here: no id, no role and no status comes from the browser.
 */
type Owning =
  | { ok: false; error: string }
  | { ok: true; session: NonNullable<Awaited<ReturnType<typeof getSession>>>; subscription: NonNullable<Awaited<ReturnType<typeof getSubscription>>> };

async function owning(): Promise<Owning> {
  const session = await getSession();
  if (!session?.member) return { ok: false, error: "Sua sessão expirou ou seu acesso mudou. Entre de novo." };
  if (session.member.role !== "owner") return { ok: false, error: NOT_OWNER };
  const subscription = await getSubscription();
  if (!subscription) return { ok: false, error: NO_SUBSCRIPTION };
  return { ok: true, session, subscription };
}

/** What Mercado Pago refused, and only while testing: a customer never sees its wording. */
const explain = (error: unknown) =>
  error instanceof MercadoPagoError && testMode() ? `${REFUSED} (${describeError(error)})` : REFUSED;

export async function cardForm(): Promise<CardForm> {
  const held = await owning();
  const ready = held.ok && billingReady() && Boolean(held.subscription.provider_subscription_id);
  return {
    ready,
    publicKey: ready ? (process.env.NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY ?? "") : "",
    email: ready && held.ok ? payerEmail(held.session.user.email ?? "") : "",
    test: ready && testMode(),
    amount: PRICE / 100,
  };
}

/**
 * Cancels the clinic's subscription. `confirm` has to arrive as CONFIRM: the
 * screen asks in two steps, and a call that did not come from that second step
 * cancels nothing.
 *
 * Repeating it is safe. One already cancelled answers the same thing without
 * touching Mercado Pago, and so does one that never got there (a row left
 * pending by a timeout), which is closed here instead.
 */
export async function cancelPlan(input: { confirm: string }): Promise<SubscriptionResult> {
  if (input?.confirm !== CONFIRM) return failed("Confirme o cancelamento para continuar.");
  const held = await owning();
  if (!held.ok) return failed(held.error);
  const { subscription } = held;

  // Already cancelled: nothing to ask Mercado Pago, and the answer is the same.
  if (subscription.status === "cancelled") {
    return { state: "done", status: "cancelled", paidUntil: paidThrough(subscription) };
  }

  // A row that never became a subscription at Mercado Pago: there is nothing
  // there to cancel, and leaving it pending would keep the checkout waiting.
  if (!subscription.provider_subscription_id) {
    const { error } = await createAdminClient()
      .from("subscriptions")
      .update({ status: "cancelled", updated_at: new Date().toISOString() })
      .eq("id", subscription.id)
      .is("provider_subscription_id", null);
    if (error) {
      console.error("cancelPlan: row", error);
      return failed(REFUSED);
    }
    refresh();
    return { state: "done", status: "cancelled", paidUntil: null };
  }

  if (!billingReady()) return failed(BILLING_OFF);
  try {
    const status = await cancelSubscription(subscription.provider_subscription_id);
    // Mercado Pago answered, but only the status read back counts. Anything
    // other than cancelled is not a cancellation, and is not reported as one.
    // Repeating a cancellation is harmless (a cancelled subscription cancels
    // again to the same end), so this one may still ask for another attempt.
    if (status !== "cancelled") {
      console.error("cancelPlan: Mercado Pago did not cancel", status);
      return failed("O Mercado Pago não confirmou o cancelamento. Veja o estado da assinatura e, se ela seguir ativa, tente de novo.");
    }
    refresh();
    return { state: "done", status, paidUntil: paidThrough({ status, current_period_end: subscription.current_period_end }) };
  } catch (error) {
    console.error("cancelPlan: Mercado Pago", error instanceof MercadoPagoError ? error.status : error);
    return failed(explain(error));
  }
}

/**
 * Points the subscription at another card. The token is the only thing that
 * arrives; the number never leaves Mercado Pago's own form.
 *
 * What can be confirmed is confirmed: the status is read back, and one that
 * comes back cancelled is reported as that instead of as a changed card.
 * Whether the stored card is now the new one is not something Mercado Pago's
 * answer states, so the screen says the card was sent and shows the
 * subscription's status — never a promise about the next charge.
 */
export async function replaceCard(input: { token: string }): Promise<SubscriptionResult> {
  if (typeof input?.token !== "string" || !CARD_TOKEN.test(input.token)) {
    return failed("Não foi possível ler o cartão. Confira os dados e tente de novo.");
  }
  const held = await owning();
  if (!held.ok) return failed(held.error);
  const { subscription } = held;

  if (!subscription.provider_subscription_id) {
    return failed("Esta assinatura ainda não está no Mercado Pago. Assine para começar.");
  }
  if (subscription.status === "cancelled") {
    return failed("Esta assinatura está cancelada. Assine de novo para voltar a usar o Pulse.");
  }
  if (!billingReady()) return failed(BILLING_OFF);

  try {
    const change = await changeCard(subscription.provider_subscription_id, input.token);
    switch (change.outcome) {
      case "refused":
        // Refused before Mercado Pago (a token or an id that is not one): nothing was sent.
        console.error("replaceCard: refused before Mercado Pago");
        return failed(REFUSED);
      case "cancelled":
        refresh();
        return failed("O Mercado Pago informou que esta assinatura está cancelada. Assine de novo para voltar.");
      case "unconfirmed":
        /*
          The new card is already at Mercado Pago; only the read back after it
          went unanswered. Saying "it failed, try again" here would be both
          untrue and harmful — the next attempt would send a second card over a
          change that may already hold. The screen says what is known and stops.
        */
        console.warn("replaceCard: accepted by Mercado Pago, state not read back");
        return { state: "unconfirmed" };
      case "changed":
        refresh();
        return { state: "done", status: change.status, paidUntil: null };
    }
  } catch (error) {
    // Raised before the card was sent: changeCard never throws after the PUT.
    console.error("replaceCard: Mercado Pago", error instanceof MercadoPagoError ? error.status : error);
    return failed(explain(error));
  }
}

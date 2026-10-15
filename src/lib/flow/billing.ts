import "server-only";

import { CANONICAL_URL, site } from "@/data/site";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkoutDecision, decide, payerEmailFor, REFUSAL } from "@/lib/mercadopago/environment";
import {
  cancelBodies,
  confirmedStatus,
  httpsUrl,
  latestCharge,
  PROVIDER_ID,
  retryOtherSpelling,
  runCardChange,
  statusFrom,
  verifyNotice,
  type CardChange,
  type Charge,
  type Preapproval,
} from "@/lib/mercadopago/notice";
import { PRICE, type Standing, type SubscriptionStatus } from "./access";

/*
  Mercado Pago, from the server only. The Access Token lives in an env var
  without the NEXT_PUBLIC_ prefix and this module is server-only, so it never
  reaches a browser. The card itself never reaches the Pulse either: the
  browser tokenizes it with Mercado Pago's own Card Payment Brick and sends
  only the token, which the subscription below consumes.

  The model: a monthly subscription "with authorized payment" (/preapproval
  with a card token, status "authorized"). Mercado Pago validates the card at
  once and then charges R$ 297 every month on its own; that is why the card is
  the only method offered: Pix and boleto do not charge by themselves each
  month.

  What a subscription's status is comes from one place: syncSubscription,
  which asks Mercado Pago for the subscription and its latest charge and
  writes the answer. The checkout calls it right after creating the
  subscription, and the webhook calls it on every notice. Never from anything
  the browser says, and running it twice writes the same thing.
*/

const API = "https://api.mercadopago.com";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// PROVIDER_ID and CARD_TOKEN come from mercadopago-notice.ts, where the card
// change that checks them is tested.

/** The server has no Mercado Pago credentials: nothing can be charged. */
export class BillingUnavailable extends Error {}

/** Mercado Pago answered with an error (a refused card, an invalid token, an outage). */
export class MercadoPagoError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
  ) {
    super(`Mercado Pago answered ${status}`);
  }
}

/*
  Whether, and against which Mercado Pago account, anything may be charged is
  decided in one place shared with the maintenance billing:
  mercadopago-environment.ts. The key's format proves nothing (a test
  account's token also starts with APP_USR-), so the environment is declared (MERCADOPAGO_ENV=test)
  and checked against where the code runs (VERCEL_ENV), and in doubt it closes:
  test credentials in the production deploy, live ones anywhere else, a test
  setup without its test buyer, or no credentials at all.
*/

/**
 * Checkout may go ahead here, with these credentials. Besides the environment
 * check it refuses a test public key (TEST-) under a live declaration: the card
 * form would be built for one account and the subscription made on another.
 * The server's own calls (`mp`) do not use the public key and ask `decide` alone.
 */
export const billingReady = () => checkoutDecision(process.env).allowed;

/**
 * Test mode: Mercado Pago only accepts a test seller's subscription with a
 * test buyer's e-mail as payer. In test mode MERCADOPAGO_TEST_PAYER_EMAIL
 * stands in for the signed-in person's e-mail at Mercado Pago only (the
 * account keeps the real one); in production it is ignored, even if left set.
 * The checkout says "ambiente de teste" exactly when this is on.
 */
export const testMode = () => {
  const decision = checkoutDecision(process.env);
  return decision.allowed && decision.mode === "test";
};

/** The e-mail the card form is created with: in test mode the test buyer's, so the card token and the subscription name the same payer. */
export const payerEmail = (email: string) => payerEmailFor(process.env, email);

/** What Mercado Pago said was wrong, in a line (shown only in test mode). */
export function describeError(error: MercadoPagoError): string {
  const body = error.body as { message?: string; cause?: { description?: string }[] } | null;
  const cause = body?.cause?.map((c) => c.description).filter(Boolean).join("; ");
  return `Mercado Pago (${error.status}): ${[body?.message, cause].filter(Boolean).join(" — ") || "recusou a assinatura"}`;
}

async function mp<T>(path: string, init: { method?: "GET" | "POST" | "PUT"; body?: unknown; idempotencyKey?: string } = {}): Promise<T> {
  // Every call passes here, reads included: a token that does not match where
  // the code runs does not talk to Mercado Pago, full stop.
  const decision = decide(process.env);
  if (!decision.allowed) throw new BillingUnavailable(REFUSAL[decision.reason]);
  const token = process.env.MERCADOPAGO_ACCESS_TOKEN as string;
  const response = await fetch(`${API}${path}`, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.idempotencyKey ? { "X-Idempotency-Key": init.idempotencyKey } : {}),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    cache: "no-store",
  });
  const json: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new MercadoPagoError(response.status, json);
  return json as T;
}

// The subscription and the charge as Mercado Pago reports them, the status
// they mean and a notice's signature: lib/flow/mercadopago-notice.ts, pure and
// tested. Re-exported from here, where they have always been asked for.
export { statusFrom, type Charge, type Preapproval } from "@/lib/mercadopago/notice";
export { CANCEL_STATES } from "@/lib/mercadopago/notice";

/** Where Mercado Pago sends the person back, always over https (the rule, and why, in mercadopago-notice.ts). */
export const returnUrl = (path: string) => httpsUrl(path, site.url, CANONICAL_URL);

/**
 * Creates the monthly subscription for one of our rows (its id is the
 * reference and the idempotency key: a retry after a timeout gets the same
 * subscription back instead of a second one).
 */
export async function createSubscription(input: { reference: string; email: string; cardToken: string; backPath: string }) {
  return mp<Preapproval>("/preapproval", {
    method: "POST",
    idempotencyKey: input.reference,
    body: {
      reason: "Wuavy Pulse",
      external_reference: input.reference,
      payer_email: payerEmail(input.email),
      card_token_id: input.cardToken,
      // The amount is stored inside the subscription: Mercado Pago charges this
      // one every month until someone changes it there. Raising PRICE therefore
      // prices new subscriptions only — which is what keeps the five founding
      // clinics at theirs (lib/flow/access.ts).
      auto_recurring: { frequency: 1, frequency_type: "months", transaction_amount: PRICE / 100, currency_id: "BRL" },
      back_url: returnUrl(input.backPath),
      status: "authorized",
    },
  });
}

/*
  Changing a subscription that already exists: PUT /preapproval/{id}, which is
  what the API reference documents for it. Two rules hold for both operations
  below, and they are the reason neither takes a shortcut:

  - The amount is never sent. The five founding clinics keep R$ 297 because
    Mercado Pago charges what is stored inside their subscription; a PUT that
    carried auto_recurring could overwrite it. Only the fields being changed go.
  - Neither returns a status of its own. What Mercado Pago answered is a claim;
    the state comes from reading the subscription back (syncSubscription), the
    same single path the checkout and the webhook use. So a 200 with a body
    that did not actually change anything cannot become a false success.
*/

/**
 * Cancels the subscription at Mercado Pago, then writes what Mercado Pago
 * then says. Returns the status read back, which the caller must check: only
 * "cancelled" is a cancellation.
 *
 * The status value is sent in both spellings, in order, because the reference
 * does not fix the enum (mercadopago-notice.ts). A validation refusal of the
 * first (400) tries the second; any other refusal is raised as it came.
 */
export async function cancelSubscription(providerId: string): Promise<SubscriptionStatus | null> {
  if (!PROVIDER_ID.test(providerId)) return null;
  let refusal: MercadoPagoError | undefined;
  for (const body of cancelBodies()) {
    try {
      await mp<Preapproval>(`/preapproval/${providerId}`, { method: "PUT", body });
      refusal = undefined;
      break;
    } catch (error) {
      if (!(error instanceof MercadoPagoError) || !retryOtherSpelling(error.status)) throw error;
      refusal = error;
    }
  }
  if (refusal) throw refusal;
  // The same read-back as a card change: the PUT above already went through,
  // so only the reading is repeated (mercadopago-notice.ts).
  return confirmedStatus(
    () => syncSubscription(providerId),
    () => new Promise((resolve) => setTimeout(resolve, CONFIRM_WAIT_MS)),
  );
}

/** How long to wait before asking a second time, when the read-back did not answer. */
const CONFIRM_WAIT_MS = 1200;

/**
 * Points the subscription at a new card. The card itself never reaches us:
 * the browser tokenizes it with Mercado Pago's own Brick and only the token
 * comes here, the same way the checkout works.
 *
 * A subscription Mercado Pago paused after failed charges is also set back to
 * authorized, or the new card would sit there uncharged. A cancelled one is
 * not revived: Mercado Pago does not allow it, and subscribing again is the
 * way back (the checkout already handles that).
 *
 * The order of the steps, and the rule that nothing after the PUT is a
 * failure, live in runCardChange (mercadopago-notice.ts), where a test can
 * hold each step still. This only wires the real calls to it.
 */
export const changeCard = (providerId: string, cardToken: string): Promise<CardChange> =>
  runCardChange(providerId, cardToken, {
    read: () => mp<Preapproval>(`/preapproval/${providerId}`),
    send: async (body) => {
      await mp<Preapproval>(`/preapproval/${providerId}`, { method: "PUT", body });
    },
    confirm: () =>
      confirmedStatus(
        () => syncSubscription(providerId),
        () => new Promise((resolve) => setTimeout(resolve, CONFIRM_WAIT_MS)),
      ),
  });

/**
 * Asks Mercado Pago for a subscription and its latest charge and writes the
 * result on our row. Returns the status, or null when the subscription is
 * not one of ours.
 */
export const syncSubscription = async (providerId: string): Promise<SubscriptionStatus | null> =>
  (await syncStanding(providerId))?.status ?? null;

/**
 * The same sync, answering with the period it just wrote as well: what access
 * needs to honour a cancelled subscription's paid month without reading the
 * row again (lib/flow/session.ts reads it through a memoized cache, which
 * would still hold the value from before this write).
 */
export async function syncStanding(providerId: string): Promise<Standing | null> {
  if (!PROVIDER_ID.test(providerId)) return null;
  const subscription = await mp<Preapproval>(`/preapproval/${providerId}`);
  // The id goes into a URL and into the filter string below: whatever answered,
  // if it is not an id, it is not asked about and nothing is written.
  if (!PROVIDER_ID.test(String(subscription.id ?? ""))) return null;
  const charges = await mp<{ results?: Charge[] }>(
    `/authorized_payments/search?preapproval_id=${encodeURIComponent(subscription.id)}`,
  ).catch((): { results?: Charge[] } => ({ results: [] }));
  const status = statusFrom(subscription, latestCharge(charges.results));

  const admin = createAdminClient();
  // Our row: the one already holding this subscription, or the one it was created for (its reference).
  const reference = subscription.external_reference && UUID.test(subscription.external_reference) ? subscription.external_reference : null;
  const { data: rows } = await admin
    .from("subscriptions")
    .select("id, started_at, provider_subscription_id")
    .or(`provider_subscription_id.eq.${subscription.id}${reference ? `,id.eq.${reference}` : ""}`);
  const row = rows?.find((r) => r.provider_subscription_id === subscription.id) ?? rows?.find((r) => !r.provider_subscription_id);
  if (!row) return null;

  const now = new Date().toISOString();
  const { error } = await admin
    .from("subscriptions")
    .update({
      provider_subscription_id: subscription.id,
      status,
      current_period_end: subscription.next_payment_date ?? null,
      // Set once, the first time it is active: a repeated notice does not move it.
      started_at: row.started_at ?? (status === "active" ? now : null),
      updated_at: now,
    })
    .eq("id", row.id);
  if (error) throw error;
  return { status, current_period_end: subscription.next_payment_date ?? null };
}

/** A monthly charge's notice: the subscription it belongs to is synced. */
export async function syncCharge(chargeId: string) {
  if (!PROVIDER_ID.test(chargeId)) return null;
  const charge = await mp<Charge>(`/authorized_payments/${chargeId}`);
  return charge.preapproval_id ? syncSubscription(String(charge.preapproval_id)) : null;
}

/**
 * A webhook's x-signature, against the secret from the Mercado Pago panel.
 * The rule itself is in mercadopago-notice.ts, where it is tested; this reads
 * the secret from the environment, which a test cannot.
 */
export const verifySignature = (signature: string | null, requestId: string | null, dataId: string | null) =>
  verifyNotice(process.env.MERCADOPAGO_WEBHOOK_SECRET, signature, requestId, dataId);

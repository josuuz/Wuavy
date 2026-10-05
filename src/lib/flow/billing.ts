import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import { createAdminClient } from "@/lib/supabase/admin";
import { PRICE, type SubscriptionStatus } from "./access";

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
const PROVIDER_ID = /^[\w-]{1,64}$/;

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

export const billingReady = () => Boolean(process.env.MERCADOPAGO_ACCESS_TOKEN);

/*
  Test mode: Mercado Pago only accepts a test seller's subscription with a test
  buyer's e-mail as payer. MERCADOPAGO_TEST_PAYER_EMAIL stands in for the
  signed-in person's e-mail at Mercado Pago only (the account keeps the real
  one). Leave it unset in production: the checkout says "ambiente de teste"
  whenever it is set or the public key starts with TEST-.
*/
const testPayer = () => process.env.MERCADOPAGO_TEST_PAYER_EMAIL?.trim() || null;

/** The e-mail the card form is created with: in test mode the test buyer's, so the card token and the subscription name the same payer. */
export const payerEmail = (email: string) => testPayer() ?? email;

export const testMode = () => Boolean(testPayer()) || Boolean(process.env.NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY?.startsWith("TEST-"));

/** What Mercado Pago said was wrong, in a line (shown only in test mode). */
export function describeError(error: MercadoPagoError): string {
  const body = error.body as { message?: string; cause?: { description?: string }[] } | null;
  const cause = body?.cause?.map((c) => c.description).filter(Boolean).join("; ");
  return `Mercado Pago (${error.status}): ${[body?.message, cause].filter(Boolean).join(" — ") || "recusou a assinatura"}`;
}

async function mp<T>(path: string, init: { method?: "GET" | "POST"; body?: unknown; idempotencyKey?: string } = {}): Promise<T> {
  const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!token) throw new BillingUnavailable("MERCADOPAGO_ACCESS_TOKEN is not set");
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

/** A subscription, as Mercado Pago reports it. */
interface Preapproval {
  id: string;
  status: "pending" | "authorized" | "paused" | "cancelled";
  external_reference?: string;
  next_payment_date?: string;
}

/** One monthly charge of a subscription (an "authorized payment"). */
interface Charge {
  id: number | string;
  preapproval_id: string;
  /** scheduled, processed, recycling (failed, being retried), cancelled. */
  status?: string;
  date_created?: string;
  payment?: { status?: string };
}

/**
 * The status the Pulse keeps. An authorized subscription is active: Mercado
 * Pago has validated the card and charges it on its own. Its latest charge
 * failing, or the subscription being paused, makes it late.
 */
export function statusFrom(subscription: Pick<Preapproval, "status">, last?: Pick<Charge, "status" | "payment">): SubscriptionStatus {
  if (subscription.status === "cancelled") return "cancelled";
  if (subscription.status === "pending") return "pending";
  if (subscription.status === "paused") return "past_due";
  const failed =
    last?.status === "recycling" || last?.payment?.status === "rejected" || last?.payment?.status === "cancelled";
  return failed ? "past_due" : "active";
}

/**
 * Creates the monthly subscription for one of our rows (its id is the
 * reference and the idempotency key: a retry after a timeout gets the same
 * subscription back instead of a second one).
 */
export async function createSubscription(input: { reference: string; email: string; cardToken: string; backUrl: string }) {
  return mp<Preapproval>("/preapproval", {
    method: "POST",
    idempotencyKey: input.reference,
    body: {
      reason: "Wuavy Pulse",
      external_reference: input.reference,
      payer_email: testPayer() ?? input.email,
      card_token_id: input.cardToken,
      auto_recurring: { frequency: 1, frequency_type: "months", transaction_amount: PRICE / 100, currency_id: "BRL" },
      back_url: input.backUrl,
      status: "authorized",
    },
  });
}

/**
 * Asks Mercado Pago for a subscription and its latest charge and writes the
 * result on our row. Returns the status, or null when the subscription is
 * not one of ours.
 */
export async function syncSubscription(providerId: string): Promise<SubscriptionStatus | null> {
  if (!PROVIDER_ID.test(providerId)) return null;
  const subscription = await mp<Preapproval>(`/preapproval/${providerId}`);
  const charges = await mp<{ results?: Charge[] }>(`/authorized_payments/search?preapproval_id=${subscription.id}`).catch(
    (): { results?: Charge[] } => ({ results: [] }),
  );
  const last = [...(charges.results ?? [])].sort((a, b) => String(b.date_created ?? "").localeCompare(String(a.date_created ?? "")))[0];
  const status = statusFrom(subscription, last);

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
  return status;
}

/** A monthly charge's notice: the subscription it belongs to is synced. */
export async function syncCharge(chargeId: string) {
  if (!PROVIDER_ID.test(chargeId)) return null;
  const charge = await mp<Charge>(`/authorized_payments/${chargeId}`);
  return charge.preapproval_id ? syncSubscription(String(charge.preapproval_id)) : null;
}

/**
 * A webhook's x-signature ("ts=…,v1=…"): HMAC-SHA256, with the secret from
 * the Mercado Pago panel, of "id:{data.id};request-id:{x-request-id};ts:{ts};"
 * (a part left out when its value is missing). No secret, no signature, or a
 * mismatch: not from Mercado Pago.
 */
export function verifySignature(signature: string | null, requestId: string | null, dataId: string | null) {
  const secret = process.env.MERCADOPAGO_WEBHOOK_SECRET;
  if (!secret || !signature) return false;
  const parts = new Map(
    signature.split(",").map((part) => {
      const [key, ...value] = part.split("=");
      return [key.trim(), value.join("=").trim()] as const;
    }),
  );
  const ts = parts.get("ts");
  const v1 = parts.get("v1");
  if (!ts || !v1) return false;
  const id = dataId && /^[a-z0-9]+$/i.test(dataId) ? dataId.toLowerCase() : dataId;
  const manifest = `${id ? `id:${id};` : ""}${requestId ? `request-id:${requestId};` : ""}ts:${ts};`;
  const expected = Buffer.from(createHmac("sha256", secret).update(manifest).digest("hex"));
  const given = Buffer.from(v1);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

import "server-only";

import { appSecret, graphVersion } from "./config";

/*
  Meta's Graph API for WhatsApp (Cloud API), from the server only. Every call
  carries a token the browser never sees. An error keeps only Meta's numeric
  codes: never the token, never a message's content.
*/

const BASE = "https://graph.facebook.com";

export class GraphError extends Error {
  constructor(
    readonly status: number,
    readonly code: number | null,
    readonly subcode: number | null,
  ) {
    super(`Graph API ${status} (code ${code ?? "?"}${subcode ? `/${subcode}` : ""})`);
  }
  /** Short and safe, for the database and the logs. */
  get reason() {
    return `meta:${this.code ?? this.status}${this.subcode ? `/${this.subcode}` : ""}`;
  }
}

/** The token is expired, revoked or lacks a permission: the clinic must reconnect. */
export const needsReconnect = (e: GraphError) => e.code === 190 || e.code === 200 || e.code === 10 || e.status === 401;
/** Outside the 24-hour customer service window: only an approved template may be sent. */
export const outsideWindow = (e: GraphError) => e.code === 131047;
/** Meta's test number only sends to the recipients added in the app's dashboard. */
export const notAllowedRecipient = (e: GraphError) => e.code === 131030;

async function graph<T>(
  path: string,
  init: { token?: string; method?: "GET" | "POST" | "DELETE"; body?: unknown; query?: Record<string, string> } = {},
): Promise<T> {
  const url = new URL(`${BASE}/${graphVersion()}/${path}`);
  for (const [k, v] of Object.entries(init.query ?? {})) url.searchParams.set(k, v);
  let response: Response;
  try {
    response = await fetch(url, {
      method: init.method ?? "GET",
      headers: {
        ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}),
        ...(init.body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    // Meta unreachable or too slow: nothing about the request goes further than this.
    throw new GraphError(0, null, null);
  }
  const data = (await response.json().catch(() => null)) as { error?: { code?: number; error_subcode?: number } } | null;
  if (!response.ok || data?.error) {
    throw new GraphError(response.status, data?.error?.code ?? null, data?.error?.error_subcode ?? null);
  }
  return data as T;
}

/** The number as WhatsApp shows it, and the business name people see. */
export function phoneInfo(token: string, phoneNumberId: string) {
  return graph<{ display_phone_number?: string; verified_name?: string }>(encodeURIComponent(phoneNumberId), {
    token,
    query: { fields: "display_phone_number,verified_name" },
  });
}

/** A free-form text, valid inside the 24-hour customer service window. Returns Meta's message id. */
export async function sendText(token: string, phoneNumberId: string, to: string, body: string) {
  const data = await graph<{ messages?: { id?: string }[] }>(`${encodeURIComponent(phoneNumberId)}/messages`, {
    token,
    method: "POST",
    body: { messaging_product: "whatsapp", recipient_type: "individual", to, type: "text", text: { body, preview_url: false } },
  });
  const id = data.messages?.[0]?.id;
  if (!id) throw new GraphError(200, null, null);
  return id;
}

/* ── Embedded Signup (a clinic's own number) ───────────────── */

/** The code Meta hands the browser (valid for 30 seconds) becomes the clinic's business token, here only. */
export async function exchangeCode(appId: string, code: string) {
  const secret = appSecret();
  if (!secret) throw new GraphError(0, null, null);
  const data = await graph<{ access_token?: string }>("oauth/access_token", {
    query: { client_id: appId, client_secret: secret, code },
  });
  if (!data.access_token) throw new GraphError(200, null, null);
  return data.access_token;
}

/** The numbers of a WhatsApp Business account the token reaches: proof that the ids the browser relayed are real. */
export async function wabaNumbers(token: string, wabaId: string) {
  const data = await graph<{ data?: { id: string }[] }>(`${encodeURIComponent(wabaId)}/phone_numbers`, {
    token,
    query: { fields: "id" },
  });
  return (data.data ?? []).map((n) => n.id);
}

/** Meta starts sending this account's messages and statuses to the webhook. */
export const subscribeApp = (token: string, wabaId: string) =>
  graph(`${encodeURIComponent(wabaId)}/subscribed_apps`, { token, method: "POST" });

export const unsubscribeApp = (token: string, wabaId: string) =>
  graph(`${encodeURIComponent(wabaId)}/subscribed_apps`, { token, method: "DELETE" });

/** A number new to Cloud API is registered with a two-step verification PIN (a number from the Business app is not). */
export const registerNumber = (token: string, phoneNumberId: string, pin: string) =>
  graph(`${encodeURIComponent(phoneNumberId)}/register`, {
    token,
    method: "POST",
    body: { messaging_product: "whatsapp", pin },
  });

/** Coexistence: Meta requires the history sync to be requested within 24 hours of onboarding. */
export const requestHistorySync = (token: string, phoneNumberId: string) =>
  graph(`${encodeURIComponent(phoneNumberId)}/smb_app_data`, {
    token,
    method: "POST",
    body: { messaging_product: "whatsapp", sync_type: "history" },
  });

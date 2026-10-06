import { timingSafeEqual } from "node:crypto";

import type { NextRequest } from "next/server";

import { appSecret, verifyToken } from "@/lib/whatsapp/config";
import { handleEvents } from "@/lib/whatsapp/receive";
import { readWebhook, validSignature } from "@/lib/whatsapp/webhook";

/*
  Meta's WhatsApp webhook (configure this URL in the Meta app: WhatsApp →
  Configuration → Callback URL, with the same verify token as
  WHATSAPP_VERIFY_TOKEN, and subscribe the "messages" field).

  GET: Meta's verification. The challenge is echoed only for our verify token.
  POST: messages and delivery statuses. Unsigned or wrongly signed requests
  stop here (401). The work per notification is a few database calls, done
  before answering, so a failure answers 500 and Meta retries (for up to
  7 days); the same message twice is still one message. A notification that
  carries nothing for us is acknowledged at once.
*/

const same = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams;
  const expected = verifyToken();
  const given = query.get("hub.verify_token");
  const challenge = query.get("hub.challenge");
  if (query.get("hub.mode") === "subscribe" && expected && given && challenge && same(given, expected)) {
    return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
  }
  return new Response(null, { status: 403 });
}

export async function POST(request: NextRequest) {
  const raw = await request.text();
  if (!validSignature(raw, request.headers.get("x-hub-signature-256"), appSecret())) {
    return new Response(null, { status: 401 });
  }
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return new Response(null, { status: 400 });
  }
  try {
    await handleEvents(readWebhook(payload));
  } catch (error) {
    console.error(error instanceof Error ? error.message : "WhatsApp webhook failed");
    return new Response(null, { status: 500 });
  }
  return new Response(null, { status: 200 });
}

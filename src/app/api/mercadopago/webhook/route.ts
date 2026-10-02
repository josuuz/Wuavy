import type { NextRequest } from "next/server";

import { BillingUnavailable, syncCharge, syncSubscription, verifySignature } from "@/lib/flow/billing";

/*
  Mercado Pago's notices about subscriptions (configure this URL in the
  Mercado Pago panel, under Webhooks, with the "Planos e assinaturas" events).

  A notice is only a hint that something changed: its signature is checked
  first (nothing unsigned goes further), then the subscription is read back
  from Mercado Pago with our token and its status written from that answer.
  The body is never trusted, and the same notice twice writes the same thing.
  A 500 makes Mercado Pago retry later; anything else is acknowledged.
*/

interface Notice {
  type?: string;
  data?: { id?: string | number };
}

export async function POST(request: NextRequest) {
  const query = request.nextUrl.searchParams;
  const body = (await request.json().catch(() => null)) as Notice | null;
  const dataId = query.get("data.id") ?? (body?.data?.id != null ? String(body.data.id) : null);

  if (!verifySignature(request.headers.get("x-signature"), request.headers.get("x-request-id"), dataId)) {
    return new Response(null, { status: 401 });
  }

  const type = body?.type ?? query.get("type");
  if (!dataId) return new Response(null, { status: 200 });

  try {
    if (type === "subscription_preapproval") await syncSubscription(dataId);
    else if (type === "subscription_authorized_payment") await syncCharge(dataId);
  } catch (error) {
    console.error("Mercado Pago webhook failed", type, dataId, error instanceof BillingUnavailable ? error.message : error);
    return new Response(null, { status: 500 });
  }
  return new Response(null, { status: 200 });
}

import type { NextRequest } from "next/server";

import { verifySignature } from "@/lib/flow/billing";
import { BillingUnavailable, MercadoPagoError, syncPayment } from "@/lib/billing/charges";

/*
  Os avisos do Mercado Pago sobre cobranças únicas (Checkout Pro).

  Este endereço vai como notification_url em cada Preference que criamos
  (lib/billing/charges.ts). O webhook da manutenção e o do Pulse não mudam —
  cada produto recebe só o que é seu.

  O mesmo princípio dos outros dois: um aviso é uma pista, nunca uma
  confirmação. O que confirma é a leitura de volta (GET /v1/payments/{id},
  em syncPayment), que também confere referência, moeda e valor antes de
  escrever qualquer coisa. provider_payment_id é único, então o mesmo aviso
  duas vezes escreve a mesma linha — nunca conta duas.

  x-signature: quando vem, tem de bater, ou 401. O Mercado Pago não garante
  mandá-la sempre, então um aviso sem assinatura é aceito como pista e nada
  mais — ele só faz o servidor perguntar de volta o que já sabia perguntar.
*/

interface Notice {
  type?: string;
  data?: { id?: string | number };
}

export async function POST(request: NextRequest) {
  const query = request.nextUrl.searchParams;
  const body = (await request.json().catch(() => null)) as Notice | null;
  const dataId = query.get("data.id") ?? (body?.data?.id != null ? String(body.data.id) : null);

  const signature = request.headers.get("x-signature");
  if (signature && !verifySignature(signature, request.headers.get("x-request-id"), dataId)) {
    return new Response(null, { status: 401 });
  }

  const type = body?.type ?? query.get("type");
  if (!dataId || type !== "payment") return new Response(null, { status: 200 });

  try {
    await syncPayment(dataId);
  } catch (error) {
    if (error instanceof MercadoPagoError && (error.status === 404 || error.status === 400)) {
      console.warn("cobranças: aviso ignorado", dataId, error.status);
      return new Response(null, { status: 200 });
    }
    console.error("cobranças: webhook falhou", dataId, error instanceof BillingUnavailable ? error.message : error);
    return new Response(null, { status: 500 });
  }
  return new Response(null, { status: 200 });
}

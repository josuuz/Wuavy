import type { NextRequest } from "next/server";

import { MercadoPagoError, verifySignature } from "@/lib/flow/billing";
import { BillingUnavailable, syncCharge, syncSubscription } from "@/lib/maintenance/billing";

/*
  Os avisos do Mercado Pago sobre as assinaturas de manutenção.

  Este endereço não é configurado no painel do Mercado Pago: ele vai como
  notification_url em cada assinatura que criamos
  (lib/maintenance/billing.ts). Assim o webhook do Pulse continua recebendo
  só o que é do Pulse, e nada da cobrança dele muda.

  Um aviso é só uma pista de que algo mudou. O que confirma um pagamento é a
  leitura de volta: a assinatura é lida do Mercado Pago com o nosso token de
  servidor e o estado é escrito a partir dessa resposta. O corpo do aviso
  nunca é acreditado, e o mesmo aviso duas vezes escreve a mesma coisa.

  Sobre a assinatura HMAC (x-signature): quando ela vem, tem de conferir —
  um aviso assinado errado é recusado com 401. O Mercado Pago não garante
  enviá-la para um notification_url posto no próprio recurso, então um aviso
  sem assinatura é aceito como pista e nada mais: ele não traz valor nenhum
  para dentro, só faz o servidor perguntar ao Mercado Pago o que já sabia
  perguntar. E só uma assinatura que seja nossa (o sync devolve null quando
  não é) chega a escrever uma linha.

  Um 500 faz o Mercado Pago tentar de novo mais tarde; qualquer outra coisa é
  dada por recebida — inclusive uma assinatura que o Mercado Pago diz não
  conhecer (o aviso de teste do painel leva um id inventado), que nenhuma
  retentativa resolveria.
*/

interface Notice {
  type?: string;
  action?: string;
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
  if (!dataId) return new Response(null, { status: 200 });

  try {
    if (type === "subscription_preapproval") await syncSubscription(dataId);
    else if (type === "subscription_authorized_payment") await syncCharge(dataId);
  } catch (error) {
    if (error instanceof MercadoPagoError && (error.status === 404 || error.status === 400)) {
      console.warn("manutenção: aviso ignorado", type, dataId, error.status);
      return new Response(null, { status: 200 });
    }
    console.error("manutenção: webhook falhou", type, dataId, error instanceof BillingUnavailable ? error.message : error);
    return new Response(null, { status: 500 });
  }
  return new Response(null, { status: 200 });
}

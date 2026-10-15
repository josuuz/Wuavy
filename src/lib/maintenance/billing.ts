import "server-only";

import { randomBytes } from "node:crypto";

import { MercadoPagoError } from "@/lib/flow/billing";
import { absoluteUrl } from "@/lib/seo";
import { createAdminClient } from "@/lib/supabase/admin";
import { confirmedStatus, PROVIDER_ID as SHARED_PROVIDER_ID, runCancel, statusFrom } from "@/lib/mercadopago/notice";
import { decide, payerEmailFor, REFUSAL } from "@/lib/mercadopago/environment";
import { asMaintenanceStatus, chargeFailed, type MaintenanceStatus } from "./plan";

/*
  A cobrança da manutenção, no servidor e em nenhum outro lugar.

  O modelo: uma assinatura mensal sem plano associado (POST /preapproval com
  status "pending"), criada com o valor daquele cliente. O Mercado Pago
  devolve um init_point: é lá que o cliente autoriza a cobrança no cartão. O
  cartão nunca passa por nós — a nossa página vende o plano, o Mercado Pago
  recebe o cartão.

  Cada assinatura leva o seu próprio notification_url, o webhook desta pasta
  (/api/mercadopago/manutencao/webhook). O webhook do Pulse não muda e
  continua recebendo só o que é do Pulse.

  Qual é o estado de uma assinatura vem de um lugar só: syncSubscription, que
  pergunta ao Mercado Pago pela assinatura e pelas suas cobranças e escreve a
  resposta. A página do cliente chama no retorno, o webhook chama a cada
  aviso. Nunca pelo que o navegador (ou o corpo de um aviso) diz, e rodar
  duas vezes escreve a mesma coisa.

  O que é genérico do Mercado Pago — a classe de erro, o pagador de teste, a
  conferência da assinatura HMAC — é importado de lib/flow/billing: um lugar
  só para a mesma regra, sem alterar a cobrança do Pulse.
*/

const API = "https://api.mercadopago.com";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PROVIDER_ID = SHARED_PROVIDER_ID;

/** A cobrança está fechada: sem credenciais, ou o ambiente não bate com elas (environment.ts). */
export class BillingUnavailable extends Error {}

/** A cobrança pode falar com o Mercado Pago neste ambiente (environment.ts). */
export const billingReady = () => decide(process.env).allowed;

/** "test" quando a cobrança roda contra uma conta de teste do Mercado Pago, e só então. */
export const testMode = () => {
  const decision = decide(process.env);
  return decision.allowed && decision.mode === "test";
};

/** Por que a cobrança está fechada, para quem administra; null quando está aberta. */
export const closedReason = () => {
  const decision = decide(process.env);
  return decision.allowed ? null : REFUSAL[decision.reason];
};

/** O endereço do webhook desta cobrança, que vai em cada assinatura criada. */
export const WEBHOOK_PATH = "/api/mercadopago/manutencao/webhook";

/** O link individual de um cliente: um token aleatório, e nada mais abre a página. */
export const newToken = () => randomBytes(16).toString("hex");

async function mp<T>(path: string, init: { method?: "GET" | "POST" | "PUT"; body?: unknown; idempotencyKey?: string } = {}): Promise<T> {
  // Toda chamada passa aqui, a de leitura também: um token de produção num
  // ambiente de desenvolvimento não fala com o Mercado Pago, ponto.
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

/** Uma assinatura, como o Mercado Pago a relata. */
interface Preapproval {
  id: string;
  status: "pending" | "authorized" | "paused" | "cancelled";
  external_reference?: string;
  next_payment_date?: string;
  /** Onde o cliente autoriza a cobrança. Só vem numa assinatura "pending". */
  init_point?: string;
}

/** Uma cobrança mensal de uma assinatura (um "authorized payment"). */
interface Charge {
  id: number | string;
  preapproval_id: string;
  /** scheduled, processed, recycling (falhou, sendo retentada), cancelled. */
  status?: string;
  date_created?: string;
  transaction_amount?: number;
  payment?: { status?: string; id?: number | string };
}

/**
 * Cria a assinatura mensal de uma das nossas linhas. O id da linha é a
 * referência e a chave de idempotência: repetir depois de um timeout devolve
 * a mesma assinatura, nunca uma segunda.
 *
 * Devolve o init_point: o endereço do Mercado Pago onde o cliente autoriza.
 */
export async function createSubscription(input: {
  reference: string;
  email: string;
  amountCents: number;
  planName: string;
  backPath: string;
}) {
  return mp<Preapproval>("/preapproval", {
    method: "POST",
    idempotencyKey: input.reference,
    body: {
      reason: `Wuavy — ${input.planName}`,
      external_reference: input.reference,
      payer_email: payerEmailFor(process.env, input.email),
      auto_recurring: {
        frequency: 1,
        frequency_type: "months",
        transaction_amount: input.amountCents / 100,
        currency_id: "BRL",
      },
      back_url: absoluteUrl(input.backPath),
      notification_url: absoluteUrl(WEBHOOK_PATH),
      status: "pending",
    },
  });
}

/**
 * Onde o cliente autoriza uma assinatura que já existe e ainda está
 * pendente: o mesmo init_point, pedido de volta ao Mercado Pago. Um cliente
 * que fechou a aba no meio continua de onde parou, sem uma segunda
 * assinatura.
 */
export async function authorizationLink(providerId: string) {
  if (!PROVIDER_ID.test(providerId)) return null;
  const subscription = await mp<Preapproval>(`/preapproval/${providerId}`);
  return subscription.status === "pending" ? (subscription.init_point ?? null) : null;
}

/** Quanto esperar antes de ler de novo, quando a releitura não respondeu. */
const CONFIRM_WAIT_MS = 1200;

/**
 * Cancela a assinatura no Mercado Pago, então escreve o que o Mercado Pago
 * disse. Devolve o status lido de volta, que quem chama precisa conferir: só
 * "cancelled" é um cancelamento.
 *
 * A ordem dos passos, as duas grafias, e a regra de nada ser falha depois de
 * um PUT aceito moram em runCancel (mercadopago/notice.ts, testado com
 * chamadas injetadas) — o mesmo laço que o Pulse usa. Isto só liga as
 * chamadas de verdade.
 */
export const cancelSubscription = (providerId: string): Promise<MaintenanceStatus | null> =>
  runCancel(providerId, {
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
 * Pergunta ao Mercado Pago por uma assinatura e pelas suas cobranças e
 * escreve o resultado na nossa linha e no histórico de pagamentos. Devolve o
 * status, ou null quando a assinatura não é nossa.
 */
export async function syncSubscription(providerId: string): Promise<MaintenanceStatus | null> {
  if (!PROVIDER_ID.test(providerId)) return null;
  const subscription = await mp<Preapproval>(`/preapproval/${providerId}`);
  const charges = await mp<{ results?: Charge[] }>(`/authorized_payments/search?preapproval_id=${subscription.id}`).catch(
    (): { results?: Charge[] } => ({ results: [] }),
  );
  const sorted = [...(charges.results ?? [])].sort((a, b) => String(b.date_created ?? "").localeCompare(String(a.date_created ?? "")));
  const status = statusFrom(subscription, sorted[0]);

  const admin = createAdminClient();
  // A nossa linha: a que já guarda esta assinatura, ou a que ela foi criada para (a referência).
  const reference = subscription.external_reference && UUID.test(subscription.external_reference) ? subscription.external_reference : null;
  const { data: rows } = await admin
    .from("maintenance_subscriptions")
    .select("id, started_at, provider_subscription_id")
    .or(`provider_subscription_id.eq.${subscription.id}${reference ? `,id.eq.${reference}` : ""}`);
  const row = rows?.find((r) => r.provider_subscription_id === subscription.id) ?? rows?.find((r) => !r.provider_subscription_id);
  if (!row) return null;

  const now = new Date().toISOString();
  const { error } = await admin
    .from("maintenance_subscriptions")
    .update({
      provider_subscription_id: subscription.id,
      status,
      current_period_end: subscription.next_payment_date ?? null,
      // Marcado uma vez, na primeira vez que fica ativa: um aviso repetido não o move.
      started_at: row.started_at ?? (status === "active" ? now : null),
      updated_at: now,
    })
    .eq("id", row.id);
  if (error) throw error;

  await writePayments(row.id, sorted);
  return status;
}

/**
 * O histórico: uma linha por cobrança que o Mercado Pago relata. A id da
 * cobrança é única, então o mesmo aviso duas vezes escreve a mesma linha.
 */
async function writePayments(subscriptionId: string, charges: Charge[]) {
  if (!charges.length) return;
  const admin = createAdminClient();
  const rows = charges.map((charge) => ({
    subscription_id: subscriptionId,
    // A id da cobrança autorizada, não a do pagamento: ela existe desde que
    // a cobrança é agendada e não muda quando o pagamento enfim acontece,
    // então a mesma cobrança nunca vira duas linhas no histórico.
    provider_payment_id: String(charge.id),
    amount_cents: Math.round((charge.transaction_amount ?? 0) * 100),
    status: charge.payment?.status ?? charge.status ?? "unknown",
    paid: charge.payment?.status === "approved" || (charge.status === "processed" && !chargeFailed(charge)),
    charged_at: charge.date_created ?? null,
  }));
  const { error } = await admin.from("maintenance_payments").upsert(rows, { onConflict: "provider_payment_id" });
  if (error) console.warn("manutenção: histórico de pagamentos", error.message);
}

/** O aviso de uma cobrança mensal: a assinatura a que ela pertence é sincronizada. */
export async function syncCharge(chargeId: string) {
  if (!PROVIDER_ID.test(chargeId)) return null;
  const charge = await mp<Charge>(`/authorized_payments/${chargeId}`);
  return charge.preapproval_id ? syncSubscription(String(charge.preapproval_id)) : null;
}

/** O estado atual de uma das nossas linhas, lido de volta do Mercado Pago quando há o que ler. */
export async function refresh(subscription: {
  status: string | null;
  provider_subscription_id: string | null;
}): Promise<MaintenanceStatus | null> {
  const stored = asMaintenanceStatus(subscription.status);
  if (!subscription.provider_subscription_id) return stored;
  try {
    return (await syncSubscription(subscription.provider_subscription_id)) ?? stored;
  } catch (error) {
    console.error("manutenção: Mercado Pago", error);
    return stored;
  }
}

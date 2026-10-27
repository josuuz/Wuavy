import "server-only";

import { CANONICAL_URL, site } from "@/data/site";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  claimDecision,
  runCreateSubscription,
  runPersistRetry,
  type ClaimOutcome,
  type PersistOutcome,
} from "@/lib/mercadopago/create-subscription";
import { checkoutDecision, decide, payerEmailFor, REFUSAL } from "@/lib/mercadopago/environment";
import {
  confirmedStatus,
  httpsUrl,
  latestCharge,
  paidPeriodEnd,
  PROVIDER_ID,
  runCancel,
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
  status: number;
  body: unknown;
  constructor(status: number, body: unknown) {
    super(`Mercado Pago answered ${status}`);
    this.status = status;
    this.body = body;
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
  Criar uma assinatura com segurança: reserva atômica antes de chamar o
  Mercado Pago (claimSubscriptionCreation), classificação do resultado
  (runCreateSubscription, create-subscription.ts) e gravação do id com
  algumas tentativas (persistSubscriptionId) — nunca um UPDATE sem conferir
  erro. O mesmo mecanismo das Cobranças (billing/charges.ts), com o nome da
  coluna certo para esta tabela. A ordem importa: depois que o Mercado Pago
  criou a assinatura, nada é relatado como recusa — só "saved" (confirmado)
  ou "failed" (bloquear, nunca criar uma segunda).
*/

/** Quanto tempo uma reserva (creation_claimed_at) vale antes de ser considerada abandonada. */
const CLAIM_STALE_MS = 30_000;
/** Quantas vezes tentar só a gravação local depois de o Mercado Pago já ter respondido. */
const PERSIST_ATTEMPTS = 3;
const persistWaitMs = (attempt: number) => attempt * 300;

/**
 * A reserva atômica: um UPDATE condicional que só afeta a linha quando
 * nenhuma outra tentativa está em andamento e ela não está bloqueada. Duas
 * requisições para a mesma linha (clique duplo, uma aba recarregada) nunca
 * reivindicam as duas — a atomicidade é do próprio UPDATE do Postgres.
 */
export async function claimSubscriptionCreation(rowId: string): Promise<ClaimOutcome> {
  const admin = createAdminClient();
  const { data: row, error: readError } = await admin
    .from("subscriptions")
    .select("provider_subscription_id, creation_blocked_at, creation_claimed_at")
    .eq("id", rowId)
    .maybeSingle();
  if (readError) {
    // Supabase indisponível: não dá para saber o estado real da linha, e
    // reivindicar às cegas arriscaria uma segunda chamada ao Mercado Pago.
    // "in_progress" não cria nada — o lado seguro quando a dúvida é sobre o
    // próprio banco.
    console.error("pulse: ler assinatura para reivindicar", rowId, readError.message);
    return "in_progress";
  }
  if (!row) return "already";

  const decision = claimDecision(row, Date.now(), CLAIM_STALE_MS);

  if (decision === "blocked" && !row.creation_blocked_at) {
    // A reserva venceu agora mesmo: trava atomicamente, conferindo a mesma
    // reserva que foi lida — se outra requisição já mudou a linha entre a
    // leitura e aqui, este UPDATE não afeta nada.
    const { error: blockError } = await admin
      .from("subscriptions")
      .update({ creation_blocked_at: new Date().toISOString() })
      .eq("id", rowId)
      .eq("creation_claimed_at", row.creation_claimed_at as string)
      .is("provider_subscription_id", null)
      .is("creation_blocked_at", null);
    if (blockError) console.error("pulse: travar reserva vencida", rowId, blockError.message);
    return "blocked";
  }
  if (decision !== "claimed") return decision;

  const { data, error: claimError } = await admin
    .from("subscriptions")
    .update({ creation_claimed_at: new Date().toISOString() })
    .eq("id", rowId)
    .is("provider_subscription_id", null)
    .is("creation_blocked_at", null)
    .is("creation_claimed_at", null)
    .select("id");
  if (claimError) {
    console.error("pulse: reivindicar criação", rowId, claimError.message);
    return "in_progress";
  }
  // A pré-leitura disse "claimed", mas o UPDATE condicional pode não ter
  // afetado nada se outra requisição reivindicou entre as duas chamadas.
  return data && data.length ? "claimed" : "in_progress";
}

/**
 * Libera a reserva sem bloquear: uma recusa confirmada (4xx do próprio
 * Mercado Pago) prova que nada foi criado, então uma NOVA linha pode
 * reivindicar livremente depois. Nunca toca numa linha já bloqueada ou com
 * assinatura.
 */
export async function releaseSubscriptionClaim(rowId: string): Promise<void> {
  const admin = createAdminClient();
  await admin
    .from("subscriptions")
    .update({ creation_claimed_at: null })
    .eq("id", rowId)
    .is("provider_subscription_id", null)
    .is("creation_blocked_at", null);
}

/**
 * Fecha a linha para qualquer criação automática nova: usado quando o
 * resultado no Mercado Pago ficou incerto (timeout, 5xx) ou quando a
 * assinatura foi aceita mas não foi possível salvar o id mesmo depois de
 * tentar (persistSubscriptionId). Só reconciliação manual destrava.
 */
export async function blockSubscriptionCreation(rowId: string): Promise<PersistOutcome> {
  const admin = createAdminClient();
  return runPersistRetry(
    async () => {
      // Guarda em provider_subscription_id null como toda outra escrita deste
      // arquivo (persistSubscriptionId, a reserva vencida dentro de
      // claimSubscriptionCreation): sem isto, uma resposta do Mercado Pago (ou
      // o webhook) que resolveu a linha de verdade ENQUANTO esta chamada ainda
      // rodava podia ser sobrescrita por um bloqueio tardio — achado da
      // revisão independente (ecc:database-reviewer).
      const { data, error } = await admin
        .from("subscriptions")
        .update({ creation_blocked_at: new Date().toISOString() })
        .eq("id", rowId)
        .is("provider_subscription_id", null)
        .select("id");
      if (error) {
        console.warn("pulse: gravar bloqueio, tentativa falhou", rowId, error.message);
        return false;
      }
      if (data && data.length) return true;
      // 0 linhas: ou a linha já tem provider_subscription_id (resolvida
      // enquanto esta tentativa ainda rodava — nada a bloquear, a corrida já
      // se resolveu sozinha e check()/clinicAccess() já leem o estado certo),
      // ou ela não existe mais. Lê para diferenciar; só o primeiro caso é sucesso.
      const { data: current } = await admin.from("subscriptions").select("provider_subscription_id").eq("id", rowId).maybeSingle();
      if (current?.provider_subscription_id) {
        console.warn("pulse: bloqueio dispensado — a linha já resolveu sozinha antes do bloqueio chegar", rowId);
        return true;
      }
      return false;
    },
    PERSIST_ATTEMPTS,
    (attempt) => new Promise((resolve) => setTimeout(resolve, persistWaitMs(attempt))),
  );
  // "failed" aqui não deixa a linha livre: claimSubscriptionCreation trava
  // sozinho (reserva vencida -> "blocked") na próxima vez que alguém olhar
  // esta linha, mesmo que esta gravação explícita nunca confirme.
}

/**
 * Marca a linha como recusada na criação: nunca existiu no Mercado Pago,
 * nunca foi apagada — fica para histórico e para suporte financeiro. Uma
 * recusa confirmada nunca bloqueia: libera para uma tentativa nova (uma
 * linha nova) em vez de travar à espera de reconciliação manual, que aqui
 * não teria nada para reconciliar.
 */
export async function recordSubscriptionRefusal(rowId: string, httpStatus: number, detail: string | undefined): Promise<PersistOutcome> {
  const admin = createAdminClient();
  return runPersistRetry(
    async () => {
      const { error } = await admin
        .from("subscriptions")
        .update({
          status: "rejected",
          last_refusal_http_status: httpStatus,
          last_refusal_detail: detail ?? null,
          creation_claimed_at: null,
        })
        .eq("id", rowId)
        .is("provider_subscription_id", null);
      if (error) console.warn("pulse: gravar recusa, tentativa falhou", rowId, error.message);
      return !error;
    },
    PERSIST_ATTEMPTS,
    (attempt) => new Promise((resolve) => setTimeout(resolve, persistWaitMs(attempt))),
  );
}

async function writeRecoveredSubscriptionId(admin: ReturnType<typeof createAdminClient>, rowId: string, providerId: string): Promise<boolean> {
  const { data, error } = await admin
    .from("subscriptions")
    .update({ provider_subscription_id: providerId, creation_blocked_at: null, creation_claimed_at: null })
    .eq("id", rowId)
    .is("provider_subscription_id", null)
    .select("id");
  if (error) {
    console.error("pulse: gravar id recuperado após bloqueio", rowId, error.message);
    return false;
  }
  return Boolean(data && data.length);
}

/**
 * Grava o id da assinatura recém-criada, com algumas tentativas — nunca
 * chama o Mercado Pago de novo, só repete a escrita no Supabase. "failed"
 * significa que o id existe no Mercado Pago mas não foi possível salvá-lo
 * aqui mesmo depois de tentar: quem chamou deve bloquear a linha
 * (blockSubscriptionCreation), nunca criar uma segunda assinatura.
 *
 * Se a reserva venceu e travou sozinha (claimSubscriptionCreation) ENQUANTO
 * esta chamada ainda estava em andamento, a resposta do Mercado Pago que só
 * agora chegou é legítima e o id não pode ser perdido — grava mesmo assim
 * pelo caminho de recuperação, em vez de descartar.
 */
export async function persistSubscriptionId(rowId: string, providerId: string): Promise<PersistOutcome> {
  const admin = createAdminClient();
  return runPersistRetry(
    async () => {
      const { data, error } = await admin
        .from("subscriptions")
        .update({ provider_subscription_id: providerId, creation_claimed_at: null })
        .eq("id", rowId)
        .is("provider_subscription_id", null)
        .is("creation_blocked_at", null)
        .select("id");
      if (error) {
        console.warn("pulse: gravar id da assinatura, tentativa falhou", rowId, error.message);
        return false;
      }
      if (data && data.length) return true;

      // 0 linhas afetadas: ou já está salvo (idempotente — repetir não é
      // falha), ou a linha travou no meio do caminho. Lê o estado atual
      // para diferenciar; nunca assume nenhum dos dois sem conferir.
      const { data: current, error: readError } = await admin
        .from("subscriptions")
        .select("provider_subscription_id, creation_blocked_at")
        .eq("id", rowId)
        .maybeSingle();
      if (readError || !current) {
        console.warn("pulse: conferir estado após gravação sem efeito", rowId, readError?.message);
        return false;
      }
      if (current.provider_subscription_id === providerId) return true;
      if (current.provider_subscription_id) {
        // Duas assinaturas diferentes para a mesma linha: nunca sobrescreve
        // silenciosamente. Precisa de olhos humanos, não de mais uma tentativa.
        console.error("pulse: duas assinaturas diferentes para a mesma linha — não sobrescrevendo", rowId, {
          jaSalva: current.provider_subscription_id,
          recemCriada: providerId,
        });
        return false;
      }
      if (current.creation_blocked_at) {
        const recovered = await writeRecoveredSubscriptionId(admin, rowId, providerId);
        if (recovered) console.warn("pulse: resposta do Mercado Pago chegou depois do bloqueio — recuperada com segurança", rowId);
        return recovered;
      }
      return false;
    },
    PERSIST_ATTEMPTS,
    (attempt) => new Promise((resolve) => setTimeout(resolve, persistWaitMs(attempt))),
  );
}

export { runCreateSubscription };

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
 * The order of the steps, both spellings, and the rule that nothing after an
 * accepted PUT is a failure live in runCancel (mercadopago/notice.ts, tested
 * with injected calls). This only wires the real ones to it — the same shape
 * maintenance/billing.ts uses for its own cancelSubscription.
 */
export const cancelSubscription = (providerId: string): Promise<SubscriptionStatus | null> =>
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
  // Failed (not merely empty): told apart from a genuine "no charges yet" so
  // that one lost request never reads as "nothing was ever paid" below.
  let chargesFetchFailed = false;
  const charges = await mp<{ results?: Charge[] }>(
    `/authorized_payments/search?preapproval_id=${encodeURIComponent(subscription.id)}`,
  ).catch((): { results?: Charge[] } => {
    chargesFetchFailed = true;
    return { results: [] };
  });
  const status = statusFrom(subscription, latestCharge(charges.results));

  const admin = createAdminClient();
  // Our row: the one already holding this subscription, or the one it was created for (its reference).
  const reference = subscription.external_reference && UUID.test(subscription.external_reference) ? subscription.external_reference : null;
  const { data: rows } = await admin
    .from("subscriptions")
    .select("id, started_at, provider_subscription_id, current_period_end, legacy_access_transition, first_payment_confirmed_at")
    .or(`provider_subscription_id.eq.${subscription.id}${reference ? `,id.eq.${reference}` : ""}`);
  const row = rows?.find((r) => r.provider_subscription_id === subscription.id) ?? rows?.find((r) => !r.provider_subscription_id);
  if (!row) return null;

  /*
    What this column means switches with status, and so does where it comes
    from. Active or past_due: the next date Mercado Pago itself means to
    charge (next_payment_date) — a forward-looking field by Mercado Pago's
    own definition, nothing about history. Cancelled: there is no next
    charge to report, so the same field tells nothing about the month
    already paid for — paidThrough (lib/flow/access.ts) needs the end of the
    period the last CONFIRMED charge bought, derived from the search above,
    never invented and never read from next_payment_date (billing.ts:252,
    found in review: writing it unconditionally erased the paid month the
    instant a clinic cancelled, since Mercado Pago reports no next debit
    for a cancelled subscription).
    A charges search that failed outright (not one that genuinely found
    none) must not read as "nothing was ever paid": that would take away an
    already-confirmed month over a passing network error. The stored value
    stands until a search that actually answers says otherwise.
  */
  const periodEnd =
    status !== "cancelled"
      ? subscription.next_payment_date ?? null
      : chargesFetchFailed
        ? (row.current_period_end ?? null)
        : paidPeriodEnd(charges.results);

  // Prova financeira, nunca inferida do status (migration 0017): a primeira
  // vez que uma busca de verdade mostra um pagamento "approved" nesta
  // assinatura, grava uma vez e nunca mais muda — é o único jeito financeiro
  // de encerrar a proteção de transição legada (lib/flow/access.ts), sem
  // depender de status==='active' sozinho (que um 5xx futuro ou uma leitura
  // perdida não devem apagar).
  const hasConfirmedPayment = (charges.results ?? []).some((c) => c.status === "processed" && c.payment?.status === "approved");
  const now = new Date().toISOString();
  const { error } = await admin
    .from("subscriptions")
    .update({
      provider_subscription_id: subscription.id,
      status,
      current_period_end: periodEnd,
      // Set once, the first time it is active: a repeated notice does not move it.
      started_at: row.started_at ?? (status === "active" ? now : null),
      updated_at: now,
      // A confirmed read of this subscription is proof positive of what
      // Mercado Pago did with it — the webhook landing, or the checkout's
      // own confirm step, always clears a stale claim or block: there is
      // nothing left to reconcile once the real status is known.
      creation_claimed_at: null,
      creation_blocked_at: null,
      ...(row.legacy_access_transition && !row.first_payment_confirmed_at && hasConfirmedPayment ? { first_payment_confirmed_at: now } : {}),
    })
    .eq("id", row.id);
  if (error) throw error;
  return { status, current_period_end: periodEnd };
}

/** A monthly charge's notice: the subscription it belongs to is synced. */
export async function syncCharge(chargeId: string) {
  if (!PROVIDER_ID.test(chargeId)) return null;
  const charge = await mp<Charge>(`/authorized_payments/${chargeId}`);
  return charge.preapproval_id ? syncSubscription(String(charge.preapproval_id)) : null;
}

/** O resumo mínimo de uma assinatura, para o painel administrativo — nunca cartão, nunca token. */
export interface Inspection {
  status: SubscriptionStatus;
  current_period_end: string | null;
  /** Evidência positiva de ao menos uma cobrança "approved" — nunca inferida do status (ver syncStanding). */
  hasConfirmedPayment: boolean;
  latestCharge: { status: string | null; paymentStatus: string | null; dateCreated: string | null } | null;
  /**
   * A busca de cobranças falhou (ex.: nenhuma cobrança existe ainda — o
   * Mercado Pago responde 400 a /authorized_payments/search para uma
   * assinatura sem nenhuma, em vez de uma lista vazia). `status` ainda vem
   * do preapproval sozinho; hasConfirmedPayment e latestCharge não
   * respondem por nada quando isto é true — mesma distinção que
   * chargesFetchFailed já faz em syncStanding.
   */
  chargesUnavailable: boolean;
}

/**
 * A mesma leitura de syncStanding, só para inspeção administrativa — nunca
 * grava nada. Usada pelo painel (/pulse/admin) para decidir se uma linha
 * precisa de reconciliação antes de gravar (syncSubscription/syncStanding).
 *
 * A leitura do preapproval é obrigatória: falhando, não há nada para
 * inspecionar. A busca de cobranças, não — syncStanding já trata essa busca
 * como passível de falhar (chargesFetchFailed) sem que isso vire "nunca foi
 * pago"; a mesma resiliência faltava aqui.
 */
export async function inspectSubscription(providerId: string): Promise<Inspection | null> {
  if (!PROVIDER_ID.test(providerId)) return null;
  const subscription = await mp<Preapproval>(`/preapproval/${providerId}`);
  if (!PROVIDER_ID.test(String(subscription.id ?? ""))) return null;
  let chargesUnavailable = false;
  const charges = await mp<{ results?: Charge[] }>(
    `/authorized_payments/search?preapproval_id=${encodeURIComponent(subscription.id)}`,
  ).catch((): { results?: Charge[] } => {
    chargesUnavailable = true;
    return { results: [] };
  });
  const last = latestCharge(charges.results);
  const status = statusFrom(subscription, last);
  return {
    status,
    current_period_end: status !== "cancelled" ? (subscription.next_payment_date ?? null) : paidPeriodEnd(charges.results),
    hasConfirmedPayment: (charges.results ?? []).some((c) => c.status === "processed" && c.payment?.status === "approved"),
    latestCharge: last ? { status: last.status ?? null, paymentStatus: last.payment?.status ?? null, dateCreated: last.date_created ?? null } : null,
    chargesUnavailable,
  };
}

const PAYMENT_ID = /^\d{1,20}$/;

/** O resumo mínimo de um pagamento do Mercado Pago, para o painel administrativo — nunca pagador, nunca cartão, nunca token. */
export interface PaymentInspection {
  id: number;
  status: string | null;
  status_detail: string | null;
  /** O campo que a própria Mercado Pago devolve — a prova de que o id pertence (ou não) à conta LIVE. */
  live_mode: boolean | null;
  payment_method_id: string | null;
  payment_type_id: string | null;
  date_created: string | null;
  date_approved: string | null;
  /** A referência que nós mesmos mandamos ao criar a assinatura (a linha em subscriptions) — nunca um dado do pagador. */
  external_reference: string | null;
}

/**
 * GET /v1/payments/{id} — a API de pagamentos (diferente de /preapproval e
 * /authorized_payments, que são de assinatura). Suporte do Mercado Pago só
 * devolve o status_detail de uma recusa por aqui. Usada pelo painel para
 * diagnosticar uma recusa quando não há assinatura nossa para olhar (ex.: a
 * tentativa falhou antes de qualquer provider_subscription_id ser gravado).
 * Nunca repassa pagador, cartão ou identificação — só os campos abaixo.
 */
export async function inspectPayment(paymentId: string): Promise<PaymentInspection | null> {
  if (!PAYMENT_ID.test(paymentId)) return null;
  const payment = await mp<Record<string, unknown>>(`/v1/payments/${paymentId}`);
  if (!PAYMENT_ID.test(String(payment.id ?? ""))) return null;
  const field = (key: string) => (typeof payment[key] === "string" ? (payment[key] as string) : null);
  return {
    id: payment.id as number,
    status: field("status"),
    status_detail: field("status_detail"),
    live_mode: typeof payment.live_mode === "boolean" ? payment.live_mode : null,
    payment_method_id: field("payment_method_id"),
    payment_type_id: field("payment_type_id"),
    date_created: field("date_created"),
    date_approved: field("date_approved"),
    external_reference: field("external_reference"),
  };
}

/**
 * A webhook's x-signature, against the secret from the Mercado Pago panel.
 * The rule itself is in mercadopago-notice.ts, where it is tested; this reads
 * the secret from the environment, which a test cannot.
 */
export const verifySignature = (signature: string | null, requestId: string | null, dataId: string | null) =>
  verifyNotice(process.env.MERCADOPAGO_WEBHOOK_SECRET, signature, requestId, dataId);

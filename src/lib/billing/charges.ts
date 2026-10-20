import "server-only";

import { CANONICAL_URL, site } from "@/data/site";
import { decide, payerEmailFor, REFUSAL } from "@/lib/mercadopago/environment";
import { testSafeUrl } from "@/lib/mercadopago/notice";
import { createAdminClient } from "@/lib/supabase/admin";
import { chargeStatusFrom, paymentBucket, type ChargeBucket } from "./charge-status";
import {
  checkReconciliation,
  claimDecision,
  classifyPreferenceSearch,
  decideInvestigation,
  isWithinSearchWindow,
  runPersistPreference,
  type ClaimOutcome,
  type InvestigationVerdict,
  type PersistOutcome,
} from "./create-charge";

export { runCreateCharge, type CreateChargeOutcome } from "./create-charge";

/*
  A cobrança única (Checkout Pro), no servidor e em nenhum outro lugar.

  O modelo: uma Preference (POST /checkout/preferences) por cobrança, criada
  com a referência da nossa própria linha (billing_charges.id) como
  external_reference e como chave de idempotência — a mesma ideia de
  lib/maintenance/billing.ts (createSubscription), só que para um pagamento
  único em vez de uma assinatura. O que é genérico do Mercado Pago —
  ambiente, testSafeUrl, a assinatura HMAC — vem de lib/mercadopago/, o
  mesmo núcleo que o Pulse e a manutenção já usam. Nada aqui toca
  maintenance_* nem as assinaturas do Pulse (migration 0003).
*/

const API = "https://api.mercadopago.com";

export class BillingUnavailable extends Error {}

export class MercadoPagoError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, body: unknown) {
    super(`Mercado Pago respondeu ${status}`);
    this.status = status;
    this.body = body;
  }
}

/** A cobrança única pode falar com o Mercado Pago neste ambiente (mercadopago/environment.ts). */
export const billingReady = () => decide(process.env).allowed;

export const testMode = () => {
  const decision = decide(process.env);
  return decision.allowed && decision.mode === "test";
};

export const closedReason = () => {
  const decision = decide(process.env);
  return decision.allowed ? null : REFUSAL[decision.reason];
};

/** O webhook das cobranças únicas: isolado do da manutenção e do Pulse, cada um seu. */
export const WEBHOOK_PATH = "/api/mercadopago/cobrancas/webhook";

const returnUrl = (path: string) => testSafeUrl(path, site.url, CANONICAL_URL, testMode());

async function mp<T>(path: string, init: { method?: "GET" | "POST"; body?: unknown; idempotencyKey?: string } = {}): Promise<T> {
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

interface Preference {
  id: string;
  init_point?: string;
  sandbox_init_point?: string;
}

/**
 * Cria a Preference desta cobrança no Mercado Pago. `chargeId` (a nossa
 * linha) é a referência e a chave de idempotência: repetir com o mesmo id
 * depois de um timeout devolve a mesma Preference, nunca uma segunda.
 */
export async function createPreference(input: {
  chargeId: string;
  description: string;
  amountCents: number;
  payerEmail: string | null;
}): Promise<{ id: string; url: string }> {
  const preference = await mp<Preference>("/checkout/preferences", {
    method: "POST",
    idempotencyKey: input.chargeId,
    body: {
      items: [{ title: input.description, quantity: 1, currency_id: "BRL", unit_price: input.amountCents / 100 }],
      external_reference: input.chargeId,
      notification_url: returnUrl(WEBHOOK_PATH),
      back_urls: {
        success: returnUrl("/cobrancas/lancamentos"),
        pending: returnUrl("/cobrancas/lancamentos"),
        failure: returnUrl("/cobrancas/lancamentos"),
      },
      auto_return: "approved",
      statement_descriptor: "WUAVY",
      ...(input.payerEmail ? { payer: { email: input.payerEmail } } : {}),
    },
  });
  const url = testMode() ? preference.sandbox_init_point ?? preference.init_point : preference.init_point;
  if (!url) throw new MercadoPagoError(502, preference);
  return { id: preference.id, url };
}

/** Quanto tempo uma reserva (creation_claimed_at) vale antes de ser considerada abandonada. */
const CLAIM_STALE_MS = 30_000;
/** Quantas vezes tentar só a gravação local depois de o Mercado Pago já ter aceitado a Preference. */
const PERSIST_ATTEMPTS = 3;
const persistWaitMs = (attempt: number) => attempt * 300;

/**
 * A reserva atômica antes de chamar o Mercado Pago: um UPDATE condicional
 * que só afeta a linha quando nenhuma outra tentativa está em andamento e
 * ela não está bloqueada. Duas requisições com o mesmo chargeId nunca
 * reivindicam as duas — a atomicidade é do próprio UPDATE do Postgres, não
 * de nada escrito aqui (claimDecision, em create-charge.ts, só documenta e
 * testa a mesma condição sem rede).
 */
export async function claimCreation(chargeId: string): Promise<ClaimOutcome> {
  const admin = createAdminClient();
  const { data: row, error: readError } = await admin
    .from("billing_charges")
    .select("provider_preference_id, creation_blocked_at, creation_claimed_at")
    .eq("id", chargeId)
    .maybeSingle();
  if (readError) {
    // Supabase indisponível: não dá para saber o estado real da linha, e uma
    // reivindicação às cegas é o único jeito de arriscar uma segunda
    // chamada ao Mercado Pago. "in_progress" não chama nada — é o lado
    // seguro quando a dúvida é sobre o próprio banco, não sobre a reserva.
    console.error("cobranças: ler cobrança para reivindicar", chargeId, readError.message);
    return "in_progress";
  }
  if (!row) return "already";

  const decision = claimDecision(row, Date.now(), CLAIM_STALE_MS);

  if (decision === "blocked" && !row.creation_blocked_at) {
    // A reserva venceu agora mesmo: trava atomicamente em vez de devolver
    // "claimed" de novo. A condição confere a MESMA reserva que foi lida —
    // se outra requisição já mudou a linha (reconciliou, bloqueou, ou criou
    // a Preference) entre a leitura e aqui, este UPDATE não afeta nada, e a
    // próxima chamada a claimCreation vê o estado mais recente.
    const { error: blockError } = await admin
      .from("billing_charges")
      .update({ creation_blocked_at: new Date().toISOString() })
      .eq("id", chargeId)
      .eq("creation_claimed_at", row.creation_claimed_at as string)
      .is("provider_preference_id", null)
      .is("creation_blocked_at", null);
    if (blockError) console.error("cobranças: travar reserva vencida", chargeId, blockError.message);
    return "blocked";
  }
  if (decision !== "claimed") return decision;

  const { data, error: claimError } = await admin
    .from("billing_charges")
    .update({ creation_claimed_at: new Date().toISOString() })
    .eq("id", chargeId)
    .is("provider_preference_id", null)
    .is("creation_blocked_at", null)
    .is("creation_claimed_at", null)
    .select("id");
  if (claimError) {
    console.error("cobranças: reivindicar criação", chargeId, claimError.message);
    return "in_progress";
  }
  // A pré-leitura disse "claimed", mas o UPDATE condicional pode não ter
  // afetado nada se outra requisição reivindicou entre as duas chamadas —
  // é exatamente essa corrida que o WHERE do UPDATE resolve. Note que o
  // WHERE não aceita mais uma reserva vencida (sem o OR de antes): só uma
  // linha nunca reivindicada chega a ser afetada aqui.
  return data && data.length ? "claimed" : "in_progress";
}

/**
 * Libera a reserva sem bloquear: a recusa (4xx) prova que nada foi criado no
 * Mercado Pago, então uma nova tentativa pode reivindicar de novo. Nunca
 * toca numa linha que já esteja bloqueada ou com Preference — não há
 * recusa (4xx) que justifique desfazer qualquer um dos dois.
 */
export async function releaseClaim(chargeId: string): Promise<void> {
  const admin = createAdminClient();
  await admin
    .from("billing_charges")
    .update({ creation_claimed_at: null })
    .eq("id", chargeId)
    .is("provider_preference_id", null)
    .is("creation_blocked_at", null);
}

/**
 * Fecha a cobrança para qualquer criação automática nova: usado quando o
 * resultado no Mercado Pago ficou incerto (timeout, 5xx) ou quando a
 * Preference foi aceita mas não foi possível salvar o id mesmo depois das
 * tentativas de runPersistPreference. Só reconcilePreference ou
 * releaseForRetry (reconciliação manual) destrava.
 */
export async function blockCreation(chargeId: string): Promise<PersistOutcome> {
  const admin = createAdminClient();
  return runPersistPreference(
    async () => {
      const { error } = await admin.from("billing_charges").update({ creation_blocked_at: new Date().toISOString() }).eq("id", chargeId);
      if (error) console.warn("cobranças: gravar bloqueio, tentativa falhou", chargeId, error.message);
      return !error;
    },
    PERSIST_ATTEMPTS,
    (attempt) => new Promise((resolve) => setTimeout(resolve, persistWaitMs(attempt))),
  );
  // "failed" aqui não deixa a cobrança livre: claimCreation trava sozinho
  // (reserva vencida -> "blocked", acima) na próxima vez que alguém olhar
  // esta linha, mesmo que esta gravação explícita nunca confirme.
}

/**
 * Escreve provider_preference_id/payment_url e limpa os bloqueios numa linha
 * que ainda não tem Preference — o passo final tanto de uma recuperação pela
 * busca (investigateBlockedCharge) quanto de uma resposta legítima que
 * chegou tarde, depois de a linha já ter sido bloqueada (persistPreference,
 * abaixo). Nunca sobrescreve uma Preference diferente já salva.
 */
async function writeRecoveredPreference(
  admin: ReturnType<typeof createAdminClient>,
  chargeId: string,
  preferenceId: string,
  url: string,
): Promise<boolean> {
  const { data, error } = await admin
    .from("billing_charges")
    .update({ provider_preference_id: preferenceId, payment_url: url, creation_blocked_at: null, creation_claimed_at: null })
    .eq("id", chargeId)
    .is("provider_preference_id", null)
    .select("id");
  if (error) {
    console.error("cobranças: gravar Preference recuperada", chargeId, error.message);
    return false;
  }
  return Boolean(data && data.length);
}

/**
 * Grava o id e o link da Preference, com algumas tentativas — nunca chama o
 * Mercado Pago de novo, só repete a escrita no Supabase. Devolve "saved" ou
 * "failed"; quem chamou decide o que fazer com "failed" (bloquear).
 *
 * A escrita normal agora também confere creation_blocked_at: uma reserva
 * pode vencer e travar sozinha (claimCreation) ENQUANTO esta chamada ainda
 * está em andamento — a resposta do Mercado Pago que só agora chegou é
 * legítima, e o id dela não pode ser perdido. Quando é exatamente isso que
 * aconteceu, grava mesmo assim pelo caminho de recuperação (sem nunca
 * reabrir a porta para uma segunda criação automática) em vez de descartar.
 */
export async function persistPreference(chargeId: string, preferenceId: string, url: string): Promise<import("./create-charge").PersistOutcome> {
  const admin = createAdminClient();
  return runPersistPreference(
    async () => {
      const { data, error } = await admin
        .from("billing_charges")
        .update({ provider_preference_id: preferenceId, payment_url: url })
        .eq("id", chargeId)
        .is("provider_preference_id", null)
        .is("creation_blocked_at", null)
        .select("id");
      if (error) {
        console.warn("cobranças: gravar Preference, tentativa falhou", chargeId, error.message);
        return false;
      }
      if (data && data.length) return true;

      // 0 linhas afetadas: ou já está salva (idempotente — repetir não é
      // falha), ou a linha travou no meio do caminho. Lê o estado atual para
      // diferenciar; nunca assume nenhum dos dois sem conferir.
      const { data: current, error: readError } = await admin
        .from("billing_charges")
        .select("provider_preference_id, creation_blocked_at")
        .eq("id", chargeId)
        .maybeSingle();
      if (readError || !current) {
        console.warn("cobranças: conferir estado após gravação sem efeito", chargeId, readError?.message);
        return false;
      }
      if (current.provider_preference_id === preferenceId) return true;
      if (current.provider_preference_id) {
        // Duas Preferences diferentes para a mesma cobrança: nunca sobrescreve
        // silenciosamente. Precisa de olhos humanos, não de mais uma tentativa.
        console.error("cobranças: duas Preferences diferentes para a mesma cobrança — não sobrescrevendo", chargeId, {
          jaSalva: current.provider_preference_id,
          recemCriada: preferenceId,
        });
        return false;
      }
      if (current.creation_blocked_at) {
        const recovered = await writeRecoveredPreference(admin, chargeId, preferenceId, url);
        if (recovered) console.warn("cobranças: resposta do Mercado Pago chegou depois do bloqueio — recuperada com segurança", chargeId);
        return recovered;
      }
      return false;
    },
    PERSIST_ATTEMPTS,
    (attempt) => new Promise((resolve) => setTimeout(resolve, persistWaitMs(attempt))),
  );
}

/**
 * Busca uma Preference pelo seu próprio id — GET /checkout/preferences/{id},
 * leitura de um recurso já conhecido, documentada e estável. Usada pela
 * reconciliação manual e por investigateBlockedCharge, nunca por uma
 * tentativa automática de CRIAR algo.
 */
interface PreferenceDetail extends Preference {
  external_reference?: string;
  items?: { unit_price?: number; quantity?: number; currency_id?: string }[];
}

async function fetchPreference(preferenceId: string): Promise<PreferenceDetail> {
  return mp<PreferenceDetail>(`/checkout/preferences/${preferenceId}`);
}

export type ReconcileResult = { ok: true; url: string } | { ok: false; error: string };

/**
 * Reconciliação manual: o administrador já confirmou no painel do Mercado
 * Pago que esta Preference existe e pertence a esta cobrança. Além da
 * referência, confere valor e moeda (checkReconciliation, create-charge.ts)
 * — uma Preference com a referência certa mas de outro valor não é
 * aceita. Nunca cria uma Preference nova.
 */
export async function reconcilePreference(chargeId: string, preferenceId: string): Promise<ReconcileResult> {
  const admin = createAdminClient();
  const { data: charge } = await admin.from("billing_charges").select("amount_cents").eq("id", chargeId).maybeSingle();
  if (!charge) return { ok: false, error: "Cobrança não encontrada." };

  let preference: PreferenceDetail;
  try {
    preference = await fetchPreference(preferenceId);
  } catch (error) {
    if (error instanceof MercadoPagoError && error.status === 404) return { ok: false, error: "Esse id de Preference não existe no Mercado Pago." };
    throw error;
  }

  const check = checkReconciliation(charge, preference, chargeId);
  if (!check.ok) return check;

  const url = testMode() ? preference.sandbox_init_point ?? preference.init_point : preference.init_point;
  if (!url) return { ok: false, error: "Essa Preference não tem link de pagamento." };

  const { error } = await admin
    .from("billing_charges")
    .update({ provider_preference_id: preference.id, payment_url: url, creation_blocked_at: null, creation_claimed_at: null })
    .eq("id", chargeId);
  if (error) return { ok: false, error: "Não foi possível salvar a reconciliação. Tente de novo." };
  return { ok: true, url };
}

/**
 * Procura Preferences desta cobrança pela referência —
 * GET /checkout/preferences/search?external_reference=, documentado pelo
 * Mercado Pago (cobre só os últimos 90 dias; create-charge.ts,
 * PREFERENCE_SEARCH_WINDOW_DAYS). `null` quando a própria consulta falha:
 * nunca confundido com "nenhuma encontrada" (classifyPreferenceSearch).
 */
interface PreferenceSearchResponse {
  elements?: { id: string }[];
  total?: number;
  next_offset?: number;
}

/** Tamanho de página pedido — folgado para o caso real (0 ou 1 Preference por referência); a paginação abaixo é só uma rede de segurança. */
const PREFERENCE_SEARCH_PAGE_LIMIT = 20;
/** Nunca mais que isto de páginas: uma referência nossa não tem motivo para precisar de tantas, e protege contra um next_offset que não avança. */
const PREFERENCE_SEARCH_MAX_PAGES = 5;

/**
 * Pagina GET /checkout/preferences/search até os elementos lidos baterem com
 * `total`, usando `limit`/`next_offset` (a documentação mostra os dois — um
 * no exemplo de uso, outro no corpo da resposta — mas não garante o
 * contrato de continuação). `null` sempre que o retrato não puder ser
 * considerado completo e confiável: erro de rede, HTTP de erro, uma página
 * vazia quando `total` ainda diz haver mais, um `next_offset` que não avança
 * (looping), ou o limite de páginas estourado sem fechar a conta. Nunca
 * avaliada com uma lista parcial — na dúvida, fecha (fail-closed).
 */
async function searchPreferencesByReference(chargeId: string): Promise<{ id: string }[] | null> {
  const all: { id: string }[] = [];
  let offset = 0;
  for (let page = 0; page < PREFERENCE_SEARCH_MAX_PAGES; page++) {
    let result: PreferenceSearchResponse;
    try {
      result = await mp<PreferenceSearchResponse>(
        `/checkout/preferences/search?external_reference=${encodeURIComponent(chargeId)}&limit=${PREFERENCE_SEARCH_PAGE_LIMIT}&offset=${offset}`,
      );
    } catch {
      return null;
    }
    const elements = result.elements ?? [];
    all.push(...elements);
    const total = result.total ?? all.length;

    if (all.length >= total) return all;
    if (elements.length === 0) return null; // total diz que falta mais, mas a página veio vazia: inconsistente.

    const nextOffset = result.next_offset;
    if (typeof nextOffset !== "number" || nextOffset <= offset) return null; // não avançou: nunca entra em loop.
    offset = nextOffset;
  }
  return null; // esgotou o limite de páginas sem fechar a conta com `total`.
}

/**
 * Se existe algum pagamento (qualquer status) para esta referência —
 * GET /v1/payments/search, o mesmo endpoint de syncByReference, aqui só
 * para saber se há algum resultado. "unknown" quando a consulta falha:
 * tratado como stay_blocked (decideInvestigation), nunca como "não achei".
 */
async function hasAnyPayment(chargeId: string): Promise<boolean | "unknown"> {
  try {
    const result = await mp<{ results?: { id: number | string }[] }>(
      `/v1/payments/search?external_reference=${encodeURIComponent(chargeId)}`,
    );
    return (result.results?.length ?? 0) > 0;
  } catch {
    return "unknown";
  }
}

/**
 * A única porta de saída de uma cobrança travada, além da reconciliação
 * manual com um id já conhecido (reconcilePreference). Nunca cria uma
 * Preference — só pesquisa, valida com checkReconciliation, e no máximo
 * recupera uma que já existe de verdade (decideInvestigation,
 * create-charge.ts, decide tudo: aqui só busca os dados e aplica).
 *
 * "safe_to_release" não libera nada sozinho — só diz que lancamentos/actions.ts
 * pode OFERECER a liberação manual (que ainda exige confirmação à parte).
 */
export async function investigateBlockedCharge(chargeId: string): Promise<InvestigationVerdict> {
  const admin = createAdminClient();
  const { data: charge } = await admin
    .from("billing_charges")
    .select("amount_cents, created_at, provider_preference_id")
    .eq("id", chargeId)
    .maybeSingle();
  if (!charge) return { verdict: "stay_blocked", reason: "Cobrança não encontrada." };
  // Já tem uma Preference de verdade: nada a investigar, e nenhuma chamada ao
  // Mercado Pago é necessária para saber que não há nada a fazer aqui.
  if (charge.provider_preference_id) return { verdict: "stay_blocked", reason: "Esta cobrança já tem uma Preference registrada." };

  const elements = await searchPreferencesByReference(chargeId);
  const searchOutcome = classifyPreferenceSearch(elements);

  let candidateCheck: import("./create-charge").ReconcileCheck | undefined;
  let candidateDetail: { id: string; url: string } | undefined;
  if (searchOutcome.kind === "candidate") {
    try {
      const detail = await fetchPreference(searchOutcome.id);
      candidateCheck = checkReconciliation(charge, detail, chargeId);
      const url = testMode() ? detail.sandbox_init_point ?? detail.init_point : detail.init_point;
      if (candidateCheck.ok && !url) {
        candidateCheck = { ok: false, error: "A Preference encontrada não tem link de pagamento." };
      } else if (candidateCheck.ok && url) {
        candidateDetail = { id: detail.id, url };
      }
    } catch (error) {
      if (!(error instanceof MercadoPagoError && error.status === 404)) throw error;
      // Apareceu na busca e sumiu entre as duas chamadas: inconclusivo, nunca "nenhuma".
      return { verdict: "stay_blocked", reason: "A Preference encontrada na busca não pôde ser lida agora. Tente de novo." };
    }
  }

  const paymentFound = searchOutcome.kind === "none" ? await hasAnyPayment(chargeId) : false;
  const withinSearchWindow = isWithinSearchWindow(charge.created_at, Date.now());

  const decision = decideInvestigation({ searchOutcome, candidateCheck, candidateDetail, paymentFound, withinSearchWindow });

  if (decision.verdict !== "recovered") return decision;

  const saved = await writeRecoveredPreference(admin, chargeId, decision.preferenceId, decision.url);
  if (!saved) return { verdict: "stay_blocked", reason: "A Preference foi encontrada e validada, mas não foi possível salvar agora. Tente de novo." };
  return decision;
}

/**
 * Libera uma cobrança travada para uma tentativa automática nova — a
 * operação de baixo nível, atomicamente guardada (nunca toca uma linha que já
 * tenha Preference). Sem chamador em lancamentos/actions.ts hoje de
 * propósito: investigateBlockedCharge nunca devolve um desfecho que
 * autorize isto — "não encontrei nada" nunca é tratado como "não existe"
 * (create-charge.ts, decideInvestigation). Fica aqui, correta e pronta, para
 * uma ferramenta de liberação deliberada e auditada que ainda não existe —
 * nunca para ser acionada por uma palavra ou id digitado sozinho.
 */
export async function releaseForRetry(chargeId: string): Promise<void> {
  const admin = createAdminClient();
  await admin
    .from("billing_charges")
    .update({ creation_blocked_at: null, creation_claimed_at: null })
    .eq("id", chargeId)
    .is("provider_preference_id", null);
}

/** O e-mail do pagador que vai na Preference: do cliente, ou o comprador de teste em modo de teste. Nenhum, o Mercado Pago pede na hora. */
export function payerEmailForCharge(clientEmail: string | null): string | null {
  if (testMode()) return payerEmailFor(process.env, clientEmail ?? "");
  return clientEmail;
}

interface Payment {
  id: number | string;
  status: string;
  status_detail?: string;
  external_reference?: string;
  transaction_amount?: number;
  currency_id?: string;
  date_approved?: string | null;
  date_created?: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Pergunta ao Mercado Pago por um pagamento e escreve o resultado — nunca o
 * contrário. Confere referência (é uma das nossas cobranças), moeda (BRL) e
 * valor (o mesmo que a cobrança guarda) antes de contar qualquer coisa: um
 * pagamento que não bate em algum desses três é registrado, mas a cobrança
 * não muda de status a partir dele. provider_payment_id é único
 * (billing_payments), então o mesmo aviso duas vezes escreve a mesma linha,
 * nunca conta duas.
 */
export async function syncPayment(paymentId: string): Promise<ChargeBucket | null> {
  const payment = await mp<Payment>(`/v1/payments/${paymentId}`);
  const reference = payment.external_reference;
  if (!reference || !UUID.test(reference)) return null;

  const admin = createAdminClient();
  const { data: charge } = await admin.from("billing_charges").select("id, amount_cents").eq("id", reference).maybeSingle();
  if (!charge) return null;

  const amountMatches = Math.round((payment.transaction_amount ?? 0) * 100) === charge.amount_cents;
  const currencyMatches = (payment.currency_id ?? "BRL") === "BRL";
  if (!amountMatches || !currencyMatches) {
    console.error("cobranças: pagamento não confere", paymentId, "referência", reference, { amountMatches, currencyMatches });
    return null;
  }

  const { error: paymentError } = await admin.from("billing_payments").upsert(
    {
      charge_id: charge.id,
      provider_payment_id: String(payment.id),
      status: paymentBucket(payment.status),
      status_detail: payment.status_detail ?? payment.status,
      amount_cents: Math.round((payment.transaction_amount ?? 0) * 100),
      created_at: payment.date_created ?? new Date().toISOString(),
    },
    { onConflict: "provider_payment_id" },
  );
  if (paymentError) {
    console.error("cobranças: histórico de pagamento", paymentError.message);
    return null;
  }

  const { data: payments } = await admin.from("billing_payments").select("status, created_at").eq("charge_id", charge.id);
  const status = chargeStatusFrom((payments ?? []) as { status: string; created_at: string }[]);
  const { error } = await admin.from("billing_charges").update({ status, updated_at: new Date().toISOString() }).eq("id", charge.id);
  if (error) throw error;
  return status;
}

/**
 * Reler agora, sem esperar o próximo aviso: procura os pagamentos desta
 * cobrança pela referência (GET /v1/payments/search) e sincroniza cada um,
 * do mais antigo ao mais novo. Usado pelo botão "Verificar status" do
 * painel — o webhook continua sendo o caminho normal.
 */
export async function syncByReference(chargeId: string): Promise<ChargeBucket | null> {
  const found = await mp<{ results?: { id: number | string }[] }>(
    `/v1/payments/search?external_reference=${encodeURIComponent(chargeId)}&sort=date_created&criteria=asc`,
  );
  let last: ChargeBucket | null = null;
  for (const result of found.results ?? []) {
    last = await syncPayment(String(result.id));
  }
  return last;
}

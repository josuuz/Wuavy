"use server";

import { redirect } from "next/navigation";

import { releases, type SubscriptionStatus } from "@/lib/flow/access";
import {
  billingReady,
  blockSubscriptionCreation,
  claimSubscriptionCreation,
  createSubscription,
  describeError,
  MercadoPagoError,
  persistSubscriptionId,
  recordSubscriptionRefusal,
  releaseSubscriptionClaim,
  runCreateSubscription,
  syncSubscription,
  testMode,
} from "@/lib/flow/billing";
import { getSession, getSubscription } from "@/lib/flow/session";
import { createAdminClient } from "@/lib/supabase/admin";

/*
  The checkout's two calls. Subscribing takes only the card token the
  Mercado Pago Brick made in the browser (never the card) and the payer's
  e-mail; who is paying comes from the verified session. The answer is what
  Mercado Pago said, read on the server. Checking reads it again. Neither
  ever tells the browser more than the six outcomes below.

  Creating is a claim, not a bare call: claimSubscriptionCreation reserves
  the row before anything reaches Mercado Pago (lib/mercadopago/
  create-subscription.ts, the same mechanism billing/charges.ts already
  proved for Cobranças), so two requests for the same row — a double click,
  a retried network call — never both call POST /preapproval. Once Mercado
  Pago answers "created", nothing after that point is ever reported as
  "rejected": either the id is saved (persistSubscriptionId, with retries)
  and the real status read back, or the row is blocked for manual
  reconciliation. A row is never deleted and never silently loses the id of
  an assinatura that may already exist at Mercado Pago.
*/

export type CheckoutOutcome =
  | "active"
  /** Ainda em andamento: nenhum erro, só esperando o Mercado Pago confirmar. */
  | "pending"
  /** O Mercado Pago recusou a criação, sincronamente: nada chegou a existir lá. */
  | "rejected"
  /** O Mercado Pago criou a assinatura e já a cancelou, sem nunca ter cobrado nada. */
  | "declined"
  /** Resultado desconhecido (rede, timeout, falha ao salvar): travado para reconciliação manual. */
  | "unresolved"
  /** Nossas credenciais ou um limite de taxa — nunca o cartão da pessoa. */
  | "unavailable";

/** The outcome, and in test mode only, why Mercado Pago refused. */
export interface Subscribed {
  outcome: CheckoutOutcome;
  detail?: string;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CARD_TOKEN = /^[\w-]{8,128}$/;

/**
 * 'cancelled' aqui nunca é a mesma coisa que a assinatura recusada na
 * criação (runCreateSubscription's "refused"): é o Mercado Pago confirmando
 * que criou a assinatura e já a cancelou — dentro do fluxo de subscribe()/
 * check(), sempre para uma linha desta própria tentativa, que nunca chegou
 * a ficar ativa (started_at nunca foi gravado). "declined", nunca
 * "rejected": a tela mostra uma frase mais cautelosa, sem afirmar que nada
 * foi cobrado com a mesma certeza de uma recusa síncrona.
 */
const outcome = (status: SubscriptionStatus | null): CheckoutOutcome =>
  releases(status) ? "active" : status === "cancelled" ? "declined" : "pending";

export async function subscribe(input: { token: string; email: string }): Promise<Subscribed> {
  const session = await getSession();
  if (!session) redirect("/pulse/entrar?depois=assinar");

  const current = await getSubscription();
  // Already paying, or already waiting on one: never a second subscription.
  if (current && releases(current.status)) return { outcome: "active" };
  if (current?.status === "pending" && current.provider_subscription_id) return { outcome: await check() };

  if (!billingReady()) return { outcome: "unavailable" };
  if (typeof input?.token !== "string" || !CARD_TOKEN.test(input.token)) return { outcome: "rejected" };
  const email = typeof input.email === "string" && EMAIL.test(input.email.trim()) ? input.email.trim() : session.user.email;
  if (!email) return { outcome: "rejected" };

  let admin;
  try {
    admin = createAdminClient();
  } catch (error) {
    console.error("subscribe:", error);
    return { outcome: "unavailable" };
  }

  // Our row first: its id goes to Mercado Pago as the reference, so every notice finds it.
  // A pending row that never reached Mercado Pago (a timeout, a block) is reused with the same key.
  const orgId = session.member?.organization_id ?? null;
  let rowId = current?.status === "pending" && !current.provider_subscription_id ? current.id : null;
  if (!rowId) {
    // Transição legada (migration 0017): só true quando a clínica já existe
    // (orgId) e NUNCA teve nenhuma linha antes — nem uma "rejected". current
    // null aqui tanto pode ser "nunca existiu nenhuma" quanto "só existe uma
    // 'rejected'" (getSubscription() exclui as duas da mesma forma); uma
    // clínica com só uma recusa não é legada — não ganha a proteção, para
    // nunca virar acesso gratuito indevido por causa de uma linha rejected.
    let legacyAccessTransition = false;
    if (orgId) {
      const { data: anyRow, error: anyRowError } = await admin.from("subscriptions").select("id").eq("organization_id", orgId);
      if (anyRowError) console.error("subscribe: checar histórico para transição legada", anyRowError);
      else legacyAccessTransition = (anyRow?.length ?? 0) === 0;
    }
    const { data, error } = await admin
      .from("subscriptions")
      .insert({ user_id: session.user.id, organization_id: orgId, status: "pending", legacy_access_transition: legacyAccessTransition })
      .select("id")
      .single();
    if (error) {
      // 23505 (unique_violation): perdeu a corrida contra outra requisição
      // simultânea da mesma pessoa (subscriptions_one_live_per_user, pré-
      // clínica, ou subscriptions_one_live_per_clinic, já com clínica —
      // migrations 0021/0020). Achado da revisão independente: sem isto, duas
      // chamadas concorrentes de quem ainda não tem clínica liam a mesma
      // ausência de assinatura, cada uma inseria e reivindicava a sua própria
      // linha, e as duas chegavam a criar uma assinatura real no Mercado
      // Pago. Nunca insere uma segunda linha: lê a que já existe e segue com
      // ela, como se tivesse sido encontrada por getSubscription() desde o
      // início.
      if (error.code === "23505") {
        const base = admin.from("subscriptions").select("id, status, provider_subscription_id").eq("user_id", session.user.id);
        // organization_id null precisa de .is(), nunca .eq(): o índice que
        // gerou esta corrida (subscriptions_one_live_per_user) é justamente
        // sobre organization_id is null, e .eq(col, null) não bate com NULL
        // no Postgres/PostgREST.
        const { data: rows, error: readError } = await (orgId ? base.eq("organization_id", orgId) : base.is("organization_id", null));
        const won = rows?.find((r) => r.status !== "cancelled" && r.status !== "rejected") ?? null;
        if (readError || !won) {
          console.error("subscribe: linha vencedora da corrida não encontrada", readError);
          return { outcome: "unavailable" };
        }
        if (releases(won.status as SubscriptionStatus)) return { outcome: "active" };
        if (won.status === "pending" && won.provider_subscription_id) return { outcome: await check() };
        rowId = won.id;
      } else {
        console.error("subscribe: row", error);
        return { outcome: "unavailable" };
      }
    } else {
      rowId = data.id;
    }
  }

  // A reserva atômica: duas requisições para a mesma linha nunca chamam
  // POST /preapproval as duas. Uma linha travada por um resultado anterior
  // incerto nunca é tentada de novo sozinha — só reconciliação manual.
  const claim = await claimSubscriptionCreation(rowId);
  if (claim === "already") return { outcome: await check() };
  if (claim === "blocked") return { outcome: "unresolved" };
  if (claim === "in_progress") return { outcome: "pending" };

  const id = rowId;
  const result = await runCreateSubscription(() => createSubscription({ reference: id, email, cardToken: input.token, backPath: "/pulse/assinar" }));

  if (result.outcome === "ours") {
    // Ours, not theirs: credentials or rate limit. Nada foi criado — libera
    // a reserva, a mesma linha pode tentar de novo depois.
    console.error("subscribe: Mercado Pago refused our credentials or rate-limited us", result.httpStatus);
    await releaseSubscriptionClaim(id);
    return { outcome: "unavailable" };
  }

  if (result.outcome === "refused") {
    // Recusado (cartão, dados): a tentativa nunca chegou a existir no
    // Mercado Pago. Marca como recusada — nunca apaga — e libera para uma
    // tentativa nova (uma linha nova).
    console.warn("subscribe: refused by Mercado Pago", result.httpStatus, JSON.stringify(result.body));
    const detail = testMode() ? describeError(new MercadoPagoError(result.httpStatus, result.body)) : undefined;
    if ((await recordSubscriptionRefusal(id, result.httpStatus, detail)) === "failed") {
      console.error("subscribe: gravar recusa não confirmou", id);
    }
    return { outcome: "rejected", detail };
  }

  if (result.outcome === "unconfirmed") {
    // Rede, timeout, 5xx: a assinatura pode já existir do lado do Mercado
    // Pago sem termos como confirmar agora. Trava para reconciliação manual
    // — nunca repete a chamada sozinha, que arriscaria uma segunda
    // assinatura recorrente.
    console.error("subscribe: Mercado Pago unreachable, resultado indeterminado", id);
    if ((await blockSubscriptionCreation(id)) === "failed") console.error("subscribe: bloqueio após resultado incerto não confirmou", id);
    return { outcome: "unresolved" };
  }

  // result.outcome === "created": o Mercado Pago criou a assinatura. A
  // partir de agora nada mais é relatado como recusa.
  const persisted = await persistSubscriptionId(id, result.providerId);
  if (persisted === "failed") {
    // O id existe no Mercado Pago (result.providerId) mas não foi possível
    // salvá-lo aqui mesmo depois de tentar: registra os dois ids juntos —
    // sem isto, uma reconciliação manual não teria como saber qual
    // assinatura, do lado do Mercado Pago, pertence a esta linha.
    console.error("subscribe: não foi possível salvar o id da assinatura", { rowId: id, providerId: result.providerId });
    if ((await blockSubscriptionCreation(id)) === "failed") console.error("subscribe: bloqueio após falha de persistência não confirmou", id);
    return { outcome: "unresolved" };
  }

  // O id já está salvo (persistSubscriptionId confirmou): uma falha aqui é
  // só a leitura de confirmação, nunca a criação. A linha continua 'pending'
  // com o id salvo — o webhook ou a próxima pergunta de check() resolve.
  try {
    return { outcome: outcome(await syncSubscription(result.providerId)) };
  } catch (error) {
    console.error("subscribe: falha ao sincronizar depois de criar", id, error);
    return { outcome: "pending" };
  }
}

/** Where the signed-in person's subscription stands, read again from Mercado Pago while it is pending. */
export async function check(): Promise<CheckoutOutcome> {
  const session = await getSession();
  if (!session) redirect("/pulse/entrar?depois=assinar");
  const current = await getSubscription();
  if (!current) return "rejected";
  // Bloqueada para reconciliação: continua "unresolved" enquanto isso não
  // for limpo (syncStanding, numa leitura confirmada) — nunca volta a
  // "pending" sozinha, por mais vezes que a página pergunte de novo.
  if (current.creation_blocked_at) return "unresolved";
  if (current.status !== "pending" || !current.provider_subscription_id) return outcome(current.status);
  try {
    return outcome(await syncSubscription(current.provider_subscription_id));
  } catch (error) {
    console.error("check: Mercado Pago", error);
    return "pending";
  }
}

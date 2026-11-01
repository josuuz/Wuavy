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
  The checkout, now hosted by Mercado Pago. subscribe() never collects a
  card: it creates (or resumes) a subscription with status "pending" and
  redirects to init_point, the page Mercado Pago itself returns. The card is
  typed there, on Mercado Pago's own domain — never on ours, not even as a
  token. check() reads what the subscription stands at now, whether the
  person just submitted the form, just returned from Mercado Pago, or is
  revisiting later.

  Creating is a claim, not a bare call: claimSubscriptionCreation reserves
  the row before anything reaches Mercado Pago (lib/mercadopago/
  create-subscription.ts, the same mechanism billing/charges.ts already
  proved for Cobranças), so two requests for the same row — a double click, a
  retried network call — never both call POST /preapproval. Once Mercado Pago
  answers "created", nothing after that point is ever reported as "rejected":
  either the id is saved (persistSubscriptionId, with retries) or the row is
  blocked for manual reconciliation. A row is never deleted and never
  silently loses the id of an assinatura that may already exist at Mercado
  Pago.

  A row that already has a provider_subscription_id but is still "pending" —
  the person started the hosted checkout and never finished it, or just came
  back and the webhook has not landed yet — is resumed, never recreated:
  Mercado Pago's own idempotency key (the row's id) makes a repeated
  POST /preapproval answer with the very same subscription and the very same
  init_point, so sending the person back there is always safe.
*/

export type CheckoutOutcome =
  | "active"
  /** Ainda em andamento: nenhum erro, só esperando o Mercado Pago confirmar. */
  | "pending"
  /** O Mercado Pago recusou a criação, sincronamente (dados da configuração, nunca o cartão: nenhum cartão existe ainda nesta etapa). */
  | "rejected"
  /** O Mercado Pago criou a assinatura e já a cancelou, sem nunca ter cobrado nada. */
  | "declined"
  /** Resultado desconhecido (rede, timeout, falha ao salvar): travado para reconciliação manual. */
  | "unresolved"
  /** Nossas credenciais ou um limite de taxa. */
  | "unavailable";

/** The outcome, and in test mode only, why Mercado Pago refused. */
export interface Subscribed {
  outcome: CheckoutOutcome;
  detail?: string;
}

/**
 * 'declined' aqui nunca é a mesma coisa que a assinatura recusada na criação
 * (runCreateSubscription's "refused"): é o Mercado Pago confirmando que
 * criou a assinatura e já a cancelou — sempre para uma linha desta própria
 * tentativa, que nunca chegou a ficar ativa (started_at nunca foi gravado).
 * "declined", nunca "rejected": a tela mostra uma frase mais cautelosa, sem
 * afirmar que nada foi cobrado com a mesma certeza de uma recusa síncrona.
 */
const outcome = (status: SubscriptionStatus | null): CheckoutOutcome =>
  releases(status) ? "active" : status === "cancelled" ? "declined" : "pending";

/**
 * O que termina uma criação (ou uma retomada): chama o Mercado Pago, trata
 * cada desfecho exatamente como subscribe() sempre tratou
 * (recusado/nosso/incerto/criado) e, só quando a assinatura existe e o
 * init_point veio, redireciona para o checkout hospedado — nunca retorna
 * nesse caminho. Retorna normalmente em qualquer outro desfecho.
 */
async function createAndRedirect(rowId: string, email: string, backPath: string): Promise<Subscribed> {
  const result = await runCreateSubscription(() => createSubscription({ reference: rowId, email, backPath }));

  if (result.outcome === "ours") {
    // Ours, not theirs: credentials or rate limit. Nada foi criado — libera
    // a reserva, a mesma linha pode tentar de novo depois.
    console.error("subscribe: Mercado Pago refused our credentials or rate-limited us", result.httpStatus);
    await releaseSubscriptionClaim(rowId);
    return { outcome: "unavailable" };
  }

  if (result.outcome === "refused") {
    // Recusado na própria configuração (payer_email, moeda, valor): a
    // tentativa nunca chegou a existir no Mercado Pago. Marca como recusada —
    // nunca apaga — e libera para uma tentativa nova (uma linha nova).
    console.warn("subscribe: refused by Mercado Pago", result.httpStatus, JSON.stringify(result.body));
    const detail = testMode() ? describeError(new MercadoPagoError(result.httpStatus, result.body)) : undefined;
    if ((await recordSubscriptionRefusal(rowId, result.httpStatus, detail)) === "failed") {
      console.error("subscribe: gravar recusa não confirmou", rowId);
    }
    return { outcome: "rejected", detail };
  }

  if (result.outcome === "unconfirmed") {
    // Rede, timeout, 5xx: a assinatura pode já existir do lado do Mercado
    // Pago sem termos como confirmar agora. Trava para reconciliação manual
    // — nunca repete a chamada sozinha, que arriscaria uma segunda
    // assinatura recorrente.
    console.error("subscribe: Mercado Pago unreachable, resultado indeterminado", rowId);
    if ((await blockSubscriptionCreation(rowId)) === "failed") console.error("subscribe: bloqueio após resultado incerto não confirmou", rowId);
    return { outcome: "unresolved" };
  }

  // result.outcome === "created": o Mercado Pago criou a assinatura. A
  // partir de agora nada mais é relatado como recusa.
  const persisted = await persistSubscriptionId(rowId, result.providerId);
  if (persisted === "failed") {
    // O id existe no Mercado Pago (result.providerId) mas não foi possível
    // salvá-lo aqui mesmo depois de tentar: registra os dois ids juntos —
    // sem isto, uma reconciliação manual não teria como saber qual
    // assinatura, do lado do Mercado Pago, pertence a esta linha.
    console.error("subscribe: não foi possível salvar o id da assinatura", { rowId, providerId: result.providerId });
    if ((await blockSubscriptionCreation(rowId)) === "failed") console.error("subscribe: bloqueio após falha de persistência não confirmou", rowId);
    return { outcome: "unresolved" };
  }

  if (!result.initPoint) {
    // O id já está salvo (persistSubscriptionId confirmou) — nunca perdido —
    // mas sem init_point não há para onde mandar a pessoa. Não devia
    // acontecer numa criação "pending" sem card_token_id; se acontecer, pede
    // para verificar de novo em vez de travar ou inventar um endereço.
    console.error("subscribe: Mercado Pago criou a assinatura sem init_point", rowId, result.providerId);
    return { outcome: "unresolved" };
  }

  redirect(result.initPoint);
}

/**
 * Retoma um checkout hospedado já criado para esta linha. Confirma o estado
 * real primeiro — nunca confia em "ainda pending" guardado sem perguntar de
 * novo ao Mercado Pago — e só quando ele de fato ainda não resolveu reemite a
 * MESMA chamada de criação (idempotente pela chave = o id desta linha) para
 * recuperar o mesmo init_point e levar a pessoa de volta.
 */
async function resumeCheckout(rowId: string, providerId: string, email: string): Promise<Subscribed> {
  let fresh: SubscriptionStatus | null;
  try {
    fresh = await syncSubscription(providerId);
  } catch (error) {
    console.error("subscribe: resync ao retomar checkout pendente", rowId, error);
    return { outcome: "pending" };
  }
  if (fresh !== "pending") return { outcome: outcome(fresh) };
  return createAndRedirect(rowId, email, "/pulse/assinar");
}

export async function subscribe(): Promise<Subscribed> {
  const session = await getSession();
  if (!session) redirect("/pulse/entrar?depois=assinar");

  const email = session.user.email;

  const current = await getSubscription();
  // Already paying, or already waiting on one: never a second subscription.
  if (current && releases(current.status)) return { outcome: "active" };
  if (current?.status === "pending" && current.provider_subscription_id) {
    if (!email) return { outcome: "rejected" };
    return resumeCheckout(current.id, current.provider_subscription_id, email);
  }

  if (!billingReady()) return { outcome: "unavailable" };
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
      // migrations 0021/0020). Nunca insere uma segunda linha: lê a que já
      // existe e segue com ela, como se tivesse sido encontrada por
      // getSubscription() desde o início.
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
        if (won.status === "pending" && won.provider_subscription_id) {
          return resumeCheckout(won.id, won.provider_subscription_id, email);
        }
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

  return createAndRedirect(rowId, email, "/pulse/assinar");
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

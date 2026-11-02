import "server-only";

import { cache } from "react";

import { createClient } from "@/lib/supabase/server";
import { asStatus, clinicAccess, needsReread, releases, standingRow, UNVERIFIED_ACCESS, type Standing } from "./access";

/**
 * A leitura das assinaturas FALHOU (coluna que não existe, queda, timeout).
 * Existe como erro, e não como uma lista vazia, porque "nenhuma assinatura" tem
 * um significado de acesso — uma clínica de antes das assinaturas mantém o uso
 * total — que uma falha jamais pode herdar. Quem lê assinaturas decide o que
 * fazer com isto, e a resposta de todos é a mesma: fechar, nunca liberar.
 */
export class SubscriptionReadError extends Error {
  constructor(detail: string) {
    super(`Não foi possível ler as assinaturas: ${detail}`);
    this.name = "SubscriptionReadError";
  }
}

/** Where an invitation is accepted (and an ended access explained). */
export const INVITE = "/clinavy/convite";

/*
  Who is signed in and which clinic they work at, verified with Supabase Auth
  (never read from a form or the URL). Every page and write of the real Clinavy
  starts here. `member` is the person's active membership: null until they
  have created their clinic or accepted an invitation, and null again once
  the owner ends their access (the database stops answering them too,
  migration 0009). `pending` is an invitation not accepted yet; `ended`, an
  access the owner disabled.
*/

export const getSession = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // Row-level security shows a person their own memberships, whatever their status.
  const { data: memberships } = await supabase
    .from("members")
    .select("organization_id, name, role, status")
    .eq("user_id", user.id);
  const rows = memberships ?? [];
  const member = rows.find((m) => m.status === "active") ?? null;
  const pending = member ? null : (rows.find((m) => m.status === "invited") ?? null);
  const ended = member || pending ? null : (rows.find((m) => m.status === "disabled") ?? null);

  return { supabase, user, member, pending, ended };
});

/**
 * De quem são as linhas: as da clínica da pessoa quando ela tem uma, e as que ela
 * pagou antes de criá-la. Os dois valores vêm da sessão verificada (members lido
 * sob RLS, auth.getUser()), nunca de um formulário ou da URL.
 */
const scopeFilter = (userId: string, organizationId: string | null | undefined) =>
  organizationId ? `organization_id.eq.${organizationId},and(user_id.eq.${userId},organization_id.is.null)` : `user_id.eq.${userId}`;

/**
 * Quantas linhas esta pessoa/clínica CRIOU nos últimos `windowMs` — TODAS, inclusive as
 * recusadas na criação ('rejected'), que getSubscriptions() exclui de propósito (nunca
 * existiram no Mercado Pago) mas que custaram uma chamada a ele. É o que limita as
 * tentativas: contar só as que existem deixaria uma sequência de e-mails recusados
 * chamar o Mercado Pago sem fim. Uma leitura que falha lança, como as demais.
 */
export async function countRecentAttempts(windowMs: number): Promise<number> {
  const session = await getSession();
  if (!session) return 0;
  const since = new Date(Date.now() - windowMs).toISOString();
  const { count, error } = await session.supabase
    .from("subscriptions")
    .select("id", { count: "exact", head: true })
    .or(scopeFilter(session.user.id, session.member?.organization_id))
    .gte("created_at", since);
  if (error) {
    console.error("countRecentAttempts: contar as tentativas", error.message);
    throw new SubscriptionReadError(error.message);
  }
  return count ?? 0;
}

/**
 * Quantas linhas de assinatura ler de uma pessoa/clínica. Na prática são
 * poucas (uma por tentativa); o limite existe só para esta consulta nunca
 * ficar sem teto, e vem com a ordem "da mais nova para a mais antiga", que é
 * a que standingRow() espera.
 */
const SUBSCRIPTION_ROWS = 200;

/**
 * Todas as assinaturas da pessoa: as da clínica dela quando já tem uma, e as
 * que ela pagou antes de criá-la. Da mais nova para a mais antiga. Só o
 * servidor escreve estas linhas (lib/flow/billing.ts); a row-level security
 * deixa a pessoa ler as suas e as da clínica.
 *
 * Todas, não só a mais recente: uma clínica tem uma linha por tentativa, e
 * quem decide o acesso é a melhor prova financeira entre elas (standingRow,
 * lib/flow/access.ts), nunca a última a nascer.
 */
export const getSubscriptions = cache(async () => {
  const session = await getSession();
  if (!session) return [];
  const org = session.member?.organization_id;
  const { data, error } = await session.supabase
    .from("subscriptions")
    .select(
      "id, status, organization_id, provider_subscription_id, payer_email, created_at, current_period_end, creation_blocked_at, legacy_access_transition, legacy_transition_cleared_at, first_payment_confirmed_at",
    )
    .or(scopeFilter(session.user.id, org))
    // 'rejected' (migration 0020) is a creation attempt that never existed at
    // Mercado Pago — never this clinic's standing. Without this filter it can
    // become the "latest" row after a real subscription (active, or
    // cancelled with a paid month still running) and asStatus() below would
    // read it back as null, which clinicAccess() treats as "no row ever" —
    // full access. Excluding it here lets the clinic's real standing (an
    // older row, or genuinely none) surface instead, for access control and
    // for check()/subscribe()'s polling alike.
    .neq("status", "rejected")
    .order("created_at", { ascending: false })
    .limit(SUBSCRIPTION_ROWS);
  // Um erro aqui (a coluna payer_email ainda não existir porque o deploy saiu
  // antes da migration 0023, uma queda, um timeout) NÃO é "nenhuma assinatura":
  // uma lista vazia lê-se como clínica de antes das assinaturas, com acesso
  // total (clinicAccess). Por isso lança, e cada consumidor fecha.
  if (error) {
    console.error("getSubscriptions: ler as assinaturas", error.message);
    throw new SubscriptionReadError(error.message);
  }
  // Uma página CHEIA pode estar escondendo linhas, e justamente a que dá acesso (um
  // mês pago ainda correndo, a transição legada) pode ser a mais antiga. Acesso não se
  // decide com uma leitura possivelmente incompleta: tratada como falha, fecha.
  if ((data?.length ?? 0) >= SUBSCRIPTION_ROWS) {
    console.error("getSubscriptions: a leitura encheu o limite", SUBSCRIPTION_ROWS);
    throw new SubscriptionReadError("mais assinaturas do que a leitura comporta");
  }
  return (data ?? []).map((row) => ({ ...row, status: asStatus(row.status) }));
});

/**
 * A tentativa em curso: a linha mais recente. É com ela que o checkout
 * trabalha — criar, retomar, perguntar de novo (assinar/actions.ts) — e é a
 * que a tela de assinatura acompanha.
 *
 * NÃO é quem decide o acesso: para isso existe getStanding(). Confundir as
 * duas foi a causa de uma clínica cair em só-consulta ao abrir o checkout e
 * desistir no Mercado Pago.
 */
type SubscriptionRow = Awaited<ReturnType<typeof getSubscriptions>>[number];

// O tipo diz a verdade: sem nenhuma linha, null. (Indexar [0] faria o TypeScript achar que sempre há uma.)
export const getSubscription = cache(async (): Promise<SubscriptionRow | null> => (await getSubscriptions())[0] ?? null);

/**
 * A linha que responde pelo acesso e pelo caminho da pessoa: a melhor prova
 * financeira entre todas as dela (standingRow, lib/flow/access.ts). Igual a
 * getSubscription() quando existe uma linha só, que é o caso comum.
 */
export const getStanding = cache(async () => standingRow(await getSubscriptions()));

/**
 * What the signed-in clinic may do (lib/flow/access.ts), from its
 * subscription. The status comes from the row the webhook keeps; when that row
 * is older than the date Mercado Pago gave for the next charge (needsReread),
 * no notice arrived and it is read back from Mercado Pago once — the safety
 * net behind a webhook that was never configured or stopped arriving. Mercado
 * Pago being unreachable keeps the stored status.
 */
export const getClinicAccess = cache(async () => {
  const session = await getSession();
  if (!session?.member) return null;
  // getStanding(), nunca getSubscription(): uma tentativa nova (pending) não
  // pode tirar o que outra linha da clínica já provou ter pago.
  try {
    return clinicAccess(await standing(await getStanding()));
  } catch (error) {
    // A leitura falhou: FECHA. Nunca cai em "sem assinatura" (acesso total).
    if (error instanceof SubscriptionReadError) return UNVERIFIED_ACCESS;
    throw error;
  }
});

/**
 * Where the subscription stands, read back from Mercado Pago only when the
 * stored row has outlived its period. The billing module is imported here and
 * not at the top of the file so that it (and its credentials) is loaded by the
 * request that actually has to ask.
 */
async function standing(subscription: Awaited<ReturnType<typeof getStanding>>): Promise<Standing> {
  const stored = {
    status: subscription?.status ?? null,
    current_period_end: subscription?.current_period_end ?? null,
    legacy_access_transition: subscription?.legacy_access_transition ?? null,
    legacy_transition_cleared_at: subscription?.legacy_transition_cleared_at ?? null,
    first_payment_confirmed_at: subscription?.first_payment_confirmed_at ?? null,
  };
  if (!subscription?.provider_subscription_id || !needsReread(subscription)) return stored;
  try {
    const { syncStanding } = await import("./billing");
    return (await syncStanding(subscription.provider_subscription_id)) ?? stored;
  } catch (error) {
    // An outage, or no credentials: the stored row stands. Never a lock-out.
    console.error("getClinicAccess: Mercado Pago", error);
    return stored;
  }
}

/**
 * Where a signed-in person belongs, by the one rule of the journey: a clinic
 * → Clinavy; paid but no clinic yet → onboarding; anyone else (a lead, a
 * payment pending or cancelled) → the demo, where "Assinar" is.
 */
export async function homePath() {
  const session = await getSession();
  if (!session) return "/clinavy/entrar";
  if (session.member) return "/clinavy/app";
  // Invited to a clinic, or their access ended: the invitation page says which, and what to do.
  if (session.pending || session.ended) return INVITE;
  // A melhor prova financeira, não a tentativa mais nova: quem já pagou e
  // abriu um checkout novo sem concluir continua indo para o onboarding.
  // Leitura que falha: sem prova, nada de onboarding — vai para a demo, que
  // não concede nada, e a tela de assinatura explica que não se confirmou.
  try {
    const subscription = await getStanding();
    return releases(subscription?.status) && !subscription?.organization_id ? "/clinavy/comecar" : "/clinavy/demo";
  } catch (error) {
    if (error instanceof SubscriptionReadError) return "/clinavy/demo";
    throw error;
  }
}

/**
 * Records a step of the signed-in person's own journey (migration 0005). A
 * note for the funnel, never a gate: it fails quietly, before or after the
 * migration exists.
 */
export async function markJourney(step: "demo" | "subscribe" | "checkout") {
  const session = await getSession();
  if (!session) return;
  const { error } = await session.supabase.rpc("pulse_mark", { step });
  if (error) console.warn("markJourney:", step, error.message);
}

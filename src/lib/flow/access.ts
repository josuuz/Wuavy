import type { BillingStatus } from "@/lib/mercadopago/notice";

/*
  What a clinic can do in Clinavy, decided here and nowhere else. Two
  things set it:

  - the demo: fictitious data; every action is simulated in the browser and
    nothing leaves it (no messages, automations, export or integrations);
  - the clinic's subscription, as the server last heard it from Mercado Pago
    (lib/flow/billing.ts): active; past_due, a late payment, which warns and
    does not lock; pending, a payment still being confirmed; cancelled.

  Pending and cancelled make Clinavy read-only: every record still shows,
  nothing can change and no data is deleted. The screens ask `canEdit` /
  `canReachOut`; the server's writes ask again (lib/flow/actions.ts), so the
  browser is never the only check.
*/

export const SUBSCRIPTION_STATUSES = ["pending", "active", "past_due", "cancelled"] as const satisfies readonly BillingStatus[];
export type SubscriptionStatus = BillingStatus;

/*
  The monthly price, in cents. One number, read by the checkout, the Mercado
  Pago subscription, the plan screens and the terms (lib/legal.ts).

  The five founding clinics keep this price, and the guarantee needs no code:
  Mercado Pago stores the amount inside each subscription and charges that one
  every month until someone changes it there. Raising PRICE here therefore
  prices new subscriptions only; the ones already running keep what they were
  created with. Honouring it is a matter of never updating the amount on an
  existing subscription — and the terms say the guarantee follows the
  subscription, so a cancelled one that comes back pays the current price.
*/
export const PRICE = 29_700;

export interface Access {
  /** Fictitious data, every action simulated. */
  isDemoMode: boolean;
  /** Payment pending or subscription cancelled: view only. */
  isReadOnly: boolean;
  /** null in the demo, and for a clinic from before subscriptions existed. */
  subscriptionStatus: SubscriptionStatus | null;
  /** Records can be created, edited and deleted (in the demo, in memory only). */
  canEdit: boolean;
  /** Effects outside Clinavy: send messages, run automations, export, integrations. */
  canReachOut: boolean;
  /**
   * Cancelled, and the month already paid for runs to this date (ISO): the
   * Clinavy works until then. null whenever that is not the case.
   */
  paidUntil: string | null;
  /** When Mercado Pago charges next, as it last said (ISO). null while there is nothing to charge. */
  nextCharge: string | null;
  /**
   * A leitura da assinatura FALHOU: não se sabe se esta clínica paga. Não é um
   * estado de assinatura (subscriptionStatus segue null) e nunca é "sem
   * assinatura": o acesso fecha, e a tela diz que não conseguiu confirmar, não
   * que a assinatura acabou. Ausente (undefined) em todo acesso decidido por uma
   * leitura que funcionou.
   */
  unverified?: boolean;
}

const FULL: Access = {
  isDemoMode: false,
  isReadOnly: false,
  subscriptionStatus: null,
  canEdit: true,
  canReachOut: true,
  paidUntil: null,
  nextCharge: null,
};

export const DEMO_ACCESS: Access = { ...FULL, isDemoMode: true, canReachOut: false };

/*
  Quando a leitura da assinatura FALHA, o acesso fecha: não edita, não age para
  fora. É o contrário do que "nenhuma linha" significa (uma clínica de antes das
  assinaturas, que mantém o uso total) e nunca pode se confundir com ele — uma
  coluna que ainda não existe, uma queda ou um timeout não dão direito a nada.
  Os registros continuam visíveis, e nada é apagado: só se espera a confirmação.
*/
export const UNVERIFIED_ACCESS: Access = { ...FULL, isReadOnly: true, canEdit: false, canReachOut: false, unverified: true };

/** O que dizer quando a assinatura não pôde ser confirmada: sem mandar assinar de novo (a pessoa pode estar em dia). */
export const UNVERIFIED_MESSAGE = "Não conseguimos confirmar a sua assinatura agora. Seus dados continuam aqui; tente de novo em instantes.";

/** Por que um acesso sem edição é negado: assinatura inativa, ou assinatura que não se conseguiu confirmar. */
export const denialMessage = (access: { unverified?: boolean }): string => (access.unverified ? UNVERIFIED_MESSAGE : READ_ONLY_MESSAGE);

/** The statuses that open the real Clinavy: onboarding, writes, automations. */
export const releases = (status: SubscriptionStatus | null | undefined) => status === "active" || status === "past_due";

/** A status from the database, or null when the value is not one. */
export function asStatus(value: string | null | undefined): SubscriptionStatus | null {
  return (SUBSCRIPTION_STATUSES as readonly string[]).includes(value ?? "") ? (value as SubscriptionStatus) : null;
}

/** What a subscription row says, as little of it as access needs. */
export interface Standing {
  status: SubscriptionStatus | null;
  current_period_end: string | null;
  /**
   * Set once, at insert (lib/flow/session.ts isLegacyTransition), only for the
   * one row created when a clinic that already exists starts its very first
   * subscription attempt — never for a brand-new sign-up (no clinic yet),
   * never for a resubscription after a rejected or cancelled row (migration
   * 0017). Keeps clinicAccess at full use while that one attempt is still
   * pending or blocked for reconciliation, so starting a real checkout never
   * itself causes the one downgrade this column exists to prevent.
   */
  legacy_access_transition?: boolean | null;
  /**
   * Set once by syncStanding, on real evidence of an approved charge
   * (migration 0017) — never cleared, never inferred from status. The
   * protection below ends here and stays ended even after a later
   * cancellation: once a real payment ever happened, what comes after is an
   * ordinary cancelled subscription, read by paidThrough like any other, not
   * the legacy exception again.
   */
  first_payment_confirmed_at?: string | null;
  /**
   * An administrative decision, made by hand against the database, to end
   * the transition's protection without a confirmed charge (migration 0017).
   * The other way this protection ends — never a timeout, never a guess.
   */
  legacy_transition_cleared_at?: string | null;
}

/**
 * Cancelled, and the month already paid for has not run out: the terms say a
 * cancellation stops the charges that follow, not the month already charged,
 * so Clinavy keeps working to that date. No date is nothing to honour.
 */
export function paidThrough(subscription: Standing | null, now: Date = new Date()): string | null {
  if (subscription?.status !== "cancelled" || !subscription.current_period_end) return null;
  const until = Date.parse(subscription.current_period_end);
  return Number.isFinite(until) && until > now.getTime() ? subscription.current_period_end : null;
}

/**
 * A real clinic's access, from its subscription. A clinic from before
 * subscriptions (no row) keeps full use, as it had. A cancelled subscription
 * keeps it too until the month already paid for ends (paidThrough) — the
 * status still says cancelled, so the screens keep saying so.
 */
export function clinicAccess(subscription: Standing | null, now: Date = new Date()): Access {
  const status = subscription?.status ?? null;
  if (!status) return FULL;
  const nextCharge = subscription?.current_period_end ?? null;
  if (releases(status)) return { ...FULL, subscriptionStatus: status, nextCharge };
  if (subscription?.legacy_access_transition && !subscription.legacy_transition_cleared_at && !subscription.first_payment_confirmed_at) {
    return { ...FULL, subscriptionStatus: status };
  }
  const paidUntil = paidThrough(subscription, now);
  if (paidUntil) return { ...FULL, subscriptionStatus: status, paidUntil, nextCharge: null };
  return { ...FULL, subscriptionStatus: status, isReadOnly: true, canEdit: false, canReachOut: false, nextCharge: null };
}

/*
  Uma clínica tem UMA linha por tentativa, não uma só. As migrations 0020/0021
  só impedem duas assinaturas VIVAS ao mesmo tempo, e nem 'cancelled' nem
  'rejected' contam como vivas — então uma tentativa nova (pending) nasce ao
  lado de uma assinatura cancelada cujo mês já pago ainda corre. Por isso "a
  linha mais recente" nunca pode ser a resposta para o que a clínica pode
  fazer: era isso que fazia uma clínica perder o acesso só por abrir o checkout
  e desistir no Mercado Pago (achado desta investigação).

  O que decide o acesso é a melhor PROVA FINANCEIRA entre as linhas, nunca a
  mais nova. E nenhum dos critérios abaixo inventa acesso: os três primeiros
  exigem uma prova que só o Mercado Pago escreve (syncStanding), e uma clínica
  nova sem pagamento nenhum cai sempre no último caso, a sua própria tentativa.
*/

/**
 * A linha que responde pelo acesso da clínica, entre todas as dela. `rows` vem
 * da mais nova para a mais antiga, já sem as 'rejected' (que nunca existiram
 * no Mercado Pago).
 *
 * Na ordem:
 *
 * 1. uma que libera (active/past_due) — escrita só a partir do que o Mercado
 *    Pago respondeu, nunca de um palpite;
 * 2. uma cancelada cujo mês já pago ainda corre (paidThrough) — a data vem de
 *    uma cobrança CONFIRMADA (paidPeriodEnd), e vale a que vai mais longe;
 * 3. a proteção de transição legada, enquanto ela vale (migration 0017);
 * 4. não havendo nenhuma das três, a mais recente: é a tentativa em curso, e é
 *    ela que a tela de checkout está acompanhando.
 */
export function standingRow<T extends Standing>(rows: readonly T[], now: Date = new Date()): T | null {
  if (!rows.length) return null;

  const releasing = rows.find((row) => releases(row.status));
  if (releasing) return releasing;

  // O mês já pago que vai mais longe: duas canceladas podem coexistir, e
  // honrar a de período menor tiraria dias que a clínica já pagou.
  let furthest: { row: T; until: number } | null = null;
  for (const row of rows) {
    const until = paidThrough(row, now);
    if (!until) continue;
    const at = Date.parse(until);
    if (!furthest || at > furthest.until) furthest = { row, until: at };
  }
  if (furthest) return furthest.row;

  // A proteção da transição legada acaba quando QUALQUER linha da clínica provou
  // pagamento, não só a legada: uma clínica que pagou numa linha nova, cancelou e
  // teve o mês vencido não volta ao uso total por causa de uma linha legada
  // cancelada que nunca cobrou (achado da revisão de banco).
  const everPaid = rows.some((row) => Boolean(row.first_payment_confirmed_at));
  const legacy = everPaid
    ? undefined
    : rows.find((row) => row.legacy_access_transition && !row.legacy_transition_cleared_at && !row.first_payment_confirmed_at);
  if (legacy) return legacy;

  return rows[0];
}

/*
  The webhook is how a subscription's status changes: Mercado Pago charges the
  card, says so, and the status is written from its answer. But a webhook that
  was never configured, or was removed, fails silently in the one direction
  that costs money — a subscription cancelled at Mercado Pago would keep the
  Clinavy open forever, because nothing would ever come to say otherwise.

  So the stored status has a shelf life. current_period_end is the date Mercado
  Pago said it would charge next; a few days past it with nothing new written
  means no notice arrived, and the status is read back from Mercado Pago once
  (lib/flow/session.ts). Reading it writes a fresh date, so this asks again at
  most once per period, never once per page. Mercado Pago being unreachable
  keeps the stored status: a clinic that pays is never locked out by an outage.
*/

/** Days past the next charge's date before the stored status is read back. */
export const GRACE_DAYS = 3;

/**
 * The stored status can no longer be taken at its word. Only for a status that
 * opens Clinavy: a pending or cancelled one already shows the least, and
 * re-reading it would change nothing. No date (a subscription that never
 * charged, a clinic from before subscriptions) is nothing to go on.
 */
export function needsReread(
  subscription: { status: SubscriptionStatus | null; current_period_end: string | null },
  now: Date = new Date(),
): boolean {
  if (!releases(subscription.status) || !subscription.current_period_end) return false;
  const due = Date.parse(subscription.current_period_end);
  return Number.isFinite(due) && now.getTime() - due > GRACE_DAYS * 86_400_000;
}

/** What a write answers when Clinavy is read-only. */
export const READ_ONLY_MESSAGE = "A assinatura do Clinavy não está ativa. Assine para voltar a criar e editar.";

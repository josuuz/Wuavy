import type { BillingStatus } from "@/lib/mercadopago/notice";

/*
  What a clinic can do in the Pulse, decided here and nowhere else. Two
  things set it:

  - the demo: fictitious data; every action is simulated in the browser and
    nothing leaves it (no messages, automations, export or integrations);
  - the clinic's subscription, as the server last heard it from Mercado Pago
    (lib/flow/billing.ts): active; past_due, a late payment, which warns and
    does not lock; pending, a payment still being confirmed; cancelled.

  Pending and cancelled make the Pulse read-only: every record still shows,
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
  /** Effects outside the Pulse: send messages, run automations, export, integrations. */
  canReachOut: boolean;
  /**
   * Cancelled, and the month already paid for runs to this date (ISO): the
   * Pulse works until then. null whenever that is not the case.
   */
  paidUntil: string | null;
  /** When Mercado Pago charges next, as it last said (ISO). null while there is nothing to charge. */
  nextCharge: string | null;
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

/** The statuses that open the real Pulse: onboarding, writes, automations. */
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
 * so the Pulse keeps working to that date. No date is nothing to honour.
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
  The webhook is how a subscription's status changes: Mercado Pago charges the
  card, says so, and the status is written from its answer. But a webhook that
  was never configured, or was removed, fails silently in the one direction
  that costs money — a subscription cancelled at Mercado Pago would keep the
  Pulse open forever, because nothing would ever come to say otherwise.

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
 * opens the Pulse: a pending or cancelled one already shows the least, and
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

/** What a write answers when the Pulse is read-only. */
export const READ_ONLY_MESSAGE = "A assinatura do Pulse não está ativa. Assine para voltar a criar e editar.";

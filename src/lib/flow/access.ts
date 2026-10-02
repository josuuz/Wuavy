/*
  What a clinic can do in the Pulse, decided here and nowhere else. Three
  things set it:

  - the demo: fictitious data; every action is simulated in the browser and
    nothing leaves it (no messages, automations, export or integrations);
  - the trial: a real clinic using the Pulse in full until trialEndsAt;
  - the subscription status, the commercial state the trial turns into.

  A trial that ended, or a subscription that was canceled, makes the Pulse
  read-only: every record still shows, nothing can change, and no data is
  deleted. It is kept for RETENTION_DAYS after that; nothing removes it yet.
  The screens ask `canEdit` / `canReachOut`; the server's writes ask again
  (lib/flow/actions.ts), so the browser is never the only check.
*/

export const SUBSCRIPTION_STATUSES = ["trial", "active", "past_due", "canceled"] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

/** How long an ended trial's data is kept before it may be removed. */
export const RETENTION_DAYS = 30;

/** The monthly price, in cents: what the revenue the Pulse brings back is measured against. */
export const PRICE = 29_700;

/** The clinic's commercial record (organizations: subscription_status, trial_*). */
export interface Subscription {
  status: SubscriptionStatus;
  trialStartedAt?: string;
  trialEndsAt?: string;
}

export interface Access {
  /** Fictitious data, every action simulated. */
  isDemoMode: boolean;
  /** A real clinic inside its trial. */
  isTrial: boolean;
  /** Trial over or subscription canceled: view only. */
  isReadOnly: boolean;
  /** null in the demo, and for a clinic from before subscriptions existed. */
  subscriptionStatus: SubscriptionStatus | null;
  trialEndsAt: string | null;
  /** Days left in the trial, counting the one under way: 1 on its last day. */
  trialDaysLeft: number | null;
  /** Until when an ended trial's data is kept. */
  retainedUntil: string | null;
  /** Records can be created, edited and deleted (in the demo, in memory only). */
  canEdit: boolean;
  /** Effects outside the Pulse: send messages, run automations, export, integrations. */
  canReachOut: boolean;
}

const DAY = 86_400_000;

const FULL: Access = {
  isDemoMode: false,
  isTrial: false,
  isReadOnly: false,
  subscriptionStatus: null,
  trialEndsAt: null,
  trialDaysLeft: null,
  retainedUntil: null,
  canEdit: true,
  canReachOut: true,
};

export const DEMO_ACCESS: Access = { ...FULL, isDemoMode: true, canReachOut: false };

const addDays = (iso: string, days: number) => new Date(Date.parse(iso) + days * DAY).toISOString();

/**
 * A real clinic's access at `now` (an ISO instant). Without a subscription
 * record (the database from before trials) the clinic keeps full use, as it
 * had. past_due keeps it too: a late payment warns, it does not lock.
 */
export function clinicAccess(subscription: Subscription | null, now: string): Access {
  if (!subscription) return FULL;
  const { status, trialEndsAt } = subscription;
  const access: Access = { ...FULL, subscriptionStatus: status, trialEndsAt: trialEndsAt ?? null };

  const trialOver = status === "trial" && trialEndsAt !== undefined && Date.parse(trialEndsAt) <= Date.parse(now);
  if (trialOver || status === "canceled") {
    // A cancellation's date isn't recorded yet, so only a trial's end can start the count.
    const retainedUntil = trialOver ? addDays(trialEndsAt!, RETENTION_DAYS) : null;
    return { ...access, isReadOnly: true, canEdit: false, canReachOut: false, retainedUntil };
  }
  if (status === "trial") {
    const left = trialEndsAt ? Math.ceil((Date.parse(trialEndsAt) - Date.parse(now)) / DAY) : null;
    return { ...access, isTrial: true, trialDaysLeft: left };
  }
  return access;
}

/** The commercial columns of an organizations row, when the database has them (migration 0003). */
export interface SubscriptionColumns {
  subscription_status?: string | null;
  trial_started_at?: string | null;
  trial_ends_at?: string | null;
}

export function subscriptionOf(row: object): Subscription | null {
  const { subscription_status: status, trial_started_at, trial_ends_at } = row as SubscriptionColumns;
  if (!status || !(SUBSCRIPTION_STATUSES as readonly string[]).includes(status)) return null;
  const iso = (value: string | null | undefined) => (value ? new Date(value).toISOString() : undefined);
  return { status: status as SubscriptionStatus, trialStartedAt: iso(trial_started_at), trialEndsAt: iso(trial_ends_at) };
}

/** What a write answers when the Pulse is read-only. */
export const READ_ONLY_MESSAGE = "Seu período de teste terminou. Ative o Pulse para voltar a criar e editar.";

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

export const SUBSCRIPTION_STATUSES = ["pending", "active", "past_due", "cancelled"] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

/** The monthly price, in cents. */
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
}

const FULL: Access = {
  isDemoMode: false,
  isReadOnly: false,
  subscriptionStatus: null,
  canEdit: true,
  canReachOut: true,
};

export const DEMO_ACCESS: Access = { ...FULL, isDemoMode: true, canReachOut: false };

/** The statuses that open the real Pulse: onboarding, writes, automations. */
export const releases = (status: SubscriptionStatus | null | undefined) => status === "active" || status === "past_due";

/** A status from the database, or null when the value is not one. */
export function asStatus(value: string | null | undefined): SubscriptionStatus | null {
  return (SUBSCRIPTION_STATUSES as readonly string[]).includes(value ?? "") ? (value as SubscriptionStatus) : null;
}

/**
 * A real clinic's access, from its subscription's status. A clinic from
 * before subscriptions (no row) keeps full use, as it had.
 */
export function clinicAccess(status: SubscriptionStatus | null): Access {
  if (!status) return FULL;
  if (releases(status)) return { ...FULL, subscriptionStatus: status };
  return { ...FULL, subscriptionStatus: status, isReadOnly: true, canEdit: false, canReachOut: false };
}

/** What a write answers when the Pulse is read-only. */
export const READ_ONLY_MESSAGE = "A assinatura do Pulse não está ativa. Assine para voltar a criar e editar.";

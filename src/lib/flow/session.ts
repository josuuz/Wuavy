import "server-only";

import { cache } from "react";

import { createClient } from "@/lib/supabase/server";
import { asStatus, clinicAccess, needsReread, releases, type Standing } from "./access";

/** Where an invitation is accepted (and an ended access explained). */
export const INVITE = "/pulse/convite";

/*
  Who is signed in and which clinic they work at, verified with Supabase Auth
  (never read from a form or the URL). Every page and write of the real Pulse
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
 * The signed-in person's latest subscription: their clinic's once they have
 * one, otherwise the one they paid for before creating it. Only the server
 * writes these rows (lib/flow/billing.ts); row-level security lets a person
 * read their own and their clinic's.
 */
export const getSubscription = cache(async () => {
  const session = await getSession();
  if (!session) return null;
  const org = session.member?.organization_id;
  const { data } = await session.supabase
    .from("subscriptions")
    .select(
      "id, status, organization_id, provider_subscription_id, current_period_end, creation_blocked_at, legacy_access_transition, legacy_transition_cleared_at, first_payment_confirmed_at",
    )
    .or(org ? `organization_id.eq.${org},and(user_id.eq.${session.user.id},organization_id.is.null)` : `user_id.eq.${session.user.id}`)
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
    .limit(1)
    .maybeSingle();
  return data ? { ...data, status: asStatus(data.status) } : null;
});

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
  const subscription = await getSubscription();
  return clinicAccess(await standing(subscription));
});

/**
 * Where the subscription stands, read back from Mercado Pago only when the
 * stored row has outlived its period. The billing module is imported here and
 * not at the top of the file so that it (and its credentials) is loaded by the
 * request that actually has to ask.
 */
async function standing(subscription: Awaited<ReturnType<typeof getSubscription>>): Promise<Standing> {
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
 * → the Pulse; paid but no clinic yet → onboarding; anyone else (a lead, a
 * payment pending or cancelled) → the demo, where "Assinar" is.
 */
export async function homePath() {
  const session = await getSession();
  if (!session) return "/pulse/entrar";
  if (session.member) return "/pulse/app";
  // Invited to a clinic, or their access ended: the invitation page says which, and what to do.
  if (session.pending || session.ended) return INVITE;
  const subscription = await getSubscription();
  return releases(subscription?.status) && !subscription?.organization_id ? "/pulse/comecar" : "/pulse/demo";
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

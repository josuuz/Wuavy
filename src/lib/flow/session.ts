import "server-only";

import { cache } from "react";

import { createClient } from "@/lib/supabase/server";
import { asStatus, clinicAccess, releases } from "./access";

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
    .select("id, status, organization_id, provider_subscription_id, current_period_end")
    .or(org ? `organization_id.eq.${org},and(user_id.eq.${session.user.id},organization_id.is.null)` : `user_id.eq.${session.user.id}`)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? { ...data, status: asStatus(data.status) } : null;
});

/** What the signed-in clinic may do (lib/flow/access.ts), from its subscription. */
export const getClinicAccess = cache(async () => {
  const session = await getSession();
  if (!session?.member) return null;
  const subscription = await getSubscription();
  return clinicAccess(subscription?.status ?? null);
});

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

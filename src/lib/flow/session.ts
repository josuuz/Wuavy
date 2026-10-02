import "server-only";

import { cache } from "react";

import { createClient } from "@/lib/supabase/server";
import { asStatus, clinicAccess } from "./access";

/*
  Who is signed in and which clinic they work at, verified with Supabase Auth
  (never read from a form or the URL). Every page and write of the real Pulse
  starts here. `member` is null until the person has created their clinic.
*/

export const getSession = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // Row-level security only shows the memberships of this user.
  const { data: member } = await supabase
    .from("members")
    .select("organization_id, name, role")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  return { supabase, user, member };
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

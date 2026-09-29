import "server-only";

import { cache } from "react";

import { createClient } from "@/lib/supabase/server";

/*
  Who is signed in and which clinic they work at, verified with Supabase Auth
  (never read from a form or the URL). Every page and write of the real Flow
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

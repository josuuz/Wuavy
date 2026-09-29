import "server-only";

import { createClient } from "@supabase/supabase-js";

import type { Database } from "./database.types";

/*
  The service-role client: it bypasses row-level security. Used for one thing,
  creating a clinic and its first member (the schema lets no user insert those
  rows). The key has no NEXT_PUBLIC_ prefix and this module is server-only, so
  it never reaches a browser bundle.
*/

export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  return createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

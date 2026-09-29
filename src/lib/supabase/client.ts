import { createBrowserClient } from "@supabase/ssr";

import type { Database } from "./database.types";

/*
  The browser's client, with the publishable key only. It signs people in and
  out (the session lands in cookies the server reads); every read and write of
  clinic data goes through the server, under the same row-level security.
*/

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}

/**
 * For the password-reset page: the recovery link's code is exchanged by the
 * page itself, not detected silently on load, so a used or expired link can
 * be told apart and explained. Same cookies, so the session is the same.
 */
export function createRecoveryClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { isSingleton: false, auth: { detectSessionInUrl: false } },
  );
}

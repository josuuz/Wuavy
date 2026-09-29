import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import type { Database } from "./database.types";

/*
  The server's client for one request: the signed-in user's session from the
  cookies, the publishable key, so row-level security applies to every query.
  Create one per request, never share it.
*/

export async function createClient() {
  const store = await cookies();
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => store.getAll(),
        setAll(list) {
          try {
            list.forEach(({ name, value, options }) => store.set(name, value, options));
          } catch {
            // A Server Component can't write cookies; src/proxy.ts refreshes the session instead.
          }
        },
      },
    },
  );
}

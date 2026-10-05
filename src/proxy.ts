import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/*
  Keeps the Supabase session fresh on the Pulse's signed-in routes: an expired
  access token is refreshed here and the new cookies go out with the response
  (Server Components can read cookies but not write them). The marketing site
  never passes through it.
*/

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(list, headers) {
          list.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
          Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
        },
      },
    },
  );

  // Validates the session and refreshes it when needed. Nothing may run between this and the return.
  await supabase.auth.getClaims();

  return response;
}

export const config = {
  matcher: ["/pulse/app/:path*", "/pulse/demo/:path*", "/pulse/entrar", "/pulse/comecar", "/pulse/assinar"],
};

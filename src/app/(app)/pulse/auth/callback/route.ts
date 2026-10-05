import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";

/*
  Where the confirmation email lands: Supabase sends the person back with a
  one-time code, exchanged here for a session (the cookies go out with the
  redirect). Then on to where they were going when they signed up: the
  checkout, or the Pulse, which sends each person where they belong (the
  demo, onboarding or their clinic). Fixed destinations, so the link can't
  be turned into a redirect elsewhere.
*/

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const to = data.user?.user_metadata?.source === "checkout" ? "/pulse/assinar" : "/pulse/app";
      return NextResponse.redirect(new URL(to, request.url));
    }
  }
  return NextResponse.redirect(new URL("/pulse/entrar?erro=link", request.url));
}

import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";

/*
  Where the confirmation email lands: Supabase sends the person back with a
  one-time code, exchanged here for a session (the cookies go out with the
  redirect). Then on to creating the clinic; a fixed destination, so the link
  can't be turned into a redirect elsewhere.
*/

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL("/flow/comecar", request.url));
  }
  return NextResponse.redirect(new URL("/flow/entrar?erro=link", request.url));
}

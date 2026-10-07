import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { LOCALE_COOKIE, localizePath, PT_PREFIX, resolveLocale } from "@/i18n/config";

/*
  Two jobs, on separate paths.

  The public site: rendered once per language (app/(site)/[locale]). pt-BR
  keeps the plain addresses, pt-PT lives under /pt-pt; both are indexable and
  each is rewritten here to its render. Order: a /pt-pt address is always
  pt-PT; a plain address follows the manual choice (cookie), else the
  country (Vercel's x-vercel-ip-country: Portugal → /pt-pt), else pt-BR.
  Crawlers are never redirected by country. Unknown addresses land inside
  their language too, so the 404 wears the right header and footer.

  The Pulse's signed-in routes: the Supabase session is kept fresh. An expired
  access token is refreshed here and the new cookies go out with the response
  (Server Components can read cookies but not write them). The rest of the
  Pulse app passes through untouched.
*/

const PULSE_SESSION = /^\/pulse\/(?:(?:app|demo)(?:\/.*)?|entrar|comecar|assinar|convite)$/;
const PULSE_APP = /^\/pulse\/./;
// pt-PT's public addresses, exactly as written.
const PT_SPACE = new RegExp(`^${PT_PREFIX}(?=/|$)`);
// Any other spelling of a language segment (/pt-PT, /pt-BR…): one address per page.
const LOCALE_SEGMENT = /^\/(pt-br|pt-pt)(?=\/|$)/i;
// Crawlers read each address as it is: never sent elsewhere by country.
const CRAWLER = /bot|crawl|spider|slurp|facebookexternalhit|embedly|preview|lighthouse/i;

function localize(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;
  const url = request.nextUrl.clone();

  // 1. A pt-PT address is pt-PT, whatever the cookie or the country says.
  if (PT_SPACE.test(pathname)) {
    url.pathname = `/pt-PT${pathname.slice(PT_PREFIX.length)}`;
    return NextResponse.rewrite(url);
  }

  const segment = LOCALE_SEGMENT.exec(pathname);
  if (segment) {
    const rest = pathname.slice(segment[0].length);
    url.pathname = segment[1].toLowerCase() === "pt-pt" ? `${PT_PREFIX}${rest}` : rest || "/";
    return NextResponse.redirect(url, 308);
  }

  // 2–4. A plain address: the manual choice, else Portugal → pt-PT, else pt-BR.
  const crawler = CRAWLER.test(request.headers.get("user-agent") ?? "");
  const country = crawler ? null : request.headers.get("x-vercel-ip-country");
  const locale = resolveLocale(request.cookies.get(LOCALE_COOKIE)?.value, country);
  if (locale === "pt-PT") {
    url.pathname = localizePath("pt-PT", pathname);
    return NextResponse.redirect(url, 307);
  }
  url.pathname = `/pt-BR${pathname === "/" ? "" : pathname}`;
  return NextResponse.rewrite(url);
}

async function refreshSession(request: NextRequest): Promise<NextResponse> {
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

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PULSE_SESSION.test(pathname)) return refreshSession(request);
  if (PULSE_APP.test(pathname)) return NextResponse.next();
  return localize(request);
}

export const config = {
  // Everything but the API, Next's own files, files with an extension and the share image.
  matcher: ["/((?!api/|_next/|_vercel/|opengraph-image|.*\\..*).*)"],
};

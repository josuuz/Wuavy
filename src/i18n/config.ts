/*
  The public site speaks pt-BR and pt-PT: one interface, one dictionary per
  locale (src/i18n/dictionaries). pt-BR keeps the plain addresses (/termos);
  pt-PT lives under /pt-pt (/pt-pt/termos). Both are static renders of
  app/(site)/[locale]; the proxy maps the public address to the segment and
  sends a visitor to their language by cookie (manual choice) or country.
  The Pulse app (/pulse/…) is pt-BR only and never localized. This file is
  light on purpose: client components and the proxy import it.
*/

export const locales = ["pt-BR", "pt-PT"] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "pt-BR";

/** The visitor's manual choice. Set only by the language switch; a year long. */
export const LOCALE_COOKIE = "wuavy-locale";
export const LOCALE_MAX_AGE = 60 * 60 * 24 * 365;

/** Where pt-PT's addresses start. */
export const PT_PREFIX = "/pt-pt";

export const isLocale = (value: unknown): value is Locale => locales.includes(value as Locale);

/** Open Graph wants an underscore. */
export const ogLocale = (locale: Locale) => locale.replace("-", "_");

/**
 * The language a plain (pt-BR) address should be served in: the manual
 * choice first, then the country (Portugal gets pt-PT), then pt-BR.
 */
export function resolveLocale(cookie: string | undefined, country: string | null): Locale {
  if (isLocale(cookie)) return cookie;
  return country?.toUpperCase() === "PT" ? "pt-PT" : defaultLocale;
}

const PULSE_APP = /^\/pulse\/./;

/** A site address in `locale`. Hashes, external links and the Pulse app stay as they are. */
export function localizePath(locale: Locale, href: string): string {
  if (locale === defaultLocale || !href.startsWith("/") || PULSE_APP.test(href)) return href;
  if (href === "/") return PT_PREFIX;
  if (href.startsWith("/#")) return PT_PREFIX + href.slice(1);
  return PT_PREFIX + href;
}

/** A browser path, split into its language and its plain (pt-BR) address. */
export function splitPath(pathname: string): { locale: Locale; path: string } {
  if (pathname === PT_PREFIX || pathname.startsWith(`${PT_PREFIX}/`)) {
    return { locale: "pt-PT", path: pathname.slice(PT_PREFIX.length) || "/" };
  }
  return { locale: defaultLocale, path: pathname };
}

/** Canonical and hreflang for a page, from its plain address. */
export function pageAlternates(locale: Locale, path: string) {
  return {
    canonical: localizePath(locale, path),
    languages: {
      "pt-BR": path,
      "pt-PT": localizePath("pt-PT", path),
      "x-default": path,
    },
  };
}

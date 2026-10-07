import type { Metadata } from "next";

import { LocalizedNotFound } from "@/components/sections/LocalizedNotFound";
import { defaultLocale, locales } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";

/*
  A site address that does not exist. The proxy rewrites it into the
  visitor's language, so the layout around this (header, footer) already
  speaks it; the body picks its words from the same segment.
*/

export const metadata: Metadata = {
  title: getDictionary(defaultLocale).notFound.meta,
  robots: { index: false },
};

export default function SiteNotFound() {
  const words = Object.fromEntries(locales.map((l) => [l, getDictionary(l).notFound]));
  return <LocalizedNotFound words={words} />;
}

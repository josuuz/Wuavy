import "server-only";

import { site, whatsapp } from "@/data/site";
import { localizePath, type Locale } from "@/i18n/config";
import { getDictionary, talkHref } from "@/i18n/dictionaries";
import type { LegalContext } from "@/i18n/types";
import { PRICE } from "@/lib/flow/access";
import { brl } from "@/lib/flow/format";

/** The facts a legal page states (contact, price), so its text never hardcodes them. */
export function legalContext(locale: Locale, topic: "privacy" | "terms"): LegalContext {
  const email = site.contact.channels.find((c) => c.kind === "email");
  return {
    email: email?.kind === "email" ? email.address : "",
    whatsapp: whatsapp.number,
    talk: talkHref(locale, getDictionary(locale).contact.topics[topic]),
    price: brl(PRICE),
    privacyHref: localizePath(locale, "/privacidade"),
  };
}

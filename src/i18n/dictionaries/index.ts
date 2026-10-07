import "server-only";

import { site } from "@/data/site";
import { contactHref } from "@/lib/contact";
import type { ContactChannel } from "@/lib/types";
import type { LanguageSwitchProps } from "@/components/layout/LocaleSwitch";
import { locales, type Locale } from "../config";
import { ptBR } from "./pt-BR";
import { ptPT } from "./pt-PT";

/*
  Server only: the dictionaries never reach the browser. A client component
  gets just the words it shows, as props from its server parent.
*/

export type Dictionary = typeof ptBR;

const dictionaries: Record<Locale, Dictionary> = { "pt-BR": ptBR, "pt-PT": ptPT };

export const getDictionary = (locale: Locale): Dictionary => dictionaries[locale];

/** What the language switch shows, from a page in `locale`. */
export function languageSwitch(locale: Locale): LanguageSwitchProps {
  const { ui } = dictionaries[locale];
  return { current: locale, label: ui.language, options: locales.map((l) => ({ locale: l, ...ui.languages[l] })) };
}

/** The site's contact channels, with the WhatsApp message in the visitor's language. */
export function contactChannels(locale: Locale): ContactChannel[] {
  const message = dictionaries[locale].contact.whatsapp;
  return site.contact.channels.map((c) => (c.kind === "whatsapp" ? { ...c, message } : c));
}

/** A link to the primary channel (WhatsApp), the message in the visitor's language. */
export function talkHref(locale: Locale, topic?: string): string {
  const primary = contactChannels(locale).find((c) => c.kind === site.contact.primary.kind) ?? site.contact.primary;
  return contactHref(primary, topic);
}

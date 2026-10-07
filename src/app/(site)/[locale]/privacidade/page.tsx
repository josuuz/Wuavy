import type { Metadata } from "next";

import { LegalArticle } from "@/components/sections/LegalArticle";
import { isLocale, localizePath, ogLocale, pageAlternates } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { legalContext } from "@/lib/legal";

/*
  The privacy policy (LGPD), for the site and for Wuavy Pulse: what is
  collected, why, who else handles it, and how to ask for access, a copy or
  deletion. Kept to what the system really does. The text is the
  dictionaries' legal.privacy.
*/

export async function generateMetadata({ params }: PageProps<"/[locale]/privacidade">): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const doc = getDictionary(locale).legal.privacy(legalContext(locale, "privacy"));
  const { metaTitle: title, metaDescription: description } = doc;
  return {
    title,
    description,
    alternates: pageAlternates(locale, "/privacidade"),
    openGraph: { title, description, url: localizePath(locale, "/privacidade"), locale: ogLocale(locale) },
  };
}

export default async function PrivacyPage({ params }: PageProps<"/[locale]/privacidade">) {
  const { locale } = await params;
  if (!isLocale(locale)) return null;
  return <LegalArticle id="privacidade" doc={getDictionary(locale).legal.privacy(legalContext(locale, "privacy"))} />;
}

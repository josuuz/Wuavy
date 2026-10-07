import type { Metadata } from "next";

import { LegalArticle } from "@/components/sections/LegalArticle";
import { isLocale, localizePath, ogLocale, pageAlternates } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { legalContext } from "@/lib/legal";

/*
  The terms of use of Wuavy Pulse: what the service is, the plan, fair use,
  and what it does not promise. The text is the dictionaries' legal.terms.
*/

export async function generateMetadata({ params }: PageProps<"/[locale]/termos">): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const doc = getDictionary(locale).legal.terms(legalContext(locale, "terms"));
  const { metaTitle: title, metaDescription: description } = doc;
  return {
    title,
    description,
    alternates: pageAlternates(locale, "/termos"),
    openGraph: { title, description, url: localizePath(locale, "/termos"), locale: ogLocale(locale) },
  };
}

export default async function TermsPage({ params }: PageProps<"/[locale]/termos">) {
  const { locale } = await params;
  if (!isLocale(locale)) return null;
  return <LegalArticle id="termos" doc={getDictionary(locale).legal.terms(legalContext(locale, "terms"))} />;
}

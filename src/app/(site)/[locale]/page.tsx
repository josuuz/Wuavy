import { Contact } from "@/components/sections/Contact";
import { Manifesto } from "@/components/sections/Manifesto";
import type { Metadata } from "next";

import { isLocale, pageAlternates } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { DifferentialsA } from "@/variants/a/DifferentialsA";
import { FaqA } from "@/variants/a/FaqA";
import { HeroA } from "@/variants/a/HeroA";
import { IntroLoader } from "@/variants/a/IntroLoader";
import { ServicesA } from "@/variants/a/ServicesA";
import { StatementA } from "@/variants/a/StatementA";
import { SystemsA } from "@/variants/a/SystemsA";
import { WorkA } from "@/variants/a/WorkA";

/*
  The home page is a composition: each section owns its layout and reads its
  copy from the dictionary of the page's language (src/i18n). Surfaces
  alternate so every chapter reads as a turn: black, paper, black, carbon, the
  manifesto break landing on paper, black, fog for the questions, and the
  carbon call before the footer (mounted by SiteChrome).
*/
export async function generateMetadata({ params }: PageProps<"/[locale]">): Promise<Metadata> {
  const { locale } = await params;
  return isLocale(locale) ? { alternates: pageAlternates(locale, "/") } : {};
}

export default async function Home({ params }: PageProps<"/[locale]">) {
  const { locale } = await params;
  if (!isLocale(locale)) return null;
  const { home, ui } = getDictionary(locale);

  return (
    <>
      <IntroLoader label={ui.loading} />
      <HeroA locale={locale} />
      <StatementA locale={locale} />
      <ServicesA locale={locale} />
      <SystemsA locale={locale} />
      <Manifesto lines={home.manifesto.lines} label={ui.sections.manifesto} fit={5.3} />
      <DifferentialsA locale={locale} />
      <WorkA locale={locale} />
      <FaqA locale={locale} />
      <Contact locale={locale} />
    </>
  );
}

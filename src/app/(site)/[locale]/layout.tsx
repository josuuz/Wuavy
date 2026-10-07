import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { SiteChrome } from "@/components/layout/SiteChrome";
import { SmoothScroll } from "@/components/motion";
import { site } from "@/data/site";
import { isLocale, localizePath, locales, ogLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { organizationJsonLd } from "@/lib/seo";

/*
  The public site, once per language: pt-BR at the plain addresses, pt-PT
  under /pt-pt (the proxy maps both to this segment). Both are static. An unknown language is a 404 (below); an unknown page inside
  one is [...missing]'s.
*/

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: LayoutProps<"/[locale]">): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const { title, description } = getDictionary(locale).meta;

  return {
    title: { default: title, template: `%s | ${site.name}` },
    description,
    openGraph: {
      type: "website",
      locale: ogLocale(locale),
      siteName: site.name,
      title,
      description,
      url: localizePath(locale, "/"),
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function SiteLayout({ children, params }: LayoutProps<"/[locale]">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd(getDictionary(locale).meta.description)) }}
      />
      <SmoothScroll />
      <SiteChrome locale={locale}>{children}</SiteChrome>
    </>
  );
}

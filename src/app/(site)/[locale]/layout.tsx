import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { SmoothScroll } from "@/components/motion";
import { site } from "@/data/site";
import { isLocale, localizePath, locales, ogLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { organizationJsonLd, shareImage } from "@/lib/seo";

/*
  The public site, once per language: pt-BR at the plain addresses, pt-PT
  under /pt-pt (the proxy maps both to this segment). Both are static. An
  unknown language is a 404 (below); an unknown page inside one is
  [...missing]'s.

  This layout holds only what every public page shares — the language, the
  smooth scroll and the organisation's structured data. The chrome lives one
  level down, in a route group, because the two kinds of page here do not
  wear the same one:

  · (marketing) — the agency: the site header with its whole menu, the footer.
  · (produto)   — Clinavy: its own header and a short footer, so the agency's
                  services never compete with subscribing to the product.

  Route groups do not appear in the address, so /clinavy is still /clinavy.
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
      images: [shareImage],
    },
    twitter: { card: "summary_large_image", title, description, images: [shareImage.url] },
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
      {children}
    </>
  );
}

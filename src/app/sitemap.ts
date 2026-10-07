import type { MetadataRoute } from "next";

import { publishedCases } from "@/data/cases";
import { defaultLocale, localizePath, locales } from "@/i18n/config";
import { absoluteUrl } from "@/lib/seo";

type Entry = { path: string; changeFrequency: "monthly" | "yearly"; priority: number };

/*
  Home, Pulse, the legal pages and published cases, each in pt-BR (plain
  address) and pt-PT (/pt-pt), with hreflang pointing every version at the
  other. Placeholder cases stay out until they are real.
*/
export default function sitemap(): MetadataRoute.Sitemap {
  const pages: Entry[] = [
    { path: "/", changeFrequency: "monthly", priority: 1 },
    { path: "/pulse", changeFrequency: "monthly", priority: 0.9 },
    { path: "/privacidade", changeFrequency: "yearly", priority: 0.2 },
    { path: "/termos", changeFrequency: "yearly", priority: 0.2 },
    ...publishedCases(defaultLocale).map((item) => ({
      path: `/trabalho/${item.slug}`,
      changeFrequency: "yearly" as const,
      priority: 0.7,
    })),
  ];

  return pages.flatMap(({ path, ...rest }) => {
    const languages = Object.fromEntries(locales.map((l) => [l, absoluteUrl(localizePath(l, path))]));
    return locales.map((locale) => ({
      url: absoluteUrl(localizePath(locale, path)),
      ...rest,
      alternates: { languages },
    }));
  });
}

import type { MetadataRoute } from "next";

import { publishedCases } from "@/data/cases";
import { absoluteUrl } from "@/lib/seo";

/** Home plus published cases. Placeholder cases stay out until they are real. */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: absoluteUrl("/"), changeFrequency: "monthly", priority: 1 },
    ...publishedCases.map((item) => ({
      url: absoluteUrl(`/trabalho/${item.slug}`),
      changeFrequency: "yearly" as const,
      priority: 0.7,
    })),
  ];
}

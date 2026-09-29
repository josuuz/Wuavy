import type { MetadataRoute } from "next";

import { publishedCases } from "@/data/cases";
import { absoluteUrl } from "@/lib/seo";

/** Home, Flow and published cases. Placeholder cases stay out until they are real. */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: absoluteUrl("/"), changeFrequency: "monthly", priority: 1 },
    { url: absoluteUrl("/flow"), changeFrequency: "monthly", priority: 0.9 },
    ...publishedCases.map((item) => ({
      url: absoluteUrl(`/trabalho/${item.slug}`),
      changeFrequency: "yearly" as const,
      priority: 0.7,
    })),
  ];
}

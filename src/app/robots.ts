import type { MetadataRoute } from "next";

import { absoluteUrl } from "@/lib/seo";

/*
  The Pulse's signed-in routes are kept out of search by `noindex` on the
  pages themselves (login, onboarding, demo, invite, the app), not by a
  Disallow: a crawler has to fetch a page to read its noindex, and a blocked
  address can still be listed from a link elsewhere. So the whole site stays
  crawlable and only the webhooks, which are not pages, are closed off.
*/
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: "/api/" },
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}

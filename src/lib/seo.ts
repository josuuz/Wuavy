import { site } from "@/data/site";
import type { ContactChannel } from "./types";

const channel = <K extends ContactChannel["kind"]>(kind: K) =>
  site.contact.channels.find((c): c is Extract<ContactChannel, { kind: K }> => c.kind === kind);

/** Absolute URL on the site's domain. */
export function absoluteUrl(path = "/"): string {
  return new URL(path, site.url).toString();
}

/** The share image for pages that don't bring their own (a case brings its cover). */
export const shareImage = { url: "/opengraph-image", width: 1200, height: 630, alt: site.name };

/** Organization structured data, in the page's language. Only facts the site already states. */
export function organizationJsonLd(description: string) {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: site.name,
    url: site.url,
    logo: absoluteUrl("/icon.svg"),
    description,
    email: channel("email")?.address,
    telephone: channel("whatsapp")?.number,
    sameAs: site.social.map((s) => s.href).filter(Boolean),
  };
}

/*
  Wuavy Pulse as a product. No price and no rating: the public page states
  neither, and schema.org data that the page cannot back is what gets
  structured data penalised.
*/
export function softwareJsonLd({ name, description, url }: { name: string; description: string; url: string }) {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name,
    description,
    url: absoluteUrl(url),
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    publisher: { "@type": "Organization", name: site.name, url: site.url },
  };
}

/** The trail a case page sits on, so the result shows Início › Trabalho › Caso. */
export function breadcrumbJsonLd(trail: readonly { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map(({ name, path }, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name,
      item: absoluteUrl(path),
    })),
  };
}

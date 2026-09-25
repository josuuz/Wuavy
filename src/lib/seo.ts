import { site } from "@/data/site";

/** Absolute URL on the site's domain. */
export function absoluteUrl(path = "/"): string {
  return new URL(path, site.url).toString();
}

/** Organization structured data. Only facts the site already states. */
export function organizationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: site.name,
    url: site.url,
    logo: absoluteUrl("/icon.svg"),
    description: site.description,
    email: site.contact.primary.kind === "email" ? site.contact.primary.address : undefined,
    sameAs: site.social.map((s) => s.href).filter(Boolean),
  };
}

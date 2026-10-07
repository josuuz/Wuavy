import { site } from "@/data/site";
import type { ContactChannel } from "./types";

const channel = <K extends ContactChannel["kind"]>(kind: K) =>
  site.contact.channels.find((c): c is Extract<ContactChannel, { kind: K }> => c.kind === kind);

/** Absolute URL on the site's domain. */
export function absoluteUrl(path = "/"): string {
  return new URL(path, site.url).toString();
}

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

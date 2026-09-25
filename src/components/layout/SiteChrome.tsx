import type { ReactNode } from "react";

import { site } from "@/data/site";
import { contactHref } from "@/lib/contact";
import { FooterA } from "@/variants/a/FooterA";
import { Header } from "./Header";

/** The site's header, main landmark and footer (skip link target: #conteudo). */
export function SiteChrome({ children }: { children: ReactNode }) {
  const cta = { label: site.cta.label, short: site.cta.short, href: contactHref(site.contact.primary) };

  return (
    <>
      <Header nav={site.nav} cta={cta} />
      <main id="conteudo">{children}</main>
      <FooterA />
    </>
  );
}

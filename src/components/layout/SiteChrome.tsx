import type { ReactNode } from "react";

import { localizePath, type Locale } from "@/i18n/config";
import { getDictionary, languageSwitch, talkHref } from "@/i18n/dictionaries";
import { FooterA } from "@/variants/a/FooterA";
import { Header } from "./Header";

/** The site's skip link, header, main landmark and footer (skip link target: #conteudo), in one language. */
export function SiteChrome({ locale, children }: { locale: Locale; children: ReactNode }) {
  const { ui, nav, cta } = getDictionary(locale);

  return (
    <>
      <a href="#conteudo" className="skip-link">
        {ui.skip}
      </a>
      <Header
        nav={nav.map((item) => ({ ...item, href: localizePath(locale, item.href) }))}
        cta={{ ...cta, href: talkHref(locale) }}
        labels={{ homeHref: localizePath(locale, "/"), home: ui.home, nav: ui.navMain, menu: ui.menu, menuNav: ui.menuNav, close: ui.close }}
        language={languageSwitch(locale)}
      />
      <main id="conteudo">{children}</main>
      <FooterA locale={locale} />
    </>
  );
}

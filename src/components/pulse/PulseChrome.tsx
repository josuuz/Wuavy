import type { ReactNode } from "react";

import { localizePath, type Locale } from "@/i18n/config";
import { getDictionary, languageSwitch, talkHref } from "@/i18n/dictionaries";
import { PulseFooter } from "./PulseFooter";
import { PulseNav } from "./PulseNav";

/*
  The chrome PULSE wears: its own header, its own short footer.

  The agency's header is not reused on purpose. Its menu is the agency's —
  Serviços, Sistemas, Projetos, FAQ, Contato — and on this page those compete
  with the one thing that matters here, which is subscribing. What is left is
  the product's own sections, a way in for a clinic that already pays, the
  demonstration, and one discreet door back to wuavy.com.

  The language switch stays: the public site speaks two, and a visitor who
  landed here in the wrong one must be able to leave it. The legal links are
  the site's own (home.footer.legal), so there is one spelling of them.
*/
export function PulseChrome({ locale, children }: { locale: Locale; children: ReactNode }) {
  const { ui, home, pulse } = getDictionary(locale);
  const { chrome } = pulse;
  const back = { ...chrome.back, href: localizePath(locale, chrome.back.href) };

  return (
    <>
      <a href="#conteudo" className="skip-link">
        {ui.skip}
      </a>

      <PulseNav
        labels={{ home: chrome.home, nav: chrome.nav, signIn: chrome.signIn, cta: chrome.cta, back }}
        links={chrome.links}
        language={languageSwitch(locale)}
      />

      <main id="conteudo">{children}</main>

      <PulseFooter
        footer={chrome.footer}
        links={chrome.links}
        back={back}
        legal={home.footer.legal.map((item) => ({ ...item, href: localizePath(locale, item.href) }))}
        talk={talkHref(locale, pulse.name)}
      />
    </>
  );
}

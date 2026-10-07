import Link from "next/link";

import { Wordmark } from "@/components/brand/Wordmark";
import { LocaleSwitch } from "@/components/layout/LocaleSwitch";
import { Button } from "@/components/ui/Button";
import { activeServices } from "@/data/services";
import { site } from "@/data/site";
import { localizePath, type Locale } from "@/i18n/config";
import { contactChannels, getDictionary, languageSwitch, talkHref } from "@/i18n/dictionaries";
import { contactHref, contactValue, isExternal } from "@/lib/contact";
import styles from "./FooterA.module.css";

/* The closing panel: the signature and the action, the index, the wordmark at its foot. */
export function FooterA({ locale }: { locale: Locale }) {
  const year = new Date().getFullYear();
  const { home, ui, nav, cta } = getDictionary(locale);
  const { navTitle, servicesTitle, contactTitle, socialTitle, legal } = home.footer;

  return (
    <footer className={styles.footer} data-surface="graphite" data-section={ui.sections.footer} id="rodape">
      <div className={styles.panel}>
        <div className={`frame ${styles.grid}`}>
          <div className={styles.lead}>
            <p className={styles.line}>{home.footer.signature}</p>
            <Button href={talkHref(locale)}>{cta.label}</Button>
          </div>

          <nav aria-label={ui.footerNav} className={styles.col}>
            <h2 className={styles.title}>{navTitle}</h2>
            <ul>
              {nav.map((n) => (
                <li key={n.href}>
                  <Link href={localizePath(locale, n.href)}>{n.label}</Link>
                </li>
              ))}
            </ul>
          </nav>

          <div className={styles.col}>
            <h2 className={styles.title}>{servicesTitle}</h2>
            <ul>
              {activeServices(locale).map((s) => (
                <li key={s.id}>
                  <Link href={localizePath(locale, "/#servicos")}>{s.name}</Link>
                </li>
              ))}
            </ul>
          </div>

          <div className={styles.col}>
            <h2 className={styles.title}>{contactTitle}</h2>
            <ul>
              {contactChannels(locale).map((c) => (
                <li key={c.kind}>
                  <a href={contactHref(c)} {...(isExternal(contactHref(c)) ? { target: "_blank", rel: "noopener" } : {})}>
                    {contactValue(c)}
                  </a>
                </li>
              ))}
            </ul>
            <h2 className={`${styles.title} ${styles.titleGap}`}>{socialTitle}</h2>
            <ul>
              {site.social.map((s) => (
                <li key={s.label} className={s.href ? undefined : styles.pending}>
                  {s.href ? (
                    <a href={s.href} {...(isExternal(s.href) ? { target: "_blank", rel: "noopener" } : {})}>
                      {s.label}
                    </a>
                  ) : (
                    s.label
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className={`frame ${styles.legal}`}>
          <span>
            © {year} {site.name}. {home.footer.rights}
          </span>
          <ul className={styles.legalLinks}>
            {legal.map((l) => (
              <li key={l.label} className={l.href ? undefined : styles.pending}>
                {l.href ? <a href={localizePath(locale, l.href)}>{l.label}</a> : l.label}
              </li>
            ))}
            <li>
              <LocaleSwitch {...languageSwitch(locale)} variant="name" className={styles.locale} />
            </li>
            <li>
              <a href="#conteudo">{ui.backToTop}</a>
            </li>
          </ul>
        </div>

        <div className={styles.mark}>
          <Wordmark decorative />
        </div>
      </div>
    </footer>
  );
}

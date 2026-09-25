import Link from "next/link";

import { Wordmark } from "@/components/brand/Wordmark";
import { Button } from "@/components/ui/Button";
import { home } from "@/data/home";
import { activeServices } from "@/data/services";
import { site } from "@/data/site";
import { contactHref, contactValue, isExternal } from "@/lib/contact";
import styles from "./FooterA.module.css";

/* The closing panel: the signature and the action, the index, the wordmark at its foot. */
export function FooterA() {
  const year = new Date().getFullYear();
  const { navTitle, servicesTitle, contactTitle, socialTitle, legal } = home.footer;

  return (
    <footer className={styles.footer} data-surface="graphite" data-section="Rodapé" id="rodape">
      <div className={styles.panel}>
        <div className={`frame ${styles.grid}`}>
          <div className={styles.lead}>
            <p className={styles.line}>{home.footer.signature}</p>
            <Button href={contactHref(site.contact.primary)}>{site.cta.label}</Button>
          </div>

          <nav aria-label="Rodapé" className={styles.col}>
            <h2 className={styles.title}>{navTitle}</h2>
            <ul>
              {site.nav.map((n) => (
                <li key={n.href}>
                  <Link href={n.href}>{n.label}</Link>
                </li>
              ))}
            </ul>
          </nav>

          <div className={styles.col}>
            <h2 className={styles.title}>{servicesTitle}</h2>
            <ul className={styles.priced}>
              {activeServices.map((s) => (
                <li key={s.id}>
                  <Link href="/#servicos">{s.name}</Link>
                  <span className={styles.price}>
                    {s.price.value}
                    {s.price.period}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className={styles.col}>
            <h2 className={styles.title}>{contactTitle}</h2>
            <ul>
              {site.contact.channels.map((c) => (
                <li key={c.kind}>
                  <a href={contactHref(c)}>{contactValue(c)}</a>
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
                {l.href ? <a href={l.href}>{l.label}</a> : l.label}
              </li>
            ))}
            <li>
              <a href="#conteudo">Voltar ao topo ↑</a>
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

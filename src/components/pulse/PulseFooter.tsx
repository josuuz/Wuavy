import Link from "next/link";

import { ClinavyWordmark } from "@/components/brand/ClinavyWordmark";
import { TextLink } from "@/components/ui/TextLink";
import styles from "./chrome.module.css";

/*
  The product's footer: short on purpose. The agency's footer lists services,
  cases and channels, which would end this page by sending a clinic that was
  about to subscribe somewhere else. This one closes the product — the
  sections of this page, the two doors into Clinavy, the legal pages — and
  leaves one line back to the agency.
*/

interface FooterCopy {
  signature: string;
  agency: string;
  navTitle: string;
  productTitle: string;
  legalTitle: string;
  rights: string;
  product: readonly { label: string; href: string }[];
}

interface PulseFooterProps {
  footer: FooterCopy;
  links: readonly { label: string; href: string }[];
  back: { label: string; title: string; href: string };
  legal: readonly { label: string; href: string }[];
  talk: string;
}

export function PulseFooter({ footer, links, back, legal, talk }: PulseFooterProps) {
  const year = new Date().getFullYear();

  return (
    <footer className={styles.footer} data-surface="graphite" id="rodape">
      <div className={`frame ${styles.footerGrid}`}>
        <div className={styles.footerLead}>
          <p className={styles.footerBrand}>
            <ClinavyWordmark decorative className={styles.footerWordmark} />
          </p>
          <p className={styles.footerSignature}>{footer.signature}</p>
          <TextLink href={talk} className={styles.footerTalk}>
            {footer.agency}
          </TextLink>
        </div>

        <nav aria-label={footer.navTitle} className={styles.footerCol}>
          <h2 className={styles.footerTitle}>{footer.navTitle}</h2>
          <ul>
            {links.map((link) => (
              <li key={link.href}>
                <a href={link.href}>{link.label}</a>
              </li>
            ))}
          </ul>
        </nav>

        <div className={styles.footerCol}>
          <h2 className={styles.footerTitle}>{footer.productTitle}</h2>
          <ul>
            {footer.product.map((item) => (
              <li key={item.href}>
                <Link href={item.href}>{item.label}</Link>
              </li>
            ))}
          </ul>
        </div>

        <div className={styles.footerCol}>
          <h2 className={styles.footerTitle}>{footer.legalTitle}</h2>
          <ul>
            {legal.map((item) => (
              <li key={item.href}>
                <Link href={item.href}>{item.label}</Link>
              </li>
            ))}
            <li>
              <Link href={back.href} title={back.title}>
                {back.label}
              </Link>
            </li>
          </ul>
        </div>

        <p className={styles.footerRights}>
          © {year} WUAVY. {footer.rights}
        </p>
      </div>
    </footer>
  );
}

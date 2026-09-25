import { ChapterHead, Section } from "@/components/layout/Section";
import { TextLink } from "@/components/ui/TextLink";
import { home } from "@/data/home";
import { site } from "@/data/site";
import { contactHref } from "@/lib/contact";
import { pad } from "@/lib/utils";
import styles from "./FaqA.module.css";

/*
  Questions asked before a first conversation, on native <details>: keyboard
  and screen readers get the accordion for free. The same answers go to
  search engines as FAQPage structured data.
*/
export function FaqA() {
  const { chapter, headline, items } = home.faq;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    })),
  };

  return (
    <Section id="faq" surface="fog" label="FAQ" className={`tx-grain ${styles.section}`}>
      <div className="frame">
        <div className={styles.side}>
          <ChapterHead index={6} name={chapter} className={styles.chapter} />
          <h2 className={styles.headline}>{headline}</h2>
          <p className={styles.more}>
            Ficou alguma dúvida?{" "}
            <TextLink href={contactHref(site.contact.primary, "Dúvida")}>Pergunte direto</TextLink>
          </p>
        </div>

        <div className={styles.list}>
          {items.map((item, i) => (
            <details key={item.q} className={styles.item} name="faq">
              <summary className={styles.question}>
                <span className={styles.index}>{pad(i + 1)}</span>
                <span className={styles.q}>{item.q}</span>
                <span className={styles.icon} aria-hidden="true" />
              </summary>
              <p className={styles.answer}>{item.a}</p>
            </details>
          ))}
        </div>
      </div>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
    </Section>
  );
}

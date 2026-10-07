import { ChapterHead, Section } from "@/components/layout/Section";
import { RollText } from "@/components/motion";
import { activeServices } from "@/data/services";
import type { Locale } from "@/i18n/config";
import { getDictionary, talkHref } from "@/i18n/dictionaries";
import { pad } from "@/lib/utils";
import styles from "./ServicesA.module.css";

/*
  Services as an index of offers. Each row carries the outcome and what it
  includes; its call to action stretches over the whole row. On hover
  a Paper band runs in along the channel angle and the name rolls.
*/

export function ServicesA({ locale }: { locale: Locale }) {
  const { home, ui } = getDictionary(locale);

  return (
    <Section id="servicos" surface="black" label={ui.sections.services} className={`tx-grain ${styles.section}`}>
      <div className={`frame ${styles.head}`}>
        <ChapterHead index={2} name={home.services.chapter} className={styles.chapter} />
        <p className={styles.headline}>{home.services.headline}</p>
        <p className={styles.lead}>{home.services.lead}</p>
      </div>

      <ol className={styles.list}>
        {activeServices(locale).map((service, i) => {
          const href = service.href ?? talkHref(locale, service.name);
          const label = service.href ? home.services.more : home.services.cta;
          return (
            <li key={service.id} className={styles.row}>
              <article className={styles.inner}>
                <span className={styles.index}>({pad(i + 1)})</span>

                <div className={styles.title}>
                  <h3 className={styles.name}>
                    <RollText text={service.name} />
                  </h3>
                  <p className={styles.outcome}>{service.outcome}</p>
                </div>

                <p className={styles.summary}>{service.summary}</p>

                <div className={styles.includes}>
                  <p className={styles.includesTitle}>{home.services.includes}</p>
                  <ul className={styles.keys}>
                    {service.deliverables.map((d) => (
                      <li key={d}>{d}</li>
                    ))}
                  </ul>
                </div>

                <div className={styles.foot}>
                  {service.note ? <p className={styles.note}>{service.note}</p> : null}
                  <a
                    href={href}
                    className={styles.cta}
                    data-cursor="action"
                    aria-label={`${label}: ${service.name}`}
                  >
                    <span className={styles.ctaText}>{label}</span>
                    <span className={styles.arrow} aria-hidden="true">
                      →
                    </span>
                  </a>
                </div>
              </article>
            </li>
          );
        })}
      </ol>
    </Section>
  );
}

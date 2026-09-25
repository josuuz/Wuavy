import { ChapterHead, Section } from "@/components/layout/Section";
import { HoverPreview, RollText } from "@/components/motion";
import { home } from "@/data/home";
import { activeServices } from "@/data/services";
import { site } from "@/data/site";
import { serviceImages } from "@/data/variants";
import { contactHref } from "@/lib/contact";
import { pad } from "@/lib/utils";
import styles from "./ServicesA.module.css";

/*
  Services as an index of offers. Each row carries the outcome, the price and
  what it includes; its call to action stretches over the whole row. On hover
  a Paper band runs in along the channel angle and a photograph follows the
  pointer. Touch sees the same rows without the preview.
*/

export function ServicesA() {
  return (
    <Section id="servicos" surface="black" label="Serviços" className={`tx-grain ${styles.section}`}>
      <div className={`frame ${styles.head}`}>
        <ChapterHead index={2} name={home.services.chapter} className={styles.chapter} />
        <p className={styles.headline}>{home.services.headline}</p>
        <p className={styles.lead}>{home.services.lead}</p>
      </div>

      <ol className={styles.list} data-preview-host="">
        {activeServices.map((service, i) => {
          const { price } = service;
          const href = service.href ?? contactHref(site.contact.primary, service.name);
          const label = service.href ? home.services.more : home.services.cta;
          return (
            <li key={service.id} className={styles.row} data-preview={i}>
              <article className={styles.inner}>
                <span className={styles.index}>({pad(i + 1)})</span>

                <div className={styles.title}>
                  <h3 className={styles.name}>
                    <RollText text={service.name} />
                  </h3>
                  <p className={styles.outcome}>{service.outcome}</p>
                </div>

                <p className={styles.price}>
                  <span className={styles.priceLabel}>{price.label}</span>
                  <span className={styles.priceValue}>
                    {price.value}
                    {price.period ? <span className={styles.period}>{price.period}</span> : null}
                  </span>
                </p>

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
                  {price.note ? <p className={styles.note}>{price.note}</p> : null}
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
        <li className={styles.previewSlot} aria-hidden="true">
          <HoverPreview images={serviceImages} />
        </li>
      </ol>
    </Section>
  );
}

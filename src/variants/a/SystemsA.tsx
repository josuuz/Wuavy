import { ChapterHead, Section } from "@/components/layout/Section";
import { LineReveal } from "@/components/motion";
import { Button } from "@/components/ui/Button";
import { home } from "@/data/home";
import { site } from "@/data/site";
import { contactHref } from "@/lib/contact";
import { pad } from "@/lib/utils";
import styles from "./SystemsA.module.css";

/*
  The advanced tier. No fixed price: a custom project that starts with a
  diagnosis. The capabilities sit in a hairline grid like a spec sheet;
  a light follows the pointer across the cell under it.
*/
export function SystemsA() {
  const { chapter, headline, lead, price, priceLabel, cta, items } = home.systems;

  return (
    <Section id="sistemas" surface="carbon" label="Sistemas" className={`tx-grain ${styles.section}`}>
      <div className={`tx-light ${styles.light}`} data-tone="signal" aria-hidden="true" />

      <div className={`frame ${styles.head}`}>
        <ChapterHead index={3} name={chapter} className={styles.chapter} />

        <h2 className={styles.headline}>
          <LineReveal text={headline} step={120} />
        </h2>

        <div className={styles.aside}>
          <p className={styles.lead}>{lead}</p>
          <p className={styles.price}>
            <span className={styles.priceLabel}>{priceLabel}</span>
            <span className={styles.priceValue}>{price}</span>
          </p>
          <Button href={contactHref(site.contact.primary, chapter)}>{cta}</Button>
        </div>
      </div>

      <div className="frame">
        <ul className={styles.grid}>
          {items.map((item, i) => (
            <li key={item.name} className={styles.cell} data-spot-host="">
              <span className={styles.spot} data-spot="" aria-hidden="true" />
              <span className={styles.index}>{pad(i + 1)}</span>
              <h3 className={styles.name}>{item.name}</h3>
              <p className={styles.text}>{item.text}</p>
            </li>
          ))}
        </ul>
      </div>

    </Section>
  );
}

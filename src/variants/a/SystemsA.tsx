import { ChapterHead, Section } from "@/components/layout/Section";
import { LineReveal } from "@/components/motion";
import { Button } from "@/components/ui/Button";
import type { Locale } from "@/i18n/config";
import { getDictionary, talkHref } from "@/i18n/dictionaries";
import { pad } from "@/lib/utils";
import styles from "./SystemsA.module.css";

/*
  The advanced tier: a custom project that starts with a diagnosis. Four
  blocks in a hairline grid like a spec sheet; each keeps its examples in a
  native <details> (click or tap, keyboard for free, one open at a time), and
  a light follows the pointer across the block under it.
*/
export function SystemsA({ locale }: { locale: Locale }) {
  const { home, ui } = getDictionary(locale);
  const { chapter, headline, lead, cta, examples, items } = home.systems;

  return (
    <Section id="sistemas" surface="carbon" label={ui.sections.systems} className={`tx-grain ${styles.section}`}>
      <div className={`tx-light ${styles.light}`} data-tone="signal" aria-hidden="true" />

      <div className={`frame ${styles.head}`}>
        <ChapterHead index={3} name={chapter} className={styles.chapter} />

        <h2 className={styles.headline}>
          <LineReveal text={headline} step={120} />
        </h2>

        <div className={styles.aside}>
          <p className={styles.lead}>{lead}</p>
          <Button href={talkHref(locale, chapter)}>{cta}</Button>
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
              <details className={styles.more} name="sistemas">
                <summary className={styles.toggle}>
                  {examples}
                  <span className={styles.icon} aria-hidden="true" />
                </summary>
                <ul className={styles.examples}>
                  {item.examples.map((example) => (
                    <li key={example}>{example}</li>
                  ))}
                </ul>
              </details>
            </li>
          ))}
        </ul>
      </div>
    </Section>
  );
}

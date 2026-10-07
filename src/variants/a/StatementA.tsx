import { ChapterHead, Section } from "@/components/layout/Section";
import { ReadReveal } from "@/components/motion";
import type { Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { pad } from "@/lib/utils";
import styles from "./StatementA.module.css";

/*
  About: the idea lights up word by word with the scroll, the positioning
  says it plainly, and the four values close it as one compact line.
*/

export function StatementA({ locale }: { locale: Locale }) {
  const { chapter, body, accents, positioning, valuesTitle, values } = getDictionary(locale).home.idea;

  return (
    <Section id="ideia" surface="paper" label={chapter} className={`tx-grid tx-grain ${styles.section}`}>
      <div className={`frame ${styles.body}`}>
        <ChapterHead index={1} name={chapter} className={styles.chapter} />
        <p className={styles.read}>
          <ReadReveal text={body} accents={accents} />
        </p>
        <p className={styles.positioning}>{positioning}</p>

        <ul className={styles.values} aria-label={valuesTitle}>
          {values.map((value, i) => (
            <li key={value.name} className={styles.value}>
              <span className={styles.valueIndex}>{pad(i + 1)}</span>
              <strong className={styles.valueName}>{value.name}</strong>
              <span className={styles.valueText}>{value.text}</span>
            </li>
          ))}
        </ul>
      </div>
    </Section>
  );
}

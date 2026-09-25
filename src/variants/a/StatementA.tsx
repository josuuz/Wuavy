import { ChapterHead, Section } from "@/components/layout/Section";
import { ReadReveal } from "@/components/motion";
import { home } from "@/data/home";
import { pad } from "@/lib/utils";
import styles from "./StatementA.module.css";

/*
  The idea, drawn: FREQUÊNCIA set solid, VOLUME. set hollow. The paragraph
  lights up word by word with the scroll; the positioning says it plainly,
  and the four values close the chapter.
*/

export function StatementA() {
  return (
    <Section id="ideia" surface="paper" label="Ideia" className={`tx-grid tx-grain ${styles.section}`}>
      <p className={styles.display}>
        <span className="sr-only">Frequência vence volume.</span>
        <span className={styles.solid} aria-hidden="true">
          Frequência
        </span>
        <span className={styles.second} aria-hidden="true">
          <span className={styles.small}>vence</span>
          <span className={styles.hollow}>volume.</span>
        </span>
      </p>

      <div className={`frame ${styles.body}`}>
        <ChapterHead index={1} name={home.idea.chapter} className={styles.chapter} />
        <p className={styles.read}>
          <ReadReveal text={home.idea.body} accents={["precisão:"]} />
        </p>
        <p className={styles.positioning}>{home.idea.positioning}</p>
      </div>

      <div className={`frame ${styles.columns}`}>
        <h3 className={styles.valuesTitle}>{home.idea.valuesTitle}</h3>
        <ul className={styles.values}>
          {home.idea.values.map((value, i) => (
            <li key={value.name} className={styles.col}>
              <span className={styles.colIndex}>({pad(i + 1)})</span>
              <h4 className={styles.colTitle}>{value.name}</h4>
              <p className={styles.colText}>{value.text}</p>
            </li>
          ))}
        </ul>
      </div>
    </Section>
  );
}

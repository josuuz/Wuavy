import { ChapterHead, Section } from "@/components/layout/Section";
import { LineReveal, WidthWave } from "@/components/motion";
import { home } from "@/data/home";
import { pad } from "@/lib/utils";
import styles from "./DifferentialsA.module.css";

/*
  Why WUAVY, as an editorial list. The manifesto's Paper plane lands here.
  Hovering a row passes the width wave through its name.
*/
export function DifferentialsA() {
  const { chapter, headline, items } = home.differentials;

  return (
    <Section id="diferenciais" surface="paper" label={chapter} className={`tx-grain ${styles.section}`}>
      <div className="frame">
        <ChapterHead index={4} name={chapter} className={styles.chapter} />
        <h2 className={styles.headline}>
          <LineReveal text={headline} step={120} />
        </h2>

        <ol className={styles.list}>
          {items.map((item, i) => (
            <li key={item.name} className={styles.row} data-wave-host="">
              <span className={styles.index}>({pad(i + 1)})</span>
              <h3 className={styles.name}>
                <WidthWave text={item.name} hover hoverHost="closest" />
              </h3>
              <p className={styles.text}>{item.text}</p>
            </li>
          ))}
        </ol>
      </div>
    </Section>
  );
}

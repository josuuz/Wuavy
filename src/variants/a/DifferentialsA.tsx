import { ChapterHead, Section } from "@/components/layout/Section";
import { LineReveal, WidthWave } from "@/components/motion";
import type { Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { pad } from "@/lib/utils";
import styles from "./DifferentialsA.module.css";

/*
  Why WUAVY, as a compact grid (like the values). The manifesto's Paper plane
  lands here. Hovering an item passes the width wave through its name.
*/
export function DifferentialsA({ locale }: { locale: Locale }) {
  const { chapter, headline, items } = getDictionary(locale).home.differentials;

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
              <span className={styles.index}>{pad(i + 1)}</span>
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

import Link from "next/link";
import { ViewTransition, type CSSProperties } from "react";

import { ChapterHead, Section } from "@/components/layout/Section";
import { ImageReveal } from "@/components/motion";
import { CaseMedia } from "@/components/work/CaseMedia";
import { cases } from "@/data/cases";
import { home } from "@/data/home";
import { serviceName } from "@/data/services";
import { pad } from "@/lib/utils";
import styles from "./WorkA.module.css";

/*
  Selected work, editorial. The cases fall into an
  asymmetric grid where each one drifts at its own speed with the scroll.
  The cover morphs into the case page on open.
*/

const LAYOUT = [
  { className: "a", aspect: 4 / 5, speed: -6 },
  { className: "b", aspect: 3 / 2, speed: 8 },
  { className: "c", aspect: 16 / 10, speed: -3 },
];

export function WorkA() {
  return (
    <Section id="projetos" surface="black" label={home.work.chapter} className={`tx-grain ${styles.section}`}>
      <div className={`frame ${styles.head}`}>
        <ChapterHead index={5} name={home.work.chapter} className={styles.counts} />
        <h2 className={styles.title}>{home.work.title}</h2>
        <p className={styles.lead}>{home.work.lead}</p>
      </div>

      <div className={`frame ${styles.grid}`}>
        {cases.map((item, i) => {
          const layout = LAYOUT[i % LAYOUT.length];
          return (
            <article
              key={item.slug}
              className={`${styles.card} ${styles[layout.className]}`}
              style={{ "--speed": layout.speed } as CSSProperties}
            >
              <ViewTransition name={`case-${item.slug}`} share="case-morph" default="none">
                <ImageReveal aspect={layout.aspect} mobileAspect={4 / 5} className={styles.media}>
                  <CaseMedia media={item.cover} sizes="(min-width: 1024px) 50vw, 100vw" />
                </ImageReveal>
              </ViewTransition>
              <div className={styles.caption}>
                <span className={styles.number}>{pad(i + 1)}</span>
                <h3 className={styles.name}>
                  <Link href={`/trabalho/${item.slug}`} className={styles.link} data-cursor="view" data-cursor-label="Ver case">
                    {item.title}
                  </Link>
                </h3>
                <span className={styles.meta}>
                  {item.services.map(serviceName).join(" + ")}, {item.year}
                </span>
                {item.placeholder ? <span className={styles.tag}>{home.work.placeholderTag}</span> : null}
              </div>
            </article>
          );
        })}
      </div>
    </Section>
  );
}

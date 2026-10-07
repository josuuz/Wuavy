import Image from "next/image";
import Link from "next/link";

import { ChapterHead, Section } from "@/components/layout/Section";
import { publishedCases } from "@/data/cases";
import { serviceName } from "@/data/services";
import { localizePath, type Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import type { Media } from "@/lib/types";
import { pad } from "@/lib/utils";
import styles from "./WorkA.module.css";

/*
  Recent work as an index, like the services: one short row per case, the
  whole row a link to its page. A redesign shows its before → after as two
  small frames in the row; work built from zero shows its cover alone.
  New cases are new rows; the list keeps three.
*/

const ROWS = 3;
const still = (media: Media) => (media.kind === "image" ? media.src : media.poster);

export function WorkA({ locale }: { locale: Locale }) {
  const { work } = getDictionary(locale).home;

  return (
    <Section id="projetos" surface="black" label={work.chapter} className={`tx-grain ${styles.section}`}>
      <div className={`frame ${styles.head}`}>
        <ChapterHead index={5} name={work.chapter} className={styles.chapter} />
        <h2 className={styles.title}>{work.title}</h2>
      </div>

      <ol className={styles.list}>
        {publishedCases(locale).slice(0, ROWS).map((item, i) => (
          <li key={item.slug} className={styles.row}>
            <article className={styles.inner}>
              <span className={styles.index}>({pad(i + 1)})</span>

              <div className={styles.heading}>
                <h3 className={styles.name}>
                  <Link href={localizePath(locale, `/trabalho/${item.slug}`)} className={styles.link}>
                    {item.title}
                  </Link>
                </h3>
                {item.tagline ? <p className={styles.tagline}>{item.tagline}</p> : null}
              </div>

              <p className={styles.scope}>
                {item.scope && item.scope.length > 1 ? <span className={styles.combo}>{work.combo}</span> : null}
                {(item.scope ?? item.services.map((id) => serviceName(id, locale))).join(" + ")}
                <span className={styles.year}>{item.year}</span>
              </p>

              {item.before ? (
                <div className={styles.compare} aria-hidden="true">
                  {[
                    { media: item.before.media, label: work.before },
                    { media: item.cover, label: work.after },
                  ].map(({ media, label }) => (
                    <figure key={label} className={styles.shot}>
                      <Image
                        src={still(media)}
                        alt=""
                        fill
                        sizes="(min-width: 1024px) 12vw, 45vw"
                        className={styles.shotImage}
                      />
                      <figcaption className={styles.shotTag}>{label}</figcaption>
                    </figure>
                  ))}
                </div>
              ) : (
                // Built from zero: no "before", the cover sits where the "after" would.
                <div className={`${styles.compare} ${styles.single}`} aria-hidden="true">
                  <figure className={styles.shot}>
                    <Image
                      src={still(item.cover)}
                      alt=""
                      fill
                      sizes="(min-width: 1024px) 12vw, 45vw"
                      className={styles.shotImage}
                    />
                  </figure>
                </div>
              )}

              <span className={styles.arrow} aria-hidden="true">
                →
              </span>
            </article>
          </li>
        ))}
      </ol>
    </Section>
  );
}

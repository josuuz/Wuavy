import Image from "next/image";
import Link from "next/link";

import { ChapterHead, Section } from "@/components/layout/Section";
import { HoverPreview } from "@/components/motion";
import { cases } from "@/data/cases";
import { home } from "@/data/home";
import { serviceName } from "@/data/services";
import type { Media } from "@/lib/types";
import { pad } from "@/lib/utils";
import styles from "./WorkA.module.css";

/*
  Selected work as an index, like the services: one short row per case, no
  big blocks. On pointer devices a frame follows the pointer with the case
  (HoverPreview); a before/after opens on the old work and the new one sweeps
  in over it. Touch has no hover, so it sees the before/after pair in the row.
  Work delivered as more than one discipline (`scope`) reads as a combo.
  Published cases come first in the data; the list keeps three rows.
*/

const ROWS = 3;
const still = (media: Media) => (media.kind === "image" ? media.src : media.poster);

export function WorkA() {
  const { work } = home;
  const shown = cases.slice(0, ROWS);
  const previews = shown.map((item) => ({
    src: still(item.cover),
    alt: item.cover.alt,
    mono: item.cover.treatment === "mono",
    before: item.before ? still(item.before.media) : undefined,
  }));

  return (
    <Section id="projetos" surface="black" label={work.chapter} className={`tx-grain ${styles.section}`}>
      <div className={`frame ${styles.head}`}>
        <ChapterHead index={5} name={work.chapter} className={styles.chapter} />
        <h2 className={styles.title}>{work.title}</h2>
        <p className={styles.lead}>{work.lead}</p>
      </div>

      <ol className={styles.list} data-preview-host="">
        {shown.map((item, i) => (
          <li key={item.slug} className={styles.row} data-preview={i} data-muted={item.placeholder ? "" : undefined}>
            <article className={styles.inner}>
              <span className={styles.index}>({pad(i + 1)})</span>

              <div className={styles.heading}>
                <h3 className={styles.name}>
                  <Link href={`/trabalho/${item.slug}`} className={styles.link}>
                    {item.title}
                  </Link>
                </h3>
                {item.tagline ? (
                  <p className={styles.tagline}>
                    {item.before ? (
                      <span className={styles.shift}>
                        {work.before} <span aria-hidden="true">→</span> {work.after}
                      </span>
                    ) : null}
                    {item.tagline}
                  </p>
                ) : null}
              </div>

              <p className={styles.scope}>
                {item.scope && item.scope.length > 1 ? <span className={styles.combo}>{work.combo}</span> : null}
                {(item.scope ?? item.services.map(serviceName)).join(" + ")}
              </p>

              <span className={styles.year}>{item.year}</span>
              <span className={styles.arrow} aria-hidden="true">
                →
              </span>

              {item.before ? (
                <div className={styles.compare} aria-hidden="true">
                  {[
                    { media: item.before.media, label: work.before },
                    { media: item.cover, label: work.after },
                  ].map(({ media, label }) => (
                    <figure key={label} className={styles.shot}>
                      <Image src={still(media)} alt="" fill sizes="50vw" className={styles.shotImage} />
                      <figcaption className={styles.shotTag}>{label}</figcaption>
                    </figure>
                  ))}
                </div>
              ) : null}
            </article>
          </li>
        ))}
        <li className={styles.previewSlot} aria-hidden="true">
          <HoverPreview
            images={previews}
            width="clamp(280px, 26vw, 460px)"
            ratio="16 / 10"
            labels={{ before: work.before, after: work.after }}
          />
        </li>
      </ol>
    </Section>
  );
}

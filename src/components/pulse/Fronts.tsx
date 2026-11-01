"use client";

import { useState } from "react";

import { pad } from "@/lib/utils";
import { track } from "./track";
import styles from "./interactive.module.css";

/*
  "Veja o que ele acompanha" — the seven fronts, once the visitor has seen why
  they matter.

  A list beside one large number. The seven is counted once, here, big and
  light, and the list keeps to a line per front: its tag and its name. What
  Clinavy does with it, and one fictitious example, open on demand, one at a
  time. The first is open on arrival so the pattern is plain without a click.

  Buttons with aria-expanded rather than <details>, because only one may be
  open and a front's panel has to be addressable by the row that controls it.
  The section is the page's one light one, so every colour here is a surface
  token and nothing names Paper or Black.
*/

export interface Front {
  tag: string;
  name: string;
  text: string;
  does: string;
  example: string;
}

interface FrontsProps {
  items: readonly Front[];
  hint: string;
  doesLabel: string;
  count: string;
  countLabel: string;
}

export function Fronts({ items, hint, doesLabel, count, countLabel }: FrontsProps) {
  const [open, setOpen] = useState(0);

  const toggle = (i: number) => {
    const next = open === i ? -1 : i;
    setOpen(next);
    if (next >= 0) track("front", items[next]?.name);
  };

  return (
    <div className={styles.frontsWrap}>
      <p className={styles.count}>
        <span className={styles.countValue}>{count}</span>
        <span className={styles.countLabel}>{countLabel}</span>
      </p>

      <div className={styles.fronts}>
        <p className={styles.frontsHint}>{hint}</p>
        <ol className={styles.frontList}>
          {items.map((front, i) => {
            const here = open === i;
            return (
              <li key={front.name} className={styles.front} data-open={here ? "" : undefined}>
                <h3 className={styles.frontHead}>
                  <button
                    type="button"
                    className={styles.frontButton}
                    aria-expanded={here}
                    aria-controls={`frente-${i}`}
                    onClick={() => toggle(i)}
                  >
                    <span className={styles.frontIndex} aria-hidden="true">
                      {pad(i + 1)}
                    </span>
                    <span className={styles.frontNames}>
                      <span className={styles.frontTag}>{front.tag}</span>
                      <span className={styles.frontName}>{front.name}</span>
                    </span>
                    <span className={styles.frontMark} aria-hidden="true" />
                  </button>
                </h3>

                <div id={`frente-${i}`} className={styles.frontPanel} hidden={!here}>
                  <p className={styles.frontText}>{front.text}</p>
                  <p className={styles.frontDoes}>
                    <span className={styles.frontDoesLabel}>{doesLabel}</span>
                    {front.does}
                  </p>
                  <p className={styles.frontExample}>{front.example}</p>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}

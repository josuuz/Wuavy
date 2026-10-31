"use client";

import { useState, type CSSProperties } from "react";

import { pad } from "@/lib/utils";
import { track } from "./track";
import styles from "./interactive.module.css";

/*
  The seven fronts, progressively.

  A wall of seven paragraphs is what this section used to be. Here each front
  is one line — its tag, its name and the sentence that defines it — and the
  rest (what the Pulse does with it, and one fictitious example) opens on
  demand, one at a time. The first is open on arrival so the pattern is
  obvious without a click.

  Buttons and aria-expanded rather than <details>, because only one may be
  open and the panel has to be addressable by the row that controls it. The
  rows arrive on the brand's propagation (42 ms apart) through the reveal
  gate the page wraps them in.
*/

export interface Front {
  tag: string;
  name: string;
  text: string;
  does: string;
  example: string;
}

export function Fronts({ items, hint, doesLabel }: { items: readonly Front[]; hint: string; doesLabel: string }) {
  const [open, setOpen] = useState(0);

  const toggle = (i: number) => {
    const next = open === i ? -1 : i;
    setOpen(next);
    if (next >= 0) track("front", items[next]?.name);
  };

  return (
    <div className={styles.fronts}>
      <p className={styles.frontsHint}>{hint}</p>
      <ol className={styles.frontList}>
        {items.map((front, i) => {
          const here = open === i;
          return (
            <li key={front.name} className={styles.front} data-open={here ? "" : undefined} style={{ "--i": i } as CSSProperties}>
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
  );
}

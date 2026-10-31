"use client";

import { useState } from "react";

import { AppFrame, OpportunityCard, type OppScreen } from "./product";
import { track } from "./track";
import styles from "./interactive.module.css";

/*
  "Veja como o PULSE ajuda sua equipe a agir" — the page's hands-on moment.

  Three situations, as a list on the left. The one that is open says the four
  things worth knowing about it — what happened, what the Pulse identified,
  why it deserves attention, what the team can do — and the product beside it
  shows the same front, open down to the message waiting for review.

  A list that opens, and not tabs: only one situation is ever shown, which is
  what a disclosure is for, and every button is a plain button that keeps the
  keyboard's usual meaning. The open row draws a line across its top; the
  product re-enters with the short rise the rest of the page uses.

  The first situation here is the one the first screen's animation just played.
  That is intended: the animation shows it moving, this lets the visitor pick.
*/

export interface ScenarioLabels {
  happened: string;
  found: string;
  why: string;
  action: string;
  screen: string;
  draft: string;
  review: string;
}

export interface Scenario {
  id: string;
  choice: string;
  short: string;
  happened: string;
  found: string;
  why: string;
  action: string;
  screen: OppScreen;
}

interface ScenariosProps {
  pick: string;
  labels: ScenarioLabels;
  items: readonly Scenario[];
  note: string;
}

export function Scenarios({ pick, labels, items, note }: ScenariosProps) {
  const [at, setAt] = useState(0);
  const scenario = items[at];

  const choose = (next: number) => {
    if (next === at) return;
    setAt(next);
    track("scenario", items[next]?.id);
  };

  return (
    <div className={styles.scenarios}>
      <div className={styles.accordion} role="group" aria-label={pick}>
        {items.map((item, i) => {
          const here = i === at;
          return (
            <div key={item.id} className={styles.case} data-open={here ? "" : undefined}>
              <h3 className={styles.caseHead}>
                <button
                  type="button"
                  className={styles.caseButton}
                  aria-expanded={here}
                  aria-controls={`cenario-${item.id}`}
                  onClick={() => choose(i)}
                >
                  <span className={styles.caseIndex} aria-hidden="true">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className={styles.caseChoice}>{item.choice}</span>
                </button>
              </h3>

              {/* Always laid out and folded to nothing, so opening it animates; hidden from assistive tech while folded. */}
              <div id={`cenario-${item.id}`} className={styles.caseBody} aria-hidden={!here}>
                <div>
                  <dl className={styles.facts}>
                    <div className={styles.fact}>
                      <dt>{labels.happened}</dt>
                      <dd>{item.happened}</dd>
                    </div>
                    <div className={styles.fact}>
                      <dt>{labels.found}</dt>
                      <dd>{item.found}</dd>
                    </div>
                    <div className={styles.fact} data-why="">
                      <dt>{labels.why}</dt>
                      <dd>{item.why}</dd>
                    </div>
                    <div className={styles.fact}>
                      <dt>{labels.action}</dt>
                      <dd>{item.action}</dd>
                    </div>
                  </dl>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className={styles.caseScreen}>
        <AppFrame
          key={scenario.id}
          screen="Oportunidades"
          rail="oportunidades"
          chip="Demo"
          className={styles.caseFrame}
        >
          <OpportunityCard screen={scenario.screen} stage="draft" draftLabel={labels.draft} reviewNote={labels.review} />
        </AppFrame>
        <p className={styles.note}>{note}</p>
      </div>
    </div>
  );
}

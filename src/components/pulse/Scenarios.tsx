"use client";

import { useRef, useState, type CSSProperties } from "react";

import { AppFrame, OpportunityCard, type OppScreen } from "./product";
import { focusTab, onTabKeys, tabIndex } from "./tabs";
import { track } from "./track";
import styles from "./interactive.module.css";

/*
  "Isso acontece na sua clínica?" — the page's centre.

  Three situations a clinic recognises. Choosing one changes one area: the
  four things worth knowing about it on the left (what happened, what the
  Pulse found, why it deserves attention, what the team can do), and on the
  right the same front open in the product, down to the drafted message.

  Why the card is shown fully open rather than animating through its stages:
  nothing on this page should make someone wait to read. The parts arrive on
  a short stagger — the suggestion, then whom it picked, then the draft — so
  the order the product works in is visible, but every word is there from the
  first frame and the stagger is only how it enters.

  One scenario at a time, on purpose: seven animations competing was the
  thing to avoid.
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
  const strip = useRef<HTMLDivElement>(null);
  const scenario = items[at];

  const choose = (next: number) => {
    setAt(next);
    track("scenario", items[next]?.id);
  };

  return (
    <div className={styles.scenarios}>
      <div
        ref={strip}
        className={styles.choices}
        role="tablist"
        aria-label={pick}
        onKeyDown={(event) =>
          onTabKeys(event, at, items.length, (next) => {
            choose(next);
            focusTab(strip.current, next);
          })
        }
      >
        {items.map((item, i) => (
          <button
            key={item.id}
            type="button"
            data-tab=""
            role="tab"
            id={`cenario-${item.id}`}
            aria-selected={i === at}
            aria-controls={`cenario-painel-${item.id}`}
            tabIndex={tabIndex(i, at)}
            className={styles.choice}
            style={{ "--i": i } as CSSProperties}
            onClick={() => choose(i)}
          >
            <span className={styles.choiceIndex} aria-hidden="true">
              {String(i + 1).padStart(2, "0")}
            </span>
            <span className={styles.choiceText}>{item.choice}</span>
          </button>
        ))}
      </div>

      {/* `key` on the panel restarts the stagger: a new scene, entering. */}
      <div
        key={scenario.id}
        id={`cenario-painel-${scenario.id}`}
        role="tabpanel"
        aria-labelledby={`cenario-${scenario.id}`}
        tabIndex={-1}
        className={styles.scene}
      >
        <div className={styles.story}>
          <section className={styles.step} style={{ "--i": 0 } as CSSProperties}>
            <h3 className={styles.stepLabel}>{labels.happened}</h3>
            <p className={styles.stepText}>{scenario.happened}</p>
          </section>

          <section className={styles.step} style={{ "--i": 1 } as CSSProperties}>
            <h3 className={styles.stepLabel}>{labels.found}</h3>
            <p className={styles.stepText}>{scenario.found}</p>
          </section>

          {/* The reason is the one block that gets a mark of its own: it is why
              this front is above the others. */}
          <section className={styles.step} data-why="" style={{ "--i": 2 } as CSSProperties}>
            <h3 className={styles.stepLabel}>{labels.why}</h3>
            <p className={styles.stepText}>{scenario.why}</p>
          </section>

          <section className={styles.step} style={{ "--i": 3 } as CSSProperties}>
            <h3 className={styles.stepLabel}>{labels.action}</h3>
            <p className={styles.stepText}>{scenario.action}</p>
          </section>
        </div>

        <div className={styles.sceneScreen}>
          <p className={styles.sceneScreenLabel}>{labels.screen}</p>
          <AppFrame screen="Oportunidades" rail="oportunidades" chip="Demo" className={styles.sceneFrame}>
            <OpportunityCard screen={scenario.screen} stage="draft" draftLabel={labels.draft} reviewNote={labels.review} />
          </AppFrame>
          <p className={styles.note}>{note}</p>
        </div>
      </div>
    </div>
  );
}

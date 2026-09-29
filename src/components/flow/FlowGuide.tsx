"use client";

import { useRef, useState } from "react";

import { flow } from "@/data/flow";
import { cn } from "@/lib/utils";
import { PassoFigure } from "@/variants/a/PassoFigure";
import { STAND } from "@/variants/a/passoRig";
import styles from "./FlowGuide.module.css";

/*
  PASSO as the Flow's guide: he stands beside the hero and offers to show one
  forgotten opportunity. Nothing plays on its own: each step waits for a
  press, and he hops once as it changes. One button carries the whole walk
  (its label changes), so focus never drops.
*/

const { guide } = flow;
const DONE = guide.steps.length;

export function FlowGuide({ className }: { className?: string }) {
  const [step, setStep] = useState(-1);
  const figure = useRef<SVGSVGElement>(null);

  const advance = () => {
    setStep((s) => (s >= DONE ? 0 : s + 1));
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    figure.current?.animate(
      [
        { transform: "none" },
        { transform: `translateY(-${reduced ? 2 : 7}%)`, offset: 0.45, easing: "cubic-bezier(0.6, 0, 0.8, 0.4)" },
        { transform: "none" },
      ],
      { duration: reduced ? 260 : 420, easing: "cubic-bezier(0.2, 0.8, 0.3, 1)" },
    );
  };

  const current = step >= 0 && step < DONE ? guide.steps[step] : null;
  const label = step < 0 ? guide.start : step >= DONE ? guide.restart : guide.next;

  return (
    <div className={cn(styles.guide, className)}>
      <div className={styles.bubble} data-surface="graphite">
        <div key={step} className={styles.say} aria-live="polite">
          {current ? (
            <>
              <p className={styles.tag}>
                <span className={styles.count}>
                  {step + 1}/{DONE}
                </span>
                {current.tag}
              </p>
              <p className={styles.text}>{current.text}</p>
              <ul className={styles.detail}>
                {current.detail.map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
            </>
          ) : (
            <p className={styles.text}>{step < 0 ? guide.invite : guide.done}</p>
          )}
        </div>

        <div className={styles.controls}>
          <span className={styles.progress} aria-hidden="true">
            {guide.steps.map((s, i) => (
              <span key={s.tag} data-on={i <= step ? "" : undefined} />
            ))}
          </span>
          <button type="button" className={styles.action} onClick={advance} data-cursor="action">
            {label}
            <span className={styles.arrow} aria-hidden="true">
              →
            </span>
          </button>
        </div>
      </div>

      <svg
        ref={figure}
        className={styles.figure}
        viewBox="24 40 192 252"
        aria-hidden="true"
        focusable="false"
      >
        <PassoFigure pose={STAND} mode="idle" />
      </svg>
      <p className={styles.note}>{guide.note}</p>
    </div>
  );
}

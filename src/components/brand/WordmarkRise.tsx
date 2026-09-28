import type { CSSProperties } from "react";

import { cn } from "@/lib/utils";
import { standard } from "./paths";
import styles from "./WordmarkRise.module.css";

const LETTERS = ["w", "u", "a", "v", "y"] as const;

/**
 * The wordmark whose letters rise out of the baseline, one after another
 * (84 ms apart, two wave steps). The box is the mask. Each letter is its own
 * full-size SVG layer, so the rise is a plain transform the compositor moves,
 * instead of repainting the whole wordmark on every frame. Waits for the
 * intro to start opening when there is one (html[data-intro-open], or
 * [data-intro-done] when it was skipped).
 */
export function WordmarkRise({ className, delay = 0 }: { className?: string; delay?: number }) {
  const { letters } = standard;
  return (
    <span
      className={cn(styles.mark, className)}
      style={{ "--d0": `${delay}ms`, aspectRatio: `${standard.width} / ${standard.height}` } as CSSProperties}
      aria-hidden="true"
    >
      {LETTERS.map((key, n) => (
        <svg
          key={key}
          viewBox={standard.viewBox}
          className={styles.letter}
          style={{ "--n": n } as CSSProperties}
          xmlns="http://www.w3.org/2000/svg"
          focusable="false"
          data-anim=""
        >
          <path d={letters[key]} fill="currentColor" fillRule="evenodd" />
        </svg>
      ))}
    </span>
  );
}

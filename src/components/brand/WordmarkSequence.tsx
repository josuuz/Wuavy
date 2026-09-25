import type { CSSProperties } from "react";

import { cn } from "@/lib/utils";
import { standard } from "./paths";
import styles from "./WordmarkSequence.module.css";

interface WordmarkSequenceProps {
  /** `load` plays on first paint; `inview` waits for the RevealObserver. */
  trigger?: "load" | "inview";
  /** Delay before the sequence starts, in ms. */
  start?: number;
  className?: string;
  /** Hide from assistive tech when WUAVY is already named nearby. */
  decorative?: boolean;
}

/**
 * The logo sequence (brandbook/motion/logo.html), 1.8 s:
 * V meets V, then U, A, V and Y propagate on width, then the channel
 * runs through AV and leaves. The last frame is the only resting state.
 * Pure CSS: no JavaScript is needed for it to play.
 */
export function WordmarkSequence({
  trigger = "load",
  start = 0,
  className,
  decorative = false,
}: WordmarkSequenceProps) {
  const { letters, wSplit, channel } = standard;

  return (
    <svg
      viewBox={standard.viewBox}
      className={cn(styles.svg, className)}
      style={{ "--t0": `${start}ms` } as CSSProperties}
      xmlns="http://www.w3.org/2000/svg"
      {...(trigger === "inview" ? { "data-reveal": "" } : {})}
      {...(decorative ? { "aria-hidden": true, focusable: false } : { role: "img", "aria-label": "WUAVY" })}
    >
      <g fill="currentColor" fillRule="evenodd">
        <path d={wSplit.left} className={styles.vLeft} data-anim="" />
        <path d={wSplit.right} className={styles.vRight} data-anim="" />
        <path d={letters.w} className={styles.w} data-anim="" />
        {(["u", "a", "v", "y"] as const).map((key, n) => (
          <path
            key={key}
            d={letters[key]}
            className={styles.letter}
            style={{ "--n": n } as CSSProperties}
            data-anim=""
          />
        ))}
      </g>
      <line
        x1={channel.x1}
        y1={channel.y1}
        x2={channel.x2}
        y2={channel.y2}
        strokeWidth={channel.width}
        pathLength={1}
        className={styles.channel}
        data-anim=""
      />
    </svg>
  );
}

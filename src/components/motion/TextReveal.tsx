import { Fragment, type CSSProperties } from "react";

import { splitWords, waveDelay } from "@/lib/motion/wave";

interface TextRevealProps {
  text: string;
  /** `load`: plays on first paint. `inview`: waits for the viewport. */
  trigger?: "load" | "inview";
  /** Delay before the first word, in ms. */
  delay?: number;
  /** Delay between words, in ms. Defaults to two wave steps. */
  step?: number;
}

/**
 * Words rise into their own clip, one after the other (the brand's type
 * entry, per word so line breaks never move). Renders inline: put it inside
 * the heading or paragraph that owns the text. Words stay real text, so
 * assistive tech reads the sentence normally.
 */
export function TextReveal({ text, trigger = "load", delay = 0, step = 84 }: TextRevealProps) {
  const words = splitWords(text);

  return (
    <span {...(trigger === "inview" ? { "data-reveal": "" } : {})}>
      {words.map((word, i) => (
        <Fragment key={i}>
          <span
            className="m-word"
            style={{ "--d": `${waveDelay(i, { base: delay, step })}ms` } as CSSProperties}
            data-anim=""
          >
            {word}
          </span>
          {i < words.length - 1 ? " " : null}
        </Fragment>
      ))}
    </span>
  );
}

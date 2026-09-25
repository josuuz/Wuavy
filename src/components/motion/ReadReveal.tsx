import { Fragment, type CSSProperties } from "react";

import { splitWords } from "@/lib/motion/wave";
import { cn } from "@/lib/utils";

interface ReadRevealProps {
  text: string;
  className?: string;
  /** Words (exact, punctuation included) that take the accent when lit. */
  accents?: string[];
}

/**
 * A paragraph that lights up word by word as it crosses the screen, driven
 * by the scroll itself (CSS view timeline, no JS). Idea from 21st.dev
 * "Text Scroll Read"; unsupported browsers show it lit.
 */
export function ReadReveal({ text, className, accents = [] }: ReadRevealProps) {
  const words = splitWords(text);
  return (
    <span className={cn("m-read", className)} style={{ "--n": words.length } as CSSProperties}>
      {words.map((word, i) => (
        <Fragment key={i}>
          <span className={cn("m-read-word", accents.includes(word) && "m-read-accent")} style={{ "--i": i } as CSSProperties}>
            {word}
          </span>
          {i < words.length - 1 ? " " : null}
        </Fragment>
      ))}
    </span>
  );
}

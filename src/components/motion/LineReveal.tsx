"use client";

import { Fragment, useLayoutEffect, useRef, type CSSProperties } from "react";

import { splitWords } from "@/lib/motion/wave";
import { cn } from "@/lib/utils";

interface LineRevealProps {
  text: string;
  /** Delay before the first line, in ms (after entering the viewport). */
  delay?: number;
  /** Delay between lines, in ms. */
  step?: number;
  /** One word (exact match, punctuation included) that carries the accent mark. */
  emphasis?: string;
  emphasisClassName?: string;
}

/**
 * Headlines rise line by line through a fixed mask at each line's baseline.
 * The server renders words in reading order (word-level stagger works without
 * JS); on the client the words are grouped by the line they actually landed
 * on, so the reveal follows the real line breaks at every width.
 * Technique adapted from 21st.dev "Text Reveal (Mask)" (soralabs), rebuilt
 * CSS-first on this site's reveal gate. Words stay real text for assistive tech.
 */
export function LineReveal({ text, delay = 0, step = 110, emphasis, emphasisClassName }: LineRevealProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const words = splitWords(text);

  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    const assign = () => {
      const spans = Array.from(root.querySelectorAll<HTMLElement>(".m-line"));
      let line = -1;
      let lastTop = Number.NEGATIVE_INFINITY;
      for (const span of spans) {
        // offsetTop ignores transforms, so a mid-animation measure is still true.
        if (span.offsetTop > lastTop + 2) {
          line += 1;
          lastTop = span.offsetTop;
        }
        span.style.setProperty("--d", `${delay + line * step}ms`);
      }
    };
    assign();
    const observer = new ResizeObserver(assign);
    observer.observe(root);
    return () => observer.disconnect();
  }, [delay, step, text]);

  return (
    <span ref={ref} data-reveal="">
      {words.map((word, i) => (
        <Fragment key={i}>
          <span
            className={cn("m-line", word === emphasis && emphasisClassName)}
            style={{ "--d": `${delay + i * 40}ms` } as CSSProperties}
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

"use client";

import { Fragment, useCallback, useRef, type CSSProperties } from "react";

import { splitChars, splitWords } from "@/lib/motion/wave";
import { cn } from "@/lib/utils";

interface WidthWaveProps {
  text: string;
  /**
   * What happens when the text enters the viewport:
   * `settle` — characters arrive wide and settle to 100 (the brand type entry);
   * `wave` — one wave passes 100 → 125 → 100; `none` — nothing.
   */
  entry?: "settle" | "wave" | "none";
  /** Pass a wave through the text when its host is hovered (pointer devices only). */
  hover?: boolean;
  /**
   * Element that listens for hover. `self` or the closest ancestor matching
   * `[data-wave-host]` — so a whole row can trigger its title.
   */
  hoverHost?: "self" | "closest";
  /** Delay before the first character, in ms. */
  delay?: number;
  className?: string;
}

/**
 * Width shift (brand motion #2): the width axis travels through the word
 * like a wave, neighbours 42 ms apart. Width never carries hierarchy; it only
 * moves. Characters are aria-hidden; the full text is read once.
 */
export function WidthWave({
  text,
  entry = "none",
  hover = false,
  hoverHost = "self",
  delay = 0,
  className,
}: WidthWaveProps) {
  const ref = useRef<HTMLSpanElement>(null);
  // Each character keeps its position in the whole text: that is the propagation order.
  const words = splitWords(text).reduce<Array<{ chars: string[]; offset: number }>>((acc, word) => {
    const prev = acc[acc.length - 1];
    acc.push({ chars: splitChars(word), offset: prev ? prev.offset + prev.chars.length : 0 });
    return acc;
  }, []);

  const attach = useCallback(
    (node: HTMLSpanElement | null) => {
      ref.current = node;
      if (!node || !hover) return;
      const host = hoverHost === "closest" ? (node.closest<HTMLElement>("[data-wave-host]") ?? node) : node;

      const onEnter = (event: PointerEvent) => {
        if (event.pointerType !== "mouse") return;
        if (node.hasAttribute("data-waving")) return;
        // A finished entry must not replay once the wave ends.
        if (node.dataset.entry && node.dataset.entry !== "done") node.dataset.entry = "done";
        node.setAttribute("data-waving", "");
        const chars = node.querySelectorAll<HTMLElement>(".m-char");
        const last = chars[chars.length - 1];
        last?.addEventListener("animationend", () => node.removeAttribute("data-waving"), { once: true });
      };

      host.addEventListener("pointerenter", onEnter);
      return () => host.removeEventListener("pointerenter", onEnter);
    },
    [hover, hoverHost],
  );

  return (
    <span
      ref={attach}
      className={cn("m-wave", className)}
      data-entry={entry === "none" ? undefined : entry}
      style={{ "--d0": `${delay}ms` } as CSSProperties}
      {...(entry !== "none" ? { "data-reveal": "" } : {})}
    >
      <span className="sr-only">{text}</span>
      <span aria-hidden="true">
        {words.map((word, w) => (
          <Fragment key={w}>
            <span className="whitespace-nowrap">
              {word.chars.map((char, c) => (
                <span
                  key={c}
                  className="m-char"
                  style={{ "--i": word.offset + c } as CSSProperties}
                  {...(entry !== "none" ? { "data-anim": "" } : {})}
                >
                  {char}
                </span>
              ))}
            </span>
            {w < words.length - 1 ? " " : null}
          </Fragment>
        ))}
      </span>
    </span>
  );
}

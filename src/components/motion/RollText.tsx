import { Fragment, type CSSProperties } from "react";

import { splitChars, splitWords } from "@/lib/motion/wave";

/**
 * Link text that rolls up letter by letter on hover, 18 ms apart, and the
 * copy underneath takes its place (idea from 21st.dev "Stagger Text").
 * Letters are grouped by word, so long names wrap between words only.
 * Put it inside the link; the link is the hover host. CSS only.
 */
export function RollText({ text }: { text: string }) {
  const words = splitWords(text).reduce<Array<{ chars: string[]; offset: number }>>((acc, word) => {
    const prev = acc[acc.length - 1];
    acc.push({ chars: splitChars(word), offset: prev ? prev.offset + prev.chars.length + 1 : 0 });
    return acc;
  }, []);

  const row = (under: boolean) => (
    <span className="m-roll-row" aria-hidden="true" data-under={under ? "" : undefined}>
      {words.map((word, w) => (
        <Fragment key={w}>
          <span className="m-roll-word">
            {word.chars.map((c, i) => (
              <span key={i} className="m-roll-char" style={{ "--i": word.offset + i } as CSSProperties}>
                {c}
              </span>
            ))}
          </span>
          {w < words.length - 1 ? " " : null}
        </Fragment>
      ))}
    </span>
  );

  return (
    <span className="m-roll">
      <span className="sr-only">{text}</span>
      {row(false)}
      {row(true)}
    </span>
  );
}

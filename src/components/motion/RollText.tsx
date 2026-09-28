import { Fragment, type CSSProperties } from "react";

import { splitChars, splitWords } from "@/lib/motion/wave";

/**
 * Link text that rolls up letter by letter on hover, 18 ms apart, and the
 * copy underneath takes its place (idea from 21st.dev "Stagger Text").
 * Each word rolls inside its own box with its copy right under it, so a name
 * that wraps onto two lines still rolls in place, line by line.
 * Put it inside the link; the link is the hover host. CSS only.
 */
export function RollText({ text }: { text: string }) {
  const words = splitWords(text).reduce<Array<{ chars: string[]; offset: number }>>((acc, word) => {
    const prev = acc[acc.length - 1];
    acc.push({ chars: splitChars(word), offset: prev ? prev.offset + prev.chars.length + 1 : 0 });
    return acc;
  }, []);

  const chars = (word: (typeof words)[number]) =>
    word.chars.map((c, i) => (
      <span key={i} className="m-roll-char" style={{ "--i": word.offset + i } as CSSProperties}>
        {c}
      </span>
    ));

  return (
    <span className="m-roll">
      <span className="sr-only">{text}</span>
      <span aria-hidden="true">
        {words.map((word, w) => (
          <Fragment key={w}>
            <span className="m-roll-word">
              <span className="m-roll-row">{chars(word)}</span>
              <span className="m-roll-row" data-under="">
                {chars(word)}
              </span>
            </span>
            {w < words.length - 1 ? " " : null}
          </Fragment>
        ))}
      </span>
    </span>
  );
}

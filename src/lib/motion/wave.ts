import { waveStep } from "./tokens";

/**
 * Propagation delay for the i-th neighbour, in ms.
 * The small sine term is the brand's own irregularity (brandbook/motion/type.html):
 * a wave, not a metronome.
 */
export function waveDelay(i: number, { base = 0, step = waveStep, organic = false } = {}): number {
  const drift = organic ? Math.sin(i * 0.8) * 14 : 0;
  return Math.round(base + i * step + drift);
}

/** Splits text into words, keeping their order index for propagation. */
export function splitWords(text: string): string[] {
  // Plain whitespace only: a no-break space (U+00A0) keeps two words together.
  return text.split(/[ \t\n\r]+/).filter(Boolean);
}

/** Splits a word into grapheme-safe characters (accents stay attached). */
export function splitChars(word: string): string[] {
  return Array.from(word.normalize("NFC"));
}

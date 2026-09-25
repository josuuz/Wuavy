/**
 * Joins class names, skipping falsy values.
 * Same call signature as the `cn()` helper used by shadcn / 21st.dev components,
 * so those can be dropped in. Swap for clsx + tailwind-merge only when a
 * component actually needs class conflict resolution.
 */
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

/**
 * True when a display line carries a glyph that drops below the baseline
 * (Ç, a comma). At display leading (0.84) it would touch the line below.
 */
export function hasDescender(line: string): boolean {
  return /[Çç,;]/.test(line);
}

/** Zero-padded index for chapter heads and steps: 1 → "01". */
export function pad(n: number): string {
  return String(n).padStart(2, "0");
}

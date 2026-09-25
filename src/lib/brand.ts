/**
 * Brand colours for contexts that cannot read CSS variables (generated
 * images, browser theme colour). Mirrors src/styles/tokens.css — change both together.
 */
export const brandColors = {
  black: "#000000",
  paper: "#EDEEEA",
  signal: "#FF4513",
  carbon: "#0C0D0D",
} as const;

/** "r, g, b" from a #RRGGBB brand colour, for rgba() in canvas drawing. */
export function rgbOf(hex: string): string {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(", ");
}

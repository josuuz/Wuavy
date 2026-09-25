/**
 * Motion tokens for JavaScript-driven animation (WAAPI today, Motion later).
 * Mirrors the CSS tokens in src/styles/tokens.css — change both together.
 */
export const ease = {
  out: "cubic-bezier(0.16, 1, 0.3, 1)",
  inOut: "cubic-bezier(0.76, 0, 0.24, 1)",
  /** Same curves as arrays, the format motion/react expects. */
  outArray: [0.16, 1, 0.3, 1] as const,
  inOutArray: [0.76, 0, 0.24, 1] as const,
} as const;

export const duration = {
  ui: 180,
  element: 420,
  scene: 760,
} as const;

/** Delay between neighbours in a propagation. */
export const waveStep = 42;

/** The only diagonal in the system, in degrees. */
export const angle = 20.81;

/** Horizontal run of the brand angle per unit of height: tan(20.81°). */
export const angleRun = Math.tan((angle * Math.PI) / 180);

/** The logo sequence (brandbook/motion/logo.html), in ms from its start. */
export const logoSequence = {
  cross: { duration: 560 },
  letters: { duration: 640, start: 360, step: 84 },
  channel: { duration: 760, start: 1050 },
  rest: 1810,
} as const;

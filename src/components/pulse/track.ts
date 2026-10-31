/*
  The public page's funnel, without adding a service.

  This project has no analytics installed — no @vercel/analytics, no gtag, no
  third-party tag anywhere — and this page was not the place to add one. So a
  step is only announced on `window`, as one CustomEvent. Whatever is added
  later (Vercel Analytics, Plausible, a route of our own) subscribes to
  "wuavy:pulse" and forwards it; until then nothing leaves the browser.

  The signed-in journey already has its own record on the server
  (lib/flow/session.ts → markJourney, migration 0005). This is the half that
  happens before an account exists, which that one cannot see.

  Never any personal data: a step's name, and at most which scenario, front or
  screen was opened. There is nothing here to identify a visitor by.
*/

export type PulseStep =
  /** The short demonstration on this page started or was resumed. */
  | "demo_start"
  /** One of the three situations was chosen. */
  | "scenario"
  /** One of the seven fronts was opened. */
  | "front"
  /** One of the product's screens was opened in the tour. */
  | "screen"
  /** Left for the full demo, which asks for an account. */
  | "demo_full"
  /** Left for the checkout. */
  | "subscribe";

export interface PulseEvent {
  step: PulseStep;
  /** Which scenario, front or screen — an id from this page, never a person. */
  id?: string;
}

export const PULSE_EVENT = "wuavy:pulse";

export function track(step: PulseStep, id?: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<PulseEvent>(PULSE_EVENT, { detail: { step, id } }));
}

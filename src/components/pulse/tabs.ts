import type { KeyboardEvent } from "react";

/*
  The keyboard for a tab strip, in one place: this page has four of them (the
  hero's four beats, the three situations, the seven fronts, the five
  screens) and they must all answer the arrows the same way.

  The pattern is the usual one for tabs: the strip is one tab stop, Left and
  Right (and Up and Down, since two of these strips stand vertically on a
  phone) move the selection and the focus, Home and End jump to the ends, and
  the selection wraps. Only the selected tab is reachable with Tab, which is
  what `tabIndex` below is for.
*/

/** `tabIndex` for the tab at `index`: only the selected one is in the tab order. */
export const tabIndex = (index: number, current: number) => (index === current ? 0 : -1);

/**
 * Arrow keys over a strip of `count` tabs. Calls `go` with the index to move
 * to and returns true when it handled the key, so the caller can leave its
 * own `onKeyDown` at that.
 */
export function onTabKeys(event: KeyboardEvent<HTMLElement>, current: number, count: number, go: (next: number) => void) {
  const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
  const next = step !== undefined ? (current + step + count) % count : event.key === "Home" ? 0 : event.key === "End" ? count - 1 : null;
  if (next === null) return false;
  event.preventDefault();
  go(next);
  return true;
}

/**
 * Moves the focus onto the tab that was just selected by a key, so the eye
 * and the focus ring stay together. The strip's buttons carry data-tab.
 */
export function focusTab(strip: HTMLElement | null, index: number) {
  strip?.querySelectorAll<HTMLElement>("[data-tab]")[index]?.focus();
}

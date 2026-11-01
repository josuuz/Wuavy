"use client";

import { useEffect, useState, useSyncExternalStore, type CSSProperties, type RefObject } from "react";

import styles from "./demo.module.css";

/*
  The small parts the two demonstrations share (the first screen's, and the
  one in "Veja como o PULSE ajuda sua equipe a agir"): the reduced-motion
  switch, the typing of a draft, and the demonstrative cursor.

  Kept apart so the two scenes can differ in what they tell and still behave
  the same: they type the same way, point the same way, and give up the same
  things when motion is turned down.
*/

const REDUCED = "(prefers-reduced-motion: reduce)";

const subscribe = (notify: () => void) => {
  const query = window.matchMedia(REDUCED);
  query.addEventListener("change", notify);
  return () => query.removeEventListener("change", notify);
};

/** Whether the visitor asked for less motion. On the server it is false, and corrected on hydration. */
export function useReducedMotion() {
  return useSyncExternalStore(subscribe, () => window.matchMedia(REDUCED).matches, () => false);
}

/**
 * Whether `target` is in view enough (`threshold`) AND the tab is the one in
 * front. A demonstration only has a reason to run while both are true; when
 * either stops being, its clock rests, and it resumes from the same place.
 */
export function usePresence(target: RefObject<Element | null>, threshold: number) {
  const [inView, setInView] = useState(false);
  const [shown, setShown] = useState(true);

  useEffect(() => {
    const el = target.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { threshold });
    observer.observe(el);
    return () => observer.disconnect();
  }, [target, threshold]);

  useEffect(() => {
    const sync = () => setShown(document.visibilityState === "visible");
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, []);

  return inView && shown;
}

/**
 * Where a demonstration is in its life, and the one button that follows it:
 *
 *   ready    never played            "Reproduzir demonstração"
 *   playing  running                 "Pausar"
 *   paused   held by the visitor     "Continuar"
 *   done     reached the last scene  "Repetir"
 *   manual   the visitor took it     "Reproduzir demonstração" (watch it again)
 *
 * "manual" is entered only by an explicit act: pressing a scene, a situation or a
 * button of the simulation. Moving the pointer over it, or focusing it, is not one.
 */
export type PlayMode = "ready" | "playing" | "paused" | "done" | "manual";

export function playLabel(
  mode: PlayMode,
  copy: { play: string; pause: string; resume: string; replay: string },
) {
  if (mode === "playing") return copy.pause;
  if (mode === "paused") return copy.resume;
  if (mode === "done") return copy.replay;
  return copy.play;
}

/**
 * How many characters of `text` are written. While `active` it types them,
 * starting after `delay`; when `active` ends it rewinds for the next lap.
 * With reduced motion there is no typing: the text is whole as soon as it is active.
 */
export function useTyped(text: string, active: boolean, reduced: boolean, delay = 700, every = 24) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!active || reduced) return;
    let interval = 0;
    const start = window.setTimeout(() => {
      interval = window.setInterval(() => {
        setCount((n) => {
          if (n + 1 >= text.length) window.clearInterval(interval);
          return Math.min(n + 1, text.length);
        });
      }, every);
    }, delay);
    return () => {
      window.clearTimeout(start);
      window.clearInterval(interval);
      setCount(0);
    };
  }, [active, reduced, text, delay, every]);

  if (!active) return 0;
  return reduced ? text.length : count;
}

/** Where, inside `box`, the cursor should rest to point at `target`: a little inside its middle. */
export function pointAt(box: HTMLElement | null, target: HTMLElement | null) {
  if (!box || !target) return null;
  const b = box.getBoundingClientRect();
  const t = target.getBoundingClientRect();
  return { x: t.left - b.left + t.width * 0.58, y: t.top - b.top + t.height * 0.62 };
}

export interface CursorSpot {
  x: number;
  y: number;
}

/**
 * The demonstrative cursor. It is a drawing: it moves between the buttons the
 * scene wants to show being pressed, shrinks and sends out a ring when it
 * "clicks", and never receives a real event. Hidden from assistive tech.
 */
export function DemoCursor({ spot, on, press }: { spot: CursorSpot | null; on: boolean; press: boolean }) {
  return (
    <div
      className={styles.cursor}
      aria-hidden="true"
      data-on={on && spot ? "" : undefined}
      data-press={press ? "" : undefined}
      style={{ "--x": spot?.x, "--y": spot?.y } as CSSProperties}
    >
      <svg viewBox="0 0 24 24" width="24" height="24" focusable="false">
        <path d="M5 3l14 8-6.2 1.6L9.6 19z" fill="#fff" stroke="#1c1b19" strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

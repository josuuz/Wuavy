"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type RefObject } from "react";

import styles from "./demo.module.css";

/*
  The small parts the two demonstrations share (the first screen's, and the
  one in "Veja como o PULSE ajuda sua equipe a agir"): the reduced-motion
  switch, the presence check (in view, tab in front), and the demonstrative
  cursor.

  Kept apart so the two scenes can differ in what they tell and still behave
  the same: they point the same way, and give up the same things when motion
  is turned down.
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
 * Both demonstrations play by themselves, in a loop, while they are in view and
 * the tab is in front. The visitor's only control is to hold them:
 * "Pausar" / "Continuar". Everything else (a scene mark, a situation, a button of
 * the simulation) just moves the story and lets it carry on from there.
 */
export type PlayMode = "playing" | "paused";

/*
  The demonstrative cursor is an ordinary arrow: white, dark outline, drawn at
  CURSOR px. It belongs to the demonstration only; the visitor's own pointer is
  never read, hidden or moved. Its tip is at (5, 3) in the 24-unit drawing, so
  to point at something the element is placed up and to the left of it by TIP.
*/
export const CURSOR = 28;
const TIP = { x: (5 / 24) * CURSOR, y: (3 / 24) * CURSOR };

/** Where the cursor element goes so that its tip rests on the middle of `target`, inside `box`. */
export function pointAt(box: HTMLElement | null, target: HTMLElement | null) {
  if (!box || !target) return null;
  const b = box.getBoundingClientRect();
  const t = target.getBoundingClientRect();
  return { x: t.left - b.left + t.width / 2 - TIP.x, y: t.top - b.top + t.height / 2 - TIP.y };
}

export interface CursorSpot {
  x: number;
  y: number;
  on: boolean;
  /** Riding its target while the layout settles under it (no glide, no lag). */
  follow?: boolean;
}

/**
 * The cursor's place and visibility, driven by the demonstration's own clock so
 * that a pause freezes it with everything else. It always arrives before the
 * click: `park` puts it, unseen, to the lower right of the target; `go` shows it
 * and lets it glide onto the target's middle; `hide` lets it fade.
 * On resize it is put back on its target.
 */
export function useDemoCursor(box: RefObject<HTMLElement | null>) {
  const [spot, setSpot] = useState<CursorSpot>({ x: 0, y: 0, on: false });
  const target = useRef<HTMLElement | null>(null);
  const live = useRef(false);

  const spotRef = useRef(spot);
  const place = (on: boolean, from?: boolean) => {
    const at = pointAt(box.current, target.current);
    const room = box.current?.getBoundingClientRect();
    if (!at || !room) return;
    // The entry point: down and to the right of the target, kept inside the stage.
    const x = from ? Math.min(at.x + 150, room.width - CURSOR) : at.x;
    const y = from ? Math.min(at.y + 90, room.height - CURSOR) : at.y;
    spotRef.current = { x, y, on };
    setSpot(spotRef.current);
  };

  useEffect(() => {
    const onResize = () => {
      if (live.current && target.current) place(true);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    spot,
    park: (el: HTMLElement | null) => {
      target.current = el;
      live.current = false;
      place(false, true);
    },
    go: (el: HTMLElement | null) => {
      target.current = el;
      live.current = true;
      place(true);
    },
    /**
     * Stays on the target's middle while the layout moves under it (a card that opens
     * recentres, and the button goes with it): the cursor rides along instead of being left behind.
     */
    follow: (el: HTMLElement | null) => {
      if (!live.current) return;
      const at = pointAt(box.current, el);
      const now = spotRef.current;
      if (!at || (Math.abs(at.x - now.x) < 0.4 && Math.abs(at.y - now.y) < 0.4)) return;
      spotRef.current = { x: at.x, y: at.y, on: true, follow: true };
      setSpot(spotRef.current);
    },
    /** Whether it is on stage now, so a second click can carry on from where the first left it. */
    live: () => live.current,
    hide: () => {
      live.current = false;
      setSpot((s) => (s.on ? { ...s, on: false } : s));
    },
  };
}

/**
 * The demonstrative cursor. It is a drawing: it glides between the buttons the
 * scene shows being pressed, sinks a little and sends out a quiet ring when it
 * "clicks", and never receives a real event. Hidden from assistive tech.
 */
export function DemoCursor({ spot, press }: { spot: CursorSpot; press: boolean }) {
  return (
    <div
      className={styles.cursor}
      aria-hidden="true"
      data-on={spot.on ? "" : undefined}
      data-follow={spot.follow ? "" : undefined}
      data-press={press ? "" : undefined}
      style={{ "--x": spot.x, "--y": spot.y } as CSSProperties}
    >
      <svg viewBox="0 0 24 24" width={CURSOR} height={CURSOR} focusable="false">
        <path d="M5 3l14 8-6.2 1.6L9.6 19z" fill="#fff" stroke="#1c1b19" strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

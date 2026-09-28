"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

import { guide } from "@/data/passo";
import { requestFrame, subscribeFrame } from "@/lib/motion/frame";
import { PassoFigure } from "./PassoFigure";
import { PassoGuide } from "./PassoGuide";
import {
  PASSO_FEET,
  PASSO_HEIGHT,
  SHOULDER_L,
  SHOULDER_R,
  STAND,
  armPath,
  mixPose,
  peekPose,
  walkPose,
} from "./passoRig";
import styles from "./PassoJourney.module.css";

/*
  PASSO's walk. He starts on his spot in the crowd ([data-passo-anchor], drawn
  by PassoStill) and, as the page scrolls down, walks up the screen to the
  header ([data-passo-dock]). There he sinks behind its bottom edge until
  about half of him is hidden, rests both hands on the edge and peeks to the
  right. Scrolling back, he climbs out and walks back into the crowd.

  His place on the way follows the scroll exactly (his start is a live spot in
  the photo, so a lagging place would pull him off his path); his stride opens
  with the speed and eases shut when the scroll rests. The peek is its own
  small timed move: a dip just past the rest, then back up. One fixed element above the
  page (portalled to <body>, so no section's stacking context can hold it
  under the header), run on the shared scroll frame (lib/motion/frame): it
  asks for frames only while something moves; parked in the header it does
  nothing. Without a dock he climbs out through the top.

  Pressing him opens his diagnosis (PassoGuide): he hops, climbs out of the
  header to stand while he talks, looks at the card, and the same frame keeps
  the card on him (above him when there is room, else below, else beside).
*/

const RANGE = 0.8; // share of the hero's height the walk takes
const STRIDES = 7; // full steps from the crowd to the header
const SETTLE_MS = 2500; // the photo's settle animation, plus a frame or two
const GAIT_MS = 140; // how long his legs take to catch up with a jump of the scroll
const FULL_STRIDE = 0.0005; // walk progress per ms at which the stride is fully open
const DOCK_H = 0.78; // his standing height in the header, as a share of the header
const PEEK_H = 0.58; // how much of the header his head and shoulders fill once he peeks
const RIM = PASSO_FEET.y; // the header's edge, in his units: where his feet stand
const SINK = PASSO_HEIGHT * 0.46; // how far he sinks behind it: about half, a bit of chest still out
const HAND_R = 7.9; // PassoFigure's hands; they open a little to hold the edge
const GRIP_R = 10;
const SINK_MS = 760;
const RISE_MS = 420;
const HINT_KEY = "wuavy-passo-hint";
const HINT_DELAY_MS = 700; // after he settles into his peek
const HINT_MS = 5200;

// The portal needs document.body, so the walk renders on the client only.
const noSubscribe = () => () => {};
const onClient = () => true;
const onServer = () => false;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (a: number, b: number, v: number) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
// Down behind the edge: a small dip past the rest, then back up to it.
const easeOutBack = (t: number) => 1 + 2.70158 * (t - 1) ** 3 + 1.70158 * (t - 1) ** 2;
const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;

// A hop from his feet: a squash, up, a stretch, down. `lift` in % of the drawing.
const hop = (lift: number, squash: number) => [
  { transform: "none" },
  { transform: `scale(${1 + squash}, ${1 - squash * 1.4})`, offset: 0.16, easing: "cubic-bezier(0.2, 0.8, 0.3, 1)" },
  { transform: `translateY(-${lift}%) scale(${1 - squash / 2}, ${1 + squash / 2})`, offset: 0.5, easing: "cubic-bezier(0.6, 0, 0.8, 0.4)" },
  { transform: `scale(${1 + squash / 1.5}, ${1 - squash})`, offset: 0.84 },
  { transform: "none" },
];

export function PassoJourney() {
  const root = useRef<HTMLDivElement>(null);
  const hit = useRef<HTMLButtonElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const hint = useRef<HTMLButtonElement>(null);
  const talk = useRef({ open: false, dirty: false });
  const placeCard = useRef<() => void>(null);
  const [open, setOpen] = useState(false);
  const mounted = useSyncExternalStore(noSubscribe, onClient, onServer);

  const react = useCallback((kind: "open" | "answer" | "result") => {
    const svg = root.current?.querySelector("svg");
    if (!svg) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const lift = reduced ? 3 : kind === "answer" ? 5 : 8;
    svg.animate(hop(lift, reduced ? 0.02 : 0.06), {
      duration: kind === "result" ? 380 : 440,
      iterations: kind === "result" && !reduced ? 2 : 1,
    });
  }, []);

  const close = useCallback((back: boolean) => {
    setOpen(false);
    if (back) hit.current?.focus({ preventScroll: true });
  }, []);

  // Placed before the first paint, so the card never shows off its spot.
  useLayoutEffect(() => {
    talk.current.open = open;
    placeCard.current?.();
    requestFrame();
  }, [open]);

  useEffect(() => {
    const el = root.current;
    const anchor = document.querySelector<SVGGraphicsElement>("[data-passo-anchor]");
    const hero = document.querySelector<HTMLElement>("[data-hero]");
    const rim = el?.querySelector<SVGGElement>("[data-part='rim']");
    if (!mounted || !el || !rim || !anchor || !hero) return;

    const header = document.querySelector<HTMLElement>("header[data-surface]");
    const dock = document.querySelector<HTMLElement>("[data-passo-dock]");
    const html = document.documentElement;
    const nodes = (part: string) => Array.from(el.querySelectorAll<SVGElement>(`[data-part="${part}"]`));
    const parts = {
      bob: nodes("bob"),
      legL: nodes("legL"),
      legR: nodes("legR"),
      armL: nodes("armL"),
      armR: nodes("armR"),
      handL: nodes("handL"),
      handR: nodes("handR"),
      shadow: nodes("shadow"),
    };
    const set = (list: SVGElement[], name: string, value: string) => list.forEach((n) => n.setAttribute(name, value));

    let settleUntil = performance.now() + SETTLE_MS;
    let last = 0;
    let gait = -1; // the progress his legs have walked; trails the scroll in time
    let walk = 0; // how open his stride is
    let want = 0;
    let peek = 0; // how far he has sunk behind the edge (a little past 1 mid-dip)
    let peekFrom = 0;
    let peekTo = 0;
    let peekAt = 0;
    let viewport = "";
    let parked = false;
    let busy = true;

    const next = { transform: "", k: 0, opacity: "1", pose: "", theta: 0, sink: 0, grip: 0, shadow: "", mode: "idle" };
    const shown = { transform: "", opacity: "", pose: "", shadow: "", mode: "", clip: false };
    // Where he is on screen (his feet and the top of what shows), and where his card goes.
    const spot = { x: 0, feet: 0, top: 0 };
    const place = { transform: "", tail: "", side: "", room: "" };
    const placed = { transform: "", tail: "", side: "", room: "", talk: "" };

    const readCard = () => {
      const c = card.current;
      if (!talk.current.open || !c || (!talk.current.dirty && parked)) return;
      talk.current.dirty = false;
      const w = c.offsetWidth;
      // Its full height, even while a short screen has it scrolling.
      const step = c.lastElementChild as HTMLElement | null;
      const full = c.offsetHeight + (step ? step.scrollHeight - step.clientHeight : 0);
      const vw = html.clientWidth;
      const vh = window.innerHeight;
      const margin = 12;
      const gap = 14;
      const min = (header?.offsetHeight ?? 0) + 8;
      const max = vh - margin;
      const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(v, hi));
      // Never over him: above, else below, else beside him (the side with more
      // room). On a screen too short for any, it takes the larger space above
      // or below and its content scrolls.
      const reach = (spot.feet - spot.top) * 0.3 + gap;
      const right = vw - spot.x >= spot.x;
      let side: string;
      let room = 0;
      if (spot.top - gap - full >= min) side = "above";
      else if (spot.feet + gap + full <= max) side = "below";
      else if (right ? spot.x + reach + w <= vw - margin : spot.x - reach - w >= margin) side = right ? "right" : "left";
      else {
        side = spot.top - min > max - spot.feet ? "above" : "below";
        room = side === "above" ? spot.top - gap - min : max - spot.feet - gap;
      }
      const h = room ? Math.min(full, room) : full;

      let x: number;
      let y: number;
      let tail: number;
      if (side === "left" || side === "right") {
        const middle = (spot.top + spot.feet) / 2;
        x = side === "right" ? spot.x + reach : spot.x - reach - w;
        y = clamp(middle - h / 2, min, max - h);
        tail = clamp(middle - y, 18, h - 18);
      } else {
        x = clamp(spot.x - w / 2, margin, vw - w - margin);
        y = clamp(side === "above" ? spot.top - gap - h : spot.feet + gap, min, max - h);
        tail = clamp(spot.x - x, 18, w - 18);
      }
      place.transform = `translate3d(${x.toFixed(0)}px, ${y.toFixed(0)}px, 0)`;
      place.tail = `${tail.toFixed(0)}px`;
      place.side = side;
      place.room = room ? `${room.toFixed(0)}px` : "";
    };

    const writeCard = () => {
      const c = card.current;
      if (c) {
        if (place.transform !== placed.transform) c.style.transform = placed.transform = place.transform;
        if (place.tail !== placed.tail) c.style.setProperty("--tail", (placed.tail = place.tail));
        if (place.side !== placed.side) c.dataset.place = placed.side = place.side;
        if (place.room !== placed.room) {
          placed.room = place.room;
          if (place.room) c.style.setProperty("--room", place.room);
          else c.style.removeProperty("--room");
        }
      }
      // Talking, he looks at the card.
      const gaze = talk.current.open ? place.side : "";
      if (gaze !== placed.talk) {
        placed.talk = gaze;
        if (gaze) el.dataset.talk = gaze;
        else delete el.dataset.talk;
      }
    };

    placeCard.current = () => {
      talk.current.dirty = true;
      readCard();
      writeCard();
    };

    // The hint: once per visit, a moment after he first peeks from the header,
    // a small bubble says he can help; he hops as it appears. It leaves on its
    // own, when he climbs out, or when his card opens.
    const bubble = hint.current;
    let hintState: "wait" | "armed" | "done" = "wait";
    let hintTimer = 0;
    try {
      if (sessionStorage.getItem(HINT_KEY)) hintState = "done";
    } catch {}

    const retireHint = () => {
      hintState = "done";
      try {
        sessionStorage.setItem(HINT_KEY, "1");
      } catch {}
    };
    const dropHint = () => {
      clearTimeout(hintTimer);
      if (bubble?.hasAttribute("data-show")) bubble.removeAttribute("data-show");
    };
    const showHint = () => {
      if (!bubble) return;
      retireHint();
      const x = Math.min(Math.max(spot.x, 90), html.clientWidth - 90);
      bubble.style.transform = `translate3d(${x.toFixed(0)}px, ${(spot.feet + 12).toFixed(0)}px, 0)`;
      bubble.setAttribute("data-show", "");
      react("answer");
      hintTimer = window.setTimeout(dropHint, HINT_MS);
    };
    // Counted as seen only once it has shown (or his card was opened first).
    const watchHint = () => {
      if (talk.current.open && hintState !== "done") retireHint();
      if (talk.current.open || peekTo !== 1) {
        if (hintState === "armed") hintState = "wait";
        dropHint();
      } else if (hintState === "wait" && peek === 1) {
        hintState = "armed";
        hintTimer = window.setTimeout(showHint, HINT_DELAY_MS);
      }
    };

    const read = (now: number) => {
      const dt = last ? Math.min(64, now - last) : 16;
      last = now;
      const p = clamp01(window.scrollY / Math.max(1, hero.offsetHeight * RANGE));
      const size = `${window.innerWidth}x${window.innerHeight}`;
      const dockOn = Boolean(dock && dock.offsetWidth > 0 && dock.offsetHeight > 0);

      // His legs trail the scroll in time, so a scroll that jumps (a wheel
      // without smooth scrolling, as with system animations off) still plays
      // whole strides instead of a stand. The faster they go, the wider the
      // stride; it eases shut when they have caught up.
      const before = gait < 0 ? p : gait;
      gait = before + (p - before) * (1 - Math.exp(-dt / GAIT_MS));
      if (Math.abs(p - gait) < 0.0005) gait = p;
      const speed = Math.abs(gait - before) / dt;
      want = gait > 0 && gait < 1 ? Math.min(1, speed / FULL_STRIDE) : 0;
      walk += (want - walk) * (1 - Math.exp(-dt / (want > walk ? 90 : 180)));
      if (Math.abs(want - walk) < 0.004) walk = want;

      // Arrived, and the header has its band: down behind the edge. Talking, he stands.
      const aim = p === 1 && dockOn && (!header || header.hasAttribute("data-docked")) && !talk.current.open ? 1 : 0;
      if (aim !== peekTo) {
        peekFrom = peek;
        peekTo = aim;
        peekAt = now;
      }
      const t = clamp01((now - peekAt) / (peekTo ? SINK_MS : RISE_MS));
      peek = t === 1 ? peekTo : mix(peekFrom, peekTo, peekTo ? easeOutBack(t) : easeOutCubic(t));
      watchHint();

      // Parked in the header and nothing changed: no layout reads, no writes.
      busy = gait !== p || walk !== want || want > 0 || t < 1 || now < settleUntil;
      parked = !busy && p === 1 && size === viewport && shown.mode === "docked";
      if (parked) return readCard();
      viewport = size;

      const a = anchor.getBoundingClientRect();
      const d = dock?.getBoundingClientRect();
      const start = { x: a.left + a.width / 2, y: a.bottom, h: a.height };
      const end =
        dockOn && d ? { x: d.left + d.width / 2, y: d.bottom, h: d.height * DOCK_H } : { x: start.x, y: 0, h: start.h * 0.6 };

      const e = smooth(0, 1, p);
      // Sinking, he also leans in: what stays above the edge fills more of the header.
      const peekK = d ? (d.height * PEEK_H) / (PASSO_HEIGHT - SINK) : 0;
      const k = mix(mix(start.h, end.h, e) / PASSO_HEIGHT, peekK, clamp01(peek));
      spot.x = mix(start.x, end.x, e);
      spot.feet = mix(start.y, end.y, e);
      spot.top = spot.feet - k * (PASSO_HEIGHT - SINK * clamp01(peek));
      next.k = k;
      next.transform = `translate3d(${spot.x.toFixed(1)}px, ${spot.feet.toFixed(1)}px, 0) scale(${k.toFixed(4)})`;
      next.opacity = dockOn ? "1" : (1 - smooth(0.7, 1, p)).toFixed(3);
      next.theta = gait * STRIDES * Math.PI * 2;
      next.sink = SINK * peek;
      // The hands reach for the edge once he is most of the way down.
      next.grip = smooth(0.2, 0.9, peek);
      next.pose =
        walk === 0 && peek === 0 ? "stand" : `${next.theta.toFixed(3)}:${walk.toFixed(3)}:${next.sink.toFixed(2)}`;
      next.shadow = (0.6 * (1 - smooth(0.02, 0.3, p))).toFixed(3);
      next.mode = walk > 0.2 ? "walk" : p === 1 ? "docked" : "idle";
      readCard();
    };

    const write = () => {
      writeCard();
      if (!parked) {
        if (next.transform !== shown.transform) {
          el.style.transform = shown.transform = next.transform;
          // His focus ring is drawn in his scaled space: keep it 2px on screen.
          el.style.setProperty("--k", next.k.toFixed(4));
        }
        if (next.opacity !== shown.opacity) el.style.opacity = shown.opacity = next.opacity;
        if (next.shadow !== shown.shadow) set(parts.shadow, "opacity", (shown.shadow = next.shadow));
        if (next.mode !== shown.mode) el.dataset.mode = shown.mode = next.mode;
        if (next.pose !== shown.pose) {
          shown.pose = next.pose;
          const pose = mixPose(walkPose(next.theta, walk), peekPose(RIM - next.sink), next.grip);
          set(parts.bob, "transform", `translate(0 ${(pose.dy + next.sink).toFixed(2)})`);
          set(parts.legL, "transform", `rotate(${pose.legL.toFixed(2)} 96 236)`);
          set(parts.legR, "transform", `rotate(${pose.legR.toFixed(2)} 144 236)`);
          set(parts.armL, "d", armPath(SHOULDER_L, pose.armL));
          set(parts.armR, "d", armPath(SHOULDER_R, pose.armR));
          set(parts.handL, "cx", pose.armL[2].toFixed(1));
          set(parts.handL, "cy", pose.armL[3].toFixed(1));
          set(parts.handR, "cx", pose.armR[2].toFixed(1));
          set(parts.handR, "cy", pose.armR[3].toFixed(1));
          const r = mix(HAND_R, GRIP_R, next.grip).toFixed(2);
          set(parts.handL, "r", r);
          set(parts.handR, "r", r);
        }
        // Below the edge he is behind the header: clipped only while he is sunk.
        const clip = next.sink > 0.5;
        if (clip !== shown.clip) {
          shown.clip = clip;
          if (clip) rim.setAttribute("clip-path", "url(#passo-rim)");
          else rim.removeAttribute("clip-path");
        }
      }
      if (busy) requestFrame();
    };

    const settle = () => {
      settleUntil = performance.now() + SETTLE_MS;
      requestFrame();
    };

    // Docked, he takes the colours of the header's surface; over the hero that
    // surface is black. The header's band arriving is his cue to peek.
    const paintSurface = () => {
      el.dataset.surface = header?.dataset.surface ?? "black";
      requestFrame();
    };
    paintSurface();
    const headerWatch = new MutationObserver(paintSurface);
    if (header) headerWatch.observe(header, { attributes: true, attributeFilter: ["data-surface", "data-docked"] });

    // The photo settles as the intro opens; fonts and resizes move his spot.
    const introWatch = new MutationObserver(() => {
      if (html.hasAttribute("data-intro-open") || html.hasAttribute("data-intro-done")) settle();
    });
    introWatch.observe(html, { attributes: true, attributeFilter: ["data-intro-open", "data-intro-done"] });
    const resizeWatch = new ResizeObserver(() => requestFrame());
    resizeWatch.observe(hero);
    // A new step changes the card's height: place it again.
    const cardWatch = new ResizeObserver(() => {
      talk.current.dirty = true;
      requestFrame();
    });
    if (card.current) cardWatch.observe(card.current);
    void document.fonts.ready.then(settle);

    html.setAttribute("data-passo-live", "");
    const unsubscribe = subscribeFrame({ read, write });

    return () => {
      unsubscribe();
      headerWatch.disconnect();
      introWatch.disconnect();
      dropHint();
      resizeWatch.disconnect();
      cardWatch.disconnect();
      placeCard.current = null;
      html.removeAttribute("data-passo-live");
    };
  }, [mounted, react]);

  if (!mounted) return null;

  return createPortal(
    <>
      <div ref={root} className={styles.journey} data-mode="idle" data-surface="black">
        <svg className={styles.svg} viewBox="-120 0 400 440" focusable="false" aria-hidden="true">
          <defs>
            {/* Everything above the edge (his feet's line); what sinks below it is behind the header. */}
            <clipPath id="passo-rim">
              <rect x={-1000} y={-1000} width={2000} height={1000 + RIM} />
            </clipPath>
          </defs>
          <g transform={`translate(${PASSO_FEET.x} ${PASSO_FEET.y})`}>
            <g data-part="shadow" transform="matrix(1 0 0.8 -0.55 0 0)" opacity="0.6">
              <g transform={`translate(${-PASSO_FEET.x} ${-PASSO_FEET.y})`}>
                <PassoFigure pose={STAND} variant="shadow" />
              </g>
            </g>
            <g data-part="rim" transform={`translate(${-PASSO_FEET.x} ${-PASSO_FEET.y})`}>
              <g opacity="0.5">
                <PassoFigure pose={STAND} variant="outline" />
              </g>
              <PassoFigure pose={STAND} />
            </g>
          </g>
        </svg>
        <button
          ref={hit}
          type="button"
          className={styles.hit}
          data-passo-hit=""
          aria-label={guide.open}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls="passo-guide"
          onClick={() => {
            if (!open) react("open");
            setOpen(!open);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape" && open) close(false);
          }}
        />
      </div>
      {/* A mouse shortcut to the same button as PASSO himself, so it stays out of the tab order. */}
      <button
        ref={hint}
        type="button"
        className={styles.hint}
        data-surface="graphite"
        tabIndex={-1}
        aria-hidden="true"
        onClick={() => {
          react("open");
          setOpen(true);
        }}
      >
        {guide.hint}
      </button>
      <PassoGuide ref={card} open={open} onClose={close} onReact={react} />
    </>,
    document.body,
  );
}

"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

import { requestFrame, subscribeFrame } from "@/lib/motion/frame";
import { PassoFigure } from "./PassoFigure";
import { PASSO_FEET, PASSO_HEIGHT, SHOULDER_L, SHOULDER_R, STAND, armPath, walkPose } from "./passoRig";
import styles from "./PassoJourney.module.css";

/*
  PASSO's walk. He starts on his spot in the crowd ([data-passo-anchor], drawn
  by PassoStill) and, as the page scrolls down, walks up the screen to the
  header, where he stays beside the navigation ([data-passo-dock]). Scrolling
  back walks him back into the crowd. The stride follows the scroll; when the
  scroll rests he stands and looks around.

  One fixed element above the page (portalled to <body>, so no section's
  stacking context can hold it under the header). It runs on the shared
  scroll frame (lib/motion/frame) and keeps asking for frames only while he
  is mid-stride or the photo under him is still settling; parked in the
  header it does nothing. Without a dock (the header hides it on small
  screens) he climbs out through the top.
*/

const RANGE = 0.8; // share of the hero's height the walk takes
const STRIDES = 7; // full steps from the crowd to the header
const SETTLE_MS = 1900; // the photo's settle animation, plus a frame or two

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

export function PassoJourney() {
  const root = useRef<HTMLDivElement>(null);
  const mounted = useSyncExternalStore(noSubscribe, onClient, onServer);

  useEffect(() => {
    const el = root.current;
    const anchor = document.querySelector<SVGGraphicsElement>("[data-passo-anchor]");
    const hero = document.querySelector<HTMLElement>("[data-hero]");
    if (!mounted || !el || !anchor || !hero) return;

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
    let lastP = -1;
    let movedAt = -Infinity;
    let walk = 0;
    let target = 0;
    let viewport = "";
    let parked = false;

    const next = { transform: "", opacity: "1", pose: "", theta: 0, shadow: "", mode: "idle" };
    const shown = { transform: "", opacity: "", pose: "", shadow: "", mode: "" };

    const read = (now: number) => {
      const p = clamp01(window.scrollY / Math.max(1, hero.offsetHeight * RANGE));
      const size = `${window.innerWidth}x${window.innerHeight}`;
      if (p !== lastP) {
        if (lastP >= 0) movedAt = now;
        lastP = p;
      }
      // He walks while the scroll moves him, and eases to a stand when it rests.
      target = now - movedAt < 220 && p > 0 && p < 1 ? 1 : 0;
      walk += (target - walk) * 0.16;
      if (Math.abs(target - walk) < 0.004) walk = target;

      // Parked in the header and nothing changed: no reads, no writes.
      parked = p === 1 && walk === 0 && now >= settleUntil && size === viewport && shown.mode === "docked";
      if (parked) return;
      viewport = size;

      const a = anchor.getBoundingClientRect();
      const d = dock?.getBoundingClientRect();
      const hasDock = Boolean(d && d.width > 0 && d.height > 0);
      const start = { x: a.left + a.width / 2, y: a.bottom, h: a.height };
      const end = hasDock && d ? { x: d.left + d.width / 2, y: d.bottom, h: d.height } : { x: start.x, y: 0, h: start.h * 0.6 };

      const e = smooth(0, 1, p);
      const k = mix(start.h, end.h, e) / PASSO_HEIGHT;
      next.transform = `translate3d(${mix(start.x, end.x, e).toFixed(1)}px, ${mix(start.y, end.y, e).toFixed(1)}px, 0) scale(${k.toFixed(4)})`;
      next.opacity = hasDock ? "1" : (1 - smooth(0.7, 1, p)).toFixed(3);
      next.theta = p * STRIDES * Math.PI * 2;
      next.pose = walk === 0 ? "stand" : `${next.theta.toFixed(3)}:${walk.toFixed(3)}`;
      next.shadow = (0.6 * (1 - smooth(0.02, 0.3, p))).toFixed(3);
      next.mode = walk > 0.2 ? "walk" : p === 1 ? "docked" : "idle";
    };

    const write = (now: number) => {
      if (!parked) {
        if (next.transform !== shown.transform) el.style.transform = shown.transform = next.transform;
        if (next.opacity !== shown.opacity) el.style.opacity = shown.opacity = next.opacity;
        if (next.shadow !== shown.shadow) set(parts.shadow, "opacity", (shown.shadow = next.shadow));
        if (next.mode !== shown.mode) el.dataset.mode = shown.mode = next.mode;
        if (next.pose !== shown.pose) {
          shown.pose = next.pose;
          const pose = walkPose(next.theta, walk);
          set(parts.bob, "transform", `translate(0 ${pose.dy.toFixed(2)})`);
          set(parts.legL, "transform", `rotate(${pose.legL.toFixed(2)} 96 236)`);
          set(parts.legR, "transform", `rotate(${pose.legR.toFixed(2)} 144 236)`);
          set(parts.armL, "d", armPath(SHOULDER_L, pose.armL));
          set(parts.armR, "d", armPath(SHOULDER_R, pose.armR));
          set(parts.handL, "cx", pose.armL[2].toFixed(1));
          set(parts.handL, "cy", pose.armL[3].toFixed(1));
          set(parts.handR, "cx", pose.armR[2].toFixed(1));
          set(parts.handR, "cy", pose.armR[3].toFixed(1));
        }
      }
      // Keep going while mid-stride, or while the photo under him still moves.
      if (walk !== target || target === 1 || now < settleUntil) requestFrame();
    };

    const settle = () => {
      settleUntil = performance.now() + SETTLE_MS;
      requestFrame();
    };

    // Docked, he takes the colours of the header's surface; over the hero that surface is black.
    const paintSurface = () => {
      el.dataset.surface = header?.dataset.surface ?? "black";
    };
    paintSurface();
    const surfaceWatch = new MutationObserver(paintSurface);
    if (header) surfaceWatch.observe(header, { attributes: true, attributeFilter: ["data-surface"] });

    // The photo settles once the intro opens; fonts and resizes move his spot.
    const introWatch = new MutationObserver(() => {
      if (html.hasAttribute("data-intro-done")) settle();
    });
    introWatch.observe(html, { attributes: true, attributeFilter: ["data-intro-done"] });
    const resizeWatch = new ResizeObserver(() => requestFrame());
    resizeWatch.observe(hero);
    void document.fonts.ready.then(settle);

    html.setAttribute("data-passo-live", "");
    const unsubscribe = subscribeFrame({ read, write });

    return () => {
      unsubscribe();
      surfaceWatch.disconnect();
      introWatch.disconnect();
      resizeWatch.disconnect();
      html.removeAttribute("data-passo-live");
    };
  }, [mounted]);

  if (!mounted) return null;

  return createPortal(
    <div ref={root} className={styles.journey} data-mode="idle" data-surface="black" aria-hidden="true">
      <svg className={styles.svg} viewBox="-120 0 400 440" focusable="false">
        <g transform={`translate(${PASSO_FEET.x} ${PASSO_FEET.y})`}>
          <g data-part="shadow" transform="matrix(1 0 0.8 -0.55 0 0)" opacity="0.6">
            <g transform={`translate(${-PASSO_FEET.x} ${-PASSO_FEET.y})`}>
              <PassoFigure pose={STAND} variant="shadow" />
            </g>
          </g>
          <g transform={`translate(${-PASSO_FEET.x} ${-PASSO_FEET.y})`}>
            <g opacity="0.5">
              <PassoFigure pose={STAND} variant="outline" />
            </g>
            <PassoFigure pose={STAND} />
          </g>
        </g>
      </svg>
    </div>,
    document.body,
  );
}

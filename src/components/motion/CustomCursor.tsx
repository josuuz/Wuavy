"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import styles from "./CustomCursor.module.css";

type CursorState = "default" | "action" | "view" | "text" | "hidden";

const ACTION = "a[href], button, [role='button'], summary, label, [data-cursor='action']";
const TEXT = "input, textarea, select, [contenteditable='true']";

/**
 * The cursor is a small Signal orb: a dark core with a warm glow, ringed by
 * slowly turning rays. Over anything you can press it grows and its light
 * rises; over a case the core fills with Signal and carries a "Ver case"
 * label; over a field it steps aside for the native text cursor.
 *
 * The same pointer brain drives two small behaviours, so there is only one
 * pointermove listener on the page:
 * - [data-magnetic] buttons pull their [data-magnetic-inner] label toward the
 *   pointer (the hit area never moves);
 * - [data-spot-host] rows move their [data-spot] light under the pointer.
 *
 * Mouse and trackpad only (hover + fine pointer); touch keeps the native
 * cursor. Focus rings are untouched.
 */
export function CustomCursor() {
  const pathname = usePathname();
  const [enabled, setEnabled] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const label = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)");
    const update = () => setEnabled(fine.matches);
    update();
    fine.addEventListener("change", update);
    return () => fine.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const el = root.current;
    if (!enabled || !el) return;
    const html = document.documentElement;
    html.setAttribute("data-cursor-on", "");

    const target = { x: -100, y: -100 };
    const pos = { x: -100, y: -100 };
    let frame = 0;
    let hit: Element | null = null;
    let seen: Element | null = null;
    let magnet: HTMLElement | null = null;
    let magnetInner: HTMLElement | null = null;
    let spotHost: HTMLElement | null = null;
    let spot: HTMLElement | null = null;
    let placed = "";

    // The DOM attribute is the single source of truth (a route change resets it).
    const setState = (next: CursorState, text?: string) => {
      if (label.current && text !== undefined) label.current.textContent = text;
      if (el.dataset.state !== next) el.dataset.state = next;
    };

    const releaseMagnet = () => {
      if (magnetInner) magnetInner.style.transform = "";
      magnet = magnetInner = null;
    };

    // What the pointer is over changes far less often than it moves: resolve it only then.
    const resolve = () => {
      seen = hit;
      const view = hit?.closest<HTMLElement>("[data-cursor='view']") ?? hit?.closest("article")?.querySelector<HTMLElement>("[data-cursor='view']");
      if (hit?.closest(TEXT)) setState("text");
      else if (view && hit?.closest("article")) setState("view", view.dataset.cursorLabel ?? "Ver");
      else if (hit?.closest(ACTION)) setState("action");
      else setState("default");

      const nextMagnet = hit?.closest<HTMLElement>("[data-magnetic]") ?? null;
      if (nextMagnet !== magnet) {
        releaseMagnet();
        magnet = nextMagnet;
        magnetInner = nextMagnet?.querySelector<HTMLElement>("[data-magnetic-inner]") ?? null;
      }
      spotHost = hit?.closest<HTMLElement>("[data-spot-host]") ?? null;
      spot = spotHost?.querySelector<HTMLElement>("[data-spot]") ?? null;
    };

    // One frame per screen refresh, however fast the mouse reports: reads first, then writes.
    const tick = () => {
      frame = 0;
      if (hit !== seen) resolve();
      // The label and the light follow the pointer itself: only when it has moved.
      const at = `${target.x},${target.y}`;
      const fresh = at !== placed;
      placed = at;
      const m = fresh && magnetInner && magnet ? magnet.getBoundingClientRect() : null;
      const h = fresh && spot && spotHost ? spotHost.getBoundingClientRect() : null;

      if (m && magnetInner) {
        // Magnetic buttons: the label leans toward the pointer, at most ~8px.
        const dx = (target.x - (m.left + m.width / 2)) / (m.width / 2);
        const dy = (target.y - (m.top + m.height / 2)) / (m.height / 2);
        magnetInner.style.transform = `translate3d(${(dx * 7).toFixed(1)}px, ${(dy * 4).toFixed(1)}px, 0)`;
      }
      // Row lights: the light sits under the pointer, inside its row.
      if (h && spot) spot.style.translate = `${(target.x - h.left).toFixed(0)}px ${(target.y - h.top).toFixed(0)}px`;

      pos.x += (target.x - pos.x) * 0.32;
      pos.y += (target.y - pos.y) * 0.32;
      el.style.transform = `translate3d(${pos.x.toFixed(1)}px, ${pos.y.toFixed(1)}px, 0)`;
      if (Math.abs(target.x - pos.x) > 0.2 || Math.abs(target.y - pos.y) > 0.2) {
        frame = requestAnimationFrame(tick);
      }
    };

    const onMove = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      target.x = event.clientX;
      target.y = event.clientY;
      if (el.dataset.state === "hidden") {
        pos.x = target.x;
        pos.y = target.y;
      }
      hit = event.target instanceof Element ? event.target : null;
      if (!frame) frame = requestAnimationFrame(tick);
    };

    const onDown = () => el.setAttribute("data-pressed", "");
    const onUp = () => el.removeAttribute("data-pressed");
    const onLeave = () => {
      setState("hidden");
      releaseMagnet();
      hit = seen = null;
      placed = "";
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("pointerup", onUp);
    document.addEventListener("pointerleave", onLeave);

    return () => {
      cancelAnimationFrame(frame);
      releaseMagnet();
      html.removeAttribute("data-cursor-on");
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointerleave", onLeave);
    };
  }, [enabled]);

  // A new page: whatever the cursor was over is gone, so it returns to the small orb.
  useEffect(() => {
    if (root.current) root.current.dataset.state = "default";
  }, [pathname]);

  if (!enabled) return null;

  return (
    <div ref={root} className={styles.cursor} data-state="hidden" aria-hidden="true">
      <span className={styles.orb}>
        <span className={styles.rays} />
        <span className={styles.core} />
      </span>
      <span ref={label} className={styles.label} />
    </div>
  );
}

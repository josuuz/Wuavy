"use client";

import { useEffect, useRef, type ReactNode } from "react";

import { cn } from "@/lib/utils";
import styles from "./ScrollMarquee.module.css";

interface ScrollMarqueeProps {
  items: ReactNode[];
  /** Base drift, px per second. Negative runs right. */
  speed?: number;
  className?: string;
  /** Screen-reader text for the band (items are aria-hidden duplicates). */
  label: string;
}

/**
 * A band that drifts on its own and answers the scroll: scrolling speeds it
 * up and scrolling back turns it around, then it eases back to its drift.
 * Transform only; paused off screen.
 */
export function ScrollMarquee({ items, speed = 40, className, label }: ScrollMarqueeProps) {
  const track = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = track.current;
    if (!el) return;

    let x = 0;
    let boost = 0;
    let direction = 1;
    let lastY = window.scrollY;
    let last = performance.now();
    let frame = 0;
    let visible = false;

    const tick = (now: number) => {
      const dt = Math.min(64, now - last) / 1000;
      last = now;
      const y = window.scrollY;
      const dy = y - lastY;
      lastY = y;
      if (dy !== 0) direction = dy > 0 ? 1 : -1;
      boost += (Math.abs(dy) * 6 - boost) * 0.12;
      const half = el.scrollWidth / 2;
      x -= (speed + boost) * direction * dt;
      if (half > 0) {
        if (x <= -half) x += half;
        if (x > 0) x -= half;
      }
      el.style.transform = `translate3d(${x.toFixed(1)}px, 0, 0)`;
      frame = visible ? requestAnimationFrame(tick) : 0;
    };

    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible && !frame) {
        last = performance.now();
        lastY = window.scrollY;
        frame = requestAnimationFrame(tick);
      }
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [speed]);

  const run = (copy: number) =>
    items.map((item, i) => (
      <span key={`${copy}-${i}`} className={styles.item}>
        {item}
        <span className={styles.sep} />
      </span>
    ));

  return (
    <div className={cn(styles.band, className)} role="marquee" aria-label={label}>
      <div ref={track} className={styles.track} aria-hidden="true">
        {run(0)}
        {run(1)}
      </div>
    </div>
  );
}

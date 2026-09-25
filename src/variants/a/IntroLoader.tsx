"use client";

import { useEffect, useRef, type CSSProperties } from "react";

import styles from "./IntroLoader.module.css";

const LINES = 33;
const MIN_MS = 1100;
// A median frame slower than this during the intro (under ~38 fps) marks the machine as light.
const SLOW_FRAME_MS = 26;

/**
 * The entry, once per session. The frequency row fills with real loading
 * progress (fonts and the hero photo), then the screen opens along the
 * channel — a slit at 20.81° that widens until the hero is uncovered.
 * The overlay is server-rendered so nothing flashes before it; the boot
 * script hides it on repeat visits; CSS dismisses it if scripts never run.
 * While it runs it times its own frames: a machine that cannot hold them
 * gets the light motion tier now and on later visits (html[data-perf]).
 */
export function IntroLoader() {
  const root = useRef<HTMLDivElement>(null);
  const count = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = root.current;
    const html = document.documentElement;
    if (!el) return;
    const finish = () => {
      html.setAttribute("data-intro-done", "");
      try {
        sessionStorage.setItem("wuavy-intro", "1");
      } catch {}
    };
    if (html.hasAttribute("data-intro-done")) return;

    let target = 0.08;
    let shown = 0;
    let frame = 0;
    let loaded = 0;
    let previous = 0;
    const gaps: number[] = [];
    const start = performance.now();

    const judge = () => {
      if (process.env.NODE_ENV !== "production" || gaps.length < 20) return;
      gaps.sort((a, b) => a - b);
      if (gaps[Math.floor(gaps.length / 2)] <= SLOW_FRAME_MS) return;
      html.setAttribute("data-perf", "lite");
      try {
        localStorage.setItem("wuavy-perf", "lite");
      } catch {}
    };
    const img = document.querySelector<HTMLImageElement>("[data-intro-image] img");
    const tasks: Promise<unknown>[] = [
      document.fonts.ready,
      img && !img.complete ? new Promise((r) => img.addEventListener("load", r, { once: true })) : Promise.resolve(),
    ];
    tasks.forEach((task) =>
      task.then(() => {
        loaded += 1;
        target = Math.max(target, loaded / tasks.length);
      }),
    );

    const tick = (now: number) => {
      // Hidden tabs throttle frames; only count what was on screen.
      if (previous && document.visibilityState === "visible" && now - previous < 250) gaps.push(now - previous);
      previous = now;
      const time = Math.min(1, (now - start) / MIN_MS);
      const goal = Math.min(target, 0.2 + time * 0.8, 1);
      shown += (goal - shown) * 0.12;
      if (goal >= 1 && shown > 0.995) shown = 1;
      el.style.setProperty("--p", shown.toFixed(3));
      if (count.current) count.current.textContent = String(Math.round(shown * 100)).padStart(3, "0");
      if (shown >= 1) {
        judge();
        el.dataset.state = "open";
        window.setTimeout(finish, 1050);
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div ref={root} className={styles.intro} aria-hidden="true" style={{ "--p": 0 } as CSSProperties}>
      <span className={`${styles.panel} ${styles.left}`} />
      <span className={`${styles.panel} ${styles.right}`} />
      <div className={styles.meter}>
        <div className={styles.row}>
          {Array.from({ length: LINES }, (_, i) => (
            <span key={i} className={styles.line} style={{ "--i": i, left: `${(i / (LINES - 1)) * 100}%` } as CSSProperties} />
          ))}
        </div>
        <p className={styles.label}>
          <span>Carregando</span>
          <span ref={count}>000</span>
        </p>
      </div>
    </div>
  );
}

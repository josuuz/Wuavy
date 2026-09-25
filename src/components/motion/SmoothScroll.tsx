"use client";

import "lenis/dist/lenis.css";

import Lenis from "lenis";
import { useEffect } from "react";

/**
 * Inertial scroll (Lenis), the HOBRO feel. Wheel and trackpad only: touch
 * keeps native momentum, and so do the light tier (html[data-perf="lite"],
 * weaker machines) and reduced motion, where native scrolling stays on the
 * compositor and never waits for script. Lenis
 * moves the real window scroll, so CSS scroll-driven animations and
 * IntersectionObservers keep working unchanged. Anchor links glide too.
 */
export function SmoothScroll() {
  useEffect(() => {
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const lite = document.documentElement.dataset.perf === "lite";
    if (!fine || reduced || lite) return;

    const html = document.documentElement;
    const lenis = new Lenis({ lerp: 0.1, autoRaf: true, anchors: { offset: -64 } });
    html.setAttribute("data-smooth", "");
    let running = true;
    const stop = () => {
      if (!running) return;
      running = false;
      lenis.destroy();
      html.removeAttribute("data-smooth");
    };
    // The intro can find the machine slow and switch it to the light tier.
    const tierWatch = new MutationObserver(() => {
      if (html.dataset.perf === "lite") {
        tierWatch.disconnect();
        stop();
      }
    });
    tierWatch.observe(html, { attributes: true, attributeFilter: ["data-perf"] });
    return () => {
      tierWatch.disconnect();
      stop();
    };
  }, []);

  return null;
}

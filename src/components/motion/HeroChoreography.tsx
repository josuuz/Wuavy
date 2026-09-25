"use client";

import { useEffect } from "react";

import { subscribeFrame } from "@/lib/motion/frame";

/**
 * The dock: on scroll the hero wordmark compresses and travels into the
 * header, where the header's own wordmark takes over (event `wuavy:dock`).
 * Runs only on scroll and resize frames (lib/motion/frame), writing one
 * transform; it reads its targets from the DOM by data attributes, so the
 * hero stays a Server Component.
 */

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export function HeroChoreography() {
  useEffect(() => {
    const hero = document.querySelector<HTMLElement>("[data-hero]");
    const mark = hero?.querySelector<HTMLElement>("[data-dock-target]");
    const zone = mark?.parentElement;
    const headerBrand = document.querySelector<HTMLElement>("[data-header-brand]");
    if (!hero || !mark || !zone || !headerBrand) return;

    let docked = false;
    let nextDocked = false;
    let sticky = false;
    let measuredWidth = -1;
    let next = "";
    let last = "";

    const read = () => {
      if (window.innerWidth !== measuredWidth) {
        measuredWidth = window.innerWidth;
        sticky = getComputedStyle(hero).position === "sticky";
      }
      // Natural (untransformed) position: the zone never transforms.
      const base = zone.getBoundingClientRect();
      const markTop = base.top + mark.offsetTop;
      const markLeft = base.left + mark.offsetLeft;
      const markWidth = mark.offsetWidth;
      const target = headerBrand.getBoundingClientRect();
      // Sticky hero: finish the flight in half a screen. Flowing hero: finish
      // exactly when the wordmark would have reached the header on its own.
      const travel = sticky ? window.innerHeight * 0.5 : Math.max(1, markTop + window.scrollY - target.top);
      const p = Math.min(1, Math.max(0, window.scrollY / travel));
      const e = easeInOut(p);
      if (p <= 0) {
        next = "";
      } else {
        const k = 1 + (target.width / markWidth - 1) * e;
        next = `translate3d(${(target.left - markLeft) * e}px, ${(target.top - markTop) * e}px, 0) scale(${k})`;
      }
      nextDocked = p >= 0.995;
    };

    const write = () => {
      if (next !== last) {
        last = next;
        mark.style.transform = next;
      }
      if (nextDocked !== docked) {
        docked = nextDocked;
        mark.style.opacity = docked ? "0" : "";
        window.dispatchEvent(new CustomEvent("wuavy:dock", { detail: docked }));
      }
    };

    const unsubscribe = subscribeFrame({ read, write });
    return () => {
      unsubscribe();
      mark.style.transform = "";
      mark.style.opacity = "";
    };
  }, []);

  return null;
}

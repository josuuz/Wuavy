"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

declare global {
  interface Window {
    __wuavyReveal?: boolean;
  }
}

/**
 * One observer for the whole page. Every [data-reveal] element gets
 * [data-inview] once it enters the viewport; CSS does the rest (see
 * styles/motion.css). Sections stay Server Components.
 * Also plays and pauses [data-inview-play] videos as they enter and leave,
 * and toggles [data-onscreen] on [data-loop] elements, so looping animations
 * run only while they can be seen.
 */
export function RevealObserver() {
  const pathname = usePathname();

  useEffect(() => {
    window.__wuavyReveal = true;
    const reveal = document.querySelectorAll<HTMLElement>("[data-reveal]:not([data-inview])");
    const videos = document.querySelectorAll<HTMLVideoElement>("video[data-inview-play]");
    const loops = document.querySelectorAll<HTMLElement>("[data-loop]");

    if (!("IntersectionObserver" in window)) {
      reveal.forEach((el) => el.setAttribute("data-inview", ""));
      loops.forEach((el) => el.setAttribute("data-onscreen", ""));
      return;
    }

    const revealObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.setAttribute("data-inview", "");
          revealObserver.unobserve(entry.target);
        }
      },
      { rootMargin: "0px 0px -10% 0px" },
    );
    reveal.forEach((el) => revealObserver.observe(el));

    const videoObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const video = entry.target as HTMLVideoElement;
        if (entry.isIntersecting) void video.play().catch(() => {});
        else video.pause();
      }
    });
    // With reduced motion, videos never start on their own: they wait for a tap.
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) videos.forEach((video) => (video.controls = true));
    else videos.forEach((video) => videoObserver.observe(video));

    const loopObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) entry.target.toggleAttribute("data-onscreen", entry.isIntersecting);
    });
    loops.forEach((el) => loopObserver.observe(el));

    return () => {
      revealObserver.disconnect();
      videoObserver.disconnect();
      loopObserver.disconnect();
    };
  }, [pathname]);

  return null;
}

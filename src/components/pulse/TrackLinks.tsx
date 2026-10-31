"use client";

import { useEffect } from "react";

import { track, type PulseStep } from "./track";

/*
  The two steps that leave this page — opening the full demo, and going to the
  checkout — are plain server-rendered links, and they should stay that way: a
  link that needs React to work is a link that can fail.

  So instead of a handler per button there is one delegated listener here, for
  anything inside a [data-pulse-track] wrapper. Nothing is prevented and
  nothing is awaited; the event is announced and the browser follows the link
  as it always would.
*/

const STEPS = new Set<string>(["demo_start", "scenario", "front", "screen", "demo_full", "subscribe"]);

export function TrackLinks() {
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const host = target?.closest<HTMLElement>("[data-pulse-track]");
      // Only a real activation inside the wrapper, not a click on its padding.
      if (!host || !target?.closest("a, button")) return;
      const step = host.dataset.pulseTrack;
      if (step && STEPS.has(step)) track(step as PulseStep);
    };

    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  return null;
}

"use client";

import { useEffect } from "react";

/*
  What makes the Pulse behave like an installed app, in one place.

  The worker (public/sw.js) is registered only for /pulse/, so installing the
  app never captures the public site, and it stores nothing (see the file).
  The status bar follows the Pulse's theme: the manifest can only name one
  colour, and the theme is a choice saved in the browser, so the meta tag is
  kept in step with the attribute the toggle writes on <html>.
*/

const THEME_ATTR = "data-pulse-theme";
const SURFACE = { light: "#f3f3f0", dark: "#000000" } as const; // --pulse-bg, both themes

export function PwaShell() {
  useEffect(() => {
    /*
      Safari reads the launch screens declared in the layout only when Apple's
      older capable tag is there too; the manifest's display mode does not
      stand in for it. Next writes the standard name and drops anything passed
      through `metadata.other` (16.3.6), and a <meta> rendered in the tree is
      not hoisted either, so the tag is put in by hand. The share sheet reads
      the live document, long after this runs.
    */
    const APPLE = "apple-mobile-web-app-capable";
    if (!document.querySelector(`meta[name="${APPLE}"]`)) {
      const tag = document.createElement("meta");
      tag.name = APPLE;
      tag.content = "yes";
      document.head.appendChild(tag);
    }

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/pulse/" }).catch(() => {
        // No worker: the Pulse still works, it just cannot be installed from Chrome.
      });
    }

    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (!meta) return;

    const paint = () => {
      meta.content = document.documentElement.getAttribute(THEME_ATTR) === "light" ? SURFACE.light : SURFACE.dark;
    };
    paint();

    const observer = new MutationObserver(paint);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: [THEME_ATTR] });
    return () => observer.disconnect();
  }, []);

  return null;
}

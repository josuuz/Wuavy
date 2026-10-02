"use client";

import { useSyncExternalStore } from "react";

import styles from "./ThemeToggle.module.css";

/*
  Dark or light, for every screen of the Pulse. The choice lives on <html>
  as data-pulse-theme ("light", or nothing for the default dark) and in
  localStorage; the boot script in app/layout.tsx puts it back before first
  paint, so a reload never flashes the other theme. Where the browser has
  view transitions, the swap crossfades; elsewhere it is immediate.
*/

export const THEME_KEY = "wuavy-pulse-theme";
const ATTR = "data-pulse-theme";

type Theme = "dark" | "light";

const read = (): Theme => (document.documentElement.getAttribute(ATTR) === "light" ? "light" : "dark");

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: [ATTR] });
  return () => observer.disconnect();
}

export function ThemeToggle({ className }: { className?: string }) {
  const theme = useSyncExternalStore(subscribe, read, (): Theme => "dark");
  const next: Theme = theme === "dark" ? "light" : "dark";
  const label = next === "light" ? "Usar tema claro" : "Usar tema escuro";

  const apply = () => {
    if (next === "light") document.documentElement.setAttribute(ATTR, "light");
    else document.documentElement.removeAttribute(ATTR);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      // Storage blocked: the theme still changes, for this visit.
    }
  };

  return (
    <button
      type="button"
      className={className ? `${styles.toggle} ${className}` : styles.toggle}
      aria-label={label}
      title={label}
      onClick={() => (document.startViewTransition ? document.startViewTransition(apply) : apply())}
    >
      {theme === "dark" ? <Sun /> : <Moon />}
    </button>
  );
}

function Sun() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden="true">
      <circle cx="8" cy="8" r="2.9" />
      <path d="M8 1.2v1.6M8 13.2v1.6M1.2 8h1.6M13.2 8h1.6M3.2 3.2l1.1 1.1M11.7 11.7l1.1 1.1M3.2 12.8l1.1-1.1M11.7 4.3l1.1-1.1" />
    </svg>
  );
}

function Moon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" aria-hidden="true">
      <path d="M13.6 10.1A5.9 5.9 0 0 1 5.9 2.4a5.9 5.9 0 1 0 7.7 7.7Z" />
    </svg>
  );
}

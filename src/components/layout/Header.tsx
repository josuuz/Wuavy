"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Wordmark } from "@/components/brand/Wordmark";
import { Button } from "@/components/ui/Button";
import { subscribeFrame } from "@/lib/motion/frame";
import type { NavItem } from "@/lib/types";
import { cn } from "@/lib/utils";
import { LocaleSwitch, type LanguageSwitchProps } from "./LocaleSwitch";
import { MobileMenu } from "./MobileMenu";
import styles from "./Header.module.css";

export interface HeaderLabels {
  /** The home page in the page's language ("/" or "/pt-pt"). */
  homeHref: string;
  home: string;
  nav: string;
  menu: string;
  menuNav: string;
  close: string;
}

interface HeaderProps {
  nav: NavItem[];
  cta: { label: string; short: string; href: string };
  labels: HeaderLabels;
  language: LanguageSwitchProps;
}

interface SectionMark {
  id: string;
  label: string;
}

/**
 * The header takes the surface of the section under it, so it never needs a
 * blend mode. The small wordmark docks in once the hero wordmark has left.
 * The frequency index (one line per section, the current one in Signal)
 * shows where you are: density as position.
 */
export function Header({ nav, cta, labels, language }: HeaderProps) {
  const pathname = usePathname();
  const ref = useRef<HTMLElement>(null);
  const [surface, setSurface] = useState("black");
  const [docked, setDocked] = useState(false);
  // Set with the first measured frame: until then the band follows the scroll in CSS.
  const [live, setLive] = useState(false);
  const [active, setActive] = useState(0);
  const [sections, setSections] = useState<SectionMark[]>([]);

  useEffect(() => {
    const header = ref.current;
    if (!header) return;
    const els = Array.from(document.querySelectorAll<HTMLElement>("[data-section]"));
    const dockTarget = document.querySelector<HTMLElement>("[data-dock-target]");
    setSections(els.map((el) => ({ id: el.id, label: el.dataset.section ?? "" })));

    // When the hero choreography runs, it owns the dock moment (the wordmark
    // flies into the header); otherwise dock when the hero wordmark leaves.
    let choreographed = false;
    const onDock = (event: Event) => {
      choreographed = true;
      setDocked((event as CustomEvent<boolean>).detail);
    };
    window.addEventListener("wuavy:dock", onDock);

    let nextSurface = "black";
    let nextActive = 0;
    let nextDocked = false;
    const read = () => {
      // The header takes the surface of the section just below it, so it reads
      // as part of what you are looking at (also right after an anchor jump).
      const probe = header.offsetHeight + 1;
      const readLine = window.innerHeight * 0.45;
      nextSurface = "black";
      nextActive = 0;
      els.forEach((el, i) => {
        const rect = el.getBoundingClientRect();
        if (rect.top <= probe && rect.bottom > probe) nextSurface = el.dataset.surface ?? "black";
        if (rect.top <= readLine) nextActive = i;
      });
      if (!choreographed) nextDocked = dockTarget ? dockTarget.getBoundingClientRect().top < header.offsetHeight : true;
    };
    const write = () => {
      setSurface(nextSurface);
      setActive(nextActive);
      if (!choreographed) setDocked(nextDocked);
      setLive(true);
    };

    const unsubscribe = subscribeFrame({ read, write });
    return () => {
      unsubscribe();
      window.removeEventListener("wuavy:dock", onDock);
    };
  }, [pathname]);

  // The document speaks the site's language; leaving for the Pulse (pt-BR) puts it back.
  const lang = language.current;
  useEffect(() => {
    document.documentElement.lang = lang;
    return () => {
      document.documentElement.lang = "pt-BR";
    };
  }, [lang]);

  return (
    <header
      ref={ref}
      className={styles.header}
      data-surface={surface}
      data-docked={docked ? "" : undefined}
      data-live={live ? "" : undefined}
    >
      <div className={styles.inner}>
        <Link
          href={labels.homeHref}
          className={styles.brand}
          aria-label={labels.home}
          tabIndex={docked ? 0 : -1}
          data-header-brand=""
        >
          <Wordmark size="small" decorative />
        </Link>

        {sections.length > 1 ? (
          <div className={styles.index} aria-hidden="true">
            {sections.map((section, i) => (
              <a
                key={section.id}
                href={`#${section.id}`}
                tabIndex={-1}
                title={section.label}
                className={cn(styles.tick, i === active && styles.tickActive)}
              />
            ))}
          </div>
        ) : null}

        {/* PASSO's spot once he has walked up from the hero: he peeks over its bottom edge (PassoJourney). */}
        <span className={styles.passoDock} data-passo-dock="" aria-hidden="true" />

        <nav aria-label={labels.nav} className={styles.nav}>
          <ul>
            {nav.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(styles.navLink, item.hint && styles.navProduct)}
                  aria-current={
                    pathname === item.href
                      ? "page"
                      : sections[active]?.id === item.href.split("#")[1]
                        ? "location"
                        : undefined
                  }
                >
                  {item.label}
                  {item.hint ? (
                    <>
                      <span className={styles.navArrow} aria-hidden="true">
                        ↗
                      </span>
                      <span className={styles.navHint}>{item.hint}</span>
                    </>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <LocaleSwitch {...language} className={styles.locale} />

        <Button href={cta.href} size="sm" className={styles.cta}>
          <span className={styles.ctaFull}>{cta.label}</span>
          <span className={styles.ctaShort}>{cta.short}</span>
        </Button>

        <MobileMenu nav={nav} cta={cta} labels={labels} language={language} />
      </div>
    </header>
  );
}

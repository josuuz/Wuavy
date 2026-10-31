"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { LocaleSwitch, type LanguageSwitchProps } from "@/components/layout/LocaleSwitch";
import { Button } from "@/components/ui/Button";
import { subscribeFrame } from "@/lib/motion/frame";
import styles from "./chrome.module.css";

/*
  PULSE's own header.

  It starts transparent over the hero and takes a ground and a rule once the
  page has moved, so the lockup never sits on top of the product's screens.
  The section links light up as you pass them — the position is read from the
  shared scroll frame (lib/motion/frame), one listener for the whole page,
  reads before writes.

  Below 62rem the three section links step aside and only the two decisions
  are left: entering, and the demonstration. They are not lost — the footer
  lists the same sections under "Nesta página", and the page is a single
  column there anyway, so scrolling is the navigation.
*/

export interface NavLabels {
  home: string;
  nav: string;
  signIn: { label: string; href: string };
  cta: { label: string; href: string };
  back: { label: string; title: string; href: string };
}

interface PulseNavProps {
  labels: NavLabels;
  links: readonly { label: string; href: string }[];
  language: LanguageSwitchProps;
}

export function PulseNav({ labels, links, language }: PulseNavProps) {
  const header = useRef<HTMLElement>(null);
  const [lifted, setLifted] = useState(false);
  const [here, setHere] = useState<string | null>(null);

  // The agency header sets the document's language; this page replaces it, so
  // it has to do the same or a pt-PT visitor reads a pt-BR document.
  const lang = language.current;
  useEffect(() => {
    document.documentElement.lang = lang;
    return () => {
      document.documentElement.lang = "pt-BR";
    };
  }, [lang]);

  useEffect(() => {
    const bar = header.current;
    if (!bar) return;
    const targets = links
      .map((link) => ({ id: link.href.replace("#", ""), el: document.getElementById(link.href.replace("#", "")) }))
      .filter((t): t is { id: string; el: HTMLElement } => Boolean(t.el));

    let nextLifted = false;
    let nextHere: string | null = null;

    const read = () => {
      nextLifted = window.scrollY > 24;
      // The line a section has to cross to count as the one being read.
      const line = bar.offsetHeight + window.innerHeight * 0.25;
      nextHere = null;
      for (const { id, el } of targets) {
        const { top, bottom } = el.getBoundingClientRect();
        if (top <= line && bottom > line) nextHere = id;
      }
    };

    const write = () => {
      setLifted(nextLifted);
      setHere(nextHere);
    };

    return subscribeFrame({ read, write });
  }, [links]);

  return (
    <header ref={header} className={styles.header} data-lifted={lifted ? "" : undefined}>
      <div className={styles.inner}>
        <a href="#pulse" className={styles.brand} aria-label={labels.home}>
          <span className={styles.brandName}>PULSE</span>
          <span className={styles.brandBy} aria-hidden="true">
            by WUAVY
          </span>
        </a>

        <nav aria-label={labels.nav} className={styles.nav}>
          <ul>
            {links.map((link) => {
              const id = link.href.replace("#", "");
              return (
                <li key={link.href}>
                  <a href={link.href} className={styles.navLink} aria-current={here === id ? "location" : undefined}>
                    {link.label}
                  </a>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className={styles.actions}>
          <Link href={labels.back.href} className={styles.back} title={labels.back.title}>
            <span aria-hidden="true">←</span>
            {labels.back.label}
          </Link>
          <LocaleSwitch {...language} className={styles.locale} />
          <Link href={labels.signIn.href} className={styles.signIn}>
            {labels.signIn.label}
          </Link>
          <Button href={labels.cta.href} size="sm" className={styles.cta}>
            {labels.cta.label}
          </Button>
        </div>
      </div>
    </header>
  );
}

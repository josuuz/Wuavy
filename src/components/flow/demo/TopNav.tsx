"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

import { PulseLogo } from "../PulseLogo";
import { viewHref } from "./copy";
import { NavIcon } from "./NavIcon";
import { Sheet } from "./Sheet";
import styles from "./FlowDemo.module.css";

interface NavView {
  slug: string;
  label: string;
}

/**
 * The "Mais" pill's own rendered width, reserved up front. Not measured
 * live: it is hidden whenever nothing overflows, and a hidden element's
 * width reads as 0 — measuring it would race its own visibility.
 */
const MORE_RESERVE_PX = 108;

interface TopNavProps {
  menu: readonly NavView[];
  base: string;
  /** Oportunidades' open-fronts count, for its badge. */
  openCount: number;
  /** The guide's current target slug, if it is pointing anywhere right now. */
  guideTarget?: string;
  /** The plan chip, theme toggle and "Pergunte ao Pulse": unchanged, just along for the ride. */
  children: ReactNode;
}

/**
 * The desktop menu, in the bar: one row when the clinic's screens fit beside
 * the brand and the actions; its own full-width row, intentionally, the
 * moment they do not. If even that row runs out of room, the screens past
 * what fits wait behind "Mais" — same idea as the phone's bottom bar, kept
 * out of keyboard and screen-reader reach until shown. Measured, not
 * guessed: a fixed breakpoint cannot know how many screens a role sees or
 * how long the clinic's own words run.
 */
export function TopNav({ menu, base, openCount, guideTarget, children }: TopNavProps) {
  const pathname = usePathname();
  const barRef = useRef<HTMLElement>(null);
  const brandRef = useRef<HTMLAnchorElement>(null);
  const toolsRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLOListElement>(null);
  // Before the first measurement, "visible" is a guess (every screen shown, nowrap, clipped by
  // the container at whatever edge it lands on) — `ready` marks that guess as just a guess, so
  // the render can fade its clipped edge instead of cutting a screen off mid-word.
  const [layout, setLayout] = useState({ stacked: false, visible: menu.length, ready: false });
  const [moreOpen, setMoreOpen] = useState(false);
  // An item hidden by the last measurement reads 0 width live (display:none); its last true
  // width, kept here, is what the next pass sums instead — otherwise a hidden item looks free,
  // the pass that hid it un-hides it again, and it sits back in the row, still clipped.
  const widthCache = useRef(new Map<string, number>());

  useLayoutEffect(() => {
    const bar = barRef.current;
    const brand = brandRef.current;
    const tools = toolsRef.current;
    const list = listRef.current;
    if (!bar || !brand || !tools || !list) return;

    const measure = () => {
      const barStyle = getComputedStyle(bar);
      const gap = parseFloat(barStyle.columnGap) || 0;
      const navGap = parseFloat(getComputedStyle(list).columnGap) || 0;
      // clientWidth includes the bar's own padding; grid children only ever see what's left.
      const barPadding = (parseFloat(barStyle.paddingLeft) || 0) + (parseFloat(barStyle.paddingRight) || 0);
      const barWidth = bar.clientWidth - barPadding;
      const brandWidth = brand.offsetWidth;
      const toolsWidth = tools.offsetWidth;

      const items = Array.from(list.children).slice(0, menu.length) as HTMLElement[];
      const widths = items.map((el, i) => {
        const live = el.getBoundingClientRect().width;
        const slug = menu[i].slug;
        if (live > 0) {
          widthCache.current.set(slug, live);
          return live;
        }
        return widthCache.current.get(slug) ?? 0;
      });
      const navNatural = widths.reduce((a, b) => a + b, 0) + navGap * Math.max(0, widths.length - 1);
      const oneRowAvailable = barWidth - brandWidth - toolsWidth - gap * 2;
      const stacked = navNatural > oneRowAvailable;
      const navAvailable = stacked ? barWidth : oneRowAvailable;

      if (navNatural <= navAvailable) {
        setLayout((prev) =>
          prev.ready && prev.stacked === stacked && prev.visible === menu.length
            ? prev
            : { stacked, visible: menu.length, ready: true },
        );
        return;
      }

      let used = 0;
      let count = 0;
      for (let i = 0; i < widths.length; i++) {
        const w = widths[i];
        const beforeGap = count > 0 ? navGap : 0;
        const reserve = i < widths.length - 1 ? navGap + MORE_RESERVE_PX : 0;
        if (used + beforeGap + w + reserve > navAvailable) break;
        used += beforeGap + w;
        count++;
      }
      const visible = Math.max(count, 1);
      setLayout((prev) =>
        prev.ready && prev.stacked === stacked && prev.visible === visible
          ? prev
          : { stacked, visible, ready: true },
      );
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(bar);
    // A font still loading at that first measure reports metrics by its fallback, not its own;
    // the swap rarely changes the bar's own box (so the observer above stays quiet), only what
    // fits inside it.
    let cancelled = false;
    document.fonts?.ready?.then(() => {
      if (!cancelled) measure();
    });
    return () => {
      cancelled = true;
      ro.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- menu's filter() gives a new array each render; its length is what actually needs a remeasure.
  }, [menu.length]);

  const overflow = menu.slice(layout.visible);
  const pointedInMore = Boolean(guideTarget) && overflow.some((v) => v.slug === guideTarget);
  const moreNeeded = layout.visible < menu.length;

  const item = (view: NavView, index: number, inSheet: boolean) => {
    const href = viewHref(view.slug, base);
    const here = href === pathname;
    const pointed = guideTarget === view.slug;
    const hiddenHere = !inSheet && index >= layout.visible;
    return (
      <li key={view.slug}>
        <Link
          href={href}
          className={styles.navLink}
          aria-current={here ? "page" : undefined}
          aria-hidden={hiddenHere ? "true" : undefined}
          tabIndex={hiddenHere ? -1 : undefined}
          data-guide={pointed ? "" : undefined}
          onClick={inSheet ? () => setMoreOpen(false) : undefined}
        >
          <NavIcon slug={view.slug} className={styles.navIcon} />
          {view.label}
          {view.slug === "oportunidades" && openCount ? (
            <span className={styles.badge} aria-label={`${openCount} frentes abertas`}>
              {openCount}
            </span>
          ) : null}
          {pointed ? (
            <span className={styles.guideArrow}>
              <span aria-hidden="true">←</span>
              <span className="sr-only">: comece aqui</span>
            </span>
          ) : null}
        </Link>
      </li>
    );
  };

  return (
    <header ref={barRef} className={styles.bar} data-pulse-surface="rail" data-stacked={layout.stacked ? "true" : undefined}>
      <Link ref={brandRef} href="/pulse" className={styles.brand} aria-label="Wuavy Pulse: voltar à página do produto">
        <PulseLogo />
      </Link>
      <nav aria-label="Telas do Pulse" className={styles.topnav}>
        <ol ref={listRef} className={layout.ready ? undefined : styles.topnavGuess}>
          {menu.map((view, index) => item(view, index, false))}
          <li className={moreNeeded ? undefined : styles.moreHidden}>
            <button
              type="button"
              className={styles.navLink}
              aria-haspopup="dialog"
              data-guide={pointedInMore ? "" : undefined}
              tabIndex={moreNeeded ? undefined : -1}
              aria-hidden={moreNeeded ? undefined : "true"}
              onClick={() => setMoreOpen(true)}
            >
              <NavIcon slug="mais" className={styles.navIcon} />
              Mais
              {pointedInMore ? (
                <span className={styles.guideArrow}>
                  <span aria-hidden="true">←</span>
                  <span className="sr-only">: comece aqui</span>
                </span>
              ) : null}
            </button>
          </li>
        </ol>
      </nav>
      <div ref={toolsRef} className={styles.barTools}>
        {children}
      </div>
      <Sheet open={moreOpen} onClose={() => setMoreOpen(false)} title="Mais telas" kicker="Pulse">
        <ol className={styles.moreList}>{overflow.map((view) => item(view, -1, true))}</ol>
      </Sheet>
    </header>
  );
}

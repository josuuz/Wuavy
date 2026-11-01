"use client";

import { useEffect, useRef, useState } from "react";

import { DemoCursor, useDemoCursor, usePresence, useReducedMotion } from "./demo-kit";
import { AgendaCrop, AppFrame, OpportunitiesCrop, OverviewCrop, PatientsCrop, RecordCrop } from "./product";
import { focusTab, onTabKeys, tabIndex } from "./tabs";
import { track } from "./track";
import styles from "./interactive.module.css";

/*
  "E a rotina da clínica fica organizada" — the tour, one screen at a time.

  Centred, with the product wide: the tabs on top, the screen in the middle,
  what it is for written once underneath. The words follow the picture here
  (in the situations above they sit beside it) so that two sections in a row
  never share a layout.

  Not screenshots. Each crop is the real screen's content rebuilt in HTML with
  the product's own tokens (./product.tsx), which is what makes it readable on
  a phone — a whole screenshot at that width is a picture of a screen, not a
  screen. The rail on the left is the product's own navigation and stays where
  the product puts it; the tabs here are the control, so the rail is a drawing
  and nothing in it is clickable.

  "Prontuário" lives inside Pacientes in the product, so that is the rail
  entry it lights.
*/

export interface TourScreen {
  id: string;
  nav: string;
  title: string;
  text: string;
  benefit: string;
  note?: string;
}

/** Which of the product's screens each stop belongs to, by the rail's slug. */
const RAIL: Record<string, string> = {
  "visao-geral": "",
  agenda: "agenda",
  pacientes: "pacientes",
  prontuario: "pacientes",
  oportunidades: "oportunidades",
};

interface TourProps {
  screens: readonly TourScreen[];
  /** The seven fronts' names, for the Oportunidades crop, so they stay translated. */
  fronts: readonly { tag: string; name: string }[];
  hint: string;
  note: string;
}

/**
 * The automatic lap, by screen id: three stops, so the whole tour is not a slideshow. The others stay a
 * tab away. In ms, per visit (from the moment a screen is up): the cursor goes to the detail, the detail
 * is lit and held for reading, the cursor goes to the next item of the rail, rests, presses it, and the
 * next screen comes in.
 */
const LAP = ["agenda", "pacientes", "oportunidades"] as const;
const T = { toDetail: 700, hit: 1750, away: 5400, press: 6500, release: 6950, again: 7600 } as const;

export function Tour({ screens, fronts, hint, note }: TourProps) {
  const soft = useReducedMotion();
  const [at, setAt] = useState(0);
  const [hit, setHit] = useState(false);
  const [pressSlug, setPressSlug] = useState<string | undefined>(undefined);
  const [press, setPress] = useState(false);
  const strip = useRef<HTMLDivElement>(null);
  const region = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const screen = screens[at];

  const cursor = useDemoCursor(box);
  const cursorRef = useRef(cursor);
  const atRef = useRef(0);
  /** Set the first time the visitor chooses a screen: from then on the tour stays on what they chose. */
  const manual = useRef(false);
  const clock = useRef(0);
  const flags = useRef({ parked: false, went: false, hit: false, away: false, press: false });
  const started = useRef(false);
  const inView = usePresence(region, 0.35);

  useEffect(() => {
    cursorRef.current = cursor;
    atRef.current = at;
  });

  useEffect(() => {
    if (inView && !started.current) {
      started.current = true;
      track("demo_start", "tour");
    }
  }, [inView]);

  // One clock for the lap: the cursor, the lit detail, the press on the rail and the change of screen.
  useEffect(() => {
    if (!inView) return;
    let frame = 0;
    let before = performance.now();

    const restart = () => {
      clock.current = 0;
      flags.current = { parked: false, went: false, hit: false, away: false, press: false };
      setHit(false);
      setPressSlug(undefined);
      setPress(false);
    };

    /** On a phone the rail is a strip that scrolls: bring the item into it before the cursor goes there. */
    const reveal = (item: HTMLElement | null) => {
      const list = item?.parentElement;
      if (!item || !list || list.scrollWidth <= list.clientWidth) return;
      list.scrollLeft = item.offsetLeft - (list.clientWidth - item.offsetWidth) / 2;
    };

    const tick = (now: number) => {
      clock.current += Math.min(now - before, 80);
      before = now;
      const t = clock.current;
      const f = flags.current;
      const root = box.current;
      const cur = cursorRef.current;
      const detail = root?.querySelector<HTMLElement>("[data-focus]") ?? null;

      if (!f.parked && t >= T.toDetail - 300) {
        f.parked = true;
        if (!cur.live()) cur.park(detail);
      }
      if (!f.went && t >= T.toDetail) {
        f.went = true;
        cur.go(detail);
      }
      if (f.went && !f.away && t >= T.toDetail + 950) cur.follow(detail);
      if (!f.hit && t >= T.hit) {
        f.hit = true;
        setHit(true);
      }

      const lapAt = LAP.indexOf(screens[atRef.current]?.id as (typeof LAP)[number]);
      if (!manual.current && lapAt >= 0) {
        // The next stop of the lap: the cursor leaves the detail for its item in the rail.
        const nextId = LAP[(lapAt + 1) % LAP.length];
        const slug = RAIL[nextId];
        const item = root?.querySelector<HTMLElement>(`[data-slug="${slug}"]`) ?? null;
        if (!f.away && t >= T.away) {
          f.away = true;
          setHit(false);
          reveal(item);
          cur.go(item);
        }
        if (f.away && t >= T.away + 950) cur.follow(item);
        const pressNow = t >= T.press && t < T.release;
        if (pressNow !== f.press) {
          f.press = pressNow;
          setPress(pressNow);
          setPressSlug(pressNow ? slug : undefined);
        }
        if (t >= T.release) {
          const next = screens.findIndex((x) => x.id === nextId);
          restart();
          setAt(next >= 0 ? next : 0);
        }
      } else if (t >= T.away && !f.away) {
        // The visitor chose this screen: stay on it, let the detail go and come back to it.
        f.away = true;
        setHit(false);
        cur.hide();
      } else if (t >= T.again) {
        restart();
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [inView, screens]);

  const choose = (next: number) => {
    manual.current = true;
    cursor.hide();
    clock.current = 0;
    flags.current = { parked: false, went: false, hit: false, away: false, press: false };
    setHit(false);
    setPressSlug(undefined);
    setPress(false);
    setAt(next);
    track("screen", screens[next]?.id);
  };

  return (
    <div ref={region} className={styles.tour} data-soft={soft ? "" : undefined} data-at={screen.id}>
      <div
        ref={strip}
        className={styles.tourTabs}
        role="tablist"
        aria-label={hint}
        onKeyDown={(event) =>
          onTabKeys(event, at, screens.length, (next) => {
            choose(next);
            focusTab(strip.current, next);
          })
        }
      >
        {screens.map((item, i) => (
          <button
            key={item.id}
            type="button"
            data-tab=""
            role="tab"
            id={`tela-${item.id}`}
            aria-selected={i === at}
            aria-controls={`tela-painel-${item.id}`}
            tabIndex={tabIndex(i, at)}
            className={styles.tourTab}
            onClick={() => choose(i)}
          >
            {item.nav}
          </button>
        ))}
      </div>

      <div
        id={`tela-painel-${screen.id}`}
        role="tabpanel"
        aria-labelledby={`tela-${screen.id}`}
        tabIndex={-1}
        className={styles.tourPanel}
      >
        <div className={styles.tourScreen}>
          {/* An application window: a slim title bar, and the product's own frame inside. */}
          <div className={styles.tourWindow}>
            <div className={styles.tourBar} aria-hidden="true">
              <i />
              <i />
              <i />
            </div>
            <div ref={box} className={styles.tourStage} data-hit={hit ? "" : undefined} data-press={press ? "" : undefined}>
              <AppFrame
                screen={screen.nav}
                rail={RAIL[screen.id] ?? ""}
                chip="Demo"
                className={styles.tourFrame}
                bodyClassName={styles.tourBody}
                contentKey={screen.id}
                pressSlug={pressSlug}
              >
                {screen.id === "visao-geral" ? <OverviewCrop /> : null}
                {screen.id === "agenda" ? <AgendaCrop /> : null}
                {screen.id === "pacientes" ? <PatientsCrop /> : null}
                {screen.id === "prontuario" ? <RecordCrop /> : null}
                {screen.id === "oportunidades" ? <OpportunitiesCrop fronts={fronts} /> : null}
              </AppFrame>
              <DemoCursor spot={cursor.spot} press={press} />
            </div>
          </div>
        </div>

        <div key={screen.id} className={styles.tourWords}>
          <h3 className={styles.tourTitle}>{screen.title}</h3>
          <p className={styles.tourText}>{screen.text}</p>
          <p className={styles.tourBenefit}>
            <span aria-hidden="true">→ </span>
            {screen.benefit}
          </p>
          {screen.note ? <p className={styles.tourNote}>{screen.note}</p> : null}
        </div>

        <p className={styles.note}>{note}</p>
      </div>
    </div>
  );
}

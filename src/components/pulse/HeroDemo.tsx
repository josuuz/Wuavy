"use client";

import { useEffect, useRef, useState } from "react";

import { Pulse } from "@/components/flow/Pulse";
import { cn } from "@/lib/utils";
import { DemoCursor, pointAt, useReducedMotion, useTyped, type CursorSpot } from "./demo-kit";
import styles from "./demo.module.css";
import { ProductSurface } from "./product";
import { focusTab, onTabKeys, tabIndex } from "./tabs";
import { track } from "./track";

/*
  The first screen's demonstration: one patient card, four scenes, about
  fifteen seconds, one idea in each.

    1  A quote went unanswered      the card, alone: name, what, "Sem resposta"
    2  The Pulse picks it out       a ring, and "Ver oportunidade" appears
    3  A click opens it             a cursor goes to the button and presses it;
                                    the details the story needs open under it
    4  The message waits            the draft is typed, marked as a draft

  It stops there. It never shows a message sent, an answer, a booking or
  revenue: the last scene is a person about to read a draft. Only what the
  product does today is drawn, and the labels say what the product says.

  Everything else is left out on purpose — no menu, no columns, no other
  patients, no numbers. The tour further down shows the whole interface.

  How it behaves:

  · it starts when it comes into view and plays once, then stays on the last
    scene. "Pausar" holds it, "Repetir" plays it again;
  · one clock (requestAnimationFrame) runs it, only while it is on screen and
    not paused, and it resumes where it stopped;
  · the four scene marks are buttons: pressing one hands the scene to the
    visitor, who then steps through it by hand and nothing plays on its own;
  · the picture is aria-hidden; what a screen reader gets is the four scenes
    (each named) and the sentence of the one that is showing;
  · with reduced motion it does not play at all. It waits on the first scene,
    the visitor moves it with the scene marks (or the arrows), and there is no
    cursor and no typing — each scene appears in its finished state.

  The title, the lead and the buttons above it are plain server-rendered
  markup: nothing in the first screen waits for this.
*/

/** How long each scene stays, in ms: about fifteen seconds in all. */
const DWELL = [2600, 3200, 4200, 4800] as const;
/** In scene 3 the cursor arrives, presses at CLICK_AT and the details open. */
const CLICK_AT = 1500;
const PRESS_FROM = 1300;
const PRESS_TO = 1750;

export interface HeroDemoCopy {
  label: string;
  note: string;
  play: string;
  pause: string;
  replay: string;
  /** "Cena {n} de {total}: {title}" — each scene mark's accessible name. */
  scene: string;
  patient: { name: string; sent: string; status: string };
  action: string;
  /** The two lines the opened card needs: what she asked for, and why it is on the list. */
  details: readonly { label: string; text: string }[];
  draftLabel: string;
  draft: string;
  draftNote: string;
  scenes: readonly { title: string; caption: string }[];
}

export function HeroDemo({ demo, className }: { demo: HeroDemoCopy; className?: string }) {
  const { scenes } = demo;
  const reduced = useReducedMotion();
  const [at, setAt] = useState(0);
  const [clicked, setClicked] = useState(false);
  const [press, setPress] = useState(false);
  const [playing, setPlaying] = useState(true);
  const [taken, setTaken] = useState(false);
  const [done, setDone] = useState(false);
  const [onScreen, setOnScreen] = useState(false);
  const [spot, setSpot] = useState<CursorSpot | null>(null);

  const region = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const marks = useRef<HTMLDivElement>(null);
  const actionRef = useRef<HTMLSpanElement>(null);
  const atRef = useRef(0);
  const clock = useRef(0);
  const flags = useRef({ press: false, clicked: false });

  useEffect(() => {
    atRef.current = at;
  }, [at]);

  /** In the visitor's hands (or with reduced motion) a scene shows how it ends, and nothing plays. */
  const manual = taken || reduced;
  const running = playing && onScreen && !manual && !done;
  const opened = at >= 3 || (at === 2 && (clicked || manual));
  const typed = useTyped(demo.draft, at === 3, reduced || taken, 900);

  // It starts when it comes into view, not before: nothing plays behind the fold.
  useEffect(() => {
    const el = region.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => setOnScreen(entry.isIntersecting), { threshold: 0.5 });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (onScreen) track("demo_start");
  }, [onScreen]);

  // The one clock: it advances scenes, and in scene 3 it times the press and the opening.
  useEffect(() => {
    if (!running) return;
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      clock.current += Math.min(now - last, 80);
      last = now;
      const t = clock.current;
      const index = atRef.current;

      if (index === 2) {
        const pressNow = t >= PRESS_FROM && t < PRESS_TO;
        if (pressNow !== flags.current.press) {
          flags.current.press = pressNow;
          setPress(pressNow);
        }
        const clickedNow = t >= CLICK_AT;
        if (clickedNow !== flags.current.clicked) {
          flags.current.clicked = clickedNow;
          setClicked(clickedNow);
        }
      }

      if (t >= (DWELL[index] ?? DWELL[0])) {
        clock.current = 0;
        flags.current = { press: false, clicked: false };
        setPress(false);
        setClicked(false);
        if (index >= scenes.length - 1) setDone(true);
        else setAt(index + 1);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [running, scenes.length]);

  // The cursor goes to "Ver oportunidade" once the card has settled where it will be pressed.
  useEffect(() => {
    if (manual || at !== 2) return;
    const place = () => setSpot(pointAt(box.current, actionRef.current));
    const settle = window.setTimeout(place, 250);
    window.addEventListener("resize", place);
    return () => {
      window.clearTimeout(settle);
      window.removeEventListener("resize", place);
    };
  }, [at, manual]);

  /** Pressing a scene mark hands the demonstration to the visitor, for good. */
  const take = (next: number) => {
    clock.current = 0;
    flags.current = { press: false, clicked: false };
    setPress(false);
    setClicked(false);
    setAt(next);
    setPlaying(false);
    setTaken(true);
    setDone(false);
  };

  const replay = () => {
    clock.current = 0;
    flags.current = { press: false, clicked: false };
    setPress(false);
    setClicked(false);
    setAt(0);
    setDone(false);
    setTaken(false);
    setPlaying(true);
  };

  const scene = scenes[at] ?? scenes[0];
  const naming = (i: number) =>
    demo.scene
      .replace("{n}", String(i + 1))
      .replace("{total}", String(scenes.length))
      .replace("{title}", scenes[i]?.title ?? "");

  return (
    <div ref={region} className={cn(styles.demo, className)}>
      <ProductSurface className={cn(styles.stage, styles.heroStage)}>
        <div ref={box} className={styles.inner} aria-hidden="true">
          {/* The Pulse's caption, one scene at a time: the sentence the scene is for. */}
          <div className={styles.caption}>
            <span className={styles.avatar}>
              <Pulse still state={at === 3 ? "calm" : "idle"} />
            </span>
            <div className={styles.lines}>
              {scenes.map((item, i) => (
                <p key={item.title} className={styles.line} data-on={i === at ? "" : undefined}>
                  {item.caption}
                </p>
              ))}
            </div>
          </div>

          <div className={cn(styles.deck, styles.heroDeck)} data-scene={at} data-clicked={opened ? "" : undefined}>
            <article className={styles.card} data-ring={at === 1 || at === 2 ? "" : undefined}>
              <header className={styles.head}>
                <p className={styles.name}>{demo.patient.name}</p>
                <p className={styles.what}>{demo.patient.sent}</p>
                <span className={styles.chip}>{demo.patient.status}</span>
              </header>

              {/* The Pulse's doing: the button that was not there appears with the ring. */}
              {/* It stays through the click, marked as done, and folds away in the last scene: the draft needs the room. */}
              <div className={styles.collapse} data-open={at >= 1 && at < 3 ? "" : undefined}>
                <div>
                  <div className={styles.actionRow}>
                    <span
                      ref={actionRef}
                      className={styles.action}
                      data-press={press ? "" : undefined}
                      data-done={opened ? "" : undefined}
                    >
                      {demo.action}
                    </span>
                  </div>
                </div>
              </div>

              <div className={styles.collapse} data-open={opened ? "" : undefined}>
                <div>
                  <div className={styles.details}>
                    {demo.details.map((line) => (
                      <p key={line.label} className={styles.text}>
                        <span className={styles.kicker}>{line.label} </span>
                        {line.text}
                      </p>
                    ))}
                  </div>
                </div>
              </div>

              <div className={styles.collapse} data-open={at >= 3 ? "" : undefined}>
                <div>
                  <section className={styles.draft}>
                    <p className={styles.kicker}>{demo.draftLabel}</p>
                    {/* The whole text is laid out from the start, so typing never moves anything. */}
                    <p className={styles.draftText}>
                      {demo.draft.slice(0, typed)}
                      <span className={styles.unwritten}>{demo.draft.slice(typed)}</span>
                    </p>
                    <p className={styles.note}>{demo.draftNote}</p>
                  </section>
                </div>
              </div>
            </article>
          </div>

          <DemoCursor spot={spot} on={!manual && at === 2} press={press} />
        </div>
      </ProductSurface>

      <p className="sr-only" role="tabpanel">
        {scene.title} {scene.caption}
      </p>

      <div className={styles.controls}>
        <div
          ref={marks}
          className={styles.dots}
          role="tablist"
          aria-label={demo.label}
          onKeyDown={(event) =>
            onTabKeys(event, at, scenes.length, (next) => {
              take(next);
              focusTab(marks.current, next);
            })
          }
        >
          {scenes.map((item, i) => (
            <button
              key={item.title}
              type="button"
              role="tab"
              data-tab=""
              aria-selected={i === at}
              aria-label={naming(i)}
              tabIndex={tabIndex(i, at)}
              data-done={i < at ? "" : undefined}
              className={styles.dot}
              onClick={() => take(i)}
            >
              <span className={styles.dotMark} aria-hidden="true" />
            </button>
          ))}
        </div>

        {manual || done ? null : (
          <button type="button" className={styles.ghost} onClick={() => setPlaying((on) => !on)}>
            {playing ? demo.pause : demo.play}
          </button>
        )}
        <button type="button" className={styles.ghost} onClick={replay}>
          {demo.replay}
        </button>
        <p className={styles.fine}>{demo.note}</p>
      </div>
    </div>
  );
}

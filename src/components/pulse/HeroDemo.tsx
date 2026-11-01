"use client";

import { useEffect, useRef, useState } from "react";

import { Pulse } from "@/components/flow/Pulse";
import { cn } from "@/lib/utils";
import {
  DemoCursor,
  playLabel,
  pointAt,
  usePresence,
  useReducedMotion,
  useTyped,
  type CursorSpot,
  type PlayMode,
} from "./demo-kit";
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

  How it behaves — one mode (PlayMode in demo-kit) says where it is, and one
  button follows it: "Reproduzir demonstração" · "Pausar" · "Continuar" ·
  "Repetir".

  · normal motion: it starts by itself when it is in view enough, plays once
    and rests on the last scene, where "Repetir" plays it again;
  · one clock (requestAnimationFrame) runs it, only while it is in view and the
    tab is in front, and it resumes where it stopped;
  · the four scene marks are buttons: pressing one hands the scene to the
    visitor ("manual"), who then steps through it by hand and nothing plays on
    its own. Hovering or focusing is not an act: only a press is. "Reproduzir
    demonstração" takes it back and plays it from the start;
  · the picture is aria-hidden; what a screen reader gets is the four scenes
    (each named) and the sentence of the one that is showing;
  · reduced motion reduces, it does not remove: nothing starts by itself and
    "Reproduzir demonstração" is there from the first paint. Pressed, it plays
    a calm version: the scenes change one after the other, with no cursor, no
    travel and no typing — each scene appears in its finished state. The scene
    marks (and the arrows) step through it by hand all the same.

  The title, the lead and the buttons above it are plain server-rendered
  markup: nothing in the first screen waits for this.
*/

/** How long each scene stays, in ms: about sixteen seconds in all. */
const DWELL = [2600, 3200, 4200, 6000] as const;
/** The calm version has no cursor to wait for, so scene 3 is shorter. */
const CALM_DWELL = [2800, 3400, 3400, 6000] as const;
/** In scene 3 the cursor arrives, presses at CLICK_AT and the details open. */
const CLICK_AT = 1500;
const PRESS_FROM = 1300;
const PRESS_TO = 1750;

export interface HeroDemoCopy {
  label: string;
  note: string;
  /** Before it has played, and to watch it again after the visitor took it. */
  play: string;
  pause: string;
  resume: string;
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
  const [mode, setMode] = useState<PlayMode>("ready");
  const [spot, setSpot] = useState<CursorSpot | null>(null);

  const region = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const marks = useRef<HTMLDivElement>(null);
  const actionRef = useRef<HTMLSpanElement>(null);
  const atRef = useRef(0);
  const clock = useRef(0);
  const flags = useRef({ press: false, clicked: false });
  const started = useRef(false);

  useEffect(() => {
    atRef.current = at;
  }, [at]);

  const inView = usePresence(region, 0.5);
  /** The first act of any kind, by itself or by the visitor, is the demonstration's start. */
  const begin = () => {
    if (started.current) return;
    started.current = true;
    track("demo_start");
  };
  /** Calm: each scene shows how it ends, with no cursor, no typing and no travel. */
  const calm = reduced || mode === "manual";
  const running = mode === "playing" && inView;
  const opened = at >= 3 || (at === 2 && (clicked || calm));
  const typed = useTyped(demo.draft, at === 3, calm, 900);

  // Normal motion starts itself, once, when it comes into view: nothing plays behind the fold.
  // Reduced motion waits for "Reproduzir demonstração".
  useEffect(() => {
    if (reduced || !inView || mode !== "ready" || started.current) return;
    begin();
    setMode("playing");
  }, [reduced, inView, mode]);

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

      if (index === 2 && !reduced) {
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

      if (t >= ((reduced ? CALM_DWELL : DWELL)[index] ?? DWELL[0])) {
        clock.current = 0;
        flags.current = { press: false, clicked: false };
        setPress(false);
        setClicked(false);
        if (index >= scenes.length - 1) setMode("done");
        else setAt(index + 1);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [running, reduced, scenes.length]);

  // The cursor goes to "Ver oportunidade" once the card has settled where it will be pressed.
  useEffect(() => {
    if (calm || at !== 2) return;
    const place = () => setSpot(pointAt(box.current, actionRef.current));
    const settle = window.setTimeout(place, 250);
    window.addEventListener("resize", place);
    return () => {
      window.clearTimeout(settle);
      window.removeEventListener("resize", place);
    };
  }, [at, calm]);

  const reset = (next: number) => {
    clock.current = 0;
    flags.current = { press: false, clicked: false };
    setPress(false);
    setClicked(false);
    setAt(next);
  };

  /** Pressing a scene mark hands the demonstration to the visitor, until "Reproduzir demonstração". */
  const take = (next: number) => {
    begin();
    reset(next);
    setMode("manual");
  };

  /** The one control: it plays, holds, resumes or replays, whichever the mode asks for. */
  const control = () => {
    if (mode === "playing") return setMode("paused");
    if (mode === "paused") return setMode("playing");
    begin();
    reset(0);
    setMode("playing");
  };

  const scene = scenes[at] ?? scenes[0];
  const naming = (i: number) =>
    demo.scene
      .replace("{n}", String(i + 1))
      .replace("{total}", String(scenes.length))
      .replace("{title}", scenes[i]?.title ?? "");

  return (
    <div ref={region} className={cn(styles.demo, className)} data-mode={mode}>
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

          <div className={styles.deck} data-scene={at} data-clicked={opened ? "" : undefined}>
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

          <DemoCursor spot={spot} on={!calm && at === 2} press={press} />
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

        <button type="button" className={styles.ghost} onClick={control}>
          {playLabel(mode, demo)}
        </button>
        <p className={styles.fine}>{demo.note}</p>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";

import { Pulse } from "@/components/flow/Pulse";
import { DemoCursor, useDemoCursor, usePresence, useReducedMotion } from "./demo-kit";
import styles from "./demo.module.css";
import { ProductSurface } from "./product";
import { track } from "./track";

/*
  The first screen's demonstration: one patient card, five scenes, about
  twenty seconds, one idea in each. It plays by itself, in a loop.

    1  A quote went unanswered      the card, alone: name, what, "Sem resposta"
    2  Clinavy picks it out       a ring, and "Ver oportunidade" appears
    3  A click opens it             the cursor glides to the button, rests, presses
                                    it; the details open as a result
    4  Another click                the cursor goes on to "Ver sugestão de mensagem"
                                    and presses that
    5  The message waits            the draft, marked as a draft, held a few seconds

  Then the stage lets go softly and the story begins again, for as long as it is
  in view. It never shows a message sent, an answer, a booking or revenue: the
  last scene is a person about to read a draft.

  How it behaves:

  · it starts by itself when it is in view enough, and loops. Out of view, or
    with the tab hidden, its clock rests and resumes where it stopped. There is
    nothing to press: no play, pause, replay or scene marks, and a hover, a
    tap or a click on the stage does nothing;
  · one clock (requestAnimationFrame) runs everything: the scenes, the cursor
    and the presses. A click is never earlier than the cursor's arrival: it
    leaves, arrives, rests, and only then the button shows pressed and its
    result opens;
  · the cursor is the demonstration's own drawing, on every device and with
    every motion setting. The visitor's pointer is never read, hidden or moved;
  · reduced motion changes how it moves, never whether it plays: the same story,
    the same cursor and the same two clicks, with a short soft glide, a press
    shown without zoom, a quiet fade for the click and content that cross-fades;
  · the picture is aria-hidden; what a screen reader gets is the sentence of
    the scene that is showing.

  The title, the lead and the buttons above it are plain server-rendered
  markup: nothing in the first screen waits for this.
*/

/** How long each scene stays, in ms. */
const DWELL = [2800, 3200, 5200, 3300, 7000] as const;
/** The soft let-go between the last scene and the first. */
const FADE = 450;

/**
 * The scenes where the cursor clicks, in ms from the start of the scene: when it leaves,
 * when the button shows pressed and when it lets go. The cursor takes about 900 ms to
 * arrive, so there is always a rest between its arrival and the press.
 */
const BEATS: Record<number, { leave: number; press: number; release: number }> = {
  2: { leave: 450, press: 1800, release: 2250 },
  3: { leave: 1000, press: 2350, release: 2800 },
};
/** The click's effect lands just after the press begins. */
const CLICK_LAG = 100;

export interface HeroDemoCopy {
  label: string;
  note: string;
  patient: { name: string; sent: string; status: string };
  action: string;
  /** The second button, on the opened card. */
  suggest: string;
  /** The two lines the opened card needs: what she asked for, and why it is on the list. */
  details: readonly { label: string; text: string }[];
  draftLabel: string;
  draft: string;
  draftNote: string;
  scenes: readonly { title: string; caption: string }[];
}

export function HeroDemo({ demo, className }: { demo: HeroDemoCopy; className?: string }) {
  const { scenes } = demo;
  const last = scenes.length - 1;
  const soft = useReducedMotion();
  const [at, setAt] = useState(0);
  const [clicked, setClicked] = useState(false);
  const [press, setPress] = useState(false);
  const [fading, setFading] = useState(false);

  const region = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const actionRef = useRef<HTMLSpanElement>(null);
  const suggestRef = useRef<HTMLSpanElement>(null);
  const atRef = useRef(0);
  const clock = useRef(0);
  const flags = useRef({ parked: false, went: false, press: false, clicked: false, fade: false });
  const started = useRef(false);
  const cursor = useDemoCursor(box);
  const cursorRef = useRef(cursor);

  useEffect(() => {
    atRef.current = at;
    cursorRef.current = cursor;
  });

  const inView = usePresence(region, 0.35);
  const opened = at >= 3 || (at === 2 && clicked);

  useEffect(() => {
    if (inView && !started.current) {
      started.current = true;
      track("demo_start");
    }
  }, [inView]);

  // The one clock: scenes, cursor and presses, in order, and the loop.
  useEffect(() => {
    if (!inView) return;
    let frame = 0;
    let before = performance.now();

    const begin = (index: number) => {
      clock.current = 0;
      flags.current = { parked: false, went: false, press: false, clicked: false, fade: false };
      setPress(false);
      setClicked(false);
      setAt(index);
      if (index !== 3) cursorRef.current.hide();
    };

    const tick = (now: number) => {
      clock.current += Math.min(now - before, 80);
      before = now;
      const t = clock.current;
      const index = atRef.current;
      const f = flags.current;
      const beat = BEATS[index];

      if (beat) {
        const target = index === 2 ? actionRef.current : suggestRef.current;
        // Placed out of sight first (scene 4 only if it is not already on stage), then it glides in.
        if (!f.parked && t >= beat.leave - 300) {
          f.parked = true;
          if (!cursorRef.current.live()) cursorRef.current.park(target);
        }
        if (!f.went && t >= beat.leave) {
          f.went = true;
          cursorRef.current.go(target);
        }
        // Once it has arrived it stays on the button, even while the card opens and moves it.
        if (f.went && t >= beat.leave + 950) cursorRef.current.follow(target);
        const pressNow = t >= beat.press && t < beat.release;
        if (pressNow !== f.press) {
          f.press = pressNow;
          setPress(pressNow);
        }
        const clickedNow = t >= beat.press + CLICK_LAG;
        if (clickedNow !== f.clicked) {
          f.clicked = clickedNow;
          setClicked(clickedNow);
        }
      }

      const dwell = DWELL[index] ?? DWELL[0];
      if (index < last) {
        if (t >= dwell) begin(index + 1);
      } else if (t >= dwell + FADE) {
        setFading(false);
        begin(0);
      } else if (t >= dwell && !f.fade) {
        f.fade = true;
        setFading(true);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [inView, last]);

  const scene = scenes[at] ?? scenes[0];

  return (
    <div
      ref={region}
      className={className ? `${styles.demo} ${className}` : styles.demo}
      data-soft={soft ? "" : undefined}
      role="group"
      aria-label={demo.label}
    >
      <ProductSurface className={`${styles.stage} ${styles.heroStage}`}>
        <div ref={box} className={styles.inner} aria-hidden="true" data-fading={fading ? "" : undefined}>
          {/* Clinavy's caption, one scene at a time: the sentence the scene is for. */}
          <div className={styles.caption}>
            <span className={styles.avatar}>
              <Pulse still state={at === last ? "calm" : "idle"} />
            </span>
            <div className={styles.lines}>
              {scenes.map((item, i) => (
                <p key={item.title} className={styles.line} data-on={i === at ? "" : undefined}>
                  {item.caption}
                </p>
              ))}
            </div>
          </div>

          <div className={styles.deck}>
            <article className={styles.card} data-ring={at === 1 || at === 2 ? "" : undefined}>
              <header className={styles.head}>
                <p className={styles.name}>{demo.patient.name}</p>
                <p className={styles.what}>{demo.patient.sent}</p>
                <span className={styles.chip}>{demo.patient.status}</span>
              </header>

              {/* Clinavy's doing: the button that was not there appears with the ring, and stays,
                  marked as done, until the next click needs the room. */}
              <div className={styles.collapse} data-open={at >= 1 && at < 3 ? "" : undefined}>
                <div>
                  <div className={styles.actionRow}>
                    <span
                      ref={actionRef}
                      className={styles.action}
                      data-press={at === 2 && press ? "" : undefined}
                      data-done={opened ? "" : undefined}
                    >
                      {demo.action}
                    </span>
                  </div>
                </div>
              </div>

              {/* What the first click opened. */}
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

              {/* The second button, while it waits to be pressed; it gives way to the draft. */}
              <div className={styles.collapse} data-open={at === 3 ? "" : undefined}>
                <div>
                  <div className={styles.actionRow}>
                    <span
                      ref={suggestRef}
                      className={styles.action}
                      data-press={at === 3 && press ? "" : undefined}
                      data-done={at === 3 && clicked ? "" : undefined}
                    >
                      {demo.suggest}
                    </span>
                  </div>
                </div>
              </div>

              <div className={styles.collapse} data-open={at >= 4 ? "" : undefined}>
                <div>
                  <section className={styles.draft}>
                    <p className={styles.kicker}>{demo.draftLabel}</p>
                    <p className={styles.draftText}>{demo.draft}</p>
                    <p className={styles.note}>{demo.draftNote}</p>
                  </section>
                </div>
              </div>
            </article>
          </div>

          <DemoCursor spot={cursor.spot} press={press} />
        </div>
      </ProductSurface>

      <p className="sr-only">
        {scene.title} {scene.caption}
      </p>

      <div className={styles.controls}>
        <p className={styles.fine}>{demo.note}</p>
      </div>
    </div>
  );
}

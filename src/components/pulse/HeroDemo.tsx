"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";

import { VIEWS } from "@/components/flow/demo/copy";
import { Pulse } from "@/components/flow/Pulse";
import { DemoCursor, useDemoCursor, usePresence, useReducedMotion } from "./demo-kit";
import styles from "./demo.module.css";
import { AppFrame, SAMPLE } from "./product";
import { track } from "./track";

/*
  The first screen's demonstration: the clinic's routine, and what Clinavy picks out of it. Six
  scenes, about twenty-five seconds, one idea in each. It plays by itself, in a loop.

    1  The routine keeps the team busy      the patients list, and around the laptop the first
                                            pieces: an estimate, tomorrow's agenda
    2  Some opportunities go unnoticed      three signals become readable: the estimate has no
                                            answer, a return is due, an hour is free
    3  Clinavy shows what deserves attention  the estimate is lit, the rest steps back, the
                                            estimate's piece leans toward the screen
    4  A click opens it                     the cursor glides to "Ver oportunidade", rests, presses
                                            it; the details open as a result
    5  Another click                        the cursor goes on to "Ver sugestão de mensagem" and
                                            presses that
    6  The team reviews and decides         the draft, marked as a draft, held a few seconds

  Then the stage lets go softly and the story begins again, for as long as it is in view. The
  estimate is the proof of the promise, not the whole of it: the first two scenes are the clinic's
  routine, in the product's own patients list. It never shows a message sent, an answer, a booking
  or revenue: the last scene is a person about to read a draft.

  How it behaves:

  · it starts by itself when it is in view enough, and loops. Out of view, or with the tab hidden,
    its clock rests and resumes where it stopped. There is nothing to press: no play, pause,
    replay or scene marks, and a hover, a tap or a click on the stage does nothing;
  · one clock (requestAnimationFrame) runs everything: the scenes, the pieces around the laptop,
    the cursor and the presses. A click is never earlier than the cursor's arrival: it leaves,
    arrives, rests, and only then the button shows pressed and its result opens. While the cursor
    is clicking, the pieces around the laptop go quiet so the eye stays on it;
  · the laptop never re-enters: only the story inside it and the pieces around it start again, and
    on every lap after the first the reset happens while they are faded out, so nothing of the
    last lap is left to fade away in sight;
  · the cursor is the demonstration's own drawing, on every device and with every motion setting.
    The visitor's pointer is never read, hidden or moved;
  · reduced motion changes how it moves, never whether it plays: the same story, the same cursor
    and the same two clicks, with a short soft glide, a press shown without zoom, a quiet fade for
    the click and content that cross-fades;
  · the picture is aria-hidden; what a screen reader gets is the sentence of the scene that is
    showing.

  The title, the lead and the buttons above it are plain server-rendered markup: nothing in the
  first screen waits for this.
*/

/** How long each scene stays, in ms. */
const DWELL = [3000, 3600, 3200, 5200, 3300, 7000] as const;
/** The soft let-go between the last scene and the first. */
const FADE = 450;

/**
 * The scenes where the cursor clicks, in ms from the start of the scene: when it leaves,
 * when the button shows pressed and when it lets go. The cursor takes about 900 ms to
 * arrive, so there is always a rest between its arrival and the press.
 */
const BEATS: Record<number, { leave: number; press: number; release: number }> = {
  3: { leave: 450, press: 1800, release: 2250 },
  4: { leave: 1000, press: 2350, release: 2800 },
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
  /** Three pieces of the routine laid around the screen: each a few real words. */
  aside: {
    quote: { kicker: string; sent: string; review: string };
    agenda: { day: string; free: string; busy: string };
    back: { kicker: string; name: string; note: string };
    /** The same three signals as small tags under the phone, where there is no room beside it. */
    strip: { quote: string; back: string; agenda: string };
  };
}

/** The product's own names for the two screens the story visits. */
const screenName = (slug: string) => VIEWS.find((view) => view.slug === slug)?.label ?? "";

export function HeroDemo({ demo, className }: { demo: HeroDemoCopy; className?: string }) {
  const { scenes } = demo;
  const last = scenes.length - 1;
  const soft = useReducedMotion();
  const [at, setAt] = useState(0);
  const [clicked, setClicked] = useState(false);
  const [press, setPress] = useState(false);
  const [fading, setFading] = useState(false);
  /** True from the first moment the scene is on screen: the pieces come in once, then stay. */
  const [ready, setReady] = useState(false);
  /** True from the second lap on: the reset is then instant, behind the fade. */
  const [again, setAgain] = useState(false);

  const region = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const screenRef = useRef<HTMLDivElement>(null);
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
  /** The details are open from the first click until the draft takes their place. */
  const detailsOpen = at === 4 || (at === 3 && clicked);

  useEffect(() => {
    if (inView && !started.current) {
      started.current = true;
      setReady(true);
      track("demo_start");
    }
  }, [inView]);

  // On a phone the product's rail is a strip that scrolls: keep the lit screen in sight.
  useEffect(() => {
    const here = screenRef.current?.querySelector<HTMLElement>("li[data-here]");
    const list = here?.parentElement;
    if (!here || !list || list.scrollWidth <= list.clientWidth) return;
    list.scrollLeft = here.offsetLeft - (list.clientWidth - here.offsetWidth) / 2;
  }, [at]);

  // The one clock: scenes, pieces, cursor and presses, in order, and the loop.
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
      if (index !== 4) cursorRef.current.hide();
    };

    const tick = (now: number) => {
      clock.current += Math.min(now - before, 80);
      before = now;
      const t = clock.current;
      const index = atRef.current;
      const f = flags.current;
      const beat = BEATS[index];

      if (beat) {
        const target = index === 3 ? actionRef.current : suggestRef.current;
        // Placed out of sight first (the second click only if it is not already on stage), then it glides in.
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
        setAgain(true);
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

  const { aside } = demo;
  const [ana, beatriz] = SAMPLE.patients;
  const here = at < 2 ? "pacientes" : "oportunidades";

  return (
    <div
      className={className ? `${styles.scene} ${className}` : styles.scene}
      data-at={at}
      data-soft={soft ? "" : undefined}
      data-fading={fading ? "" : undefined}
      data-again={again ? "" : undefined}
      role="group"
      aria-label={demo.label}
    >
      {/* The device is the stage: the signals and the next step are laid around it, on the same clock. */}
      <div ref={region} className={styles.device}>
        {/* The room: a graphite floor, a burnt-orange light low behind the laptop, a trace of grain and one
            arc that leads the eye from the estimate to the screen. Static; only the lit stretch moves. */}
        <div className={styles.backdrop} aria-hidden="true">
          <span className={styles.floor} />
          <span className={styles.glow} />
          <span className={styles.grain} />
        </div>
        <svg className={styles.arcs} viewBox="0 0 1440 400" fill="none" aria-hidden="true">
          <defs>
            <linearGradient id="arcFade" x1="0" x2="1" y1="0" y2="0">
              <stop offset="0" stopColor="#f6f4ee" stopOpacity="0" />
              <stop offset="0.24" stopColor="#f6f4ee" stopOpacity="0.4" />
              <stop offset="0.76" stopColor="#f6f4ee" stopOpacity="0.3" />
              <stop offset="1" stopColor="#f6f4ee" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path className={styles.arcA} d="M30 440 C 150 360, 250 225, 368 156 C 520 80, 800 44, 1072 52 C 1200 56, 1320 14, 1410 -50" />
          <path className={styles.arcLit} d="M30 440 C 150 360, 250 225, 368 156 C 520 80, 800 44, 1072 52 C 1200 56, 1320 14, 1410 -50" pathLength="100" />
        </svg>

        {/* Three pieces of the routine, in layers around the laptop. They take part in every lap, each in its
            scene: the agenda reveals a free hour, the return comes in, the estimate takes the light and leans
            toward the screen, and all of them go quiet while the cursor is clicking. */}
        <div className={styles.sides} aria-hidden="true" data-ready={ready ? "" : undefined}>
          <div className={`${styles.piece} ${styles.pAgenda}`}>
            <p className={styles.pKick}>{aside.agenda.day}</p>
            <ul className={styles.slots}>
              <li>
                <b>10h30</b>
                <span>{aside.agenda.busy}</span>
              </li>
              <li data-slot="">
                <b>14h</b>
                <span className={styles.slotText}>
                  <span data-state="busy">{aside.agenda.busy}</span>
                  <span data-state="free">{aside.agenda.free}</span>
                </span>
              </li>
              <li>
                <b>15h30</b>
                <span>{aside.agenda.busy}</span>
              </li>
            </ul>
          </div>

          <div className={`${styles.piece} ${styles.pBack}`}>
            <p className={styles.pKick}>{aside.back.kicker}</p>
            <div className={styles.pRow}>
              <span className={styles.pAvatar}>{aside.back.name.slice(0, 1)}</span>
              <div>
                <p className={styles.pName}>{aside.back.name}</p>
                <p className={styles.pNote}>{aside.back.note}</p>
              </div>
            </div>
          </div>

          <div className={`${styles.piece} ${styles.pQuote}`}>
            <p className={styles.pKick}>{aside.quote.kicker}</p>
            <div className={styles.pRow}>
              <span className={styles.pAvatar}>{demo.patient.name.slice(0, 1)}</span>
              <div>
                <p className={styles.pName}>{demo.patient.name}</p>
                <p className={styles.pNote}>{demo.patient.sent}</p>
              </div>
            </div>
            <span className={styles.pChip}>
              <i />
              <span className={styles.pChipText} data-state="sent">
                {aside.quote.sent}
              </span>
              <span className={styles.pChipText} data-state="waiting">
                {demo.patient.status}
              </span>
              <span className={styles.pChipText} data-state="review">
                {aside.quote.review}
              </span>
            </span>
          </div>
        </div>

        <div className={styles.lid}>
          <span className={styles.camera} aria-hidden="true" />
          <div ref={screenRef} className={styles.screen}>
            {/* The product itself, at the size of a laptop's screen: its own rail on the left, and the work. */}
            <AppFrame
              screen={screenName(here)}
              rail={here}
              chip="Demo"
              compact
              className={styles.heroFrame}
              bodyClassName={styles.heroBody}
            >
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
                  {/* The clinic's routine: two more patients, as the product lists them. When Clinavy picks
                      the estimate out, they step back and make room for it. */}
                  <div className={styles.collapse} data-open={at < 2 ? "" : undefined}>
                    <div>
                      <ul className={styles.mini} data-dim={at >= 2 ? "" : undefined}>
                        {[ana, beatriz].map((patient, i) => (
                          <li key={patient.name} className={styles.mrow} style={{ "--i": i } as CSSProperties}>
                            <span className={styles.mwho}>
                              <b>{patient.name}</b>
                              <small>{patient.last}</small>
                            </span>
                            <span className={styles.mchip} data-on={i === 0 && at >= 1 ? "" : undefined}>
                              {patient.next}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  <article className={styles.card} data-ring={at === 2 || at === 3 ? "" : undefined}>
                    <header className={styles.head}>
                      <p className={styles.name}>{demo.patient.name}</p>
                      <p className={styles.what}>{demo.patient.sent}</p>
                      <span className={styles.chip} data-quiet={at < 1 ? "" : undefined}>
                        <span className={styles.chipText} data-state="sent">
                          {aside.quote.sent}
                        </span>
                        <span className={styles.chipText} data-state="status">
                          {demo.patient.status}
                        </span>
                      </span>
                    </header>

                    {/* Clinavy's doing: the button that was not there appears with the ring, and stays,
                        marked as done, until the next click needs the room. */}
                    <div className={styles.collapse} data-open={at >= 2 && at < 4 ? "" : undefined}>
                      <div>
                        <div className={styles.actionRow}>
                          <span
                            ref={actionRef}
                            className={styles.action}
                            data-press={at === 3 && press ? "" : undefined}
                            data-done={at >= 4 || (at === 3 && clicked) ? "" : undefined}
                          >
                            {demo.action}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* What the first click opened. */}
                    <div className={styles.collapse} data-open={detailsOpen ? "" : undefined}>
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
                    <div className={styles.collapse} data-open={at === 4 ? "" : undefined}>
                      <div>
                        <div className={styles.actionRow}>
                          <span
                            ref={suggestRef}
                            className={styles.action}
                            data-press={at === 4 && press ? "" : undefined}
                            data-done={at === 4 && clicked ? "" : undefined}
                          >
                            {demo.suggest}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className={styles.collapse} data-open={at >= 5 ? "" : undefined}>
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
            </AppFrame>
          </div>
        </div>
        <div className={styles.base} aria-hidden="true" />
      </div>

      {/* On a phone there is no room beside the screen: the same three signals, as small tags under it. */}
      <div className={styles.strip} aria-hidden="true">
        <span className={styles.tag} data-k="quote">
          <i />
          <span className={styles.tagText} data-state="waiting">
            {aside.strip.quote}
          </span>
          <span className={styles.tagText} data-state="review">
            {aside.quote.review}
          </span>
        </span>
        <span className={styles.tag} data-k="back">
          <i />
          {aside.strip.back}
        </span>
        <span className={styles.tag} data-k="agenda">
          <i />
          {aside.strip.agenda}
        </span>
      </div>

      <p className="sr-only">
        {scene.title} {scene.caption}
      </p>

      <div className={styles.controls}>
        <p className={styles.fine}>{demo.note}</p>
      </div>
    </div>
  );
}

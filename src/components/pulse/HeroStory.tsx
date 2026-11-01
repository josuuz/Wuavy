"use client";

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";

import { Pulse } from "@/components/flow/Pulse";
import { cn } from "@/lib/utils";
import { AppFrame, OPP_LABELS, type OppScreen } from "./product";
import product from "./product.module.css";
import { focusTab, onTabKeys, tabIndex } from "./tabs";
import { track } from "./track";
import styles from "./story.module.css";

/*
  The first screen's animation: one situation, told in four beats inside a
  faithful PULSE, the way the product really works.

    0  Na clínica   — the sales board; one quote has sat unanswered for six days
    1  O PULSE      — the board gives way to Oportunidades, the front is lit and
                      the reason is said: why this one is above the others
    2  Na tela      — the front opens: the suggestion, and who the Pulse picked
    3  Com a equipe — the message appears, typed, and waits. Nothing is sent

  It is a scene, not a card that swaps its words. A camera pans down to the
  draft; a ring and a dimming guide the eye to the one thing that matters in
  each beat; a cursor goes to the button the team would press, presses it at
  the end of beats 1 and 2, and only *hovers* over "Abrir no WhatsApp" in
  beat 3 — because the decision to send is a person's.

  How it behaves:

  · one clock (requestAnimationFrame) drives everything: the progress line,
    the cursor's press and the move to the next beat. It runs only while the
    scene is on screen and not paused, and it resumes where it stopped;
  · it plays by itself until the visitor takes it over (a beat pressed, or
    Pausar). After that it is theirs, and never starts again;
  · the picture is aria-hidden. What a screen reader gets is the tab strip
    (four steps, each named) and the active beat's sentence;
  · reduced motion starts it stopped, on the first beat, and the visitor
    advances it with the four steps (or the arrows). It also drops the travel:
    no cursor, no pan, no typing — the text is whole, the changes are fades.
    Windows reports this whenever animations are off, which is common, so the
    beats must still be there to be read, just not moving by themselves.

  Nothing in the page's first screen waits for this: the title, the lead and
  both buttons are server-rendered above it.
*/

/** How long each beat stays, in ms. The last one is longest: it has to be typed and read. */
const DWELL = [4800, 5400, 5400, 8400] as const;
/** The cursor presses at this fraction of beats 1 and 2. */
const PRESS_AT = 0.8;
const REDUCED = "(prefers-reduced-motion: reduce)";

/** The Vendas board, as the product draws it. Fictitious. The three open quotes are the ones the front counts. */
const BOARD = [
  {
    stage: "Novo contato",
    cards: [
      { name: "Marcela T.", what: "Instagram" },
      { name: "Débora F.", what: "Indicação" },
    ],
  },
  {
    stage: "Em conversa",
    cards: [
      { name: "Juliana R.", what: "Peeling · perguntou ontem" },
      { name: "Patrícia L.", what: "Toxina botulínica" },
    ],
  },
  { stage: "Avaliação", cards: [{ name: "Fabiana S.", what: "Avaliação na quinta" }] },
  {
    stage: "Orçamento",
    cards: [
      { name: "Carla M.", what: "Harmonização facial", value: "R$ 3.200", late: "Sem resposta há 6 dias", focus: true },
      { name: "Renata A.", what: "Preenchimento labial", value: "R$ 2.400", late: "Sem resposta há 4 dias" },
      { name: "Priscila N.", what: "Bioestimulador", value: "R$ 1.800", late: "Sem resposta há 3 dias" },
    ],
  },
  { stage: "Agendado", cards: [{ name: "Tatiane B.", what: "Limpeza de pele · quinta, 10h" }] },
] as const;

export interface StoryCopy {
  label: string;
  note: string;
  play: string;
  pause: string;
  /** "Passo {n} de {total}: {title}" — each tab's accessible name. */
  step: string;
  beats: readonly { tag: string; title: string; text: string }[];
}

interface HeroStoryProps {
  story: StoryCopy;
  /** The quote front. The same data the first situation below it states: one source for both. */
  screen: OppScreen;
  /** The other two fronts, shown dimmed beside it, as Oportunidades lists them. */
  others: readonly OppScreen[];
  draftLabel: string;
  className?: string;
}

const subscribeReduced = (notify: () => void) => {
  const query = window.matchMedia(REDUCED);
  query.addEventListener("change", notify);
  return () => query.removeEventListener("change", notify);
};

export function HeroStory({ story, screen, others, draftLabel, className }: HeroStoryProps) {
  const { beats } = story;
  const [at, setAt] = useState(0);
  const [press, setPress] = useState(false);
  const [playing, setPlaying] = useState(true);
  /** Once the visitor has taken it over it is theirs: no pause button, no restart. */
  const [taken, setTaken] = useState(false);
  const [onScreen, setOnScreen] = useState(false);
  const [typed, setTyped] = useState(0);
  const [pan, setPan] = useState(0);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);

  const reduced = useSyncExternalStore(subscribeReduced, () => window.matchMedia(REDUCED).matches, () => false);

  const region = useRef<HTMLDivElement>(null);
  const timeline = useRef<HTMLDivElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const world = useRef<HTMLDivElement>(null);
  const card = useRef<HTMLElement>(null);
  const actionButton = useRef<HTMLSpanElement>(null);
  const prepareButton = useRef<HTMLSpanElement>(null);
  const whatsButton = useRef<HTMLSpanElement>(null);

  const atRef = useRef(0);
  const clock = useRef(0);
  const pressing = useRef(false);

  useEffect(() => {
    atRef.current = at;
  }, [at]);

  // With reduced motion the scene never plays by itself: it waits on the first beat and the visitor moves it.
  const running = playing && onScreen && !reduced;
  const draft = screen.draft;
  const shown = reduced && at >= 3 ? draft.length : typed;

  // Only while it can be seen: a loop behind the fold costs frames and competes with what is being read.
  useEffect(() => {
    const el = region.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => setOnScreen(entry.isIntersecting), { threshold: 0.3 });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (onScreen) track("demo_start");
  }, [onScreen]);

  const setProgress = (value: number) => timeline.current?.style.setProperty("--p", String(value));

  // The one clock. It advances only while running, so a pause resumes exactly where it stopped.
  useEffect(() => {
    if (!running) return;
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      clock.current += Math.min(now - last, 80);
      last = now;
      const index = atRef.current;
      const total = DWELL[index] ?? DWELL[0];
      const done = clock.current / total;
      setProgress(Math.min(1, done));

      const pressNow = index > 0 && index < 3 && done > PRESS_AT;
      if (pressNow !== pressing.current) {
        pressing.current = pressNow;
        setPress(pressNow);
      }
      if (done >= 1) {
        clock.current = 0;
        pressing.current = false;
        setPress(false);
        setProgress(0);
        setAt((i) => (i + 1) % beats.length);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [running, beats.length]);

  /** Any press hands the scene over for good. */
  const take = (next: number) => {
    clock.current = 0;
    pressing.current = false;
    setPress(false);
    setProgress(1);
    setAt(next);
    setPlaying(false);
    setTaken(true);
  };

  // The draft is typed, from a moment after it opens. The cleanup rewinds it for the next lap.
  useEffect(() => {
    if (at < 3 || reduced) return;
    let interval = 0;
    const start = window.setTimeout(() => {
      interval = window.setInterval(() => {
        setTyped((n) => {
          if (n + 1 >= draft.length) window.clearInterval(interval);
          return Math.min(n + 1, draft.length);
        });
      }, 24);
    }, 900);
    return () => {
      window.clearTimeout(start);
      window.clearInterval(interval);
      setTyped(0);
    };
  }, [at, reduced, draft]);

  // The camera: in beat 3 the scene pans down until the draft and the callout both fit. It follows the card as it grows.
  useLayoutEffect(() => {
    const view = viewport.current;
    const scene = world.current;
    const target = card.current;
    if (!view || !scene || !target) return;
    // What the camera has to keep in frame: the button about to be pressed in beat 2, the whole draft in beat 3.
    const measure = () => {
      const subject = at === 2 ? prepareButton.current : at === 3 ? target : null;
      if (!subject) return setPan(0);
      const bottom = subject.getBoundingClientRect().bottom - scene.getBoundingClientRect().top;
      setPan(Math.min(0, view.clientHeight - 24 - bottom));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(scene);
    observer.observe(target);
    return () => observer.disconnect();
  }, [at]);

  // The cursor goes to the button the team would press in this beat, once the scene has settled.
  useEffect(() => {
    if (reduced || at === 0) return;
    const place = () => {
      const view = viewport.current?.getBoundingClientRect();
      const button = [null, actionButton, prepareButton, whatsButton][at]?.current?.getBoundingClientRect();
      if (!view || !button) return;
      setCursor({ x: button.left - view.left + button.width * 0.55, y: button.top - view.top + button.height * 0.62 });
    };
    const settle = window.setTimeout(place, at === 1 ? 700 : 1500);
    window.addEventListener("resize", place);
    return () => {
      window.clearTimeout(settle);
      window.removeEventListener("resize", place);
    };
  }, [at, reduced]);

  const beat = beats[at] ?? beats[0];
  const naming = (i: number) =>
    story.step
      .replace("{n}", String(i + 1))
      .replace("{total}", String(beats.length))
      .replace("{title}", beats[i]?.title ?? "");

  return (
    <div ref={region} className={cn(styles.story, className)}>
      {/* The four steps. Titles read left to right on a desktop; on a phone only the lit one is written. */}
      <div
        ref={timeline}
        className={styles.timeline}
        role="tablist"
        aria-label={story.label}
        onKeyDown={(event) =>
          onTabKeys(event, at, beats.length, (next) => {
            take(next);
            focusTab(timeline.current, next);
          })
        }
      >
        {beats.map((item, i) => (
          <button
            key={item.tag}
            type="button"
            role="tab"
            data-tab=""
            aria-selected={i === at}
            aria-label={naming(i)}
            tabIndex={tabIndex(i, at)}
            data-done={i < at ? "" : undefined}
            className={styles.step}
            onClick={() => take(i)}
          >
            <span className={styles.bar} aria-hidden="true">
              <span className={styles.fill} />
            </span>
            <span className={styles.stepText} aria-hidden="true">
              <span className={styles.n}>{String(i + 1).padStart(2, "0")}</span>
              <span className={styles.t}>{item.title}</span>
            </span>
          </button>
        ))}
      </div>
      <p className={styles.current} aria-hidden="true">
        {beat.title}
      </p>
      <p className="sr-only" role="tabpanel">
        {beat.title} {beat.text}
      </p>

      <div className={styles.stage} aria-hidden="true">
        <div className={styles.glow} />
        <AppFrame
          screen={at === 0 ? "Vendas" : "Oportunidades"}
          rail={at === 0 ? "vendas" : "oportunidades"}
          chip="Demo"
          className={styles.frame}
        >
          <div className={styles.viewport}>
            {/* The Pulse's note, at the top where it is read first: it says what the beat is about, in the product's own voice.
                All four sit in one grid cell, so the strip is as tall as the longest and nothing moves when they change. */}
            <div className={styles.callouts}>
              <span className={styles.avatar}>
                <Pulse still state={at === 3 ? "calm" : "idle"} />
              </span>
              <div className={styles.texts}>
                {beats.map((item, i) => (
                  <div key={item.tag} className={styles.callout} data-on={i === at ? "" : undefined}>
                    <p className={styles.calloutTag}>{item.tag}</p>
                    <p className={styles.calloutText}>{item.text}</p>
                  </div>
                ))}
              </div>
            </div>

          <div ref={viewport} className={styles.clip}>
            <div ref={world} className={styles.world} data-beat={at} style={{ "--pan": pan } as CSSProperties}>
              {/* Beat 0: the board the clinic already has. */}
              <div className={styles.board}>
                {BOARD.map((column) => (
                  <section key={column.stage} className={styles.col}>
                    <h4 className={styles.colHead}>
                      <span>{column.stage}</span>
                      <span>{column.cards.length}</span>
                    </h4>
                    {column.cards.map((person) => {
                      const lit = "focus" in person && person.focus;
                      return (
                        <div key={person.name} className={styles.person} data-focus={lit ? "" : undefined}>
                          <span className={styles.personName}>{person.name}</span>
                          <span className={styles.personWhat}>{person.what}</span>
                          {"late" in person ? (
                            <span className={styles.personMeta}>
                              <span>{person.value}</span>
                              <span className={styles.late}>{person.late}</span>
                            </span>
                          ) : null}
                        </div>
                      );
                    })}
                  </section>
                ))}
              </div>

              {/* Beats 1–3: Oportunidades. The front opens; the others stay, dimmed, where the product keeps them. */}
              <div className={styles.opps}>
                <article
                  ref={card}
                  className={cn(product.opp, styles.target)}
                  data-focus={at === 1 ? "" : undefined}
                  data-open={at >= 2 ? "" : undefined}
                >
                  <header className={product.oppHead}>
                    <p className={product.oppTag}>
                      <span className="pulse-dot" aria-hidden="true" />
                      {screen.tag}
                    </p>
                    <h4 className={product.oppHeadline}>{screen.headline}</h4>
                    <p className={product.oppValue}>
                      <strong>{screen.value}</strong>
                      <span>{screen.valueLabel}</span>
                    </p>
                    <span
                      ref={actionButton}
                      className={cn(product.oppAction, styles.button)}
                      data-on={at >= 2 ? "" : undefined}
                      data-press={at === 1 && press ? "" : undefined}
                    >
                      {at >= 2 ? "Fechar" : screen.action}
                    </span>
                  </header>

                  <div className={styles.collapse} data-open={at >= 2 ? "" : undefined}>
                    <div>
                      <div className={product.oppBody}>
                        <p className={product.oppSentence}>{screen.sentence}</p>

                        <section className={product.suggestion}>
                          <p className={product.kicker}>{OPP_LABELS.suggestion}</p>
                          <p className={product.suggestionText}>{screen.suggestion}</p>
                        </section>

                        <section className={cn(product.picks, styles.picks)}>
                          <p className={product.kicker}>{screen.picked}</p>
                          <ul>
                            {screen.people.map((person) => (
                              <li key={person.name}>
                                <span className={product.pickName}>{person.name}</span>
                                <span className={product.pickDetail}>{person.detail}</span>
                                <span className={product.pickValue}>{person.value}</span>
                              </li>
                            ))}
                          </ul>
                          <span
                            ref={prepareButton}
                            className={cn(product.ghostPrimary, styles.prepare)}
                            data-done={at >= 3 ? "" : undefined}
                            data-press={at === 2 && press ? "" : undefined}
                          >
                            Preparar mensagens ({screen.people.length})
                          </span>
                        </section>

                        <div className={styles.collapse} data-open={at >= 3 ? "" : undefined}>
                          <div>
                            <section className={cn(product.draft, styles.draft)} data-focus={at === 3 ? "" : undefined}>
                              <p className={product.kicker}>{draftLabel}</p>
                              {/* The whole text is laid out from the start, so typing never moves anything below it. */}
                              <p className={product.draftText}>
                                {draft.slice(0, shown)}
                                <span className={styles.unwritten}>{draft.slice(shown)}</span>
                              </p>
                              <p className={product.draftActions}>
                                <span ref={whatsButton} className={product.ghostPrimary}>
                                  {OPP_LABELS.whatsapp}
                                </span>
                                <span className={product.ghost}>{OPP_LABELS.record}</span>
                              </p>
                            </section>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </article>

                {others.map((other) => (
                  <article key={other.tag} className={cn(product.opp, styles.ghost)}>
                    <header className={product.oppHead}>
                      <p className={product.oppTag}>{other.tag}</p>
                      <h4 className={product.oppHeadline}>{other.headline}</h4>
                      <p className={product.oppValue}>
                        <strong>{other.value}</strong>
                        <span>{other.valueLabel}</span>
                      </p>
                      <span className={product.oppAction}>{other.action}</span>
                    </header>
                  </article>
                ))}
              </div>
            </div>

            <div
              className={styles.cursor}
              data-on={!reduced && at > 0 && cursor ? "" : undefined}
              data-press={press ? "" : undefined}
              style={{ "--x": cursor?.x, "--y": cursor?.y } as CSSProperties}
            >
              <svg viewBox="0 0 24 24" width="24" height="24" focusable="false">
                <path d="M5 3l14 8-6.2 1.6L9.6 19z" fill="#fff" stroke="#1c1b19" strokeWidth="1.5" strokeLinejoin="round" />
              </svg>
            </div>
          </div>
          </div>
        </AppFrame>
      </div>

      <div className={styles.foot}>
        <p className={styles.note}>{story.note}</p>
        {/* Nothing to pause when it does not play: with reduced motion the beats are the visitor's from the start. */}
        {taken || reduced ? null : (
          <button type="button" className={styles.pause} onClick={() => setPlaying((on) => !on)}>
            {playing ? story.pause : story.play}
          </button>
        )}
      </div>
    </div>
  );
}

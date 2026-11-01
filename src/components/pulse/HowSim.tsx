"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";

import { Pulse } from "@/components/flow/Pulse";
import { DemoCursor, useDemoCursor, usePresence, useReducedMotion } from "./demo-kit";
import styles from "./demo.module.css";
import { ProductSurface } from "./product";
import { track } from "./track";

/*
  "Veja como o Clinavy ajuda sua equipe a agir" — a simulation that shows itself.

  Three situations to choose from, and one stage. On the stage, one card and
  one step at a time:

    1  the card, and one button: "Ver oportunidade"
    2  why it deserves attention, what to do next, and a second button:
       "Ver sugestão de mensagem"
    3  the draft, marked as a draft, and "Sua equipe revisa e decide o contato"

  Nothing is shown at once that the story has not reached: no list of
  patients, no total, no explanation beside the suggestion beside the message.

  The two buttons are drawings: the cursor presses them, nothing else can. They go
  nowhere and send nothing; the last step is a draft, and says so.

  How it behaves:

  · it plays the situation on show by itself, in a loop, while it is in view and
    the tab is in front: a cursor goes to each button, rests, presses it, and the
    stage follows. At the end it holds the draft for a few seconds, lets go
    softly and begins again. A hover, a tap or a click on the stage does nothing;
  · choosing another situation starts its story at once, by itself. The choices
    are for exploring other examples; nothing needs pressing to follow the story;
  · one clock runs everything, and the cursor is driven by it: it always arrives
    before the click;
  · the cursor is there on every device and with every motion setting. Reduced
    motion changes how it moves, never whether it plays: a short soft glide, a
    press shown without zoom, a quiet fade for the click, content that cross-fades.

  The stage is built from stacked layers, one cell for every card, caption and
  panel, so it is as tall as the tallest and nothing moves when the situation
  or the step changes.
*/

const STEPS = 3;
/** Per step, in ms: how long it stays. The last one is the draft, held for reading. */
const DWELL = [3100, 4400, 7000] as const;
/** The soft let-go between the last step and the first. */
const FADE = 450;
/**
 * The steps where the cursor clicks, in ms from the start of the step: when it
 * leaves, when the button shows pressed and when it lets go. The cursor takes about
 * 900 ms to arrive, so there is always a rest between its arrival and the press.
 */
const BEATS = [
  { leave: 900, press: 2300, release: 2750 },
  { leave: 2200, press: 3600, release: 4050 },
] as const;

/** What each situation draws: an estimate and its days, a timeline, or a slice of tomorrow's agenda. */
export interface SimVisual {
  kind: string;
  kicker?: string;
  procedure?: string;
  days?: number;
  last?: { what: string; when: string };
  today?: string;
  due?: { what: string; when: string };
  day?: string;
  busy?: string;
  free?: string;
  slots?: readonly string[];
  pick?: string;
}

export interface SimItem {
  id: string;
  choice: string;
  intro: string;
  card: { name: string; what: string; status: string };
  visual: SimVisual;
  open: string;
  reason: string;
  next: string;
  suggest: string;
  to: string;
  draft: string;
}

export interface SimCopy {
  pick: string;
  note: string;
  labels: {
    reasonLabel: string;
    nextLabel: string;
    draftLabel: string;
    draftNote: string;
    explain: string;
    closing: string;
    /** "Etapa {n} de {total}" */
    step: string;
  };
  items: readonly SimItem[];
}

interface CellProps {
  it: SimItem;
  here: boolean;
  st: number;
  press: boolean;
  /** Registers the thing the cursor goes to: a button, or the free slot. */
  target: (node: HTMLElement | null) => void;
}

/** The estimate: who, what for, and the days that went by, one dot each; the last ones are the late ones. */
function QuoteCell({ it, here, st, press, target }: CellProps) {
  const v = it.visual;
  const days = v.days ?? 6;
  return (
    <article className={styles.card} data-kind="quote" data-ring={here && st === 0 ? "" : undefined}>
      <header className={styles.head}>
        <p className={styles.scKick}>{v.kicker}</p>
        <p className={styles.name}>{it.card.name}</p>
        <p className={styles.what}>{v.procedure}</p>
        <span className={styles.chip}>{it.card.status}</span>
      </header>
      <div className={styles.waiting}>
        <span className={styles.dayDots} aria-hidden="true" data-open={here && st >= 1 ? "" : undefined}>
          {Array.from({ length: days }, (_, d) => (
            <i key={d} data-late={d >= 3 ? "" : undefined} style={{ "--n": d } as CSSProperties} />
          ))}
        </span>
        <span className={styles.waitText}>{it.card.what}</span>
      </div>
      <div className={styles.actionRow}>
        <span
          ref={target}
          className={styles.action}
          data-press={here && st === 0 && press ? "" : undefined}
          data-done={st >= 1 ? "" : undefined}
        >
          {it.open}
        </span>
      </div>
    </article>
  );
}

/** The patient's timeline: the last visit, today, and the return that nobody scheduled. */
function TimelineCell({ it, here, st, press, target }: CellProps) {
  const v = it.visual;
  return (
    <article className={styles.card} data-kind="timeline">
      <header className={styles.head}>
        <p className={styles.name}>{it.card.name}</p>
        <p className={styles.what}>{it.card.what}</p>
        <span className={styles.chip}>{it.card.status}</span>
      </header>
      <div className={styles.tl} data-hot={here && st === 0 ? "" : undefined} data-fill={here && st >= 1 ? "" : undefined}>
        <span className={styles.tlLine} aria-hidden="true">
          <i />
        </span>
        <div className={styles.tlNode} data-k="last">
          <b>{v.last?.what}</b>
          <span>{v.last?.when}</span>
        </div>
        <div className={styles.tlNode} data-k="today">
          <b>{v.today}</b>
        </div>
        <div className={styles.tlNode} data-k="due">
          <b>{v.due?.what}</b>
          <span>{v.due?.when}</span>
        </div>
      </div>
      <div className={styles.actionRow}>
        <span
          ref={target}
          className={styles.action}
          data-press={here && st === 0 && press ? "" : undefined}
          data-done={st >= 1 ? "" : undefined}
        >
          {it.open}
        </span>
      </div>
    </article>
  );
}

/** Tomorrow's agenda: a day that is full, and one hour that is free. The free hour is what the cursor selects. */
function AgendaCell({ it, here, st, press, target }: CellProps) {
  const v = it.visual;
  return (
    <article className={styles.card} data-kind="agenda">
      <header className={styles.head}>
        <p className={styles.name}>{it.card.name}</p>
        <p className={styles.what}>{it.card.what}</p>
        <span className={styles.chip}>{it.card.status}</span>
      </header>
      <ul className={styles.agList}>
        {(v.slots ?? []).map((t) =>
          t === v.pick ? (
            <li
              key={t}
              ref={target}
              className={styles.agFree}
              data-hot={here && st === 0 ? "" : undefined}
              data-press={here && st === 0 && press ? "" : undefined}
              data-picked={st >= 1 ? "" : undefined}
            >
              <b>{t}</b>
              <span>{v.free}</span>
            </li>
          ) : (
            <li key={t} className={styles.agBusy}>
              <b>{t}</b>
              <span>{v.busy}</span>
            </li>
          ),
        )}
      </ul>
    </article>
  );
}

export function HowSim({ copy }: { copy: SimCopy }) {
  const { items, labels } = copy;
  const soft = useReducedMotion();
  const [sc, setSc] = useState(0);
  const [st, setSt] = useState(0);
  const [press, setPress] = useState(false);
  const [fading, setFading] = useState(false);

  const region = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const buttons = useRef<Record<string, HTMLSpanElement | null>>({});
  const stRef = useRef(0);
  const scRef = useRef(0);
  const clock = useRef(0);
  const flags = useRef({ parked: false, went: false, press: false, fade: false });
  const started = useRef(false);
  const cursor = useDemoCursor(box);
  const cursorRef = useRef(cursor);

  useEffect(() => {
    stRef.current = st;
    scRef.current = sc;
    cursorRef.current = cursor;
  });

  const inView = usePresence(region, 0.35);
  const item = items[sc] ?? items[0];

  useEffect(() => {
    if (inView && !started.current) {
      started.current = true;
      track("demo_start", "sim");
    }
  }, [inView]);

  // The one clock: steps, cursor and presses, in order, and the loop.
  useEffect(() => {
    if (!inView) return;
    let frame = 0;
    let before = performance.now();

    const begin = (step: number) => {
      clock.current = 0;
      flags.current = { parked: false, went: false, press: false, fade: false };
      setPress(false);
      setSt(step);
      if (step === 2 || step === 0) cursorRef.current.hide();
    };

    const tick = (now: number) => {
      clock.current += Math.min(now - before, 80);
      before = now;
      const t = clock.current;
      const step = stRef.current;
      const f = flags.current;
      const beat = BEATS[step];

      if (beat) {
        const target = buttons.current[`${scRef.current}:${step === 0 ? "open" : "suggest"}`] ?? null;
        // Placed out of sight first (step 2 only if it is not already on stage), then it glides in.
        if (!f.parked && t >= beat.leave - 300) {
          f.parked = true;
          if (!cursorRef.current.live()) cursorRef.current.park(target);
        }
        if (!f.went && t >= beat.leave) {
          f.went = true;
          cursorRef.current.go(target);
        }
        // Once it has arrived it stays on the button, even if the stage settles and moves it.
        if (f.went && t >= beat.leave + 950) cursorRef.current.follow(target);
        const pressNow = t >= beat.press && t < beat.release;
        if (pressNow !== f.press) {
          f.press = pressNow;
          setPress(pressNow);
        }
      }

      const dwell = DWELL[step] ?? DWELL[0];
      if (step < STEPS - 1) {
        if (t >= dwell) begin(step + 1);
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
  }, [inView]);

  /** Another situation starts its own story at once, by itself. */
  const choose = (next: number) => {
    clock.current = 0;
    flags.current = { parked: false, went: false, press: false, fade: false };
    setPress(false);
    setFading(false);
    cursor.hide();
    setSt(0);
    setSc(next);
    track("scenario", items[next]?.id);
  };

  const caption = (s: number, it: SimItem) => (s === 0 ? it.intro : s === 1 ? labels.explain : labels.closing);
  const stepName = labels.step.replace("{n}", String(st + 1)).replace("{total}", String(STEPS));

  return (
    <div ref={region} className={styles.sim} data-soft={soft ? "" : undefined} data-st={st} data-sc={sc}>
      <div className={styles.picks} role="group" aria-label={copy.pick}>
        {items.map((it, i) => (
          <button
            key={it.id}
            type="button"
            id={`sim-${it.id}`}
            aria-pressed={i === sc}
            className={styles.pick}
            onClick={() => choose(i)}
          >
            {it.choice}
          </button>
        ))}
      </div>

      <div id="sim-palco" className={styles.demo}>
        <p className="sr-only">
          {stepName}. {caption(st, item)}
        </p>

        <div className={styles.tablet}>
          <span className={styles.tabletCam} aria-hidden="true" />
          <div className={styles.tabletScreen}>
        <ProductSurface className={`${styles.stage} ${styles.simStage}`}>
          <div ref={box} className={styles.inner} aria-hidden="true" data-fading={fading ? "" : undefined}>
            {/* Clinavy's sentence for the step. Every one of them is in the same cell. */}
            <div className={styles.caption}>
              <span className={styles.avatar}>
                <Pulse still state={st === 2 ? "calm" : "idle"} />
              </span>
              <div className={styles.lines}>
                {items.map((it, i) =>
                  Array.from({ length: STEPS }, (_, s) => (
                    <p key={`${it.id}-${s}`} className={styles.line} data-on={i === sc && s === st ? "" : undefined}>
                      {caption(s, it)}
                    </p>
                  )),
                )}
              </div>
            </div>

            {/* The scene, one per situation, each its own drawing in the same place and the same size. */}
            <div className={styles.layers}>
              {items.map((it, i) => {
                const cell = {
                  it,
                  here: i === sc,
                  st,
                  press,
                  target: (node: HTMLElement | null) => {
                    buttons.current[`${i}:open`] = node;
                  },
                };
                return (
                  <div key={it.id} className={styles.layer} data-on={i === sc ? "" : undefined}>
                    {it.visual.kind === "timeline" ? <TimelineCell {...cell} /> : it.visual.kind === "agenda" ? <AgendaCell {...cell} /> : <QuoteCell {...cell} />}
                  </div>
                );
              })}
            </div>

            {/* The step's panel: only what the story has reached. */}
            <div className={styles.layers}>
              {items.map((it, i) => (
                <div key={`${it.id}-1`} className={styles.layer} data-on={i === sc && st === 1 ? "" : undefined}>
                  <div className={styles.panel}>
                    <p className={styles.pair}>
                      <span className={styles.kicker}>{labels.reasonLabel}</span>
                      <span className={styles.text}>{it.reason}</span>
                    </p>
                    <p className={styles.pair}>
                      <span className={styles.kicker}>{labels.nextLabel}</span>
                      <span className={styles.text}>{it.next}</span>
                    </p>
                    <div className={styles.row}>
                      <span
                        ref={(node) => {
                          buttons.current[`${i}:suggest`] = node;
                        }}
                        className={styles.action}
                        data-press={i === sc && st === 1 && press ? "" : undefined}
                      >
                        {it.suggest}
                      </span>
                    </div>
                  </div>
                </div>
              ))}

              {items.map((it, i) => (
                <div key={`${it.id}-2`} className={styles.layer} data-on={i === sc && st === 2 ? "" : undefined}>
                  <div className={styles.panel}>
                    <section className={styles.draft}>
                      <p className={styles.kicker}>
                        {labels.draftLabel} · {it.to}
                      </p>
                      <p className={styles.draftText}>{it.draft}</p>
                      <p className={styles.note}>{labels.draftNote}</p>
                    </section>
                  </div>
                </div>
              ))}
            </div>

            <div className={styles.simSteps}>
              {Array.from({ length: STEPS }, (_, s) => (
                <span key={s} className={styles.simStep} data-on={s <= st ? "" : undefined} />
              ))}
            </div>

            <DemoCursor spot={cursor.spot} press={press} />
          </div>
        </ProductSurface>
          </div>
        </div>

        <div className={styles.controls}>
          <p className={styles.fine}>{copy.note}</p>
        </div>
      </div>
    </div>
  );
}

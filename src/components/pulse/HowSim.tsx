"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";

import { Pulse } from "@/components/flow/Pulse";
import { DemoCursor, useDemoCursor, usePresence, useReducedMotion } from "./demo-kit";
import styles from "./demo.module.css";
import { ProductSurface } from "./product";
import { track } from "./track";

/*
  "Veja como o Clinavy ajuda sua equipe a agir" — a simulation that shows itself.

  Split in two. On one side the situation, said in one strong sentence with a short
  explanation, and the three situations to choose from. On the other a scene: a cut of the
  product (the agenda, a patient's timeline, an estimate) on a dark stage, and Clinavy's
  answer laid over it as a glass piece. One step at a time, and one idea in each:

    1  the cut, alone, in the middle: and one thing to press, "Ver oportunidade"
    2  the cut steps aside; Clinavy's piece comes in: why it deserves attention, what to do
       next, and a second thing to press, "Ver sugestão de mensagem"
    3  the same piece, now the draft, marked as a draft: "Sua equipe revisa e decide o contato"

  Nothing is shown at once that the story has not reached: the reason and the next step are
  replaced by the draft, not piled up under it.

  The two buttons are drawings: the cursor presses them, nothing else can. They go
  nowhere and send nothing; the last step is a draft, and says so.

  How it behaves:

  · it plays the situation on show by itself, in a loop, while it is in view and
    the tab is in front: a cursor goes to each button, rests, presses it, and the
    scene follows. At the end it holds the draft for a few seconds, lets go
    softly and begins again. A hover, a tap or a click on the stage does nothing;
  · choosing another situation starts its story at once, by itself. The choices
    are for exploring other examples; nothing needs pressing to follow the story;
  · one clock runs everything, and the cursor is driven by it: it always arrives
    before the click, and it rides the first button while the cut slides aside;
  · on every lap after the first the reset is instant, behind the fade, so nothing
    of the last lap is left to fade away in sight;
  · the cursor is there on every device and with every motion setting. Reduced
    motion changes how it moves, never whether it plays: a short soft glide, a
    press shown without zoom, a quiet fade for the click, content that cross-fades,
    and nothing that slides.

  Every situation's cut and every step's piece sit in one cell, so the stage is as tall as
  the tallest and nothing moves when the situation or the step changes.
*/

const STEPS = 3;
/** Per step, in ms: how long it stays. The last one is the draft, held for reading. */
const DWELL = [3100, 4400, 7000] as const;
/** The soft let-go between the last step and the first. */
const FADE = 450;
/**
 * The steps where the cursor clicks, in ms from the start of the step: when it
 * leaves, when the button shows pressed and when it lets go. The cursor takes about 900 ms to
 * arrive, so there is always a rest between its arrival and the press.
 */
const BEATS = [
  { leave: 900, press: 2300, release: 2750 },
  { leave: 2200, press: 3600, release: 4050 },
] as const;

/** What each situation draws: an estimate and its days, a timeline, or a slice of tomorrow's agenda. */
export interface SimVisual {
  kind: string;
  /** The product's own name for the screen the cut is taken from. */
  screen?: string;
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
  /** The situation, in one sentence. */
  call: string;
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
  title: string;
  lead: string;
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
  /** True from the second lap on: the reset is then instant, behind the fade. */
  const [again, setAgain] = useState(false);

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
      if (step !== 0) setAgain(false);
      // The cursor stays for the second click (it is still on the first button, riding it while the cut
      // slides aside); the first click, and the draft, start from an empty stage.
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
        // Until it leaves for the second button it keeps to the first, which moves with its cut.
        if (step === 1 && !f.went && cursorRef.current.live()) {
          cursorRef.current.follow(buttons.current[`${scRef.current}:open`] ?? null);
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
  }, [inView]);

  /** Another situation starts its own story at once, by itself. */
  const choose = (next: number) => {
    clock.current = 0;
    flags.current = { parked: false, went: false, press: false, fade: false };
    setPress(false);
    setFading(false);
    cursor.hide();
    setAgain(false);
    setSt(0);
    setSc(next);
    track("scenario", items[next]?.id);
  };

  const caption = (s: number, it: SimItem) => (s === 0 ? it.intro : s === 1 ? labels.explain : labels.closing);
  const stepName = labels.step.replace("{n}", String(st + 1)).replace("{total}", String(STEPS));

  return (
    <div
      ref={region}
      className={styles.sim}
      data-soft={soft ? "" : undefined}
      data-again={again ? "" : undefined}
      data-st={st}
      data-sc={sc}
    >
      {/* The situation: one strong sentence, one line of explanation, and the others to choose from. */}
      <div className={styles.simCopy}>
        <h2 className={styles.simTitle}>{copy.title}</h2>

        <div className={styles.layers}>
          {items.map((it, i) => (
            <div key={it.id} className={styles.layer} data-on={i === sc ? "" : undefined}>
              <p className={styles.call}>{it.call}</p>
              <p className={styles.intro}>{it.intro}</p>
            </div>
          ))}
        </div>

        <div className={styles.pickBox}>
          <p className={styles.pickLabel}>{copy.lead}</p>
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
        </div>
      </div>

      {/* The scene: a cut of the product, and Clinavy's answer laid over it. */}
      <div id="sim-palco" className={styles.demo}>
        <p className="sr-only">
          {stepName}. {caption(st, item)}
        </p>

        <div className={styles.sceneBox}>
          <div ref={box} className={styles.sceneIn} aria-hidden="true" data-fading={fading ? "" : undefined}>
            <div className={styles.cutSlot}>
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
                      <ProductSurface className={styles.cut}>
                        <p className={styles.cutBar}>
                          <span className={styles.cutBrand}>CLINAVY</span>
                          <span>{it.visual.screen}</span>
                        </p>
                        {it.visual.kind === "timeline" ? (
                          <TimelineCell {...cell} />
                        ) : it.visual.kind === "agenda" ? (
                          <AgendaCell {...cell} />
                        ) : (
                          <QuoteCell {...cell} />
                        )}
                      </ProductSurface>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Clinavy's answer. Each step is its own piece, in the same place: the reason and the next step
                give way to the draft, they are not stacked under it. */}
            <div className={styles.glassSlot}>
              <div className={styles.glassCell}>
                {items.map((it, i) => (
                  <div key={`${it.id}-1`} className={styles.gLayer} data-on={i === sc && st === 1 ? "" : undefined}>
                    <div className={styles.glass}>
                      <p className={styles.gHead}>
                        <span className={styles.gAvatar}>
                          <Pulse still state="idle" />
                        </span>
                        {labels.explain}
                      </p>
                      <p className={styles.gPair}>
                        <span className={styles.gKick}>{labels.reasonLabel}</span>
                        <span className={styles.gText}>{it.reason}</span>
                      </p>
                      <p className={styles.gPair}>
                        <span className={styles.gKick}>{labels.nextLabel}</span>
                        <span className={styles.gText}>{it.next}</span>
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
                  <div key={`${it.id}-2`} className={styles.gLayer} data-on={i === sc && st === 2 ? "" : undefined}>
                    <div className={styles.glass}>
                      <p className={styles.gHead}>
                        <span className={styles.gAvatar}>
                          <Pulse still state="calm" />
                        </span>
                        {labels.closing}
                      </p>
                      <section className={styles.gDraft}>
                        <p className={styles.gKick}>
                          {labels.draftLabel} · {it.to}
                        </p>
                        <p className={styles.gDraftText}>{it.draft}</p>
                        <p className={styles.gNote}>{labels.draftNote}</p>
                      </section>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <DemoCursor spot={cursor.spot} press={press} />
          </div>
        </div>

        <div className={styles.simSteps} aria-hidden="true">
          {Array.from({ length: STEPS }, (_, s) => (
            <span key={s} className={styles.simStep} data-on={s <= st ? "" : undefined} />
          ))}
        </div>

        <div className={styles.controls}>
          <p className={styles.fine}>{copy.note}</p>
        </div>
      </div>
    </div>
  );
}

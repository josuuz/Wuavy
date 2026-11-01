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
  "Veja como o PULSE ajuda sua equipe a agir" — a simulation the visitor
  operates, and that shows itself first.

  Three situations to choose from, and one stage. On the stage, one card and
  one step at a time:

    1  the card, and one button: "Ver oportunidade"
    2  why it deserves attention, what to do next, and a second button:
       "Ver sugestão de mensagem"
    3  the draft, marked as a draft, and "Sua equipe revisa e decide o contato"

  Nothing is shown at once that the story has not reached: no list of
  patients, no total, no explanation beside the suggestion beside the message.
  The old four paragraphs became one short sentence per step.

  The two buttons are real buttons and they work inside the simulation. They
  go nowhere and send nothing; the last step is a draft, and says so.

  How it behaves:

  · when it comes into view it demonstrates the first situation: a cursor goes
    to each button and presses it, and the stage follows. It plays once;
  · the first thing the visitor presses — a situation, a button, a step — takes
    the control ("manual"), and from then on nothing advances by itself. Moving
    the pointer over it is not an act. "Reproduzir demonstração" takes it back
    and plays the situation on show again, from the first step;
  · choosing a situation starts its sequence over, at the first step;
  · reduced motion reduces, it does not remove: nothing starts by itself and
    "Reproduzir demonstração" is there from the first paint. Pressed, it plays
    a calm version — step after step, no cursor, no travel, no typing — and the
    real buttons work all the same.

  The stage is built from stacked layers, one cell for every card, caption and
  panel, so it is as tall as the tallest and nothing moves when the situation
  or the step changes.
*/

const STEPS = 3;
/** The demonstration's pacing, in ms: reading time first, then the cursor goes and presses. */
const READ = [2600, 4400] as const;
const PRESS = [
  [1850, 2300],
  [3700, 4150],
] as const;
const LAST = 6200;
/** The calm version has no cursor to wait for. */
const CALM_READ = [3000, 4200] as const;

export interface SimItem {
  id: string;
  choice: string;
  intro: string;
  card: { name: string; what: string; status: string };
  open: string;
  reason: string;
  next: string;
  suggest: string;
  to: string;
  draft: string;
}

export interface SimCopy {
  pick: string;
  hint: string;
  note: string;
  /** Before it has played, and to watch it again after the visitor took it. */
  play: string;
  pause: string;
  resume: string;
  replay: string;
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

export function HowSim({ copy }: { copy: SimCopy }) {
  const { items, labels } = copy;
  const reduced = useReducedMotion();
  const [sc, setSc] = useState(0);
  const [st, setSt] = useState(0);
  const [press, setPress] = useState(false);
  const [mode, setMode] = useState<PlayMode>("ready");
  const [spot, setSpot] = useState<CursorSpot | null>(null);

  const region = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const picks = useRef<HTMLDivElement>(null);
  const buttons = useRef<Record<string, HTMLButtonElement | null>>({});
  const stRef = useRef(0);
  const clock = useRef(0);
  const pressing = useRef(false);
  const started = useRef(false);

  useEffect(() => {
    stRef.current = st;
  }, [st]);

  const inView = usePresence(region, 0.45);
  /** Calm: each step shows how it ends, with no cursor, no typing and no travel. */
  const calm = reduced || mode === "manual";
  const running = mode === "playing" && inView;
  const item = items[sc] ?? items[0];
  const typed = useTyped(item.draft, st === 2, calm, 600);

  // Normal motion demonstrates itself, once, when it comes into view; reduced motion waits for the button.
  useEffect(() => {
    if (reduced || !inView || mode !== "ready" || started.current) return;
    started.current = true;
    setMode("playing");
  }, [reduced, inView, mode]);

  // The one clock of the demonstration: it presses each button in turn, then rests on the draft.
  useEffect(() => {
    if (!running) return;
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      clock.current += Math.min(now - last, 80);
      last = now;
      const t = clock.current;
      const step = stRef.current;

      if (step < 2) {
        const [from, to] = PRESS[step];
        const pressNow = !reduced && t >= from && t < to;
        if (pressNow !== pressing.current) {
          pressing.current = pressNow;
          setPress(pressNow);
        }
        if (t >= (reduced ? CALM_READ : READ)[step] - 250) {
          clock.current = 0;
          pressing.current = false;
          setPress(false);
          setSt(step + 1);
        }
      } else if (t >= LAST) {
        setMode("done");
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [running, reduced]);

  // The cursor goes to the button of the step, once the stage has settled.
  useEffect(() => {
    if (calm || st > 1) return;
    const place = () => setSpot(pointAt(box.current, buttons.current[`${sc}:${st === 0 ? "open" : "suggest"}`] ?? null));
    const settle = window.setTimeout(place, st === 0 ? 300 : 1000);
    window.addEventListener("resize", place);
    return () => {
      window.clearTimeout(settle);
      window.removeEventListener("resize", place);
    };
  }, [sc, st, calm]);

  const stopClock = () => {
    clock.current = 0;
    pressing.current = false;
    setPress(false);
  };

  /** Anything the visitor presses hands the simulation over, until "Reproduzir demonstração". */
  const take = () => {
    stopClock();
    started.current = true;
    setMode("manual");
  };

  const go = (next: number) => {
    take();
    setSt(next);
  };

  const choose = (next: number) => {
    take();
    setSc(next);
    setSt(0);
    track("scenario", items[next]?.id);
  };

  /** The one control: it plays, holds, resumes or replays, whichever the mode asks for. */
  const control = () => {
    if (mode === "playing") return setMode("paused");
    if (mode === "paused") return setMode("playing");
    stopClock();
    started.current = true;
    setSt(0);
    setMode("playing");
  };

  const caption = (s: number, it: SimItem) => (s === 0 ? it.intro : s === 1 ? labels.explain : labels.closing);
  const stepName = labels.step.replace("{n}", String(st + 1)).replace("{total}", String(STEPS));

  return (
    <div ref={region} className={styles.sim} data-mode={mode}>
      <div
        ref={picks}
        className={styles.picks}
        role="tablist"
        aria-label={copy.pick}
        onKeyDown={(event) =>
          onTabKeys(event, sc, items.length, (next) => {
            choose(next);
            focusTab(picks.current, next);
          })
        }
      >
        {items.map((it, i) => (
          <button
            key={it.id}
            type="button"
            role="tab"
            data-tab=""
            id={`sim-${it.id}`}
            aria-selected={i === sc}
            aria-controls="sim-palco"
            tabIndex={tabIndex(i, sc)}
            className={styles.pick}
            onClick={() => choose(i)}
          >
            {it.choice}
          </button>
        ))}
      </div>

      <div id="sim-palco" role="tabpanel" aria-labelledby={`sim-${item.id}`} className={styles.demo}>
        <ProductSurface className={cn(styles.stage, styles.simStage)}>
          <div ref={box} className={styles.inner}>
            {/* The Pulse's sentence for the step. Every one of them is in the same cell. */}
            <div className={styles.caption}>
              <span className={styles.avatar} aria-hidden="true">
                <Pulse still state={st === 2 ? "calm" : "idle"} />
              </span>
              <div className={styles.lines} aria-hidden="true">
                {items.map((it, i) =>
                  Array.from({ length: STEPS }, (_, s) => (
                    <p key={`${it.id}-${s}`} className={styles.line} data-on={i === sc && s === st ? "" : undefined}>
                      {caption(s, it)}
                    </p>
                  )),
                )}
              </div>
            </div>
            <p className="sr-only" aria-live="polite">
              {stepName}. {caption(st, item)}
            </p>

            {/* The card, one per situation: the same place, the same size. */}
            <div className={styles.layers}>
              {items.map((it, i) => {
                const here = i === sc;
                const waiting = here && st === 0;
                return (
                  <div key={it.id} className={styles.layer} data-on={here ? "" : undefined}>
                    <article className={styles.card} data-ring={waiting ? "" : undefined}>
                      <header className={styles.head}>
                        <p className={styles.name}>{it.card.name}</p>
                        <p className={styles.what}>{it.card.what}</p>
                        <span className={styles.chip}>{it.card.status}</span>
                      </header>
                      <div className={styles.actionRow}>
                        <button
                          ref={(node) => {
                            buttons.current[`${i}:open`] = node;
                          }}
                          type="button"
                          className={cn(styles.action, styles.real, waiting && styles.await)}
                          data-press={waiting && press ? "" : undefined}
                          data-done={st >= 1 ? "" : undefined}
                          disabled={st >= 1}
                          onClick={() => go(1)}
                        >
                          {it.open}
                        </button>
                      </div>
                    </article>
                  </div>
                );
              })}
            </div>

            {/* The step's panel. At the first step it only says to press; the story is not told before it is asked for. */}
            <div className={styles.layers}>
              <div className={styles.layer} data-on={st === 0 ? "" : undefined}>
                <p className={styles.tryRow}>
                  <span className={styles.try} data-on="">
                    <span aria-hidden="true">↑</span> {copy.hint}
                  </span>
                </p>
              </div>

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
                      <button
                        ref={(node) => {
                          buttons.current[`${i}:suggest`] = node;
                        }}
                        type="button"
                        className={cn(styles.action, styles.real, i === sc && st === 1 && styles.await)}
                        data-press={i === sc && st === 1 && press ? "" : undefined}
                        onClick={() => go(2)}
                      >
                        {it.suggest}
                      </button>
                      <span className={styles.try} data-on="">
                        {copy.hint}
                      </span>
                    </div>
                  </div>
                </div>
              ))}

              {items.map((it, i) => {
                const here = i === sc && st === 2;
                const written = here ? typed : 0;
                return (
                  <div key={`${it.id}-2`} className={styles.layer} data-on={here ? "" : undefined}>
                    <div className={styles.panel}>
                      <section className={styles.draft}>
                        <p className={styles.kicker}>
                          {labels.draftLabel} · {it.to}
                        </p>
                        {/* The whole text is laid out from the start, so typing never moves anything. */}
                        <p className={styles.draftText}>
                          {it.draft.slice(0, written)}
                          <span className={styles.unwritten}>{it.draft.slice(written)}</span>
                        </p>
                        <p className={styles.note}>{labels.draftNote}</p>
                      </section>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className={styles.simSteps} aria-hidden="true">
              {Array.from({ length: STEPS }, (_, s) => (
                <span key={s} className={styles.simStep} data-on={s <= st ? "" : undefined} />
              ))}
            </div>

            <DemoCursor spot={spot} on={!calm && mode !== "ready" && st <= 1} press={press} />
          </div>
        </ProductSurface>

        <div className={styles.controls}>
          <button type="button" className={styles.ghost} onClick={control}>
            {playLabel(mode, copy)}
          </button>
          <p className={styles.fine}>{copy.note}</p>
        </div>
      </div>
    </div>
  );
}

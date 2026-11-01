"use client";

import { useEffect, useRef, useState } from "react";

import { Pulse } from "@/components/flow/Pulse";
import { cn } from "@/lib/utils";
import { DemoCursor, usePresence, useDemoCursor, useReducedMotion, type PlayMode } from "./demo-kit";
import styles from "./demo.module.css";
import { ProductSurface } from "./product";
import { focusTab, onTabKeys, tabIndex } from "./tabs";
import { track } from "./track";

/*
  "Veja como o PULSE ajuda sua equipe a agir" — a simulation that shows itself,
  and that the visitor may also operate.

  Three situations to choose from, and one stage. On the stage, one card and
  one step at a time:

    1  the card, and one button: "Ver oportunidade"
    2  why it deserves attention, what to do next, and a second button:
       "Ver sugestão de mensagem"
    3  the draft, marked as a draft, and "Sua equipe revisa e decide o contato"

  Nothing is shown at once that the story has not reached: no list of
  patients, no total, no explanation beside the suggestion beside the message.

  The two buttons are real buttons and they work inside the simulation. They
  go nowhere and send nothing; the last step is a draft, and says so.

  How it behaves:

  · it plays the situation on show by itself, in a loop, while it is in view and
    the tab is in front: a cursor goes to each button, rests, presses it, and the
    stage follows. At the end it holds the draft for a few seconds, lets go
    softly and begins again;
  · choosing another situation starts its story at once, by itself. The choices
    are for exploring other examples; nothing needs pressing to follow the story.
    Pressing one of the real buttons moves the story to that step and it carries on;
  · one clock runs everything, and the cursor is driven by it: it always arrives
    before the click, and a pause freezes all of it together;
  · the visitor's one control is "Pausar" / "Continuar";
  · reduced motion reduces, it does not remove: the steps still advance by
    themselves at an easy pace, each in its finished state, with no cursor, no
    glide and no press, only the content changing.

  The stage is built from stacked layers, one cell for every card, caption and
  panel, so it is as tall as the tallest and nothing moves when the situation
  or the step changes.
*/

const STEPS = 3;
/** Per step, in ms: how long it stays. The last one is the draft, held for reading. */
const DWELL = [3100, 4400, 7000] as const;
/** Without a cursor to wait for, each step of the calm version gets a steady beat. */
const CALM_DWELL = [3400, 4800, 7000] as const;
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
  pause: string;
  resume: string;
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
  const [fading, setFading] = useState(false);
  const [mode, setMode] = useState<PlayMode>("playing");

  const region = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const picks = useRef<HTMLDivElement>(null);
  const buttons = useRef<Record<string, HTMLButtonElement | null>>({});
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
  const running = mode === "playing" && inView;
  /** Calm (reduced motion): each step shows how it ends, with no cursor, no glide and no press. */
  const calm = reduced;
  const item = items[sc] ?? items[0];

  useEffect(() => {
    if (running && !started.current) {
      started.current = true;
      track("demo_start", "sim");
    }
  }, [running]);

  // The one clock: steps, cursor and presses, in order, and the loop.
  useEffect(() => {
    if (!running) return;
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
      const beat = reduced ? undefined : BEATS[step];

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

      const dwell = (reduced ? CALM_DWELL : DWELL)[step] ?? DWELL[0];
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
  }, [running, reduced]);

  /** Moves the story to `step` and lets it carry on from there. */
  const restart = (step: number) => {
    clock.current = 0;
    flags.current = { parked: false, went: false, press: false, fade: false };
    setPress(false);
    setFading(false);
    cursor.hide();
    setSt(step);
  };

  const go = (next: number) => restart(next);

  /** Another situation starts its own story at once, by itself, even from a pause. */
  const choose = (next: number) => {
    restart(0);
    setSc(next);
    setMode("playing");
    track("scenario", items[next]?.id);
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
          <div ref={box} className={styles.inner} data-fading={fading ? "" : undefined}>
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
            <p className="sr-only">
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

            <div className={styles.simSteps} aria-hidden="true">
              {Array.from({ length: STEPS }, (_, s) => (
                <span key={s} className={styles.simStep} data-on={s <= st ? "" : undefined} />
              ))}
            </div>

            {calm ? null : <DemoCursor spot={cursor.spot} press={press} />}
          </div>
        </ProductSurface>

        <div className={styles.controls}>
          <button
            type="button"
            className={styles.ghost}
            onClick={() => setMode((m) => (m === "playing" ? "paused" : "playing"))}
          >
            {mode === "playing" ? copy.pause : copy.resume}
          </button>
          <p className={styles.fine}>{copy.note}</p>
        </div>
      </div>
    </div>
  );
}

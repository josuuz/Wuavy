"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";

import { cn } from "@/lib/utils";
import { AppFrame, OpportunityCard, type OppScreen, type OppStage } from "./product";
import { focusTab, onTabKeys, tabIndex } from "./tabs";
import { track } from "./track";
import styles from "./interactive.module.css";

/*
  The hero's four beats: what happens in the clinic, what the Pulse makes of
  it, what opening it shows, and the message waiting for someone to read it.
  The last beat is a draft, never a message sent.

  How it behaves, in the order the rules matter:

  · the title, the lead and both buttons beside this are plain server-rendered
    markup. Nothing here gates them, so the hero reads with the script still
    loading or never arriving — this component only ever adds a picture;
  · it plays by itself, but only while it is on screen, and it stops for good
    the moment the visitor takes it over (a beat pressed, or Pausar). That is
    the usual bargain with a carousel: it may move on its own until you show
    up, and after that it is yours;
  · the beats are a tab strip, so a keyboard drives it with the arrows and a
    screen reader is told which of the four is showing. The text is not a live
    region: something that changes every few seconds would talk over the page;
  · reduced motion keeps the sequence and drops the sliding. Windows reports
    it whenever animations are off, which is common, so the beats still
    change — they just change without travelling.
*/

const DWELL = 3800;

/* The Vendas screen behind the first beat: fictitious, and three rows rather
   than one, so it reads as a screen and not as a single highlighted card. */
const SALES = [
  { name: "Carla M.", what: "Harmonização facial · orçamento enviado há 6 dias", state: "Sem resposta", quiet: false },
  { name: "Renata A.", what: "Preenchimento labial · orçamento enviado há 4 dias", state: "Sem resposta", quiet: false },
  { name: "Tatiane B.", what: "Limpeza de pele · avaliação marcada", state: "Respondido", quiet: true },
] as const;

/** What the product is showing at each beat: the sale, then the front opening. */
const STAGE: readonly (OppStage | "sale")[] = ["sale", "closed", "picks", "draft"];

export interface SequenceCopy {
  label: string;
  note: string;
  play: string;
  pause: string;
  /** "Passo {n} de {total}" — for the strip's accessible name. */
  step: string;
  beats: readonly { tag: string; title: string; text: string }[];
}

interface HeroSequenceProps {
  sequence: SequenceCopy;
  /** The orçamento front, as the scenarios section states it: one source for both. */
  screen: OppScreen;
  draftLabel: string;
  reviewNote: string;
  className?: string;
}

export function HeroSequence({ sequence, screen, draftLabel, reviewNote, className }: HeroSequenceProps) {
  const { beats } = sequence;
  const [at, setAt] = useState(0);
  /** Null until the visitor decides; then theirs, and it never starts again. */
  const [playing, setPlaying] = useState(true);
  const [taken, setTaken] = useState(false);
  const [onScreen, setOnScreen] = useState(false);
  const region = useRef<HTMLDivElement>(null);
  const strip = useRef<HTMLDivElement>(null);

  // Only while it can be seen: a loop running behind the fold costs frames
  // and competes with whatever the visitor is actually reading.
  useEffect(() => {
    const el = region.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => setOnScreen(entry.isIntersecting), { threshold: 0.3 });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!playing || !onScreen) return;
    const timer = window.setTimeout(() => setAt((i) => (i + 1) % beats.length), DWELL);
    return () => window.clearTimeout(timer);
  }, [playing, onScreen, at, beats.length]);

  useEffect(() => {
    if (onScreen) track("demo_start");
  }, [onScreen]);

  /** Any press hands the sequence over for good. */
  const take = (next: number) => {
    setAt(next);
    setPlaying(false);
    setTaken(true);
  };

  const beat = beats[at];
  const stage = STAGE[at] ?? "closed";

  return (
    <div ref={region} className={cn(styles.sequence, className)}>
      <p className={styles.sequenceLabel}>{sequence.label}</p>

      {/* The beats. `key` restarts the entry animation; the stage below changes with it. */}
      <div className={styles.beat} key={at} data-still={taken ? "" : undefined}>
        <p className={styles.beatTag}>{beat.tag}</p>
        <p className={styles.beatTitle}>{beat.title}</p>
        <p className={styles.beatText}>{beat.text}</p>
      </div>

      <div className={styles.stageWrap}>
        <AppFrame
          key={stage === "sale" ? "sale" : "opp"}
          screen={stage === "sale" ? "Vendas" : "Oportunidades"}
          rail={stage === "sale" ? "vendas" : "oportunidades"}
          chip="Demo"
          className={styles.stageFrame}
        >
          {stage === "sale" ? (
            <ul className={styles.saleRows}>
              {SALES.map((sale) => (
                <li key={sale.name}>
                  <span className={styles.saleName}>{sale.name}</span>
                  <span className={styles.saleWhat}>{sale.what}</span>
                  <span className={styles.saleState} data-quiet={sale.quiet ? "" : undefined}>
                    {sale.state}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <div key={stage} className={styles.cardIn}>
              <OpportunityCard screen={screen} stage={stage} draftLabel={draftLabel} reviewNote={reviewNote} />
            </div>
          )}
        </AppFrame>
      </div>

      <div className={styles.controls}>
        <div
          ref={strip}
          className={styles.dots}
          role="tablist"
          aria-label={sequence.label}
          onKeyDown={(event) =>
            onTabKeys(event, at, beats.length, (next) => {
              take(next);
              focusTab(strip.current, next);
            })
          }
        >
          {beats.map((item, i) => (
            <button
              key={item.tag}
              type="button"
              data-tab=""
              role="tab"
              aria-selected={i === at}
              tabIndex={tabIndex(i, at)}
              className={styles.dot}
              style={{ "--i": i } as CSSProperties}
              onClick={() => take(i)}
            >
              <span className="sr-only">{sequence.step.replace("{n}", String(i + 1)).replace("{total}", String(beats.length))}</span>
              <span aria-hidden="true" className={styles.dotMark} data-on={i <= at ? "" : undefined} />
            </button>
          ))}
        </div>

        {/* Gone once the sequence is the visitor's: there is nothing left to pause. */}
        {taken ? null : (
          <button type="button" className={styles.pause} onClick={() => setPlaying((on) => !on)}>
            {playing ? sequence.pause : sequence.play}
          </button>
        )}
      </div>

      <p className={styles.note}>{sequence.note}</p>
    </div>
  );
}

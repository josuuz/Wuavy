"use client";

import { useEffect, useId, useRef, useState, type CSSProperties, type Ref } from "react";

import { Button } from "@/components/ui/Button";
import {
  fill,
  isQuestion,
  questionsLeft,
  stageOrder,
  whatsappMessage,
  type Answer,
  type PassoCopy,
  type QuestionId,
  type ResultId,
} from "@/data/passo";
import { whatsappHref } from "@/lib/contact";
import styles from "./PassoGuide.module.css";

/*
  PASSO as a consultant: a small card next to him (PassoJourney places it and
  keeps it on him), a few questions answered with chips, and a recommendation
  with the growth path and a WhatsApp handover that already tells the story.
  A non-modal dialog: the page stays usable, Escape or a click elsewhere
  closes it, and focus goes to each new question.
*/

type Node = "intro" | QuestionId | ResultId;

interface PassoGuideProps {
  ref: Ref<HTMLDivElement>;
  copy: PassoCopy;
  /** The WhatsApp number the recommendation opens, with the story already typed. */
  whatsapp: string;
  open: boolean;
  /** `back`: return focus to PASSO (keyboard and the card's own buttons). */
  onClose: (back: boolean) => void;
  /** PASSO reacts to an answer, and a little more to the recommendation. */
  onReact: (kind: "answer" | "result") => void;
}

const PICK_MS = 180;

export function PassoGuide({ ref, copy, whatsapp, open, onClose, onReact }: PassoGuideProps) {
  const { guide, questions, results, stages } = copy;
  const [node, setNode] = useState<Node>("intro");
  const [steps, setSteps] = useState<Array<{ at: QuestionId; answer: Answer }>>([]);
  const [picked, setPicked] = useState<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (open) heading.current?.focus({ preventScroll: true });
  }, [open, node]);

  // A press anywhere else closes it, without pulling focus back to PASSO.
  useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (target?.closest("#passo-guide, [data-passo-hit]")) return;
      onClose(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open, onClose]);

  const pick = (at: QuestionId, answer: Answer) => {
    if (picked) return;
    setPicked(answer.label);
    onReact(isQuestion(answer.next) ? "answer" : "result");
    window.setTimeout(() => {
      setSteps((list) => [...list, { at, answer }]);
      setNode(answer.next);
      setPicked(null);
    }, PICK_MS);
  };

  const back = () => {
    const last = steps[steps.length - 1];
    if (!last) return;
    setSteps(steps.slice(0, -1));
    setNode(last.at);
  };

  const restart = () => {
    setSteps([]);
    setNode("goal");
  };

  const title = (text: string, hidden?: string) => (
    <h2 ref={heading} id={titleId} tabIndex={-1} className={styles.question}>
      {hidden ? <span className="sr-only">{hidden} </span> : null}
      {text}
    </h2>
  );

  let body;
  let dots = 0;
  let done = 0;

  if (node === "intro") {
    body = (
      <>
        {title(guide.hello)}
        <div className={styles.chips}>
          <button
            type="button"
            className={`${styles.chip} ${styles.primary}`}
            style={{ "--i": 0 } as CSSProperties}
            onClick={() => {
              onReact("answer");
              setNode("goal");
            }}
          >
            {guide.start}
          </button>
          <button type="button" className={styles.chip} style={{ "--i": 1 } as CSSProperties} onClick={() => onClose(true)}>
            {guide.later}
          </button>
        </div>
      </>
    );
  } else if (isQuestion(node)) {
    const question = questions[node];
    done = steps.length + 1;
    dots = steps.length + questionsLeft(questions, node);
    body = (
      <>
        {title(question.text, fill(guide.progress, { done, total: dots }))}
        <div className={styles.chips} role="group" aria-labelledby={titleId}>
          {question.answers.map((answer, i) => (
            <button
              key={answer.label}
              type="button"
              className={styles.chip}
              style={{ "--i": i } as CSSProperties}
              data-picked={picked === answer.label ? "" : undefined}
              onClick={() => pick(node, answer)}
            >
              {answer.label}
            </button>
          ))}
        </div>
        {steps.length ? (
          <button type="button" className={styles.link} onClick={back}>
            {guide.back}
          </button>
        ) : null}
      </>
    );
  } else {
    const result = results[node];
    const last = Math.max(...result.now.map((stage) => stageOrder.indexOf(stage)));
    const onlyAutomation = result.now.every((stage) => stage === "automacao");
    const href = whatsappHref(whatsapp, whatsappMessage(copy, steps.map((s) => s.answer), result));
    body = (
      <>
        <p className={styles.label}>{guide.resultKicker}</p>
        {title(result.title)}
        <p className={styles.why}>{result.why}</p>

        {onlyAutomation ? null : (
          <div className={styles.path}>
            <p className={styles.label}>{guide.path}</p>
            <ol className={styles.track}>
              {stageOrder.map((stage, i) => {
                const now = result.now.includes(stage);
                const next = !now && i === last + 1;
                return (
                  <li key={stage} className={styles.stage} data-state={now ? "now" : next ? "next" : undefined}>
                    <span className={styles.node} aria-hidden="true" />
                    {stages[stage]}
                    {now ? <span className="sr-only"> {guide.now}</span> : null}
                    {next ? <span className={styles.later}>{guide.pathNext}</span> : null}
                  </li>
                );
              })}
            </ol>
          </div>
        )}

        <div className={styles.foot}>
          <p className={styles.ask}>{guide.ask}</p>
          <div className={styles.actions}>
            <Button href={href} size="sm">
              {guide.cta}
            </Button>
            <button type="button" className={styles.link} onClick={restart}>
              {guide.restart}
            </button>
          </div>
        </div>
      </>
    );
  }

  return (
    <div
      ref={ref}
      id="passo-guide"
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      className={styles.card}
      data-surface="graphite"
      data-open={open ? "" : undefined}
      data-lenis-prevent=""
      inert={!open}
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose(true);
      }}
    >
      <div className={styles.top}>
        <p className={styles.kicker}>
          <span className={styles.name}>{guide.name}</span> · {guide.kicker}
        </p>
        {dots ? (
          <span className={styles.dots} aria-hidden="true">
            {Array.from({ length: dots }, (_, i) => (
              <span key={i} className={styles.dot} data-on={i < done ? "" : undefined} />
            ))}
          </span>
        ) : null}
        <button type="button" className={styles.close} aria-label={guide.close} onClick={() => onClose(true)}>
          <svg viewBox="0 0 12 12" aria-hidden="true" focusable="false">
            <path d="M2 2l8 8M10 2l-8 8" />
          </svg>
        </button>
      </div>

      <div key={node} className={styles.step}>
        {body}
      </div>
    </div>
  );
}

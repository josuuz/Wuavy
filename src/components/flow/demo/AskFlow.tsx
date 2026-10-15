"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { localAssistant, SUGGESTED, type FlowAnswer, type FlowAssistant } from "@/lib/flow/assistant";
import { Pulse, type PulseState } from "../Pulse";
import { viewHref } from "./copy";
import { Soon } from "./forms";
import { Sheet } from "./Sheet";
import { useFlow } from "./store";
import styles from "./ui.module.css";

/*
  "Pergunte ao Pulse": the operation's assistant, the Pulse. Today, the questions
  it can answer by calculation, each from the clinic's own data; free
  questions wait for Pulse AI, shown here as coming, never faked. Any screen
  can open it with a question already asked (the overview does). The
  assistant is swappable: point `assistant` at an API-backed FlowAssistant
  and nothing else changes.

  The conversation itself (AskConversation) lives in two places: this sheet,
  over any screen, and Conversas, where the Pulse is the pinned internal thread.
*/

const assistant: FlowAssistant = localAssistant;

interface Turn {
  q: string;
  a?: FlowAnswer;
}

interface AskConversationProps {
  /** A question already asked on arrival. */
  question?: string;
  /** Called when a link inside an answer is followed (the sheet closes). */
  onNavigate?: () => void;
  /** The Pulse's state as the conversation moves: thinking while calculating, a short joy when the answer lands. */
  onState?: (state: PulseState) => void;
  /** "pane": inside Conversas, the answers carry the Pulse beside them, as messages. */
  variant?: "sheet" | "pane";
}

export function AskConversation({ question = "", onNavigate, onState, variant = "sheet" }: AskConversationProps) {
  const { data, base, live } = useFlow();
  const [thread, setThread] = useState<Turn[]>(() => (question ? [{ q: question }] : []));
  const [busy, setBusy] = useState(Boolean(question));
  const end = useRef<HTMLDivElement>(null);
  const arrival = useRef(question);

  // Thinking only while an answer is really being calculated; a brief joy when it lands, then calm again.
  const answered = thread.filter((t) => t.a).length;
  useEffect(() => {
    if (busy) return onState?.("thinking");
    if (!answered) return onState?.("idle");
    onState?.("celebrating");
    const t = window.setTimeout(() => onState?.("idle"), 1400);
    return () => window.clearTimeout(t);
  }, [busy, answered, onState]);

  const answer = useCallback(
    async (q: string) => {
      const a = await assistant.ask(q, data);
      setThread((t) => t.map((turn, i) => (i === t.length - 1 ? { ...turn, a } : turn)));
      setBusy(false);
      requestAnimationFrame(() => end.current?.scrollIntoView({ block: "end", behavior: "smooth" }));
    },
    [data],
  );

  // Opened with a question from another screen: answer it once, on arrival.
  useEffect(() => {
    const q = arrival.current;
    if (!q) return;
    arrival.current = "";
    void answer(q);
  }, [answer]);

  const ask = (q: string) => {
    if (busy) return;
    setBusy(true);
    setThread((t) => [...t, { q }]);
    void answer(q);
  };

  const pane = variant === "pane";

  return (
    <>
      <div className={styles.thread} aria-live="polite" data-variant={variant}>
        {thread.length === 0 ? (
          <div className={styles.askStart}>
            <p className={styles.askIntro}>
              Escolha uma pergunta. Eu leio vendas, pacientes, agenda e estoque da {live ? "clínica" : "demo"} e mostro onde agir.
            </p>
            <ul className={styles.askList} aria-label="Perguntas que o Pulse responde">
              {SUGGESTED.map((q) => (
                <li key={q}>
                  <button type="button" className={styles.askOption} onClick={() => ask(q)} disabled={busy}>
                    {q}
                    <span aria-hidden="true">→</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {thread.map((turn, i) => (
          <div key={i} className={styles.turn}>
            <p className={styles.question}>{turn.q}</p>
            <div className={styles.answerRow}>
              {pane ? <Pulse className={styles.answerPulse} still state={turn.a ? "idle" : "thinking"} /> : null}
              {turn.a ? (
                <div className={styles.answer}>
                  <p>{turn.a.text}</p>
                  {turn.a.items?.length ? (
                    <ul className={styles.answerItems}>
                      {turn.a.items.map((item) => (
                        <li key={item.label}>
                          <span>{item.label}</span>
                          {item.value ? <strong>{item.value}</strong> : null}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {turn.a.link ? (
                    <Link href={viewHref(turn.a.link.view, base)} className={styles.textAction} onClick={onNavigate}>
                      {turn.a.link.label} <span aria-hidden="true">→</span>
                    </Link>
                  ) : null}
                </div>
              ) : (
                <p className={styles.thinking}>
                  <span className="pulse-dot" aria-hidden="true" />
                  Calculando…
                </p>
              )}
            </div>
          </div>
        ))}
        <div ref={end} />
      </div>

      {thread.length ? (
        <div className={styles.suggest}>
          {SUGGESTED.map((q) => (
            <button key={q} type="button" className={styles.chipButton} onClick={() => ask(q)} disabled={busy}>
              {q}
            </button>
          ))}
        </div>
      ) : null}

      <div className={styles.askForm}>
        <label className="sr-only" htmlFor={pane ? "flow-ask-pane" : "flow-ask"}>
          Pergunta livre (Pulse AI, em breve)
        </label>
        <input id={pane ? "flow-ask-pane" : "flow-ask"} className={styles.input} disabled placeholder="Pergunte do seu jeito" />
        <Soon>Pulse AI · Em breve</Soon>
      </div>
      <p className={styles.fine}>
        Cada resposta é calculada na hora com os dados {live ? "da clínica" : "da demo"}, sem IA. Perguntas livres chegam com o
        Pulse AI.
      </p>
    </>
  );
}

export function AskFlow({ open, question, onClose }: { open: boolean; question: string; onClose: () => void }) {
  const [state, setState] = useState<PulseState>(question ? "thinking" : "idle");
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Pergunte ao Pulse"
      kicker="Assistente da operação"
      icon={<Pulse className={styles.askPulse} state={state} greet={!question} />}
    >
      <AskConversation question={question} onNavigate={onClose} onState={setState} />
    </Sheet>
  );
}

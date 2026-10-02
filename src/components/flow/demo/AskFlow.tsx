"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { localAssistant, SUGGESTED, type FlowAnswer, type FlowAssistant } from "@/lib/flow/assistant";
import { PassoFigure } from "@/variants/a/PassoFigure";
import { STAND } from "@/variants/a/passoRig";
import { viewHref } from "./copy";
import { Sheet } from "./Sheet";
import { useFlow } from "./store";
import styles from "./ui.module.css";

/*
  "Pergunte ao Pulse": the operation's assistant. Suggested questions or free
  text, answered from the clinic's data. Any screen can open it with a
  question already asked (the overview does). The assistant is swappable:
  point `assistant` at an API-backed FlowAssistant and nothing else changes.
*/

const assistant: FlowAssistant = localAssistant;
const THINK_MS = 450; // long enough to read as work, short enough not to stall

interface Turn {
  q: string;
  a?: FlowAnswer;
}

export function AskFlow({ open, question, onClose }: { open: boolean; question: string; onClose: () => void }) {
  const { data, base, live } = useFlow();
  const [thread, setThread] = useState<Turn[]>(() => (question ? [{ q: question }] : []));
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(Boolean(question));
  const end = useRef<HTMLDivElement>(null);
  const arrival = useRef(question);

  const answer = useCallback(
    async (q: string) => {
      const [a] = await Promise.all([assistant.ask(q, data), new Promise((r) => setTimeout(r, THINK_MS))]);
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
    if (!q.trim() || busy) return;
    setBusy(true);
    setText("");
    setThread((t) => [...t, { q }]);
    void answer(q);
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Pergunte ao Pulse"
      kicker="Assistente da operação"
      icon={
        <svg className={styles.askPasso} viewBox="24 40 192 252" aria-hidden="true" focusable="false">
          <PassoFigure pose={STAND} mode="idle" />
        </svg>
      }
    >
      <div className={styles.thread} aria-live="polite">
        {thread.length === 0 ? (
          <div className={styles.askStart}>
            <p className={styles.askIntro}>
              Pergunte sobre a clínica do seu jeito. Eu leio vendas, pacientes, agenda e estoque e mostro onde agir.
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
                  <Link href={viewHref(turn.a.link.view, base)} className={styles.textAction} onClick={onClose}>
                    {turn.a.link.label} <span aria-hidden="true">→</span>
                  </Link>
                ) : null}
              </div>
            ) : (
              <p className={styles.thinking}>
                <span className="pulse-dot" aria-hidden="true" />
                Pulse analisando…
              </p>
            )}
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

      <form
        className={styles.askForm}
        onSubmit={(event) => {
          event.preventDefault();
          ask(text);
        }}
      >
        <label className="sr-only" htmlFor="flow-ask">
          Sua pergunta
        </label>
        <input
          id="flow-ask"
          className={styles.input}
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Ex.: quem posso chamar para preencher 14h?"
          autoComplete="off"
        />
        <button type="submit" className={styles.primary} disabled={busy || !text.trim()}>
          Perguntar
        </button>
      </form>
      <p className={styles.fine}>
        Respostas calculadas a partir dos dados {live ? "da clínica" : "da demo"}. Nenhuma IA está conectada ainda.
      </p>
    </Sheet>
  );
}

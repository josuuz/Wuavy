"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { localAssistant, SUGGESTED, type FlowAnswer, type FlowAssistant } from "@/lib/flow/assistant";
import { PassoFigure } from "@/variants/a/PassoFigure";
import { STAND } from "@/variants/a/passoRig";
import { viewHref } from "./copy";
import { Soon } from "./forms";
import { Sheet } from "./Sheet";
import { useFlow } from "./store";
import styles from "./ui.module.css";

/*
  "Pergunte ao Pulse": the operation's assistant. Today, the questions it can
  answer by calculation, each from the clinic's own data; free questions wait
  for Pulse AI, shown here as coming, never faked. Any screen can open it with
  a question already asked (the overview does). The assistant is swappable:
  point `assistant` at an API-backed FlowAssistant and nothing else changes.
*/

const assistant: FlowAssistant = localAssistant;

interface Turn {
  q: string;
  a?: FlowAnswer;
}

export function AskFlow({ open, question, onClose }: { open: boolean; question: string; onClose: () => void }) {
  const { data, base, live } = useFlow();
  const [thread, setThread] = useState<Turn[]>(() => (question ? [{ q: question }] : []));
  const [busy, setBusy] = useState(Boolean(question));
  const end = useRef<HTMLDivElement>(null);
  const arrival = useRef(question);

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

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Pergunte ao Pulse"
      kicker="Assistente da operação"
      icon={
        <svg className={styles.askPasso} viewBox="24 40 192 252" aria-hidden="true" focusable="false">
          <PassoFigure pose={STAND} variant="outline" />
          <PassoFigure pose={STAND} mode="idle" />
        </svg>
      }
    >
      <div className={styles.thread} aria-live="polite">
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
                Calculando…
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

      <div className={styles.askForm}>
        <label className="sr-only" htmlFor="flow-ask">
          Pergunta livre (Pulse AI, em breve)
        </label>
        <input id="flow-ask" className={styles.input} disabled placeholder="Pergunte do seu jeito" />
        <Soon>Pulse AI · Em breve</Soon>
      </div>
      <p className={styles.fine}>
        Cada resposta é calculada na hora com os dados {live ? "da clínica" : "da demo"}, sem IA. Perguntas livres chegam com o
        Pulse AI.
      </p>
    </Sheet>
  );
}

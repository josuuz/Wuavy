"use client";

import Link from "next/link";
import { useRef, useState } from "react";

import { localAssistant, SUGGESTED, type FlowAnswer, type FlowAssistant } from "@/lib/flow/assistant";
import { PassoFigure } from "@/variants/a/PassoFigure";
import { STAND } from "@/variants/a/passoRig";
import { viewHref } from "./copy";
import { Sheet } from "./Sheet";
import { useFlow } from "./store";
import styles from "./ui.module.css";

/*
  "Pergunte ao Flow": suggested questions or free text, answered from the
  clinic's live demo data. The assistant is swappable: point `assistant` at
  an API-backed FlowAssistant and nothing else changes.
*/

const assistant: FlowAssistant = localAssistant;
const THINK_MS = 450; // long enough to read as work, short enough not to stall

interface Turn {
  q: string;
  a?: FlowAnswer;
}

export function AskFlow({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data, base } = useFlow();
  const [thread, setThread] = useState<Turn[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);

  const ask = async (q: string) => {
    if (!q.trim() || busy) return;
    setBusy(true);
    setText("");
    setThread((t) => [...t, { q }]);
    const [a] = await Promise.all([assistant.ask(q, data), new Promise((r) => setTimeout(r, THINK_MS))]);
    setThread((t) => t.map((turn, i) => (i === t.length - 1 ? { ...turn, a } : turn)));
    setBusy(false);
    requestAnimationFrame(() => end.current?.scrollIntoView({ block: "end", behavior: "smooth" }));
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Pergunte ao Flow"
      kicker="Assistente da operação"
      icon={
        <svg className={styles.askPasso} viewBox="24 40 192 252" aria-hidden="true" focusable="false">
          <PassoFigure pose={STAND} mode="idle" />
        </svg>
      }
    >
      <div className={styles.thread} aria-live="polite">
        {thread.length === 0 ? (
          <p className={styles.askIntro}>
            Pergunte sobre a clínica em linguagem natural. Eu leio leads, pacientes, agenda e estoque e mostro onde agir.
          </p>
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
              <p className={styles.thinking}>O Flow está cruzando os dados…</p>
            )}
          </div>
        ))}
        <div ref={end} />
      </div>

      <div className={styles.suggest}>
        {SUGGESTED.map((q) => (
          <button key={q} type="button" className={styles.chipButton} onClick={() => ask(q)} disabled={busy}>
            {q}
          </button>
        ))}
      </div>

      <form
        className={styles.askForm}
        onSubmit={(event) => {
          event.preventDefault();
          void ask(text);
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
          placeholder="Ex.: quais leads estão parados?"
          autoComplete="off"
        />
        <button type="submit" className={styles.primary} disabled={busy || !text.trim()}>
          Perguntar
        </button>
      </form>
      <p className={styles.fine}>Respostas demonstrativas, calculadas a partir dos dados da demo. Nenhuma IA está conectada.</p>
    </Sheet>
  );
}

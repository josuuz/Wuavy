"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";

import { brl, hour, relDay } from "@/lib/flow/format";
import { daySlots, recovered } from "@/lib/flow/insights";
import { BASE, KIND } from "../copy";
import { useFlow } from "../store";
import styles from "../ui.module.css";

/* The first screen: not a dashboard of charts, a short answer to "where do I act today?". */

const noSubscribe = () => () => {};
const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
};

const RECOVERED_LABEL: Record<string, string> = {
  lead_followup: "Follow-up de leads",
  patient_return: "Retornos",
  open_slot: "Horários preenchidos",
  stock_expiry: "Estoque girado",
};

export function Overview() {
  const { data, ops, dispatch } = useFlow();
  const hello = useSyncExternalStore(noSubscribe, greeting, () => "Bom dia");
  const back = recovered(data);
  const tomorrow = daySlots(data, 1);
  const feed = [...data.activities].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 6);

  return (
    <div className={styles.page}>
      <h1 className={styles.greet}>
        {hello}. <span>O Flow encontrou novas oportunidades.</span>
      </h1>

      <ol className={styles.signals}>
        {ops.map((o) => {
          const [value, label] = KIND[o.kind].stat(o);
          return (
            <li key={o.kind} className={styles.signal} data-done={o.status === "resolvida" ? "" : undefined}>
              <span className={styles.signalValue}>{value}</span>
              <span className={styles.signalLabel}>{label}</span>
              <Link
                href={`${BASE}/oportunidades`}
                className={styles.textAction}
                onClick={() => dispatch({ type: "focus", kind: o.kind })}
              >
                {KIND[o.kind].action} <span aria-hidden="true">→</span>
              </Link>
            </li>
          );
        })}
      </ol>

      <div className={styles.duo}>
        <section className={styles.panel} aria-labelledby="recuperada">
          <h2 id="recuperada" className={styles.label}>
            Receita recuperada pelo Flow <span>últimos 30 dias</span>
          </h2>
          <p className={styles.big}>{brl(back.total)}</p>
          <ul className={styles.rows}>
            {Object.entries(RECOVERED_LABEL).map(([kind, label]) => (
              <li key={kind}>
                <span>{label}</span>
                <strong>{brl(back.byKind.get(kind) ?? 0)}</strong>
              </li>
            ))}
          </ul>
          <p className={styles.fine}>Métrica conceitual: soma do que as automações ajudaram a trazer de volta, sobre dados ilustrativos.</p>
        </section>

        <section className={styles.panel} aria-labelledby="amanha">
          <h2 id="amanha" className={styles.label}>
            Amanhã na agenda
          </h2>
          <ol className={styles.miniDay}>
            {tomorrow.map((slot) => {
              const patient = data.patients.find((p) => p.id === slot.appointment?.patientId);
              return (
                <li key={slot.startsAt} data-status={slot.status}>
                  <span className={styles.time}>{hour(slot.startsAt)}</span>
                  <span>{slot.status === "ocupado" ? patient?.name : slot.status === "livre" ? "Livre" : "Cancelado · livre"}</span>
                </li>
              );
            })}
          </ol>
          <Link href={`${BASE}/agenda`} className={styles.textAction}>
            Abrir a agenda <span aria-hidden="true">→</span>
          </Link>
        </section>
      </div>

      <section className={styles.feedBlock} aria-labelledby="atividade">
        <h2 id="atividade" className={styles.label}>
          Atividade recente
        </h2>
        <ol className={styles.feed}>
          {feed.map((a) => (
            <li key={a.id}>
              <span className={styles.when}>{relDay(data.now, a.at)}</span>
              <span>{a.text}</span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

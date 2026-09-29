"use client";

import Link from "next/link";
import { useState } from "react";

import { daysFrom, hour } from "@/lib/flow/format";
import { daySlots, procedureOf, slotCandidates, type Slot } from "@/lib/flow/insights";
import { BASE } from "../copy";
import { useFlow } from "../store";
import styles from "../ui.module.css";

/* Today and tomorrow, the waiting list beside them. A cancellation becomes an opportunity on the spot. */

const DAYS = [
  { offset: 0, label: "Hoje" },
  { offset: 1, label: "Amanhã" },
];

export function Schedule() {
  const { data, dispatch } = useFlow();
  const [invited, setInvited] = useState<string[]>([]);
  // Cancellations made in the demo (tomorrow): each shows up as an opportunity.
  const freed = daySlots(data, 1).filter((s) => s.status === "cancelado");
  const invite = (id: string, text: string) => {
    setInvited((list) => [...list, id]);
    dispatch({ type: "note", text });
  };

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <h1 className={styles.title}>Agenda</h1>
        <p className={styles.lead}>Horários ocupados, livres e cancelados. Simule um cancelamento para ver o Flow reagir.</p>
      </header>

      {freed.map((slot) => {
        const candidates = slotCandidates(data, slot.startsAt);
        return (
          <div key={slot.startsAt} className={styles.alert} role="status">
            <p className={styles.alertTitle}>Horário disponível amanhã às {hour(slot.startsAt)}.</p>
            <p>
              {candidates.length
                ? `Da lista de espera, quem pode ocupar: ${candidates.map((c) => `${c.patient.name} (${c.procedure.name})`).join(", ")}.`
                : "Nenhum paciente da lista de espera para este período; o Flow sugere pacientes com retorno próximo."}
            </p>
            <Link href={`${BASE}/oportunidades`} className={styles.textAction} onClick={() => dispatch({ type: "focus", kind: "open_slot" })}>
              Ver a oportunidade <span aria-hidden="true">→</span>
            </Link>
          </div>
        );
      })}

      <div className={styles.agenda}>
        {DAYS.map((day) => (
          <section key={day.label} className={styles.day} aria-labelledby={`day-${day.offset}`}>
            <h2 id={`day-${day.offset}`} className={styles.label}>
              {day.label}
            </h2>
            <ol className={styles.slots}>
              {daySlots(data, day.offset).map((slot) => (
                <SlotRow
                  key={slot.startsAt}
                  slot={slot}
                  canCancel={day.offset === 1}
                  onCancel={(id) => dispatch({ type: "cancel", id })}
                />
              ))}
            </ol>
          </section>
        ))}

        <section className={styles.day} aria-labelledby="espera">
          <h2 id="espera" className={styles.label}>
            Lista de espera
          </h2>
          <ol className={styles.waitlist}>
            {data.waitlist.map((w) => {
              const patient = data.patients.find((p) => p.id === w.patientId);
              const procedure = procedureOf(data, w.procedureId);
              const done = invited.includes(w.id);
              return (
                <li key={w.id}>
                  <strong>{patient?.name}</strong>
                  <span>
                    {procedure?.name} · prefere {w.period === "manha" ? "manhã" : "tarde"} · há {-daysFrom(data.now, w.createdAt)} dias
                  </span>
                  {done ? (
                    <span className={styles.done}>Convite preparado. Não enviado.</span>
                  ) : (
                    <button
                      type="button"
                      className={styles.secondary}
                      onClick={() => invite(w.id, `Convite de horário preparado para ${patient?.name}. Não enviado.`)}
                    >
                      Preparar convite
                    </button>
                  )}
                </li>
              );
            })}
          </ol>
        </section>
      </div>
    </div>
  );
}

function SlotRow({ slot, canCancel, onCancel }: { slot: Slot; canCancel: boolean; onCancel: (id: string) => void }) {
  const { data } = useFlow();
  const a = slot.appointment;
  const patient = data.patients.find((p) => p.id === a?.patientId);
  const procedure = a ? procedureOf(data, a.procedureId) : undefined;
  return (
    <li className={styles.slot} data-status={slot.status}>
      <span className={styles.time}>{hour(slot.startsAt)}</span>
      <div className={styles.slotBody}>
        {slot.status === "ocupado" ? (
          <>
            <strong>{patient?.name}</strong>
            <span>
              {procedure?.name} · {procedure?.durationMin} min{a?.status === "confirmado" ? " · confirmado" : ""}
            </span>
          </>
        ) : slot.status === "cancelado" ? (
          <>
            <strong>Cancelado</strong>
            <span>
              {patient?.name} · horário livre
            </span>
          </>
        ) : (
          <strong>Horário livre</strong>
        )}
      </div>
      {canCancel && slot.status === "ocupado" && a ? (
        <button type="button" className={styles.quiet} onClick={() => onCancel(a.id)}>
          Simular cancelamento
        </button>
      ) : null}
    </li>
  );
}

"use client";

import { useState } from "react";

import { brl, daysFrom, relDay } from "@/lib/flow/format";
import { dueReturns, hasUpcoming, history, procedureOf } from "@/lib/flow/insights";
import type { Patient } from "@/lib/flow/types";
import { Sheet } from "../Sheet";
import { useFlow } from "../store";
import styles from "../ui.module.css";

/* Patients: who they are commercially, never a medical record. */

const FILTERS = [
  { id: "todos", label: "Todos" },
  { id: "retorno", label: "Retorno próximo" },
] as const;

export function Patients() {
  const { data, dispatch } = useFlow();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("todos");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const due = new Set(dueReturns(data).map((p) => p.id));
  const q = query.trim().toLowerCase();
  const list = data.patients
    .filter((p) => (filter === "todos" || due.has(p.id)) && (!q || p.name.toLowerCase().includes(q)))
    .sort((a, b) => b.lastVisitAt.localeCompare(a.lastVisitAt));
  const patient = data.patients.find((p) => p.id === selected);

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <h1 className={styles.title}>Pacientes</h1>
        <p className={styles.lead}>
          {data.patients.length} pacientes, {due.size} potencialmente perto do período de retorno.
        </p>
      </header>

      <div className={styles.toolbar}>
        <div className={styles.segmented} role="group" aria-label="Filtrar pacientes">
          {FILTERS.map((f) => (
            <button key={f.id} type="button" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
              {f.label}
            </button>
          ))}
        </div>
        <label className="sr-only" htmlFor="patient-search">
          Buscar paciente
        </label>
        <input
          id="patient-search"
          className={styles.input}
          type="search"
          placeholder="Buscar por nome"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      <table className={styles.table} data-rows="">
        <thead>
          <tr>
            <th scope="col">Paciente</th>
            <th scope="col">Último atendimento</th>
            <th scope="col">Próximo retorno</th>
            <th scope="col">Valor gasto</th>
          </tr>
        </thead>
        <tbody>
          {list.map((p) => (
            <tr key={p.id}>
              <td data-label="Paciente">
                <button type="button" className={styles.rowButton} onClick={() => setSelected(p.id)}>
                  {p.name}
                </button>
                {due.has(p.id) ? <span className={styles.dot}>Retorno próximo</span> : null}
              </td>
              <td data-label="Último atendimento">{relDay(data.now, p.lastVisitAt)}</td>
              <td data-label="Próximo retorno">{p.nextReturnAt ? relDay(data.now, p.nextReturnAt) : "—"}</td>
              <td data-label="Valor gasto">{brl(p.totalSpent)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {list.length === 0 ? <p className={styles.fine}>Nenhum paciente encontrado.</p> : null}

      <Sheet open={Boolean(patient)} onClose={() => setSelected(null)} title={patient?.name ?? ""} kicker="Paciente">
        {patient ? (
          <Profile
            patient={patient}
            due={due.has(patient.id)}
            onInvite={() => dispatch({ type: "note", text: `Convite de retorno preparado para ${patient.name}. Não enviado.` })}
          />
        ) : null}
      </Sheet>
    </div>
  );
}

function Profile({ patient, due, onInvite }: { patient: Patient; due: boolean; onInvite: () => void }) {
  const { data } = useFlow();
  const visits = history(data, patient.id);
  const [invited, setInvited] = useState(false);
  const next = patient.nextReturnAt ? daysFrom(data.now, patient.nextReturnAt) : null;
  return (
    <>
      <dl className={styles.fields}>
        <div>
          <dt>Contato</dt>
          <dd>{patient.phone}</dd>
        </div>
        <div>
          <dt>Paciente desde</dt>
          <dd>{relDay(data.now, patient.firstVisitAt)}</dd>
        </div>
        <div>
          <dt>Último atendimento</dt>
          <dd>{relDay(data.now, patient.lastVisitAt)}</dd>
        </div>
        <div>
          <dt>Próximo retorno</dt>
          <dd>
            {patient.nextReturnAt ? relDay(data.now, patient.nextReturnAt) : "—"}
            {hasUpcoming(data, patient.id) ? " · já agendado" : ""}
          </dd>
        </div>
        <div>
          <dt>Valor gasto</dt>
          <dd>{brl(patient.totalSpent)}</dd>
        </div>
      </dl>

      <p className={styles.label}>Procedimentos realizados</p>
      <ol className={styles.history}>
        {visits.map((v) => (
          <li key={v.id}>
            <span>{procedureOf(data, v.procedureId)?.name}</span>
            <span className={styles.when}>{relDay(data.now, v.startsAt)}</span>
          </li>
        ))}
      </ol>

      <p className={styles.label}>Observações comerciais</p>
      <p className={styles.note}>{patient.notes}</p>

      {due ? (
        <div className={styles.suggestion}>
          <p className={styles.label}>Sugestão do Flow</p>
          <p>
            {next !== null && next < 0
              ? `O retorno típico passou há ${-next} dias e não há nada marcado.`
              : `O retorno típico chega ${relDay(data.now, patient.nextReturnAt!)} e não há nada marcado.`}
          </p>
          {invited ? (
            <p className={styles.done}>Convite preparado para revisão. Nenhuma mensagem foi enviada.</p>
          ) : (
            <button
              type="button"
              className={styles.primary}
              onClick={() => {
                onInvite();
                setInvited(true);
              }}
            >
              Preparar convite de retorno
            </button>
          )}
        </div>
      ) : null}
    </>
  );
}

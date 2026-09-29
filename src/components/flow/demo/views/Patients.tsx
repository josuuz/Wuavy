"use client";

import { useState } from "react";

import { deletePatient, savePatient } from "@/lib/flow/actions";
import { brl, daysFrom, relDay } from "@/lib/flow/format";
import { dueReturns, hasUpcoming, history, procedureOf } from "@/lib/flow/insights";
import type { Patient } from "@/lib/flow/types";
import { DeleteButton, Field, FormError, useWrite } from "../forms";
import { Sheet } from "../Sheet";
import { useFlow } from "../store";
import styles from "../ui.module.css";

/* Patients: who they are commercially, never a medical record. */

const FILTERS = [
  { id: "todos", label: "Todos" },
  { id: "retorno", label: "Retorno próximo" },
] as const;

export function Patients() {
  const { data, dispatch, live } = useFlow();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("todos");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const due = new Set(dueReturns(data).map((p) => p.id));
  const q = query.trim().toLowerCase();
  const list = data.patients
    .filter((p) => (filter === "todos" || due.has(p.id)) && (!q || p.name.toLowerCase().includes(q)))
    .sort((a, b) => (b.lastVisitAt ?? "").localeCompare(a.lastVisitAt ?? ""));
  const patient = data.patients.find((p) => p.id === selected);

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <h1 className={styles.title}>Pacientes</h1>
        <p className={styles.lead}>
          {data.patients.length} pacientes, {due.size} potencialmente perto do período de retorno.
        </p>
        {live ? (
          <div className={styles.actions}>
            <button type="button" className={styles.primary} onClick={() => setCreating(true)}>
              Novo paciente
            </button>
          </div>
        ) : null}
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
              <td data-label="Último atendimento">{p.lastVisitAt ? relDay(data.now, p.lastVisitAt) : "—"}</td>
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
            key={patient.id}
            patient={patient}
            due={due.has(patient.id)}
            onInvite={() => dispatch({ type: "note", text: `Convite de retorno preparado para ${patient.name}. Não enviado.` })}
            onDeleted={() => setSelected(null)}
          />
        ) : null}
      </Sheet>

      {live ? (
        <Sheet open={creating} onClose={() => setCreating(false)} title="Novo paciente" kicker="Paciente">
          <PatientForm onDone={() => setCreating(false)} />
        </Sheet>
      ) : null}
    </div>
  );
}

interface ProfileProps {
  patient: Patient;
  due: boolean;
  onInvite: () => void;
  onDeleted: () => void;
}

function Profile({ patient, due, onInvite, onDeleted }: ProfileProps) {
  const { data, live } = useFlow();
  const { pending, error, write } = useWrite();
  const visits = history(data, patient.id);
  const [invited, setInvited] = useState(false);
  const [editing, setEditing] = useState(false);
  const next = patient.nextReturnAt ? daysFrom(data.now, patient.nextReturnAt) : null;

  if (editing) return <PatientForm patient={patient} onDone={() => setEditing(false)} />;

  return (
    <>
      <dl className={styles.fields}>
        <div>
          <dt>Contato</dt>
          <dd>{patient.phone || "—"}</dd>
        </div>
        <div>
          <dt>Paciente desde</dt>
          <dd>{patient.firstVisitAt ? relDay(data.now, patient.firstVisitAt) : "—"}</dd>
        </div>
        <div>
          <dt>Último atendimento</dt>
          <dd>{patient.lastVisitAt ? relDay(data.now, patient.lastVisitAt) : "—"}</dd>
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

      {visits.length === 0 ? <p className={styles.fine}>Nenhum procedimento concluído ainda.</p> : null}

      <p className={styles.label}>Observações comerciais</p>
      <p className={styles.note}>{patient.notes || "—"}</p>

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

      {live ? (
        <>
          <FormError error={error} />
          <div className={styles.actions}>
            <button type="button" className={styles.quiet} onClick={() => setEditing(true)}>
              Editar
            </button>
            <DeleteButton
              confirm="Excluir paciente e seus agendamentos"
              pending={pending}
              onDelete={() => write(() => deletePatient(patient.id), onDeleted)}
            />
          </div>
        </>
      ) : null}
    </>
  );
}

function PatientForm({ patient, onDone }: { patient?: Patient; onDone: () => void }) {
  const { pending, error, submit } = useWrite();
  return (
    <form className={styles.form} onSubmit={submit((form) => savePatient(patient?.id ?? null, form), onDone)}>
      <Field label="Nome">
        <input className={styles.input} name="name" required maxLength={200} defaultValue={patient?.name} autoComplete="off" />
      </Field>
      <Field label="Telefone">
        <input className={styles.input} name="phone" type="tel" maxLength={40} defaultValue={patient?.phone} />
      </Field>
      <Field label="Observações comerciais">
        <textarea className={styles.input} name="notes" maxLength={1000} defaultValue={patient?.notes} />
      </Field>
      <p className={styles.fine}>Só observações comerciais e operacionais. Nada de prontuário ou dado clínico.</p>
      <FormError error={error} />
      <div className={styles.actions}>
        <button type="submit" className={styles.primary} disabled={pending}>
          {patient ? "Salvar" : "Criar paciente"}
        </button>
        <button type="button" className={styles.quiet} onClick={onDone}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

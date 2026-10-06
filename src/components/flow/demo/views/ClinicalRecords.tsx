"use client";

import { useState } from "react";

import { saveRecord, type Result } from "@/lib/flow/actions";
import { shortDate } from "@/lib/flow/format";
import type { ClinicalRecord, FlowData, Patient } from "@/lib/flow/types";
import { Field, FormError, useWrite } from "../forms";
import { useFlow } from "../store";
import styles from "../ui.module.css";

/*
  The patient's clinical record, inside their own file: the chief complaint
  in sight, the records one tap away. Only the owner and the professionals
  see any of it (the front desk gets nothing, and the database refuses them
  too, migration 0007). The demo shows it with fictitious records.
*/

export function useCanRecord() {
  const { access, account } = useFlow();
  return access.isDemoMode || account?.role === "owner" || account?.role === "professional";
}

const recordsOf = (data: FlowData, patientId: string) =>
  data.records.filter((r) => r.patientId === patientId).sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));

/** The latest chief complaint, highlighted beside the history. */
export function ChiefComplaint({ patient }: { patient: Patient }) {
  const { data } = useFlow();
  const can = useCanRecord();
  const latest = recordsOf(data, patient.id).find((r) => r.chiefComplaint);
  if (!can || !latest) return null;
  return (
    <section className={styles.complaint} aria-labelledby="queixa">
      <p id="queixa" className={styles.kicker}>
        Queixa principal
      </p>
      <p className={styles.complaintText}>{latest.chiefComplaint}</p>
      <p className={styles.fine}>Registrada em {shortDate(latest.recordedAt)}</p>
    </section>
  );
}

const SHOWN = 4;

export function ClinicalRecords({ patient }: { patient: Patient }) {
  const { data, access } = useFlow();
  const can = useCanRecord();
  const [editing, setEditing] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  if (!can) return null;
  const records = recordsOf(data, patient.id);
  const shown = all ? records : records.slice(0, SHOWN);

  return (
    <details className={styles.costs}>
      <summary>
        Prontuário{records.length ? ` · ${records.length} ${records.length === 1 ? "registro" : "registros"}` : ""}
      </summary>
      <p className={styles.fine}>Visível só para o responsável e os profissionais da clínica.</p>
      {editing === "novo" ? (
        <RecordForm patient={patient} onDone={() => setEditing(null)} />
      ) : access.canEdit ? (
        <button type="button" className={styles.secondary} onClick={() => setEditing("novo")}>
          Novo registro
        </button>
      ) : null}
      {records.length ? (
        <ol className={styles.records}>
          {shown.map((r) =>
            editing === r.id ? (
              <li key={r.id}>
                <RecordForm patient={patient} record={r} onDone={() => setEditing(null)} />
              </li>
            ) : (
              <li key={r.id}>
                <span className={styles.when}>{shortDate(r.recordedAt)}</span>
                {r.chiefComplaint ? <strong>{r.chiefComplaint}</strong> : null}
                {r.notes ? <p>{r.notes}</p> : null}
                {access.canEdit ? (
                  <button type="button" className={styles.quiet} onClick={() => setEditing(r.id)}>
                    Editar
                  </button>
                ) : null}
              </li>
            ),
          )}
        </ol>
      ) : editing ? null : (
        <p className={styles.fine}>Nenhum registro ainda.</p>
      )}
      {records.length > SHOWN && !all ? (
        <button type="button" className={styles.more} onClick={() => setAll(true)}>
          Ver os {records.length} registros
        </button>
      ) : null}
    </details>
  );
}

function RecordForm({ patient, record, onDone }: { patient: Patient; record?: ClinicalRecord; onDone: () => void }) {
  const { data, live, dispatch } = useFlow();
  const { pending, error, submit } = useWrite();

  // The demo keeps it in memory, with the same rule the server applies.
  const demoSave = async (form: FormData): Promise<Result> => {
    const chiefComplaint = String(form.get("chiefComplaint") ?? "").trim();
    const notes = String(form.get("notes") ?? "").trim();
    if (!chiefComplaint && !notes) return { error: "Escreva a queixa principal ou a evolução." };
    const day = String(form.get("recordedAt") || data.now.slice(0, 10));
    dispatch({ type: "record", record: { id: record?.id, patientId: patient.id, recordedAt: `${day}T12:00:00.000Z`, chiefComplaint, notes } });
    return {};
  };

  return (
    <form className={styles.form} onSubmit={submit(live ? (form) => saveRecord(record?.id ?? null, patient.id, form) : demoSave, onDone)}>
      <Field label="Data">
        <input className={styles.input} type="date" name="recordedAt" defaultValue={(record?.recordedAt ?? data.now).slice(0, 10)} />
      </Field>
      <Field label="Queixa principal">
        <textarea className={styles.input} name="chiefComplaint" rows={2} maxLength={500} defaultValue={record?.chiefComplaint} />
      </Field>
      <Field label="Evolução e anotações">
        <textarea className={styles.input} name="notes" rows={4} maxLength={8000} defaultValue={record?.notes} />
      </Field>
      <FormError error={error} />
      <div className={styles.actions}>
        <button type="submit" className={styles.primary} disabled={pending}>
          {record ? "Salvar" : "Registrar"}
        </button>
        <button type="button" className={styles.quiet} onClick={onDone}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

"use client";

import { useEffect, useState } from "react";

import {
  FIELD_KINDS,
  FIXED_FIELDS,
  KIND_LABEL,
  keyFor,
  showAnswer,
  type AnamnesisField,
  type Answer,
  type FieldKind,
} from "@/lib/flow/clinical";
import {
  loadClinicalFile,
  publishAnamnesisForm,
  saveAnamnesis,
  type AnamnesisSheet,
  type ClinicalFile,
} from "@/lib/flow/clinical-actions";
import { shortDate } from "@/lib/flow/format";
import type { FlowData, Patient } from "@/lib/flow/types";
import { Field, FormError, useWrite } from "../../forms";
import { useFlow } from "../../store";
import styles from "../../ui.module.css";
import own from "./ClinicalFile.module.css";

/*
  The anamnesis. Everything here needs tables that migrations 0014–0016 add and
  that Supabase does not have yet, so the section asks the server once and, when
  the answer is "not there", says exactly that. No form is offered that would
  throw someone's writing away, and nothing is held in memory pretending to be
  saved. The records already in the Prontuário are a different table and are not
  affected either way.
*/

/*
  Four reasons the sheets may not be here, and four different things to say.
  Telling someone "the migrations are missing" when their session has lapsed
  sends them to look in the wrong place, so each state keeps its own words.
*/
const NOTICE: Record<"absent" | "blocked" | "failed" | "demo", { title: string; text: string }> = {
  absent: {
    title: "A anamnese está pronta, esperando o banco",
    text: "As tabelas da anamnese ainda não foram aplicadas no banco desta clínica. Enquanto isso o Prontuário segue funcionando normalmente: a evolução e o histórico estão nas abas ao lado.",
  },
  blocked: {
    title: "A anamnese é do atendimento clínico",
    text: "Seu acesso não alcança o prontuário das pacientes. Fale com o responsável pela clínica se precisar dele.",
  },
  failed: {
    title: "Não foi possível abrir a anamnese agora",
    text: "Pode ter sido a conexão ou a sua sessão. Atualize a página e, se continuar, fale com a Wuavy. Nada do que está guardado foi perdido.",
  },
  demo: {
    title: "A anamnese aparece na clínica, não na demonstração",
    text: "Esta é uma demonstração com dados fictícios. A anamnese grava no banco da clínica, então ela só abre numa conta de verdade.",
  },
};

/** The one state the server never returns, because the demo never asks it. */
const CLOSED = { state: "demo", sheets: [], forms: [] } as const;

/** Who wrote it, by name, kept after they leave the clinic (members are disabled, never deleted). */
const nameOf = (data: FlowData, userId?: string) => (userId ? data.users.find((u) => u.id === userId)?.name : undefined);

export function Anamnesis({ patient }: { patient: Patient }) {
  const { live, account, access, data } = useFlow();
  const [fetched, setFetched] = useState<ClinicalFile | null>(null);
  const [filling, setFilling] = useState(false);
  const [building, setBuilding] = useState(false);
  /** The sheet open for editing, by id. One at a time, like the evolution entries. */
  const [editing, setEditing] = useState("");
  /** What the last write did, said once it is actually in the database. */
  const [saved, setSaved] = useState("");
  // The demo has no clinic to ask about, so its answer is known without asking.
  const file: ClinicalFile | typeof CLOSED | null = live ? fetched : CLOSED;

  // Asked once, on arrival, and again whenever a form closes — including an
  // edit, so the sheet below redraws with what was saved and its new count of
  // changes, rather than with what the browser happened to be holding.
  useEffect(() => {
    if (!live) return;
    let gone = false;
    void loadClinicalFile(patient.id).then((answer) => {
      if (!gone) setFetched(answer);
    });
    return () => {
      gone = true;
    };
  }, [live, patient.id, filling, building, editing]);

  if (!file) return <p className={own.empty}>Carregando…</p>;

  if (file.state !== "ready") {
    const notice = NOTICE[file.state];
    return (
      <div className={own.waiting} role={file.state === "failed" ? "alert" : undefined}>
        <p className={own.waitingTitle}>{notice.title}</p>
        <p className={own.waitingText}>{notice.text}</p>
      </div>
    );
  }

  const owner = account?.role === "owner";

  return (
    <div className={own.panel}>
      {filling ? (
        <SheetForm
          patient={patient}
          forms={file.forms}
          onSaved={() => {
            setFilling(false);
            setSaved("Anamnese registrada.");
          }}
          onCancel={() => setFilling(false)}
        />
      ) : (
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.secondary}
            onClick={() => {
              setSaved("");
              setEditing("");
              setFilling(true);
            }}
          >
            Nova anamnese
          </button>
          {owner ? (
            <button type="button" className={styles.quiet} onClick={() => setBuilding((b) => !b)}>
              {building ? "Fechar formulários" : "Formulários da clínica"}
            </button>
          ) : null}
        </div>
      )}

      {saved ? (
        <p className={own.saved} role="status">
          {saved}
        </p>
      ) : null}

      {owner && building ? <FormBuilder forms={file.forms} onDone={() => setBuilding(false)} /> : null}

      {file.sheets.length ? (
        file.sheets.map((sheet) =>
          editing === sheet.id ? (
            <SheetForm
              key={sheet.id}
              patient={patient}
              forms={file.forms}
              sheet={sheet}
              onSaved={() => {
                setEditing("");
                setSaved("Alterações salvas.");
              }}
              onCancel={() => setEditing("")}
            />
          ) : (
            <article key={sheet.id} className={own.sheet}>
              <p className={own.stamp}>
                <span>{shortDate(sheet.recordedAt)}</span>
                {nameOf(data, sheet.authorId) ? <span>· {nameOf(data, sheet.authorId)}</span> : null}
                {sheet.revisions ? (
                  <span>
                    · {sheet.revisions} {sheet.revisions > 1 ? "alterações" : "alteração"}
                    {sheet.updatedAt ? ` em ${shortDate(sheet.updatedAt)}` : ""}
                    {sheet.updatedBy && sheet.updatedBy !== sheet.authorId && nameOf(data, sheet.updatedBy)
                      ? ` por ${nameOf(data, sheet.updatedBy)}`
                      : ""}
                  </span>
                ) : null}
              </p>
              <dl className={own.pairs}>
                {FIXED_FIELDS.filter((f) => sheet.fixed[f.key]).map((f) => (
                  <div
                    key={f.key}
                    className={`${own.pair} ${f.rows > 2 ? own.wide : ""} ${f.key === "allergies" ? own.flag : ""}`}
                  >
                    <dt className={own.pairLabel}>{f.label}</dt>
                    <dd className={own.pairValue}>{sheet.fixed[f.key]}</dd>
                  </div>
                ))}
                {sheet.fields
                  .filter((field) => sheet.answers[field.key] !== undefined)
                  .map((field) => (
                    <div key={field.key} className={own.pair}>
                      <dt className={own.pairLabel}>{field.label}</dt>
                      <dd className={own.pairValue}>{showAnswer(sheet.answers[field.key])}</dd>
                    </div>
                  ))}
              </dl>
              {access.canEdit ? (
                <button
                  type="button"
                  className={styles.quiet}
                  onClick={() => {
                    setSaved("");
                    setFilling(false);
                    setEditing(sheet.id);
                  }}
                >
                  Editar
                </button>
              ) : null}
            </article>
          ),
        )
      ) : filling ? null : (
        <p className={own.empty}>Nenhuma anamnese ainda.</p>
      )}
    </div>
  );
}

/* ── Filling one, and changing one ─────────────────────────── */

/**
 * One sheet being written. With `sheet` it is an edit: the same row, the same
 * questions, the same version — only the answers change.
 *
 * An edit draws the questions from the sheet's own frozen copy, never from the
 * clinic's current form, and starts every one of them on the answer already
 * recorded. That is not only convenience: the server replaces the whole
 * `answers` object, so a question drawn but left blank, or not drawn at all,
 * would quietly delete what the patient had answered. Showing all of them,
 * filled, means a change is only ever something someone typed.
 */
function SheetForm({
  patient,
  forms,
  sheet,
  onSaved,
  onCancel,
}: {
  patient: Patient;
  forms: ClinicalFile["forms"];
  /** The sheet being changed; absent when this is a new one. */
  sheet?: AnamnesisSheet;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const { pending, error, submit } = useWrite();
  const usable = forms.filter((f) => f.versionId && f.fields.length);
  const [chosen, setChosen] = useState(usable[0]?.id ?? "");
  const form = usable.find((f) => f.id === chosen);
  // The questions these answers belong to. The server checks this again from
  // the same two places; here it is only about what to draw.
  const fields = sheet ? sheet.fields : (form?.fields ?? []);

  return (
    <form
      className={styles.form}
      onSubmit={submit((data) => {
        // The answers go as one object, keyed by each question's key, which is
        // what the database column holds. The server reads them against the
        // version's own questions and drops anything it does not recognise.
        const answers: Record<string, string | string[]> = {};
        for (const field of fields) {
          if (field.kind === "list") {
            const picked = data.getAll(`q_${field.key}`).filter((v): v is string => typeof v === "string");
            if (picked.length) answers[field.key] = picked;
            continue;
          }
          const value = data.get(`q_${field.key}`);
          if (typeof value === "string" && value !== "") answers[field.key] = value;
        }
        data.set("answers", JSON.stringify(answers));
        // An edit keeps the version it was filled from; sending one would be
        // ignored, and the server would not read it anyway.
        if (!sheet) data.set("versionId", form?.versionId ?? "");
        return saveAnamnesis(sheet?.id ?? null, patient.id, data);
      }, onSaved)}
    >
      {sheet ? (
        <p className={own.waitingText}>
          Alterando a anamnese de {shortDate(sheet.recordedAt)}. As perguntas são as que ela respondeu e não mudam; o
          que estava escrito fica guardado no histórico.
        </p>
      ) : usable.length > 1 ? (
        <Field label="Formulário">
          <select className={styles.input} value={chosen} onChange={(e) => setChosen(e.target.value)}>
            {usable.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name} (v{f.version})
              </option>
            ))}
          </select>
        </Field>
      ) : null}

      {FIXED_FIELDS.map((f) => (
        <Field key={f.key} label={f.label}>
          <textarea
            className={styles.input}
            name={f.key}
            rows={f.rows}
            maxLength={f.max}
            defaultValue={sheet?.fixed[f.key] ?? ""}
          />
        </Field>
      ))}

      {fields.map((field) => (
        <Answerable key={field.key} field={field} answer={sheet?.answers[field.key]} />
      ))}

      <FormError error={error} />
      <div className={styles.actions}>
        <button type="submit" className={styles.primary} disabled={pending}>
          {sheet ? "Salvar" : "Registrar"}
        </button>
        <button type="button" className={styles.quiet} onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

/** One of the clinic's own questions, drawn the way its kind asks to be, on the answer it already has. */
function Answerable({ field, answer }: { field: AnamnesisField; answer?: Answer }) {
  const name = `q_${field.key}`;
  // Everything but `list` and `boolean` is stored as the string the input holds.
  const written = typeof answer === "string" ? answer : "";
  if (field.kind === "boolean") {
    return (
      <Field label={field.label}>
        <select className={styles.input} name={name} defaultValue={answer === true ? "sim" : answer === false ? "nao" : ""}>
          <option value="">—</option>
          <option value="sim">Sim</option>
          <option value="nao">Não</option>
        </select>
      </Field>
    );
  }
  if (field.kind === "date") {
    return (
      <Field label={field.label}>
        <input className={styles.input} type="date" name={name} defaultValue={written} />
      </Field>
    );
  }
  if (field.kind === "choice") {
    return (
      <Field label={field.label}>
        <select className={styles.input} name={name} defaultValue={written}>
          <option value="">—</option>
          {field.options?.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </Field>
    );
  }
  if (field.kind === "list") {
    const picked = Array.isArray(answer) ? answer : [];
    return (
      <Field label={field.label}>
        <span className={own.choices}>
          {field.options?.map((option) => (
            <label key={option} className={own.choice}>
              <input type="checkbox" name={name} value={option} defaultChecked={picked.includes(option)} />
              {option}
            </label>
          ))}
        </span>
      </Field>
    );
  }
  return (
    <Field label={field.label}>
      <textarea className={styles.input} name={name} rows={2} maxLength={field.max ?? 2000} defaultValue={written} />
    </Field>
  );
}

/* ── Shaping the clinic's forms ────────────────────────────── */

const BLANK: AnamnesisField = { key: "", label: "", kind: "text" };

/**
 * The clinic writes its own questions. Publishing never edits what is already
 * out there: it adds a version, and sheets filled from the old one keep their
 * own copy of it. That is why there is no "edit question" here — only "publish
 * version N+1".
 */
function FormBuilder({ forms, onDone }: { forms: ClinicalFile["forms"]; onDone: () => void }) {
  const { data } = useFlow();
  const { pending, error, submit } = useWrite();
  const [editing, setEditing] = useState<string>("");
  const current = forms.find((f) => f.id === editing);
  const [fields, setFields] = useState<AnamnesisField[]>([{ ...BLANK }]);
  const [name, setName] = useState("");
  const [procedureId, setProcedureId] = useState("");

  const pick = (formId: string) => {
    setEditing(formId);
    const found = forms.find((f) => f.id === formId);
    setFields(found?.fields.length ? found.fields.map((f) => ({ ...f })) : [{ ...BLANK }]);
    setName(found?.name ?? "");
    setProcedureId(found?.procedureId ?? "");
  };

  const change = (index: number, patch: Partial<AnamnesisField>) =>
    setFields((list) => list.map((f, i) => (i === index ? { ...f, ...patch } : f)));

  return (
    <form
      className={styles.form}
      onSubmit={submit((payload) => {
        payload.set("name", name);
        payload.set("procedureId", procedureId);
        payload.set(
          "fields",
          JSON.stringify(fields.filter((f) => f.label.trim()).map((f) => ({ ...f, key: f.key || keyFor(f.label) }))),
        );
        return publishAnamnesisForm(editing || null, payload);
      }, onDone)}
    >
      <Field label="Formulário">
        <select className={styles.input} value={editing} onChange={(e) => pick(e.target.value)}>
          <option value="">Novo formulário</option>
          {forms.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name} (v{f.version})
            </option>
          ))}
        </select>
      </Field>
      <Field label="Nome">
        <input className={styles.input} value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
      </Field>
      <Field label="Procedimento">
        <select className={styles.input} value={procedureId} onChange={(e) => setProcedureId(e.target.value)}>
          <option value="">Geral da clínica</option>
          {data.procedures.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </Field>

      {fields.map((field, index) => (
        <div key={index} className={own.question}>
          <div className={own.questionHead}>
            <input
              className={styles.input}
              placeholder="Pergunta"
              value={field.label}
              maxLength={200}
              onChange={(e) => change(index, { label: e.target.value })}
            />
            <select
              className={styles.input}
              value={field.kind}
              onChange={(e) => change(index, { kind: e.target.value as FieldKind })}
            >
              {FIELD_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {KIND_LABEL[kind]}
                </option>
              ))}
            </select>
          </div>
          {field.kind === "choice" || field.kind === "list" ? (
            <input
              className={styles.input}
              placeholder="Opções, separadas por vírgula"
              defaultValue={field.options?.join(", ") ?? ""}
              onChange={(e) =>
                change(index, {
                  options: e.target.value
                    .split(",")
                    .map((o) => o.trim())
                    .filter(Boolean),
                })
              }
            />
          ) : null}
          <div className={own.questionFoot}>
            <label className={own.inline}>
              <input
                type="checkbox"
                checked={Boolean(field.required)}
                onChange={(e) => change(index, { required: e.target.checked })}
              />
              Obrigatória
            </label>
            <button
              type="button"
              className={styles.quiet}
              onClick={() => setFields((list) => list.filter((_, i) => i !== index))}
            >
              Remover
            </button>
          </div>
        </div>
      ))}

      <button type="button" className={styles.secondary} onClick={() => setFields((l) => [...l, { ...BLANK }])}>
        Acrescentar pergunta
      </button>

      <p className={own.waitingText}>
        {current
          ? `Publicar cria a versão ${current.version + 1}. As fichas já preenchidas continuam com as perguntas da versão que responderam.`
          : "As perguntas ficam congeladas quando publicadas: mudar depois cria uma versão nova."}
      </p>

      <FormError error={error} />
      <div className={styles.actions}>
        <button type="submit" className={styles.primary} disabled={pending}>
          Publicar
        </button>
        <button type="button" className={styles.quiet} onClick={onDone}>
          Fechar
        </button>
      </div>
    </form>
  );
}

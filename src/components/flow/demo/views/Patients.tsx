"use client";

import { useState } from "react";

import { deletePatient, savePatient } from "@/lib/flow/actions";
import { brl, capital, dayAt, daysFrom, plural, relDay, shortDate } from "@/lib/flow/format";
import {
  dueReturns,
  history,
  leadsOf,
  nextStep,
  pastFor,
  procedureOf,
  staleQuote,
  upcomingFor,
  type NextStep,
} from "@/lib/flow/insights";
import type { FlowData, Patient } from "@/lib/flow/types";
import { APPOINTMENT_LABEL, SOURCE_LABEL, STAGE_LABEL } from "../copy";
import { DeleteButton, digits, Field, FocusLink, FormError, Intro, useWrite } from "../forms";
import { Sheet } from "../Sheet";
import { useFlow, useFocus } from "../store";
import styles from "../ui.module.css";
import { LeadForm } from "./Pipeline";
import { BookingForm } from "./Schedule";

/*
  Pacientes, the center of the Pulse: one record per person, from how they
  arrived to their next return. Commercial and operational only, never a
  medical record. The list says what to do next for each one.
*/

const FILTERS = [
  { id: "todos", label: "Todos" },
  { id: "retorno", label: "Precisam retornar" },
  { id: "agendados", label: "Com horário marcado" },
  { id: "faltou", label: "Faltaram" },
  { id: "novos", label: "Sem atendimento ainda" },
] as const;
type Filter = (typeof FILTERS)[number]["id"];

const DAY = 86_400_000;
const firstName = (name: string) => name.split(" ")[0];

/** The next step in a few words, for the list; `urgent` when it asks for action now. */
function stepLine(d: FlowData, p: Patient, step: NextStep): { text: string; urgent?: boolean } {
  switch (step.kind) {
    case "agendado":
      return { text: `${capital(dayAt(d.now, step.appointment.startsAt))} · ${procedureOf(d, step.appointment.procedureId)?.name}` };
    case "faltou":
      return { text: `Faltou ${relDay(d.now, step.appointment.startsAt)} · remarcar`, urgent: true };
    case "retorno":
      return step.days < 0
        ? { text: `Retorno atrasado há ${plural(-step.days, "dia", "dias")}`, urgent: true }
        : { text: step.days === 0 ? "Retorno hoje" : `Retorno em ${plural(step.days, "dia", "dias")}`, urgent: true };
    case "orcamento":
      return { text: `Nova venda em ${STAGE_LABEL[step.lead.stage]}` };
    case "primeiro":
      return { text: "Agendar o primeiro atendimento", urgent: true };
    case "em_dia":
      return { text: p.nextReturnAt ? `Em dia · retorno ${relDay(d.now, p.nextReturnAt)}` : "Em dia" };
  }
}

export function Patients() {
  const { data, editable } = useFlow();
  const opened = useFocus("patient");
  const filtered = useFocus("patients");
  const [filter, setFilter] = useState<Filter>(filtered?.filter ?? "todos");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(opened?.id ?? null);
  const [creating, setCreating] = useState(false);
  const due = new Set(dueReturns(data).map((p) => p.id));
  const steps = new Map(data.patients.map((p) => [p.id, nextStep(data, p)]));
  const q = query.trim().toLowerCase();
  const qDigits = digits(q);
  const keep = (p: Patient) => {
    const step = steps.get(p.id)!.kind;
    if (filter === "retorno" && !due.has(p.id)) return false;
    if (filter === "agendados" && step !== "agendado") return false;
    if (filter === "faltou" && step !== "faltou") return false;
    if (filter === "novos" && (p.lastVisitAt || step === "agendado")) return false;
    return !q || p.name.toLowerCase().includes(q) || (qDigits.length >= 4 && digits(p.phone).includes(qDigits));
  };
  const list = data.patients
    .filter(keep)
    .sort((a, b) =>
      filter === "retorno"
        ? (a.nextReturnAt ?? "").localeCompare(b.nextReturnAt ?? "")
        : (b.lastVisitAt ?? "9999").localeCompare(a.lastVisitAt ?? "9999"),
    );
  const patient = data.patients.find((p) => p.id === selected);
  const booked = [...steps.values()].filter((s) => s.kind === "agendado").length;

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <h1 className={styles.title}>Pacientes</h1>
        <p className={styles.lead}>
          Cada pessoa que agendou, numa ficha só: atendimentos, gastos, orçamentos e o próximo retorno.
        </p>
        {editable ? (
          <div className={styles.actions}>
            <button type="button" className={styles.primary} onClick={() => setCreating(true)}>
              Novo paciente
            </button>
          </div>
        ) : null}
      </header>

      {data.patients.length === 0 ? (
        <Intro title="Como funciona">
          Quem agenda vira paciente aqui, com a origem que veio de Vendas. Para quem já é cliente da clínica, use Novo paciente.
        </Intro>
      ) : (
        <>
          <p className={styles.summary}>
            <strong>{plural(data.patients.length, "paciente", "pacientes")}</strong> · <strong>{due.size}</strong>{" "}
            {due.size === 1 ? "precisa" : "precisam"} retornar · <strong>{booked}</strong> com horário marcado
          </p>
          <div className={styles.toolbar}>
            <div className={styles.chips} role="group" aria-label="Filtrar pacientes">
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
              placeholder="Buscar por nome ou telefone"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>

          <table className={styles.table} data-rows="">
            <thead>
              <tr>
                <th scope="col">Paciente</th>
                <th scope="col">Próximo passo</th>
                <th scope="col">Último atendimento</th>
                <th scope="col">Valor gasto</th>
              </tr>
            </thead>
            <tbody>
              {list.map((p) => {
                const line = stepLine(data, p, steps.get(p.id)!);
                return (
                  <tr key={p.id}>
                    <td data-label="Paciente">
                      <button type="button" className={styles.rowButton} onClick={() => setSelected(p.id)}>
                        {p.name}
                      </button>
                    </td>
                    <td data-label="Próximo passo">
                      <span className={line.urgent ? styles.stepUrgent : undefined}>{line.text}</span>
                    </td>
                    <td data-label="Último atendimento">{p.lastVisitAt ? relDay(data.now, p.lastVisitAt) : "—"}</td>
                    <td data-label="Valor gasto">{brl(p.totalSpent)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {list.length === 0 ? <p className={styles.fine}>Nenhum paciente encontrado.</p> : null}
        </>
      )}

      <Sheet wide open={Boolean(patient)} onClose={() => setSelected(null)} title={patient?.name ?? ""} kicker="Paciente">
        {patient ? <Record key={patient.id} patient={patient} onDone={() => setSelected(null)} /> : null}
      </Sheet>

      {editable ? (
        <Sheet open={creating} onClose={() => setCreating(false)} title="Novo paciente" kicker="Pacientes">
          <PatientForm onDone={() => setCreating(false)} />
        </Sheet>
      ) : null}
    </div>
  );
}

/** Which of the clinic's automations touch this patient now, and how. */
function automationsFor(d: FlowData, p: Patient) {
  const rule = (kind: string) => d.automationRules.find((r) => r.kind === kind);
  const next = upcomingFor(d, p.id)[0];
  const lines: { name: string; text: string; active: boolean }[] = [];
  const add = (kind: string, when: boolean, text: string) => {
    const r = rule(kind);
    if (r && when) lines.push({ name: r.name, text, active: r.active });
  };
  add("reminder", Boolean(next), next ? `Lembrete de confirmação · atendimento ${dayAt(d.now, next.startsAt)}` : "");
  add(
    "post_visit",
    Boolean(p.lastVisitAt && daysFrom(d.now, p.lastVisitAt) >= -7),
    "Mensagem de cuidado depois do último atendimento",
  );
  add(
    "patient_return",
    Boolean(p.nextReturnAt && !next),
    p.nextReturnAt ? `Convite de retorno a partir de ${shortDate(new Date(Date.parse(p.nextReturnAt) - 14 * DAY).toISOString())}` : "",
  );
  add("lead_followup", leadsOf(d, p.id).some((l) => staleQuote(d, l)), "Follow-up do orçamento sem resposta");
  add("open_slot", d.waitlist.some((w) => w.patientId === p.id), "Na lista de espera: recebe convite quando abrir um horário");
  return lines;
}

/** The whole person on one page, what to do next first. */
function Record({ patient, onDone }: { patient: Patient; onDone: () => void }) {
  const { data, dispatch, editable, access } = useFlow();
  const { pending, error, write } = useWrite();
  const [mode, setMode] = useState<"ver" | "agendar" | "venda" | "editar">("ver");
  const [invited, setInvited] = useState(false);
  const step = nextStep(data, patient);
  const upcoming = upcomingFor(data, patient.id);
  const past = pastFor(data, patient.id);
  const done = history(data, patient.id);
  const sales = leadsOf(data, patient.id);
  // How they arrived: their first contact, unless they were a patient before it.
  const first = sales.at(-1);
  const origin = first && (!patient.firstVisitAt || first.createdAt <= patient.firstVisitAt) ? first : undefined;
  const lastProcedure = procedureOf(data, done[0]?.procedureId ?? "");
  const byProcedure = [...new Set(done.map((a) => a.procedureId))].map((id) => ({
    procedure: procedureOf(data, id),
    count: done.filter((a) => a.procedureId === id).length,
    last: done.find((a) => a.procedureId === id)!.startsAt,
  }));
  const automations = automationsFor(data, patient);
  const name = firstName(patient.name);

  if (mode === "agendar") {
    const procedureId = step.kind === "faltou" ? step.appointment.procedureId : (done[0]?.procedureId ?? sales[0]?.procedureId);
    return <BookingForm draft={{ patientId: patient.id, procedureId: procedureId || undefined }} onDone={() => setMode("ver")} />;
  }
  if (mode === "venda") return <LeadForm patient={patient} onDone={() => setMode("ver")} />;
  if (mode === "editar") return <PatientForm patient={patient} onDone={() => setMode("ver")} />;

  const invite = () => {
    dispatch({ type: "note", text: `Convite de retorno preparado para ${patient.name}. Não enviado.` });
    setInvited(true);
  };

  return (
    <>
      <section className={styles.nextBox} data-calm={step.kind === "em_dia" ? "" : undefined} aria-labelledby="proximo">
        <p id="proximo" className={styles.kicker}>
          Próximo passo
        </p>
        {step.kind === "agendado" ? (
          <>
            <p className={styles.nextText}>
              {capital(dayAt(data.now, step.appointment.startsAt))}: {procedureOf(data, step.appointment.procedureId)?.name}.{" "}
              <span>{APPOINTMENT_LABEL[step.appointment.status]}.</span>
            </p>
            <FocusLink focus={{ to: "agenda", day: daysFrom(data.now, step.appointment.startsAt) }}>
              Ver na agenda <span aria-hidden="true">→</span>
            </FocusLink>
          </>
        ) : step.kind === "faltou" ? (
          <>
            <p className={styles.nextText}>
              Faltou {relDay(data.now, step.appointment.startsAt)} ({procedureOf(data, step.appointment.procedureId)?.name}).
              Vale remarcar enquanto o interesse está vivo.
            </p>
            <button type="button" className={styles.primary} onClick={() => setMode("agendar")}>
              Remarcar
            </button>
          </>
        ) : step.kind === "retorno" ? (
          <>
            <p className={styles.nextText}>
              {step.days < 0
                ? `O retorno ${lastProcedure ? `de ${lastProcedure.name} ` : ""}passou há ${plural(-step.days, "dia", "dias")}, e não há nada marcado.`
                : `O retorno ${lastProcedure ? `de ${lastProcedure.name} ` : ""}chega ${relDay(data.now, patient.nextReturnAt!)}. Nada marcado ainda.`}
            </p>
            <div className={styles.actions}>
              <button type="button" className={styles.primary} onClick={() => setMode("agendar")}>
                Agendar retorno
              </button>
              {invited ? (
                <span className={styles.done}>Convite preparado. Nada foi enviado.</span>
              ) : access.canEdit ? (
                <button type="button" className={styles.secondary} onClick={invite}>
                  Preparar convite
                </button>
              ) : null}
            </div>
          </>
        ) : step.kind === "orcamento" ? (
          <>
            <p className={styles.nextText}>
              Nova venda em andamento: {procedureOf(data, step.lead.procedureId)?.name ?? "interesse a definir"},{" "}
              {brl(step.lead.potentialValue)}, em {STAGE_LABEL[step.lead.stage]}.
              {staleQuote(data, step.lead) ? ` Sem resposta há ${plural(-daysFrom(data.now, step.lead.lastContactAt), "dia", "dias")}.` : ""}
            </p>
            <FocusLink focus={{ to: "lead", id: step.lead.id }}>
              Abrir em Vendas <span aria-hidden="true">→</span>
            </FocusLink>
          </>
        ) : step.kind === "primeiro" ? (
          <>
            <p className={styles.nextText}>Ainda sem atendimento. Marque o primeiro.</p>
            <button type="button" className={styles.primary} onClick={() => setMode("agendar")}>
              Agendar
            </button>
          </>
        ) : (
          <p className={styles.nextText}>
            Em dia.{" "}
            {patient.nextReturnAt
              ? `Próximo retorno previsto ${relDay(data.now, patient.nextReturnAt)}: o Pulse avisa quando chegar a hora.`
              : "Nada pendente."}
          </p>
        )}
      </section>

      <dl className={styles.factsRow}>
        <div>
          <dt>Telefone</dt>
          <dd>{patient.phone || "—"}</dd>
        </div>
        <div>
          <dt>Paciente desde</dt>
          <dd>{patient.firstVisitAt ? shortDate(patient.firstVisitAt) : "Novo"}</dd>
        </div>
        <div>
          <dt>Atendimentos</dt>
          <dd>{done.length}</dd>
        </div>
        <div>
          <dt>Valor gasto</dt>
          <dd>{brl(patient.totalSpent)}</dd>
        </div>
        <div>
          <dt>Ticket médio</dt>
          <dd>{done.length ? brl(Math.round(patient.totalSpent / done.length)) : "—"}</dd>
        </div>
      </dl>

      <div className={styles.recordGrid}>
        <div className={styles.recordCol}>
          <section aria-labelledby="agendados">
            <h3 id="agendados" className={styles.label}>
              Próximos agendamentos
            </h3>
            {upcoming.length ? (
              <ol className={styles.history}>
                {upcoming.map((a) => (
                  <li key={a.id}>
                    <span>
                      {procedureOf(data, a.procedureId)?.name}
                      <span className={styles.aptTag} data-status={a.status}>
                        {APPOINTMENT_LABEL[a.status]}
                      </span>
                    </span>
                    <span className={styles.when}>{dayAt(data.now, a.startsAt)}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className={styles.fine}>Nada marcado.</p>
            )}
          </section>

          <section aria-labelledby="historico">
            <h3 id="historico" className={styles.label}>
              Histórico de atendimentos
            </h3>
            {past.length ? (
              <ol className={styles.history}>
                {past.map((a) => {
                  const open = a.status === "agendado" || a.status === "confirmado";
                  return (
                    <li key={a.id} data-status={a.status}>
                      <span>
                        {procedureOf(data, a.procedureId)?.name}
                        {a.status !== "concluido" ? (
                          <span className={styles.aptTag} data-status={a.status}>
                            {open ? "Sem registro" : APPOINTMENT_LABEL[a.status]}
                          </span>
                        ) : null}
                      </span>
                      <span className={styles.when}>{shortDate(a.startsAt)}</span>
                    </li>
                  );
                })}
              </ol>
            ) : (
              <p className={styles.fine}>Nenhum atendimento ainda.</p>
            )}
          </section>
        </div>

        <div className={styles.recordCol}>
          <section aria-labelledby="realizados">
            <h3 id="realizados" className={styles.label}>
              Procedimentos realizados
            </h3>
            {byProcedure.length ? (
              <ul className={styles.history}>
                {byProcedure.map((x) => (
                  <li key={x.procedure?.id}>
                    <span>
                      {x.procedure?.name} <span className={styles.count}>×{x.count}</span>
                    </span>
                    <span className={styles.when}>último {relDay(data.now, x.last)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={styles.fine}>Nenhum ainda.</p>
            )}
          </section>

          <section aria-labelledby="orcamentos">
            <h3 id="orcamentos" className={styles.label}>
              Orçamentos
            </h3>
            {sales.length ? (
              <ul className={styles.history}>
                {sales.map((l) => (
                  <li key={l.id}>
                    <span>
                      {procedureOf(data, l.procedureId)?.name ?? "Interesse a definir"} · {brl(l.potentialValue)}
                      <span className={styles.aptTag} data-status={l.stage === "agendado" ? "concluido" : "agendado"}>
                        {l.stage === "agendado" ? "Fechado" : STAGE_LABEL[l.stage]}
                      </span>
                    </span>
                    <span className={styles.when}>{shortDate(l.createdAt)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={styles.fine}>Nenhum orçamento registrado.</p>
            )}
          </section>

          <section aria-labelledby="relacao">
            <h3 id="relacao" className={styles.label}>
              Relacionamento
            </h3>
            {origin ? (
              <p className={styles.note}>
                Origem: {SOURCE_LABEL[origin.source]}. Primeiro contato em {shortDate(origin.createdAt)}
                {procedureOf(data, origin.procedureId) ? `, com interesse em ${procedureOf(data, origin.procedureId)!.name}` : ""}.
                {patient.firstVisitAt
                  ? ` Primeiro atendimento ${plural(daysFrom(origin.createdAt, patient.firstVisitAt), "dia", "dias")} depois.`
                  : ""}
              </p>
            ) : (
              <p className={styles.note}>Cadastrado direto como paciente, sem passar por Vendas.</p>
            )}
          </section>

          <section aria-labelledby="automacoes">
            <h3 id="automacoes" className={styles.label}>
              Automações
            </h3>
            {automations.length ? (
              <ul className={styles.history}>
                {automations.map((a) => (
                  <li key={a.name}>
                    <span>{a.text}</span>
                    <span className={styles.when}>{a.active ? "ativa" : "pausada"}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={styles.fine}>Nenhuma automação para {name} agora.</p>
            )}
          </section>

          <section aria-labelledby="observacoes">
            <h3 id="observacoes" className={styles.label}>
              Observações
            </h3>
            <p className={styles.note}>{patient.notes || "—"}</p>
          </section>
        </div>
      </div>

      <div className={styles.actions}>
        {step.kind === "agendado" || step.kind === "em_dia" || step.kind === "orcamento" ? (
          <button type="button" className={styles.primary} onClick={() => setMode("agendar")}>
            Agendar
          </button>
        ) : null}
        <button type="button" className={styles.secondary} onClick={() => setMode("venda")}>
          Novo orçamento
        </button>
        {editable ? (
          <button type="button" className={styles.quiet} onClick={() => setMode("editar")}>
            Editar
          </button>
        ) : null}
        {editable ? (
          <DeleteButton
            confirm="Excluir paciente e seus agendamentos"
            pending={pending}
            onDelete={() => write(() => deletePatient(patient.id), onDone)}
          />
        ) : null}
      </div>
      <FormError error={error} />
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
      <Field label="Observações">
        <textarea className={styles.input} name="notes" maxLength={1000} defaultValue={patient?.notes} />
      </Field>
      <p className={styles.fine}>Só observações comerciais e de atendimento. Nada de prontuário ou dado clínico.</p>
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

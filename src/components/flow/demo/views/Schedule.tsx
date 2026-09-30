"use client";

import Link from "next/link";
import { useState } from "react";

import {
  addToWaitlist,
  book,
  deleteAppointment,
  removeFromWaitlist,
  setAppointmentStatus,
  type Result,
} from "@/lib/flow/actions";
import { capital, dayAt, dayLabel, daysFrom, hour, plural, shortDate, units, weekday } from "@/lib/flow/format";
import {
  daySlots,
  procedureOf,
  professionals,
  SLOT_TIMES,
  slotCandidates,
  slotTime,
  WEEK_DAYS,
  weekStart,
  type Slot,
} from "@/lib/flow/insights";
import { LEAD_SOURCES, type Appointment, type AppointmentStatus, type FlowData, type ID, type LeadSource } from "@/lib/flow/types";
import { APPOINTMENT_LABEL, PERIOD_LABEL, SOURCE_LABEL, viewHref } from "../copy";
import { DeleteButton, Field, FocusLink, FormError, Intro, useWrite } from "../forms";
import { Sheet } from "../Sheet";
import { useFlow, useFocus, type Booking } from "../store";
import styles from "../ui.module.css";

/*
  The clinic's agenda: a day or a week, hours down the side, one card per
  booking with its status, a filter by professional. A free hour books in
  two taps; a booking is confirmed, finished, marked as a no-show or
  rescheduled from its card. The waiting list sits beside it.
*/

/** What the booking form opens with: a time, a person, a procedure, a booking to replace. */
export type Draft = Partial<Omit<Booking, "person">>;

const time = (iso: string) => iso.slice(11, 16);
const firstName = (name = "") => name.split(" ")[0];
/** "Ana Lima" to "Ana L.": what fits in a week's cell. */
const shortName = (name = "") => {
  const [first, ...rest] = name.split(" ");
  return rest.length ? `${first} ${rest.at(-1)!.charAt(0)}.` : first;
};

/** The first free hour from now, in a part of the day if one is wanted. */
function firstFree(data: FlowData, period?: "manha" | "tarde") {
  for (let day = 0; day <= 30; day++) {
    const slot = daySlots(data, day).find(
      (s) => s.status !== "ocupado" && s.startsAt > data.now && (!period || (Number(time(s.startsAt).slice(0, 2)) < 12) === (period === "manha")),
    );
    if (slot) return slot.startsAt;
  }
  return slotTime(data, 1, 9, 0);
}

export function Schedule() {
  const { data, live } = useFlow();
  const focus = useFocus("agenda");
  const [mode, setMode] = useState<"dia" | "semana">("dia");
  const [day, setDay] = useState(focus?.day ?? 0);
  const [week, setWeek] = useState(0);
  const [pro, setPro] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [managing, setManaging] = useState<ID | null>(null);
  const [waiting, setWaiting] = useState(false);
  const appointment = data.appointments.find((a) => a.id === managing);
  const pros = professionals(data);
  // Cancellations tomorrow: each one is an hour the Flow can fill.
  const freed = daySlots(data, 1).filter((s) => s.status === "cancelado");

  const dayIso = slotTime(data, day, 0, 0);
  const start = weekStart(data, week);
  const title =
    mode === "dia"
      ? day === 0
        ? `Hoje · ${dayLabel(dayIso)}`
        : day === 1
          ? `Amanhã · ${dayLabel(dayIso)}`
          : day === -1
            ? `Ontem · ${dayLabel(dayIso)}`
            : capital(dayLabel(dayIso))
      : `${shortDate(slotTime(data, start, 0, 0))} – ${shortDate(slotTime(data, start + WEEK_DAYS - 1, 0, 0))}`;
  const atToday = mode === "dia" ? day === 0 : week === 0;
  const step = (by: number) => (mode === "dia" ? setDay(day + by) : setWeek(week + by));

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <h1 className={styles.title}>Agenda</h1>
        <p className={styles.lead}>
          O dia e a semana da clínica. Toque num horário livre para agendar; toque num atendimento para confirmar, finalizar
          ou remarcar.
        </p>
      </header>

      {live && data.appointments.length === 0 ? (
        <Intro title="Primeiro agendamento">
          Escolha um horário livre e marque o primeiro atendimento. Quem agenda vira paciente na hora, e tudo o que acontece
          aqui vai para a ficha dele.
        </Intro>
      ) : null}

      {freed.map((slot) => {
        const candidates = slotCandidates(data, slot.startsAt);
        return (
          <div key={slot.startsAt} className={styles.alert} role="status">
            <p className={styles.alertTitle}>Horário disponível amanhã às {hour(slot.startsAt)}.</p>
            <p>
              {candidates.length
                ? `Da lista de espera, quem pode ocupar: ${candidates.map((c) => `${c.patient.name} (${c.procedure.name})`).join(", ")}.`
                : "Ninguém da lista de espera prefere este período; o Flow sugere pacientes com retorno próximo."}
            </p>
            <div className={styles.actions}>
              <button type="button" className={styles.primary} onClick={() => setDraft({ startsAt: slot.startsAt })}>
                Agendar neste horário
              </button>
              <FocusLink focus={{ to: "opportunity", kind: "open_slot" }}>
                Ver a oportunidade <span aria-hidden="true">→</span>
              </FocusLink>
            </div>
          </div>
        );
      })}

      <div className={styles.calBar}>
        <div className={styles.segmented} role="group" aria-label="Ver a agenda por">
          <button type="button" aria-pressed={mode === "dia"} onClick={() => setMode("dia")}>
            Dia
          </button>
          <button type="button" aria-pressed={mode === "semana"} onClick={() => setMode("semana")}>
            Semana
          </button>
        </div>
        <div className={styles.stepper}>
          <button
            type="button"
            className={styles.stepButton}
            onClick={() => step(-1)}
            aria-label={mode === "dia" ? "Dia anterior" : "Semana anterior"}
          >
            ‹
          </button>
          <p className={styles.calTitle} aria-live="polite">
            {title}
          </p>
          <button
            type="button"
            className={styles.stepButton}
            onClick={() => step(1)}
            aria-label={mode === "dia" ? "Próximo dia" : "Próxima semana"}
          >
            ›
          </button>
          <button
            type="button"
            className={styles.quiet}
            disabled={atToday}
            onClick={() => {
              setDay(0);
              setWeek(0);
            }}
          >
            Hoje
          </button>
        </div>
        {pros.length > 1 ? (
          <label className={styles.proFilter}>
            <span className="sr-only">Profissional</span>
            <select className={styles.input} value={pro} onChange={(event) => setPro(event.target.value)}>
              <option value="">Toda a equipe</option>
              {pros.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      <ul className={styles.legend} aria-label="Legenda">
        {(["confirmado", "agendado", "concluido", "faltou"] as const).map((status) => (
          <li key={status} data-status={status}>
            {APPOINTMENT_LABEL[status]}
          </li>
        ))}
        <li data-status="livre">Horário livre</li>
      </ul>

      <div className={styles.calendar} data-mode={mode}>
        <div className={styles.calMain}>
          {mode === "dia" ? (
            <DayView offset={day} pro={pro} onBook={(startsAt) => setDraft({ startsAt })} onOpen={setManaging} />
          ) : (
            <WeekView start={start} pro={pro} onBook={(startsAt) => setDraft({ startsAt })} onOpen={setManaging} />
          )}
        </div>
        <Waitlist onBook={setDraft} onAdd={live ? () => setWaiting(true) : undefined} />
      </div>

      <Sheet
        open={draft !== null}
        onClose={() => setDraft(null)}
        title={draft?.replaces ? "Remarcar" : "Novo agendamento"}
        kicker="Agenda"
      >
        {draft ? <BookingForm draft={draft} onDone={() => setDraft(null)} /> : null}
      </Sheet>
      <Sheet
        open={Boolean(appointment)}
        onClose={() => setManaging(null)}
        title={data.patients.find((p) => p.id === appointment?.patientId)?.name ?? ""}
        kicker={appointment ? APPOINTMENT_LABEL[appointment.status] : undefined}
      >
        {appointment ? (
          <AppointmentDetail
            key={appointment.id}
            appointment={appointment}
            onDone={() => setManaging(null)}
            onReschedule={() => {
              setManaging(null);
              setDraft({
                patientId: appointment.patientId,
                procedureId: appointment.procedureId,
                professionalId: appointment.professionalId,
                replaces: appointment.status === "cancelado" ? undefined : appointment.id,
              });
            }}
          />
        ) : null}
      </Sheet>
      {live ? (
        <Sheet open={waiting} onClose={() => setWaiting(false)} title="Lista de espera" kicker="Agenda">
          <WaitlistForm onDone={() => setWaiting(false)} />
        </Sheet>
      ) : null}
    </div>
  );
}

interface CalendarProps {
  pro: string;
  onBook: (startsAt: string) => void;
  onOpen: (id: ID) => void;
}

/** What a slot shows: a booking, a booking of someone else's (under the filter), free, or nothing (past). */
function slotView(data: FlowData, slot: Slot, pro: string) {
  const a = slot.status === "ocupado" ? slot.appointment : undefined;
  if (a && pro && a.professionalId !== pro) return { kind: "outro" as const, appointment: a };
  if (a) return { kind: "atendimento" as const, appointment: a };
  if (slot.startsAt < data.now) return { kind: "passou" as const };
  return { kind: "livre" as const };
}

function DayView({ offset, pro, onBook, onOpen }: CalendarProps & { offset: number }) {
  const { data } = useFlow();
  const slots = daySlots(data, offset);
  const shown = slots.map((slot) => ({ slot, view: slotView(data, slot, pro) }));
  const booked = shown.filter((s) => s.view.kind === "atendimento").map((s) => s.view.appointment!);
  const count = (status: AppointmentStatus) => booked.filter((a) => a.status === status).length;
  const free = shown.filter((s) => s.view.kind === "livre").length;

  return (
    <>
      <p className={styles.calSummary}>
        {plural(booked.length, "atendimento", "atendimentos")}
        {count("confirmado") ? ` · ${plural(count("confirmado"), "confirmado", "confirmados")}` : ""}
        {count("agendado") ? ` · ${count("agendado")} aguardando confirmação` : ""}
        {count("concluido") ? ` · ${plural(count("concluido"), "finalizado", "finalizados")}` : ""}
        {count("faltou") ? ` · ${count("faltou")} ${count("faltou") === 1 ? "falta" : "faltas"}` : ""}
        {free ? ` · ${plural(free, "horário livre", "horários livres")}` : ""}
      </p>
      <ol className={styles.dayList}>
        {shown.map(({ slot, view }) => {
          const cancelled = slot.status === "cancelado" ? data.patients.find((p) => p.id === slot.appointment?.patientId) : undefined;
          return (
            <li key={slot.startsAt} className={styles.dayRow}>
              <span className={styles.time}>{hour(slot.startsAt)}</span>
              {view.kind === "atendimento" ? (
                <AppointmentCard appointment={view.appointment} onOpen={() => onOpen(view.appointment.id)} />
              ) : view.kind === "outro" ? (
                <p className={styles.busy}>
                  Ocupado · {data.users.find((u) => u.id === view.appointment.professionalId)?.name ?? "outro profissional"}
                </p>
              ) : view.kind === "livre" ? (
                <button type="button" className={styles.freeSlot} onClick={() => onBook(slot.startsAt)}>
                  <strong>Horário livre</strong>
                  <span>
                    {cancelled ? `${firstName(cancelled.name)} cancelou · ` : ""}Agendar <span aria-hidden="true">+</span>
                  </span>
                </button>
              ) : (
                <p className={styles.busy}>{cancelled ? `Cancelado · ${cancelled.name}` : "Sem atendimento"}</p>
              )}
            </li>
          );
        })}
      </ol>
    </>
  );
}

function WeekView({ start, pro, onBook, onOpen }: CalendarProps & { start: number }) {
  const { data } = useFlow();
  // Monday to Saturday; Sunday too, when something is booked on it.
  const sunday = daySlots(data, start + WEEK_DAYS).some((s) => s.status === "ocupado");
  const days = Array.from({ length: WEEK_DAYS + (sunday ? 1 : 0) }, (_, i) => ({
    offset: start + i,
    slots: daySlots(data, start + i),
  }));
  const times = [...new Set(days.flatMap((d) => d.slots.map((s) => time(s.startsAt))))].sort();
  const booked = days.flatMap((d) => d.slots.map((s) => slotView(data, s, pro))).filter((v) => v.kind === "atendimento").length;

  return (
    <>
      <p className={styles.calSummary}>{plural(booked, "atendimento na semana", "atendimentos na semana")}</p>
      <div className={styles.weekWrap}>
        <table className={styles.week}>
          <thead>
            <tr>
              <th scope="col">
                <span className="sr-only">Horário</span>
              </th>
              {days.map((d) => {
                const [name, date] = weekday(slotTime(data, d.offset, 0, 0));
                return (
                  <th key={d.offset} scope="col" aria-current={d.offset === 0 ? "date" : undefined}>
                    <span>{name}</span> <strong>{date}</strong>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {times.map((t) => (
              <tr key={t}>
                <th scope="row">{hour(`2000-01-01T${t}:00.000Z`)}</th>
                {days.map((d) => {
                  const slot = d.slots.find((s) => time(s.startsAt) === t);
                  const view = slot ? slotView(data, slot, pro) : null;
                  return (
                    <td key={d.offset}>
                      {!slot || !view ? null : view.kind === "atendimento" ? (
                        <AppointmentCard compact appointment={view.appointment} onOpen={() => onOpen(view.appointment.id)} />
                      ) : view.kind === "outro" ? (
                        <span className={styles.busy}>Ocupado</span>
                      ) : view.kind === "livre" ? (
                        <button
                          type="button"
                          className={styles.freeCell}
                          onClick={() => onBook(slot.startsAt)}
                          aria-label={`Agendar ${dayLabel(slot.startsAt)} às ${hour(slot.startsAt)}`}
                        >
                          Livre
                        </button>
                      ) : null}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function AppointmentCard({ appointment: a, compact, onOpen }: { appointment: Appointment; compact?: boolean; onOpen: () => void }) {
  const { data } = useFlow();
  const patient = data.patients.find((p) => p.id === a.patientId);
  const procedure = procedureOf(data, a.procedureId);
  const professional = data.users.find((u) => u.id === a.professionalId);
  return (
    <button
      type="button"
      className={styles.apt}
      data-status={a.status}
      data-compact={compact ? "" : undefined}
      onClick={onOpen}
    >
      <span className={styles.aptName}>{compact ? shortName(patient?.name) : patient?.name}</span>
      <span className={styles.aptMeta}>
        {procedure?.name}
        {compact ? "" : ` · ${a.durationMin} min${professional ? ` · ${professional.name}` : ""}`}
      </span>
      <span className={compact ? "sr-only" : styles.aptStatus}>{APPOINTMENT_LABEL[a.status]}</span>
    </button>
  );
}

function Waitlist({ onBook, onAdd }: { onBook: (draft: Draft) => void; onAdd?: () => void }) {
  const { data, dispatch, live } = useFlow();
  const { pending, error, write } = useWrite();
  const [invited, setInvited] = useState<ID[]>([]);

  return (
    <section className={styles.waitBox} aria-labelledby="espera">
      <header className={styles.boxHead}>
        <h2 id="espera" className={styles.label}>
          Lista de espera
        </h2>
        <span>{data.waitlist.length}</span>
      </header>
      <p className={styles.fine}>Quem quer um horário antes. Quando um horário abre, o Flow sugere quem pode ocupar.</p>
      {data.waitlist.length ? (
        <ol className={styles.waitlist}>
          {data.waitlist.map((w) => {
            const patient = data.patients.find((p) => p.id === w.patientId);
            const procedure = procedureOf(data, w.procedureId);
            const done = invited.includes(w.id);
            return (
              <li key={w.id}>
                <strong>{patient?.name}</strong>
                <span>
                  {procedure?.name} · prefere {PERIOD_LABEL[w.period]} · há {plural(-daysFrom(data.now, w.createdAt), "dia", "dias")}
                </span>
                <div className={styles.actions}>
                  <button
                    type="button"
                    className={styles.secondary}
                    onClick={() => onBook({ patientId: w.patientId, procedureId: w.procedureId, waitlistId: w.id })}
                  >
                    Agendar
                  </button>
                  {done ? (
                    <span className={styles.done}>Convite preparado</span>
                  ) : (
                    <button
                      type="button"
                      className={styles.quiet}
                      onClick={() => {
                        setInvited((list) => [...list, w.id]);
                        dispatch({ type: "note", text: `Convite de horário preparado para ${patient?.name}. Não enviado.` });
                      }}
                    >
                      Preparar convite
                    </button>
                  )}
                  {live ? (
                    <button type="button" className={styles.quiet} disabled={pending} onClick={() => write(() => removeFromWaitlist(w.id))}>
                      Tirar da lista
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className={styles.fine}>Ninguém esperando agora.</p>
      )}
      <FormError error={error} />
      {onAdd ? (
        <button type="button" className={styles.secondary} onClick={onAdd}>
          Adicionar à lista
        </button>
      ) : null}
    </section>
  );
}

/**
 * Booking, from anywhere: a free hour on the agenda, a contact in Vendas, a
 * patient's record, the waiting list, a reschedule. The person may be new:
 * they become a patient, and their origin is kept.
 */
export function BookingForm({ draft, onDone }: { draft: Draft; onDone: () => void }) {
  const { data, dispatch, live, base } = useFlow();
  const { pending, error, submit } = useWrite();
  const lead = draft.leadId ? data.leads.find((l) => l.id === draft.leadId) : undefined;
  const fixed = data.patients.find((p) => p.id === (draft.patientId ?? lead?.patientId));
  const pros = professionals(data);
  const entry = data.waitlist.find((w) => w.id === draft.waitlistId);
  const [first] = useState(() => draft.startsAt ?? firstFree(data, entry?.period));
  const [date, setDate] = useState(first.slice(0, 10));
  const [at, setAt] = useState(time(first));
  const [who, setWho] = useState(fixed || lead ? "" : data.patients.length ? "" : "novo");
  const [procedureId, setProcedureId] = useState(draft.procedureId ?? lead?.procedureId ?? "");
  const [waitlistId, setWaitlistId] = useState(draft.waitlistId ?? "");
  const [professionalId, setProfessionalId] = useState(draft.professionalId ?? (pros.length === 1 ? pros[0].id : ""));

  const today = data.now.slice(0, 10);
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(date));
  const startsAt = `${date}T${at}:00.000Z`;
  const slots = valid ? daySlots(data, daysFrom(data.now, `${date}T00:00:00.000Z`)) : [];
  const busy = (t: string) =>
    slots.some((s) => s.status === "ocupado" && time(s.startsAt) === t && s.appointment?.id !== draft.replaces);
  const gone = (t: string) => date === today && `${date}T${t}:00.000Z` < data.now;
  const times = [...new Set([...SLOT_TIMES.map(([h, m]) => `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`), at])].sort();
  const candidates = !lead && !fixed && who === "" && valid ? slotCandidates(data, startsAt) : [];

  if (!data.procedures.length) {
    return (
      <p className={styles.fine}>
        Para agendar, cadastre antes pelo menos um{" "}
        <Link href={viewHref("procedimentos", base)} onClick={onDone}>
          procedimento
        </Link>
        : é dele que vêm a duração, o preço e o retorno.
      </p>
    );
  }

  // The demo books in memory, with the same checks the server makes.
  const demoBook = async (form: FormData): Promise<Result> => {
    const name = String(form.get("name") ?? "").trim();
    if (!valid || date < today) return { error: "Escolha um dia a partir de hoje." };
    if (busy(at)) return { error: "Este horário já está ocupado." };
    if (!procedureId) return { error: "Escolha o procedimento." };
    if (!lead && !fixed && !who) return { error: "Escolha o paciente." };
    if (who === "novo" && !name) return { error: "Informe o nome." };
    dispatch({
      type: "book",
      booking: {
        procedureId,
        startsAt,
        professionalId: professionalId || undefined,
        leadId: lead?.id,
        patientId: lead ? undefined : (fixed?.id ?? (who !== "novo" ? who : undefined)),
        person:
          who === "novo"
            ? { name, phone: String(form.get("phone") ?? "").trim(), source: String(form.get("source")) as LeadSource }
            : undefined,
        waitlistId: waitlistId || undefined,
        replaces: draft.replaces,
      },
    });
    return {};
  };

  return (
    <form className={styles.form} onSubmit={submit(live ? book : demoBook, onDone)}>
      <input type="hidden" name="leadId" value={lead?.id ?? ""} />
      <input type="hidden" name="replaces" value={draft.replaces ?? ""} />
      <input type="hidden" name="waitlistId" value={waitlistId} />

      {lead ? (
        <p className={styles.bookFor}>
          <span className={styles.label}>Para</span>
          <strong>{lead.name}</strong>
          <span>
            {fixed ? "Já é paciente." : "Vira paciente ao agendar, com a origem e o orçamento que estão em Vendas."}
          </span>
        </p>
      ) : fixed ? (
        <p className={styles.bookFor}>
          <input type="hidden" name="patientId" value={fixed.id} />
          <span className={styles.label}>Paciente</span>
          <strong>{fixed.name}</strong>
        </p>
      ) : (
        <Field label="Paciente">
          <select
            className={styles.input}
            name="patientId"
            value={who}
            required
            onChange={(event) => {
              setWho(event.target.value);
              setWaitlistId("");
            }}
          >
            <option value="" disabled>
              Escolha o paciente
            </option>
            <option value="novo">+ Pessoa nova</option>
            {[...data.patients]
              .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </select>
        </Field>
      )}

      {who === "novo" && !lead && !fixed ? (
        <>
          <Field label="Nome">
            <input className={styles.input} name="name" required maxLength={200} autoComplete="off" />
          </Field>
          <Field label="Telefone">
            <input className={styles.input} name="phone" type="tel" maxLength={40} />
          </Field>
          <Field label="Como conheceu a clínica">
            <select className={styles.input} name="source" defaultValue="whatsapp">
              {LEAD_SOURCES.map((source) => (
                <option key={source} value={source}>
                  {SOURCE_LABEL[source]}
                </option>
              ))}
            </select>
          </Field>
          <p className={styles.fine}>A pessoa vira paciente e fica registrada em Vendas como agendada, com a origem.</p>
        </>
      ) : null}

      {candidates.length ? (
        <div className={styles.suggestion}>
          <p className={styles.label}>Lista de espera para este período</p>
          <ul className={styles.pickList}>
            {candidates.map((c) => (
              <li key={c.entry.id}>
                <span>
                  {c.patient.name} · {c.procedure.name}
                </span>
                <button
                  type="button"
                  className={styles.quiet}
                  onClick={() => {
                    setWho(c.patient.id);
                    setProcedureId(c.procedure.id);
                    setWaitlistId(c.entry.id);
                  }}
                >
                  Usar
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <Field label="Procedimento">
        <select
          className={styles.input}
          name="procedureId"
          value={procedureId}
          required
          onChange={(event) => setProcedureId(event.target.value)}
        >
          <option value="" disabled>
            Escolha o procedimento
          </option>
          {data.procedures.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} · {p.durationMin} min
            </option>
          ))}
        </select>
      </Field>

      <div className={styles.twoFields}>
        <Field label="Dia">
          <input
            className={styles.input}
            type="date"
            name="date"
            required
            min={today}
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
        </Field>
        <Field label="Horário">
          <select className={styles.input} name="time" value={at} required onChange={(event) => setAt(event.target.value)}>
            {times.map((t) => (
              <option key={t} value={t} disabled={busy(t) || gone(t)}>
                {hour(`2000-01-01T${t}:00.000Z`)}
                {busy(t) ? " · ocupado" : gone(t) ? " · já passou" : ""}
              </option>
            ))}
          </select>
        </Field>
      </div>

      {pros.length ? (
        <Field label="Profissional">
          <select
            className={styles.input}
            name="professionalId"
            value={professionalId}
            onChange={(event) => setProfessionalId(event.target.value)}
          >
            <option value="">A definir</option>
            {pros.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
      ) : null}

      <FormError error={error} />
      <div className={styles.actions}>
        <button type="submit" className={styles.primary} disabled={pending}>
          {draft.replaces ? "Remarcar" : "Agendar"}
        </button>
        <button type="button" className={styles.quiet} onClick={onDone}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

/**
 * One booking and what can happen to it. Finishing is where the modules
 * meet, so the sheet says what it will do: the stock it takes, the return
 * it sets, the record it joins.
 */
function AppointmentDetail({
  appointment: a,
  onDone,
  onReschedule,
}: {
  appointment: Appointment;
  onDone: () => void;
  onReschedule: () => void;
}) {
  const { data, dispatch, live } = useFlow();
  const { pending, error, write } = useWrite();
  const patient = data.patients.find((p) => p.id === a.patientId);
  const procedure = procedureOf(data, a.procedureId);
  const professional = data.users.find((u) => u.id === a.professionalId);
  const uses = data.procedureProducts.filter((pp) => pp.procedureId === a.procedureId);
  const open = a.status === "agendado" || a.status === "confirmado";
  // Done or missed can only be said on the day or after it.
  const due = a.startsAt.slice(0, 10) <= data.now.slice(0, 10);
  const set = (status: AppointmentStatus) => {
    if (live) return write(() => setAppointmentStatus(a.id, status), onDone);
    dispatch({ type: "appointment", id: a.id, status });
    onDone();
  };

  return (
    <>
      <dl className={styles.fields}>
        <div>
          <dt>Quando</dt>
          <dd>{capital(dayAt(data.now, a.startsAt))}</dd>
        </div>
        <div>
          <dt>Procedimento</dt>
          <dd>
            {procedure?.name} · {a.durationMin} min
          </dd>
        </div>
        <div>
          <dt>Profissional</dt>
          <dd>{professional?.name ?? "A definir"}</dd>
        </div>
        <div>
          <dt>Telefone</dt>
          <dd>{patient?.phone || "—"}</dd>
        </div>
      </dl>

      {open && procedure ? (
        <div className={styles.suggestion}>
          <p className={styles.label}>Ao finalizar, o Flow</p>
          <ul className={styles.effects}>
            {uses.length ? (
              uses.map((use) => {
                const product = data.products.find((p) => p.id === use.productId);
                return product ? (
                  <li key={use.productId}>
                    Dá baixa de {units(use.quantity, product.unit)} de {product.name}
                  </li>
                ) : null;
              })
            ) : (
              <li>Não mexe no estoque: nenhum produto ligado a este procedimento</li>
            )}
            <li>Sugere o retorno para {procedure.returnDays} dias depois</li>
            <li>Registra o atendimento na ficha de {firstName(patient?.name)}</li>
          </ul>
        </div>
      ) : null}

      <div className={styles.actions}>
        {a.status === "agendado" ? (
          <button type="button" className={styles.primary} disabled={pending} onClick={() => set("confirmado")}>
            Confirmar presença
          </button>
        ) : null}
        {open && due ? (
          <button
            type="button"
            className={a.status === "confirmado" ? styles.primary : styles.secondary}
            disabled={pending}
            onClick={() => set("concluido")}
          >
            Finalizar atendimento
          </button>
        ) : null}
        {open && due ? (
          <button type="button" className={styles.secondary} disabled={pending} onClick={() => set("faltou")}>
            Faltou
          </button>
        ) : null}
        {a.status === "faltou" || a.status === "cancelado" ? (
          <button type="button" className={styles.primary} disabled={pending} onClick={onReschedule}>
            {a.status === "faltou" ? "Remarcar" : "Agendar de novo"}
          </button>
        ) : null}
        {open ? (
          <button type="button" className={styles.quiet} disabled={pending} onClick={onReschedule}>
            Remarcar
          </button>
        ) : null}
        {open ? (
          <button type="button" className={styles.quiet} disabled={pending} onClick={() => set("cancelado")}>
            Cancelar agendamento
          </button>
        ) : null}
        {a.status === "concluido" ? (
          <button type="button" className={styles.quiet} disabled={pending} onClick={() => set("confirmado")}>
            Desfazer finalização
          </button>
        ) : null}
        {a.status === "faltou" ? (
          <button type="button" className={styles.quiet} disabled={pending} onClick={() => set("confirmado")}>
            Desfazer falta
          </button>
        ) : null}
      </div>
      <FormError error={error} />

      <FocusLink focus={{ to: "patient", id: a.patientId }}>
        Abrir a ficha de {firstName(patient?.name)} <span aria-hidden="true">→</span>
      </FocusLink>

      {live ? (
        <div className={styles.actions}>
          <DeleteButton
            confirm="Excluir este agendamento"
            pending={pending}
            onDelete={() => write(() => deleteAppointment(a.id), onDone)}
          />
        </div>
      ) : (
        <p className={styles.fine}>Na demo, as mudanças valem até recarregar a página.</p>
      )}
    </>
  );
}

function WaitlistForm({ onDone }: { onDone: () => void }) {
  const { data } = useFlow();
  const { pending, error, submit } = useWrite();
  if (!data.patients.length || !data.procedures.length) {
    return <p className={styles.fine}>Para usar a lista de espera, cadastre antes um paciente e um procedimento.</p>;
  }
  return (
    <form className={styles.form} onSubmit={submit(addToWaitlist, onDone)}>
      <Field label="Paciente">
        <select className={styles.input} name="patientId" required defaultValue="">
          <option value="" disabled>
            Escolha o paciente
          </option>
          {[...data.patients]
            .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
        </select>
      </Field>
      <Field label="Procedimento">
        <select className={styles.input} name="procedureId" required defaultValue="">
          <option value="" disabled>
            Escolha o procedimento
          </option>
          {data.procedures.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Prefere">
        <select className={styles.input} name="period" defaultValue="tarde">
          <option value="manha">Manhã</option>
          <option value="tarde">Tarde</option>
        </select>
      </Field>
      <FormError error={error} />
      <div className={styles.actions}>
        <button type="submit" className={styles.primary} disabled={pending}>
          Adicionar
        </button>
        <button type="button" className={styles.quiet} onClick={onDone}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

"use client";

import Link from "next/link";
import { useState, type CSSProperties } from "react";

import {
  addToWaitlist,
  book,
  deleteAppointment,
  finishAppointment,
  removeFromWaitlist,
  saveDeposit,
  setAppointmentStatus,
  setDepositPaid,
  visitSupplies,
  type Result,
} from "@/lib/flow/actions";
import { brl, capital, dayAt, dayLabel, daysFrom, hour, plural, relDay, shortDate, units, weekday } from "@/lib/flow/format";
import {
  daySlots,
  opensOn,
  procedureOf,
  professionals,
  slotMatches,
  slotTime,
  slotTimes,
  WEEK_DAYS,
  weekStart,
  type Slot,
} from "@/lib/flow/insights";
import {
  LEAD_SOURCES,
  type Appointment,
  type AppointmentStatus,
  type AppointmentSupply,
  type FlowData,
  type ID,
  type LeadSource,
} from "@/lib/flow/types";
import { APPOINTMENT_LABEL, PERIOD_LABEL, SOURCE_LABEL, viewHref } from "../copy";
import { DeleteButton, Field, FocusLink, FormError, Intro, Prepared, Soon, reais, useWrite } from "../forms";
import { Sheet } from "../Sheet";
import { useFlow, useFocus, type Booking } from "../store";
import styles from "../ui.module.css";

/*
  The clinic's agenda: a day or a week, hours down the side, one card per
  booking with its status, a filter by professional. The hours and days are
  the clinic's own (onboarding, Configurações). A free hour books in two
  taps; a booking is confirmed, finished, marked as a no-show or rescheduled
  from its card. When a cancellation opens an hour, the Pulse ranks who could
  take it and prepares the invite. The waiting list sits beside it.
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
  const { data, live, editable, can } = useFlow();
  const focus = useFocus("agenda");
  const [mode, setMode] = useState<"dia" | "semana" | "mes">("dia");
  const [day, setDay] = useState(focus?.day ?? 0);
  const [week, setWeek] = useState(0);
  const [month, setMonth] = useState(0);
  const [pro, setPro] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [managing, setManaging] = useState<ID | null>(null);
  const [waiting, setWaiting] = useState(false);
  // Booking, rescheduling and the waiting list are the front office's; a professional reads their agenda and records the visits.
  const book = can.book ? (startsAt: string) => setDraft({ startsAt }) : undefined;
  const appointment = data.appointments.find((a) => a.id === managing);
  const pros = professionals(data);
  // Cancellations still ahead, today and tomorrow: each one is an hour the Pulse can fill.
  const freed = [0, 1].flatMap((offset) =>
    daySlots(data, offset).filter((s) => s.status === "cancelado" && s.startsAt > data.now),
  );

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
      : mode === "semana"
        ? `${shortDate(slotTime(data, start, 0, 0))} – ${shortDate(slotTime(data, start + WEEK_DAYS - 1, 0, 0))}`
        : monthLabel(data.now, month);
  const atToday = mode === "dia" ? day === 0 : mode === "semana" ? week === 0 : month === 0;
  const step = (by: number) => (mode === "dia" ? setDay(day + by) : mode === "semana" ? setWeek(week + by) : setMonth(month + by));

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <h1 className={styles.title}>Agenda</h1>
        <p className={styles.lead}>
          O dia, a semana e o mês da clínica. Toque num horário livre para agendar; toque num atendimento para confirmar,
          finalizar ou remarcar.
        </p>
      </header>

      {live && data.appointments.length === 0 ? (
        <Intro title="Primeiro agendamento">
          Escolha um horário livre e marque o primeiro atendimento. Quem agenda vira paciente na hora, e tudo o que acontece
          aqui vai para a ficha dele.
        </Intro>
      ) : null}

      {(can.book ? freed : []).map((slot) => {
        const who = data.patients.find((p) => p.id === slot.appointment?.patientId);
        const matches = slotMatches(data, slot.startsAt);
        return (
          <section key={slot.startsAt} className={styles.alert} aria-label={`Horário livre ${relDay(data.now, slot.startsAt)} às ${hour(slot.startsAt)}`}>
            <p className={styles.alertTitle}>
              {capital(relDay(data.now, slot.startsAt))} às {hour(slot.startsAt)}: {who ? `${firstName(who.name)} cancelou` : "houve um cancelamento"} e
              o horário está livre.
            </p>
            <p className={styles.matchLead}>
              <span className="pulse-dot" aria-hidden="true" />
              {matches.length
                ? `Pulse encontrou ${plural(matches.length, "paciente compatível", "pacientes compatíveis")}`
                : "Ninguém da lista de espera ou com retorno próximo combina com este horário."}
            </p>
            <SlotInvites startsAt={slot.startsAt} onBook={setDraft} />
            <div className={styles.actions}>
              <button type="button" className={styles.quiet} onClick={() => setDraft({ startsAt: slot.startsAt })}>
                Agendar outra pessoa
              </button>
              <FocusLink focus={{ to: "opportunity", kind: "open_slot" }}>
                Ver todos os horários livres <span aria-hidden="true">→</span>
              </FocusLink>
            </div>
          </section>
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
          <button type="button" aria-pressed={mode === "mes"} onClick={() => setMode("mes")}>
            Mês
          </button>
        </div>
        <div className={styles.stepper}>
          <button
            type="button"
            className={styles.stepButton}
            onClick={() => step(-1)}
            aria-label={mode === "dia" ? "Dia anterior" : mode === "semana" ? "Semana anterior" : "Mês anterior"}
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
            aria-label={mode === "dia" ? "Próximo dia" : mode === "semana" ? "Próxima semana" : "Próximo mês"}
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
              setMonth(0);
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
          {mode === "mes" ? (
            <MonthView
              month={month}
              pro={pro}
              onDay={(offset) => {
                setDay(offset);
                setMode("dia");
              }}
            />
          ) : mode === "dia" ? (
            <DayView offset={day} pro={pro} onBook={book} onOpen={setManaging} />
          ) : (
            <WeekView start={start} pro={pro} onBook={book} onOpen={setManaging} />
          )}
        </div>
        {can.book ? <Waitlist onBook={setDraft} onAdd={editable ? () => setWaiting(true) : undefined} /> : null}
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
  /** Absent for whoever may not book: a free hour is only shown. */
  onBook?: (startsAt: string) => void;
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
  const closed = !opensOn(data, slotTime(data, offset, 0, 0));
  const suggested = (startsAt: string) => {
    const n = slotMatches(data, startsAt).length;
    return n ? `Pulse sugere ${plural(n, "paciente", "pacientes")} · ` : "";
  };

  return (
    <>
      <p className={styles.calSummary}>
        {plural(booked.length, "atendimento", "atendimentos")}
        {count("confirmado") ? ` · ${plural(count("confirmado"), "confirmado", "confirmados")}` : ""}
        {count("agendado") ? ` · ${count("agendado")} aguardando confirmação` : ""}
        {count("concluido") ? ` · ${plural(count("concluido"), "finalizado", "finalizados")}` : ""}
        {count("faltou") ? ` · ${count("faltou")} ${count("faltou") === 1 ? "falta" : "faltas"}` : ""}
        {free ? ` · ${plural(free, "horário livre", "horários livres")}` : ""}
        {closed ? " · a clínica não atende neste dia" : ""}
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
              ) : view.kind === "livre" && !onBook ? (
                <p className={styles.busy}>Horário livre</p>
              ) : view.kind === "livre" && onBook ? (
                <button type="button" className={styles.freeSlot} onClick={() => onBook(slot.startsAt)}>
                  <strong>Horário livre</strong>
                  <span>
                    {cancelled ? `${firstName(cancelled.name)} cancelou · ` : ""}
                    {suggested(slot.startsAt)}Agendar <span aria-hidden="true">+</span>
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
                      ) : view.kind === "livre" && !onBook ? (
                        <span className={styles.busy}>Livre</span>
                      ) : view.kind === "livre" && onBook ? (
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

const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

/** The first day of the month `offset` months from now, at midnight (the data's clock). */
function monthStart(now: string, offset: number) {
  const n = new Date(now);
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth() + offset, 1));
}

const monthLabel = (now: string, offset: number) => {
  const d = monthStart(now, offset);
  return `${capital(MONTHS[d.getUTCMonth()])} de ${d.getUTCFullYear()}`;
};

/**
 * The month at a glance: each day and how many people come, nothing more. A
 * day opens the day view, where the names and the free hours are.
 */
function MonthView({ month, pro, onDay }: { month: number; pro: string; onDay: (offset: number) => void }) {
  const { data } = useFlow();
  const first = monthStart(data.now, month);
  const length = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  const lead = (first.getUTCDay() + 6) % 7; // Monday first
  const counts = new Map<string, number>();
  for (const a of data.appointments) {
    if (a.status === "cancelado" || (pro && a.professionalId !== pro)) continue;
    const date = a.startsAt.slice(0, 10);
    counts.set(date, (counts.get(date) ?? 0) + 1);
  }
  const busiest = Math.max(1, ...counts.values());
  const days = Array.from({ length }, (_, i) => {
    const iso = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), i + 1)).toISOString();
    return { iso, n: i + 1, count: counts.get(iso.slice(0, 10)) ?? 0, offset: daysFrom(data.now, iso) };
  });
  const total = days.reduce((s, d) => s + d.count, 0);

  return (
    <>
      <p className={styles.calSummary}>{plural(total, "atendimento no mês", "atendimentos no mês")}</p>
      <ol className={styles.month} aria-label={monthLabel(data.now, month)}>
        {WEEK_HEADS.map((h) => (
          <li key={h} className={styles.monthHead} aria-hidden="true">
            {h}
          </li>
        ))}
        {Array.from({ length: lead }, (_, i) => (
          <li key={`v${i}`} aria-hidden="true" />
        ))}
        {days.map((d) => (
          <li key={d.iso}>
            <button
              type="button"
              className={styles.monthDay}
              aria-current={d.offset === 0 ? "date" : undefined}
              data-past={d.offset < 0 ? "" : undefined}
              data-closed={opensOn(data, d.iso) ? undefined : ""}
              style={{ "--load": d.count / busiest } as CSSProperties}
              onClick={() => onDay(d.offset)}
              aria-label={`${dayLabel(d.iso)}: ${plural(d.count, "atendimento", "atendimentos")}`}
            >
              <span className={styles.monthNumber}>{d.n}</span>
              {d.count ? <span className={styles.monthCount}>{d.count}</span> : null}
            </button>
          </li>
        ))}
      </ol>
    </>
  );
}

const WEEK_HEADS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

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

/**
 * Who could take a free hour, best first, and why. Preparing writes the
 * invite; sending it waits for the WhatsApp connection and a person's go.
 */
export function SlotInvites({ startsAt, onBook }: { startsAt: string; onBook?: (draft: Draft) => void }) {
  const { data, access } = useFlow();
  const [prepared, setPrepared] = useState<ID[]>([]);
  const matches = slotMatches(data, startsAt);
  const when = `${relDay(data.now, startsAt)} às ${hour(startsAt)}`;
  if (!matches.length) return null;
  return (
    <ol className={styles.matches}>
      {matches.map((m) => {
        const done = prepared.includes(m.patient.id);
        return (
          <li key={m.patient.id} className={styles.match}>
            <p className={styles.matchName}>
              <strong>{m.patient.name}</strong>
              <span className={styles.matchScore}>{m.score}% compatível</span>
            </p>
            <p className={styles.matchWhy}>
              {m.procedure.name} · {m.reasons.join(" · ")}
            </p>
            {done ? (
              <Prepared
                phone={m.patient.phone}
                text={`Oi ${firstName(m.patient.name)}! Abriu um horário ${when} para ${m.procedure.name}. Quer que eu reserve para você?`}
              >
                {onBook ? (
                  <button
                    type="button"
                    className={styles.quiet}
                    onClick={() => onBook({ startsAt, patientId: m.patient.id, procedureId: m.procedure.id, waitlistId: m.waitlistId })}
                  >
                    Agendar
                  </button>
                ) : null}
              </Prepared>
            ) : (
              <div className={styles.actions}>
                {access.canEdit ? (
                  <button
                    type="button"
                    className={styles.secondary}
                    onClick={() => setPrepared((list) => [...list, m.patient.id])}
                  >
                    Preparar convite
                  </button>
                ) : null}
                {onBook ? (
                  <button
                    type="button"
                    className={styles.quiet}
                    onClick={() =>
                      onBook({ startsAt, patientId: m.patient.id, procedureId: m.procedure.id, waitlistId: m.waitlistId })
                    }
                  >
                    Agendar
                  </button>
                ) : null}
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function Waitlist({ onBook, onAdd }: { onBook: (draft: Draft) => void; onAdd?: () => void }) {
  const { data, editable, access } = useFlow();
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
      <p className={styles.fine}>Quem quer um horário antes. Quando um horário abre, o Pulse sugere quem pode ocupar.</p>
      {data.waitlist.length ? (
        <ol className={styles.waitlist}>
          {data.waitlist.map((w) => {
            const patient = data.patients.find((p) => p.id === w.patientId);
            const procedure = procedureOf(data, w.procedureId);
            const done = invited.includes(w.id);
            const free = firstFree(data, w.period);
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
                  {!done && access.canEdit ? (
                    <button type="button" className={styles.quiet} onClick={() => setInvited((list) => [...list, w.id])}>
                      Preparar convite
                    </button>
                  ) : null}
                  {editable ? (
                    <button type="button" className={styles.quiet} disabled={pending} onClick={() => write(() => removeFromWaitlist(w.id))}>
                      Tirar da lista
                    </button>
                  ) : null}
                </div>
                {done ? (
                  <Prepared
                    phone={patient?.phone}
                    text={`Oi ${firstName(patient?.name)}! Você está na nossa lista de espera para ${procedure?.name ?? "o atendimento"}. Abriu um horário ${relDay(data.now, free)} às ${hour(free)}: quer que eu reserve para você?`}
                  />
                ) : null}
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
  const times = [...new Set([...slotTimes(data).map(([h, m]) => `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`), at])].sort();
  const candidates = !lead && !fixed && who === "" && valid && startsAt > data.now ? slotMatches(data, startsAt) : [];

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
    const deposit = depositFrom(form, procedureOf(data, procedureId)?.price ?? 0, date);
    if (deposit && "error" in deposit) return deposit;
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
        deposit: deposit ?? undefined,
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
          <p className={styles.label}>Pulse sugere para este horário</p>
          <ul className={styles.pickList}>
            {candidates.map((c) => (
              <li key={c.patient.id}>
                <span>
                  {c.patient.name} · {c.procedure.name} <span className={styles.matchScore}>{c.score}%</span>
                </span>
                <button
                  type="button"
                  className={styles.quiet}
                  onClick={() => {
                    setWho(c.patient.id);
                    setProcedureId(c.procedure.id);
                    setWaitlistId(c.waitlistId ?? "");
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

      <DepositFields price={procedureOf(data, procedureId)?.price ?? 0} due={valid ? date : today} />

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
 * meet, so the sheet says what it will do (the stock it takes, the return
 * it sets) and asks what only the visit knows: what was charged and which
 * products were really used. A finished visit shows what was charged and,
 * to the owner, what it cost that day. Who booked it and who changed it last
 * are on it too.
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
  const { data, dispatch, live, can } = useFlow();
  const { pending, error, write } = useWrite();
  const [finishing, setFinishing] = useState(false);
  const who = (userId?: ID) => data.users.find((u) => u.id === userId)?.name;
  const patient = data.patients.find((p) => p.id === a.patientId);
  const procedure = procedureOf(data, a.procedureId);
  const professional = data.users.find((u) => u.id === a.professionalId);
  const uses = data.procedureProducts.filter((pp) => pp.procedureId === a.procedureId);
  const nextReturn = procedure ? new Date(Date.parse(a.startsAt) + procedure.returnDays * 86_400_000).toISOString() : "";
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
        {a.status === "concluido" ? (
          <div>
            <dt>Valor cobrado</dt>
            <dd>
              {brl(a.priceCharged ?? procedure?.price ?? 0)}
              {a.discount ? ` · desconto de ${brl(a.discount)}` : ""}
            </dd>
          </div>
        ) : null}
      </dl>

      {a.status === "concluido" && can.finance ? <VisitMoney appointment={a} /> : null}

      {can.book ? <DepositPanel appointment={a} price={procedure?.price ?? 0} /> : null}

      {finishing ? <FinishForm appointment={a} onDone={onDone} onCancel={() => setFinishing(false)} /> : null}

      {open && procedure && !finishing ? (
        <div className={styles.suggestion}>
          <p className={styles.label}>Ao finalizar, o Pulse</p>
          <ol className={styles.effects}>
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
            <li>
              Calcula o próximo retorno: {shortDate(nextReturn)}, {procedure.returnDays} dias depois
            </li>
            <li>Põe o retorno em Oportunidades 14 dias antes da data, com o convite pronto para enviar</li>
            <li>Registra o atendimento na ficha de {firstName(patient?.name)}</li>
            <li>
              Pós-atendimento automático <Soon />
            </li>
          </ol>
        </div>
      ) : null}

      {finishing ? null : <div className={styles.actions}>
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
            onClick={() => setFinishing(true)}
          >
            Finalizar atendimento
          </button>
        ) : null}
        {open && due ? (
          <button type="button" className={styles.secondary} disabled={pending} onClick={() => set("faltou")}>
            Faltou
          </button>
        ) : null}
        {can.book && (a.status === "faltou" || a.status === "cancelado") ? (
          <button type="button" className={styles.primary} disabled={pending} onClick={onReschedule}>
            {a.status === "faltou" ? "Remarcar" : "Agendar de novo"}
          </button>
        ) : null}
        {can.book && open ? (
          <button type="button" className={styles.quiet} disabled={pending} onClick={onReschedule}>
            Remarcar
          </button>
        ) : null}
        {can.book && open ? (
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
      </div>}
      <FormError error={error} />

      <FocusLink focus={{ to: "patient", id: a.patientId }}>
        Abrir a ficha de {firstName(patient?.name)} <span aria-hidden="true">→</span>
      </FocusLink>

      {who(a.createdBy) || who(a.updatedBy) ? (
        <p className={styles.fine}>
          {who(a.createdBy) ? `Agendado por ${who(a.createdBy)}` : ""}
          {who(a.createdBy) && who(a.updatedBy) ? " · " : ""}
          {who(a.updatedBy) ? `última alteração por ${who(a.updatedBy)}` : ""}
          {a.status === "concluido" && who(a.completedBy) ? ` · finalizado por ${who(a.completedBy)}` : ""}
        </p>
      ) : null}

      {live ? (
        // A finished visit only the owner deletes (its products go back to the stock); the database checks it.
        can.book && (a.status !== "concluido" || can.finance) ? (
          <div className={styles.actions}>
            <DeleteButton
              confirm="Excluir este agendamento"
              pending={pending}
              onDelete={() => write(() => deleteAppointment(a.id), onDone)}
            />
          </div>
        ) : null
      ) : (
        <p className={styles.fine}>Na demo, as mudanças valem até recarregar a página.</p>
      )}
    </>
  );
}

/** "2,5" for a form field. */
const decimal = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 3, useGrouping: false });

/**
 * Finishing a visit: what the patient paid (the procedure's price, unless
 * there was a discount) and the products really used (the procedure's own,
 * adjustable). The stock takes those quantities and the visit keeps what
 * they cost today, for good (migration 0009).
 */
function FinishForm({ appointment: a, onDone, onCancel }: { appointment: Appointment; onDone: () => void; onCancel: () => void }) {
  const { data, dispatch, live } = useFlow();
  const { pending, error, submit } = useWrite();
  const price = procedureOf(data, a.procedureId)?.price ?? 0;
  const uses = data.procedureProducts.filter((pp) => pp.procedureId === a.procedureId);

  // The demo finishes in memory, reading the form the way the server does.
  const demoFinish = async (form: FormData): Promise<Result> => {
    const charged = Math.round(Number(String(form.get("charged") ?? "").replace(/[R$\s.]/g, "").replace(",", ".")) * 100);
    if (!Number.isFinite(charged) || charged < 0) return { error: "Informe o valor cobrado em reais." };
    const quantities = form.getAll("supplyQuantity").map((q) => Number(String(q).replace(",", ".")));
    if (quantities.some((q) => !Number.isFinite(q) || q < 0)) return { error: "Informe a quantidade de cada produto usado." };
    const supplies = form.getAll("supplyProduct").map((productId, i) => ({ productId: String(productId), quantity: quantities[i] }));
    dispatch({ type: "appointment", id: a.id, status: "concluido", charged, supplies: supplies.filter((s) => s.quantity > 0) });
    return {};
  };

  return (
    <form className={styles.form} onSubmit={submit(live ? (form) => finishAppointment(a.id, form) : demoFinish, onDone)}>
      <p className={styles.label}>Finalizar atendimento</p>
      <Field label="Valor cobrado (R$)">
        <input className={styles.input} name="charged" required inputMode="decimal" defaultValue={reais(price)} />
      </Field>
      <p className={styles.fine}>Preço do procedimento: {brl(price)}. Se houve desconto, informe o que o paciente pagou.</p>
      {uses.length ? (
        <fieldset className={styles.fieldset}>
          <legend className={styles.label}>Produtos usados</legend>
          {uses.map((use) => {
            const product = data.products.find((p) => p.id === use.productId);
            return (
              <div key={use.productId} className={styles.useRow}>
                <input type="hidden" name="supplyProduct" value={use.productId} />
                <label htmlFor={`supply-${use.productId}`}>{product?.name ?? "Produto"}</label>
                <input
                  id={`supply-${use.productId}`}
                  className={styles.input}
                  name="supplyQuantity"
                  inputMode="decimal"
                  required
                  defaultValue={decimal(use.quantity)}
                />
                <span className={styles.unitNote}>{product?.unit}</span>
              </div>
            );
          })}
          <p className={styles.fine}>
            Ajuste se este atendimento usou mais ou menos (0 se não usou). O estoque baixa estas quantidades e o custo de hoje
            fica registrado no atendimento.
          </p>
        </fieldset>
      ) : (
        <p className={styles.fine}>Nenhum produto ligado a este procedimento: o estoque não muda.</p>
      )}
      <FormError error={error} />
      <div className={styles.actions}>
        <button type="submit" className={styles.primary} disabled={pending}>
          {pending ? "Finalizando…" : "Confirmar finalização"}
        </button>
        <button type="button" className={styles.quiet} onClick={onCancel}>
          Voltar
        </button>
      </div>
    </form>
  );
}

/**
 * A finished visit's money as it was frozen that day, for the owner: what
 * was charged, what the products cost then, the gross profit and margin. A
 * later change in a product's price never changes it.
 */
function VisitMoney({ appointment: a }: { appointment: Appointment }) {
  const { data, live } = useFlow();
  const [supplies, setSupplies] = useState<AppointmentSupply[] | null>(null);
  const [loading, setLoading] = useState(false);
  const snapshot = data.financials.find((f) => f.appointmentId === a.id);
  if (!snapshot) {
    return (
      <p className={styles.fine}>
        Atendimento finalizado antes do registro de custos: em Indicadores, o lucro dele é estimado pelo custo atual dos
        produtos.
      </p>
    );
  }
  return (
    <div className={styles.suggestion}>
      <p className={styles.label}>Custo no dia do atendimento</p>
      <dl className={styles.facts}>
        <div>
          <dt>Cobrado</dt>
          <dd>{brl(snapshot.priceCharged)}</dd>
        </div>
        <div>
          <dt>Custo dos produtos</dt>
          <dd>{brl(snapshot.totalCost)}</dd>
        </div>
        <div>
          <dt>Lucro bruto</dt>
          <dd>{brl(snapshot.grossProfit)}</dd>
        </div>
        <div>
          <dt>Margem</dt>
          <dd>{snapshot.grossMargin === undefined ? "—" : `${Math.round(snapshot.grossMargin)}%`}</dd>
        </div>
      </dl>
      {supplies ? (
        supplies.length ? (
          <ul className={styles.uses}>
            {supplies.map((s) => (
              <li key={s.productName}>
                <span>{s.productName}</span>
                <span className={styles.qty}>
                  {units(s.quantity, s.unit)} × {brl(s.unitCost)} = {brl(s.totalCost)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.fine}>Nenhum produto usado.</p>
        )
      ) : live ? (
        <button
          type="button"
          className={styles.quiet}
          disabled={loading}
          onClick={async () => {
            setLoading(true);
            setSupplies(await visitSupplies(a.id));
            setLoading(false);
          }}
        >
          Ver produtos usados
        </button>
      ) : null}
      <p className={styles.fine}>Registrado ao finalizar: mudanças no preço dos produtos não alteram este valor.</p>
    </div>
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

export type DepositStatus = "pendente" | "pago" | "vencido" | "cancelado";
const DEPOSIT_LABEL: Record<DepositStatus, string> = { pendente: "Pendente", pago: "Pago", vencido: "Vencido", cancelado: "Cancelado" };

/**
 * Read, never stored: paid when marked so; cancelled with its booking when
 * unpaid; overdue once its due day has passed; pending until then.
 */
export function depositStatus(a: Appointment, now: string): DepositStatus | null {
  if (!a.deposit) return null;
  if (a.deposit.paidAt) return "pago";
  if (a.status === "cancelado") return "cancelado";
  return a.deposit.due && a.deposit.due < now.slice(0, 10) ? "vencido" : "pendente";
}

/** The demo reads the same fields the server reads (actions.ts, depositOf). */
function depositFrom(
  form: FormData,
  price: number,
  date: string,
): { cents: number; due: string; percent?: number } | { error: string } | null {
  const kind = String(form.get("depositKind") ?? "");
  if (!kind) return null;
  const raw = Number(String(form.get("depositValue") ?? "").replace(/[R$\s.]/g, "").replace(",", "."));
  if (!Number.isFinite(raw) || raw <= 0) return { error: "Informe o valor do sinal." };
  if (kind === "percent" && raw > 100) return { error: "Informe o sinal entre 1% e 100%." };
  const cents = kind === "percent" ? Math.round((price * raw) / 100) : Math.round(raw * 100);
  if (price > 0 && cents > price) return { error: "O sinal não pode passar do preço do procedimento." };
  return { cents, due: String(form.get("depositDue") || date), percent: kind === "percent" ? Math.round(raw) : undefined };
}

/**
 * "Cobrar sinal", off until asked: a percentage of the price or a fixed
 * amount, and the day it is due. Shows what it comes to, nothing more.
 */
function DepositFields({ price, due, initial }: { price: number; due: string; initial?: Appointment["deposit"] }) {
  const [on, setOn] = useState(Boolean(initial));
  const [kind, setKind] = useState<"percent" | "fixed">(initial && !initial.percent ? "fixed" : "percent");
  const [value, setValue] = useState(initial ? (initial.percent ? String(initial.percent) : reais(initial.cents)) : "30");
  const n = Number(value.replace(/[R$\s.]/g, "").replace(",", "."));
  const cents = !Number.isFinite(n) ? 0 : kind === "percent" ? Math.round((price * n) / 100) : Math.round(n * 100);

  return (
    <div className={styles.deposit}>
      <label className={styles.check}>
        <input type="checkbox" checked={on} onChange={(event) => setOn(event.target.checked)} />
        Cobrar sinal
      </label>
      {on ? (
        <>
          <input type="hidden" name="depositKind" value={kind} />
          <div className={styles.depositRow}>
            <div className={styles.segmented} role="group" aria-label="Como cobrar o sinal">
              <button type="button" aria-pressed={kind === "percent"} onClick={() => setKind("percent")}>
                %
              </button>
              <button type="button" aria-pressed={kind === "fixed"} onClick={() => setKind("fixed")}>
                R$
              </button>
            </div>
            <label className={styles.depositValue}>
              <span className="sr-only">{kind === "percent" ? "Percentual do preço" : "Valor do sinal em reais"}</span>
              <input
                className={styles.input}
                name="depositValue"
                inputMode="decimal"
                required
                value={value}
                onChange={(event) => setValue(event.target.value)}
              />
            </label>
            <Field label="Vence em">
              <input className={styles.input} type="date" name="depositDue" defaultValue={initial?.due ?? due} />
            </Field>
          </div>
          <p className={styles.fine}>
            Sinal de <strong>{brl(cents)}</strong>
            {price ? ` sobre ${brl(price)}` : ""}. Link de pagamento <Soon />
          </p>
        </>
      ) : null}
    </div>
  );
}

/** The deposit on a booking: its amount and status, marked paid by hand until payments run through the Pulse. */
function DepositPanel({ appointment: a, price }: { appointment: Appointment; price: number }) {
  const { data, dispatch, live, access } = useFlow();
  const { pending, error, write, submit } = useWrite();
  const [editing, setEditing] = useState(false);
  const status = depositStatus(a, data.now);
  const open = a.status === "agendado" || a.status === "confirmado";
  if (!a.deposit && (!open || !access.canEdit)) return null;

  if (editing) {
    const demoSave = async (form: FormData): Promise<Result> => {
      const deposit = depositFrom(form, price, a.startsAt.slice(0, 10));
      if (deposit && "error" in deposit) return deposit;
      dispatch({ type: "deposit", id: a.id, deposit });
      return {};
    };
    return (
      <form className={styles.form} onSubmit={submit(live ? (form) => saveDeposit(a.id, form) : demoSave, () => setEditing(false))}>
        <DepositFields price={price} due={a.startsAt.slice(0, 10)} initial={a.deposit} />
        <FormError error={error} />
        <div className={styles.actions}>
          <button type="submit" className={styles.primary} disabled={pending}>
            Salvar sinal
          </button>
          <button type="button" className={styles.quiet} onClick={() => setEditing(false)}>
            Cancelar
          </button>
        </div>
      </form>
    );
  }

  if (!a.deposit) {
    return (
      <button type="button" className={styles.quiet} onClick={() => setEditing(true)}>
        Cobrar sinal
      </button>
    );
  }

  const paid = status === "pago";
  const mark = () => {
    if (live) return write(() => setDepositPaid(a.id, !paid));
    dispatch({ type: "depositPaid", id: a.id, paid: !paid });
  };
  return (
    <div className={styles.depositLine}>
      <span>
        Sinal {a.deposit.percent ? `${a.deposit.percent}% · ` : ""}
        {brl(a.deposit.cents)}
        {paid && a.deposit.paidAt
          ? ` · pago em ${shortDate(a.deposit.paidAt)}`
          : a.deposit.due && status !== "cancelado"
            ? ` · vence ${shortDate(`${a.deposit.due}T12:00:00.000Z`)}`
            : ""}
      </span>
      <span className={styles.depositStatus} data-status={status ?? undefined}>
        {status ? DEPOSIT_LABEL[status] : ""}
      </span>
      {access.canEdit && status !== "cancelado" ? (
        <span className={styles.depositActions}>
          <button type="button" className={styles.quiet} disabled={pending} onClick={mark}>
            {paid ? "Desfazer pagamento" : "Marcar como pago"}
          </button>
          {!paid ? (
            <button type="button" className={styles.quiet} onClick={() => setEditing(true)}>
              Alterar
            </button>
          ) : null}
        </span>
      ) : null}
      <FormError error={error} />
    </div>
  );
}

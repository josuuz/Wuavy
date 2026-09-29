"use client";

import Link from "next/link";
import { useState } from "react";

import { createAppointment, deleteAppointment, setAppointmentStatus } from "@/lib/flow/actions";
import { daysFrom, hour, relDay } from "@/lib/flow/format";
import { daySlots, procedureOf, slotCandidates, type Slot } from "@/lib/flow/insights";
import type { Appointment, AppointmentStatus } from "@/lib/flow/types";
import { viewHref } from "../copy";
import { DeleteButton, Field, FormError, useWrite } from "../forms";
import { Sheet } from "../Sheet";
import { useFlow } from "../store";
import styles from "../ui.module.css";

/* Today and tomorrow, the waiting list beside them. A cancellation becomes an opportunity on the spot. */

const DAYS = [
  { offset: 0, label: "Hoje" },
  { offset: 1, label: "Amanhã" },
];

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const STATUS_LABEL: Record<AppointmentStatus, string> = {
  agendado: "Agendado",
  confirmado: "Confirmado",
  cancelado: "Cancelado",
  concluido: "Concluído",
};

export function Schedule() {
  const { data, dispatch, base, live } = useFlow();
  const [invited, setInvited] = useState<string[]>([]);
  // The real Flow: a free slot being booked, or a booking being managed.
  const [booking, setBooking] = useState<string | null>(null);
  const [managing, setManaging] = useState<string | null>(null);
  const appointment = data.appointments.find((a) => a.id === managing);
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
        <p className={styles.lead}>
          {live
            ? "Horários ocupados, livres e cancelados. Agende num horário livre; confirme, conclua ou cancele o que já está marcado."
            : "Horários ocupados, livres e cancelados. Simule um cancelamento para ver o Flow reagir."}
        </p>
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
            <Link href={viewHref("oportunidades", base)} className={styles.textAction} onClick={() => dispatch({ type: "focus", kind: "open_slot" })}>
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
                  canCancel={!live && day.offset === 1}
                  onCancel={(id) => dispatch({ type: "cancel", id })}
                  onBook={live ? setBooking : undefined}
                  onManage={live ? setManaging : undefined}
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

      {live ? (
        <>
          <Sheet
            open={booking !== null}
            onClose={() => setBooking(null)}
            title={booking ? `${capital(relDay(data.now, booking))} às ${hour(booking)}` : ""}
            kicker="Novo agendamento"
          >
            {booking ? <BookingForm startsAt={booking} onDone={() => setBooking(null)} /> : null}
          </Sheet>
          <Sheet
            open={Boolean(appointment)}
            onClose={() => setManaging(null)}
            title={data.patients.find((p) => p.id === appointment?.patientId)?.name ?? ""}
            kicker={appointment ? STATUS_LABEL[appointment.status] : undefined}
          >
            {appointment ? <Booking key={appointment.id} appointment={appointment} onDone={() => setManaging(null)} /> : null}
          </Sheet>
        </>
      ) : null}
    </div>
  );
}

interface SlotRowProps {
  slot: Slot;
  canCancel: boolean;
  onCancel: (id: string) => void;
  /** The real Flow: book a free slot, manage a booked one. */
  onBook?: (startsAt: string) => void;
  onManage?: (id: string) => void;
}

function SlotRow({ slot, canCancel, onCancel, onBook, onManage }: SlotRowProps) {
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
              {procedure?.name} · {procedure?.durationMin} min
              {a?.status === "confirmado" ? " · confirmado" : a?.status === "concluido" ? " · concluído" : ""}
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
      {onManage && a ? (
        <button type="button" className={styles.quiet} onClick={() => onManage(a.id)}>
          Gerenciar
        </button>
      ) : null}
      {onBook && slot.status !== "ocupado" ? (
        <button type="button" className={styles.quiet} onClick={() => onBook(slot.startsAt)}>
          Agendar
        </button>
      ) : null}
    </li>
  );
}

function BookingForm({ startsAt, onDone }: { startsAt: string; onDone: () => void }) {
  const { data, base } = useFlow();
  const { pending, error, submit } = useWrite();

  if (!data.patients.length || !data.procedures.length) {
    return (
      <p className={styles.fine}>
        Para agendar, cadastre antes pelo menos um{" "}
        <Link href={viewHref("pacientes", base)} onClick={onDone}>
          paciente
        </Link>{" "}
        e um{" "}
        <Link href={viewHref("procedimentos", base)} onClick={onDone}>
          procedimento
        </Link>
        .
      </p>
    );
  }

  return (
    <form className={styles.form} onSubmit={submit(createAppointment, onDone)}>
      <input type="hidden" name="startsAt" value={startsAt} />
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
              {p.name} · {p.durationMin} min
            </option>
          ))}
        </select>
      </Field>
      <FormError error={error} />
      <div className={styles.actions}>
        <button type="submit" className={styles.primary} disabled={pending}>
          Agendar
        </button>
        <button type="button" className={styles.quiet} onClick={onDone}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

/** One booking: its status moves forward (confirmed, done) or it is cancelled or removed. */
function Booking({ appointment, onDone }: { appointment: Appointment; onDone: () => void }) {
  const { data } = useFlow();
  const { pending, error, write } = useWrite();
  const procedure = procedureOf(data, appointment.procedureId);
  const status = (next: AppointmentStatus) => write(() => setAppointmentStatus(appointment.id, next), onDone);

  return (
    <>
      <dl className={styles.fields}>
        <div>
          <dt>Horário</dt>
          <dd>
            {relDay(data.now, appointment.startsAt)} às {hour(appointment.startsAt)}
          </dd>
        </div>
        <div>
          <dt>Procedimento</dt>
          <dd>
            {procedure?.name} · {appointment.durationMin} min
          </dd>
        </div>
      </dl>
      {/* A cancelled booking only leaves the slot; it can be deleted, not moved on. */}
      {appointment.status === "cancelado" ? null : (
        <div className={styles.actions}>
          {appointment.status === "agendado" ? (
            <button type="button" className={styles.primary} disabled={pending} onClick={() => status("confirmado")}>
              Confirmar
            </button>
          ) : null}
          {appointment.status !== "concluido" ? (
            <button type="button" className={styles.secondary} disabled={pending} onClick={() => status("concluido")}>
              Marcar como concluído
            </button>
          ) : (
            <button type="button" className={styles.secondary} disabled={pending} onClick={() => status("confirmado")}>
              Desfazer conclusão
            </button>
          )}
          <button type="button" className={styles.quiet} disabled={pending} onClick={() => status("cancelado")}>
            Cancelar agendamento
          </button>
        </div>
      )}
      <FormError error={error} />
      <div className={styles.actions}>
        <DeleteButton
          confirm="Excluir este agendamento"
          pending={pending}
          onDelete={() => write(() => deleteAppointment(appointment.id), onDone)}
        />
      </div>
    </>
  );
}

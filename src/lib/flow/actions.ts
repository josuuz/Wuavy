"use server";

import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import { refresh } from "next/cache";

import type { Database } from "@/lib/supabase/database.types";
import { clinicNow } from "./clock";
import { getSession } from "./session";
import { APPOINTMENT_STATUSES, LEAD_SOURCES, LEAD_STAGES, PROCEDURE_CATEGORIES } from "./types";

/*
  The real Flow's writes: leads, patients, procedures, appointments. Each one
  takes the clinic from the verified session, never from the browser, checks
  its input, scopes every query to that clinic (row-level security enforces
  it again) and refreshes the route, so the screen shows the database.
*/

export interface Result {
  error?: string;
}

type Db = SupabaseClient<Database>;

const DAY = 86_400_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Input the person can fix: its message goes back to the form. */
class Invalid extends Error {}

async function write(step: (db: Db, org: string) => Promise<PostgrestError | null>): Promise<Result> {
  const session = await getSession();
  if (!session?.member) return { error: "Sua sessão expirou. Entre de novo." };
  try {
    const error = await step(session.supabase, session.member.organization_id);
    if (error) return { error: describe(error) };
  } catch (error) {
    if (error instanceof Invalid) return { error: error.message };
    throw error;
  }
  refresh();
  return {};
}

function describe(error: PostgrestError) {
  if (error.code === "23514") return "Algum valor está fora do permitido.";
  if (error.code === "23503") return "Há outros registros ligados a este.";
  if (error.code === "42501") return "Sem permissão para esta clínica.";
  console.error("Flow write failed", error);
  return "Não foi possível salvar. Tente de novo.";
}

/** An update or delete that matched nothing touched a row this clinic can't see. */
function affected({ data, error }: { data: unknown[] | null; error: PostgrestError | null }) {
  if (error) return error;
  if (!data?.length) throw new Invalid("Registro não encontrado.");
  return null;
}

async function log(db: Db, org: string, text: string) {
  return (await db.from("activities").insert({ organization_id: org, at: clinicNow(), text })).error;
}

/* ── Input ─────────────────────────────────────────────────── */

function text(form: FormData, key: string, max = 200) {
  const value = form.get(key);
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function required(value: string, what: string) {
  if (!value) throw new Invalid(`Informe ${what}.`);
  return value;
}

function id(value: string) {
  if (!UUID.test(value)) throw new Invalid("Registro inválido.");
  return value;
}

function oneOf<T extends string>(value: string, options: readonly T[], what: string): T {
  if (!(options as readonly string[]).includes(value)) throw new Invalid(`Escolha ${what}.`);
  return value as T;
}

/** "1.240", "1240,50" or "R$ 380" to cents. */
function cents(value: string, what: string) {
  const n = Number(value.replace(/[R$\s.]/g, "").replace(",", "."));
  if (!value || !Number.isFinite(n) || n < 0) throw new Invalid(`Informe ${what} em reais.`);
  return Math.round(n * 100);
}

function whole(value: string, what: string) {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new Invalid(`Informe ${what}.`);
  return n;
}

/* ── Leads ─────────────────────────────────────────────────── */

export async function saveLead(leadId: string | null, form: FormData): Promise<Result> {
  return write(async (db, org) => {
    const procedure = text(form, "procedureId");
    const value = text(form, "potentialValue");
    const lead = {
      name: required(text(form, "name"), "o nome"),
      phone: text(form, "phone", 40) || null,
      source: oneOf(text(form, "source"), LEAD_SOURCES, "a origem"),
      procedure_id: procedure ? id(procedure) : null,
      potential_value: value ? cents(value, "o valor potencial") : 0,
      next_action: text(form, "nextAction", 300) || null,
    };
    if (leadId) {
      return affected(await db.from("leads").update(lead).eq("id", id(leadId)).eq("organization_id", org).select("id"));
    }
    const now = clinicNow();
    return (await db.from("leads").insert({ ...lead, organization_id: org, created_at: now, last_contact_at: now })).error;
  });
}

/** Any move counts as contact; a lead moved into "Orçamento" has just had its quote sent. */
export async function moveLead(leadId: string, stage: string): Promise<Result> {
  return write(async (db, org) => {
    const next = oneOf(stage, LEAD_STAGES, "a etapa");
    const now = clinicNow();
    const result = await db
      .from("leads")
      .update({ stage: next, last_contact_at: now, quote_sent_at: next === "orcamento" ? now : null })
      .eq("id", id(leadId))
      .eq("organization_id", org)
      .select("name");
    return affected(result) ?? log(db, org, `${result.data![0].name} avançou no funil.`);
  });
}

export async function contactLead(leadId: string): Promise<Result> {
  return write(async (db, org) => {
    const { data: lead, error } = await db
      .from("leads")
      .select("name, stage")
      .eq("id", id(leadId))
      .eq("organization_id", org)
      .maybeSingle();
    if (error) return error;
    if (!lead) throw new Invalid("Registro não encontrado.");
    const now = clinicNow();
    const update = { last_contact_at: now, quote_sent_at: lead.stage === "orcamento" ? now : null };
    const changed = await db.from("leads").update(update).eq("id", leadId).eq("organization_id", org).select("id");
    return affected(changed) ?? log(db, org, `Contato registrado com ${lead.name}.`);
  });
}

export async function deleteLead(leadId: string): Promise<Result> {
  return write(async (db, org) =>
    affected(await db.from("leads").delete().eq("id", id(leadId)).eq("organization_id", org).select("id")),
  );
}

/* ── Patients ──────────────────────────────────────────────── */

export async function savePatient(patientId: string | null, form: FormData): Promise<Result> {
  return write(async (db, org) => {
    const patient = {
      name: required(text(form, "name"), "o nome"),
      phone: text(form, "phone", 40) || null,
      notes: text(form, "notes", 1000) || null,
    };
    if (patientId) {
      return affected(
        await db.from("patients").update(patient).eq("id", id(patientId)).eq("organization_id", org).select("id"),
      );
    }
    return (await db.from("patients").insert({ ...patient, organization_id: org })).error;
  });
}

/** Their appointments and waiting-list entries go with them (the schema cascades). */
export async function deletePatient(patientId: string): Promise<Result> {
  return write(async (db, org) =>
    affected(await db.from("patients").delete().eq("id", id(patientId)).eq("organization_id", org).select("id")),
  );
}

/* ── Procedures ────────────────────────────────────────────── */

export async function saveProcedure(procedureId: string | null, form: FormData): Promise<Result> {
  return write(async (db, org) => {
    const procedure = {
      name: required(text(form, "name"), "o nome"),
      category: oneOf(text(form, "category"), PROCEDURE_CATEGORIES, "a categoria"),
      price: cents(text(form, "price"), "o valor"),
      duration_min: whole(text(form, "durationMin"), "a duração em minutos"),
      return_days: whole(text(form, "returnDays"), "o retorno típico em dias"),
    };
    if (procedureId) {
      return affected(
        await db.from("procedures").update(procedure).eq("id", id(procedureId)).eq("organization_id", org).select("id"),
      );
    }
    return (await db.from("procedures").insert({ ...procedure, organization_id: org })).error;
  });
}

export async function deleteProcedure(procedureId: string): Promise<Result> {
  return write(async (db, org) => {
    const result = await db.from("procedures").delete().eq("id", id(procedureId)).eq("organization_id", org).select("id");
    if (result.error?.code === "23503") {
      throw new Invalid("Este procedimento tem agendamentos ou lista de espera e não pode ser excluído.");
    }
    return affected(result);
  });
}

/* ── Appointments ──────────────────────────────────────────── */

export async function createAppointment(form: FormData): Promise<Result> {
  return write(async (db, org) => {
    const patientId = id(required(text(form, "patientId"), "o paciente"));
    const procedureId = id(required(text(form, "procedureId"), "o procedimento"));
    const at = new Date(text(form, "startsAt"));
    if (Number.isNaN(at.getTime())) throw new Invalid("Horário inválido.");
    const startsAt = at.toISOString();

    const { data: procedure, error } = await db
      .from("procedures")
      .select("duration_min")
      .eq("id", procedureId)
      .eq("organization_id", org)
      .maybeSingle();
    if (error) return error;
    if (!procedure) throw new Invalid("Escolha o procedimento.");

    const { count, error: taken } = await db
      .from("appointments")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", org)
      .eq("starts_at", startsAt)
      .neq("status", "cancelado");
    if (taken) return taken;
    if (count) throw new Invalid("Este horário já está ocupado.");

    return (
      await db.from("appointments").insert({
        organization_id: org,
        patient_id: patientId,
        procedure_id: procedureId,
        starts_at: startsAt,
        duration_min: procedure.duration_min,
      })
    ).error;
  });
}

export async function setAppointmentStatus(appointmentId: string, status: string): Promise<Result> {
  return write(async (db, org) => {
    const next = oneOf(status, APPOINTMENT_STATUSES, "o status");
    const result = await db
      .from("appointments")
      .update({ status: next })
      .eq("id", id(appointmentId))
      .eq("organization_id", org)
      .select("patient_id");
    const error = affected(result) ?? (await syncPatient(db, org, result.data![0].patient_id));
    if (error || next !== "cancelado") return error;
    return log(db, org, "Um cancelamento abriu um horário na agenda.");
  });
}

export async function deleteAppointment(appointmentId: string): Promise<Result> {
  return write(async (db, org) => {
    const result = await db
      .from("appointments")
      .delete()
      .eq("id", id(appointmentId))
      .eq("organization_id", org)
      .select("patient_id");
    return affected(result) ?? syncPatient(db, org, result.data![0].patient_id);
  });
}

/**
 * A patient's visits, spend and next return follow from their completed
 * appointments: recomputed whenever one changes, so they never drift.
 */
async function syncPatient(db: Db, org: string, patientId: string) {
  const { data, error } = await db
    .from("appointments")
    .select("starts_at, procedures(price, return_days)")
    .eq("organization_id", org)
    .eq("patient_id", patientId)
    .eq("status", "concluido")
    .order("starts_at");
  if (error) return error;

  const first = data[0];
  const last = data.at(-1);
  const nextReturn = last?.procedures
    ? new Date(Date.parse(last.starts_at) + last.procedures.return_days * DAY).toISOString()
    : null;
  return (
    await db
      .from("patients")
      .update({
        first_visit_at: first?.starts_at ?? null,
        last_visit_at: last?.starts_at ?? null,
        next_return_at: nextReturn,
        total_spent: data.reduce((sum, visit) => sum + (visit.procedures?.price ?? 0), 0),
      })
      .eq("id", patientId)
      .eq("organization_id", org)
  ).error;
}

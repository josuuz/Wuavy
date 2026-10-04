"use server";

import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import { refresh } from "next/cache";

import type { Database } from "@/lib/supabase/database.types";
import { clinicNow } from "./clock";
import { dayAt } from "./format";
import { drawDown, restock, visitSummary } from "./insights";
import { READ_ONLY_MESSAGE } from "./access";
import { createAdminClient } from "@/lib/supabase/admin";
import { LOGO_ERROR, logoFormat, logoFrom, saveLogo } from "./logo";
import { getClinicAccess, getSession } from "./session";
import {
  APPOINTMENT_STATUSES,
  LEAD_SOURCES,
  LEAD_STAGES,
  PROCEDURE_CATEGORIES,
  SEGMENTS,
  TEAM_SIZES,
  type InventoryLot,
} from "./types";

/*
  The real Pulse's writes: contacts, patients, procedures, the agenda, the
  stock, and the clinic's own profile. Each one takes the clinic from the verified session, never from the
  browser, checks its input, scopes every query to that clinic (row-level
  security enforces it again) and refreshes the route, so the screen shows
  the database.
*/

export interface Result {
  error?: string;
}

type Db = SupabaseClient<Database>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** The stages a contact can be in before booking: "agendado" is reached by booking. */
const OPEN_STAGES = LEAD_STAGES.filter((stage) => stage !== "agendado");

/** Input the person can fix: its message goes back to the form. */
class Invalid extends Error {}

/** Who is writing: the verified session's person and their role at the clinic. */
interface Writer {
  userId: string;
  role: string;
}

async function write(step: (db: Db, org: string, who: Writer) => Promise<PostgrestError | null>): Promise<Result> {
  const session = await getSession();
  if (!session?.member) return { error: "Sua sessão expirou. Entre de novo." };
  // A subscription that is not active reads, never writes: checked here, whatever the screen showed.
  if (!(await getClinicAccess())?.canEdit) return { error: READ_ONLY_MESSAGE };
  try {
    const error = await step(session.supabase, session.member.organization_id, {
      userId: session.user.id,
      role: session.member.role,
    });
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
  // A column the database does not have yet: the schema is behind the app.
  if (error.code === "PGRST204" || error.code === "42703") return "Falta atualizar o banco de dados do Pulse (migrations em supabase/migrations).";
  console.error("Pulse write failed", error);
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

const optionalId = (value: string) => (value ? id(value) : null);

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

/** "0,5" or "2" to a quantity of stock, to the thousandth. */
function amount(value: string, what: string, { zero = false } = {}) {
  const n = Number(value.replace(",", "."));
  if (!value || !Number.isFinite(n) || n < 0 || (!zero && n === 0)) throw new Invalid(`Informe ${what}.`);
  return Math.round(n * 1000) / 1000;
}

function isoDate(value: string, what: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value))) throw new Invalid(`Informe ${what}.`);
  return value;
}

/* ── Contacts (sales) ──────────────────────────────────────── */

export async function saveLead(leadId: string | null, form: FormData): Promise<Result> {
  return write(async (db, org) => {
    const procedure = text(form, "procedureId");
    const value = text(form, "potentialValue");
    const lead = {
      name: required(text(form, "name"), "o nome"),
      phone: text(form, "phone", 40) || null,
      source: oneOf(text(form, "source"), LEAD_SOURCES, "a origem"),
      procedure_id: procedure ? id(procedure) : null,
      potential_value: value ? cents(value, "o valor do orçamento") : 0,
      next_action: text(form, "nextAction", 300) || null,
    };
    if (leadId) {
      return affected(await db.from("leads").update(lead).eq("id", id(leadId)).eq("organization_id", org).select("id"));
    }
    const now = clinicNow();
    const stage = oneOf(text(form, "stage") || "novo", OPEN_STAGES, "a etapa");
    // Someone who is a patient already: the new sale is theirs, not a second person.
    const patientId = optionalId(text(form, "patientId"));
    return (
      await db.from("leads").insert({
        ...lead,
        organization_id: org,
        stage,
        created_at: now,
        last_contact_at: now,
        quote_sent_at: stage === "orcamento" ? now : null,
        ...(patientId ? { patient_id: patientId } : {}),
      })
    ).error;
  });
}

/** Any move counts as contact; a contact moved into "Orçamento" has just had their quote sent. */
export async function moveLead(leadId: string, stage: string): Promise<Result> {
  return write(async (db, org) => {
    const next = oneOf(stage, OPEN_STAGES, "a etapa");
    const now = clinicNow();
    const result = await db
      .from("leads")
      .update({ stage: next, last_contact_at: now, quote_sent_at: next === "orcamento" ? now : null, next_action: null })
      .eq("id", id(leadId))
      .eq("organization_id", org)
      .select("name");
    return affected(result) ?? log(db, org, `${result.data![0].name} passou para a etapa seguinte em Vendas.`);
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

/**
 * A patient, and optionally a visit from before the Pulse (a day and a
 * procedure): it is recorded as a finished appointment, so the last visit,
 * the spend and the next return follow from it as from any other, and the
 * return engine has something to work with from the first day. The stock is
 * not touched: that session's products were used long ago.
 */
export async function savePatient(patientId: string | null, form: FormData): Promise<Result> {
  return write(async (db, org) => {
    const patient = {
      name: required(text(form, "name"), "o nome"),
      phone: text(form, "phone", 40) || null,
      notes: text(form, "notes", 1000) || null,
    };
    const visitDate = text(form, "visitDate");
    const visitProcedure = text(form, "visitProcedureId");
    if (Boolean(visitDate) !== Boolean(visitProcedure)) throw new Invalid("Para o atendimento anterior, informe o dia e o procedimento.");
    const visit = visitDate ? { date: isoDate(visitDate, "o dia do atendimento anterior"), procedureId: id(visitProcedure) } : null;
    if (visit && visit.date >= clinicNow().slice(0, 10)) throw new Invalid("O atendimento anterior precisa ser de antes de hoje.");

    let saved = patientId;
    if (patientId) {
      const error = affected(
        await db.from("patients").update(patient).eq("id", id(patientId)).eq("organization_id", org).select("id"),
      );
      if (error) return error;
    } else {
      const { data, error } = await db.from("patients").insert({ ...patient, organization_id: org }).select("id").single();
      if (error) return error;
      saved = data.id;
    }
    if (!visit) return null;

    const { data: procedure, error: procedureError } = await db
      .from("procedures")
      .select("duration_min")
      .eq("id", visit.procedureId)
      .eq("organization_id", org)
      .maybeSingle();
    if (procedureError) return procedureError;
    if (!procedure) throw new Invalid("Escolha o procedimento do atendimento anterior.");
    const added = await db.from("appointments").insert({
      organization_id: org,
      patient_id: saved!,
      procedure_id: visit.procedureId,
      starts_at: `${visit.date}T09:00:00.000Z`,
      duration_min: procedure.duration_min,
      status: "concluido",
    });
    return added.error ?? syncPatient(db, org, saved!);
  });
}

/** Their appointments and waiting-list entries go with them (the schema cascades). */
export async function deletePatient(patientId: string): Promise<Result> {
  return write(async (db, org) =>
    affected(await db.from("patients").delete().eq("id", id(patientId)).eq("organization_id", org).select("id")),
  );
}

/* ── Procedures ────────────────────────────────────────────── */

/** A procedure and what one session of it consumes: the link from the agenda to the stock. */
export async function saveProcedure(procedureId: string | null, form: FormData): Promise<Result> {
  return write(async (db, org) => {
    const procedure = {
      name: required(text(form, "name"), "o nome"),
      category: oneOf(text(form, "category"), PROCEDURE_CATEGORIES, "a categoria"),
      price: cents(text(form, "price"), "o preço"),
      duration_min: whole(text(form, "durationMin"), "a duração em minutos"),
      return_days: whole(text(form, "returnDays"), "o retorno recomendado em dias"),
    };
    const products = form.getAll("useProduct").map(String);
    const quantities = form.getAll("useQuantity").map(String);
    const uses = new Map<string, number>();
    products.forEach((product, i) => {
      if (product) uses.set(id(product), amount(quantities[i] ?? "", "a quantidade de cada produto"));
    });

    let saved = procedureId;
    if (procedureId) {
      const error = affected(
        await db.from("procedures").update(procedure).eq("id", id(procedureId)).eq("organization_id", org).select("id"),
      );
      if (error) return error;
    } else {
      const { data, error } = await db.from("procedures").insert({ ...procedure, organization_id: org }).select("id").single();
      if (error) return error;
      saved = data.id;
    }

    const cleared = await db.from("procedure_products").delete().eq("procedure_id", saved!).eq("organization_id", org);
    if (cleared.error || !uses.size) return cleared.error;
    return (
      await db.from("procedure_products").insert(
        [...uses].map(([product, quantity]) => ({ organization_id: org, procedure_id: saved!, product_id: product, quantity })),
      )
    ).error;
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

/* ── Agenda ────────────────────────────────────────────────── */

/**
 * One booking, for whoever it is: a patient, a contact from Vendas (who
 * becomes a patient here, keeping their origin and quote), or someone new
 * (a patient and the contact that records how they arrived). The same
 * person is never created twice: a contact already linked books as their
 * patient. Optionally it replaces an earlier booking (rescheduling) and
 * takes the person off the waiting list.
 */
export async function book(form: FormData): Promise<Result> {
  return write(async (db, org) => {
    const procedureId = id(required(text(form, "procedureId"), "o procedimento"));
    const date = isoDate(text(form, "date"), "o dia");
    const time = text(form, "time");
    if (!/^\d{2}:\d{2}$/.test(time)) throw new Invalid("Escolha o horário.");
    const startsAt = new Date(`${date}T${time}:00.000Z`).toISOString();
    const now = clinicNow();
    if (startsAt.slice(0, 10) < now.slice(0, 10)) throw new Invalid("Escolha um dia a partir de hoje.");
    const professionalId = optionalId(text(form, "professionalId"));
    const leadId = optionalId(text(form, "leadId"));
    const replaces = optionalId(text(form, "replaces"));
    const waitlistId = optionalId(text(form, "waitlistId"));
    const who = text(form, "patientId");

    const { data: procedure, error: procedureError } = await db
      .from("procedures")
      .select("name, price, duration_min")
      .eq("id", procedureId)
      .eq("organization_id", org)
      .maybeSingle();
    if (procedureError) return procedureError;
    if (!procedure) throw new Invalid("Escolha o procedimento.");

    let busy = db
      .from("appointments")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", org)
      .eq("starts_at", startsAt)
      .neq("status", "cancelado");
    if (replaces) busy = busy.neq("id", replaces);
    const { count, error: busyError } = await busy;
    if (busyError) return busyError;
    if (count) throw new Invalid("Este horário já está ocupado.");

    // Who is booking, and whether a patient is created here (undone if the booking fails).
    let patientId: string | null = null;
    let name = "";
    let created: string | null = null;
    let lead: { id: string; patient_id: string | null } | null = null;

    if (leadId) {
      const { data, error } = await db
        .from("leads")
        .select("id, name, phone, patient_id")
        .eq("id", leadId)
        .eq("organization_id", org)
        .maybeSingle();
      if (error) return error;
      if (!data) throw new Invalid("Contato não encontrado.");
      lead = data;
      name = data.name;
      patientId = data.patient_id;
      if (!patientId) {
        const made = await db.from("patients").insert({ organization_id: org, name: data.name, phone: data.phone }).select("id").single();
        if (made.error) return made.error;
        patientId = created = made.data.id;
      }
    } else if (who && who !== "novo") {
      const { data, error } = await db.from("patients").select("id, name").eq("id", id(who)).eq("organization_id", org).maybeSingle();
      if (error) return error;
      if (!data) throw new Invalid("Paciente não encontrado.");
      patientId = data.id;
      name = data.name;
    } else {
      name = required(text(form, "name"), "o nome");
      const phone = text(form, "phone", 40) || null;
      const made = await db.from("patients").insert({ organization_id: org, name, phone }).select("id").single();
      if (made.error) return made.error;
      patientId = created = made.data.id;
      // Their origin lives on the contact, as for anyone who came through Vendas.
      const origin = await db.from("leads").insert({
        organization_id: org,
        name,
        phone,
        source: oneOf(text(form, "source") || "whatsapp", LEAD_SOURCES, "a origem"),
        procedure_id: procedureId,
        potential_value: procedure.price,
        stage: "agendado",
        created_at: now,
        last_contact_at: now,
        patient_id: patientId,
      });
      if (origin.error) return undo(db, org, created, origin.error);
    }

    const appointment = await db.from("appointments").insert({
      organization_id: org,
      patient_id: patientId!,
      procedure_id: procedureId,
      professional_id: professionalId,
      starts_at: startsAt,
      duration_min: procedure.duration_min,
    });
    if (appointment.error) return undo(db, org, created, appointment.error);

    if (lead) {
      const linked = await db
        .from("leads")
        .update({ stage: "agendado", patient_id: patientId, last_contact_at: now, quote_sent_at: null, next_action: null })
        .eq("id", lead.id)
        .eq("organization_id", org);
      // Deleting the new patient takes their appointment with it (the schema cascades).
      if (linked.error) return undo(db, org, created, linked.error);
    }
    if (replaces) {
      const moved = await db
        .from("appointments")
        .update({ status: "cancelado" })
        .eq("id", replaces)
        .eq("organization_id", org)
        .in("status", ["agendado", "confirmado"]);
      if (moved.error) return moved.error;
    }
    if (waitlistId) {
      const off = await db.from("waitlist_entries").delete().eq("id", waitlistId).eq("organization_id", org);
      if (off.error) return off.error;
    }
    const becomes = created ? " e agora é paciente" : "";
    return log(db, org, `${name} agendou ${procedure.name} para ${dayAt(now, startsAt)}${becomes}.`);
  });
}

async function undo(db: Db, org: string, created: string | null, error: PostgrestError) {
  if (created) await db.from("patients").delete().eq("id", created).eq("organization_id", org);
  return error;
}

const DONE_TEXT: Record<string, (name: string, procedure: string) => string> = {
  confirmado: (name) => `${name} confirmou presença.`,
  concluido: (name, procedure) => `${name}: ${procedure} finalizado. Estoque e próximo retorno atualizados.`,
  faltou: (name, procedure) => `${name} faltou ao atendimento de ${procedure}.`,
  cancelado: () => "Um cancelamento abriu um horário na agenda.",
};

/**
 * The outcome of a booking. Finishing one is where the modules meet: the
 * procedure's products leave the stock and the patient's next return is set.
 * Undoing it puts both back.
 */
export async function setAppointmentStatus(appointmentId: string, status: string): Promise<Result> {
  return write(async (db, org) => {
    const next = oneOf(status, APPOINTMENT_STATUSES, "o status");
    const { data: before, error } = await db
      .from("appointments")
      .select("status, patient_id, procedure_id, patients(name), procedures(name)")
      .eq("id", id(appointmentId))
      .eq("organization_id", org)
      .maybeSingle();
    if (error) return error;
    if (!before) throw new Invalid("Registro não encontrado.");
    if (before.status === next) return null;

    const changed = await db.from("appointments").update({ status: next }).eq("id", appointmentId).eq("organization_id", org);
    if (changed.error) return changed.error;
    if (next === "concluido" || before.status === "concluido") {
      const stock = await spendStock(db, org, before.procedure_id, next === "concluido" ? -1 : 1);
      if (stock) return stock;
    }
    const synced = await syncPatient(db, org, before.patient_id);
    if (synced) return synced;
    const say = DONE_TEXT[next];
    return say ? log(db, org, say(before.patients?.name ?? "Paciente", before.procedures?.name ?? "procedimento")) : null;
  });
}

export async function deleteAppointment(appointmentId: string): Promise<Result> {
  return write(async (db, org) => {
    const result = await db
      .from("appointments")
      .delete()
      .eq("id", id(appointmentId))
      .eq("organization_id", org)
      .select("patient_id, procedure_id, status");
    const error = affected(result);
    if (error) return error;
    const gone = result.data![0];
    if (gone.status === "concluido") {
      const stock = await spendStock(db, org, gone.procedure_id, 1);
      if (stock) return stock;
    }
    return syncPatient(db, org, gone.patient_id);
  });
}

/** Takes one session's products from the stock (-1) or gives them back (+1). */
async function spendStock(db: Db, org: string, procedureId: string, sign: 1 | -1) {
  const { data: uses, error } = await db
    .from("procedure_products")
    .select("product_id, quantity")
    .eq("organization_id", org)
    .eq("procedure_id", procedureId);
  if (error || !uses.length) return error;
  const { data: rows, error: lotsError } = await db
    .from("inventory_lots")
    .select("id, product_id, lot_code, quantity, expires_at")
    .eq("organization_id", org)
    .in(
      "product_id",
      uses.map((u) => u.product_id),
    );
  if (lotsError) return lotsError;

  const lots = rows.map(
    (l): InventoryLot => ({
      id: l.id,
      organizationId: org,
      productId: l.product_id,
      lotCode: l.lot_code,
      quantity: Number(l.quantity),
      expiresAt: new Date(l.expires_at).toISOString(),
    }),
  );
  const need = uses.map((u) => ({ productId: u.product_id, quantity: Number(u.quantity) }));
  const today = clinicNow();
  const moves = sign < 0 ? drawDown(lots, need, today) : restock(lots, need, today);
  for (const move of moves) {
    const lot = lots.find((l) => l.id === move.lotId)!;
    const quantity = Math.max(0, Math.round((lot.quantity + sign * move.quantity) * 1000) / 1000);
    lot.quantity = quantity;
    const saved = await db.from("inventory_lots").update({ quantity }).eq("id", lot.id).eq("organization_id", org);
    if (saved.error) return saved.error;
  }
  return null;
}

/** A patient's visits, spend and next return, recomputed from their completed appointments. */
async function syncPatient(db: Db, org: string, patientId: string) {
  const { data, error } = await db
    .from("appointments")
    .select("starts_at, procedures(price, return_days)")
    .eq("organization_id", org)
    .eq("patient_id", patientId)
    .eq("status", "concluido");
  if (error) return error;

  const summary = visitSummary(
    data.map((visit) => ({
      startsAt: new Date(visit.starts_at).toISOString(),
      price: visit.procedures?.price ?? 0,
      returnDays: visit.procedures?.return_days ?? 0,
    })),
  );
  return (
    await db
      .from("patients")
      .update({
        first_visit_at: summary.firstVisitAt ?? null,
        last_visit_at: summary.lastVisitAt ?? null,
        next_return_at: summary.nextReturnAt ?? null,
        total_spent: summary.totalSpent,
      })
      .eq("id", patientId)
      .eq("organization_id", org)
  ).error;
}

/* ── Waiting list ──────────────────────────────────────────── */

export async function addToWaitlist(form: FormData): Promise<Result> {
  return write(async (db, org) => {
    const entry = {
      organization_id: org,
      patient_id: id(required(text(form, "patientId"), "o paciente")),
      procedure_id: id(required(text(form, "procedureId"), "o procedimento")),
      period: oneOf(text(form, "period"), ["manha", "tarde"] as const, "o período"),
      created_at: clinicNow(),
    };
    return (await db.from("waitlist_entries").insert(entry)).error;
  });
}

export async function removeFromWaitlist(entryId: string): Promise<Result> {
  return write(async (db, org) =>
    affected(await db.from("waitlist_entries").delete().eq("id", id(entryId)).eq("organization_id", org).select("id")),
  );
}

/* ── Stock ─────────────────────────────────────────────────── */

/** "5", "0,5" or nothing: a product's minimum stock, when the clinic sets one. */
function minimum(form: FormData) {
  const value = text(form, "minQuantity");
  return value ? amount(value, "o estoque mínimo", { zero: true }) : null;
}

/** A product's name, unit, cost and minimum. Its lots stay as they are. */
export async function saveProduct(productId: string, form: FormData): Promise<Result> {
  return write(async (db, org) =>
    affected(
      await db
        .from("products")
        .update({
          name: required(text(form, "name"), "o nome do produto"),
          unit: required(text(form, "unit", 30), "a unidade"),
          unit_cost: cents(text(form, "unitCost"), "o custo por unidade"),
          min_quantity: minimum(form),
        })
        .eq("id", id(productId))
        .eq("organization_id", org)
        .select("id"),
    ),
  );
}

/** A delivery: a lot of a product the clinic has, or of one it registers now. */
export async function stockIn(form: FormData): Promise<Result> {
  return write(async (db, org) => {
    const lot = {
      lot_code: required(text(form, "lotCode", 60), "o lote"),
      quantity: amount(text(form, "quantity"), "a quantidade"),
      expires_at: isoDate(text(form, "expiresAt"), "a validade"),
    };
    let productId = text(form, "productId");
    let name = "";
    if (productId && productId !== "novo") {
      const { data, error } = await db.from("products").select("id, name").eq("id", id(productId)).eq("organization_id", org).maybeSingle();
      if (error) return error;
      if (!data) throw new Invalid("Produto não encontrado.");
      name = data.name;
    } else {
      name = required(text(form, "name"), "o nome do produto");
      const min = minimum(form);
      const { data, error } = await db
        .from("products")
        .insert({
          organization_id: org,
          name,
          unit: required(text(form, "unit", 30), "a unidade"),
          unit_cost: cents(text(form, "unitCost"), "o custo por unidade"),
          // Sent only when set: a clinic still before migration 0004 can stock in.
          ...(min === null ? {} : { min_quantity: min }),
        })
        .select("id")
        .single();
      if (error) return error;
      productId = data.id;
    }
    const inserted = await db.from("inventory_lots").insert({ ...lot, organization_id: org, product_id: productId });
    return inserted.error ?? log(db, org, `Entrada no estoque: ${name}, lote ${lot.lot_code}.`);
  });
}

const REASONS = { uso: "uso fora da agenda", perda: "perda ou vencimento", contagem: "contagem" } as const;

/** Sets a lot to what is really on the shelf, and says why. */
export async function adjustLot(lotId: string, form: FormData): Promise<Result> {
  return write(async (db, org) => {
    const quantity = amount(text(form, "quantity"), "a quantidade atual", { zero: true });
    const reason = oneOf(text(form, "reason"), Object.keys(REASONS) as (keyof typeof REASONS)[], "o motivo");
    const result = await db
      .from("inventory_lots")
      .update({ quantity })
      .eq("id", id(lotId))
      .eq("organization_id", org)
      .select("lot_code, products(name)");
    const error = affected(result);
    if (error) return error;
    const lot = result.data![0];
    return log(db, org, `Estoque ajustado (${REASONS[reason]}): ${lot.products?.name ?? "produto"}, lote ${lot.lot_code}.`);
  });
}

/* ── The clinic and the account (Configurações) ───────────── */

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** The clinic's profile, by its owner: the same fields as onboarding. Row-level security checks the owner again (migration 0004). */
export async function updateClinic(form: FormData): Promise<Result> {
  return write(async (db, org, who) => {
    if (who.role !== "owner") throw new Invalid("Só o responsável pela clínica pode mudar estes dados.");
    const whatsapp = text(form, "whatsapp", 40);
    if (whatsapp.replace(/\D/g, "").length < 10) throw new Invalid("Informe o WhatsApp da clínica com DDD.");
    const opens = text(form, "opens", 5);
    const closes = text(form, "closes", 5);
    if (!TIME.test(opens) || !TIME.test(closes) || opens >= closes) throw new Invalid("Confira o horário de funcionamento.");
    const days = [...new Set(form.getAll("days").map(Number))].filter((d) => Number.isInteger(d) && d >= 0 && d <= 6).sort();
    if (!days.length) throw new Invalid("Escolha ao menos um dia de atendimento.");
    const logo = logoFrom(form);
    if (logo && !(await logoFormat(logo))) throw new Invalid(LOGO_ERROR);

    const error = affected(
      await db
        .from("organizations")
        .update({
          name: required(text(form, "clinic", 120), "o nome da clínica"),
          whatsapp,
          segment: oneOf(text(form, "segment"), SEGMENTS, "o tipo de clínica"),
          team_size: oneOf(text(form, "team"), TEAM_SIZES, "quantos profissionais atendem"),
          opening_time: opens,
          closing_time: closes,
          work_days: days,
        })
        .eq("id", org)
        .select("id"),
    );
    if (error || !logo) return error;
    // Only the server writes to the logos' bucket, after the checks above.
    let saved = false;
    try {
      saved = await saveLogo(createAdminClient(), org, logo);
    } catch (cause) {
      console.error("updateClinic: logo", cause);
    }
    if (!saved) throw new Invalid("Os dados foram salvos, mas o logo não. Tente de novo.");
    return null;
  });
}

/** The signed-in person's own name at the clinic. Nothing else of the membership can change here (migration 0004). */
export async function updateAccount(form: FormData): Promise<Result> {
  return write(async (db, org, who) =>
    affected(
      await db
        .from("members")
        .update({ name: required(text(form, "name", 120), "o seu nome") })
        .eq("organization_id", org)
        .eq("user_id", who.userId)
        .select("user_id"),
    ),
  );
}

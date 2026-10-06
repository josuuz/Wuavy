"use server";

import type { PostgrestError } from "@supabase/supabase-js";

import { clinicNow } from "./clock";
import { dayAt } from "./format";
import { createAdminClient } from "@/lib/supabase/admin";
import { LOGO_ERROR, logoFormat, logoFrom, saveLogo } from "./logo";
import { getSession } from "./session";
import {
  APPOINTMENT_STATUSES,
  LEAD_SOURCES,
  LEAD_STAGES,
  PROCEDURE_CATEGORIES,
  SEGMENTS,
  TEAM_SIZES,
  type AppointmentSupply,
} from "./types";
import {
  Invalid,
  affected,
  amount,
  cents,
  id,
  isoDate,
  oneOf,
  optionalId,
  required,
  text,
  whole,
  write,
  type Db,
  type Result,
} from "./write";

/*
  The real Pulse's writes: contacts, patients, procedures, the agenda, the
  stock, and the clinic's own profile. Each one takes the clinic from the
  verified session, never from the browser, says which roles may make it
  (lib/flow/roles.ts), checks its input, scopes every query to that clinic
  (row-level security enforces both again) and refreshes the route, so the
  screen shows the database (lib/flow/write.ts). A visit's status, its
  money and its stock change together in the database, in one transaction
  (migration 0009).
*/

export type { Result };

/** The stages a contact can be in before booking: "agendado" is reached by booking. */
const OPEN_STAGES = LEAD_STAGES.filter((stage) => stage !== "agendado");

async function log(db: Db, org: string, text: string) {
  return (await db.from("activities").insert({ organization_id: org, at: clinicNow(), text })).error;
}

/**
 * A deposit, from the booking form: a percentage of the procedure's price or a
 * fixed amount, due by a date (the day of the booking when none is given).
 * No deposit: nothing to write.
 */
function depositOf(form: FormData, price: number, startsAt: string) {
  const kind = text(form, "depositKind");
  if (!kind) return null;
  let value: number;
  if (kind === "percent") {
    const pct = Number(text(form, "depositValue").replace(",", "."));
    if (!Number.isFinite(pct) || pct <= 0 || pct > 100) throw new Invalid("Informe o sinal entre 1% e 100%.");
    value = Math.round((price * pct) / 100);
  } else if (kind === "fixed") {
    value = cents(text(form, "depositValue"), "o valor do sinal");
  } else throw new Invalid("Escolha como cobrar o sinal.");
  if (value <= 0) throw new Invalid("O sinal precisa ser maior que zero.");
  if (value > price && price > 0) throw new Invalid("O sinal não pode passar do preço do procedimento.");
  const due = text(form, "depositDue") ? isoDate(text(form, "depositDue"), "o vencimento do sinal") : startsAt.slice(0, 10);
  const percent = kind === "percent" ? Math.round(Number(text(form, "depositValue").replace(",", "."))) : null;
  // Marked paid by hand until a payment provider exists (migration 0008).
  return { deposit_cents: value, deposit_due: due, deposit_percent: percent, deposit_provider: "manual" };
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
      const result = await db.from("leads").update(lead).eq("id", id(leadId)).eq("organization_id", org).select("patient_id");
      const error = affected(result);
      if (error) return error;
      // One person, one name: a contact who is also a patient changes in both places.
      const patientId = result.data?.[0]?.patient_id;
      return patientId
        ? (await db.from("patients").update({ name: lead.name, phone: lead.phone }).eq("id", patientId).eq("organization_id", org)).error
        : null;
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
  }, (can) => can.sales);
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
  }, (can) => can.sales);
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
  }, (can) => can.sales);
}

export async function deleteLead(leadId: string): Promise<Result> {
  return write(
    async (db, org) => affected(await db.from("leads").delete().eq("id", id(leadId)).eq("organization_id", org).select("id")),
    (can) => can.sales,
  );
}

/* ── Patients ──────────────────────────────────────────────── */

/**
 * A patient, and optionally a visit from before the Pulse (a day and a
 * procedure): it is recorded as a finished appointment, so the last visit,
 * the spend and the next return follow from it as from any other, and the
 * return engine has something to work with from the first day. The stock is
 * not touched: that session's products were used long ago. Its money has no
 * snapshot (nobody knows that day's costs): Indicadores counts it as an
 * estimate.
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
      // The contacts this patient came from carry the same name and phone.
      const synced = await db
        .from("leads")
        .update({ name: patient.name, phone: patient.phone })
        .eq("patient_id", patientId)
        .eq("organization_id", org);
      if (synced.error) return synced.error;
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
    return added.error ?? (await db.rpc("pulse_refresh_patient", { patient: saved! })).error;
  }, (can) => can.patients);
}

/** Their appointments, records, conversation and waiting-list entries go with them (the schema cascades). Owner only. */
export async function deletePatient(patientId: string): Promise<Result> {
  return write(
    async (db, org) => affected(await db.from("patients").delete().eq("id", id(patientId)).eq("organization_id", org).select("id")),
    (can) => can.deletePatients,
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
  }, (can) => can.procedures);
}

export async function deleteProcedure(procedureId: string): Promise<Result> {
  return write(async (db, org) => {
    const result = await db.from("procedures").delete().eq("id", id(procedureId)).eq("organization_id", org).select("id");
    if (result.error?.code === "23503") {
      throw new Invalid("Este procedimento tem agendamentos ou lista de espera e não pode ser excluído.");
    }
    return affected(result);
  }, (can) => can.procedures);
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
      // Sent only when asked: a booking without a deposit works before migration 0007.
      ...depositOf(form, procedure.price, startsAt),
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
      // The earlier booking is cancelled the way every status changes (migration 0009); an old one that
      // already happened stays as it is.
      const { data: old } = await db.from("appointments").select("status").eq("id", replaces).eq("organization_id", org).maybeSingle();
      if (old && (old.status === "agendado" || old.status === "confirmado")) {
        const moved = await db.rpc("pulse_set_appointment_status", { appointment: replaces, next_status: "cancelado" });
        if (moved.error) return moved.error;
      }
    }
    if (waitlistId) {
      const off = await db.from("waitlist_entries").delete().eq("id", waitlistId).eq("organization_id", org);
      if (off.error) return off.error;
    }
    const becomes = created ? " e agora é paciente" : "";
    return log(db, org, `${name} agendou ${procedure.name} para ${dayAt(now, startsAt)}${becomes}.`);
  }, (can) => can.book);
}

async function undo(db: Db, org: string, created: string | null, error: PostgrestError) {
  if (created) await db.from("patients").delete().eq("id", created).eq("organization_id", org);
  return error;
}

/**
 * The outcome of a booking: confirmed, a no-show, cancelled, or back to open.
 * The database decides who may (a professional, only their own visits) and
 * keeps the stock, the patient's summary and the log in step.
 */
export async function setAppointmentStatus(appointmentId: string, status: string): Promise<Result> {
  return write(async (db) => {
    const next = oneOf(status, APPOINTMENT_STATUSES, "o status");
    return (await db.rpc("pulse_set_appointment_status", { appointment: id(appointmentId), next_status: next })).error;
  });
}

/**
 * Finishing a visit, where the modules meet: what was charged (the
 * procedure's price unless the form says otherwise) and the products used
 * (the procedure's own unless adjusted). The database takes them from the
 * stock and freezes the visit's money at today's costs, all at once
 * (pulse_set_appointment_status, migration 0009): a later change in a
 * product's cost never touches it.
 */
export async function finishAppointment(appointmentId: string, form: FormData): Promise<Result> {
  return write(async (db) => {
    const charged = text(form, "charged");
    const products = form.getAll("supplyProduct").map(String);
    const quantities = form.getAll("supplyQuantity").map(String);
    const supplies = products.length
      ? products.map((product, i) => ({
          product_id: id(product),
          quantity: amount(quantities[i] ?? "", "a quantidade de cada produto usado", { zero: true }),
        }))
      : null;
    return (
      await db.rpc("pulse_set_appointment_status", {
        appointment: id(appointmentId),
        next_status: "concluido",
        charged: charged ? cents(charged, "o valor cobrado") : undefined,
        supplies: supplies ?? undefined,
      })
    ).error;
  });
}

/** Asks, changes or removes a booking's deposit. Removing it forgets that it was paid. */
export async function saveDeposit(appointmentId: string, form: FormData): Promise<Result> {
  return write(async (db, org) => {
    const { data, error } = await db
      .from("appointments")
      .select("starts_at, procedures(price)")
      .eq("id", id(appointmentId))
      .eq("organization_id", org)
      .maybeSingle();
    if (error) return error;
    if (!data) throw new Invalid("Registro não encontrado.");
    const deposit = depositOf(form, data.procedures?.price ?? 0, data.starts_at);
    return affected(
      await db
        .from("appointments")
        .update(
          deposit ?? {
            deposit_cents: null,
            deposit_due: null,
            deposit_paid_at: null,
            deposit_percent: null,
            deposit_provider: null,
            deposit_payment_id: null,
          },
        )
        .eq("id", appointmentId)
        .eq("organization_id", org)
        .select("id"),
    );
  }, (can) => can.book);
}

/** The deposit was received (or that was a mistake). Marked by hand until payments run through the Pulse. */
export async function setDepositPaid(appointmentId: string, paid: boolean): Promise<Result> {
  return write(
    async (db, org) =>
      affected(
        await db
          .from("appointments")
          .update({ deposit_paid_at: paid ? new Date().toISOString() : null })
          .eq("id", id(appointmentId))
          .eq("organization_id", org)
          .not("deposit_cents", "is", null)
          .select("id"),
      ),
    (can) => can.book,
  );
}

/** A finished visit only by the owner: its products go back to the stock and its snapshot goes with it. */
export async function deleteAppointment(appointmentId: string): Promise<Result> {
  return write(
    async (db) => (await db.rpc("pulse_delete_appointment", { appointment: id(appointmentId) })).error,
    (can) => can.book,
  );
}

/** What a finished visit used and what each product cost that day. The owner's only (the database returns nothing to anyone else). */
export async function visitSupplies(appointmentId: string): Promise<AppointmentSupply[]> {
  const session = await getSession();
  if (!session?.member || !/^[0-9a-f-]{36}$/i.test(appointmentId)) return [];
  const { data } = await session.supabase
    .from("appointment_supplies")
    .select("product_id, product_name, unit, quantity_used, unit_cost_snapshot, total_cost_snapshot")
    .eq("organization_id", session.member.organization_id)
    .eq("appointment_id", appointmentId);
  return (data ?? []).map((s) => ({
    productId: s.product_id ?? undefined,
    productName: s.product_name,
    unit: s.unit,
    quantity: Number(s.quantity_used),
    unitCost: s.unit_cost_snapshot,
    totalCost: s.total_cost_snapshot,
  }));
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
  }, (can) => can.book);
}

export async function removeFromWaitlist(entryId: string): Promise<Result> {
  return write(
    async (db, org) => affected(await db.from("waitlist_entries").delete().eq("id", id(entryId)).eq("organization_id", org).select("id")),
    (can) => can.book,
  );
}

/* ── Stock ─────────────────────────────────────────────────── */

/** "5", "0,5" or nothing: a product's minimum stock, when the clinic sets one. */
function minimum(form: FormData) {
  const value = text(form, "minQuantity");
  return value ? amount(value, "o estoque mínimo", { zero: true }) : null;
}

/** A product's name, unit and minimum, and its cost when the owner edits it. Its lots stay as they are. */
export async function saveProduct(productId: string, form: FormData): Promise<Result> {
  return write(
    async (db, org, who) =>
      affected(
        await db
          .from("products")
          .update({
            name: required(text(form, "name"), "o nome do produto"),
            unit: required(text(form, "unit", 30), "a unidade"),
            // Only the owner sees and changes costs (the database refuses anyone else's).
            ...(who.can.finance ? { unit_cost: cents(text(form, "unitCost"), "o custo por unidade") } : {}),
            min_quantity: minimum(form),
            brand: text(form, "brand", 80) || null,
            category: text(form, "category", 60) || null,
            supplier: text(form, "supplier", 120) || null,
          })
          .eq("id", id(productId))
          .eq("organization_id", org)
          .select("id"),
      ),
    (can) => can.stock,
  );
}

/** A delivery: a lot of a product the clinic has, or of one it registers now (with its cost, from the invoice). */
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
          ...(min === null ? {} : { min_quantity: min }),
          ...(text(form, "brand", 80) ? { brand: text(form, "brand", 80) } : {}),
          ...(text(form, "category", 60) ? { category: text(form, "category", 60) } : {}),
          ...(text(form, "supplier", 120) ? { supplier: text(form, "supplier", 120) } : {}),
        })
        .select("id")
        .single();
      if (error) return error;
      productId = data.id;
    }
    const inserted = await db.from("inventory_lots").insert({ ...lot, organization_id: org, product_id: productId });
    return inserted.error ?? log(db, org, `Entrada no estoque: ${name}, lote ${lot.lot_code}.`);
  }, (can) => can.stock);
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
  }, (can) => can.stock);
}

/* ── The clinic and the account (Configurações) ───────────── */

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** The clinic's profile, by its owner: the same fields as onboarding. Row-level security checks the owner again (migration 0004). */
export async function updateClinic(form: FormData): Promise<Result> {
  return write(async (db, org) => {
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
          address: text(form, "address", 200) || null,
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
  }, (can) => can.admin);
}

/**
 * A clinical record: written and read only by the owner and the professionals
 * (the database refuses anyone else, and a professional writes only for the
 * patients of their own agenda, migration 0009). Edited in place; never
 * deleted from the Pulse. The author and the last editor are stamped by the
 * database.
 */
export async function saveRecord(recordId: string | null, patientId: string, form: FormData): Promise<Result> {
  return write(async (db, org) => {
    const chief_complaint = text(form, "chiefComplaint", 500) || null;
    const notes = text(form, "notes", 8000) || null;
    if (!chief_complaint && !notes) throw new Invalid("Escreva a queixa principal ou a evolução.");
    const recorded_at = text(form, "recordedAt") ? new Date(`${isoDate(text(form, "recordedAt"), "a data")}T12:00:00.000Z`).toISOString() : clinicNow();
    if (recordId) {
      return affected(
        await db
          .from("clinical_records")
          .update({ chief_complaint, notes, recorded_at })
          .eq("id", id(recordId))
          .eq("organization_id", org)
          .select("id"),
      );
    }
    return (await db.from("clinical_records").insert({ organization_id: org, patient_id: id(patientId), chief_complaint, notes, recorded_at })).error;
  }, (can) => can.records);
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

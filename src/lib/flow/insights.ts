import { daysFrom } from "./format";
import type {
  Appointment,
  FlowData,
  ID,
  InventoryLot,
  Opportunity,
  OpportunityKind,
  OpportunityStatus,
  Patient,
  Procedure,
} from "./types";

/*
  How the Flow finds opportunities. Plain functions over FlowData: the same
  rules run on the demo's data today and on a clinic's real data later.
*/

export const STALE_DAYS = 3; // a quote without an answer for this long is a stuck lead
export const RETURN_WINDOW = [-45, 14] as const; // days around the typical return date
export const EXPIRY_DAYS = 45; // a lot this close to its date is near expiry
// The clinic's daily grid (demo: one room). Hours are stored as the clinic's time.
export const SLOT_TIMES = [
  [9, 0],
  [10, 0],
  [11, 0],
  [13, 0],
  [14, 0],
  [15, 0],
  [16, 30],
  [17, 30],
] as const;

const byId = <T extends { id: ID }>(list: T[]) => new Map(list.map((x) => [x.id, x]));
const upcoming = (a: Appointment, now: string) =>
  (a.status === "agendado" || a.status === "confirmado") && a.startsAt >= now;

export function procedureOf(d: FlowData, id: ID): Procedure | undefined {
  return d.procedures.find((p) => p.id === id);
}

/* ── Leads ─────────────────────────────────────────────────── */

export function stuckLeads(d: FlowData) {
  return d.leads
    .filter(
      (l) => l.stage === "orcamento" && l.quoteSentAt && daysFrom(d.now, l.lastContactAt) <= -STALE_DAYS,
    )
    .sort((a, b) => b.potentialValue - a.potentialValue);
}

/* ── Patients ──────────────────────────────────────────────── */

export function history(d: FlowData, patientId: ID) {
  return d.appointments
    .filter((a) => a.patientId === patientId && a.status === "concluido")
    .sort((a, b) => b.startsAt.localeCompare(a.startsAt));
}

export function hasUpcoming(d: FlowData, patientId: ID) {
  return d.appointments.some((a) => a.patientId === patientId && upcoming(a, d.now));
}

export function dueReturns(d: FlowData) {
  const [from, to] = RETURN_WINDOW;
  return d.patients
    .filter((p) => {
      if (!p.nextReturnAt || hasUpcoming(d, p.id)) return false;
      const days = daysFrom(d.now, p.nextReturnAt);
      return days >= from && days <= to;
    })
    .sort((a, b) => (a.nextReturnAt ?? "").localeCompare(b.nextReturnAt ?? ""));
}

/** The price of the patient's last procedure: what a return is likely worth. */
export function returnValue(d: FlowData, p: Patient) {
  const last = history(d, p.id)[0];
  return last ? (procedureOf(d, last.procedureId)?.price ?? 0) : 0;
}

/* ── Stock ─────────────────────────────────────────────────── */

export type LotStatus = "normal" | "atencao" | "proximo";

export function lotStatus(d: FlowData, lot: InventoryLot): LotStatus {
  const days = daysFrom(d.now, lot.expiresAt);
  if (days <= EXPIRY_DAYS) return "proximo";
  if (days <= 90 || lot.quantity <= 2) return "atencao";
  return "normal";
}

export function lotValue(d: FlowData, lot: InventoryLot) {
  const product = d.products.find((p) => p.id === lot.productId);
  return product ? product.unitCost * lot.quantity : 0;
}

export function proceduresUsing(d: FlowData, productId: ID) {
  const procedures = byId(d.procedures);
  return d.procedureProducts
    .filter((pp) => pp.productId === productId)
    .map((pp) => ({ procedure: procedures.get(pp.procedureId)!, quantity: pp.quantity }))
    .filter((x) => x.procedure);
}

export function expiringLots(d: FlowData) {
  return d.lots
    .filter((lot) => lot.quantity > 0 && lotStatus(d, lot) === "proximo")
    .sort((a, b) => a.expiresAt.localeCompare(b.expiresAt));
}

/** Patients who already did one of these procedures and have nothing booked. */
export function patientsFor(d: FlowData, procedureIds: ID[]) {
  const wanted = new Set(procedureIds);
  return d.patients
    .filter((p) => !hasUpcoming(d, p.id) && history(d, p.id).some((a) => wanted.has(a.procedureId)))
    .sort((a, b) => (a.nextReturnAt ?? "").localeCompare(b.nextReturnAt ?? ""));
}

/* ── Schedule ──────────────────────────────────────────────── */

export type SlotStatus = "ocupado" | "livre" | "cancelado";

export interface Slot {
  startsAt: string;
  status: SlotStatus;
  appointment?: Appointment;
}

/** Same construction as the data's own dates, so the strings compare exactly. */
export function slotTime(d: FlowData, dayOffset: number, h: number, m: number) {
  const n = new Date(d.now);
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate() + dayOffset, h, m)).toISOString();
}

export function daySlots(d: FlowData, dayOffset: number): Slot[] {
  return SLOT_TIMES.map(([h, m]) => {
    const startsAt = slotTime(d, dayOffset, h, m);
    const here = d.appointments.filter((a) => a.startsAt === startsAt);
    const booked = here.find((a) => a.status !== "cancelado");
    if (booked) return { startsAt, status: "ocupado" as const, appointment: booked };
    const cancelled = here.find((a) => a.status === "cancelado");
    return cancelled
      ? { startsAt, status: "cancelado" as const, appointment: cancelled }
      : { startsAt, status: "livre" as const };
  });
}

export function openSlots(d: FlowData) {
  return daySlots(d, 1).filter((s) => s.status !== "ocupado");
}

/** Who could take a free slot: the waiting list for that part of the day first. */
export function slotCandidates(d: FlowData, startsAt: string) {
  const period = new Date(startsAt).getUTCHours() < 12 ? "manha" : "tarde";
  const patients = byId(d.patients);
  return d.waitlist
    .filter((w) => w.period === period && !hasUpcoming(d, w.patientId))
    .map((w) => ({ patient: patients.get(w.patientId)!, procedure: procedureOf(d, w.procedureId)! }))
    .filter((c) => c.patient && c.procedure);
}

/** The average ticket of the last 90 days: what an empty hour is likely worth. */
export function averageTicket(d: FlowData) {
  const recent = d.appointments.filter((a) => a.status === "concluido" && daysFrom(d.now, a.startsAt) >= -90);
  const total = recent.reduce((sum, a) => sum + (procedureOf(d, a.procedureId)?.price ?? 0), 0);
  return recent.length ? Math.round(total / recent.length) : 0;
}

/* ── Opportunities and results ─────────────────────────────── */

export function opportunities(d: FlowData, statuses: Partial<Record<OpportunityKind, OpportunityStatus>> = {}) {
  const leads = stuckLeads(d);
  const returns = dueReturns(d);
  const lots = expiringLots(d);
  const slots = openSlots(d);
  const make = (kind: OpportunityKind, refs: ID[], value: number): Opportunity => ({
    id: `opp_${kind}`,
    organizationId: d.organization.id,
    kind,
    count: refs.length,
    value,
    refs,
    status: statuses[kind] ?? "nova",
  });
  return [
    make("lead_followup", leads.map((l) => l.id), leads.reduce((s, l) => s + l.potentialValue, 0)),
    make("patient_return", returns.map((p) => p.id), returns.reduce((s, p) => s + returnValue(d, p), 0)),
    make("stock_expiry", lots.map((l) => l.id), lots.reduce((s, l) => s + lotValue(d, l), 0)),
    make("open_slot", slots.map((s) => s.startsAt), slots.length * averageTicket(d)),
  ];
}

/** Revenue the automations helped bring back in the last 30 days, by kind. */
export function recovered(d: FlowData) {
  const rules = byId(d.automationRules);
  const byKind = new Map<string, number>();
  let total = 0;
  for (const run of d.automationRuns) {
    if (daysFrom(d.now, run.ranAt) < -30 || !run.recovered) continue;
    const kind = rules.get(run.ruleId)?.kind ?? "post_visit";
    byKind.set(kind, (byKind.get(kind) ?? 0) + run.recovered);
    total += run.recovered;
  }
  return { total, byKind };
}

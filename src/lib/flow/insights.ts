import { daysFrom, plural } from "./format";
import type {
  Appointment,
  FlowData,
  ID,
  InventoryLot,
  Lead,
  Opportunity,
  OpportunityKind,
  OpportunityStatus,
  Patient,
  Procedure,
  Product,
} from "./types";

/*
  How the Pulse finds opportunities. Plain functions over FlowData: the same
  rules run on the demo's data today and on a clinic's real data later.
*/

export const STALE_DAYS = 3; // a quote without an answer for this long is a stuck lead
export const IDLE_DAYS = 2; // a contact not quoted yet, silent this long, is a stalled lead
export const CLOSED_DAYS = 30; // a contact who booked stays on the sales board this long
export const WEEK_AHEAD = 7; // "this week", counted from today
export const RETURN_WINDOW = [-45, 14] as const; // days around the typical return date
export const EXPIRY_DAYS = 45; // a lot this close to its date is near expiry
export const LOW_SESSIONS = 5; // stock for fewer sessions than this is running low
export const MISSED_DAYS = 14; // a no-show this recent still asks to be rebooked
// The clinic's daily grid (one room). Hours are stored as the clinic's time.
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
export const WEEK_DAYS = 6; // the week on the agenda: Monday to Saturday
const DAY_END = "19:00"; // the last hour of the grid ends here

const DAY = 86_400_000;
const byId = <T extends { id: ID }>(list: T[]) => new Map(list.map((x) => [x.id, x]));
const upcoming = (a: Appointment, now: string) =>
  (a.status === "agendado" || a.status === "confirmado") && a.startsAt >= now;
/** Stock is counted to the thousandth: 0.1 of a box, 0.05 of a litre. */
const round3 = (n: number) => Math.round(n * 1000) / 1000;

export function procedureOf(d: FlowData, id: ID): Procedure | undefined {
  return d.procedures.find((p) => p.id === id);
}

/* ── Sales ─────────────────────────────────────────────────── */

/** A quote sent and left unanswered for STALE_DAYS or more. */
export function staleQuote(d: FlowData, l: Lead) {
  return l.stage === "orcamento" && Boolean(l.quoteSentAt) && daysFrom(d.now, l.lastContactAt) <= -STALE_DAYS;
}

export function stuckLeads(d: FlowData) {
  return d.leads.filter((l) => staleQuote(d, l)).sort((a, b) => b.potentialValue - a.potentialValue);
}

/** Contacts not quoted yet (new, in conversation, evaluation) with no contact for IDLE_DAYS or more. */
export function idleLeads(d: FlowData) {
  return d.leads
    .filter(
      (l) =>
        (l.stage === "novo" || l.stage === "contato" || l.stage === "avaliacao") &&
        daysFrom(d.now, l.lastContactAt) <= -IDLE_DAYS,
    )
    .sort((a, b) => b.potentialValue - a.potentialValue);
}

/** People still being won: every stage before the booking. */
export function openLeads(d: FlowData) {
  return d.leads.filter((l) => l.stage !== "agendado");
}

/** On the board: everyone still open, and whoever booked in the last CLOSED_DAYS. */
export function onBoard(d: FlowData, l: Lead) {
  return l.stage !== "agendado" || daysFrom(d.now, l.lastContactAt) >= -CLOSED_DAYS;
}

/** A person's sales: how they arrived, and any quote since. Newest first. */
export function leadsOf(d: FlowData, patientId: ID) {
  return d.leads.filter((l) => l.patientId === patientId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/* ── Patients ──────────────────────────────────────────────── */

export function history(d: FlowData, patientId: ID) {
  return d.appointments
    .filter((a) => a.patientId === patientId && a.status === "concluido")
    .sort((a, b) => b.startsAt.localeCompare(a.startsAt));
}

/** Everything already past: done, missed, cancelled or not yet recorded. Newest first. */
export function pastFor(d: FlowData, patientId: ID) {
  return d.appointments
    .filter((a) => a.patientId === patientId && a.startsAt < d.now)
    .sort((a, b) => b.startsAt.localeCompare(a.startsAt));
}

export function upcomingFor(d: FlowData, patientId: ID) {
  return d.appointments
    .filter((a) => a.patientId === patientId && upcoming(a, d.now))
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

export function hasUpcoming(d: FlowData, patientId: ID) {
  return d.appointments.some((a) => a.patientId === patientId && upcoming(a, d.now));
}

function inReturnWindow(d: FlowData, p: Patient) {
  if (!p.nextReturnAt) return false;
  const days = daysFrom(d.now, p.nextReturnAt);
  return days >= RETURN_WINDOW[0] && days <= RETURN_WINDOW[1];
}

export function dueReturns(d: FlowData) {
  return d.patients
    .filter((p) => inReturnWindow(d, p) && !hasUpcoming(d, p.id))
    .sort((a, b) => (a.nextReturnAt ?? "").localeCompare(b.nextReturnAt ?? ""));
}

/** Due returns whose date has passed: the oldest first. */
export function overdueReturns(d: FlowData) {
  return dueReturns(d).filter((p) => daysFrom(d.now, p.nextReturnAt!) < 0);
}

/** Due returns that fall between today and WEEK_AHEAD days from now. */
export function returnsThisWeek(d: FlowData) {
  return dueReturns(d).filter((p) => {
    const days = daysFrom(d.now, p.nextReturnAt!);
    return days >= 0 && days <= WEEK_AHEAD;
  });
}

/** The top quarter of patients by spend, with nothing booked: the ones most worth bringing back. */
export function highValueIdle(d: FlowData) {
  const spent = d.patients
    .filter((p) => p.totalSpent > 0)
    .map((p) => p.totalSpent)
    .sort((a, b) => a - b);
  const bar = spent[Math.floor(spent.length * 0.75)] ?? Infinity;
  return d.patients.filter((p) => p.totalSpent >= bar && !hasUpcoming(d, p.id)).sort((a, b) => b.totalSpent - a.totalSpent);
}

/** The price of the patient's last procedure: what a return is likely worth. */
export function returnValue(d: FlowData, p: Patient) {
  const last = history(d, p.id)[0];
  return last ? (procedureOf(d, last.procedureId)?.price ?? 0) : 0;
}

/**
 * A patient's visits, spend and next return follow from their completed
 * appointments: the next return is the last one plus its procedure's interval.
 */
export function visitSummary(visits: { startsAt: string; price: number; returnDays: number }[]) {
  const sorted = [...visits].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const last = sorted.at(-1);
  return {
    firstVisitAt: sorted[0]?.startsAt,
    lastVisitAt: last?.startsAt,
    nextReturnAt: last ? new Date(Date.parse(last.startsAt) + last.returnDays * DAY).toISOString() : undefined,
    totalSpent: sorted.reduce((sum, v) => sum + v.price, 0),
  };
}

export type NextStep =
  | { kind: "agendado"; appointment: Appointment }
  | { kind: "faltou"; appointment: Appointment }
  | { kind: "retorno"; days: number }
  | { kind: "orcamento"; lead: Lead }
  | { kind: "primeiro" }
  | { kind: "em_dia" };

/** The one thing to do next for a patient, in order of urgency. */
export function nextStep(d: FlowData, p: Patient): NextStep {
  const next = upcomingFor(d, p.id)[0];
  if (next) return { kind: "agendado", appointment: next };
  const last = pastFor(d, p.id).find((a) => a.status !== "cancelado");
  if (last?.status === "faltou") return { kind: "faltou", appointment: last };
  if (inReturnWindow(d, p)) return { kind: "retorno", days: daysFrom(d.now, p.nextReturnAt!) };
  const quote = leadsOf(d, p.id).find((l) => l.stage !== "agendado");
  if (quote) return { kind: "orcamento", lead: quote };
  return p.lastVisitAt ? { kind: "em_dia" } : { kind: "primeiro" };
}

/** Recent no-shows with nothing booked since: each one asks to be rebooked. */
export function missed(d: FlowData) {
  return d.patients
    .map((p) => ({ patient: p, step: nextStep(d, p) }))
    .filter(
      (x): x is { patient: Patient; step: Extract<NextStep, { kind: "faltou" }> } =>
        x.step.kind === "faltou" && daysFrom(d.now, x.step.appointment.startsAt) >= -MISSED_DAYS,
    );
}

/* ── Stock ─────────────────────────────────────────────────── */

export type LotStatus = "vencido" | "proximo" | "atencao" | "normal";

export function lotStatus(d: FlowData, lot: InventoryLot): LotStatus {
  const days = daysFrom(d.now, lot.expiresAt);
  if (days < 0) return "vencido";
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

export interface StockLevel {
  product: Product;
  /** Usable units: lots in date, with something left. */
  quantity: number;
  /** How many sessions that covers, at the heaviest use; null if no procedure uses it. */
  sessions: number | null;
  status: "sem_estoque" | "baixo" | "ok";
}

/** Each product's usable stock, and whether it is running out. */
export function stockLevels(d: FlowData): StockLevel[] {
  return d.products.map((product) => {
    const quantity = round3(
      d.lots
        .filter((l) => l.productId === product.id && l.quantity > 0 && daysFrom(d.now, l.expiresAt) >= 0)
        .reduce((sum, l) => sum + l.quantity, 0),
    );
    const perSession = Math.max(0, ...d.procedureProducts.filter((pp) => pp.productId === product.id).map((pp) => pp.quantity));
    const sessions = perSession ? Math.floor(quantity / perSession + 1e-9) : null;
    const low = sessions === null ? quantity <= 1 : sessions < LOW_SESSIONS;
    return { product, quantity, sessions, status: quantity <= 0 ? "sem_estoque" : low ? "baixo" : "ok" };
  });
}

export function lowStock(d: FlowData) {
  return stockLevels(d)
    .filter((s) => s.status !== "ok")
    .sort((a, b) => (a.sessions ?? a.quantity) - (b.sessions ?? b.quantity));
}

type Use = { productId: ID; quantity: number };
type Take = { lotId: ID; quantity: number };

/** What one session takes from stock: the lot that expires first goes first, never an expired one. */
export function drawDown(lots: InventoryLot[], uses: Use[], today: string): Take[] {
  const takes: Take[] = [];
  for (const use of uses) {
    let need = use.quantity;
    const usable = lots
      .filter((l) => l.productId === use.productId && l.quantity > 0 && daysFrom(today, l.expiresAt) >= 0)
      .sort((a, b) => a.expiresAt.localeCompare(b.expiresAt));
    for (const lot of usable) {
      if (need <= 0) break;
      const take = round3(Math.min(lot.quantity, need));
      takes.push({ lotId: lot.id, quantity: take });
      need = round3(need - take);
    }
  }
  return takes;
}

/**
 * Undoing a session gives its products back to the lot that expires first
 * (in date if there is one): the product's total comes out right even when
 * the lot differs from the one it was taken from.
 */
export function restock(lots: InventoryLot[], uses: Use[], today: string): Take[] {
  return uses.flatMap((use) => {
    const own = lots.filter((l) => l.productId === use.productId).sort((a, b) => a.expiresAt.localeCompare(b.expiresAt));
    const lot = own.find((l) => daysFrom(today, l.expiresAt) >= 0) ?? own.at(-1);
    return lot ? [{ lotId: lot.id, quantity: use.quantity }] : [];
  });
}

/** Applies takes (sign -1) or returns (+1) to the lots. */
export function moveStock(lots: InventoryLot[], takes: Take[], sign: 1 | -1) {
  return lots.map((lot) => {
    const moved = takes.filter((t) => t.lotId === lot.id).reduce((sum, t) => sum + t.quantity, 0);
    return moved ? { ...lot, quantity: Math.max(0, round3(lot.quantity + sign * moved)) } : lot;
  });
}

/** Patients who already did one of these procedures and have nothing booked. */
export function patientsFor(d: FlowData, procedureIds: ID[]) {
  const wanted = new Set(procedureIds);
  return d.patients
    .filter((p) => !hasUpcoming(d, p.id) && history(d, p.id).some((a) => wanted.has(a.procedureId)))
    .sort((a, b) => (a.nextReturnAt ?? "").localeCompare(b.nextReturnAt ?? ""));
}

export interface ExpiryOpportunity {
  lot: InventoryLot;
  product?: Product;
  /** The procedures that use the product. */
  procedures: Procedure[];
  /** Everyone who already did one of them and has nothing booked. */
  patients: Patient[];
  /** Sessions the lot still covers, at the lightest use. */
  sessions: number;
  /** Revenue if the lot is used before its date, at the cheapest of those procedures. */
  potential: number;
}

/**
 * Each lot near its date as an opportunity: who could use it and what that
 * would bring. A patient counts toward one lot only, the one that expires
 * first, and a lot reaches no more people than it has sessions for.
 */
export function expiryOpportunities(d: FlowData): ExpiryOpportunity[] {
  const taken = new Set<ID>();
  return expiringLots(d).map((lot) => {
    const uses = proceduresUsing(d, lot.productId);
    const procedures = uses.map((u) => u.procedure);
    const patients = patientsFor(d, procedures.map((p) => p.id));
    const sessions = uses.length ? Math.floor(lot.quantity / Math.min(...uses.map((u) => u.quantity)) + 1e-9) : 0;
    const price = procedures.length ? Math.min(...procedures.map((p) => p.price)) : 0;
    const reach = patients.filter((p) => !taken.has(p.id)).slice(0, sessions);
    reach.forEach((p) => taken.add(p.id));
    return {
      lot,
      product: d.products.find((p) => p.id === lot.productId),
      procedures,
      patients,
      sessions,
      potential: reach.length * price,
    };
  });
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

/** A day's grid, plus any booking made outside it, so nothing booked goes missing. */
export function daySlots(d: FlowData, dayOffset: number): Slot[] {
  const grid = SLOT_TIMES.map(([h, m]) => slotTime(d, dayOffset, h, m));
  const date = grid[0].slice(0, 10);
  const off = d.appointments.filter((a) => a.startsAt.startsWith(date) && !grid.includes(a.startsAt)).map((a) => a.startsAt);
  return [...new Set([...grid, ...off])].sort().map((startsAt) => {
    const here = d.appointments.filter((a) => a.startsAt === startsAt);
    const booked = here.find((a) => a.status !== "cancelado");
    if (booked) return { startsAt, status: "ocupado" as const, appointment: booked };
    const cancelled = here.find((a) => a.status === "cancelado");
    return cancelled
      ? { startsAt, status: "cancelado" as const, appointment: cancelled }
      : { startsAt, status: "livre" as const };
  });
}

/** Free hours still ahead, today and tomorrow (Sundays closed): what a gap or a cancellation leaves to fill. */
export function openSlots(d: FlowData) {
  return [0, 1].flatMap((day) =>
    daySlots(d, day).filter((s) => s.status !== "ocupado" && s.startsAt > d.now && new Date(s.startsAt).getUTCDay() !== 0),
  );
}

/** Minutes from a free slot to the next booking that day, or to the end of the clinic's day. */
export function slotRoom(d: FlowData, startsAt: string) {
  const date = startsAt.slice(0, 10);
  const next = d.appointments
    .filter((a) => a.status !== "cancelado" && a.startsAt.startsWith(date) && a.startsAt > startsAt)
    .reduce((min, a) => (a.startsAt < min ? a.startsAt : min), `${date}T${DAY_END}:00.000Z`);
  return Math.round((Date.parse(next) - Date.parse(startsAt)) / 60_000);
}

/** The day offset of this week's Monday, `week` weeks away. On a Sunday the week ahead. */
export function weekStart(d: FlowData, week = 0) {
  const weekday = new Date(d.now).getUTCDay();
  return (weekday === 0 ? 1 : 1 - weekday) + week * 7;
}

/** Who sees patients: everyone but the front desk. */
export function professionals(d: FlowData) {
  return d.users.filter((u) => u.role !== "reception");
}

/** Bookings on a day still waiting for the patient's confirmation. */
export function awaiting(d: FlowData, dayOffset: number) {
  const date = slotTime(d, dayOffset, 0, 0).slice(0, 10);
  return d.appointments.filter((a) => a.status === "agendado" && a.startsAt.startsWith(date) && a.startsAt >= d.now);
}

/** Bookings whose time is over, in the last week, with no outcome recorded (done or missed). */
export function unrecorded(d: FlowData) {
  return d.appointments.filter(
    (a) =>
      (a.status === "agendado" || a.status === "confirmado") &&
      new Date(Date.parse(a.startsAt) + a.durationMin * 60_000).toISOString() < d.now &&
      daysFrom(d.now, a.startsAt) >= -7,
  );
}

export interface SlotMatch {
  patient: Patient;
  procedure: Procedure;
  /** How well the person fits the hour, 5 to 98: an order of who to call first, not a promise. */
  score: number;
  /** Why, in a few words each. */
  reasons: string[];
  waitlistId?: ID;
}

const PERIOD_WORD = { manha: "manhã", tarde: "tarde" } as const;
const periodOf = (iso: string) => (new Date(iso).getUTCHours() < 12 ? "manha" : "tarde");

/** The part of the day a patient's notes say they like, if they say. */
function prefers(p: Patient): "manha" | "tarde" | undefined {
  const notes = p.notes.toLowerCase();
  if (/tarde|fim do dia/.test(notes)) return "tarde";
  if (/manh[ãa]|cedo/.test(notes)) return "manha";
  return undefined;
}

/**
 * Who could take a free hour, best first: the waiting list (preferred part
 * of the day, how long they have waited), then patients due for a return.
 * Either way the procedure has to fit before the next booking.
 */
export function slotMatches(d: FlowData, startsAt: string, limit = 3): SlotMatch[] {
  const period = periodOf(startsAt);
  const room = slotRoom(d, startsAt);
  const patients = byId(d.patients);
  const fits = (p: Procedure) => p.durationMin <= room;
  const fitReason = (p: Procedure) => (fits(p) ? "procedimento compatível" : `precisa de ${p.durationMin} min`);
  const seen = new Set<ID>();
  const matches: SlotMatch[] = [];

  for (const w of d.waitlist) {
    const patient = patients.get(w.patientId);
    const procedure = procedureOf(d, w.procedureId);
    if (!patient || !procedure || hasUpcoming(d, patient.id)) continue;
    seen.add(patient.id);
    const waited = Math.max(0, -daysFrom(d.now, w.createdAt));
    matches.push({
      patient,
      procedure,
      waitlistId: w.id,
      score: 46 + (w.period === period ? 26 : 0) + (fits(procedure) ? 12 : -24) + Math.min(waited, 10),
      reasons: [`Prefere ${PERIOD_WORD[w.period]}`, fitReason(procedure), `aguardando há ${plural(waited, "dia", "dias")}`],
    });
  }

  for (const patient of dueReturns(d)) {
    if (seen.has(patient.id)) continue;
    const procedure = procedureOf(d, history(d, patient.id)[0]?.procedureId ?? "");
    if (!procedure) continue;
    const days = daysFrom(d.now, patient.nextReturnAt!);
    const likes = prefers(patient) === period;
    matches.push({
      patient,
      procedure,
      score: 36 + (likes ? 22 : 0) + (fits(procedure) ? 12 : -24) + (days >= -14 ? 14 : 6),
      reasons: [
        ...(likes ? [`Prefere ${PERIOD_WORD[period]}`] : []),
        fitReason(procedure),
        days < 0 ? `retorno atrasado há ${plural(-days, "dia", "dias")}` : days === 0 ? "retorno hoje" : `retorno em ${plural(days, "dia", "dias")}`,
      ],
    });
  }

  return matches
    .map((m) => ({ ...m, score: Math.max(5, Math.min(98, m.score)) }))
    .sort((a, b) => b.score - a.score || b.patient.totalSpent - a.patient.totalSpent)
    .slice(0, limit);
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
  const idle = idleLeads(d);
  const returns = dueReturns(d);
  const noShows = missed(d);
  const lots = expiryOpportunities(d);
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
    make("lead_idle", idle.map((l) => l.id), idle.reduce((s, l) => s + l.potentialValue, 0)),
    make("open_slot", slots.map((s) => s.startsAt), slots.length * averageTicket(d)),
    make("stock_expiry", lots.map((x) => x.lot.id), lots.reduce((s, x) => s + x.potential, 0)),
    make(
      "no_show",
      noShows.map((x) => x.patient.id),
      noShows.reduce((s, x) => s + (procedureOf(d, x.step.appointment.procedureId)?.price ?? 0), 0),
    ),
  ];
}

/**
 * The clinic's money in broad strokes, read from the agenda: what was done
 * in the last 30 days and what is booked for the next 30. Payments are not
 * recorded yet, so nothing here is receivable or overdue.
 */
export function finance(d: FlowData) {
  const price = (a: Appointment) => procedureOf(d, a.procedureId)?.price ?? 0;
  const done = d.appointments.filter((a) => a.status === "concluido" && daysFrom(d.now, a.startsAt) >= -30);
  const ahead = d.appointments.filter((a) => upcoming(a, d.now) && daysFrom(d.now, a.startsAt) <= 30);
  const realized = done.reduce((s, a) => s + price(a), 0);
  return {
    realized,
    visits: done.length,
    forecast: ahead.reduce((s, a) => s + price(a), 0),
    booked: ahead.length,
    ticket: done.length ? Math.round(realized / done.length) : 0,
  };
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

/**
 * What the Pulse found and brought back in the last 30 days: the case a trial
 * makes for itself. The same count over the demo's data or a real clinic's.
 */
export function valueDelivered(d: FlowData, ops: Opportunity[]) {
  const rules = byId(d.automationRules);
  const back = new Map<string, number>();
  for (const run of d.automationRuns) {
    if (daysFrom(d.now, run.ranAt) < -30 || !run.recovered) continue;
    const kind = rules.get(run.ruleId)?.kind ?? "post_visit";
    back.set(kind, (back.get(kind) ?? 0) + (run.converted ?? 1));
  }
  return {
    found: ops.reduce((n, o) => n + o.count, 0),
    quotes: back.get("lead_followup") ?? 0,
    leads: back.get("lead_idle") ?? 0,
    patients: (back.get("patient_return") ?? 0) + (back.get("no_show") ?? 0),
    slots: back.get("open_slot") ?? 0,
    revenue: recovered(d).total,
  };
}

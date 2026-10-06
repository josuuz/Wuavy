import { daysFrom, plural } from "./format";
import { daySlots, expiringLots, hasUpcoming, LAPSED_DAYS, procedureOf } from "./insights";
import type { Appointment, AppointmentFinancial, FlowData, ID } from "./types";

/*
  Indicadores: the few numbers that say how the clinic is doing over a
  period, the charts behind them, and what the Pulse reads in them. A period
  is a span of whole days in the clinic's clock, ending today; each number is
  compared with the span of the same length just before it.

  Two kinds of cost, never mixed. The past is read from each finished
  visit's snapshot, frozen when it was finished (what was charged, what its
  products cost that day; migration 0009): September's profit stays
  September's when a product's price changes in October. Today's costs
  (procedureCost) only estimate what a procedure costs now, for pricing. A
  visit finished before snapshots existed has none: its money is estimated
  from today's price and costs, counted apart (`estimated`) and said so,
  never presented as exact.
*/

export interface Period {
  /** First day, inclusive, as a day offset from today (negative: in the past). */
  from: number;
  /** Last day, inclusive. */
  to: number;
}

export const periodDays = (p: Period) => p.to - p.from + 1;
const previous = (p: Period): Period => ({ from: p.from - periodDays(p), to: p.from - 1 });

const inPeriod = (d: FlowData, iso: string, p: Period) => {
  const day = daysFrom(d.now, iso);
  return day >= p.from && day <= p.to;
};

/** The product cost of one session of a procedure at today's costs: what it would cost now. Never the past's cost. */
export function procedureCost(d: FlowData, procedureId: ID) {
  return Math.round(
    d.procedureProducts
      .filter((pp) => pp.procedureId === procedureId)
      .reduce((sum, pp) => sum + pp.quantity * (d.products.find((p) => p.id === pp.productId)?.unitCost ?? 0), 0),
  );
}

const done = (d: FlowData, p: Period) => d.appointments.filter((a) => a.status === "concluido" && inPeriod(d, a.startsAt, p));

const snapshots = new WeakMap<AppointmentFinancial[], Map<ID, AppointmentFinancial>>();
/** Each finished visit's snapshot, by visit. */
function snapshotOf(d: FlowData, a: Appointment) {
  let byVisit = snapshots.get(d.financials);
  if (!byVisit) {
    byVisit = new Map(d.financials.map((f) => [f.appointmentId, f]));
    snapshots.set(d.financials, byVisit);
  }
  return byVisit.get(a.id);
}

/**
 * A finished visit's money: its snapshot, exact; or, for a visit from before
 * snapshots, what was charged (the procedure's price today when unknown) less
 * today's product costs, marked as an estimate.
 */
export function visitMoney(d: FlowData, a: Appointment) {
  const snapshot = snapshotOf(d, a);
  if (snapshot) return { revenue: snapshot.priceCharged, cost: snapshot.totalCost, profit: snapshot.grossProfit, estimated: false };
  const revenue = a.priceCharged ?? procedureOf(d, a.procedureId)?.price ?? 0;
  const cost = procedureCost(d, a.procedureId);
  return { revenue, cost, profit: revenue - cost, estimated: true };
}

export interface Numbers {
  revenue: number;
  profit: number;
  /** Visits in the period whose profit is an estimate (finished before snapshots existed). */
  estimated: number;
  ticket: number;
  patients: number;
  /** Seen for the first time in the period. */
  newPatients: number;
  /** Seen in the period, and before it too. */
  returning: number;
  /** Contacts who came in during the period and booked, out of all who came in; null without contacts. */
  conversion: number | null;
}

export function numbers(d: FlowData, p: Period): Numbers {
  const visits = done(d, p);
  const money = visits.map((a) => visitMoney(d, a));
  const revenue = money.reduce((s, m) => s + m.revenue, 0);
  const profit = money.reduce((s, m) => s + m.profit, 0);
  const leads = d.leads.filter((l) => inPeriod(d, l.createdAt, p));
  const seen = new Set(visits.map((a) => a.patientId));
  // A patient's first finished visit ever: in the period, they are new; before it, they came back.
  const first = new Map<ID, string>();
  for (const a of d.appointments) {
    if (a.status === "concluido" && seen.has(a.patientId) && (!first.has(a.patientId) || a.startsAt < first.get(a.patientId)!)) {
      first.set(a.patientId, a.startsAt);
    }
  }
  const newPatients = [...seen].filter((id) => inPeriod(d, first.get(id)!, p)).length;
  return {
    revenue,
    profit,
    estimated: money.filter((m) => m.estimated).length,
    ticket: visits.length ? Math.round(revenue / visits.length) : 0,
    patients: seen.size,
    newPatients,
    returning: seen.size - newPatients,
    conversion: leads.length ? Math.round((leads.filter((l) => l.stage === "agendado").length / leads.length) * 100) : null,
  };
}

/** The same numbers for the span just before: what the deltas compare with. */
export const before = (d: FlowData, p: Period) => numbers(d, previous(p));

/** Percent change, or null when there is nothing to compare with. */
export const change = (now: number, then: number) => (then > 0 ? Math.round(((now - then) / then) * 100) : null);

/** Revenue and estimated profit over the period: by day up to a month, by week beyond. */
export function revenueSeries(d: FlowData, p: Period) {
  const step = periodDays(p) > 35 ? 7 : 1;
  const buckets: { label: string; value: number; profit: number }[] = [];
  for (let start = p.from; start <= p.to; start += step) {
    const end = Math.min(p.to, start + step - 1);
    const money = done(d, { from: start, to: end }).map((a) => visitMoney(d, a));
    const value = money.reduce((s, m) => s + m.revenue, 0);
    const profit = money.reduce((s, m) => s + m.profit, 0);
    const day = new Date(Date.parse(d.now) + start * 86_400_000);
    buckets.push({ label: `${day.getUTCDate()}/${day.getUTCMonth() + 1}`, value, profit });
  }
  return buckets;
}

/** Procedures by sessions done in the period, most sold first. */
export function procedureRanking(d: FlowData, p: Period) {
  const counts = new Map<ID, number>();
  for (const a of done(d, p)) counts.set(a.procedureId, (counts.get(a.procedureId) ?? 0) + 1);
  return d.procedures
    .map((procedure) => ({ procedure, count: counts.get(procedure.id) ?? 0 }))
    .sort((a, b) => b.count - a.count || a.procedure.name.localeCompare(b.procedure.name, "pt-BR"));
}

const WEEK = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const WEEK_LONG = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];

/** Bookings kept (not cancelled) in the period, by weekday, Monday first; Sunday only when it has any. */
export function busiestDays(d: FlowData, p: Period) {
  const counts = Array(7).fill(0) as number[];
  for (const a of d.appointments) {
    if (a.status !== "cancelado" && inPeriod(d, a.startsAt, p)) counts[new Date(a.startsAt).getUTCDay()]++;
  }
  return [1, 2, 3, 4, 5, 6, 0].filter((day) => day !== 0 || counts[0] > 0).map((day) => ({ label: WEEK[day], value: counts[day] }));
}

/** Bookings kept in the period, by starting hour. */
export function busiestHours(d: FlowData, p: Period) {
  const counts = new Map<number, number>();
  for (const a of d.appointments) {
    if (a.status !== "cancelado" && inPeriod(d, a.startsAt, p)) {
      const h = new Date(a.startsAt).getUTCHours();
      counts.set(h, (counts.get(h) ?? 0) + 1);
    }
  }
  return [...counts.keys()].sort((a, b) => a - b).map((h) => ({ label: `${h}h`, value: counts.get(h)! }));
}

export interface Insight {
  id: string;
  text: string;
  /** Higher first; only the top few are shown. */
  weight: number;
  tone: "good" | "watch";
}

/** Three-hour blocks of the clinic's day: where occupancy is read. */
const BLOCKS = [
  [8, 11],
  [11, 14],
  [14, 17],
  [17, 20],
] as const;

/**
 * What the Pulse reads in the period, the most useful first, at most five:
 * a procedure selling less, the emptiest part of the week, the best margin,
 * products about to expire, revenue against the span before.
 */
export function insights(d: FlowData, p: Period): Insight[] {
  const out: Insight[] = [];
  const prev = previous(p);

  // A procedure selling clearly less than in the span before.
  const nowCount = procedureRanking(d, p);
  const thenCount = new Map(procedureRanking(d, prev).map((r) => [r.procedure.id, r.count]));
  const drops = nowCount
    .map((r) => ({ ...r, then: thenCount.get(r.procedure.id) ?? 0 }))
    .filter((r) => r.then >= 3)
    .map((r) => ({ ...r, pct: change(r.count, r.then)! }))
    .filter((r) => r.pct <= -15)
    .sort((a, b) => a.pct - b.pct);
  if (drops[0]) {
    out.push({
      id: "queda",
      text: `${drops[0].procedure.name} caiu ${-drops[0].pct}% em relação ao período anterior.`,
      weight: 5,
      tone: "watch",
    });
  }

  // The emptiest block of the week, over the last four weeks of agenda.
  const fill = new Map<string, { booked: number; total: number; day: number; block: (typeof BLOCKS)[number] }>();
  for (let offset = -28; offset < 0; offset++) {
    for (const slot of daySlots(d, offset)) {
      const h = new Date(slot.startsAt).getUTCHours();
      const block = BLOCKS.find(([a, b]) => h >= a && h < b);
      if (!block) continue;
      const day = new Date(slot.startsAt).getUTCDay();
      const key = `${day}-${block[0]}`;
      const cell = fill.get(key) ?? { booked: 0, total: 0, day, block };
      cell.total++;
      if (slot.status === "ocupado") cell.booked++;
      fill.set(key, cell);
    }
  }
  // Only when the agenda is in use: on a clinic that barely booked anything, every block is "empty" and says nothing.
  const used = [...fill.values()].reduce((sum, c) => sum + c.booked, 0);
  const emptiest = [...fill.values()].filter((c) => c.total >= 6).sort((a, b) => a.booked / a.total - b.booked / b.total)[0];
  if (used >= 12 && emptiest && emptiest.booked / emptiest.total < 0.5) {
    out.push({
      id: "ocupacao",
      text: `${WEEK_LONG[emptiest.day].replace(/^./, (c) => c.toUpperCase())} entre ${emptiest.block[0]}h e ${emptiest.block[1]}h é o período com menor ocupação: ${Math.round((emptiest.booked / emptiest.total) * 100)}% dos horários.`,
      weight: 4,
      tone: "watch",
    });
  }

  // The best margin among what was sold, from the visits' own snapshots (what was charged, what was used that day).
  const margins = new Map<ID, { charged: number; profit: number; cost: number }>();
  for (const a of done(d, p)) {
    const snapshot = snapshotOf(d, a);
    if (!snapshot) continue;
    const m = margins.get(a.procedureId) ?? { charged: 0, profit: 0, cost: 0 };
    m.charged += snapshot.priceCharged;
    m.profit += snapshot.grossProfit;
    m.cost += snapshot.totalCost;
    margins.set(a.procedureId, m);
  }
  const best = nowCount
    .map((r) => ({ ...r, m: margins.get(r.procedure.id) }))
    .filter((r) => r.m && r.m.charged > 0 && r.m.cost > 0)
    .map((r) => ({ ...r, margin: Math.round((r.m!.profit / r.m!.charged) * 100) }))
    .sort((a, b) => b.margin - a.margin)[0];
  if (best) {
    out.push({ id: "margem", text: `${best.procedure.name} teve a maior margem do período: ${best.margin}% depois dos produtos.`, weight: 3, tone: "good" });
  }

  // Patients who have not come back in a long time: the base slipping away.
  const lapsed = d.patients.filter(
    (pt) => pt.lastVisitAt && daysFrom(d.now, pt.lastVisitAt) < -LAPSED_DAYS && !hasUpcoming(d, pt.id),
  ).length;
  if (lapsed) {
    out.push({
      id: "sem-retorno",
      text: `${plural(lapsed, "paciente não volta", "pacientes não voltam")} há mais de ${LAPSED_DAYS} dias.`,
      weight: 4,
      tone: "watch",
    });
  }

  // Products about to expire.
  const expiring = new Set(expiringLots(d).map((l) => l.productId)).size;
  if (expiring) {
    out.push({
      id: "validade",
      text: `Você tem ${plural(expiring, "produto próximo", "produtos próximos")} do vencimento.`,
      weight: 4,
      tone: "watch",
    });
  }

  // Revenue against the span before.
  const delta = change(numbers(d, p).revenue, numbers(d, prev).revenue);
  if (delta !== null && Math.abs(delta) >= 10) {
    out.push({
      id: "faturamento",
      text: `O faturamento ${delta > 0 ? "subiu" : "caiu"} ${Math.abs(delta)}% em relação ao período anterior.`,
      weight: delta < 0 ? 5 : 2,
      tone: delta > 0 ? "good" : "watch",
    });
  }

  return out.sort((a, b) => b.weight - a.weight).slice(0, 5);
}

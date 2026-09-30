/*
  Formatting for the Flow. Every date is shown relative to the data's own
  `now`, never the viewer's clock, so the server and the browser always
  print the same thing.
*/

const DAY = 86_400_000;

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

/** Cents to "R$ 1.240". */
export const brl = (cents: number) => money.format(Math.round(cents / 100));

/** Whole calendar days from `now` to `iso` (negative in the past). */
export function daysFrom(now: string, iso: string): number {
  const a = new Date(now);
  const b = new Date(iso);
  const start = Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate());
  const end = Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate());
  return Math.round((end - start) / DAY);
}

export function relDay(now: string, iso: string): string {
  const d = daysFrom(now, iso);
  if (d === 0) return "hoje";
  if (d === 1) return "amanhã";
  if (d === -1) return "ontem";
  if (d > 0) return d > 60 ? `em ${Math.round(d / 30)} meses` : `em ${d} dias`;
  return -d > 60 ? `há ${Math.round(-d / 30)} meses` : `há ${-d} dias`;
}

/** "15h" or "16h30", in the clinic's time as stored. */
export function hour(iso: string): string {
  const d = new Date(iso);
  const m = d.getUTCMinutes();
  return `${d.getUTCHours()}h${m ? String(m).padStart(2, "0") : ""}`;
}

const WEEKDAY = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const MONTH = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** "quarta, 30 set". */
export function dayLabel(iso: string): string {
  const d = new Date(iso);
  return `${WEEKDAY[d.getUTCDay()]}, ${d.getUTCDate()} ${MONTH[d.getUTCMonth()]}`;
}

/** "Qua" and "30", for a week's column heads. */
export function weekday(iso: string): [string, number] {
  const d = new Date(iso);
  const name = WEEKDAY[d.getUTCDay()];
  return [name.charAt(0).toUpperCase() + name.slice(1, 3), d.getUTCDate()];
}

/** "30 set". */
export function shortDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getUTCDate()} ${MONTH[d.getUTCMonth()]}`;
}

/** "hoje às 14h", "amanhã às 9h", "quinta, 2 out às 10h", "12 mar". */
export function dayAt(now: string, iso: string): string {
  const d = daysFrom(now, iso);
  if (d >= -1 && d <= 1) return `${relDay(now, iso)} às ${hour(iso)}`;
  if (d < 0) return shortDate(iso);
  return `${dayLabel(iso)} às ${hour(iso)}`;
}

export const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "8 seringas", "1 frasco", "13 un". */
export const units = (n: number, unit: string) => `${n.toLocaleString("pt-BR")} ${n > 1 && unit !== "un" ? `${unit}s` : unit}`;

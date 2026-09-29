/*
  The Flow stores every time as the clinic's wall clock written in UTC: an
  appointment at 15h is 15:00Z. The schedule grid, `hour()` and every
  "há 3 dias" read it that way, in the demo and in a real clinic alike. The
  clinics are Brazilian, and Brazil keeps one offset all year.
*/

const CLINIC_TIME_ZONE = "America/Sao_Paulo";

const wallClock = new Intl.DateTimeFormat("en-CA", {
  timeZone: CLINIC_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

/** The clinic's "now", in the Flow's convention. */
export function clinicNow(at = new Date()): string {
  const p = Object.fromEntries(wallClock.formatToParts(at).map((part) => [part.type, part.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}.000Z`;
}

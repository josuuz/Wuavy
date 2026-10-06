/*
  A phone as a line, the same rule the database uses (pulse_phone_key,
  migration 0012): area code and the last eight digits, with or without 55
  or a mobile's extra 9. "(11) 98765-4321" and WhatsApp's "551187654321" are
  the same person; two area codes are never merged into one.
*/

export function phoneKey(phone: string) {
  let n = phone.replace(/\D/g, "").replace(/^0+/, "");
  if (n.length >= 12 && n.startsWith("55")) n = n.slice(2);
  return n.length >= 10 ? `${n.slice(0, 2)}${n.slice(-8)}` : n.slice(-8);
}

export const samePhone = (a: string, b: string) => {
  const key = phoneKey(a);
  return key.length >= 8 && key === phoneKey(b);
};

/** WhatsApp's id ("5511987654321") as the clinic writes a phone: "(11) 98765-4321". Other countries: "+14155550123". */
export function displayPhone(waId: string) {
  const n = waId.replace(/\D/g, "");
  if (n.startsWith("55") && (n.length === 12 || n.length === 13)) {
    const rest = n.slice(4);
    return `(${n.slice(2, 4)}) ${rest.slice(0, -4)}-${rest.slice(-4)}`;
  }
  return `+${n}`;
}

/** An id or a number in a log line: never whole. */
export const mask = (value: string | null | undefined) => (value ? `…${String(value).slice(-4)}` : "?");

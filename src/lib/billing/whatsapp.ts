/** O link de WhatsApp de um número, com uma mensagem já preenchida. */
export function waLink(whatsapp: string | null, text: string): string {
  const digits = (whatsapp ?? "").replace(/\D/g, "");
  const to = digits ? (digits.length > 11 ? digits : `55${digits}`) : "";
  return `https://wa.me/${to}?text=${encodeURIComponent(text)}`;
}

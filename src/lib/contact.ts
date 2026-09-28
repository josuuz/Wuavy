import type { ContactChannel } from "./types";

/**
 * Resolves any contact channel to a link. Sections never build contact URLs
 * themselves, so switching e-mail → WhatsApp → calendar → form is a one-line
 * change in src/data/site.ts.
 */
export function contactHref(channel: ContactChannel, topic?: string): string {
  switch (channel.kind) {
    case "email": {
      const subject = topic ? `${channel.subject ?? "Projeto"}: ${topic}` : channel.subject;
      return `mailto:${channel.address}${subject ? `?subject=${encodeURIComponent(subject)}` : ""}`;
    }
    case "whatsapp":
      return whatsappHref(channel.number, topic ? `${channel.message ?? "Olá, WUAVY."} Assunto: ${topic}.` : channel.message);
    case "calendar":
      return channel.url;
    case "form":
      return topic ? `${channel.href}?assunto=${encodeURIComponent(topic)}` : channel.href;
  }
}

/** A WhatsApp chat with `text` already typed. The number may carry any formatting. */
export function whatsappHref(number: string, text?: string): string {
  return `https://wa.me/${number.replace(/\D/g, "")}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}

/** Human-readable value for listing a channel (the address, the number…). */
export function contactValue(channel: ContactChannel): string {
  switch (channel.kind) {
    case "email":
      return channel.address;
    case "whatsapp":
      return channel.number;
    case "calendar":
      return "Agendar conversa";
    case "form":
      return "Formulário";
  }
}

/** Links that leave the site open in a new tab; mailto and on-site links do not. */
export function isExternal(href: string): boolean {
  return /^https?:\/\//.test(href);
}

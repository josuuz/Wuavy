import type { ContactChannel, SiteConfig } from "@/lib/types";

/*
  Site configuration. Contact is decoupled: every CTA on the site resolves
  `contact.primary` through lib/contact.ts, so switching to WhatsApp, a
  calendar or a form is a change here only. Titles, navigation and the
  pre-filled messages of each language are in the dictionaries (src/i18n).
*/

// TODO(contato): confirmar o endereço. Vem do brandbook (board "Contato"), não de um cadastro real.
const email: ContactChannel = {
  kind: "email",
  label: "E-mail",
  address: "ola@wuavy.com",
  subject: "Orçamento",
};

/*
  O WhatsApp Business oficial da WUAVY: todos os CTAs do site, a entrega do
  diagnóstico do PASSO e o "falar com a Wuavy" do Pulse. Não é o número das
  clínicas no Pulse (esse é de cada clínica, conectado pela Meta em
  lib/whatsapp). A mensagem aqui é a pt-BR, que o app Pulse usa; o site troca
  pela do idioma escolhido (dictionaries → contact.whatsapp).
*/
export const whatsapp = {
  kind: "whatsapp",
  label: "WhatsApp",
  number: "+55 19 99912-5046",
  message: "Olá! Vim pelo site da Wuavy.",
} satisfies ContactChannel;

// Exemplos prontos para ativar quando os dados existirem:
// const calendar: ContactChannel = { kind: "calendar", label: "Agendar conversa", url: "https://…" };
// const form: ContactChannel = { kind: "form", label: "Formulário", href: "/contato" };

export const site: SiteConfig = {
  name: "WUAVY",
  // TODO(domínio): definir NEXT_PUBLIC_SITE_URL no deploy. O fallback segue o domínio do e-mail do brandbook.
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "https://wuavy.com",
  contact: {
    primary: whatsapp,
    channels: [whatsapp, email],
  },
  // TODO(social): preencher os perfis. Sem href, o nome aparece como texto, sem link.
  social: [
    { label: "Instagram", href: "" },
    { label: "LinkedIn", href: "" },
  ],
};

import type { ContactChannel, SiteConfig } from "@/lib/types";

/*
  Site configuration. Contact is decoupled: every CTA on the site resolves
  `contact.primary` through lib/contact.ts, so switching to WhatsApp, a
  calendar or a form is a change here only.
*/

// TODO(contato): confirmar o endereço. Vem do brandbook (board "Contato"), não de um cadastro real.
const email: ContactChannel = {
  kind: "email",
  label: "E-mail",
  address: "ola@wuavy.com",
  subject: "Orçamento",
};

// Exemplos prontos para ativar quando os dados existirem:
// const whatsapp: ContactChannel = { kind: "whatsapp", label: "WhatsApp", number: "+55 …", message: "Olá, WUAVY." };
// const calendar: ContactChannel = { kind: "calendar", label: "Agendar conversa", url: "https://…" };
// const form: ContactChannel = { kind: "form", label: "Formulário", href: "/contato" };

export const site: SiteConfig = {
  name: "WUAVY",
  // TODO(domínio): definir NEXT_PUBLIC_SITE_URL no deploy. O fallback segue o domínio do e-mail do brandbook.
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "https://wuavy.com",
  locale: "pt-BR",
  title: "WUAVY: sites, tráfego pago e sistemas de crescimento",
  description:
    "Agência de crescimento digital. Sites, gestão de tráfego pago e sistemas sob medida com IA, automações e CRM, no mesmo ritmo.",
  nav: [
    { label: "Serviços", href: "/#servicos" },
    { label: "Sistemas", href: "/#sistemas" },
    { label: "Projetos", href: "/#projetos" },
    { label: "FAQ", href: "/#faq" },
    { label: "Contato", href: "/#contato" },
  ],
  cta: { label: "Solicitar orçamento", short: "Orçamento" },
  contact: {
    primary: email,
    channels: [email],
  },
  // TODO(social): preencher os perfis. Sem href, o nome aparece como texto, sem link.
  social: [
    { label: "Instagram", href: "" },
    { label: "LinkedIn", href: "" },
  ],
};

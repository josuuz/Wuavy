import { brl, plural } from "@/lib/flow/format";
import type {
  AppointmentStatus,
  LeadSource,
  LeadStage,
  Opportunity,
  OpportunityKind,
  OpportunityStatus,
} from "@/lib/flow/types";
import type { Focus } from "./store";

/*
  The Flow's words: its screens, and how each thing is said. Plain words for
  a front desk that never used a CRM: contact, sale, patient, return.
*/

/** The demo's address. The real Flow runs the same screens under APP_BASE. */
export const BASE = "/flow/demo";
export const APP_BASE = "/flow/app";

export const VIEWS = [
  { slug: "", label: "Visão geral" },
  { slug: "vendas", label: "Vendas" },
  { slug: "pacientes", label: "Pacientes" },
  { slug: "agenda", label: "Agenda" },
  { slug: "procedimentos", label: "Procedimentos" },
  { slug: "estoque", label: "Estoque" },
  { slug: "automacoes", label: "Automações" },
  { slug: "oportunidades", label: "Oportunidades" },
] as const;

/** The menu: every screen but Oportunidades, which the overview opens. */
export const MENU = VIEWS.filter((v) => v.slug !== "oportunidades");

export const viewHref = (slug: string, base = BASE) => (slug ? `${base}/${slug}` : base);

const FOCUS_VIEW: Record<Focus["to"], string> = {
  opportunity: "oportunidades",
  patient: "pacientes",
  patients: "pacientes",
  sales: "vendas",
  lead: "vendas",
  agenda: "agenda",
};

/** The screen a focus opens. */
export const focusHref = (focus: Focus, base = BASE) => viewHref(FOCUS_VIEW[focus.to], base);

export const STAGE_LABEL: Record<LeadStage, string> = {
  novo: "Novo contato",
  contato: "Em conversa",
  avaliacao: "Avaliação",
  orcamento: "Orçamento",
  agendado: "Agendado",
};

/** The next step when none was written: what each stage asks for. */
export const NEXT_STEP: Record<LeadStage, string> = {
  novo: "Fazer o primeiro contato",
  contato: "Marcar a avaliação",
  avaliacao: "Enviar o orçamento",
  orcamento: "Aguardar a resposta do orçamento",
  agendado: "Confirmar a presença",
};

export const SOURCE_LABEL: Record<LeadSource, string> = {
  instagram: "Instagram",
  google: "Google",
  indicacao: "Indicação",
  whatsapp: "WhatsApp",
  site: "Site",
};

export const APPOINTMENT_LABEL: Record<AppointmentStatus, string> = {
  agendado: "Aguardando confirmação",
  confirmado: "Confirmado",
  concluido: "Finalizado",
  faltou: "Faltou",
  cancelado: "Cancelado",
};

export const PERIOD_LABEL = { manha: "manhã", tarde: "tarde" } as const;

export const CATEGORY_LABEL = { facial: "Facial", injetaveis: "Injetáveis", corporal: "Corporal" } as const;

/** Units a product can be counted in. */
export const UNITS = ["un", "frasco", "seringa", "ampola", "bisnaga", "caixa", "litro", "pote"];

export const ADJUST_REASONS = { uso: "uso fora da agenda", perda: "perda ou vencimento", contagem: "contagem" } as const;

export const STATUS_LABEL: Record<OpportunityStatus, string> = {
  nova: "Nova",
  em_andamento: "Em andamento",
  resolvida: "Resolvida",
};

interface KindCopy {
  tag: string;
  /** The overview's line: what the Flow found, in a few words. */
  headline: (o: Opportunity) => string;
  /** The longer sentence on the Opportunities screen. */
  sentence: (o: Opportunity) => string;
  valueLabel: string;
  /** The overview's direct action, and what it opens. */
  action: string;
  focus: Focus;
  /** The screen where the records behind it live. */
  view: string;
  suggestion: string;
  prepare: string;
  prepared: (o: Opportunity) => string;
}

export const KIND: Record<OpportunityKind, KindCopy> = {
  patient_return: {
    tag: "Retorno",
    headline: (o) => `${plural(o.count, "paciente precisa", "pacientes precisam")} retornar`,
    sentence: (o) => `${plural(o.count, "paciente está", "pacientes estão")} no período de retorno, sem nada marcado.`,
    valueLabel: "em retornos prováveis",
    action: "Ver pacientes",
    focus: { to: "patients", filter: "retorno" },
    view: "pacientes",
    suggestion: "Um convite de retorno com os horários livres da semana, no intervalo recomendado de cada procedimento.",
    prepare: "Preparar convites",
    prepared: (o) => `${plural(o.count, "convite de retorno preparado", "convites de retorno preparados")}. Nenhuma mensagem foi enviada.`,
  },
  lead_followup: {
    tag: "Vendas",
    headline: (o) => `${plural(o.count, "orçamento", "orçamentos")} sem resposta`,
    sentence: (o) =>
      `${plural(o.count, "pessoa recebeu", "pessoas receberam")} orçamento e não ${o.count === 1 ? "respondeu" : "responderam"} há 3 dias ou mais.`,
    valueLabel: "em orçamentos abertos",
    action: "Fazer follow-up",
    focus: { to: "sales", filter: "sem_resposta" },
    view: "vendas",
    suggestion: "Uma mensagem retomando o procedimento de interesse de cada pessoa, começando pelos orçamentos maiores.",
    prepare: "Preparar mensagens",
    prepared: (o) => `${plural(o.count, "mensagem preparada", "mensagens preparadas")} para a equipe revisar. Nada foi enviado.`,
  },
  open_slot: {
    tag: "Agenda",
    headline: (o) => `${plural(o.count, "horário livre", "horários livres")} amanhã`,
    sentence: (o) => `${plural(o.count, "horário ficou disponível", "horários ficaram disponíveis")} amanhã.`,
    valueLabel: "em horários a preencher",
    action: "Preencher agenda",
    focus: { to: "agenda", day: 1 },
    view: "agenda",
    suggestion: "Oferecer os horários primeiro à lista de espera do mesmo período, depois a pacientes com retorno próximo.",
    prepare: "Preparar convites",
    prepared: () => "Convites preparados para a lista de espera. Nenhuma mensagem foi enviada.",
  },
  stock_expiry: {
    tag: "Estoque",
    headline: (o) => `${brl(o.value)} em produtos perto da validade`,
    sentence: (o) => `${brl(o.value)} em produtos ${o.count === 1 ? "está próximo" : "estão próximos"} da validade.`,
    valueLabel: "em estoque a usar",
    action: "Ver quem pode usar",
    focus: { to: "opportunity", kind: "stock_expiry" },
    view: "estoque",
    suggestion: "Uma campanha para quem já fez os procedimentos que usam esses produtos, antes do vencimento.",
    prepare: "Preparar campanha",
    prepared: () => "Campanha preparada para revisão, com a lista de pacientes compatíveis. Nada foi enviado.",
  },
};

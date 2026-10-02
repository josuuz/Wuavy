import type { SubscriptionStatus } from "@/lib/flow/access";
import { plural } from "@/lib/flow/format";
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
  The Pulse's words: its screens, and how each thing is said. Plain words for
  a front desk that never used a CRM: contact, sale, patient, return.
*/

/** The demo's address. The real Pulse runs the same screens under APP_BASE. */
export const BASE = "/pulse/demo";
export const APP_BASE = "/pulse/app";

/** The screens, in the menu's order: what needs attention, where the money is, then the operation. */
export const VIEWS = [
  { slug: "", label: "Visão geral" },
  { slug: "oportunidades", label: "Oportunidades" },
  { slug: "vendas", label: "Vendas" },
  { slug: "pacientes", label: "Pacientes" },
  { slug: "agenda", label: "Agenda" },
  { slug: "procedimentos", label: "Procedimentos" },
  { slug: "estoque", label: "Estoque" },
  { slug: "automacoes", label: "Automações" },
] as const;

export const MENU = VIEWS;

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

/** Where subscribing happens: the checkout, after signing in or creating the account. */
export const CHECKOUT = "/pulse/assinar";

/** What the Pulse says about the clinic's plan: the demo, the subscription and how it stands. */
export const PLAN = {
  demo: {
    badge: "Demo",
    text: "Você está vendo dados fictícios. Nenhuma mensagem, automação ou integração real é executada.",
    cta: "Quero ver o Pulse com meus dados",
    topic: "Wuavy Pulse com os dados da minha clínica",
  },
  subscribe: {
    open: "Assinar",
    title: "Wuavy Pulse",
    text: "Transforme dados da sua clínica em oportunidades de crescimento.",
    includes: [
      "Gestão de pacientes e leads",
      "Agenda e retornos",
      "Procedimentos",
      "Estoque",
      "Indicadores",
      "Motor de oportunidades",
      "Automações",
    ],
    cta: "Assinar Pulse — R$ 297/mês",
    back: { demo: "Continuar explorando a demo", other: "Agora não" },
    topic: "assinar o Wuavy Pulse",
  },
  /** The plan's chip, by status: discreet once the clinic pays. */
  chip: {
    active: "Plano Pulse",
    past_due: "Pagamento em atraso",
    pending: "Pagamento em processamento",
    cancelled: "Assinatura cancelada",
  } satisfies Record<SubscriptionStatus, string>,
  /** Above the work, when the subscription asks for attention. Active says nothing. */
  notice: {
    past_due: {
      title: "Não conseguimos cobrar a mensalidade.",
      text: "O Mercado Pago vai tentar de novo nos próximos dias. Confira se o cartão está válido e com limite. Tudo continua funcionando.",
    },
    pending: {
      title: "Seu pagamento está sendo processado.",
      text: "Assim que o Mercado Pago confirmar, o Pulse volta a liberar tudo. Seus dados continuam aqui.",
    },
    cancelled: {
      title: "Sua assinatura do Pulse foi cancelada.",
      text: "Seus dados continuam aqui, só para consulta. Assine de novo para voltar a criar e editar.",
      cta: "Assinar de novo",
    },
  },
};

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
  /** What the Pulse found, in a few words. */
  headline: (o: Opportunity) => string;
  /** The longer sentence: how it was found. */
  sentence: (o: Opportunity) => string;
  valueLabel: string;
  /** The recommended action: what the overview's button says, and what opens the approval on Oportunidades. */
  action: string;
  /** Who the Pulse picked to start with, by count. */
  picked: (n: number) => string;
  /** The screen where the records behind it live. */
  view: string;
  suggestion: string;
  /** The approval's three buttons: look at who, prepare, then (later) send. */
  review: string;
  prepare: string;
  prepared: (n: number) => string;
}

const top = (n: number, one: string, many: string) => (n === 1 ? `o ${one} mais relevante` : `os ${n} ${many} mais relevantes`);

export const KIND: Record<OpportunityKind, KindCopy> = {
  lead_followup: {
    tag: "Orçamentos",
    headline: (o) => `${plural(o.count, "orçamento", "orçamentos")} sem resposta`,
    sentence: (o) =>
      `${plural(o.count, "pessoa recebeu", "pessoas receberam")} orçamento e não ${o.count === 1 ? "respondeu" : "responderam"} há 3 dias ou mais.`,
    valueLabel: "em orçamentos abertos",
    action: "Preparar follow-up",
    picked: (n) => `Pulse selecionou ${top(n, "contato", "contatos")}.`,
    view: "vendas",
    suggestion: "Retomar o procedimento de interesse de cada pessoa, começando pelos orçamentos maiores e mais recentes.",
    review: "Revisar contatos",
    prepare: "Preparar mensagens",
    prepared: (n) => `${plural(n, "mensagem de follow-up preparada", "mensagens de follow-up preparadas")}. Nada foi enviado.`,
  },
  patient_return: {
    tag: "Retornos",
    headline: (o) => `${plural(o.count, "paciente precisa", "pacientes precisam")} retornar`,
    sentence: (o) => `${plural(o.count, "paciente está", "pacientes estão")} no período de retorno, sem nada marcado.`,
    valueLabel: "em retornos prováveis",
    action: "Preparar convites",
    picked: (n) => `Pulse selecionou ${top(n, "paciente", "pacientes")}, pela chance de retorno.`,
    view: "pacientes",
    suggestion: "Um convite de retorno com os horários livres da semana, no intervalo recomendado de cada procedimento.",
    review: "Revisar pacientes",
    prepare: "Preparar convites",
    prepared: (n) => `${plural(n, "convite de retorno preparado", "convites de retorno preparados")}. Nada foi enviado.`,
  },
  lead_idle: {
    tag: "Leads",
    headline: (o) => `${plural(o.count, "lead parado", "leads parados")}`,
    sentence: (o) =>
      `${plural(o.count, "contato ainda sem orçamento está", "contatos ainda sem orçamento estão")} sem conversa há 2 dias ou mais.`,
    valueLabel: "em interesse declarado",
    action: "Retomar conversas",
    picked: (n) => `Pulse selecionou ${top(n, "contato", "contatos")}.`,
    view: "vendas",
    suggestion: "Uma mensagem curta retomando a conversa no ponto em que parou, com a avaliação como próximo passo.",
    review: "Revisar contatos",
    prepare: "Preparar mensagens",
    prepared: (n) => `${plural(n, "mensagem preparada", "mensagens preparadas")} para retomar a conversa. Nada foi enviado.`,
  },
  open_slot: {
    tag: "Agenda",
    headline: (o) => `${plural(o.count, "horário livre", "horários livres")} até amanhã`,
    sentence: (o) => `${plural(o.count, "horário está livre", "horários estão livres")} entre hoje e amanhã.`,
    valueLabel: "em horários a preencher",
    action: "Preencher horários",
    picked: (n) => `Pulse encontrou ${plural(n, "paciente compatível", "pacientes compatíveis")}, um por horário.`,
    view: "agenda",
    suggestion: "Oferecer cada horário a quem mais combina: a lista de espera do mesmo período primeiro, depois quem tem retorno próximo.",
    review: "Revisar sugestões",
    prepare: "Preparar convites",
    prepared: (n) => `${plural(n, "convite de horário preparado", "convites de horário preparados")}. Nada foi enviado.`,
  },
  stock_expiry: {
    tag: "Estoque",
    headline: (o) => `${plural(o.count, "lote perto", "lotes perto")} da validade`,
    sentence: (o) =>
      `${plural(o.count, "lote vence", "lotes vencem")} em até 45 dias. Usados nos procedimentos certos, viram receita em vez de prejuízo.`,
    valueLabel: "em procedimentos possíveis",
    action: "Ver oportunidade",
    picked: (n) => `Pulse selecionou ${top(n, "paciente", "pacientes")} para usar esses produtos antes de vencer.`,
    view: "estoque",
    suggestion: "Uma campanha para quem já fez os procedimentos que usam esses produtos, antes do vencimento.",
    review: "Revisar pacientes",
    prepare: "Preparar campanha",
    prepared: (n) => `Campanha preparada para ${plural(n, "paciente compatível", "pacientes compatíveis")}. Nada foi enviado.`,
  },
  no_show: {
    tag: "Faltas",
    headline: (o) => `${plural(o.count, "paciente faltou", "pacientes faltaram")} e não remarcou`,
    sentence: (o) => `${plural(o.count, "paciente faltou", "pacientes faltaram")} nos últimos 14 dias e não ${o.count === 1 ? "tem" : "têm"} nada marcado.`,
    valueLabel: "em atendimentos a remarcar",
    action: "Remarcar",
    picked: (n) => `Pulse separou ${plural(n, "paciente", "pacientes")} para remarcar enquanto o interesse está vivo.`,
    view: "pacientes",
    suggestion: "Um convite para remarcar o mesmo procedimento, com os próximos horários livres.",
    review: "Revisar pacientes",
    prepare: "Preparar convites",
    prepared: (n) => `${plural(n, "convite para remarcar preparado", "convites para remarcar preparados")}. Nada foi enviado.`,
  },
};

/** What the automations brought back, by the front that found it. Faltas remarcadas count as returns. */
export const RECOVERED_FRONTS = [
  { label: "Retornos recuperados", kinds: ["patient_return", "no_show"] },
  { label: "Orçamentos recuperados", kinds: ["lead_followup"] },
  { label: "Horários preenchidos", kinds: ["open_slot"] },
  { label: "Leads convertidos", kinds: ["lead_idle"] },
  { label: "Oportunidades vindas de estoque", kinds: ["stock_expiry"] },
] as const;

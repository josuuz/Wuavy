import { brl, plural } from "@/lib/flow/format";
import type { LeadSource, LeadStage, Opportunity, OpportunityKind, OpportunityStatus } from "@/lib/flow/types";

/* The demo's words: its screens, and how each kind of opportunity is said. */

export const BASE = "/flow/demo";

export const VIEWS = [
  { slug: "", label: "Visão geral" },
  { slug: "oportunidades", label: "Oportunidades" },
  { slug: "crm", label: "CRM" },
  { slug: "pacientes", label: "Pacientes" },
  { slug: "agenda", label: "Agenda" },
  { slug: "procedimentos", label: "Procedimentos" },
  { slug: "estoque", label: "Estoque" },
  { slug: "automacoes", label: "Automações" },
] as const;

export const viewHref = (slug: string) => (slug ? `${BASE}/${slug}` : BASE);

export const STAGE_LABEL: Record<LeadStage, string> = {
  novo: "Novo lead",
  contato: "Contato",
  avaliacao: "Avaliação",
  orcamento: "Orçamento",
  agendado: "Agendado",
  procedimento: "Procedimento",
  retorno: "Retorno",
};

export const SOURCE_LABEL: Record<LeadSource, string> = {
  instagram: "Instagram",
  google: "Google",
  indicacao: "Indicação",
  whatsapp: "WhatsApp",
  site: "Site",
};

export const STATUS_LABEL: Record<OpportunityStatus, string> = {
  nova: "Nova",
  em_andamento: "Em andamento",
  resolvida: "Resolvida",
};

interface KindCopy {
  tag: string;
  /** The sentence on the Opportunities screen. */
  sentence: (o: Opportunity) => string;
  /** The number and its line on the overview. */
  stat: (o: Opportunity) => [string, string];
  valueLabel: string;
  action: string;
  view: string;
  suggestion: string;
  prepare: string;
  prepared: (o: Opportunity) => string;
}

export const KIND: Record<OpportunityKind, KindCopy> = {
  lead_followup: {
    tag: "Leads",
    sentence: (o) => `${plural(o.count, "lead recebeu", "leads receberam")} orçamento e não ${o.count === 1 ? "respondeu" : "responderam"}.`,
    stat: (o) => [String(o.count), `${o.count === 1 ? "lead aguardando" : "leads aguardando"} acompanhamento`],
    valueLabel: "em orçamentos abertos",
    action: "Analisar leads",
    view: "crm",
    suggestion: "Um follow-up com o procedimento de interesse de cada lead, começando pelos de maior valor.",
    prepare: "Preparar follow-ups",
    prepared: (o) => `${plural(o.count, "follow-up preparado", "follow-ups preparados")} para a equipe revisar. Nenhuma mensagem foi enviada.`,
  },
  patient_return: {
    tag: "Retorno",
    sentence: (o) => `${plural(o.count, "paciente pode", "pacientes podem")} estar entrando no período de retorno.`,
    stat: (o) => [String(o.count), `${o.count === 1 ? "paciente" : "pacientes"} potencialmente perto do período de retorno`],
    valueLabel: "em retornos prováveis",
    action: "Ver pacientes",
    view: "pacientes",
    suggestion: "Um convite de retorno com os horários livres da semana, no intervalo típico de cada procedimento.",
    prepare: "Preparar convites",
    prepared: (o) => `${plural(o.count, "convite de retorno preparado", "convites de retorno preparados")}. Nenhuma mensagem foi enviada.`,
  },
  stock_expiry: {
    tag: "Estoque",
    sentence: (o) => `${brl(o.value)} em produtos ${o.count === 1 ? "está próximo" : "estão próximos"} da validade.`,
    stat: (o) => [brl(o.value), "em estoque próximo da validade"],
    valueLabel: "em estoque a girar",
    action: "Ver estratégia",
    view: "estoque",
    suggestion: "Uma campanha para quem já fez os procedimentos que usam esses produtos, antes do vencimento.",
    prepare: "Preparar campanha",
    prepared: () => "Campanha preparada para revisão, com a lista de pacientes compatíveis. Nada foi enviado.",
  },
  open_slot: {
    tag: "Agenda",
    sentence: (o) => `${plural(o.count, "horário ficou disponível", "horários ficaram disponíveis")} amanhã.`,
    stat: (o) => [String(o.count), `${o.count === 1 ? "horário disponível" : "horários disponíveis"} amanhã`],
    valueLabel: "em horários a preencher",
    action: "Preencher agenda",
    view: "agenda",
    suggestion: "Oferecer os horários primeiro à lista de espera do mesmo período, depois a pacientes com retorno próximo.",
    prepare: "Preparar convites",
    prepared: () => "Convites preparados para a lista de espera. Nenhuma mensagem foi enviada.",
  },
};

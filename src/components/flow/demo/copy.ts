import type { SubscriptionStatus } from "@/lib/flow/access";
import { plural } from "@/lib/flow/format";
import type {
  AppointmentStatus,
  LeadSource,
  LeadStage,
  Opportunity,
  OpportunityKind,
  OpportunityStatus,
  SEGMENTS,
  TEAM_SIZES,
} from "@/lib/flow/types";
import type { Focus } from "./store";

/*
  The Pulse's words: its screens, and how each thing is said. Plain words for
  a front desk that never used a CRM: contact, sale, patient, return.
*/

/** The demo's address. The real Pulse runs the same screens under APP_BASE. */
export const BASE = "/pulse/demo";
export const APP_BASE = "/pulse/app";

/**
 * The screens, in the menu's order: what needs attention, where the money is,
 * then the operation. `live`: only in a real clinic (the demo has no settings).
 */
export const VIEWS: readonly { slug: string; label: string; live?: boolean }[] = [
  { slug: "", label: "Visão geral" },
  { slug: "conversas", label: "Conversas" },
  { slug: "oportunidades", label: "Oportunidades" },
  { slug: "vendas", label: "Vendas" },
  { slug: "pacientes", label: "Pacientes" },
  { slug: "agenda", label: "Agenda" },
  { slug: "procedimentos", label: "Procedimentos" },
  { slug: "estoque", label: "Estoque" },
  { slug: "automacoes", label: "Automações" },
  { slug: "configuracoes", label: "Configurações", live: true },
];

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

/**
 * Whether the online checkout (Mercado Pago) is configured. Without it, the
 * plan is contracted with Wuavy and activated by hand (migration 0004).
 */
export const ONLINE_CHECKOUT = Boolean(process.env.NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY);

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
      "Pacientes, vendas e orçamentos",
      "Agenda, faltas e retornos",
      "Procedimentos e estoque ligados",
      "Motor de oportunidades com receita potencial",
      "Mensagens prontas para enviar pelo WhatsApp",
    ],
    /** Part of the plan once they exist: shown, marked as not here yet. */
    coming: ["Automações inteligentes", "Pulse AI", "Rastreamento de receita recuperada"],
    cta: "Assinar Pulse — R$ 297/mês",
    /** Without the online checkout: the plan is contracted with Wuavy. */
    offline: {
      cta: "Falar com a Wuavy para assinar",
      note: "Estamos finalizando a ativação online. Por enquanto, a contratação é feita direto com a Wuavy, que ativa o Pulse nesta mesma conta.",
    },
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

/**
 * The first-run guide, told by PASSO: a short list the clinic can follow,
 * skip or leave for later. `go` is said away from the step's screen, `here`
 * on it. Six steps everywhere; in the demo the first is already done (its
 * clinic comes configured, and the demo has no settings).
 */
export const GUIDE = {
  welcome: {
    /** When the first step is the clinic's profile. */
    clinic: "Vamos deixar o Pulse com a cara da sua clínica?",
    tour: "Quer conhecer o Pulse pelo que ele faz de melhor? Leva um minuto.",
    start: { clinic: "Começar configuração", tour: "Começar" },
    later: "Agora não",
  },
  title: "Primeiros passos",
  progress: (done: number, total: number) => `${done} de ${total} concluídos`,
  skip: "Pular por enquanto",
  later: "Continuar depois",
  go: (label: string) => `Ir para ${label}`,
  hide: "Ocultar guia",
  done: {
    text: "Tudo pronto. O Pulse já conhece a sua clínica e começa a apontar o que fazer.",
    /** Some steps were skipped: they stay in the count, and the tutorial can be seen again. */
    skipped: (n: number) =>
      `Você pulou ${n === 1 ? "1 etapa" : `${n} etapas`}. Ela${n === 1 ? "" : "s"} continua${n === 1 ? "" : "m"} aqui: dá para rever o tutorial em Configurações.`,
    cta: "Concluir",
  },
  restart: { title: "Ajuda e tutorial", text: "Reveja os primeiros passos com o PASSO quando quiser.", cta: "Rever o tutorial" },
  steps: [
    {
      id: "clinica",
      view: "configuracoes",
      title: "Personalizar a clínica",
      go: "Comece pelas Configurações: logo, nome, WhatsApp e horários deixam o Pulse com a cara da clínica.",
      here: "Primeiro, vamos deixar o Pulse com a identidade da sua clínica. Preencha o que estiver destacado e salve.",
    },
    {
      id: "procedimento",
      view: "procedimentos",
      title: "Cadastrar o primeiro procedimento",
      go: "Agora os serviços: cada procedimento traz preço, duração e retorno.",
      here: "Cadastre um procedimento com preço, duração e intervalo de retorno.",
    },
    {
      id: "paciente",
      view: "pacientes",
      title: "Cadastrar o primeiro paciente",
      go: "Depois, quem a clínica atende.",
      here: "Cadastre um paciente. O telefone é o que liga a conversa ao cadastro.",
    },
    {
      id: "agendamento",
      view: "agenda",
      title: "Criar o primeiro agendamento",
      go: "Com procedimento e paciente, a agenda já funciona.",
      here: "Clique num horário livre para agendar.",
    },
    {
      id: "conversas",
      view: "conversas",
      title: "Conhecer Conversas",
      go: "Veja onde a equipe vai atender, com o contexto de cada pessoa ao lado.",
      here: "Cada conversa mostra a etapa, o procedimento e a próxima ação da pessoa.",
    },
    {
      id: "oportunidades",
      view: "oportunidades",
      title: "Ver as oportunidades",
      go: "Por último, onde o Pulse mostra o dinheiro parado.",
      here: "Aqui o Pulse junta os sinais da clínica em ações, com o valor de cada uma.",
    },
  ],
  /** What the clinic step looks for in Configurações. The logo is optional: it never holds the step back. */
  clinicFields: {
    logo: "Logo da clínica (opcional)",
    name: "Nome da clínica",
    whatsapp: "WhatsApp",
    address: "Endereço",
    hours: "Horários de atendimento",
  },
} as const;

export type GuideStepId = (typeof GUIDE.steps)[number]["id"];

/** PASSO's one-time tip on a screen's first visit. */
export const SCREEN_TIPS: Record<string, string> = {
  procedimentos: "Cadastre os serviços da clínica para o Pulse conseguir cruzar agenda, pacientes e estoque.",
  estoque: "Depois vamos relacionar produtos aos procedimentos para identificar oportunidades.",
  conversas: "Aqui sua equipe poderá atender sem sair do Pulse.",
  oportunidades: "É aqui que o Pulse transforma sinais da operação em ações.",
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

export const CATEGORY_LABEL = { facial: "Facial", injetaveis: "Injetáveis", corporal: "Corporal", outro: "Outro" } as const;

export const SEGMENT_LABEL: Record<(typeof SEGMENTS)[number], string> = {
  estetica: "Estética",
  odontologia: "Odontologia",
  dermatologia: "Dermatologia",
  harmonizacao: "Harmonização",
  multidisciplinar: "Multidisciplinar",
  outro: "Outro",
};

export const TEAM_LABEL: Record<(typeof TEAM_SIZES)[number], string> = { "1": "Só eu", "2-3": "2 a 3", "4-6": "4 a 6", "7+": "7 ou mais" };

/** The week as a clinic reads it, Monday first (0 is Sunday). */
export const WEEK = [
  [1, "Seg"],
  [2, "Ter"],
  [3, "Qua"],
  [4, "Qui"],
  [5, "Sex"],
  [6, "Sáb"],
  [0, "Dom"],
] as const;

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
  /** The approval's buttons: look at who, then prepare each message for a person to send. */
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
    prepared: (n) => `${plural(n, "mensagem de follow-up pronta", "mensagens de follow-up prontas")} para você revisar e enviar.`,
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
    prepared: (n) => `${plural(n, "convite de retorno pronto", "convites de retorno prontos")} para você revisar e enviar.`,
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
    prepared: (n) => `${plural(n, "mensagem pronta", "mensagens prontas")} para retomar a conversa. Revise e envie.`,
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
    prepared: (n) => `${plural(n, "convite de horário pronto", "convites de horário prontos")} para você revisar e enviar.`,
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
    prepared: (n) => `Mensagens prontas para ${plural(n, "paciente compatível", "pacientes compatíveis")}. Revise e envie.`,
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
    prepared: (n) => `${plural(n, "convite para remarcar pronto", "convites para remarcar prontos")} para você revisar e enviar.`,
  },
};

/**
 * Automations to come: what each will watch and do. Shown on Automações as
 * examples, marked "Em breve": none of them runs yet.
 */
export const AUTOMATION_EXAMPLES = [
  {
    name: "Retorno automático",
    when: "O paciente chega ao período de retorno do procedimento",
    conditions: ["Nada marcado na agenda"],
    actions: ["Criar a oportunidade de retorno", "Preparar o convite com os horários livres", "Enviar quando a equipe aprovar"],
  },
  {
    name: "Orçamento parado",
    when: "Um orçamento fica alguns dias sem resposta",
    conditions: ["O orçamento continua aberto"],
    actions: ["Preparar o follow-up com o procedimento de interesse", "Avisar a recepção"],
  },
  {
    name: "Paciente faltou",
    when: "Um paciente falta ao atendimento",
    conditions: ["Nada remarcado"],
    actions: ["Preparar o convite para remarcar", "Sugerir os próximos horários livres"],
  },
  {
    name: "Horário liberado",
    when: "Um cancelamento libera um horário",
    conditions: ["Há alguém na lista de espera"],
    actions: ["Ordenar quem mais combina com o horário", "Preparar o convite para o primeiro da lista"],
  },
] as const;

/** What the automations brought back, by the front that found it. Faltas remarcadas count as returns. */
export const RECOVERED_FRONTS = [
  { label: "Retornos recuperados", kinds: ["patient_return", "no_show"] },
  { label: "Orçamentos recuperados", kinds: ["lead_followup"] },
  { label: "Horários preenchidos", kinds: ["open_slot"] },
  { label: "Leads convertidos", kinds: ["lead_idle"] },
  { label: "Oportunidades vindas de estoque", kinds: ["stock_expiry"] },
] as const;

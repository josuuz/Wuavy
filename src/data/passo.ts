/*
  PASSO's diagnosis: a few quick questions and a local, deterministic
  recommendation (no AI, no server). A small graph: every answer leads to the
  next question or to a result, and no path asks more than three questions.
  Each answer also carries a first-person line (`say`) for the WhatsApp
  message, so the conversation arrives already told.
*/

export type Stage = "identidade" | "website" | "trafego" | "automacao";

export const stages: Array<{ id: Stage; label: string }> = [
  { id: "identidade", label: "Identidade" },
  { id: "website", label: "Website" },
  { id: "trafego", label: "Tráfego" },
  { id: "automacao", label: "Automação" },
];

export type QuestionId =
  | "goal"
  | "hasSite"
  | "handling"
  | "brandForAds"
  | "brandForSite"
  | "siteAds"
  | "brandSite"
  | "bottleneck"
  | "pain"
  | "salesSite"
  | "brandCheck";

export type ResultId =
  | "trafego"
  | "trafegoCrm"
  | "websiteTrafego"
  | "identidadeWebsite"
  | "website"
  | "identidade"
  | "atendimento"
  | "crm"
  | "processos";

export interface Answer {
  label: string;
  say: string;
  next: QuestionId | ResultId;
}

export interface Question {
  text: string;
  answers: Answer[];
}

export interface Result {
  /** What the card shows. */
  title: string;
  /** How the WhatsApp message names it. */
  service: string;
  why: string;
  /** The stages of the growth path this recommendation covers now. */
  now: Stage[];
}

const BRAND = "Sua marca já tem uma identidade visual bem definida?";
const brandYes = "Minha marca já tem identidade visual definida.";
const brandNo = "Minha marca ainda não tem uma identidade visual definida.";

export const questions: Record<QuestionId, Question> = {
  goal: {
    text: "O que você mais quer melhorar hoje?",
    answers: [
      { label: "Conseguir mais clientes", say: "Meu objetivo é conseguir mais clientes.", next: "hasSite" },
      { label: "Ter um site melhor", say: "Quero um site melhor.", next: "brandForSite" },
      { label: "Melhorar minha marca", say: "Quero melhorar minha marca.", next: "brandSite" },
      { label: "Automatizar processos", say: "Quero automatizar processos.", next: "bottleneck" },
      { label: "Não sei ainda", say: "Ainda não sei bem o que preciso.", next: "pain" },
    ],
  },
  hasSite: {
    text: "Você já tem um site ou landing page preparada para receber visitantes?",
    answers: [
      { label: "Sim, e funciona bem", say: "Já tenho um site que funciona bem.", next: "handling" },
      { label: "Tenho, mas não converte", say: "Já tenho um site, mas ele não converte bem.", next: "websiteTrafego" },
      { label: "Ainda não tenho", say: "Ainda não tenho site.", next: "brandForAds" },
    ],
  },
  handling: {
    text: "E quando um contato chega, como ele é atendido?",
    answers: [
      { label: "Rápido e organizado", say: "O atendimento hoje é rápido e organizado.", next: "trafego" },
      { label: "Na mão, e alguns se perdem", say: "O atendimento é manual e alguns contatos se perdem.", next: "trafegoCrm" },
    ],
  },
  brandForAds: {
    text: BRAND,
    answers: [
      { label: "Sim, bem definida", say: brandYes, next: "websiteTrafego" },
      { label: "Não, ou precisa renovar", say: brandNo, next: "identidadeWebsite" },
    ],
  },
  brandForSite: {
    text: BRAND,
    answers: [
      { label: "Sim, bem definida", say: brandYes, next: "siteAds" },
      { label: "Não, ou precisa renovar", say: brandNo, next: "identidadeWebsite" },
    ],
  },
  siteAds: {
    text: "Com o site no ar, você pretende investir em anúncios para atrair clientes?",
    answers: [
      { label: "Sim, quero atrair clientes", say: "Depois do site, quero investir em anúncios.", next: "websiteTrafego" },
      { label: "Por enquanto, só o site", say: "Por enquanto quero só o site.", next: "website" },
    ],
  },
  brandSite: {
    text: "Você pretende também criar ou renovar o site?",
    answers: [
      { label: "Sim, junto com a marca", say: "Também quero criar ou renovar o site.", next: "identidadeWebsite" },
      { label: "Por enquanto, só a marca", say: "Por enquanto quero cuidar só da marca.", next: "identidade" },
    ],
  },
  bottleneck: {
    text: "Onde está o maior gargalo hoje?",
    answers: [
      { label: "Atendimento", say: "Meu maior gargalo é o atendimento.", next: "atendimento" },
      { label: "Organização de leads (CRM)", say: "Meu maior gargalo é organizar os leads.", next: "crm" },
      { label: "Tarefas repetitivas", say: "Meu maior gargalo são as tarefas repetitivas.", next: "processos" },
    ],
  },
  pain: {
    text: "Qual destes pesa mais hoje?",
    answers: [
      { label: "Poucas vendas", say: "Meu maior problema hoje são poucas vendas.", next: "salesSite" },
      { label: "Marca pouco profissional", say: "Sinto que minha marca não passa profissionalismo.", next: "brandSite" },
      { label: "Site ruim ou inexistente", say: "Meu site é ruim ou não existe.", next: "brandCheck" },
      { label: "Muito trabalho manual", say: "Gasto muito tempo com trabalho manual.", next: "bottleneck" },
    ],
  },
  salesSite: {
    text: "Você já tem um site preparado para vender?",
    answers: [
      { label: "Sim, tenho", say: "Já tenho um site preparado para vender.", next: "trafego" },
      { label: "Não, ou não converte", say: "Não tenho um site que converta.", next: "websiteTrafego" },
    ],
  },
  brandCheck: {
    text: BRAND,
    answers: [
      { label: "Sim, bem definida", say: brandYes, next: "website" },
      { label: "Não, ou precisa renovar", say: brandNo, next: "identidadeWebsite" },
    ],
  },
};

export const results: Record<ResultId, Result> = {
  trafego: {
    title: "Tráfego Pago",
    service: "Tráfego Pago",
    why: "Seu site já está pronto para receber visitas; o que falta é levar as pessoas certas até ele. Com campanhas acompanhadas de perto, cada real vai para onde traz retorno.",
    now: ["trafego"],
  },
  trafegoCrm: {
    title: "Tráfego Pago + CRM",
    service: "Tráfego Pago + CRM e Automação",
    why: "Mais contatos só viram vendas se nenhum se perder no caminho. O tráfego traz as oportunidades, e um CRM com automação garante que cada uma seja respondida e acompanhada.",
    now: ["trafego", "automacao"],
  },
  websiteTrafego: {
    title: "Website + Tráfego",
    service: "Website + Tráfego",
    why: "Seu próximo passo é um site focado em conversão antes de aumentar o investimento em tráfego. Assim, quem chega pelos anúncios encontra uma estrutura pronta para virar oportunidade.",
    now: ["website", "trafego"],
  },
  identidadeWebsite: {
    title: "Identidade Visual + Website",
    service: "Identidade Visual + Website",
    why: "Antes de atrair mais gente, a marca precisa transmitir a confiança que o seu trabalho já tem. Identidade e site feitos juntos falam a mesma língua, e o tráfego entra depois sobre uma base sólida.",
    now: ["identidade", "website"],
  },
  website: {
    title: "Website",
    service: "Website",
    why: "Sua marca já está definida; falta um site à altura dela. Rápido, claro e pensado para conversão, ele transforma visitas em contatos e prepara o terreno para o tráfego.",
    now: ["website"],
  },
  identidade: {
    title: "Identidade Visual",
    service: "Identidade Visual",
    why: "Uma identidade bem construída faz a empresa parecer tão profissional quanto ela é. Ela vira a base de tudo o que vem depois: site, redes e anúncios.",
    now: ["identidade"],
  },
  atendimento: {
    title: "Automação do atendimento",
    service: "CRM / Automação / IA (atendimento)",
    why: "Responder rápido é o que separa um contato de uma venda. Com IA e automação no WhatsApp, ninguém fica esperando, e sua equipe entra só quando faz diferença.",
    now: ["automacao"],
  },
  crm: {
    title: "CRM e organização de leads",
    service: "CRM / Automação / IA (organização de leads)",
    why: "Hoje as oportunidades ficam espalhadas e algumas se perdem. Um CRM sob medida mostra cada contato, em que etapa ele está e o que fazer a seguir.",
    now: ["automacao"],
  },
  processos: {
    title: "Automação de processos",
    service: "CRM / Automação / IA (tarefas repetitivas)",
    why: "O tempo que vai para tarefas repetitivas sai do que faz a empresa crescer. Automatizamos o que se repete para sua equipe focar no que só ela faz.",
    now: ["automacao"],
  },
};

export const isQuestion = (id: QuestionId | ResultId): id is QuestionId => id in questions;

/** The most questions still ahead of `id`, itself included. */
export function questionsLeft(id: QuestionId): number {
  return 1 + Math.max(0, ...questions[id].answers.map((a) => (isQuestion(a.next) ? questionsLeft(a.next) : 0)));
}

export function whatsappMessage(answers: Answer[], result: Result): string {
  return ["Olá! Fiz o diagnóstico no site da Wuavy.", ...answers.map((a) => a.say), `O PASSO recomendou ${result.service}.`].join(
    " ",
  );
}

export const guide = {
  name: "PASSO",
  kicker: "Diagnóstico",
  hello: "Posso te ajudar a descobrir o que sua empresa precisa agora?",
  start: "Quero descobrir",
  later: "Agora não",
  resultKicker: "O PASSO recomenda",
  path: "Caminho de crescimento",
  pathNext: "depois",
  ask: "Quer que a Wuavy monte isso para você?",
  cta: "Falar com a Wuavy",
  restart: "Refazer",
  close: "Fechar",
  open: "Falar com o PASSO: descubra o que sua empresa precisa",
  hint: "Oi, posso ajudar?",
} as const;

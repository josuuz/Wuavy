import { brl, daysFrom, hour, plural, units } from "./format";
import {
  dueReturns,
  expiringLots,
  lotValue,
  openSlots,
  opportunities,
  proceduresUsing,
  recovered,
  stuckLeads,
  procedureOf,
} from "./insights";
import type { FlowData } from "./types";

/*
  "Pergunte ao Flow". The contract a real model will implement later (an API
  route calling it with the clinic's data as context); today a local version
  answers from the same insights the screens use. No AI is called.
*/

export interface FlowAnswer {
  text: string;
  items?: { label: string; value: string }[];
  link?: { label: string; /** A screen of the Flow, as in VIEWS. */ view: string };
}

export interface FlowAssistant {
  ask(question: string, data: FlowData): Promise<FlowAnswer>;
}

export const SUGGESTED = [
  "Como está minha clínica?",
  "Quais oportunidades tenho hoje?",
  "Tenho produtos próximos da validade?",
  "Quais leads estão parados?",
];

const plain = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

function status(d: FlowData): FlowAnswer {
  const open = opportunities(d).filter((o) => o.count > 0);
  const potential = open.reduce((s, o) => s + o.value, 0);
  const slots = openSlots(d);
  return {
    text: `Hoje o Flow vê ${plural(open.length, "frente de oportunidade", "frentes de oportunidade")}, somando cerca de ${brl(potential)} em receita possível. A maior está nos orçamentos sem resposta.`,
    items: [
      { label: "Leads parados", value: String(stuckLeads(d).length) },
      { label: "Retornos a convidar", value: String(dueReturns(d).length) },
      { label: "Horários livres amanhã", value: String(slots.length) },
      { label: "Recuperado em 30 dias", value: brl(recovered(d).total) },
    ],
    link: { label: "Abrir a visão geral", view: "" },
  };
}

function today(d: FlowData): FlowAnswer {
  const labels = {
    lead_followup: "Follow-up de orçamentos",
    patient_return: "Convites de retorno",
    stock_expiry: "Estoque perto da validade",
    open_slot: "Horários vagos amanhã",
  };
  return {
    text: "Estas são as oportunidades abertas, da maior para a menor em valor possível:",
    items: opportunities(d)
      .filter((o) => o.count > 0)
      .sort((a, b) => b.value - a.value)
      .map((o) => ({ label: `${labels[o.kind]} (${o.count})`, value: brl(o.value) })),
    link: { label: "Ver oportunidades", view: "oportunidades" },
  };
}

function stock(d: FlowData): FlowAnswer {
  const lots = expiringLots(d);
  if (!lots.length) return { text: "Nenhum lote está perto da validade agora." };
  const total = lots.reduce((s, l) => s + lotValue(d, l), 0);
  return {
    text: `Sim: ${plural(lots.length, "lote soma", "lotes somam")} ${brl(total)} e vencem nos próximos 45 dias. Dá para girar esse estoque com os procedimentos que o usam.`,
    items: lots.map((lot) => {
      const product = d.products.find((p) => p.id === lot.productId)!;
      const used = proceduresUsing(d, lot.productId)
        .map((u) => u.procedure.name)
        .join(", ");
      return {
        label: `${product.name}: ${units(lot.quantity, product.unit)}, vence em ${daysFrom(d.now, lot.expiresAt)} dias`,
        value: `${brl(lotValue(d, lot))} · ${used}`,
      };
    }),
    link: { label: "Ver estoque", view: "estoque" },
  };
}

function leads(d: FlowData): FlowAnswer {
  const stuck = stuckLeads(d);
  return {
    text: `${plural(stuck.length, "lead recebeu", "leads receberam")} orçamento e não ${stuck.length === 1 ? "respondeu" : "responderam"} há 3 dias ou mais, cerca de ${brl(stuck.reduce((s, l) => s + l.potentialValue, 0))} em aberto. Os de maior valor:`,
    items: stuck.slice(0, 5).map((l) => ({
      label: `${l.name} · ${procedureOf(d, l.procedureId)?.name}`,
      value: `${brl(l.potentialValue)} · ${-daysFrom(d.now, l.lastContactAt)} dias`,
    })),
    link: { label: "Abrir o CRM", view: "crm" },
  };
}

function schedule(d: FlowData): FlowAnswer {
  const slots = openSlots(d);
  return {
    text: slots.length
      ? `Amanhã há ${plural(slots.length, "horário livre", "horários livres")}. A lista de espera pode ocupar parte deles.`
      : "A agenda de amanhã está cheia.",
    items: slots.map((s) => ({ label: `Amanhã às ${hour(s.startsAt)}`, value: s.status === "cancelado" ? "cancelamento" : "livre" })),
    link: { label: "Abrir a agenda", view: "agenda" },
  };
}

function returns(d: FlowData): FlowAnswer {
  const due = dueReturns(d);
  return {
    text: `${plural(due.length, "paciente pode", "pacientes podem")} estar entrando no período de retorno, sem nada marcado. Os mais próximos:`,
    items: due.slice(0, 5).map((p) => {
      const days = daysFrom(d.now, p.nextReturnAt!);
      return { label: p.name, value: days < 0 ? `retorno passou há ${-days} dias` : `retorno em ${days} dias` };
    }),
    link: { label: "Ver pacientes", view: "pacientes" },
  };
}

export const localAssistant: FlowAssistant = {
  async ask(question, d) {
    const q = plain(question);
    if (/validade|venc|estoque|produto|lote/.test(q)) return stock(d);
    if (/lead|parad|orcamento|follow/.test(q)) return leads(d);
    if (/agenda|horario|amanha|vag|cancel/.test(q)) return schedule(d);
    if (/retorno|paciente|voltar|reativ/.test(q)) return returns(d);
    if (/oportunidade|hoje|agir|fazer/.test(q)) return today(d);
    if (/como est|clinica|resumo|visao|geral|tudo/.test(q)) return status(d);
    return {
      text: "Nesta demo eu respondo sobre a clínica, as oportunidades, os leads, os retornos, a agenda e o estoque. Tente uma destas:",
      items: SUGGESTED.map((s) => ({ label: s, value: "" })),
    };
  },
};

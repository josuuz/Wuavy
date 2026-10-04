import { brl, capital, daysFrom, hour, plural, relDay, units } from "./format";
import {
  awaiting,
  dueReturns,
  expiryOpportunities,
  history,
  lotValue,
  missed,
  openSlots,
  opportunities,
  potentialOf,
  procedureOf,
  returnValue,
  slotMatches,
  stuckLeads,
  unrecorded,
} from "./insights";
import type { FlowData, OpportunityKind } from "./types";

/*
  "Pergunte ao Pulse". The contract a real model will implement later (Pulse
  AI: an API route answering free questions with the clinic's data as
  context). Today no AI is called: each of the questions below is answered
  by a calculation over the same insights the screens use, so every answer
  is the clinic's own data, and a question outside them is not guessed at.
*/

export interface FlowAnswer {
  text: string;
  items?: { label: string; value: string }[];
  link?: { label: string; /** A screen of the Pulse, as in VIEWS. */ view: string };
}

export interface FlowAssistant {
  ask(question: string, data: FlowData): Promise<FlowAnswer>;
}

const FRONT: Record<OpportunityKind, string> = {
  lead_followup: "Orçamentos sem resposta",
  lead_idle: "Leads parados",
  patient_return: "Retornos sem marcar",
  no_show: "Faltas sem remarcar",
  stock_expiry: "Estoque perto da validade",
  open_slot: "Horários vagos até amanhã",
};

function today(d: FlowData): FlowAnswer {
  const confirm = awaiting(d, 0).length + awaiting(d, 1).length;
  const late = unrecorded(d).length;
  const slots = openSlots(d).length;
  const fresh = d.leads.filter((l) => l.stage === "novo").length;
  const stuck = stuckLeads(d);
  const noShows = missed(d).length;
  const overdue = dueReturns(d).filter((p) => daysFrom(d.now, p.nextReturnAt!) < 0).length;
  const expiring = expiryOpportunities(d).length;
  const items = [
    { n: confirm, label: "Confirmar atendimentos de hoje e amanhã", value: String(confirm) },
    { n: late, label: "Registrar atendimentos que passaram", value: String(late) },
    { n: slots, label: "Preencher horários vagos", value: String(slots) },
    { n: fresh, label: "Responder leads novos", value: String(fresh) },
    { n: stuck.length, label: "Fazer follow-up de orçamentos", value: brl(stuck.reduce((s, l) => s + l.potentialValue, 0)) },
    { n: noShows, label: "Remarcar quem faltou", value: String(noShows) },
    { n: overdue, label: "Convidar retornos atrasados", value: String(overdue) },
    { n: expiring, label: "Usar lotes perto da validade", value: String(expiring) },
  ].filter((x) => x.n > 0);
  if (!items.length) return { text: "Nada pendente hoje. A operação está em dia." };
  return {
    text: `Hoje há ${plural(items.length, "frente", "frentes")} pedindo ação. Nesta ordem: primeiro a agenda, depois o dinheiro parado.`,
    items: items.map(({ label, value }) => ({ label, value })),
    link: { label: "Abrir a visão geral", view: "" },
  };
}

function returns(d: FlowData): FlowAnswer {
  const due = dueReturns(d);
  if (!due.length) return { text: "Ninguém está no período de retorno sem horário marcado agora." };
  const top = [...due].sort((a, b) => returnValue(d, b) - returnValue(d, a)).slice(0, 6);
  return {
    text: `${plural(due.length, "paciente está", "pacientes estão")} no período de retorno sem nada marcado, cerca de ${brl(due.reduce((s, p) => s + returnValue(d, p), 0))} em retornos prováveis. Os de maior valor:`,
    items: top.map((p) => {
      const days = daysFrom(d.now, p.nextReturnAt!);
      return {
        label: `${p.name} · ${procedureOf(d, history(d, p.id)[0]?.procedureId ?? "")?.name ?? "procedimento"}`,
        value: `${days < 0 ? `atrasado há ${-days} dias` : days === 0 ? "hoje" : `em ${days} dias`} · ${brl(returnValue(d, p))}`,
      };
    }),
    link: { label: "Ver pacientes", view: "pacientes" },
  };
}

function noShows(d: FlowData): FlowAnswer {
  const list = missed(d);
  if (!list.length) return { text: "Ninguém faltou nos últimos 14 dias sem remarcar." };
  return {
    text: `${plural(list.length, "paciente faltou", "pacientes faltaram")} nos últimos 14 dias e não ${list.length === 1 ? "remarcou" : "remarcaram"}:`,
    items: list.map(({ patient, step }) => {
      const procedure = procedureOf(d, step.appointment.procedureId);
      return {
        label: `${patient.name} · ${procedure?.name ?? "atendimento"}`,
        value: `${relDay(d.now, step.appointment.startsAt)} · ${brl(procedure?.price ?? 0)}`,
      };
    }),
    link: { label: "Preparar convites para remarcar", view: "oportunidades" },
  };
}

function slots(d: FlowData): FlowAnswer {
  const free = openSlots(d);
  if (!free.length) return { text: "Não há horário vago hoje nem amanhã.", link: { label: "Abrir a agenda", view: "agenda" } };
  return {
    text: `${plural(free.length, "horário está vago", "horários estão vagos")} entre hoje e amanhã. Ao lado, quem mais combina com cada um:`,
    items: free.map((s) => ({
      label: `${capital(relDay(d.now, s.startsAt))} às ${hour(s.startsAt)}${s.status === "cancelado" ? " · cancelamento" : ""}`,
      value: slotMatches(d, s.startsAt, 1)[0]?.patient.name ?? "ninguém compatível",
    })),
    link: { label: "Abrir a agenda", view: "agenda" },
  };
}

function fronts(d: FlowData): FlowAnswer {
  const open = opportunities(d)
    .filter((o) => o.count > 0)
    .sort((a, b) => b.value - a.value);
  if (!open.length) return { text: "Nenhuma oportunidade aberta agora." };
  return {
    text: `${plural(open.length, "frente aberta", "frentes abertas")}, da que vale mais para a que vale menos:`,
    items: open.map((o) => ({ label: `${FRONT[o.kind]} (${o.count})`, value: brl(o.value) })),
    link: { label: "Abrir as oportunidades", view: "oportunidades" },
  };
}

function potential(d: FlowData): FlowAnswer {
  const ops = opportunities(d);
  const total = potentialOf(ops);
  if (!total) return { text: "Nenhuma receita potencial nas oportunidades abertas agora." };
  const top = ops.filter((o) => o.count > 0 && o.value > 0).sort((a, b) => b.value - a.value);
  return {
    text: `Cerca de ${brl(total)} em receita potencial nas oportunidades abertas. É o que está ao alcance, não o que já entrou: o rastreamento de receita recuperada chega em breve.`,
    items: top.map((o) => ({ label: FRONT[o.kind], value: brl(o.value) })),
    link: { label: "Abrir as oportunidades", view: "oportunidades" },
  };
}

function stock(d: FlowData): FlowAnswer {
  const near = expiryOpportunities(d);
  if (!near.length) return { text: "Nenhum lote está perto da validade agora." };
  const cost = near.reduce((s, x) => s + lotValue(d, x.lot), 0);
  const worth = near.reduce((s, x) => s + x.potential, 0);
  return {
    text: `Sim: ${plural(near.length, "lote vence", "lotes vencem")} nos próximos 45 dias, ${brl(cost)} em produto. Usados a tempo nos procedimentos certos, rendem cerca de ${brl(worth)}.`,
    items: near.map((x) => ({
      label: `${x.product?.name}: ${units(x.lot.quantity, x.product?.unit ?? "un")}, vence em ${daysFrom(d.now, x.lot.expiresAt)} dias`,
      value: `${plural(x.patients.length, "compatível", "compatíveis")} · ${brl(x.potential)}`,
    })),
    link: { label: "Ver no estoque", view: "estoque" },
  };
}

function leaks(d: FlowData): FlowAnswer {
  const open = opportunities(d)
    .filter((o) => o.count > 0 && o.value > 0)
    .sort((a, b) => b.value - a.value);
  if (!open.length) return { text: "Não vejo dinheiro parado agora: nenhuma oportunidade com valor aberta." };
  return {
    text: `Há cerca de ${brl(open.reduce((s, o) => s + o.value, 0))} parados em ${plural(open.length, "frente", "frentes")}. O maior vazamento está em ${FRONT[open[0].kind].toLowerCase()}, com ${brl(open[0].value)}.`,
    items: open.map((o) => ({ label: `${FRONT[o.kind]} (${o.count})`, value: brl(o.value) })),
    link: { label: "Abrir as oportunidades", view: "oportunidades" },
  };
}

/** The questions the Pulse answers today, each by its own calculation. */
const ANSWERS: Record<string, (d: FlowData) => FlowAnswer> = {
  "O que preciso fazer hoje?": today,
  "Quem precisa retornar?": returns,
  "Quem faltou?": noShows,
  "Quais horários estão vagos?": slots,
  "Quais oportunidades tenho?": fronts,
  "Quanto tenho de receita potencial?": potential,
  "Tenho produto perto da validade?": stock,
  "Onde estou perdendo dinheiro?": leaks,
};

export const SUGGESTED = Object.keys(ANSWERS);

export const localAssistant: FlowAssistant = {
  async ask(question, d) {
    const answer = ANSWERS[question];
    if (answer) return answer(d);
    return {
      text: "Perguntas livres chegam com o Pulse AI, em breve. Por enquanto, escolha uma destas: cada resposta é calculada na hora com os dados da clínica.",
      items: SUGGESTED.map((s) => ({ label: s, value: "" })),
    };
  },
};

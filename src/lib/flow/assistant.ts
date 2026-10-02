import { PRICE } from "./access";
import { brl, capital, daysFrom, hour, plural, relDay, units } from "./format";
import {
  awaiting,
  daySlots,
  expiryOpportunities,
  lotValue,
  missed,
  openSlots,
  opportunities,
  overdueReturns,
  procedureOf,
  recovered,
  returnValue,
  history,
  slotMatches,
  stuckLeads,
  unrecorded,
  type Slot,
} from "./insights";
import type { FlowData, OpportunityKind } from "./types";

/*
  "Pergunte ao Pulse". The contract a real model will implement later (an API
  route calling it with the clinic's data as context); today a local version
  answers from the same insights the screens use. No AI is called.
*/

export interface FlowAnswer {
  text: string;
  items?: { label: string; value: string }[];
  link?: { label: string; /** A screen of the Pulse, as in VIEWS. */ view: string };
}

export interface FlowAssistant {
  ask(question: string, data: FlowData): Promise<FlowAnswer>;
}

export const SUGGESTED = [
  "O que preciso fazer hoje?",
  "Quem posso chamar para preencher 16h30?",
  "Quem está atrasado para retornar?",
  "Quais orçamentos estão parados?",
  "Tem produto perto da validade?",
  "Quanto o Pulse recuperou este mês?",
  "Onde estou perdendo dinheiro?",
];

const FRONT: Record<OpportunityKind, string> = {
  lead_followup: "Orçamentos sem resposta",
  lead_idle: "Leads parados",
  patient_return: "Retornos sem marcar",
  no_show: "Faltas sem remarcar",
  stock_expiry: "Estoque perto da validade",
  open_slot: "Horários vazios até amanhã",
};

const RECOVERED_BY: [string, OpportunityKind[]][] = [
  ["Retornos recuperados", ["patient_return", "no_show"]],
  ["Orçamentos recuperados", ["lead_followup"]],
  ["Horários preenchidos", ["open_slot"]],
  ["Leads convertidos", ["lead_idle"]],
  ["Oportunidades vindas de estoque", ["stock_expiry"]],
];

const plain = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

function today(d: FlowData): FlowAnswer {
  const confirm = awaiting(d, 0).length + awaiting(d, 1).length;
  const slots = openSlots(d);
  const fresh = d.leads.filter((l) => l.stage === "novo").length;
  const stuck = stuckLeads(d);
  const noShows = missed(d).length;
  const overdue = overdueReturns(d).length;
  const expiring = expiryOpportunities(d).length;
  const items = [
    { n: confirm, label: "Confirmar atendimentos de hoje e amanhã", value: String(confirm) },
    { n: unrecorded(d).length, label: "Registrar atendimentos que passaram", value: String(unrecorded(d).length) },
    { n: slots.length, label: "Preencher horários vazios", value: String(slots.length) },
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

/** "16h30", "16:30", "às 9h": the hour a question names, as "HH:MM". */
function askedTime(q: string) {
  const m = q.match(/(\d{1,2})\s*(?:h|:)\s*(\d{2})?/);
  if (!m) return undefined;
  const h = Number(m[1]);
  if (h > 23) return undefined;
  return `${String(h).padStart(2, "0")}:${m[2] ?? "00"}`;
}

function fill(d: FlowData, q: string): FlowAnswer {
  const wanted = askedTime(q);
  // The hour asked for: today if it is still ahead, otherwise the next day it is free in the coming week.
  let slot: Slot | undefined;
  if (wanted) {
    for (let day = 0; day <= 7 && !slot; day++) {
      slot = daySlots(d, day).find((s) => s.startsAt.slice(11, 16) === wanted && s.status !== "ocupado" && s.startsAt > d.now);
    }
  } else {
    slot = openSlots(d)[0];
  }
  if (!slot) {
    return {
      text: wanted
        ? `Não há horário livre às ${hour(`2000-01-01T${wanted}:00.000Z`)} na próxima semana.`
        : "A agenda de hoje e de amanhã está cheia.",
      link: { label: "Abrir a agenda", view: "agenda" },
    };
  }
  const matches = slotMatches(d, slot.startsAt);
  const when = `${relDay(d.now, slot.startsAt)} às ${hour(slot.startsAt)}`;
  return {
    text: matches.length
      ? `${capital(when)} está livre${slot.status === "cancelado" ? " (houve um cancelamento)" : ""}. Encontrei ${plural(matches.length, "paciente compatível", "pacientes compatíveis")}, do mais provável para o menos:`
      : `${capital(when)} está livre, mas ninguém da lista de espera ou com retorno próximo combina com o horário.`,
    items: matches.map((m) => ({ label: `${m.patient.name} · ${m.procedure.name} · ${m.reasons.join(" · ")}`, value: `${m.score}%` })),
    link: { label: "Abrir a agenda e preparar o convite", view: "agenda" },
  };
}

function late(d: FlowData): FlowAnswer {
  const overdue = overdueReturns(d);
  if (!overdue.length) return { text: "Ninguém está com o retorno atrasado agora." };
  const top = [...overdue].sort((a, b) => returnValue(d, b) - returnValue(d, a)).slice(0, 6);
  return {
    text: `${plural(overdue.length, "paciente está", "pacientes estão")} com o retorno atrasado e nada marcado, cerca de ${brl(overdue.reduce((s, p) => s + returnValue(d, p), 0))} em retornos prováveis. Os de maior valor:`,
    items: top.map((p) => ({
      label: `${p.name} · ${procedureOf(d, history(d, p.id)[0]?.procedureId ?? "")?.name ?? "procedimento"}`,
      value: `há ${-daysFrom(d.now, p.nextReturnAt!)} dias · ${brl(returnValue(d, p))}`,
    })),
    link: { label: "Ver pacientes", view: "pacientes" },
  };
}

function leads(d: FlowData): FlowAnswer {
  const stuck = stuckLeads(d);
  if (!stuck.length) return { text: "Nenhum orçamento parado agora." };
  return {
    text: `${plural(stuck.length, "pessoa recebeu", "pessoas receberam")} orçamento e não ${stuck.length === 1 ? "respondeu" : "responderam"} há 3 dias ou mais, cerca de ${brl(stuck.reduce((s, l) => s + l.potentialValue, 0))} em aberto. Os de maior valor:`,
    items: stuck.slice(0, 5).map((l) => ({
      label: `${l.name} · ${procedureOf(d, l.procedureId)?.name ?? "interesse a definir"}`,
      value: `${brl(l.potentialValue)} · ${-daysFrom(d.now, l.lastContactAt)} dias`,
    })),
    link: { label: "Preparar follow-up", view: "oportunidades" },
  };
}

function stock(d: FlowData): FlowAnswer {
  const near = expiryOpportunities(d);
  if (!near.length) return { text: "Nenhum lote está perto da validade agora." };
  const cost = near.reduce((s, x) => s + lotValue(d, x.lot), 0);
  const potential = near.reduce((s, x) => s + x.potential, 0);
  return {
    text: `Sim: ${plural(near.length, "lote vence", "lotes vencem")} nos próximos 45 dias, ${brl(cost)} em produto. Usados a tempo nos procedimentos certos, rendem cerca de ${brl(potential)}.`,
    items: near.map((x) => ({
      label: `${x.product?.name}: ${units(x.lot.quantity, x.product?.unit ?? "un")}, vence em ${daysFrom(d.now, x.lot.expiresAt)} dias`,
      value: `${plural(x.patients.length, "compatível", "compatíveis")} · ${brl(x.potential)}`,
    })),
    link: { label: "Ver no estoque", view: "estoque" },
  };
}

function brought(d: FlowData): FlowAnswer {
  const back = recovered(d);
  if (!back.total) return { text: "Ainda não há receita recuperada registrada nos últimos 30 dias." };
  const times = Math.floor(back.total / PRICE);
  return {
    text: `Nos últimos 30 dias o Pulse ajudou a recuperar ${brl(back.total)}${times >= 1 ? `: ${times}× a mensalidade de ${brl(PRICE)}` : ""}. Por frente:`,
    items: RECOVERED_BY.map(([label, kinds]) => ({
      label,
      value: brl(kinds.reduce((s, k) => s + (back.byKind.get(k) ?? 0), 0)),
    })),
    link: { label: "Ver de onde veio", view: "" },
  };
}

function leaks(d: FlowData): FlowAnswer {
  const open = opportunities(d)
    .filter((o) => o.count > 0)
    .sort((a, b) => b.value - a.value);
  if (!open.length) return { text: "Não vejo dinheiro parado agora: nenhuma oportunidade aberta." };
  const total = open.reduce((s, o) => s + o.value, 0);
  return {
    text: `Há cerca de ${brl(total)} parados em ${plural(open.length, "frente", "frentes")}. O maior vazamento está em ${FRONT[open[0].kind].toLowerCase()}, com ${brl(open[0].value)}.`,
    items: open.map((o) => ({ label: `${FRONT[o.kind]} (${o.count})`, value: brl(o.value) })),
    link: { label: "Abrir as oportunidades", view: "oportunidades" },
  };
}

export const localAssistant: FlowAssistant = {
  async ask(question, d) {
    const q = plain(question);
    if (/perd|perda|vazan|dinheiro parado|desperdic/.test(q)) return leaks(d);
    if (/recuper|economiz|retorno do pulse|quanto o pulse/.test(q)) return brought(d);
    if (/preench|encaix|chamar para|\d{1,2}\s*(h|:)/.test(q)) return fill(d, q);
    if (/validade|venc|estoque|produto|lote/.test(q)) return stock(d);
    if (/orcamento|lead|parad|follow|venda|resposta/.test(q)) return leads(d);
    if (/atrasad|retorn|voltar|reativ/.test(q)) return late(d);
    if (/hoje|fazer|agir|priorid|atenc|resumo|como est|clinica|oportunidade/.test(q)) return today(d);
    if (/agenda|horario|amanha|vag|cancel/.test(q)) return fill(d, q);
    return {
      text: "Por enquanto eu respondo sobre o dia, a agenda, os retornos, os orçamentos, o estoque e o que o Pulse recuperou. Tente uma destas:",
      items: SUGGESTED.map((s) => ({ label: s, value: "" })),
    };
  },
};

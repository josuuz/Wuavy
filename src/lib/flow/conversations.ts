import { daysFrom, hour, relDay } from "./format";
import { dueReturns, expiringLots, openSlots, procedureOf, proceduresUsing, staleQuote } from "./insights";
import type { FlowData, ID, Lead, Patient } from "./types";

/*
  Conversas: the clinic's history with each person, tied to the CRM's contact
  or patient, so the conversation, the funnel and the agenda read the same
  person. A real clinic's lives in the database (conversations and
  conversation_messages, migration 0009): one conversation per person, each
  entry with its direction, channel, time and author. Until WhatsApp is
  connected, the team registers what happened by hand (a message, a call, a
  note); the Pulse never presents one of those as received or sent by
  WhatsApp itself. When the integration comes, its messages enter the same
  conversations with channel "whatsapp" and their provider id (which keeps a
  message from entering twice).

  The demo builds believable threads from its fictitious clinic, in memory
  (demoConversations, below).
*/

export const CONVERSATION_STATUSES = ["aberta", "aguardando_cliente", "follow_up", "resolvida"] as const;
export type ConversationStatus = (typeof CONVERSATION_STATUSES)[number];

/** Who is on the other side: a contact in the funnel, a patient, or both (a contact who booked). */
export interface ConversationParticipant {
  leadId?: ID;
  patientId?: ID;
  name: string;
  phone: string;
}

/** "in": from the person. "out": from the clinic. "note": internal, never sent. */
export type MessageDirection = "in" | "out" | "note";
export type MessageStatus = "enviada" | "entregue" | "lida";

/**
 * How an entry happened. The first three are registered by hand; a note is
 * internal; "whatsapp" is what the integration itself will write.
 */
export const CHANNELS = ["whatsapp_manual", "phone", "manual", "internal_note", "whatsapp"] as const;
export type Channel = (typeof CHANNELS)[number];
/** What a person registers: everything but the integration's own channel. */
export const MANUAL_CHANNELS = ["whatsapp_manual", "phone", "manual"] as const;

export const CHANNEL_LABEL: Record<Channel, string> = {
  whatsapp_manual: "WhatsApp",
  phone: "Ligação",
  manual: "Pessoalmente ou outro",
  internal_note: "Nota interna",
  whatsapp: "WhatsApp",
};

/** Where a message sent through WhatsApp is: the database's delivery status (migration 0009). */
export type DeliveryStatus = "pending" | "sent" | "delivered" | "read" | "failed" | "received";

export const DELIVERY_LABEL: Record<Exclude<DeliveryStatus, "received">, string> = {
  pending: "Enviando",
  sent: "Enviado",
  delivered: "Entregue",
  read: "Lido",
  failed: "Falhou",
};

/** Meta's customer service window: free-form replies only within 24 hours of the person's last message. */
export const REPLY_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface Message {
  id: ID;
  conversationId: ID;
  direction: MessageDirection;
  text: string;
  at: string;
  /** Delivery, for what the clinic sent. */
  status?: MessageStatus;
  /** The team member who wrote it (sent, registered or noted). */
  authorId?: ID;
  /** A real clinic's entries say how they happened. */
  channel?: Channel;
  /** Sent through WhatsApp by the Pulse: where it is (sending, sent, delivered, read, failed). */
  delivery?: DeliveryStatus;
}

/** A conversation_messages row as the screens read it. */
export function toMessage(m: {
  id: string;
  conversation_id: string;
  direction: string;
  channel: string;
  body: string;
  occurred_at: string;
  author_id: string | null;
  delivery_status: string | null;
}): Message {
  return {
    id: m.id,
    conversationId: m.conversation_id,
    direction: m.direction as MessageDirection,
    text: m.body,
    at: new Date(m.occurred_at).toISOString(),
    authorId: m.author_id ?? undefined,
    channel: m.channel as Channel,
    delivery: (m.delivery_status as DeliveryStatus | null) ?? undefined,
  };
}

export interface Conversation {
  id: ID;
  organizationId: ID;
  channel?: "whatsapp";
  participant: ConversationParticipant;
  status: ConversationStatus;
  assignedUserId?: ID;
  followUpAt?: string;
  unread: number;
  /** A real clinic's latest entry, for the list (its thread loads when opened). */
  lastMessage?: { text: string; direction: MessageDirection; at: string };
}

/** A page of a conversation's history, oldest first, and whether there is more before it. */
export interface Thread {
  messages: Message[];
  more: boolean;
  /**
   * Until when a free-form WhatsApp reply may be sent (24 hours after the
   * person's last WhatsApp message, on the clinic's clock); absent when they
   * never wrote by WhatsApp.
   */
  replyUntil?: string;
}

/** How many entries a thread loads at a time. */
export const THREAD_PAGE = 50;

/** A quick reply. {nome} and {procedimento} are filled from the conversation. */
export interface MessageTemplate {
  id: ID;
  name: string;
  text: string;
}

export interface ConversationSource {
  load(data: FlowData): { conversations: Conversation[]; messages: Message[] };
}

export const TEMPLATES: MessageTemplate[] = [
  {
    id: "tpl_info",
    name: "Informações do procedimento",
    text: "Olá, {nome}! Vi que você pediu informações sobre {procedimento}. Posso te explicar como funciona e os valores?",
  },
  { id: "tpl_avaliacao", name: "Convite para avaliação", text: "Gostaria de agendar uma avaliação, {nome}? É rápida e sem compromisso." },
  { id: "tpl_duvida", name: "Acompanhamento", text: "Oi, {nome}! Passando para saber se ficou alguma dúvida sobre {procedimento}." },
  { id: "tpl_horario", name: "Horário disponível", text: "{nome}, temos um horário disponível amanhã. Quer que eu reserve para você?" },
];

export const firstName = (name: string) => name.split(" ")[0] ?? name;

export function fillTemplate(text: string, ctx: { name: string; procedure?: string }) {
  return text.replaceAll("{nome}", firstName(ctx.name)).replaceAll("{procedimento}", ctx.procedure ?? "o procedimento");
}

/** The contact and the patient behind a conversation, as the CRM has them now. */
export function personOf(data: FlowData, c: Conversation): { lead?: Lead; patient?: Patient } {
  const lead = c.participant.leadId ? data.leads.find((l) => l.id === c.participant.leadId) : undefined;
  const patientId = c.participant.patientId ?? lead?.patientId;
  return { lead, patient: patientId ? data.patients.find((p) => p.id === patientId) : undefined };
}

/**
 * The conversation as the rest of the Pulse knows the person now: the name
 * and phone come from the contact or the patient, never from a copy taken
 * when the conversation was loaded, so an edit in Vendas or Pacientes shows here.
 */
export function withContact(data: FlowData, c: Conversation): Conversation {
  const { lead, patient } = personOf(data, c);
  const person = lead ?? patient;
  return person ? { ...c, participant: { ...c.participant, name: person.name, phone: person.phone } } : c;
}

/** The procedure the person is interested in, or the last one they did. */
export function procedureFor(data: FlowData, c: Conversation) {
  const { lead, patient } = personOf(data, c);
  if (lead) return procedureOf(data, lead.procedureId);
  const last = patient
    ? data.appointments
        .filter((a) => a.patientId === patient.id && a.status === "concluido")
        .sort((a, b) => b.startsAt.localeCompare(a.startsAt))[0]
    : undefined;
  return last ? procedureOf(data, last.procedureId) : undefined;
}

/** The person wrote last and nobody answered: the clinic owes a reply. */
export function waitingOnClinic(messages: Message[]) {
  const last = messages.filter((m) => m.direction !== "note").at(-1);
  return last?.direction === "in";
}

/** At most one thing the Pulse wants said about this conversation, the most urgent first. */
export type ConversationSignal =
  | { kind: "stale"; text: string; action: string }
  | { kind: "return"; text: string; action: string }
  | { kind: "slot"; text: string; action: string; startsAt: string }
  | { kind: "stock"; text: string; action: string };

export function signalFor(data: FlowData, c: Conversation): ConversationSignal | null {
  const { lead, patient } = personOf(data, c);
  if (lead && staleQuote(data, lead)) {
    const days = -daysFrom(data.now, lead.lastContactAt);
    return { kind: "stale", text: `Este lead está há ${days} dias sem resposta.`, action: "Acompanhar agora" };
  }
  if (patient && dueReturns(data).some((p) => p.id === patient.id)) {
    return { kind: "return", text: "Paciente está entrando no período de retorno.", action: "Sugerir mensagem" };
  }
  const procedure = procedureFor(data, c);
  if (!procedure || c.status === "resolvida") return null;
  const slot = openSlots(data).find((s) => daysFrom(data.now, s.startsAt) === 1);
  if (slot && lead && lead.stage !== "agendado") {
    return {
      kind: "slot",
      text: `Existe um horário disponível amanhã às ${hour(slot.startsAt)}, compatível com ${procedure.name}.`,
      action: "Oferecer horário",
      startsAt: slot.startsAt,
    };
  }
  const expiring = expiringLots(data).some((lot) =>
    proceduresUsing(data, lot.productId).some((u) => u.procedure.id === procedure.id),
  );
  if (expiring) {
    return { kind: "stock", text: "Existe estoque relacionado a este procedimento próximo da validade.", action: "Ver oportunidade" };
  }
  return null;
}

/** The message a signal proposes, for a person to review before sending. */
export function signalMessage(data: FlowData, c: Conversation, signal: ConversationSignal) {
  const name = firstName(c.participant.name);
  const procedure = procedureFor(data, c)?.name ?? "o procedimento";
  switch (signal.kind) {
    case "stale":
      return `Oi, ${name}! Conseguiu ver o orçamento de ${procedure}? Se quiser, ajusto a forma de pagamento ou tiro qualquer dúvida.`;
    case "return":
      return `Oi, ${name}! Já está chegando a hora do retorno de ${procedure}. Quer que eu veja um horário para você esta semana?`;
    case "slot":
      return `${name}, abriu um horário ${relDay(data.now, signal.startsAt)} às ${hour(signal.startsAt)} para ${procedure}. Quer que eu reserve para você?`;
    case "stock":
      return `Oi, ${name}! Estamos com uma condição especial para ${procedure} nas próximas semanas. Quer saber mais?`;
  }
}

/**
 * A suggested reply, written from the conversation's context: its stage, the
 * procedure, what the person last said and the next action. Deterministic
 * for now; the same inputs will feed a model later. Always reviewed by a
 * person before it is sent.
 */
export function suggestReply(data: FlowData, c: Conversation, messages: Message[]) {
  const { lead, patient } = personOf(data, c);
  const name = firstName(c.participant.name);
  const procedure = procedureFor(data, c)?.name ?? "o procedimento";
  const last = messages.filter((m) => m.direction === "in").at(-1)?.text.toLowerCase() ?? "";
  if (/(valor|preço|preco|quanto)/.test(last)) {
    return `Oi, ${name}! ${capitalFirst(procedure)} sai a partir do valor que conversamos na avaliação, que é gratuita. Quer agendar para esta semana?`;
  }
  if (/(horário|horario|dia|agenda|semana)/.test(last)) {
    return `Claro, ${name}! Tenho horários na quinta e na sexta à tarde. Qual fica melhor para você?`;
  }
  if (lead?.stage === "orcamento") return `Oi, ${name}! Ficou alguma dúvida sobre o orçamento de ${procedure}? Posso ajustar o que precisar.`;
  if (lead?.stage === "avaliacao") return `${name}, posso confirmar sua avaliação para ${procedure}? É só me dizer o melhor dia.`;
  if (patient && !lead) return `Oi, ${name}! Como você está depois do ${procedure}? Quer agendar o próximo?`;
  return `Oi, ${name}! Obrigada pelo contato. Me conta um pouco do que você procura em ${procedure}?`;
}

const capitalFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/* ── The demo's conversations ──────────────────────────────── */

const at = (now: string, minutesAgo: number) => new Date(Date.parse(now) - minutesAgo * 60_000).toISOString();
const H = 60;
const D = 24 * H;

type Line = readonly [MessageDirection, number, string];

/** A short thread for each situation the funnel and the agenda can be in. */
function script(stage: Lead["stage"] | "retorno", name: string, procedure: string, quoteAgoDays: number): Line[] {
  const n = firstName(name);
  switch (stage) {
    case "novo":
      return [
        ["in", 95, `Oi! Vi o post de ${procedure} no Instagram. Quanto custa?`],
        ["in", 92, "E dói?"],
      ];
    case "contato":
      return [
        ["in", 2 * D, `Boa tarde, queria saber sobre ${procedure}.`],
        ["out", 2 * D - 30, `Boa tarde, ${n}! Claro. Você já fez algum procedimento parecido antes?`],
        ["in", 40, "Nunca fiz. Tem horário semana que vem?"],
      ];
    case "avaliacao":
      return [
        ["out", 3 * D, `Oi, ${n}! Sua avaliação de ${procedure} ficou para quinta, combinado?`],
        ["in", 3 * D - 20, "Combinado!"],
        ["note", 3 * D - 15, "Cliente prefere horários depois das 18h."],
      ];
    case "orcamento":
      return [
        ["in", (quoteAgoDays + 1) * D, `Fiz a avaliação ontem, pode me mandar o orçamento de ${procedure}?`],
        ["out", quoteAgoDays * D, `Claro, ${n}! Segue o orçamento de ${procedure}, com parcelamento em até 6x.`],
      ];
    case "agendado":
      return [
        ["out", 26 * H, `Prontinho, ${n}! Seu horário de ${procedure} está confirmado.`],
        ["in", 25 * H, "Perfeito, obrigada!"],
      ];
    case "retorno":
      return [
        ["out", 50 * D, `Oi, ${n}! Como ficou o resultado do ${procedure}?`],
        ["in", 50 * D - 60, "Amei! Volto quando for a hora."],
      ];
  }
}

export const demoConversations: ConversationSource = {
  load(data) {
    const org = data.organization.id;
    const reception = data.users.find((u) => u.role === "reception") ?? data.users[0];
    const owner = data.users.find((u) => u.role === "owner") ?? data.users[0];
    const stages = ["novo", "contato", "avaliacao", "orcamento", "agendado"] as const;
    const leads = stages.flatMap((stage) =>
      data.leads
        .filter((l) => l.stage === stage)
        .sort((a, b) => b.potentialValue - a.potentialValue)
        .slice(0, stage === "orcamento" ? 2 : 1),
    );
    const leadPatients = new Set(leads.map((l) => l.patientId).filter(Boolean));
    const returning = dueReturns(data)
      .filter((p) => !leadPatients.has(p.id))
      .slice(0, 2);

    const conversations: Conversation[] = [];
    const messages: Message[] = [];
    const add = (participant: ConversationParticipant, lines: Line[], extra: Partial<Conversation>, i: number) => {
      const id = `conv_demo_${i}`;
      lines.forEach(([direction, ago, text], j) =>
        messages.push({
          id: `${id}_m${j}`,
          conversationId: id,
          direction,
          text,
          at: at(data.now, ago),
          status: direction === "out" ? "lida" : undefined,
          authorId: direction === "in" ? undefined : reception?.id,
        }),
      );
      const unread = lines.slice().reverse().findIndex(([d]) => d !== "in");
      conversations.push({
        id,
        organizationId: org,
        channel: "whatsapp",
        participant,
        status: "aberta",
        assignedUserId: reception?.id,
        unread: unread === -1 ? lines.length : unread,
        ...extra,
      });
    };

    leads.forEach((lead, i) => {
      const procedure = procedureOf(data, lead.procedureId)?.name ?? "procedimento";
      const quoteAgo = lead.quoteSentAt ? Math.max(1, -daysFrom(data.now, lead.quoteSentAt)) : 3;
      const extra: Partial<Conversation> =
        lead.stage === "orcamento"
          ? { status: "aguardando_cliente", assignedUserId: owner?.id }
          : lead.stage === "agendado"
            ? { status: "resolvida", unread: 0 }
            : lead.stage === "avaliacao"
              ? { status: "follow_up", followUpAt: at(data.now, -D) }
              : {};
      add({ leadId: lead.id, patientId: lead.patientId, name: lead.name, phone: lead.phone }, script(lead.stage, lead.name, procedure, quoteAgo), extra, i);
    });
    returning.forEach((patient, j) => {
      const last = data.appointments
        .filter((a) => a.patientId === patient.id && a.status === "concluido")
        .sort((a, b) => b.startsAt.localeCompare(a.startsAt))[0];
      const procedure = (last && procedureOf(data, last.procedureId)?.name) ?? "procedimento";
      add({ patientId: patient.id, name: patient.name, phone: patient.phone }, script("retorno", patient.name, procedure, 0), { unread: 0 }, leads.length + j);
    });
    return { conversations, messages };
  },
};

/** A real clinic's live in the database and come with its data (FlowData.conversations): nothing in memory. */
export const liveConversations: ConversationSource = {
  load: () => ({ conversations: [], messages: [] }),
};

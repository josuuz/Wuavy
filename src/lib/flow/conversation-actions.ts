"use server";

import { clinicNow } from "./clock";
import {
  CONVERSATION_STATUSES,
  MANUAL_CHANNELS,
  REPLY_WINDOW_MS,
  THREAD_PAGE,
  toMessage,
  type Channel,
  type Message,
  type Thread,
} from "./conversations";
import { samePhone } from "@/lib/whatsapp/phone";
import { LEAD_SOURCES } from "./types";
import { getSession } from "./session";
import { permissionsFor } from "./roles";
import { Invalid, id, oneOf, optionalId, required, text, write, type Db, type Result } from "./write";

/*
  Conversas' writes: the clinic's own history with each person, kept in the
  database (migration 0009) whether or not WhatsApp is connected. One
  conversation per person (by patient once they are one, by contact before),
  created the first time something is registered. Each entry says who spoke
  (the person, the clinic, or an internal note), how (WhatsApp, a call, in
  person), when, and who registered it: the database stamps the author from
  the session. Nothing here sends or receives a message, and nothing written
  by hand can pass for one WhatsApp delivered (the database refuses it).
*/

export interface StartResult extends Result {
  conversationId?: string;
}

export interface EntryResult extends Result {
  conversationId?: string;
  message?: Message;
}

/** Who a conversation is with: a contact, a patient, or both. */
export interface PersonRef {
  leadId?: string;
  patientId?: string;
}

const MESSAGE_COLUMNS = "id, conversation_id, direction, channel, body, occurred_at, author_id, delivery_status";
const asMessage = toMessage;

/** The person's conversation: the patient's when they are one, otherwise the contact's; created when there is none. */
async function conversationFor(db: Db, org: string, person: PersonRef): Promise<string> {
  let leadId = person.leadId ? id(person.leadId) : undefined;
  let patientId = person.patientId ? id(person.patientId) : undefined;
  if (leadId) {
    const { data: lead } = await db.from("leads").select("patient_id").eq("id", leadId).eq("organization_id", org).maybeSingle();
    if (!lead) throw new Invalid("Contato não encontrado.");
    patientId ??= lead.patient_id ?? undefined;
  }
  if (patientId) {
    const { data } = await db.from("conversations").select("id").eq("organization_id", org).eq("patient_id", patientId).maybeSingle();
    if (data) return data.id;
    // A contact's conversation from before they became this patient.
    if (leadId) {
      const { data: ofLead } = await db.from("conversations").select("id").eq("organization_id", org).eq("lead_id", leadId).maybeSingle();
      if (ofLead) return ofLead.id;
    }
    // The patient's contact (from Vendas) is kept on the conversation, when there is exactly one.
    if (!leadId) {
      const { data: leads } = await db.from("leads").select("id").eq("organization_id", org).eq("patient_id", patientId).limit(2);
      if (leads?.length === 1) leadId = leads[0].id;
    }
  } else if (leadId) {
    const { data } = await db.from("conversations").select("id").eq("organization_id", org).eq("lead_id", leadId).maybeSingle();
    if (data) return data.id;
  } else {
    throw new Invalid("Escolha com quem é a conversa.");
  }

  const made = await db
    .from("conversations")
    .insert({ organization_id: org, lead_id: leadId ?? null, patient_id: patientId ?? null })
    .select("id")
    .single();
  if (made.data) return made.data.id;
  // Two people starting the same conversation at once: the other one won, and it is the same conversation.
  if (made.error?.code === "23505") {
    const again = await db
      .from("conversations")
      .select("id")
      .eq("organization_id", org)
      .eq(patientId ? "patient_id" : "lead_id", (patientId ?? leadId)!)
      .maybeSingle();
    if (again.data) return again.data.id;
  }
  console.error("Pulse: conversation", made.error);
  throw new Invalid("Não foi possível abrir a conversa. Tente de novo.");
}

/**
 * Opens the conversation with someone: a contact or patient already in the
 * Pulse, or someone new. A new person is matched by phone first, so nobody is
 * registered twice; otherwise they enter Vendas as a new contact.
 */
export async function startConversation(form: FormData): Promise<StartResult> {
  let conversationId: string | undefined;
  const result = await write(async (db, org) => {
    const person: PersonRef = {};
    const pick = text(form, "person");
    if (pick.startsWith("lead:")) person.leadId = id(pick.slice(5));
    else if (pick.startsWith("patient:")) person.patientId = id(pick.slice(8));
    else {
      const name = required(text(form, "name", 200), "o nome");
      const phone = text(form, "phone", 40);
      if (phone) {
        const [{ data: patients }, { data: leads }] = await Promise.all([
          db.from("patients").select("id, phone").eq("organization_id", org).not("phone", "is", null),
          db.from("leads").select("id, phone, patient_id").eq("organization_id", org).not("phone", "is", null),
        ]);
        const patient = patients?.find((p) => samePhone(p.phone!, phone));
        const lead = leads?.find((l) => samePhone(l.phone!, phone));
        if (patient) person.patientId = patient.id;
        else if (lead) person.leadId = lead.id;
      }
      if (!person.patientId && !person.leadId) {
        const now = clinicNow();
        const { data, error } = await db
          .from("leads")
          .insert({
            organization_id: org,
            name,
            phone: phone || null,
            source: oneOf(text(form, "source") || "whatsapp", LEAD_SOURCES, "a origem"),
            stage: "contato",
            created_at: now,
            last_contact_at: now,
          })
          .select("id")
          .single();
        if (error) return error;
        person.leadId = data.id;
      }
    }
    conversationId = await conversationFor(db, org, person);
    return null;
  }, (can) => can.conversations);
  return result.error ? result : { conversationId };
}

/**
 * One entry of the history, registered by hand: what the person said, what
 * the clinic said, or an internal note. Writing to someone in Vendas counts
 * as contact with them (their "last contact" moves). The conversation is the
 * one given, or the person's, created now if they have none.
 */
export async function addEntry(conversationId: string | null, person: PersonRef | null, form: FormData): Promise<EntryResult> {
  let saved: Message | undefined;
  let into: string | undefined;
  const result = await write(async (db, org) => {
    const direction = oneOf(text(form, "direction"), ["in", "out", "note"] as const, "quem falou");
    const channel: Channel = direction === "note" ? "internal_note" : oneOf(text(form, "channel"), MANUAL_CHANNELS, "o canal");
    const body = required(text(form, "body", 4000), "o que aconteceu");
    into = conversationId ? id(conversationId) : await conversationFor(db, org, person ?? {});

    const { data: conversation, error: convError } = await db
      .from("conversations")
      .select("status, lead_id")
      .eq("id", into)
      .eq("organization_id", org)
      .maybeSingle();
    if (convError) return convError;
    if (!conversation) throw new Invalid("Conversa não encontrada.");

    const { data, error } = await db
      .from("conversation_messages")
      .insert({ organization_id: org, conversation_id: into, direction, channel, body })
      .select(MESSAGE_COLUMNS)
      .single();
    if (error) return error;
    saved = asMessage(data);

    // Who owes the next word: the clinic after the person spoke, the person after the clinic did.
    const status =
      direction === "in" ? "aberta" : direction === "out" && conversation.status === "aberta" ? "aguardando_cliente" : null;
    if (status && status !== conversation.status) {
      const moved = await db.from("conversations").update({ status }).eq("id", into).eq("organization_id", org);
      if (moved.error) return moved.error;
    }
    if (direction !== "note" && conversation.lead_id) {
      const touched = await db
        .from("leads")
        .update({ last_contact_at: clinicNow() })
        .eq("id", conversation.lead_id)
        .eq("organization_id", org)
        .neq("stage", "agendado");
      if (touched.error) return touched.error;
    }
    return null;
  }, (can) => can.conversations);
  return result.error ? result : { conversationId: into, message: saved };
}

/** The conversation's status, who answers it, and its follow-up day. */
export async function updateConversation(
  conversationId: string,
  change: { status?: string; assignedUserId?: string | null; followUpAt?: string | null },
): Promise<Result> {
  return write(async (db, org) => {
    const update: { status?: string; assigned_user_id?: string | null; follow_up_at?: string | null } = {};
    if (change.status !== undefined) update.status = oneOf(change.status, CONVERSATION_STATUSES, "o status");
    if (change.assignedUserId !== undefined) update.assigned_user_id = change.assignedUserId ? id(change.assignedUserId) : null;
    if (change.followUpAt !== undefined) {
      if (change.followUpAt && Number.isNaN(Date.parse(change.followUpAt))) throw new Invalid("Escolha a data do follow-up.");
      update.follow_up_at = change.followUpAt ? new Date(change.followUpAt).toISOString() : null;
      if (change.followUpAt) update.status = "follow_up";
    }
    const { data, error } = await db
      .from("conversations")
      .update(update)
      .eq("id", id(conversationId))
      .eq("organization_id", org)
      .select("id");
    if (error) return error;
    if (!data.length) throw new Invalid("Conversa não encontrada.");
    return null;
  }, (can) => can.conversations);
}

/**
 * A page of a conversation's history, oldest first: the latest entries, or
 * those before `before` (an entry's time) when the person scrolls back.
 */
export async function loadThread(conversationId: string, before?: string): Promise<Thread> {
  const session = await getSession();
  if (!session?.member || !permissionsFor(session.member.role).conversations) return { messages: [], more: false };
  const conversation = optionalId(conversationId);
  if (!conversation) return { messages: [], more: false };
  let query = session.supabase
    .from("conversation_messages")
    .select(MESSAGE_COLUMNS)
    .eq("organization_id", session.member.organization_id)
    .eq("conversation_id", conversation)
    .order("occurred_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(THREAD_PAGE + 1);
  if (before && !Number.isNaN(Date.parse(before))) query = query.lt("occurred_at", before);
  const [{ data }, { data: lastIn }] = await Promise.all([
    query,
    session.supabase
      .from("conversation_messages")
      .select("occurred_at")
      .eq("organization_id", session.member.organization_id)
      .eq("conversation_id", conversation)
      .eq("direction", "in")
      .eq("channel", "whatsapp")
      .order("occurred_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  const rows = data ?? [];
  return {
    messages: rows.slice(0, THREAD_PAGE).map(asMessage).reverse(),
    more: rows.length > THREAD_PAGE,
    replyUntil: lastIn ? new Date(Date.parse(lastIn.occurred_at) + REPLY_WINDOW_MS).toISOString() : undefined,
  };
}

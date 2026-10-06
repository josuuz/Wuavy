"use server";

import { randomInt } from "node:crypto";

import { refresh } from "next/cache";

import { READ_ONLY_MESSAGE } from "@/lib/flow/access";
import { clinicNow } from "@/lib/flow/clock";
import { toMessage, type Message } from "@/lib/flow/conversations";
import { permissionsFor, type Permissions } from "@/lib/flow/roles";
import { getClinicAccess, getSession } from "@/lib/flow/session";
import { NO_PERMISSION, type Db, type Result } from "@/lib/flow/write";
import { createAdminClient } from "@/lib/supabase/admin";
import { connectWay, embeddedSignup, testNumber } from "./config";
import {
  GraphError,
  exchangeCode,
  needsReconnect,
  notAllowedRecipient,
  outsideWindow,
  phoneInfo,
  registerNumber,
  requestHistorySync,
  sendText,
  subscribeApp,
  unsubscribeApp,
  wabaNumbers,
} from "./graph";
import { mask } from "./phone";

/*
  The WhatsApp channel's writes. The clinic and the person always come from
  the verified session; the role is checked here and the database refuses
  every write on connections to anyone signed in (migration 0012), so these
  run with the service role only after the check. Connecting, reconnecting
  and disconnecting are the owner's; sending is the front office's (owner and
  reception). Tokens are read here and go only to Meta.

  Disconnecting or changing the number never deletes a patient, a contact, a
  conversation or anything else: the channel stops, the history stays.
*/

export interface SendResult extends Result {
  message?: Message;
  /** Outside Meta's 24-hour window: only an approved template message could reach the person. */
  needsTemplate?: boolean;
}

const LIVE = ["connecting", "connected", "error"];
const WINDOW_CLOSED =
  "Para retomar esta conversa pelo WhatsApp é necessário usar uma mensagem aprovada. Por enquanto, responda pelo WhatsApp do celular ou registre o contato aqui.";
const SEND_FAILED = "Não foi possível enviar a mensagem.";
const CONNECT_FAILED = "Não foi possível conectar o WhatsApp agora. Tente de novo em alguns minutos.";
const MESSAGE_COLUMNS = "id, conversation_id, direction, channel, body, occurred_at, author_id, delivery_status";

/** The signed-in person, if their role and the subscription allow the change. */
async function allowed(need: (can: Permissions) => boolean) {
  const session = await getSession();
  if (!session?.member) return { error: "Sua sessão expirou ou seu acesso mudou. Entre de novo." } as const;
  if (!need(permissionsFor(session.member.role))) return { error: NO_PERMISSION } as const;
  if (!(await getClinicAccess())?.canEdit) return { error: READ_ONLY_MESSAGE } as const;
  return { session, org: session.member.organization_id, userId: session.user.id } as const;
}

const logGraph = (what: string, error: unknown) =>
  console.error(`WhatsApp: ${what}`, error instanceof GraphError ? error.reason : error instanceof Error ? error.message : "error");

/** Ends the clinic's live connection, if any: the channel stops, nothing else changes. */
async function endLive(admin: Db, org: string, userId: string) {
  const { data: live } = await admin
    .from("whatsapp_connections")
    .select("id, mode, waba_id")
    .eq("organization_id", org)
    .in("status", LIVE);
  for (const c of live ?? []) {
    if (c.mode === "embedded_signup") {
      const { data: token } = await admin.rpc("pulse_whatsapp_secret", { connection: c.id, kind: "token" });
      if (token && c.waba_id) await unsubscribeApp(token, c.waba_id).catch((e) => logGraph("unsubscribe failed", e));
      await admin.rpc("pulse_whatsapp_forget_secrets", { connection: c.id });
    }
    const { error } = await admin
      .from("whatsapp_connections")
      .update({ status: "disconnected", disconnected_at: new Date().toISOString(), disconnected_by: userId, updated_at: new Date().toISOString() })
      .eq("id", c.id);
    if (error) throw new Error(`WhatsApp: could not end connection (${error.code})`);
  }
}

/** Another clinic already has this number live. */
async function takenElsewhere(admin: Db, org: string, phoneNumberId: string) {
  const { data } = await admin
    .from("whatsapp_connections")
    .select("organization_id")
    .eq("phone_number_id", phoneNumberId)
    .in("status", LIVE)
    .neq("organization_id", org)
    .limit(1);
  return Boolean(data?.length);
}

const choiceOf = (value: string) => (value === "personal" ? "personal" : "clinic");

/* ── Connecting ───────────────────────────────────────────── */

/** The test phase: Meta's test number, for the one clinic allowed to use it. */
export async function connectTestNumber(numberChoice: string): Promise<Result> {
  const who = await allowed((can) => can.admin);
  if ("error" in who) return { error: who.error };
  const test = testNumber();
  if (!test || connectWay(who.session.user.email) !== "test") return { error: NO_PERMISSION };

  const admin = createAdminClient();
  if (await takenElsewhere(admin, who.org, test.phoneNumberId)) {
    return { error: "Este número já está conectado a outra clínica." };
  }
  let info: Awaited<ReturnType<typeof phoneInfo>>;
  try {
    info = await phoneInfo(test.token, test.phoneNumberId);
  } catch (error) {
    logGraph("test number unreachable", error);
    return {
      error:
        error instanceof GraphError && needsReconnect(error)
          ? "A Meta recusou o acesso ao número de teste. O token de teste precisa ser renovado na Vercel."
          : CONNECT_FAILED,
    };
  }
  await endLive(admin, who.org, who.userId);
  const now = new Date().toISOString();
  const { error } = await admin.from("whatsapp_connections").insert({
    organization_id: who.org,
    status: "connected",
    mode: "test",
    onboarding: "cloud_api",
    number_choice: choiceOf(numberChoice),
    phone_number_id: test.phoneNumberId,
    display_phone_number: info.display_phone_number?.slice(0, 40) ?? null,
    display_name: info.verified_name?.slice(0, 200) ?? null,
    connected_at: now,
    connected_by: who.userId,
  });
  if (error) {
    console.error("WhatsApp: test connection not saved", error.code);
    return { error: error.code === "23505" ? "Este número já está conectado a outra clínica." : CONNECT_FAILED };
  }
  refresh();
  return {};
}

export interface SignupResult {
  code: string;
  phoneNumberId: string;
  wabaId: string;
  businessId?: string;
  /** Meta's finish event: a number new to Cloud API, or one kept on the WhatsApp Business app. */
  businessApp: boolean;
  numberChoice: string;
}

/**
 * Meta's Embedded Signup finished in the owner's browser: the code becomes the
 * clinic's token here, the ids the browser relayed are checked against what
 * that token reaches, and the number starts sending its messages to the Pulse.
 */
export async function completeEmbeddedSignup(input: SignupResult): Promise<Result> {
  const who = await allowed((can) => can.admin);
  if ("error" in who) return { error: who.error };
  const signup = embeddedSignup();
  if (!signup || connectWay(who.session.user.email) !== "embedded_signup") return { error: NO_PERMISSION };
  const digits = /^\d{1,64}$/;
  if (
    typeof input.code !== "string" ||
    input.code.length > 2048 ||
    !digits.test(input.phoneNumberId) ||
    !digits.test(input.wabaId) ||
    (input.businessId && !digits.test(input.businessId))
  ) {
    return { error: CONNECT_FAILED };
  }

  const admin = createAdminClient();
  let token: string;
  try {
    token = await exchangeCode(signup.appId, input.code);
    if (!(await wabaNumbers(token, input.wabaId)).includes(input.phoneNumberId)) throw new GraphError(403, null, null);
  } catch (error) {
    logGraph("embedded signup refused", error);
    return { error: CONNECT_FAILED };
  }
  if (await takenElsewhere(admin, who.org, input.phoneNumberId)) {
    return { error: "Este número já está conectado a outra clínica." };
  }

  await endLive(admin, who.org, who.userId);
  const { data: made, error: madeError } = await admin
    .from("whatsapp_connections")
    .insert({
      organization_id: who.org,
      status: "connecting",
      mode: "embedded_signup",
      onboarding: input.businessApp ? "business_app" : "cloud_api",
      number_choice: choiceOf(input.numberChoice),
      business_id: input.businessId ?? null,
      waba_id: input.wabaId,
      phone_number_id: input.phoneNumberId,
    })
    .select("id")
    .single();
  if (madeError || !made) {
    console.error("WhatsApp: connection not saved", madeError?.code);
    return { error: madeError?.code === "23505" ? "Este número já está conectado a outra clínica." : CONNECT_FAILED };
  }

  try {
    const kept = await admin.rpc("pulse_whatsapp_keep_secret", { connection: made.id, kind: "token", value: token });
    if (kept.error) throw new Error(`token not kept (${kept.error.code})`);
    await subscribeApp(token, input.wabaId);
    if (input.businessApp) {
      // Coexistence: the number is already registered on the Business app; only the history sync is requested.
      await requestHistorySync(token, input.phoneNumberId).catch((e) => logGraph("history sync not requested", e));
    } else {
      const pin = String(randomInt(0, 1_000_000)).padStart(6, "0");
      await registerNumber(token, input.phoneNumberId, pin);
      const pinKept = await admin.rpc("pulse_whatsapp_keep_secret", { connection: made.id, kind: "pin", value: pin });
      if (pinKept.error) throw new Error(`pin not kept (${pinKept.error.code})`);
    }
    const info = await phoneInfo(token, input.phoneNumberId);
    const { error } = await admin
      .from("whatsapp_connections")
      .update({
        status: "connected",
        display_phone_number: info.display_phone_number?.slice(0, 40) ?? null,
        display_name: info.verified_name?.slice(0, 200) ?? null,
        connected_at: new Date().toISOString(),
        connected_by: who.userId,
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", made.id);
    if (error) throw new Error(`connection not updated (${error.code})`);
  } catch (error) {
    logGraph(`embedded signup incomplete for number ${mask(input.phoneNumberId)}`, error);
    await admin
      .from("whatsapp_connections")
      .update({ status: "error", last_error: error instanceof GraphError ? error.reason : "setup", updated_at: new Date().toISOString() })
      .eq("id", made.id);
    refresh();
    return { error: CONNECT_FAILED };
  }
  refresh();
  return {};
}

/** Stops the channel. Patients, contacts, conversations, the agenda and authorship stay as they are. */
export async function disconnectWhatsApp(): Promise<Result> {
  const who = await allowed((can) => can.admin);
  if ("error" in who) return { error: who.error };
  try {
    await endLive(createAdminClient(), who.org, who.userId);
  } catch (error) {
    console.error(error instanceof Error ? error.message : "WhatsApp: disconnect failed");
    return { error: "Não foi possível desconectar agora. Tente de novo." };
  }
  refresh();
  return {};
}

/* ── Sending ──────────────────────────────────────────────── */

interface Live {
  id: string;
  status: string;
  mode: string;
  phone_number_id: string;
}

async function tokenFor(admin: Db, connection: Live) {
  if (connection.mode === "test") {
    const test = testNumber();
    return test && test.phoneNumberId === connection.phone_number_id ? test.token : null;
  }
  const { data } = await admin.rpc("pulse_whatsapp_secret", { connection: connection.id, kind: "token" });
  return data ?? null;
}

/** The person's last WhatsApp message opened Meta's 24-hour window, and it is still open. */
async function windowOpen(db: Db, org: string, conversationId: string) {
  const { data } = await db
    .from("conversation_messages")
    .select("occurred_at")
    .eq("organization_id", org)
    .eq("conversation_id", conversationId)
    .eq("direction", "in")
    .eq("channel", "whatsapp")
    .order("occurred_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  // Both on the clinic's clock (lib/flow/clock.ts), so their difference is real time.
  return Boolean(data && Date.parse(clinicNow()) - Date.parse(data.occurred_at) < 24 * 60 * 60 * 1000);
}

/**
 * Sends one entry already written as "Enviando" (pending), and writes what
 * Meta answered: its id and "Enviado", or "Falhou" with Meta's code. The
 * delivery that follows (Entregue, Lido) arrives by the webhook.
 */
async function deliver(
  admin: Db,
  db: Db,
  org: string,
  entry: { id: string; conversation_id: string; body: string },
  connection: Live,
  to: string,
): Promise<SendResult> {
  const reread = async () => {
    const { data } = await db.from("conversation_messages").select(MESSAGE_COLUMNS).eq("id", entry.id).maybeSingle();
    return data ? toMessage(data) : undefined;
  };
  // The entry stays in the history as "Falhou", with "Tentar novamente".
  const fail = async (reason: string) => {
    await admin
      .from("conversation_messages")
      .update({ delivery_status: "failed", failed_reason: reason.slice(0, 120), status_at: new Date().toISOString() })
      .eq("id", entry.id);
    return reread();
  };
  const token = await tokenFor(admin, connection);
  if (!token) {
    const message = await fail("no_credentials");
    await admin.from("whatsapp_connections").update({ status: "error", last_error: "no_credentials" }).eq("id", connection.id);
    refresh();
    return { error: "Seu WhatsApp precisa ser reconectado. Peça ao responsável pela clínica.", message };
  }
  try {
    const providerId = await sendText(token, connection.phone_number_id, to, entry.body);
    const { error } = await admin
      .from("conversation_messages")
      .update({ provider_message_id: providerId, delivery_status: "sent", status_at: new Date().toISOString(), failed_reason: null })
      .eq("id", entry.id)
      .eq("delivery_status", "pending");
    if (error) console.error("WhatsApp: sent but not marked", error.code);
  } catch (error) {
    logGraph(`send failed (message ${mask(entry.id)})`, error);
    const graphError = error instanceof GraphError ? error : null;
    const message = await fail(graphError?.reason ?? "send");
    refresh();
    if (graphError && needsReconnect(graphError)) {
      await admin
        .from("whatsapp_connections")
        .update({ status: "error", last_error: graphError.reason, updated_at: new Date().toISOString() })
        .eq("id", connection.id);
      return { error: "Seu WhatsApp precisa ser reconectado. Peça ao responsável pela clínica.", message };
    }
    if (graphError && outsideWindow(graphError)) return { error: WINDOW_CLOSED, needsTemplate: true, message };
    if (graphError && notAllowedRecipient(graphError) && connection.mode === "test") {
      return { error: "Na fase de teste, a Meta só entrega para os números cadastrados no app de teste.", message };
    }
    return { error: SEND_FAILED, message };
  }

  // Who owes the next word, and the contact's last contact: as when an entry is registered by hand.
  const { data: conversation } = await db.from("conversations").select("status, lead_id").eq("id", entry.conversation_id).maybeSingle();
  if (conversation?.status === "aberta") {
    await db.from("conversations").update({ status: "aguardando_cliente" }).eq("id", entry.conversation_id).eq("organization_id", org);
  }
  if (conversation?.lead_id) {
    await db
      .from("leads")
      .update({ last_contact_at: clinicNow() })
      .eq("id", conversation.lead_id)
      .eq("organization_id", org)
      .neq("stage", "agendado");
  }
  const message = await reread();
  refresh();
  return { message };
}

/** The clinic's live connection, as sending needs it; or why there is none. */
async function sendingConnection(admin: Db, org: string): Promise<Live | { error: string }> {
  const { data } = await admin
    .from("whatsapp_connections")
    .select("id, status, mode, phone_number_id")
    .eq("organization_id", org)
    .in("status", LIVE)
    .maybeSingle();
  if (!data) return { error: "O WhatsApp da clínica não está conectado." };
  if (data.status !== "connected") return { error: "Seu WhatsApp precisa ser reconectado. Peça ao responsável pela clínica." };
  return data;
}

/** A reply typed in Conversas, sent by WhatsApp to the person, signed internally by who sent it. */
export async function sendWhatsApp(conversationId: string, text: string): Promise<SendResult> {
  const who = await allowed((can) => can.conversations);
  if ("error" in who) return { error: who.error };
  const body = typeof text === "string" ? text.trim() : "";
  if (!body) return { error: "Escreva a mensagem." };
  if (body.length > 4000) return { error: "A mensagem pode ter até 4.000 caracteres." };
  const db = who.session.supabase;

  // Row-level security answers only for the front office of this clinic.
  const { data: conversation } = await db
    .from("conversations")
    .select("id, whatsapp_wa_id")
    .eq("id", conversationId)
    .eq("organization_id", who.org)
    .maybeSingle();
  if (!conversation) return { error: "Conversa não encontrada." };

  const admin = createAdminClient();
  const connection = await sendingConnection(admin, who.org);
  if ("error" in connection) return connection;
  if (!conversation.whatsapp_wa_id || !(await windowOpen(db, who.org, conversation.id))) {
    return { error: WINDOW_CLOSED, needsTemplate: true };
  }

  const { data: entry, error } = await admin
    .from("conversation_messages")
    .insert({
      organization_id: who.org,
      conversation_id: conversation.id,
      direction: "out",
      channel: "whatsapp",
      body,
      provider: "whatsapp_cloud",
      delivery_status: "pending",
      message_type: "text",
      author_id: who.userId,
      connection_id: connection.id,
    })
    .select("id, conversation_id, body")
    .single();
  if (error || !entry) {
    console.error("WhatsApp: entry not saved", error?.code);
    return { error: SEND_FAILED };
  }
  return deliver(admin, db, who.org, entry, connection, conversation.whatsapp_wa_id);
}

/** "Tentar novamente": the same message, sent again, if it failed. */
export async function retryWhatsApp(messageId: string): Promise<SendResult> {
  const who = await allowed((can) => can.conversations);
  if ("error" in who) return { error: who.error };
  const db = who.session.supabase;
  const { data: entry } = await db
    .from("conversation_messages")
    .select("id, conversation_id, body, delivery_status, direction, channel")
    .eq("id", messageId)
    .eq("organization_id", who.org)
    .maybeSingle();
  if (!entry || entry.channel !== "whatsapp" || entry.direction !== "out" || entry.delivery_status !== "failed") {
    return { error: "Esta mensagem não pode ser reenviada." };
  }
  const { data: conversation } = await db
    .from("conversations")
    .select("id, whatsapp_wa_id")
    .eq("id", entry.conversation_id)
    .eq("organization_id", who.org)
    .maybeSingle();
  if (!conversation) return { error: "Conversa não encontrada." };

  const admin = createAdminClient();
  const connection = await sendingConnection(admin, who.org);
  if ("error" in connection) return connection;
  if (!conversation.whatsapp_wa_id || !(await windowOpen(db, who.org, conversation.id))) {
    return { error: WINDOW_CLOSED, needsTemplate: true };
  }
  const { data: claimed } = await admin
    .from("conversation_messages")
    .update({ delivery_status: "pending", failed_reason: null, connection_id: connection.id })
    .eq("id", entry.id)
    .eq("delivery_status", "failed")
    .select("id, conversation_id, body");
  // Someone else is already retrying it.
  if (!claimed?.length) return { error: "Esta mensagem já está sendo reenviada." };
  return deliver(admin, db, who.org, claimed[0], connection, conversation.whatsapp_wa_id);
}

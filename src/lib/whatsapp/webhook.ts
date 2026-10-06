import { createHmac, timingSafeEqual } from "node:crypto";

/*
  What Meta's WhatsApp webhook says, read defensively. The signature is
  checked against the raw body before anything is parsed (X-Hub-Signature-256:
  HMAC-SHA256 of the body with the App Secret); then only the fields this
  integration uses are taken, each checked for its shape, and anything else
  is ignored. Nothing here decides the clinic: the receiving number does,
  through its connection, on the server.

  Kept free of server-only imports so it can be tested on its own; only the
  webhook route imports it.
*/

export function validSignature(rawBody: string, header: string | null, secret: string | null) {
  if (!secret || !header?.startsWith("sha256=")) return false;
  const given = Buffer.from(header.slice(7), "hex");
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest();
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export type MessageKind =
  | "text"
  | "image"
  | "audio"
  | "video"
  | "document"
  | "sticker"
  | "location"
  | "contacts"
  | "interactive"
  | "button"
  | "reaction"
  | "unsupported";

/** A message the person sent (in), or one the clinic sent from the WhatsApp Business app (out, coexistence). */
export interface MessageEvent {
  type: "message";
  phoneNumberId: string;
  direction: "in" | "out";
  messageId: string;
  /** The person's WhatsApp id: the sender of "in", the recipient of "out". */
  waId: string;
  profileName: string | null;
  at: Date;
  kind: MessageKind;
  body: string;
  media: Record<string, string> | null;
}

export interface StatusEvent {
  type: "status";
  phoneNumberId: string;
  messageId: string;
  status: "sent" | "delivered" | "read" | "failed";
  at: Date;
  /** Meta's error code for a failure ("meta:131047"), never its text. */
  reason: string | null;
}

export type WebhookEvent = MessageEvent | StatusEvent;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown, max = 4096) => (typeof v === "string" && v.length > 0 && v.length <= max ? v : null);
const list = (v: unknown) => (Array.isArray(v) ? v.filter(isObj) : []);
const WA_ID = /^\d{6,20}$/;
const PHONE_NUMBER_ID = /^\d{1,64}$/;

function when(v: unknown) {
  const s = typeof v === "string" || typeof v === "number" ? Number(v) : NaN;
  return Number.isFinite(s) && s > 1_000_000_000 ? new Date(s * 1000) : new Date();
}

const RECEIVED: Record<string, string> = {
  image: "Imagem recebida",
  audio: "Áudio recebido",
  video: "Vídeo recebido",
  document: "Documento recebido",
  sticker: "Figurinha recebida",
  location: "Localização recebida",
  contacts: "Contato compartilhado",
};
const SENT: Record<string, string> = {
  image: "Imagem enviada",
  audio: "Áudio enviado",
  video: "Vídeo enviado",
  document: "Documento enviado",
  sticker: "Figurinha enviada",
  location: "Localização enviada",
  contacts: "Contato compartilhado",
};

/** What the Pulse shows for a message, and the media's metadata (never the file). */
export function readMessage(m: Obj, direction: "in" | "out"): { kind: MessageKind; body: string; media: Record<string, string> | null } | null {
  const type = str(m.type, 40) ?? "unsupported";
  if (type === "text") {
    const body = isObj(m.text) ? str(m.text.body) : null;
    return body ? { kind: "text", body, media: null } : null;
  }
  if (type in RECEIVED) {
    const part = isObj(m[type]) ? (m[type] as Obj) : {};
    const label = (direction === "in" ? RECEIVED : SENT)[type];
    const caption = str(part.caption, 1024);
    const filename = str(part.filename, 240);
    const media: Record<string, string> = {};
    for (const [key, value] of [
      ["id", str(part.id, 200)],
      ["mime_type", str(part.mime_type, 120)],
      ["sha256", str(part.sha256, 120)],
      ["filename", filename],
      ["caption", caption],
    ] as const) {
      if (value) media[key] = value;
    }
    const detail = caption ?? (type === "document" ? filename : null);
    return {
      kind: type as MessageKind,
      body: detail ? `${label}: ${detail}` : label,
      media: Object.keys(media).length ? media : null,
    };
  }
  if (type === "button") {
    const text = isObj(m.button) ? str(m.button.text, 1024) : null;
    return { kind: "button", body: text ?? "Botão respondido", media: null };
  }
  if (type === "interactive") {
    const i = isObj(m.interactive) ? m.interactive : {};
    const reply = isObj(i.button_reply) ? i.button_reply : isObj(i.list_reply) ? i.list_reply : {};
    return { kind: "interactive", body: str(reply.title, 1024) ?? "Opção escolhida", media: null };
  }
  if (type === "reaction") {
    const emoji = isObj(m.reaction) ? str(m.reaction.emoji, 32) : null;
    // A reaction removed carries no emoji: nothing to show.
    return emoji ? { kind: "reaction", body: `Reagiu com ${emoji}`, media: null } : null;
  }
  return { kind: "unsupported", body: direction === "in" ? "Mensagem recebida (formato não suportado)" : "Mensagem enviada", media: null };
}

/** Every event in one notification. Malformed parts are skipped, never guessed. */
export function readWebhook(payload: unknown): WebhookEvent[] {
  if (!isObj(payload) || payload.object !== "whatsapp_business_account") return [];
  const events: WebhookEvent[] = [];
  for (const entry of list(payload.entry)) {
    for (const change of list(entry.changes)) {
      const value = isObj(change.value) ? change.value : null;
      const phoneNumberId = value && isObj(value.metadata) ? str(value.metadata.phone_number_id, 64) : null;
      if (!value || !phoneNumberId || !PHONE_NUMBER_ID.test(phoneNumberId)) continue;

      if (change.field === "messages") {
        const contacts = list(value.contacts);
        for (const m of list(value.messages)) {
          const messageId = str(m.id, 200);
          const from = str(m.from, 20);
          if (!messageId || !from || !WA_ID.test(from)) continue;
          const read = readMessage(m, "in");
          if (!read) continue;
          const contact = contacts.find((c) => c.wa_id === from) ?? contacts[0];
          const profileName = contact && isObj(contact.profile) ? str(contact.profile.name, 200) : null;
          events.push({ type: "message", phoneNumberId, direction: "in", messageId, waId: from, profileName, at: when(m.timestamp), ...read });
        }
        for (const s of list(value.statuses)) {
          const messageId = str(s.id, 200);
          const status = s.status;
          if (!messageId || (status !== "sent" && status !== "delivered" && status !== "read" && status !== "failed")) continue;
          const error = list(s.errors)[0];
          const code = error && (typeof error.code === "number" || typeof error.code === "string") ? String(error.code).slice(0, 20) : null;
          events.push({ type: "status", phoneNumberId, messageId, status, at: when(s.timestamp), reason: code ? `meta:${code}` : null });
        }
      } else if (change.field === "smb_message_echoes") {
        for (const m of list(value.message_echoes)) {
          const messageId = str(m.id, 200);
          const to = str(m.to, 20);
          if (!messageId || !to || !WA_ID.test(to)) continue;
          const read = readMessage(m, "out");
          if (!read) continue;
          events.push({ type: "message", phoneNumberId, direction: "out", messageId, waId: to, profileName: null, at: when(m.timestamp), ...read });
        }
      }
    }
  }
  return events;
}

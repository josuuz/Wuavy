import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { displayPhone, mask } from "./phone";
import type { WebhookEvent } from "./webhook";

/*
  What the webhook does with each event, on the server, with the service
  role (Meta's notification has no signed-in person). The receiving number
  decides the clinic: its live connection names the organization, and a
  number with no live connection writes nothing, so a message can never land
  in the wrong clinic. The database does the rest in one transaction per
  message (pulse_whatsapp_receive, migration 0012): the person by phone, their
  one conversation, the message once.

  Logs carry codes and masked ids, never a message's content or a full number.
  A database error is thrown, so the route answers 500 and Meta retries: the
  same message twice is still one message.
*/

export async function handleEvents(events: WebhookEvent[]) {
  if (!events.length) return;
  const db = createAdminClient();
  const connections = new Map<string, string | null>();

  async function connectionFor(phoneNumberId: string) {
    if (!connections.has(phoneNumberId)) {
      const { data, error } = await db
        .from("whatsapp_connections")
        .select("id")
        .eq("phone_number_id", phoneNumberId)
        .in("status", ["connected", "error"])
        .maybeSingle();
      if (error) throw new Error(`WhatsApp: connection lookup failed (${error.code})`);
      if (!data) console.warn("WhatsApp webhook: no live connection for number", mask(phoneNumberId));
      connections.set(phoneNumberId, data?.id ?? null);
    }
    return connections.get(phoneNumberId)!;
  }

  for (const event of events) {
    const connection = await connectionFor(event.phoneNumberId);
    if (!connection) continue;

    if (event.type === "message") {
      const { error } = await db.rpc("pulse_whatsapp_receive", {
        connection,
        message_id: event.messageId,
        wa_id: event.waId,
        profile_name: event.profileName ?? undefined,
        phone_display: displayPhone(event.waId),
        sent_at: event.at.toISOString(),
        kind: event.kind,
        body: event.body,
        media: event.media ?? undefined,
        direction: event.direction,
      });
      if (error) throw new Error(`WhatsApp: message not saved (${error.code})`);
    } else {
      const { error } = await db.rpc("pulse_whatsapp_status", {
        connection,
        message_id: event.messageId,
        new_status: event.status,
        status_time: event.at.toISOString(),
        reason: event.reason ?? undefined,
      });
      if (error) throw new Error(`WhatsApp: status not saved (${error.code})`);
      if (event.status === "failed") console.warn("WhatsApp: message failed", mask(event.messageId), event.reason);
    }
  }
}

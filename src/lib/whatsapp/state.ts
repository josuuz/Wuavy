import "server-only";

import { permissionsFor } from "@/lib/flow/roles";
import type { getSession } from "@/lib/flow/session";
import { connectWay, embeddedSignup } from "./config";
import type { WhatsAppState } from "./types";

type Session = NonNullable<Awaited<ReturnType<typeof getSession>>>;

/**
 * The clinic's WhatsApp as its screens may know it. Only the front office
 * (owner and reception) reads it, under row-level security; the owner also
 * learns how to connect. Before migration 0012 there is nothing to read: the
 * Pulse shows no WhatsApp at all, as before.
 */
export async function whatsappState(session: Session): Promise<WhatsAppState | undefined> {
  const member = session.member;
  if (!member) return undefined;
  const can = permissionsFor(member.role);
  if (!can.conversations) return undefined;

  const { data, error } = await session.supabase
    .from("whatsapp_connections")
    .select("status, mode, onboarding, display_phone_number, display_name, connected_at")
    .eq("organization_id", member.organization_id)
    .in("status", ["connecting", "connected", "error"])
    .maybeSingle();
  if (error) return undefined;

  const connect = can.admin ? connectWay(session.user.email) : null;
  return {
    connection: data
      ? {
          status: data.status as "connecting" | "connected" | "error",
          test: data.mode === "test",
          businessApp: data.onboarding === "business_app",
          displayPhone: data.display_phone_number ?? undefined,
          displayName: data.display_name ?? undefined,
          connectedAt: data.connected_at ?? undefined,
        }
      : null,
    connect,
    embedded: connect === "embedded_signup" ? embeddedSignup() : null,
  };
}

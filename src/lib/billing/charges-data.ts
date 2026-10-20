import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { ChargeBucket } from "./charge-status";

/*
  O que o painel de Cobranças lê. Mesmo padrão de lib/maintenance/data.ts:
  a service role, porque billing_charges e billing_payments têm RLS ligado
  sem política (migration 0019) — quem chama já passou por getAdmin().
*/

const CHARGE =
  "id, client_id, service_id, description, kind, amount_cents, provider, provider_preference_id, payment_url, status, creation_blocked_at, created_at, updated_at";

export interface BillingCharge {
  id: string;
  client_id: string;
  service_id: string | null;
  description: string;
  kind: "once";
  amount_cents: number;
  provider: "mercadopago";
  provider_preference_id: string | null;
  payment_url: string | null;
  status: ChargeBucket;
  /** Travada para criação automática depois de um resultado incerto — só reconciliação manual destrava. */
  creation_blocked_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChargeRow {
  charge: BillingCharge;
  clientName: string;
  clientWhatsapp: string | null;
  serviceName: string | null;
}

export interface ChargeFilter {
  status?: ChargeBucket;
  clientId?: string;
}

/** As cobranças, da mais nova à mais antiga, com o nome do cliente e do serviço (quando há). */
export async function listCharges(filter: ChargeFilter = {}): Promise<ChargeRow[]> {
  const admin = createAdminClient();
  let select = admin.from("billing_charges").select(CHARGE).order("created_at", { ascending: false });
  if (filter.status) select = select.eq("status", filter.status);
  if (filter.clientId) select = select.eq("client_id", filter.clientId);
  const { data } = await select;
  const charges = (data ?? []) as BillingCharge[];
  if (!charges.length) return [];

  const clientIds = [...new Set(charges.map((c) => c.client_id))];
  const serviceIds = [...new Set(charges.filter((c) => c.service_id).map((c) => c.service_id as string))];
  const [{ data: clients }, { data: services }] = await Promise.all([
    admin.from("billing_clients").select("id, name, whatsapp").in("id", clientIds),
    serviceIds.length ? admin.from("billing_services").select("id, name").in("id", serviceIds) : Promise.resolve({ data: [] }),
  ]);
  const clientById = new Map((clients ?? []).map((c) => [c.id, c]));
  const serviceById = new Map((services ?? []).map((s) => [s.id, s.name as string]));

  return charges.map((charge) => ({
    charge,
    clientName: clientById.get(charge.client_id)?.name ?? "—",
    clientWhatsapp: clientById.get(charge.client_id)?.whatsapp ?? null,
    serviceName: charge.service_id ? (serviceById.get(charge.service_id) ?? null) : null,
  }));
}

/** Uma cobrança pelo id, com a linha pronta para a Preference (provider_preference_id, payment_url). */
export async function getCharge(id: string): Promise<BillingCharge | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const admin = createAdminClient();
  const { data } = await admin.from("billing_charges").select(CHARGE).eq("id", id).maybeSingle();
  return (data as BillingCharge | null) ?? null;
}

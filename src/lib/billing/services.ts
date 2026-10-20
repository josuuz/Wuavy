import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/*
  O catálogo de serviços da agência (Wuavy Cobranças), migration 0018.
  default_price_cents é só o ponto de partida de uma cobrança nova: nenhuma
  cobrança ou assinatura já criada lê este valor de novo, então mudar o
  preço padrão de um serviço nunca altera um contrato em curso — o mesmo
  princípio que já vale para maintenance_subscriptions.amount_cents.
*/

const SERVICE = "id, name, description, kind, default_price_cents, active, created_at, updated_at";

export type ServiceKind = "once" | "recurring";

export interface BillingService {
  id: string;
  name: string;
  description: string | null;
  kind: ServiceKind;
  default_price_cents: number;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export const asServiceKind = (value: string): ServiceKind | null => (value === "once" || value === "recurring" ? value : null);

export const KIND_LABEL: Record<ServiceKind, string> = {
  once: "Pagamento único",
  recurring: "Recorrente",
};

/** O catálogo inteiro, na ordem em que foi cadastrado. */
export async function listServices(): Promise<BillingService[]> {
  const admin = createAdminClient();
  const { data } = await admin.from("billing_services").select(SERVICE).order("created_at", { ascending: true });
  return (data ?? []) as BillingService[];
}

export interface ServiceInput {
  name: string;
  description: string | null;
  kind: ServiceKind;
  default_price_cents: number;
}

export type SaveServiceResult = { outcome: "saved"; service: BillingService } | { outcome: "error"; message: string };

/** Um serviço novo no catálogo. O nome é único — dois serviços iguais não ajudam ninguém a escolher. */
export async function createService(input: ServiceInput): Promise<SaveServiceResult> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("billing_services").insert(input).select(SERVICE).single();
  if (error || !data) {
    if (error?.code === "23505") return { outcome: "error", message: "Já existe um serviço com esse nome." };
    console.error("cobranças: criar serviço", error);
    return { outcome: "error", message: "Não foi possível salvar este serviço." };
  }
  return { outcome: "saved", service: data as BillingService };
}

/** O cadastro de um serviço existente, inclusive ligar/desligar (`active`). */
export async function updateService(id: string, input: Partial<ServiceInput> & { active?: boolean }): Promise<SaveServiceResult> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("billing_services")
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select(SERVICE)
    .single();
  if (error || !data) {
    if (error?.code === "23505") return { outcome: "error", message: "Já existe um serviço com esse nome." };
    console.error("cobranças: salvar serviço", error);
    return { outcome: "error", message: "Não foi possível salvar." };
  }
  return { outcome: "saved", service: data as BillingService };
}

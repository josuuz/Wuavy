import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { findDuplicate, type DuplicateCandidate } from "./dedup";

/*
  Os clientes da agência (Wuavy Cobranças). Tabela própria, migration 0018:
  não é maintenance_clients, só pode se ligar a um deles — opcionalmente, e
  nunca sozinha. Mesmo padrão de leitura que lib/maintenance/data.ts: RLS
  ligado sem política nenhuma (0018), então só a service role chega aqui, e
  quem chama já passou por getAdmin() (lib/maintenance/admin.ts, reaproveitado
  sem mudança).
*/

const CLIENT = "id, name, email, whatsapp, notes, maintenance_client_id, created_at, archived_at";

export interface BillingClient {
  id: string;
  name: string;
  email: string | null;
  whatsapp: string | null;
  notes: string | null;
  maintenance_client_id: string | null;
  created_at: string;
  archived_at: string | null;
}

export interface MaintenanceLink {
  id: string;
  name: string;
  site_url: string | null;
}

export interface ClientRow {
  client: BillingClient;
  maintenance: MaintenanceLink | null;
}

async function maintenanceLinksFor(ids: string[]): Promise<Map<string, MaintenanceLink>> {
  if (!ids.length) return new Map();
  const admin = createAdminClient();
  const { data } = await admin.from("maintenance_clients").select("id, name, site_url").in("id", ids);
  return new Map((data ?? []).map((row) => [row.id, row as MaintenanceLink]));
}

/**
 * Os clientes da agência, do mais novo ao mais antigo, com o cliente de
 * manutenção ligado a cada um (quando há). `query` filtra por nome, e-mail
 * ou WhatsApp — a mesma pesquisa simples, sem distinguir maiúsculas.
 */
export async function listClients(query?: string): Promise<ClientRow[]> {
  const admin = createAdminClient();
  let select = admin.from("billing_clients").select(CLIENT).order("created_at", { ascending: false });
  const term = query?.trim();
  if (term) select = select.or(`name.ilike.%${term}%,email.ilike.%${term}%,whatsapp.ilike.%${term}%`);
  const { data } = await select;
  const clients = (data ?? []) as BillingClient[];

  const links = await maintenanceLinksFor(clients.filter((c) => c.maintenance_client_id).map((c) => c.maintenance_client_id as string));
  return clients.map((client) => ({ client, maintenance: client.maintenance_client_id ? (links.get(client.maintenance_client_id) ?? null) : null }));
}

/** Um cliente pelo id, com o cliente de manutenção ligado (quando há). */
export async function getClient(id: string): Promise<ClientRow | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const admin = createAdminClient();
  const { data } = await admin.from("billing_clients").select(CLIENT).eq("id", id).maybeSingle();
  if (!data) return null;
  const client = data as BillingClient;
  const links = await maintenanceLinksFor(client.maintenance_client_id ? [client.maintenance_client_id] : []);
  return { client, maintenance: client.maintenance_client_id ? (links.get(client.maintenance_client_id) ?? null) : null };
}

/**
 * Os clientes de manutenção ainda sem um cadastro da agência ligado a eles —
 * o que aparece no seletor de vínculo. Só os que não foram arquivados: um
 * cliente de manutenção arquivado não precisa de um vínculo novo.
 */
export async function unlinkedMaintenanceClients(): Promise<MaintenanceLink[]> {
  const admin = createAdminClient();
  const [{ data: maintenance }, { data: linked }] = await Promise.all([
    admin.from("maintenance_clients").select("id, name, site_url").is("archived_at", null).order("name"),
    admin.from("billing_clients").select("maintenance_client_id").not("maintenance_client_id", "is", null),
  ]);
  const taken = new Set((linked ?? []).map((row) => row.maintenance_client_id));
  return ((maintenance ?? []) as MaintenanceLink[]).filter((client) => !taken.has(client.id));
}

export interface ClientInput {
  name: string;
  email: string | null;
  whatsapp: string | null;
  notes: string | null;
}

export type CreateClientResult =
  | { outcome: "created"; client: BillingClient }
  | { outcome: "duplicate"; duplicate: DuplicateCandidate }
  | { outcome: "error"; message: string };

/**
 * Um cliente novo. Antes de salvar, procura um cliente aberto com o mesmo
 * e-mail ou WhatsApp (lib/billing/dedup.ts) e devolve "duplicate" em vez de
 * criar — a menos que `force` diga para criar assim mesmo. Nome parecido
 * nunca bloqueia: só e-mail e WhatsApp contam como duplicata.
 */
export async function createClient(input: ClientInput, force = false): Promise<CreateClientResult> {
  const admin = createAdminClient();

  if (!force && (input.email || input.whatsapp)) {
    const { data: open } = await admin.from("billing_clients").select("id, name, email, whatsapp, archived_at").is("archived_at", null);
    const duplicate = findDuplicate((open ?? []) as DuplicateCandidate[], input);
    if (duplicate) return { outcome: "duplicate", duplicate };
  }

  const { data, error } = await admin.from("billing_clients").insert(input).select(CLIENT).single();
  if (error || !data) {
    console.error("cobranças: criar cliente", error);
    return { outcome: "error", message: "Não foi possível salvar este cliente." };
  }
  return { outcome: "created", client: data as BillingClient };
}

/** O cadastro de um cliente existente. Duplicata contra os outros clientes abertos, nunca contra ele mesmo. */
export async function updateClient(id: string, input: ClientInput, force = false): Promise<CreateClientResult> {
  const admin = createAdminClient();

  if (!force && (input.email || input.whatsapp)) {
    const { data: open } = await admin
      .from("billing_clients")
      .select("id, name, email, whatsapp, archived_at")
      .is("archived_at", null)
      .neq("id", id);
    const duplicate = findDuplicate((open ?? []) as DuplicateCandidate[], input);
    if (duplicate) return { outcome: "duplicate", duplicate };
  }

  const { data, error } = await admin.from("billing_clients").update(input).eq("id", id).select(CLIENT).single();
  if (error || !data) {
    console.error("cobranças: salvar cliente", error);
    return { outcome: "error", message: "Não foi possível salvar." };
  }
  return { outcome: "created", client: data as BillingClient };
}

/** Arquivar fecha o cliente sem apagar nada. */
export async function archiveClient(id: string, archived: boolean) {
  const admin = createAdminClient();
  await admin
    .from("billing_clients")
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq("id", id);
}

/**
 * Liga um cadastro da agência a um cliente de manutenção já existente. Não
 * migra nem copia nada: o vínculo é só a referência. `maintenance_clients`
 * continua sendo lido e escrito por lib/maintenance/ exatamente como antes.
 */
export async function linkMaintenance(billingClientId: string, maintenanceClientId: string | null): Promise<string | null> {
  const admin = createAdminClient();
  const { error } = await admin.from("billing_clients").update({ maintenance_client_id: maintenanceClientId }).eq("id", billingClientId);
  if (!error) return null;
  if (error.code === "23505") return "Esse cliente de manutenção já está vinculado a outro cadastro.";
  console.error("cobranças: vincular manutenção", error);
  return "Não foi possível vincular.";
}

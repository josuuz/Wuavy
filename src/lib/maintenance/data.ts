import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { asMaintenanceStatus, isEarning, type MaintenanceStatus } from "./plan";

/*
  O que o painel e a página do cliente leem.

  Todas as consultas aqui usam a service role: as três tabelas da manutenção
  têm row-level security ligado e nenhuma política (migração 0013), então
  nenhuma chave de navegador as alcança. Quem chama é que precisa provar o
  direito antes:

  - a página do cliente, pelo token aleatório da URL (clientByToken);
  - o painel, pela sessão de um administrador (lib/maintenance/admin.ts).

  Nada neste arquivo verifica isso. Chame de um lugar que já verificou.
*/

const CLIENT = "id, name, site_url, email, whatsapp, notes, plan_name, price_cents, token, created_at, archived_at";
const SUBSCRIPTION = "id, client_id, status, amount_cents, provider_subscription_id, started_at, current_period_end, created_at";
const PAYMENT = "id, subscription_id, provider_payment_id, amount_cents, status, paid, charged_at";

export interface MaintenanceClient {
  id: string;
  name: string;
  site_url: string | null;
  email: string | null;
  whatsapp: string | null;
  notes: string | null;
  plan_name: string;
  price_cents: number;
  token: string;
  created_at: string;
  archived_at: string | null;
}

export interface MaintenanceSubscription {
  id: string;
  client_id: string;
  status: MaintenanceStatus | null;
  amount_cents: number;
  provider_subscription_id: string | null;
  started_at: string | null;
  current_period_end: string | null;
  created_at: string;
}

export interface MaintenancePayment {
  id: string;
  subscription_id: string;
  provider_payment_id: string;
  amount_cents: number;
  status: string;
  paid: boolean;
  charged_at: string | null;
}

const asSubscription = (row: Omit<MaintenanceSubscription, "status"> & { status: string }): MaintenanceSubscription => ({
  ...row,
  status: asMaintenanceStatus(row.status),
});

/** A assinatura viva de um cliente: a que não foi cancelada. */
async function liveSubscription(clientId: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("maintenance_subscriptions")
    .select(SUBSCRIPTION)
    .eq("client_id", clientId)
    .neq("status", "cancelled")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? asSubscription(data) : null;
}

/**
 * O cliente de um link individual, e a sua assinatura viva. null quando o
 * token não é de ninguém (a página responde 404) ou quando o cliente foi
 * arquivado: um link arquivado deixa de abrir.
 */
export async function clientByToken(token: string) {
  if (!/^[a-z0-9]{16,64}$/.test(token)) return null;
  const admin = createAdminClient();
  const { data } = await admin.from("maintenance_clients").select(CLIENT).eq("token", token).is("archived_at", null).maybeSingle();
  if (!data) return null;
  return { client: data as MaintenanceClient, subscription: await liveSubscription(data.id) };
}

/** Um cliente pelo seu id, com a assinatura viva. Só o painel chama. */
export async function clientById(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const admin = createAdminClient();
  const { data } = await admin.from("maintenance_clients").select(CLIENT).eq("id", id).maybeSingle();
  if (!data) return null;
  return { client: data as MaintenanceClient, subscription: await liveSubscription(data.id) };
}

/** Um cliente, as suas assinaturas e todo o histórico de pagamentos delas. */
export async function clientDetail(id: string) {
  const found = await clientById(id);
  if (!found) return null;
  const admin = createAdminClient();
  const { data: subscriptions } = await admin
    .from("maintenance_subscriptions")
    .select(SUBSCRIPTION)
    .eq("client_id", found.client.id)
    .order("created_at", { ascending: false });
  const ids = (subscriptions ?? []).map((row) => row.id);
  const { data: payments } = ids.length
    ? await admin.from("maintenance_payments").select(PAYMENT).in("subscription_id", ids).order("charged_at", { ascending: false })
    : { data: [] };

  return {
    ...found,
    subscriptions: (subscriptions ?? []).map(asSubscription),
    payments: (payments ?? []) as MaintenancePayment[],
  };
}

export interface ClientRow {
  client: MaintenanceClient;
  subscription: MaintenanceSubscription | null;
}

export interface Overview {
  rows: ClientRow[];
  /** Receita recorrente mensal, em centavos: as assinaturas que cobram. */
  mrr: number;
  earning: number;
  pending: number;
  late: number;
  /** As próximas cobranças, a mais perto primeiro. */
  upcoming: ClientRow[];
  /** Os últimos pagamentos relatados pelo Mercado Pago, de todos os clientes. */
  payments: (MaintenancePayment & { clientName: string })[];
}

/**
 * O painel inteiro numa leitura: os clientes com a sua assinatura, a receita
 * recorrente, os próximos vencimentos e os pagamentos recentes.
 */
export async function overview(): Promise<Overview> {
  const admin = createAdminClient();
  const [{ data: clients }, { data: subscriptions }] = await Promise.all([
    admin.from("maintenance_clients").select(CLIENT).order("created_at", { ascending: false }),
    admin.from("maintenance_subscriptions").select(SUBSCRIPTION).order("created_at", { ascending: false }),
  ]);

  // A assinatura viva de cada cliente: a mais recente que não foi cancelada.
  const live = new Map<string, MaintenanceSubscription>();
  for (const row of subscriptions ?? []) {
    const subscription = asSubscription(row);
    if (subscription.status === "cancelled") continue;
    if (!live.has(subscription.client_id)) live.set(subscription.client_id, subscription);
  }

  const rows: ClientRow[] = (clients ?? []).map((client) => ({
    client: client as MaintenanceClient,
    subscription: live.get(client.id) ?? null,
  }));
  const open = rows.filter(({ client }) => !client.archived_at);
  const earning = open.filter(({ subscription }) => isEarning(subscription?.status));

  const upcoming = earning
    .filter(({ subscription }) => subscription?.current_period_end)
    .sort((a, b) => String(a.subscription?.current_period_end).localeCompare(String(b.subscription?.current_period_end)))
    .slice(0, 8);

  const ids = earning.map(({ subscription }) => subscription?.id).filter((id): id is string => Boolean(id));
  const { data: payments } = ids.length
    ? await admin
        .from("maintenance_payments")
        .select(PAYMENT)
        .in("subscription_id", ids)
        .order("charged_at", { ascending: false })
        .limit(12)
    : { data: [] };

  const nameOf = new Map(earning.map(({ client, subscription }) => [subscription?.id ?? client.id, client.name]));

  return {
    rows,
    mrr: earning.reduce((total, { subscription }) => total + (subscription?.amount_cents ?? 0), 0),
    earning: earning.length,
    pending: open.filter(({ subscription }) => subscription?.status === "pending").length,
    late: open.filter(({ subscription }) => subscription?.status === "past_due").length,
    upcoming,
    payments: ((payments ?? []) as MaintenancePayment[]).map((payment) => ({
      ...payment,
      clientName: nameOf.get(payment.subscription_id) ?? "—",
    })),
  };
}

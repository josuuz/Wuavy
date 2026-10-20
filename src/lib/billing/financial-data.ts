import "server-only";

import { PRICE } from "@/lib/flow/access";
import { createAdminClient } from "@/lib/supabase/admin";

import {
  consolidate,
  nothingYet,
  summarizeCharges,
  summarizeMaintenance,
  summarizePulse,
  type ChargesSummary,
  type Consolidated,
  type MaintenanceSummary,
  type PulseSummary,
} from "./financial-summary";

/*
  O que o painel financeiro lê. Mesmo padrão de charges-data.ts e de
  maintenance/data.ts: a service role, porque billing_* e maintenance_* têm
  RLS ligado sem política nenhuma, e subscriptions só tem política para o
  próprio dono — um administrador lendo a assinatura de outra clínica precisa
  da service role. Quem chama já passou por getAdmin().

  Só leitura. Este módulo não escreve nada, em nenhuma tabela: o painel
  financeiro observa o que os três produtos já registraram por conta própria,
  e nenhum número daqui volta para o banco.
*/

export interface PulseClinicRow {
  id: string;
  clinic: string;
  status: string;
  /** 'manual' quando a clínica foi ativada à mão (migration 0004): sem assinatura no Mercado Pago. */
  provider: string | null;
  startedAt: string | null;
  currentPeriodEnd: string | null;
  createdAt: string;
}

export interface FinancialOverview {
  pulse: PulseSummary;
  pulseClinics: PulseClinicRow[];
  charges: ChargesSummary;
  maintenance: MaintenanceSummary;
  consolidated: Consolidated;
  /** Os últimos pagamentos aprovados de Cobranças, do mais novo ao mais antigo. */
  recentCharges: { id: string; amountCents: number; createdAt: string; statusDetail: string | null }[];
  /** Os últimos pagamentos pagos da manutenção. */
  recentMaintenance: { id: string; amountCents: number; chargedAt: string | null; status: string }[];
  /** Nada registrado ainda em nenhum dos três produtos. */
  empty: boolean;
}

/** O painel financeiro inteiro numa leitura, somando os três produtos sem misturá-los. */
export async function financialOverview(): Promise<FinancialOverview> {
  const admin = createAdminClient();

  const [subscriptions, organizations, payments, charges, maintenanceSubs, maintenancePayments] = await Promise.all([
    admin
      .from("subscriptions")
      .select("id, organization_id, provider, status, started_at, current_period_end, created_at")
      .order("created_at", { ascending: false }),
    admin.from("organizations").select("id, name"),
    admin.from("billing_payments").select("id, status, status_detail, amount_cents, created_at").order("created_at", { ascending: false }),
    admin.from("billing_charges").select("status"),
    admin.from("maintenance_subscriptions").select("status, amount_cents"),
    admin.from("maintenance_payments").select("id, paid, amount_cents, status, charged_at").order("charged_at", { ascending: false }),
  ]);

  const subscriptionRows = (subscriptions.data ?? []) as {
    id: string;
    organization_id: string | null;
    provider: string | null;
    status: string;
    started_at: string | null;
    current_period_end: string | null;
    created_at: string;
  }[];
  const paymentRows = (payments.data ?? []) as {
    id: string;
    status: string;
    status_detail: string | null;
    amount_cents: number;
    created_at: string;
  }[];
  const maintenancePaymentRows = (maintenancePayments.data ?? []) as {
    id: string;
    paid: boolean;
    amount_cents: number;
    status: string;
    charged_at: string | null;
  }[];

  const clinicName = new Map(((organizations.data ?? []) as { id: string; name: string }[]).map((row) => [row.id, row.name]));

  const pulse = summarizePulse(subscriptionRows, PRICE);
  const chargesSummary = summarizeCharges(paymentRows, (charges.data ?? []) as { status: string }[]);
  const maintenance = summarizeMaintenance(
    (maintenanceSubs.data ?? []) as { status: string; amount_cents: number }[],
    maintenancePaymentRows,
  );

  return {
    pulse,
    pulseClinics: subscriptionRows.map((row) => ({
      id: row.id,
      clinic: row.organization_id ? (clinicName.get(row.organization_id) ?? "—") : "—",
      status: row.status,
      provider: row.provider,
      startedAt: row.started_at,
      currentPeriodEnd: row.current_period_end,
      createdAt: row.created_at,
    })),
    charges: chargesSummary,
    maintenance,
    consolidated: consolidate(pulse, chargesSummary, maintenance),
    recentCharges: paymentRows
      .filter((payment) => payment.status === "approved")
      .slice(0, 8)
      .map((payment) => ({
        id: payment.id,
        amountCents: payment.amount_cents,
        createdAt: payment.created_at,
        statusDetail: payment.status_detail,
      })),
    recentMaintenance: maintenancePaymentRows
      .filter((payment) => payment.paid)
      .slice(0, 8)
      .map((payment) => ({
        id: payment.id,
        amountCents: payment.amount_cents,
        chargedAt: payment.charged_at,
        status: payment.status,
      })),
    empty: nothingYet(pulse, chargesSummary, maintenance),
  };
}

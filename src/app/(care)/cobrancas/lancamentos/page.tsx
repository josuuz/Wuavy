import { randomUUID } from "node:crypto";

import type { Metadata } from "next";
import Link from "next/link";

import { BlockedChargeInvestigation } from "@/components/billing/BlockedChargeInvestigation";
import { ChargeForm } from "@/components/billing/ChargeForm";
import { Wordmark } from "@/components/brand/Wordmark";
import styles from "@/components/maintenance/Admin.module.css";
import { SignIn } from "@/components/maintenance/SignIn";
import { listClients } from "@/lib/billing/clients";
import { billingReady, closedReason, testMode } from "@/lib/billing/charges";
import { dateLabel } from "@/lib/maintenance/plan";
import { brl } from "@/lib/billing/money";
import { listCharges, type ChargeFilter } from "@/lib/billing/charges-data";
import type { ChargeBucket } from "@/lib/billing/charge-status";
import { listServices } from "@/lib/billing/services";
import { adminListReady, getAdmin } from "@/lib/maintenance/admin";
import { enter, leave } from "../clientes/actions";
import { addCharge, reconcile, release, resync } from "./actions";

export const metadata: Metadata = {
  title: { absolute: "Cobranças · Lançamentos" },
  robots: { index: false, follow: false },
};

const STATUS_LABEL: Record<ChargeBucket, string> = {
  pending: "Pendente",
  approved: "Aprovado",
  rejected: "Recusado",
  cancelled: "Cancelado",
  refunded: "Reembolsado",
};

const STATUSES: ChargeBucket[] = ["pending", "approved", "rejected", "cancelled", "refunded"];

const isBucket = (value: string | undefined): value is ChargeBucket => STATUSES.includes(value as ChargeBucket);

/*
  Cobranças únicas do Wuavy Cobranças (Checkout Pro). O link nasce do
  Mercado Pago; o que o painel mostra depois é só o que o webhook ou um
  "Verificar status" manual já escreveu em billing_charges — nunca o que a
  página do cliente diria sozinha.
*/
export default async function LancamentosPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const admin = await getAdmin();
  if (!admin) return <SignIn action={enter} ready={adminListReady()} />;

  const { status } = await searchParams;
  const filter: ChargeFilter = isBucket(status) ? { status } : {};
  const [rows, clientRows, services] = await Promise.all([listCharges(filter), listClients(), listServices()]);

  const clients = clientRows.filter(({ client }) => !client.archived_at).map(({ client }) => ({ id: client.id, name: client.name }));
  const activeServices = services.filter((service) => service.active);
  const chargeId = randomUUID();

  return (
    <main id="conteudo" className={styles.page} data-surface="paper">
      <header className={styles.top}>
        <Wordmark size="small" className={styles.mark} />
        <div className={styles.rowActions}>
          <span className={`type-micro ${styles.muted}`}>{admin.email}</span>
          <form action={leave}>
            <button type="submit" className={styles.ghost}>
              Sair
            </button>
          </form>
        </div>
      </header>

      <nav className={styles.rowActions} aria-label="Wuavy Cobranças">
        <Link href="/cobrancas/clientes" className={styles.ghost}>
          Clientes
        </Link>
        <Link href="/cobrancas/servicos" className={styles.ghost}>
          Serviços
        </Link>
        <Link href="/cobrancas/lancamentos" className={styles.ghost} aria-current="page">
          Cobranças
        </Link>
      </nav>

      <p className={`type-body ${styles.muted}`}>
        {billingReady()
          ? testMode()
            ? "Ambiente de teste: conta de teste do Mercado Pago, nenhuma cobrança real."
            : "Checkout Pro do Mercado Pago, um link por cobrança."
          : `${closedReason()} Nenhum link pode ser gerado agora.`}
      </p>

      <section className={styles.block}>
        <div className={styles.blockHead}>
          <h2 className="type-chapter">Nova cobrança</h2>
        </div>
        {clients.length ? (
          <ChargeForm action={addCharge} chargeId={chargeId} clients={clients} services={activeServices} />
        ) : (
          <p className={`type-body ${styles.empty}`}>
            Nenhum cliente cadastrado ainda.{" "}
            <Link href="/cobrancas/clientes" className={styles.ghost}>
              Cadastrar um cliente
            </Link>
          </p>
        )}
      </section>

      <section className={styles.block}>
        <div className={styles.blockHead}>
          <h2 className="type-chapter">Cobranças</h2>
          <span className={`type-micro ${styles.muted}`}>{rows.length}</span>
        </div>

        <form method="get" className={styles.rowActions}>
          <select name="status" className={styles.input} defaultValue={status ?? ""} style={{ minWidth: "10rem" }}>
            <option value="">Todos os status</option>
            {STATUSES.map((value) => (
              <option key={value} value={value}>
                {STATUS_LABEL[value]}
              </option>
            ))}
          </select>
          <button type="submit" className={styles.ghost}>
            Filtrar
          </button>
          {status ? (
            <Link href="/cobrancas/lancamentos" className={styles.ghost}>
              Limpar
            </Link>
          ) : null}
        </form>

        {rows.length ? (
          <div className={styles.scroll}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Cliente</th>
                  <th scope="col">Descrição</th>
                  <th scope="col">Valor</th>
                  <th scope="col">Status</th>
                  <th scope="col">Criada em</th>
                  <th scope="col" />
                </tr>
              </thead>
              <tbody>
                {rows.map(({ charge, clientName }) => (
                  <tr key={charge.id}>
                    <td className={styles.name}>{clientName}</td>
                    <td className={styles.wrap}>{charge.description}</td>
                    <td>{brl(charge.amount_cents)}</td>
                    <td>
                      <span className={styles.status} data-status={charge.status}>
                        {STATUS_LABEL[charge.status]}
                      </span>
                    </td>
                    <td>{dateLabel(charge.created_at)}</td>
                    <td>
                      {charge.payment_url ? (
                        <form action={resync} className={styles.rowActions}>
                          <input type="hidden" name="id" value={charge.id} />
                          <button type="submit" className={styles.ghost}>
                            Verificar status
                          </button>
                        </form>
                      ) : null}
                      {charge.creation_blocked_at ? (
                        <BlockedChargeInvestigation chargeId={charge.id} reconcileAction={reconcile} releaseAction={release} />
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className={`type-body ${styles.empty}`}>Nenhuma cobrança {status ? "com esse status" : "ainda"}.</p>
        )}
      </section>
    </main>
  );
}

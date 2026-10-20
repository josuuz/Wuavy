import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import styles from "@/components/maintenance/Admin.module.css";
import { ClientForm } from "@/components/maintenance/ClientForm";
import { CopyLink } from "@/components/maintenance/CopyLink";
import { getAdmin } from "@/lib/maintenance/admin";
import { clientDetail } from "@/lib/maintenance/data";
import { brl, dateLabel, isEarning, STATUS_LABEL } from "@/lib/maintenance/plan";
import { absoluteUrl } from "@/lib/seo";
import { archive, cancel, renewLink, resync, saveClient } from "../actions";

export const metadata: Metadata = {
  title: { absolute: "Cliente · Manutenção" },
  robots: { index: false, follow: false },
};

/*
  Um cliente: a assinatura dele, o histórico de cobranças, o cadastro e o
  link individual.

  Nada é apagado por aqui. Arquivar fecha o link; cancelar fala com o Mercado
  Pago e o estado volta de lá. Sortear um link novo invalida o anterior na
  mesma hora — é o que fazer quando um link foi para a pessoa errada.
*/
export default async function ClientPage({ params }: PageProps<"/manutencao/admin/[client]">) {
  const admin = await getAdmin();
  if (!admin) notFound();

  const { client: id } = await params;
  const found = await clientDetail(id);
  if (!found) notFound();

  const { client, subscription, subscriptions, payments } = found;
  const live = isEarning(subscription?.status) || subscription?.status === "pending";
  const link = absoluteUrl(`/manutencao/${client.token}`);

  return (
    <main id="conteudo" className={styles.page} data-surface="paper">
      <header className={styles.top}>
        <Link href="/manutencao/admin" className={styles.ghost}>
          ← Painel
        </Link>
        <span className={`type-micro ${styles.muted}`}>{admin.email}</span>
      </header>

      <div>
        <h1 className={`type-headline ${styles.title}`}>{client.name}</h1>
        <p className={`type-body ${styles.muted}`}>
          {client.plan_name} · {brl(client.price_cents)} por mês
          {client.archived_at ? ` · arquivado em ${dateLabel(client.archived_at)}` : ""}
        </p>
      </div>

      <section className={styles.block}>
        <div className={styles.blockHead}>
          <h2 className="type-chapter">Assinatura</h2>
          <span className={`type-micro ${styles.muted}`}>o que o Mercado Pago informa</span>
        </div>

        {subscription ? (
          <>
            <div className={styles.figures}>
              <div className={styles.figure}>
                <span className="type-micro">Situação</span>
                <span className={`${styles.figureValue} ${styles.status}`} data-status={subscription.status ?? "none"}>
                  {subscription.status ? STATUS_LABEL[subscription.status] : "—"}
                </span>
              </div>
              <div className={styles.figure} data-mark="">
                <span className="type-micro">Valor cobrado</span>
                <span className={styles.figureValue}>{brl(subscription.amount_cents)}</span>
                <span className={`type-micro ${styles.muted}`}>por mês</span>
              </div>
              <div className={styles.figure}>
                <span className="type-micro">Próxima cobrança</span>
                <span className={styles.figureValue}>{dateLabel(subscription.current_period_end)}</span>
              </div>
              <div className={styles.figure}>
                <span className="type-micro">Desde</span>
                <span className={styles.figureValue}>{dateLabel(subscription.started_at)}</span>
              </div>
            </div>

            <div className={styles.rowActions}>
              <form action={resync}>
                <input type="hidden" name="client" value={client.id} />
                <button type="submit" className={styles.ghost}>
                  Reler do Mercado Pago
                </button>
              </form>
              {subscription.provider_subscription_id && live ? (
                <form action={cancel}>
                  <input type="hidden" name="client" value={client.id} />
                  <input type="hidden" name="provider" value={subscription.provider_subscription_id} />
                  <button type="submit" className={styles.ghost}>
                    Cancelar cobrança
                  </button>
                </form>
              ) : null}
              {subscription.provider_subscription_id ? (
                <span className={`type-micro ${styles.link}`}>{subscription.provider_subscription_id}</span>
              ) : null}
            </div>
          </>
        ) : (
          <p className={`type-body ${styles.empty}`}>
            Sem assinatura. Envie o link abaixo: o cliente autoriza a cobrança de {brl(client.price_cents)} por mês no Mercado Pago.
          </p>
        )}
      </section>

      <section className={styles.block}>
        <div className={styles.blockHead}>
          <h2 className="type-chapter">Link do cliente</h2>
        </div>
        <CopyLink url={link} />
        <div className={styles.rowActions}>
          <form action={renewLink}>
            <input type="hidden" name="id" value={client.id} />
            <button type="submit" className={styles.ghost}>
              Sortear link novo
            </button>
          </form>
          <form action={archive}>
            <input type="hidden" name="id" value={client.id} />
            <input type="hidden" name="archived" value={client.archived_at ? "no" : "yes"} />
            <button type="submit" className={styles.ghost}>
              {client.archived_at ? "Reativar cliente" : "Arquivar cliente"}
            </button>
          </form>
          <span className={`type-micro ${styles.hint}`}>Um link novo faz o anterior parar de abrir. Arquivar fecha o link.</span>
        </div>
      </section>

      <section className={styles.block}>
        <div className={styles.blockHead}>
          <h2 className="type-chapter">Histórico de pagamentos</h2>
          <span className={`type-micro ${styles.muted}`}>{payments.length} cobranças</span>
        </div>
        {payments.length ? (
          <div className={styles.scroll}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Data</th>
                  <th scope="col">Situação</th>
                  <th scope="col">Identificação</th>
                  <th scope="col">Valor</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((payment) => (
                  <tr key={payment.id}>
                    <td>{dateLabel(payment.charged_at)}</td>
                    <td>{payment.paid ? "Pago" : payment.status}</td>
                    <td className={styles.link}>{payment.provider_payment_id}</td>
                    <td>{brl(payment.amount_cents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className={`type-body ${styles.empty}`}>Nenhuma cobrança ainda.</p>
        )}
      </section>

      <section className={styles.block}>
        <div className={styles.blockHead}>
          <h2 className="type-chapter">Cadastro</h2>
        </div>
        <ClientForm action={saveClient} submitLabel="Salvar cadastro" client={client} liveSubscription={live} />
      </section>

      {subscriptions.length > 1 ? (
        <section className={styles.block}>
          <div className={styles.blockHead}>
            <h2 className="type-chapter">Assinaturas anteriores</h2>
          </div>
          <div className={styles.scroll}>
            <table className={styles.table}>
              <tbody>
                {subscriptions.slice(1).map((row) => (
                  <tr key={row.id}>
                    <td>{dateLabel(row.created_at)}</td>
                    <td>
                      <span className={styles.status} data-status={row.status ?? "none"}>
                        {row.status ? STATUS_LABEL[row.status] : "—"}
                      </span>
                    </td>
                    <td>{brl(row.amount_cents)}</td>
                    <td className={styles.link}>{row.provider_subscription_id ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </main>
  );
}

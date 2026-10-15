import type { Metadata } from "next";
import Link from "next/link";

import { Wordmark } from "@/components/brand/Wordmark";
import styles from "@/components/maintenance/Admin.module.css";
import { ClientForm } from "@/components/maintenance/ClientForm";
import { CopyLink } from "@/components/maintenance/CopyLink";
import { SignIn } from "@/components/maintenance/SignIn";
import { adminListReady, getAdmin } from "@/lib/maintenance/admin";
import { billingReady, closedReason, testMode } from "@/lib/maintenance/billing";
import { overview } from "@/lib/maintenance/data";
import { brl, dateLabel, STATUS_LABEL } from "@/lib/maintenance/plan";
import { absoluteUrl } from "@/lib/seo";
import { addClient, enter, leave } from "./actions";

export const metadata: Metadata = {
  title: { absolute: "Manutenção · Painel" },
  robots: { index: false, follow: false },
};

/*
  O painel da manutenção: os clientes, a receita recorrente, os próximos
  vencimentos e os pagamentos que o Mercado Pago relatou.

  Quem não é administrador vê a porta e nada mais — nem a contagem de
  clientes. Os números são lidos do banco a cada visita: é dinheiro, e muda
  sem aviso nosso.
*/
export default async function AdminPage() {
  const admin = await getAdmin();
  if (!admin) return <SignIn action={enter} ready={adminListReady()} />;

  const { rows, mrr, earning, pending, late, upcoming, payments } = await overview();
  const open = rows.filter(({ client }) => !client.archived_at);
  const archived = rows.filter(({ client }) => client.archived_at);

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

      <div>
        <h1 className={`type-headline ${styles.title}`}>Manutenção de sites</h1>
        <p className={`type-body ${styles.muted}`}>
          {billingReady()
            ? testMode()
              ? "Ambiente de teste: conta de teste do Mercado Pago, nenhuma cobrança real."
              : "Cobrança mensal automática pelo Mercado Pago."
            : `${closedReason()} Os links abrem, mas ninguém consegue autorizar uma cobrança.`}
        </p>
      </div>

      <section className={styles.figures}>
        <div className={styles.figure} data-mark="">
          <span className="type-micro">Receita recorrente</span>
          <span className={styles.figureValue}>{brl(mrr)}</span>
          <span className={`type-micro ${styles.muted}`}>por mês</span>
        </div>
        <div className={styles.figure}>
          <span className="type-micro">Cobrando</span>
          <span className={styles.figureValue}>{earning}</span>
          <span className={`type-micro ${styles.muted}`}>de {open.length} clientes</span>
        </div>
        <div className={styles.figure}>
          <span className="type-micro">Aguardando</span>
          <span className={styles.figureValue}>{pending}</span>
          <span className={`type-micro ${styles.muted}`}>link enviado, sem autorizar</span>
        </div>
        <div className={styles.figure}>
          <span className="type-micro">Atrasados</span>
          <span className={styles.figureValue}>{late}</span>
          <span className={`type-micro ${styles.muted}`}>última cobrança não passou</span>
        </div>
      </section>

      <section className={styles.block}>
        <div className={styles.blockHead}>
          <h2 className="type-chapter">Clientes</h2>
          <span className={`type-micro ${styles.muted}`}>{open.length} ativos</span>
        </div>

        {open.length ? (
          <div className={styles.scroll}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Cliente</th>
                  <th scope="col">Assinatura</th>
                  <th scope="col">Valor</th>
                  <th scope="col">Próxima cobrança</th>
                  <th scope="col">Link do cliente</th>
                  <th scope="col" />
                </tr>
              </thead>
              <tbody>
                {open.map(({ client, subscription }) => (
                  <tr key={client.id}>
                    <td>
                      <span className={styles.name}>{client.name}</span>
                      {client.site_url ? (
                        <>
                          <br />
                          <span className={`type-micro ${styles.muted}`}>{client.site_url.replace(/^https?:\/\//, "")}</span>
                        </>
                      ) : null}
                    </td>
                    <td>
                      <span className={styles.status} data-status={subscription?.status ?? "none"}>
                        {subscription?.status ? STATUS_LABEL[subscription.status] : "Sem assinatura"}
                      </span>
                    </td>
                    <td>{brl(subscription?.amount_cents ?? client.price_cents)}</td>
                    <td>{dateLabel(subscription?.current_period_end)}</td>
                    <td>
                      <CopyLink url={absoluteUrl(`/manutencao/${client.token}`)} />
                    </td>
                    <td>
                      <Link href={`/manutencao/admin/${client.id}`} className={styles.ghost}>
                        Abrir
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className={`type-body ${styles.empty}`}>Nenhum cliente ainda. Cadastre o primeiro abaixo e envie o link dele.</p>
        )}
      </section>

      <section className={styles.block}>
        <div className={styles.blockHead}>
          <h2 className="type-chapter">Novo cliente</h2>
          <span className={`type-micro ${styles.muted}`}>o link individual nasce com ele</span>
        </div>
        <ClientForm action={addClient} submitLabel="Cadastrar cliente" />
      </section>

      <section className={styles.block}>
        <div className={styles.blockHead}>
          <h2 className="type-chapter">Próximos vencimentos</h2>
        </div>
        {upcoming.length ? (
          <div className={styles.scroll}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Data</th>
                  <th scope="col">Cliente</th>
                  <th scope="col">Situação</th>
                  <th scope="col">Valor</th>
                </tr>
              </thead>
              <tbody>
                {upcoming.map(({ client, subscription }) => (
                  <tr key={client.id}>
                    <td>{dateLabel(subscription?.current_period_end)}</td>
                    <td className={styles.name}>{client.name}</td>
                    <td>
                      <span className={styles.status} data-status={subscription?.status ?? "none"}>
                        {subscription?.status ? STATUS_LABEL[subscription.status] : "—"}
                      </span>
                    </td>
                    <td>{brl(subscription?.amount_cents ?? client.price_cents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className={`type-body ${styles.empty}`}>
            Nenhuma cobrança agendada. O Mercado Pago informa a data assim que uma assinatura é autorizada.
          </p>
        )}
      </section>

      <section className={styles.block}>
        <div className={styles.blockHead}>
          <h2 className="type-chapter">Pagamentos recentes</h2>
          <span className={`type-micro ${styles.muted}`}>como o Mercado Pago relatou</span>
        </div>
        {payments.length ? (
          <div className={styles.scroll}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Data</th>
                  <th scope="col">Cliente</th>
                  <th scope="col">Situação</th>
                  <th scope="col">Valor</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((payment) => (
                  <tr key={payment.id}>
                    <td>{dateLabel(payment.charged_at)}</td>
                    <td className={styles.name}>{payment.clientName}</td>
                    <td>{payment.paid ? "Pago" : payment.status}</td>
                    <td>{brl(payment.amount_cents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className={`type-body ${styles.empty}`}>Nenhum pagamento ainda.</p>
        )}
      </section>

      {archived.length ? (
        <section className={styles.block}>
          <div className={styles.blockHead}>
            <h2 className="type-chapter">Arquivados</h2>
          </div>
          <div className={styles.scroll}>
            <table className={styles.table}>
              <tbody>
                {archived.map(({ client }) => (
                  <tr key={client.id}>
                    <td className={styles.name}>{client.name}</td>
                    <td className={styles.muted}>arquivado em {dateLabel(client.archived_at)}</td>
                    <td>
                      <Link href={`/manutencao/admin/${client.id}`} className={styles.ghost}>
                        Abrir
                      </Link>
                    </td>
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

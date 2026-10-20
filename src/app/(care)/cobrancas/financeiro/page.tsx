import type { Metadata } from "next";
import Link from "next/link";

import { Wordmark } from "@/components/brand/Wordmark";
import styles from "@/components/maintenance/Admin.module.css";
import { SignIn } from "@/components/maintenance/SignIn";
import { financialOverview } from "@/lib/billing/financial-data";
import { brl } from "@/lib/billing/money";
import { asStatus } from "@/lib/flow/access";
import { adminListReady, getAdmin } from "@/lib/maintenance/admin";
import { dateLabel, STATUS_LABEL } from "@/lib/maintenance/plan";
import { enter, leave } from "../clientes/actions";

export const metadata: Metadata = {
  title: { absolute: "Cobranças · Financeiro" },
  robots: { index: false, follow: false },
};

/*
  O painel financeiro da agência: Wuavy Pulse, manutenção de sites e cobranças
  avulsas num lugar só, somados sem se misturarem.

  A tela repete, em palavras, a regra que financial-summary.ts aplica nas
  contas: "recebido" é o que tem registro de pagamento sustentando, "previsto"
  é projeção de assinatura. O Pulse aparece só do lado da projeção, porque não
  guarda histórico de pagamento nenhum — e a tela diz isso, em vez de mostrar
  um zero que pareceria "nada entrou".

  Tudo é lido no servidor (financial-data.ts, service role depois do getAdmin):
  nenhum número financeiro chega ao navegador de quem não é administrador.
*/
export default async function FinanceiroPage() {
  const admin = await getAdmin();
  if (!admin) return <SignIn action={enter} ready={adminListReady()} />;

  const { pulse, pulseClinics, charges, maintenance, consolidated, recentCharges, recentMaintenance, empty } = await financialOverview();
  const pulseLabel = (status: string) => {
    const known = asStatus(status);
    return known ? STATUS_LABEL[known] : status;
  };

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
        <Link href="/cobrancas/lancamentos" className={styles.ghost}>
          Cobranças
        </Link>
        <Link href="/cobrancas/financeiro" className={styles.ghost} aria-current="page">
          Financeiro
        </Link>
      </nav>

      <p className={`type-body ${styles.muted}`}>
        Recebido é o que tem pagamento registrado sustentando. Previsto é projeção de assinatura — nunca prova de que o mês entrou. As duas
        colunas não se somam.
      </p>

      {empty ? (
        <section className={styles.block}>
          <div className={styles.blockHead}>
            <h2 className="type-chapter">Resumo consolidado</h2>
          </div>
          <p className={`type-body ${styles.empty}`}>
            Nenhuma assinatura, cobrança ou pagamento registrado ainda nos três produtos. Quando a primeira clínica assinar o Pulse, um
            cliente contratar manutenção ou uma cobrança avulsa for paga, os números aparecem aqui.
          </p>
        </section>
      ) : (
        <>
          <section className={styles.figures}>
            <div className={styles.figure} data-mark="">
              <span className="type-micro">Recebido</span>
              <span className={styles.figureValue}>{brl(consolidated.receivedCents)}</span>
              <span className={`type-micro ${styles.muted}`}>com pagamento registrado</span>
            </div>
            <div className={styles.figure}>
              <span className="type-micro">Previsto por mês</span>
              <span className={styles.figureValue}>{brl(consolidated.projectedMrrCents)}</span>
              <span className={`type-micro ${styles.muted}`}>assinaturas cobrando</span>
            </div>
            <div className={styles.figure}>
              <span className="type-micro">Do previsto, estimado</span>
              <span className={styles.figureValue}>{brl(consolidated.estimatedMrrCents)}</span>
              <span className={`type-micro ${styles.muted}`}>Pulse, sem valor gravado</span>
            </div>
            <div className={styles.figure}>
              <span className="type-micro">Aguardando crédito</span>
              <span className={styles.figureValue}>{brl(consolidated.awaitingCreditCents)}</span>
              <span className={`type-micro ${styles.muted}`}>autorizado, não creditado</span>
            </div>
          </section>

          <section className={styles.block}>
            <div className={styles.blockHead}>
              <h2 className="type-chapter">Wuavy Pulse</h2>
              <span className={`type-micro ${styles.muted}`}>{pulse.subscribers} cobrando</span>
            </div>

            <div className={styles.notice}>
              <span className="type-micro">Projeção estimada, não receita</span>
              <span className={`type-body ${styles.hint}`}>
                O Pulse não guarda histórico de pagamentos: a assinatura registra só o estado atual. Não há como esta tela dizer quanto o Pulse
                já recebeu — e ela não tenta. A previsão de {brl(pulse.estimatedMrrCents)} por mês é estimativa:{" "}
                {pulse.billedSubscribers} {pulse.billedSubscribers === 1 ? "assinatura" : "assinaturas"} no Mercado Pago ×{" "}
                {brl(pulse.referencePriceCents)} como referência provisória. O valor que cada clínica paga de fato vive no Mercado Pago, e uma
                clínica com preço fundador pode pagar outro.
                {pulse.manualSubscribers
                  ? ` ${pulse.manualSubscribers} ${pulse.manualSubscribers === 1 ? "clínica ativada à mão está fora" : "clínicas ativadas à mão estão fora"} da projeção: contrataram direto, e o que combinaram pagar não está em nenhum registro.`
                  : ""}
              </span>
            </div>

            <section className={styles.figures}>
              <div className={styles.figure}>
                <span className="type-micro">Ativas</span>
                <span className={styles.figureValue}>{pulse.active}</span>
                <span className={`type-micro ${styles.muted}`}>assinatura em dia</span>
              </div>
              <div className={styles.figure}>
                <span className="type-micro">Em atraso</span>
                <span className={styles.figureValue}>{pulse.pastDue}</span>
                <span className={`type-micro ${styles.muted}`}>conta como cobrando</span>
              </div>
              <div className={styles.figure}>
                <span className="type-micro">Pendentes</span>
                <span className={styles.figureValue}>{pulse.pending}</span>
                <span className={`type-micro ${styles.muted}`}>sem autorizar</span>
              </div>
              <div className={styles.figure}>
                <span className="type-micro">Canceladas</span>
                <span className={styles.figureValue}>{pulse.cancelled}</span>
                <span className={`type-micro ${styles.muted}`}>fora da projeção</span>
              </div>
            </section>

            <div className={styles.blockHead}>
              <h3 className="type-chapter">Clínicas assinantes</h3>
            </div>
            {pulseClinics.length ? (
              <div className={styles.scroll}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th scope="col">Clínica</th>
                      <th scope="col">Assinatura</th>
                      <th scope="col">Origem</th>
                      <th scope="col">Desde</th>
                      <th scope="col">Próxima cobrança</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pulseClinics.map((row) => (
                      <tr key={row.id}>
                        <td className={styles.name}>{row.clinic}</td>
                        <td>
                          <span className={styles.status} data-status={row.status}>
                            {pulseLabel(row.status)}
                          </span>
                        </td>
                        <td className={styles.muted}>{row.provider === "manual" ? "Ativada à mão" : "Mercado Pago"}</td>
                        <td>{dateLabel(row.startedAt)}</td>
                        <td>{dateLabel(row.currentPeriodEnd)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className={`type-body ${styles.empty}`}>Nenhuma clínica assinante ainda.</p>
            )}
          </section>

          <section className={styles.block}>
            <div className={styles.blockHead}>
              <h2 className="type-chapter">Cobranças avulsas</h2>
              <span className={`type-micro ${styles.muted}`}>
                {charges.totalCharges} {charges.totalCharges === 1 ? "lançada" : "lançadas"}
              </span>
            </div>

            <section className={styles.figures}>
              <div className={styles.figure} data-mark="">
                <span className="type-micro">Creditado</span>
                <span className={styles.figureValue}>{brl(charges.receivedCents)}</span>
                <span className={`type-micro ${styles.muted}`}>
                  {charges.receivedCount} {charges.receivedCount === 1 ? "pagamento" : "pagamentos"}
                </span>
              </div>
              <div className={styles.figure}>
                <span className="type-micro">Autorizado, não creditado</span>
                <span className={styles.figureValue}>{brl(charges.authorizedCents)}</span>
                <span className={`type-micro ${styles.muted}`}>fora da receita</span>
              </div>
              <div className={styles.figure}>
                <span className="type-micro">Pendentes</span>
                <span className={styles.figureValue}>{charges.pendingCharges}</span>
                <span className={`type-micro ${styles.muted}`}>sem pagamento</span>
              </div>
              <div className={styles.figure}>
                <span className="type-micro">Recusadas</span>
                <span className={styles.figureValue}>{charges.rejectedCharges}</span>
                <span className={`type-micro ${styles.muted}`}>
                  e {charges.refundedCharges} {charges.refundedCharges === 1 ? "reembolsada" : "reembolsadas"}
                </span>
              </div>
            </section>

            {charges.authorizedCount ? (
              <div className={styles.notice}>
                <span className="type-micro">Por que fora da receita</span>
                <span className={`type-body ${styles.hint}`}>
                  O Mercado Pago aprova um cartão antes de creditar o valor. Um pagamento só entra em &ldquo;creditado&rdquo; quando ele
                  informa que o dinheiro foi creditado; sem essa confirmação, fica aqui — classificação conservadora de propósito.
                </span>
              </div>
            ) : null}

            {recentCharges.length ? (
              <div className={styles.scroll}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th scope="col">Valor</th>
                      <th scope="col">Situação</th>
                      <th scope="col">Data</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentCharges.map((payment) => (
                      <tr key={payment.id}>
                        <td>{brl(payment.amountCents)}</td>
                        <td>
                          <span className={styles.status} data-status={payment.statusDetail === "accredited" ? "approved" : "pending"}>
                            {payment.statusDetail === "accredited" ? "Creditado" : "Autorizado"}
                          </span>
                        </td>
                        <td>{dateLabel(payment.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className={`type-body ${styles.empty}`}>Nenhum pagamento aprovado ainda.</p>
            )}
          </section>

          <section className={styles.block}>
            <div className={styles.blockHead}>
              <h2 className="type-chapter">Manutenção de sites</h2>
              <span className={`type-micro ${styles.muted}`}>{maintenance.earning} cobrando</span>
            </div>

            <section className={styles.figures}>
              <div className={styles.figure}>
                <span className="type-micro">Previsto por mês</span>
                <span className={styles.figureValue}>{brl(maintenance.mrrCents)}</span>
                <span className={`type-micro ${styles.muted}`}>valor gravado por assinatura</span>
              </div>
              <div className={styles.figure} data-mark="">
                <span className="type-micro">Recebido</span>
                <span className={styles.figureValue}>{brl(maintenance.receivedCents)}</span>
                <span className={`type-micro ${styles.muted}`}>
                  {maintenance.receivedCount} {maintenance.receivedCount === 1 ? "cobrança paga" : "cobranças pagas"}
                </span>
              </div>
              <div className={styles.figure}>
                <span className="type-micro">Aguardando</span>
                <span className={styles.figureValue}>{maintenance.pending}</span>
                <span className={`type-micro ${styles.muted}`}>sem autorizar</span>
              </div>
              <div className={styles.figure}>
                <span className="type-micro">Atrasadas</span>
                <span className={styles.figureValue}>{maintenance.late}</span>
                <span className={`type-micro ${styles.muted}`}>última não passou</span>
              </div>
            </section>

            {recentMaintenance.length ? (
              <div className={styles.scroll}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th scope="col">Valor</th>
                      <th scope="col">Situação</th>
                      <th scope="col">Cobrada em</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentMaintenance.map((payment) => (
                      <tr key={payment.id}>
                        <td>{brl(payment.amountCents)}</td>
                        <td>
                          <span className={styles.status} data-status="approved">
                            Paga
                          </span>
                        </td>
                        <td>{dateLabel(payment.chargedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className={`type-body ${styles.empty}`}>Nenhuma cobrança de manutenção paga ainda.</p>
            )}
          </section>

          <section className={styles.block}>
            <div className={styles.blockHead}>
              <h2 className="type-chapter">Resumo consolidado</h2>
            </div>
            <div className={styles.scroll}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th scope="col">Produto</th>
                    <th scope="col">Recebido</th>
                    <th scope="col">Previsto por mês</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className={styles.name}>Wuavy Pulse</td>
                    <td className={styles.muted}>sem histórico</td>
                    <td>{brl(pulse.estimatedMrrCents)} (estimado)</td>
                  </tr>
                  <tr>
                    <td className={styles.name}>Cobranças avulsas</td>
                    <td>{brl(charges.receivedCents)}</td>
                    <td className={styles.muted}>não recorrente</td>
                  </tr>
                  <tr>
                    <td className={styles.name}>Manutenção de sites</td>
                    <td>{brl(maintenance.receivedCents)}</td>
                    <td>{brl(maintenance.mrrCents)}</td>
                  </tr>
                  <tr>
                    <td className={styles.name}>Total</td>
                    <td>{brl(consolidated.receivedCents)}</td>
                    <td>{brl(consolidated.projectedMrrCents)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </main>
  );
}

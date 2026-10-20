import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Wordmark } from "@/components/brand/Wordmark";
import { Authorize } from "@/components/maintenance/Authorize";
import styles from "@/components/maintenance/Plan.module.css";
import { site } from "@/data/site";
import { contactHref } from "@/lib/contact";
import { billingReady, refresh } from "@/lib/maintenance/billing";
import { clientByToken } from "@/lib/maintenance/data";
import { brl, dateLabel, isEarning, PLAN, STATUS_LABEL } from "@/lib/maintenance/plan";
import { authorize } from "./actions";

export const metadata: Metadata = {
  title: { absolute: "Manutenção · Wuavy" },
  robots: { index: false, follow: false },
};

/*
  A página de assinatura de um cliente. O link é individual: o token na URL é
  a única coisa que a abre, e um token que não é de ninguém é 404.

  O que o cliente vê sobre a sua assinatura vem do servidor, e o servidor lê
  de volta do Mercado Pago quando há uma assinatura para ler — é assim que a
  volta do Mercado Pago, logo depois de autorizar, já mostra a cobrança
  ativa, sem esperar o webhook.
*/
export default async function MaintenancePage({ params }: PageProps<"/manutencao/[token]">) {
  const { token } = await params;
  const found = await clientByToken(token);
  if (!found) notFound();

  const { client, subscription } = found;
  const status = subscription ? await refresh(subscription) : null;
  const earning = isEarning(status);
  const resuming = status === "pending" && Boolean(subscription?.provider_subscription_id);
  const whatsapp = contactHref(site.contact.primary, `Manutenção do site — ${client.name}`);

  return (
    <main id="conteudo" className={`${styles.page} tx-grain`} data-surface="black">
      <header className={styles.top}>
        <Wordmark size="small" className={styles.mark} />
        <p className={`type-micro ${styles.label}`}>{client.plan_name}</p>
      </header>

      <section className={styles.hero}>
        <p className={`type-micro ${styles.client}`}>
          {client.name}
          {client.site_url ? ` · ${client.site_url.replace(/^https?:\/\//, "")}` : ""}
        </p>
        <h1 className={`type-headline ${styles.title}`}>Seu site cuidado, todo mês, sem você precisar pedir.</h1>

        <div className={styles.priceRow}>
          <p className={styles.price}>
            <span className={styles.currency}>R$</span>
            {Math.floor(client.price_cents / 100)}
            {client.price_cents % 100 ? <span className={styles.currency}>,{String(client.price_cents % 100).padStart(2, "0")}</span> : null}
          </p>
          <p className={styles.per}>por mês, no cartão</p>
        </div>

        <p className={`type-body ${styles.lead}`}>
          Manutenção básica, correções técnicas e uma pequena alteração por mês. A cobrança é automática: você autoriza uma vez e o
          Mercado Pago cobra {brl(client.price_cents)} a cada mês, até você cancelar.
        </p>
      </section>

      <section className={styles.lists}>
        <div>
          <h2 className={`type-micro ${styles.listHead}`}>Está incluído</h2>
          <ul className={styles.list}>
            {PLAN.includes.map((line) => (
              <li key={line} className={`type-body ${styles.item}`} data-in="yes">
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h2 className={`type-micro ${styles.listHead}`}>Não está incluído</h2>
          <ul className={styles.list}>
            {PLAN.excludes.map((line) => (
              <li key={line} className={`type-body ${styles.item}`} data-in="no">
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {earning ? (
        <div className={styles.action}>
          <div className={styles.state} data-tone={status === "past_due" ? "late" : "ok"}>
            <p className={`type-chapter ${styles.stateTitle}`}>
              {status === "past_due" ? "Pagamento atrasado" : "Manutenção ativa"}
            </p>
            <p className="type-body">
              {status === "past_due"
                ? "A última cobrança não passou. Atualize o cartão no Mercado Pago, ou fale com a gente e resolvemos juntos."
                : `Próxima cobrança de ${brl(subscription?.amount_cents ?? client.price_cents)} em ${dateLabel(subscription?.current_period_end)}.`}
            </p>
            <p className={`type-micro ${styles.fine}`}>
              <a href={whatsapp} target="_blank" rel="noopener">
                Falar com a Wuavy no WhatsApp
              </a>
            </p>
          </div>
        </div>
      ) : !billingReady() ? (
        <div className={styles.action}>
          <div className={styles.state} data-tone="wait">
            <p className={`type-chapter ${styles.stateTitle}`}>A assinatura online está sendo preparada</p>
            <p className="type-body">
              Fale com a gente pelo WhatsApp e ativamos a sua manutenção de {brl(client.price_cents)} por mês.
            </p>
            <p className={`type-micro ${styles.fine}`}>
              <a href={whatsapp} target="_blank" rel="noopener">
                Falar com a Wuavy no WhatsApp
              </a>
            </p>
          </div>
        </div>
      ) : (
        <>
          {resuming ? (
            <div className={styles.state} data-tone="wait">
              <p className={`type-chapter ${styles.stateTitle}`}>{STATUS_LABEL.pending}</p>
              <p className="type-body">A autorização foi aberta e ainda não foi concluída. Continue de onde parou.</p>
            </div>
          ) : null}
          <Authorize token={client.token} needsEmail={!client.email} resuming={resuming} action={authorize} />
        </>
      )}

      <footer className={`type-micro ${styles.footer}`}>
        <span>Wuavy · {client.plan_name}</span>
        <span>Cobrança mensal automática pelo Mercado Pago</span>
      </footer>
    </main>
  );
}

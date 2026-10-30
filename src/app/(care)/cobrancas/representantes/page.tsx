import type { Metadata } from "next";
import Link from "next/link";

import { CopyLink } from "@/components/maintenance/CopyLink";
import { CouponForm } from "@/components/billing/CouponForm";
import { RepresentativeForm } from "@/components/billing/RepresentativeForm";
import { Wordmark } from "@/components/brand/Wordmark";
import styles from "@/components/maintenance/Admin.module.css";
import { SignIn } from "@/components/maintenance/SignIn";
import { brl } from "@/lib/billing/money";
import { prospectInviteMessage, representativeStats, shareMessage } from "@/lib/billing/coupon-rules";
import { chargesForRepresentative, eligibleServiceIdsFor, listCouponsByRepresentative, type Coupon } from "@/lib/billing/coupons";
import { waLink } from "@/lib/billing/whatsapp";
import { listServices, type BillingService } from "@/lib/billing/services";
import { dateLabel } from "@/lib/maintenance/plan";
import { listRepresentatives, type Representative } from "@/lib/billing/representatives";
import { adminListReady, getAdmin } from "@/lib/maintenance/admin";
import { whatsapp as wuavyWhatsapp } from "@/data/site";
import { enter, leave } from "../clientes/actions";
import { addCoupon, addRepresentative, saveCoupon, saveRepresentative, setCouponStatus, setRepresentativeStatus } from "./actions";

export const metadata: Metadata = {
  title: { absolute: "Cobranças · Representantes" },
  robots: { index: false, follow: false },
};

/*
  Representantes e cupons do Wuavy Cobranças. Desativar um representante
  desativa os cupons dele junto (representatives.ts); reativar não os traz de
  volta. A busca de um cupom pelo código continua em lancamentos/actions.ts
  (addCharge) — esta página só cadastra e mostra resultados.
*/
export default async function RepresentantesPage() {
  const admin = await getAdmin();
  if (!admin) return <SignIn action={enter} ready={adminListReady()} />;

  const [representatives, services] = await Promise.all([listRepresentatives(), listServices()]);

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
        <Link href="/cobrancas/representantes" className={styles.ghost} aria-current="page">
          Representantes
        </Link>
      </nav>

      {representatives.length ? (
        representatives.map((representative) => <RepresentativeSection key={representative.id} representative={representative} services={services} />)
      ) : (
        <p className={`type-body ${styles.empty}`}>Nenhum representante ainda. Cadastre o primeiro abaixo.</p>
      )}

      <section className={styles.block}>
        <div className={styles.blockHead}>
          <h2 className="type-chapter">Novo representante</h2>
        </div>
        <RepresentativeForm action={addRepresentative} submitLabel="Cadastrar representante" />
      </section>
    </main>
  );
}

const DISCOUNT_LABEL = (coupon: Coupon) => (coupon.discount_type === "percent" ? `${coupon.discount_percent}%` : brl(coupon.discount_fixed_cents ?? 0));

/**
 * Os serviços oferecidos como opção de elegibilidade: todos os ativos, mais
 * qualquer um já escolhido mesmo que tenha sido desativado depois — editar
 * um cupom nunca deve apagar uma restrição em serviços que ficaram
 * inativos só porque eles não aparecem mais na lista de opções.
 */
function serviceOptionsFor(services: BillingService[], selectedIds: string[]) {
  const options = new Map<string, { id: string; name: string }>();
  for (const service of services) {
    if (service.active || selectedIds.includes(service.id)) options.set(service.id, { id: service.id, name: service.name });
  }
  return [...options.values()];
}

async function RepresentativeSection({ representative, services }: { representative: Representative; services: BillingService[] }) {
  const [coupons, charges] = await Promise.all([listCouponsByRepresentative(representative.id), chargesForRepresentative(representative.id)]);
  const stats = representativeStats(charges);
  const activeCoupons = coupons.filter((coupon) => coupon.active).length;
  const eligibleServiceIds = new Map(await Promise.all(coupons.map(async (coupon) => [coupon.id, await eligibleServiceIdsFor(coupon.id)] as const)));
  const newCouponServices = serviceOptionsFor(services, []);

  return (
    <section className={styles.block}>
      <div className={styles.blockHead}>
        <h2 className="type-chapter">{representative.name}</h2>
        <span className={`type-micro ${styles.muted}`}>{representative.active ? "Ativo" : "Desativado"}</span>
      </div>

      <div className={styles.rowActions}>
        <details>
          <summary className={styles.ghost} style={{ display: "inline", cursor: "pointer" }}>
            Editar
          </summary>
          <RepresentativeForm action={saveRepresentative} submitLabel="Salvar" representative={representative} />
        </details>
        <form action={setRepresentativeStatus} className={styles.rowActions}>
          <input type="hidden" name="id" value={representative.id} />
          <input type="hidden" name="active" value={representative.active ? "no" : "yes"} />
          <button type="submit" className={styles.ghost}>
            {representative.active ? "Desativar" : "Reativar"}
          </button>
        </form>
      </div>

      <p className="type-body">
        Cupons ativos: {activeCoupons} · Indicações registradas: {stats.registeredReferrals} · Cobranças pendentes: {stats.pendingCharges} · Vendas
        confirmadas: {stats.confirmedSales} · Clientes convertidos: {stats.convertedClients} · Faturamento atribuído:{" "}
        {brl(stats.attributedRevenueCents)} · Descontos concedidos: {brl(stats.grantedDiscountCents)}
      </p>

      {coupons.length ? (
        <div className={styles.scroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Código</th>
                <th scope="col">Desconto</th>
                <th scope="col">Validade</th>
                <th scope="col">Status</th>
                <th scope="col" />
              </tr>
            </thead>
            <tbody>
              {coupons.map((coupon) => {
                // O link que um CLIENTE clica abre uma conversa com o WhatsApp
                // oficial da Wuavy (wuavyWhatsapp, de src/data/site.ts) — nunca
                // com o representante — já com o cupom preenchido na voz de
                // quem está pedindo o desconto. `message` é o texto que a
                // administradora manda ao representante para ele divulgar; o
                // link para a Wuavy já vem embutido nele.
                const prospectLink = waLink(wuavyWhatsapp.number, prospectInviteMessage(coupon.code));
                const message = shareMessage(coupon.code, prospectLink);
                const couponSelectedIds = eligibleServiceIds.get(coupon.id) ?? [];
                const canReactivate = coupon.active || representative.active;
                return (
                  <tr key={coupon.id}>
                    <td className={styles.name}>{coupon.code}</td>
                    <td>{DISCOUNT_LABEL(coupon)}</td>
                    <td>
                      {dateLabel(coupon.valid_from)}
                      {coupon.valid_until ? ` – ${dateLabel(coupon.valid_until)}` : ""}
                    </td>
                    <td>
                      <span className={styles.status} data-status={coupon.active ? "active" : "inactive"}>
                        {coupon.active ? "Ativo" : "Inativo"}
                      </span>
                    </td>
                    <td>
                      <details>
                        <summary className={styles.ghost} style={{ display: "inline", cursor: "pointer" }}>
                          Editar
                        </summary>
                        <CouponForm
                          action={saveCoupon}
                          submitLabel="Salvar"
                          services={serviceOptionsFor(services, couponSelectedIds)}
                          coupon={coupon}
                          selectedServiceIds={couponSelectedIds}
                        />
                      </details>
                      {canReactivate ? (
                        <form action={setCouponStatus} className={styles.rowActions}>
                          <input type="hidden" name="id" value={coupon.id} />
                          <input type="hidden" name="active" value={coupon.active ? "no" : "yes"} />
                          <button type="submit" className={styles.ghost}>
                            {coupon.active ? "Desativar" : "Reativar"}
                          </button>
                        </form>
                      ) : (
                        <span className={`type-micro ${styles.muted}`}>Reative o representante primeiro</span>
                      )}
                      <CopyLink url={message} />
                      {/* Esta conversa é com o representante: a administradora manda a ele o texto pronto (que já leva o link da Wuavy embutido para o cliente clicar). */}
                      <a href={waLink(representative.whatsapp, message)} target="_blank" rel="noopener" className={styles.ghost}>
                        Mandar para o representante
                      </a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className={`type-body ${styles.empty}`}>Nenhum cupom ainda.</p>
      )}

      <div className={styles.blockHead}>
        <h3 className="type-chapter">Novo cupom</h3>
      </div>
      <CouponForm action={addCoupon} submitLabel="Cadastrar cupom" services={newCouponServices} representativeId={representative.id} />
    </section>
  );
}

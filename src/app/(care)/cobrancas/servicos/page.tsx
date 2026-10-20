import type { Metadata } from "next";
import Link from "next/link";

import { ServiceForm } from "@/components/billing/ServiceForm";
import { Wordmark } from "@/components/brand/Wordmark";
import styles from "@/components/maintenance/Admin.module.css";
import { SignIn } from "@/components/maintenance/SignIn";
import { brl } from "@/lib/billing/money";
import { KIND_LABEL, listServices } from "@/lib/billing/services";
import { adminListReady, getAdmin } from "@/lib/maintenance/admin";
import { enter, leave } from "../clientes/actions";
import { addService, saveService } from "./actions";

export const metadata: Metadata = {
  title: { absolute: "Cobranças · Serviços" },
  robots: { index: false, follow: false },
};

/*
  O catálogo de serviços do Wuavy Cobranças. default_price_cents é só o
  padrão de uma cobrança nova (Etapa C) — mudar aqui não altera nenhuma
  cobrança ou assinatura já criada.
*/
export default async function ServicosPage() {
  const admin = await getAdmin();
  if (!admin) return <SignIn action={enter} ready={adminListReady()} />;

  const services = await listServices();

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
        <Link href="/cobrancas/servicos" className={styles.ghost} aria-current="page">
          Serviços
        </Link>
        <Link href="/cobrancas/lancamentos" className={styles.ghost}>
          Cobranças
        </Link>
      </nav>

      <section className={styles.block}>
        <div className={styles.blockHead}>
          <h2 className="type-chapter">Catálogo</h2>
          <span className={`type-micro ${styles.muted}`}>{services.length} serviços</span>
        </div>

        {services.length ? (
          <div className={styles.scroll}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Serviço</th>
                  <th scope="col">Tipo</th>
                  <th scope="col">Preço padrão</th>
                  <th scope="col">Status</th>
                  <th scope="col" />
                </tr>
              </thead>
              <tbody>
                {services.map((service) => (
                  <tr key={service.id}>
                    <td>
                      <span className={styles.name}>{service.name}</span>
                      {service.description ? (
                        <>
                          <br />
                          <span className={`type-micro ${styles.muted}`}>{service.description}</span>
                        </>
                      ) : null}
                    </td>
                    <td>{KIND_LABEL[service.kind]}</td>
                    <td>{brl(service.default_price_cents)}</td>
                    <td>
                      <span className={styles.status} data-status={service.active ? "active" : "inactive"}>
                        {service.active ? "Ativo" : "Inativo"}
                      </span>
                    </td>
                    <td>
                      <details>
                        <summary className={styles.ghost} style={{ display: "inline", cursor: "pointer" }}>
                          Editar
                        </summary>
                        <ServiceForm action={saveService} submitLabel="Salvar" service={service} />
                      </details>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className={`type-body ${styles.empty}`}>Nenhum serviço ainda.</p>
        )}
      </section>

      <section className={styles.block}>
        <div className={styles.blockHead}>
          <h2 className="type-chapter">Novo serviço</h2>
        </div>
        <ServiceForm action={addService} submitLabel="Cadastrar serviço" />
      </section>
    </main>
  );
}

import type { Metadata } from "next";
import Link from "next/link";

import { ClientForm } from "@/components/billing/ClientForm";
import { Wordmark } from "@/components/brand/Wordmark";
import styles from "@/components/maintenance/Admin.module.css";
import { SignIn } from "@/components/maintenance/SignIn";
import { listClients, unlinkedMaintenanceClients } from "@/lib/billing/clients";
import { adminListReady, getAdmin } from "@/lib/maintenance/admin";
import { addClient, archive, enter, leave, link, saveClient } from "./actions";

export const metadata: Metadata = {
  title: { absolute: "Cobranças · Clientes" },
  robots: { index: false, follow: false },
};

/*
  Clientes do Wuavy Cobranças: cadastro, pesquisa e o vínculo opcional com um
  cliente de manutenção já existente. Nada aqui lê ou escreve
  maintenance_clients além desse vínculo — o módulo de manutenção continua
  seu, sem mudança.
*/
export default async function ClientesPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const admin = await getAdmin();
  if (!admin) return <SignIn action={enter} ready={adminListReady()} />;

  const { q } = await searchParams;
  const [rows, unlinked] = await Promise.all([listClients(q), unlinkedMaintenanceClients()]);
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

      <nav className={styles.rowActions} aria-label="Wuavy Cobranças">
        <Link href="/cobrancas/clientes" className={styles.ghost} aria-current="page">
          Clientes
        </Link>
        <Link href="/cobrancas/servicos" className={styles.ghost}>
          Serviços
        </Link>
        <Link href="/cobrancas/lancamentos" className={styles.ghost}>
          Cobranças
        </Link>
      </nav>

      <form method="get" className={styles.rowActions}>
        <input name="q" className={styles.input} defaultValue={q ?? ""} placeholder="Buscar por nome, e-mail ou WhatsApp" style={{ minWidth: "16rem" }} />
        <button type="submit" className={styles.ghost}>
          Buscar
        </button>
        {q ? (
          <Link href="/cobrancas/clientes" className={styles.ghost}>
            Limpar
          </Link>
        ) : null}
      </form>

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
                  <th scope="col">Contato</th>
                  <th scope="col">Manutenção vinculada</th>
                  <th scope="col" />
                </tr>
              </thead>
              <tbody>
                {open.map(({ client, maintenance }) => (
                  <tr key={client.id}>
                    <td>
                      <span className={styles.name}>{client.name}</span>
                      {client.notes ? (
                        <>
                          <br />
                          <span className={`type-micro ${styles.muted}`}>{client.notes}</span>
                        </>
                      ) : null}
                    </td>
                    <td className={styles.wrap}>
                      {client.email ? <span>{client.email}</span> : null}
                      {client.email && client.whatsapp ? <br /> : null}
                      {client.whatsapp ? <span className={`type-micro ${styles.muted}`}>{client.whatsapp}</span> : null}
                      {!client.email && !client.whatsapp ? <span className={`type-micro ${styles.muted}`}>—</span> : null}
                    </td>
                    <td>
                      {maintenance ? (
                        <form action={link} className={styles.rowActions}>
                          <input type="hidden" name="id" value={client.id} />
                          <input type="hidden" name="maintenance_id" value="" />
                          <span>{maintenance.name}</span>
                          <button type="submit" className={styles.ghost}>
                            Desvincular
                          </button>
                        </form>
                      ) : (
                        <form action={link} className={styles.rowActions}>
                          <input type="hidden" name="id" value={client.id} />
                          <select name="maintenance_id" className={styles.input} defaultValue="" style={{ minWidth: "11rem" }}>
                            <option value="">Vincular a um cliente de manutenção…</option>
                            {unlinked.map((option) => (
                              <option key={option.id} value={option.id}>
                                {option.name}
                              </option>
                            ))}
                          </select>
                          <button type="submit" className={styles.ghost}>
                            Vincular
                          </button>
                        </form>
                      )}
                    </td>
                    <td>
                      <details>
                        <summary className={styles.ghost} style={{ display: "inline", cursor: "pointer" }}>
                          Editar
                        </summary>
                        <ClientForm action={saveClient} submitLabel="Salvar" client={client} />
                        <form action={archive} className={styles.rowActions}>
                          <input type="hidden" name="id" value={client.id} />
                          <input type="hidden" name="archived" value="yes" />
                          <button type="submit" className={styles.ghost}>
                            Arquivar
                          </button>
                        </form>
                      </details>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className={`type-body ${styles.empty}`}>{q ? "Nenhum cliente encontrado." : "Nenhum cliente ainda. Cadastre o primeiro abaixo."}</p>
        )}
      </section>

      <section className={styles.block}>
        <div className={styles.blockHead}>
          <h2 className="type-chapter">Novo cliente</h2>
        </div>
        <ClientForm action={addClient} submitLabel="Cadastrar cliente" />
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
                    <td>
                      <form action={archive} className={styles.rowActions}>
                        <input type="hidden" name="id" value={client.id} />
                        <input type="hidden" name="archived" value="no" />
                        <button type="submit" className={styles.ghost}>
                          Reabrir
                        </button>
                      </form>
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

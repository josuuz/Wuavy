"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/Button";
import { Wordmark } from "@/components/brand/Wordmark";
import styles from "./Admin.module.css";

/*
  A porta do painel. A conta é a mesma do Supabase; quem entra precisa estar
  na lista do servidor (lib/maintenance/admin.ts). A mensagem de erro é uma
  só, para a porta não contar quem está na lista.
*/

type Enter = (state: string | null, form: FormData) => Promise<string | null>;

export function SignIn({ action, ready }: { action: Enter; ready: boolean }) {
  const [message, submit, pending] = useActionState(action, null);

  return (
    <main id="conteudo" className={styles.door} data-surface="paper">
      <div className={styles.doorCard}>
        <Wordmark size="small" className={styles.mark} />
        <h1 className={`type-headline ${styles.title}`}>Manutenção</h1>

        {ready ? (
          <form action={submit} className={styles.form}>
            <label className={styles.field} data-wide="">
              <span className="type-micro">E-mail</span>
              <input type="email" name="email" className={styles.input} autoComplete="email" required />
            </label>
            <label className={styles.field} data-wide="">
              <span className="type-micro">Senha</span>
              <input type="password" name="password" className={styles.input} autoComplete="current-password" required />
            </label>
            <div data-wide="">
              <Button type="submit" disabled={pending} aria-busy={pending || undefined}>
                {pending ? "Entrando…" : "Entrar"}
              </Button>
            </div>
            {message ? (
              <p className={`type-body ${styles.hint}`} data-wide="" role="status">
                {message}
              </p>
            ) : null}
          </form>
        ) : (
          <div className={styles.notice}>
            <p className="type-chapter">O painel ainda não tem administradores</p>
            <p className="type-body">
              Defina <code>WUAVY_ADMIN_EMAILS</code> no ambiente com os e-mails que podem entrar, separados por vírgula, e recarregue
              esta página.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}

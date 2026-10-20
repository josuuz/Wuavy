"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/Button";
import styles from "@/components/maintenance/Admin.module.css";

/*
  O cadastro de um cliente da agência: o mesmo formulário para criar e para
  editar. Quando o servidor acha um cliente parecido (lib/billing/dedup.ts),
  a mensagem vem prefixada com "DUPLICATE:" — o formulário troca o botão por
  "Salvar assim mesmo" e manda o próximo envio com force=1, em vez de
  bloquear um cliente legítimo com e-mail ou WhatsApp parecido por acidente.
*/

type Save = (state: string | null, form: FormData) => Promise<string | null>;

interface ClientFormProps {
  action: Save;
  submitLabel: string;
  client?: {
    id: string;
    name: string;
    email: string | null;
    whatsapp: string | null;
    notes: string | null;
  };
}

export function ClientForm({ action, submitLabel, client }: ClientFormProps) {
  const [message, submit, pending] = useActionState(action, null);
  const duplicate = message?.startsWith("DUPLICATE:") ?? false;

  return (
    <form action={submit} className={styles.form}>
      {client ? <input type="hidden" name="id" value={client.id} /> : null}
      <input type="hidden" name="force" value={duplicate ? "1" : ""} />

      <label className={styles.field}>
        <span className="type-micro">Nome ou razão social</span>
        <input name="name" className={styles.input} defaultValue={client?.name ?? ""} maxLength={160} required />
      </label>

      <label className={styles.field}>
        <span className="type-micro">E-mail</span>
        <input type="email" name="email" className={styles.input} defaultValue={client?.email ?? ""} placeholder="contato@exemplo.com" />
      </label>

      <label className={styles.field}>
        <span className="type-micro">WhatsApp</span>
        <input name="whatsapp" className={styles.input} defaultValue={client?.whatsapp ?? ""} placeholder="+55 19 99999-0000" />
      </label>

      <label className={styles.field} data-wide="">
        <span className="type-micro">Observações</span>
        <input name="notes" className={styles.input} defaultValue={client?.notes ?? ""} maxLength={1000} />
      </label>

      <div data-wide="" className={styles.rowActions}>
        <Button type="submit" size="sm" disabled={pending} aria-busy={pending || undefined}>
          {pending ? "Salvando…" : duplicate ? "Salvar assim mesmo" : submitLabel}
        </Button>
      </div>

      {message ? (
        <p className={`type-body ${styles.hint}`} data-wide="" role="status">
          {duplicate ? message.slice("DUPLICATE:".length).trim() : message}
        </p>
      ) : null}
    </form>
  );
}

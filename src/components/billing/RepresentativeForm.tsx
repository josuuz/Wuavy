"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/Button";
import styles from "@/components/maintenance/Admin.module.css";
import type { Representative } from "@/lib/billing/representatives";

/*
  O cadastro de um representante: o mesmo formulário para criar e para
  editar. Ativar/desativar é uma ação própria (setRepresentativeStatus, na
  página), não um campo aqui — mesmo padrão de clientes/actions.ts (archive).
*/

type Save = (state: string | null, form: FormData) => Promise<string | null>;

interface RepresentativeFormProps {
  action: Save;
  submitLabel: string;
  representative?: Representative;
}

export function RepresentativeForm({ action, submitLabel, representative }: RepresentativeFormProps) {
  const [message, submit, pending] = useActionState(action, null);

  return (
    <form action={submit} className={styles.form}>
      {representative ? <input type="hidden" name="id" value={representative.id} /> : null}

      <label className={styles.field}>
        <span className="type-micro">Nome</span>
        <input name="name" className={styles.input} defaultValue={representative?.name ?? ""} maxLength={120} required />
      </label>

      <label className={styles.field}>
        <span className="type-micro">WhatsApp</span>
        <input name="whatsapp" className={styles.input} defaultValue={representative?.whatsapp ?? ""} placeholder="+55 19 99999-0000" />
      </label>

      <label className={styles.field} data-wide="">
        <span className="type-micro">Observações</span>
        <input name="notes" className={styles.input} defaultValue={representative?.notes ?? ""} maxLength={1000} />
      </label>

      <div data-wide="" className={styles.rowActions}>
        <Button type="submit" size="sm" disabled={pending} aria-busy={pending || undefined}>
          {pending ? "Salvando…" : submitLabel}
        </Button>
      </div>

      {message ? (
        <p className={`type-body ${styles.hint}`} data-wide="" role="status">
          {message}
        </p>
      ) : null}
    </form>
  );
}

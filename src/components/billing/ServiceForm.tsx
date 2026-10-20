"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/Button";
import styles from "@/components/maintenance/Admin.module.css";
import { reais } from "@/lib/billing/money";

/*
  O cadastro de um serviço do catálogo. O preço é só o padrão: uma cobrança
  futura pode usar outro valor (Etapa C), e mudar este número aqui nunca
  altera uma cobrança ou assinatura já criada.
*/

type Save = (state: string | null, form: FormData) => Promise<string | null>;

interface ServiceFormProps {
  action: Save;
  submitLabel: string;
  service?: {
    id: string;
    name: string;
    description: string | null;
    kind: "once" | "recurring";
    default_price_cents: number;
    active: boolean;
  };
}

export function ServiceForm({ action, submitLabel, service }: ServiceFormProps) {
  const [message, submit, pending] = useActionState(action, null);

  return (
    <form action={submit} className={styles.form}>
      {service ? <input type="hidden" name="id" value={service.id} /> : null}

      <label className={styles.field}>
        <span className="type-micro">Serviço</span>
        <input name="name" className={styles.input} defaultValue={service?.name ?? ""} maxLength={120} required />
      </label>

      <label className={styles.field}>
        <span className="type-micro">Tipo</span>
        <select name="kind" className={styles.input} defaultValue={service?.kind ?? "once"}>
          <option value="once">Pagamento único</option>
          <option value="recurring">Recorrente</option>
        </select>
      </label>

      <label className={styles.field}>
        <span className="type-micro">Preço padrão (R$)</span>
        <input name="price" className={styles.input} defaultValue={service ? reais(service.default_price_cents) : ""} inputMode="decimal" required />
      </label>

      <label className={styles.field} data-wide="">
        <span className="type-micro">Descrição</span>
        <input name="description" className={styles.input} defaultValue={service?.description ?? ""} maxLength={500} />
      </label>

      {service ? (
        <label className={styles.field}>
          <span className="type-micro">Status</span>
          <select name="active" className={styles.input} defaultValue={service.active ? "yes" : "no"}>
            <option value="yes">Ativo</option>
            <option value="no">Inativo</option>
          </select>
        </label>
      ) : null}

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

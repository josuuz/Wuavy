"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/Button";
import { DEFAULT_PRICE, brl, reais } from "@/lib/maintenance/plan";
import styles from "./Admin.module.css";

/*
  O cadastro de um cliente: o mesmo formulário para criar e para editar. O
  valor é o do plano padrão quando ninguém digita outro; o servidor lê o que
  foi digitado com parsePrice e nunca confia no formato.
*/

type Save = (state: string | null, form: FormData) => Promise<string | null>;

interface ClientFormProps {
  action: Save;
  submitLabel: string;
  /** Editando: os valores atuais, e o id que vai com o formulário. */
  client?: {
    id: string;
    name: string;
    site_url: string | null;
    email: string | null;
    whatsapp: string | null;
    notes: string | null;
    price_cents: number;
  };
  /** Avisa que trocar o valor só vale para a próxima assinatura. */
  liveSubscription?: boolean;
}

export function ClientForm({ action, submitLabel, client, liveSubscription = false }: ClientFormProps) {
  const [message, submit, pending] = useActionState(action, null);

  return (
    <form action={submit} className={styles.form}>
      {client ? <input type="hidden" name="id" value={client.id} /> : null}

      <label className={styles.field}>
        <span className="type-micro">Cliente</span>
        <input name="name" className={styles.input} defaultValue={client?.name ?? ""} maxLength={120} required />
      </label>

      <label className={styles.field}>
        <span className="type-micro">Site</span>
        <input name="site_url" className={styles.input} defaultValue={client?.site_url ?? ""} placeholder="exemplo.com.br" />
      </label>

      <label className={styles.field}>
        <span className="type-micro">E-mail da cobrança</span>
        <input type="email" name="email" className={styles.input} defaultValue={client?.email ?? ""} placeholder="voce@exemplo.com" />
      </label>

      <label className={styles.field}>
        <span className="type-micro">WhatsApp</span>
        <input name="whatsapp" className={styles.input} defaultValue={client?.whatsapp ?? ""} placeholder="+55 19 99999-0000" />
      </label>

      <label className={styles.field}>
        <span className="type-micro">Valor mensal (R$)</span>
        <input
          name="price"
          className={styles.input}
          defaultValue={client ? reais(client.price_cents) : ""}
          placeholder={reais(DEFAULT_PRICE)}
          inputMode="decimal"
        />
        <span className={`type-micro ${styles.hint}`}>Em branco: {brl(DEFAULT_PRICE)}, o plano padrão.</span>
      </label>

      <label className={styles.field} data-wide="">
        <span className="type-micro">Observações</span>
        <input name="notes" className={styles.input} defaultValue={client?.notes ?? ""} maxLength={1000} />
      </label>

      <div data-wide="" className={styles.rowActions}>
        <Button type="submit" size="sm" disabled={pending} aria-busy={pending || undefined}>
          {pending ? "Salvando…" : submitLabel}
        </Button>
        {liveSubscription ? (
          <span className={`type-micro ${styles.hint}`}>
            A assinatura em curso continua cobrando o valor autorizado. Para mudar o que é cobrado, cancele e envie o link de novo.
          </span>
        ) : null}
      </div>

      {message ? (
        <p className={`type-body ${styles.hint}`} data-wide="" role="status">
          {message}
        </p>
      ) : null}
    </form>
  );
}

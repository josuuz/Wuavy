"use client";

import { useActionState } from "react";

import { CopyLink } from "@/components/maintenance/CopyLink";
import { Button } from "@/components/ui/Button";
import styles from "@/components/maintenance/Admin.module.css";
import { brl } from "@/lib/billing/money";
import type { ChargeState } from "@/app/(care)/cobrancas/lancamentos/actions";

/*
  Nova cobrança: cliente, serviço (ou descrição personalizada) e valor.
  `chargeId` é gerado uma vez, no servidor, quando a página renderiza — o
  mesmo formulário carrega essa chave em todo envio, inclusive se o Mercado
  Pago não responder a tempo e o administrador clicar "Gerar cobrança" de
  novo: a Server Action (lancamentos/actions.ts) lê isso para nunca criar
  uma segunda Preference para a mesma tentativa.
*/

type Create = (state: ChargeState, form: FormData) => Promise<ChargeState>;

interface ChargeFormProps {
  action: Create;
  chargeId: string;
  clients: { id: string; name: string }[];
  services: { id: string; name: string; default_price_cents: number }[];
}

const waLink = (whatsapp: string | null, text: string) => {
  const digits = (whatsapp ?? "").replace(/\D/g, "");
  const to = digits ? (digits.length > 11 ? digits : `55${digits}`) : "";
  return `https://wa.me/${to}?text=${encodeURIComponent(text)}`;
};

export function ChargeForm({ action, chargeId, clients, services }: ChargeFormProps) {
  const [state, submit, pending] = useActionState(action, null);

  return (
    <form action={submit} className={styles.form}>
      <input type="hidden" name="charge_id" value={chargeId} />

      <label className={styles.field}>
        <span className="type-micro">Cliente</span>
        <select name="client_id" className={styles.input} defaultValue="" required>
          <option value="" disabled>
            Escolha um cliente…
          </option>
          {clients.map((client) => (
            <option key={client.id} value={client.id}>
              {client.name}
            </option>
          ))}
        </select>
      </label>

      <label className={styles.field}>
        <span className="type-micro">Serviço</span>
        <select name="service_id" className={styles.input} defaultValue="">
          <option value="">Descrição personalizada</option>
          {services.map((service) => (
            <option key={service.id} value={service.id}>
              {service.name} — {brl(service.default_price_cents)}
            </option>
          ))}
        </select>
      </label>

      <label className={styles.field} data-wide="">
        <span className="type-micro">Descrição (obrigatória sem um serviço)</span>
        <input name="description" className={styles.input} maxLength={200} placeholder="Ex.: Landing page da campanha de outubro" />
      </label>

      <label className={styles.field}>
        <span className="type-micro">Valor (R$)</span>
        <input name="price" className={styles.input} inputMode="decimal" placeholder="150,00" required />
      </label>

      <div data-wide="" className={styles.rowActions}>
        <Button type="submit" size="sm" disabled={pending} aria-busy={pending || undefined}>
          {pending ? "Gerando…" : "Gerar cobrança"}
        </Button>
      </div>

      {state && !state.ok ? (
        <p className={`type-body ${styles.hint}`} data-wide="" role="status">
          {state.error}
        </p>
      ) : null}

      {state?.ok ? (
        <div className={styles.notice} data-wide="" role="status">
          <p className="type-chapter">
            {state.description} — {brl(state.amountCents)}
          </p>
          <CopyLink url={state.url} />
          <div className={styles.rowActions}>
            <a
              href={waLink(state.clientWhatsapp, `Olá! Segue o link para pagamento — ${state.description} (${brl(state.amountCents)}):\n${state.url}`)}
              target="_blank"
              rel="noopener"
              className={styles.ghost}
            >
              Compartilhar no WhatsApp
            </a>
          </div>
        </div>
      ) : null}
    </form>
  );
}

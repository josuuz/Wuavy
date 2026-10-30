"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/Button";
import styles from "@/components/maintenance/Admin.module.css";
import { reais } from "@/lib/billing/money";
import type { Coupon } from "@/lib/billing/coupons";
import type { DiscountType } from "@/lib/billing/coupon-rules";

/*
  O cadastro de um cupom: código, desconto (percentual ou fixo — só um dos
  dois campos vai, dependendo do tipo escolhido), validade, limite de uso e
  os serviços elegíveis (nenhum marcado = vale para todos). Ativar/desativar
  é uma ação própria (setCouponStatus, na página), não um campo aqui.
*/

type Save = (state: string | null, form: FormData) => Promise<string | null>;

interface CouponFormProps {
  action: Save;
  submitLabel: string;
  services: { id: string; name: string }[];
  coupon?: Coupon;
  selectedServiceIds?: string[];
  /** Só para cadastrar um cupom novo: a Server Action (addCoupon) lê isto do formulário, não de um argumento ligado — um cupom existente já sabe o seu representante e não precisa disto. */
  representativeId?: string;
}

// "YYYY-MM-DD" no fuso de São Paulo, não em UTC — valid_until guarda o
// último instante do dia (23:59:59.999-03:00, que já é o dia seguinte em
// UTC); um .slice(0, 10) ingênuo mostraria esse dia seguinte de volta.
const spDateFormat = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" });
const dateValue = (iso: string | null | undefined) => (iso ? spDateFormat.format(new Date(iso)) : "");

export function CouponForm({ action, submitLabel, services, coupon, selectedServiceIds, representativeId }: CouponFormProps) {
  const [message, submit, pending] = useActionState(action, null);
  const [discountType, setDiscountType] = useState<DiscountType>(coupon?.discount_type ?? "percent");
  const selected = new Set(selectedServiceIds ?? []);

  return (
    <form action={submit} className={styles.form}>
      {coupon ? <input type="hidden" name="id" value={coupon.id} /> : null}
      {!coupon && representativeId ? <input type="hidden" name="representative_id" value={representativeId} /> : null}

      <label className={styles.field}>
        <span className="type-micro">Código</span>
        <input name="code" className={styles.input} defaultValue={coupon?.code ?? ""} maxLength={20} placeholder="BRU10" required />
      </label>

      <label className={styles.field}>
        <span className="type-micro">Tipo de desconto</span>
        <select
          name="discount_type"
          className={styles.input}
          value={discountType}
          onChange={(event) => setDiscountType(event.target.value as DiscountType)}
        >
          <option value="percent">Percentual</option>
          <option value="fixed">Valor fixo</option>
        </select>
      </label>

      {discountType === "percent" ? (
        <label className={styles.field}>
          <span className="type-micro">Desconto (%)</span>
          <input
            name="discount_percent"
            className={styles.input}
            type="number"
            min={1}
            max={100}
            defaultValue={coupon?.discount_percent ?? ""}
            required
          />
        </label>
      ) : (
        <label className={styles.field}>
          <span className="type-micro">Desconto (R$)</span>
          <input
            name="discount_fixed_cents"
            className={styles.input}
            defaultValue={coupon?.discount_fixed_cents ? reais(coupon.discount_fixed_cents) : ""}
            inputMode="decimal"
            placeholder="40,00"
            required
          />
        </label>
      )}

      <label className={styles.field}>
        <span className="type-micro">Válido a partir de</span>
        <input type="date" name="valid_from" className={styles.input} defaultValue={dateValue(coupon?.valid_from) || undefined} />
      </label>

      <label className={styles.field}>
        <span className="type-micro">Válido até (vazio = sem vencimento)</span>
        <input type="date" name="valid_until" className={styles.input} defaultValue={dateValue(coupon?.valid_until)} />
      </label>

      <label className={styles.field}>
        <span className="type-micro">Limite de utilizações (vazio = ilimitado)</span>
        <input type="number" min={1} name="max_uses" className={styles.input} defaultValue={coupon?.max_uses ?? ""} />
      </label>

      <label className={styles.field}>
        <input type="checkbox" name="first_payment_only" defaultChecked={coupon ? coupon.first_payment_only : true} />
        <span className="type-micro"> Só no primeiro pagamento</span>
      </label>

      <fieldset className={styles.field} data-wide="">
        <legend className="type-micro">Serviços elegíveis (nenhum marcado = todos)</legend>
        {services.map((service) => (
          <label key={service.id} className={styles.field}>
            <input type="checkbox" name="service_ids" value={service.id} defaultChecked={selected.has(service.id)} />
            <span className="type-micro"> {service.name}</span>
          </label>
        ))}
      </fieldset>

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

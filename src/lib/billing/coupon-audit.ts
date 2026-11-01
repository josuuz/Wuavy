import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/*
  A auditoria de mudanças em representantes e cupons (Wuavy Cobranças),
  migration 0022. Só o cadastro: criar, editar, ativar, desativar — o uso de
  um cupom já fica registrado para sempre na própria billing_charges
  (coupon_id, discount_cents), então duplicar isso aqui seria o mesmo dado em
  dois lugares.
*/

export type CouponAuditAction =
  | "create_representative"
  | "update_representative"
  | "activate_representative"
  | "deactivate_representative"
  | "create_coupon"
  | "update_coupon"
  | "activate_coupon"
  | "deactivate_coupon";

/**
 * Grava uma linha de auditoria. Nunca lança: uma falha aqui é só registrada
 * (console.warn, mesmo padrão de writePayments em lib/maintenance/billing.ts)
 * e nunca trava a escrita de representante/cupom que a chamou.
 */
export async function recordCouponAudit(input: {
  adminEmail: string;
  representativeId?: string | null;
  couponId?: string | null;
  action: CouponAuditAction;
  detail: string;
}): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.from("billing_coupon_audit").insert({
    admin_email: input.adminEmail,
    representative_id: input.representativeId ?? null,
    coupon_id: input.couponId ?? null,
    action: input.action,
    detail: input.detail,
  });
  if (error) console.warn("cobranças: auditoria de cupom", error.message);
}

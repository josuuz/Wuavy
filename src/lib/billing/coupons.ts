import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { recordCouponAudit } from "./coupon-audit";
import { getRepresentative, type Representative } from "./representatives";
import { normalizeCode, type CouponRow, type DiscountType, type RepresentativeChargeRow } from "./coupon-rules";
import type { ChargeBucket } from "./charge-status";

/*
  Os cupons do Wuavy Cobranças, migration 0022. O código é sempre comparado
  em caixa alta (normalizeCode, coupon-rules.ts) — escrito e lido do mesmo
  jeito. Criar ou reativar um cupom sob um representante desativado é
  recusado: mantém sempre verdadeiro "cupom ativo ⇒ representante ativo" por
  construção. Mas a escrita em cascata que desativa os cupons de um
  representante (representatives.ts) pode falhar depois de desativar o
  representante — por isso resolveCoupon (coupon-rules.ts) também confere
  representative.active, que lookupCouponByCode já carrega de graça, em vez
  de confiar só no invariante.
*/

const COUPON = "id, representative_id, code, discount_type, discount_percent, discount_fixed_cents, first_payment_only, valid_from, valid_until, max_uses, active, created_at, updated_at";

export interface Coupon extends CouponRow {
  representative_id: string;
  code: string;
  first_payment_only: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Os ids dos serviços elegíveis de um cupom — vazio significa "todos". Usado
 * pelo lookup (addCharge) e pela página de edição. Lança em erro de leitura,
 * nunca devolve `[]` por engano: no lookup, `[]` significa "vale para
 * qualquer serviço" — exatamente o oposto de "não consegui confirmar a
 * restrição".
 */
export async function eligibleServiceIdsFor(couponId: string): Promise<string[]> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("billing_coupon_services").select("service_id").eq("coupon_id", couponId);
  if (error) throw error;
  return (data ?? []).map((row) => row.service_id);
}

/**
 * Substitui a elegibilidade de um cupom inteira. Insere antes de apagar: se
 * o insert falhar (um service_id que não existe mais, por exemplo), as
 * linhas antigas continuam lá — nunca um cupom restrito fica sem restrição
 * nenhuma por uma escrita que não terminou. `false` quando qualquer um dos
 * dois passos falhar; quem chama não deve reportar "salvo" nesse caso.
 */
async function replaceEligibleServices(couponId: string, serviceIds: string[]): Promise<boolean> {
  const admin = createAdminClient();
  if (serviceIds.length) {
    const { error } = await admin
      .from("billing_coupon_services")
      .upsert(serviceIds.map((serviceId) => ({ coupon_id: couponId, service_id: serviceId })));
    if (error) {
      console.error("cobranças: salvar elegibilidade do cupom", error);
      return false;
    }
  }
  const deleteQuery = admin.from("billing_coupon_services").delete().eq("coupon_id", couponId);
  const { error } = serviceIds.length ? await deleteQuery.not("service_id", "in", `(${serviceIds.join(",")})`) : await deleteQuery;
  if (error) {
    console.error("cobranças: limpar elegibilidade do cupom", error);
    return false;
  }
  return true;
}

/** Os cupons de um representante, do mais novo ao mais antigo. */
export async function listCouponsByRepresentative(representativeId: string): Promise<Coupon[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("billing_coupons")
    .select(COUPON)
    .eq("representative_id", representativeId)
    .order("created_at", { ascending: false });
  return (data ?? []) as Coupon[];
}

export interface CouponInput {
  code: string;
  discount_type: DiscountType;
  discount_percent: number | null;
  discount_fixed_cents: number | null;
  first_payment_only: boolean;
  valid_from: string;
  valid_until: string | null;
  max_uses: number | null;
  serviceIds: string[];
}

export type SaveCouponResult = { outcome: "saved"; coupon: Coupon } | { outcome: "error"; message: string };

const UNABLE_TO_SAVE = { outcome: "error" as const, message: "Não foi possível salvar." };
const DUPLICATE_CODE = { outcome: "error" as const, message: "Já existe um cupom com esse código." };
const REPRESENTATIVE_INACTIVE = { outcome: "error" as const, message: "Representante está desativado — reative o representante primeiro." };

/** Um cupom novo, sob um representante que precisa estar ativo. */
export async function createCoupon(adminEmail: string, representativeId: string, input: CouponInput): Promise<SaveCouponResult> {
  const representative = await getRepresentative(representativeId);
  if (!representative || !representative.active) return REPRESENTATIVE_INACTIVE;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("billing_coupons")
    .insert({
      representative_id: representativeId,
      code: normalizeCode(input.code),
      discount_type: input.discount_type,
      discount_percent: input.discount_percent,
      discount_fixed_cents: input.discount_fixed_cents,
      first_payment_only: input.first_payment_only,
      valid_from: input.valid_from,
      valid_until: input.valid_until,
      max_uses: input.max_uses,
    })
    .select(COUPON)
    .single();
  if (error || !data) {
    if (error?.code === "23505") return DUPLICATE_CODE;
    console.error("cobranças: criar cupom", error);
    return UNABLE_TO_SAVE;
  }

  const coupon = data as Coupon;
  if (!(await replaceEligibleServices(coupon.id, input.serviceIds))) return UNABLE_TO_SAVE;
  await recordCouponAudit({
    adminEmail,
    representativeId,
    couponId: coupon.id,
    action: "create_coupon",
    detail: `Cupom "${coupon.code}" cadastrado para ${representative.name}.`,
  });
  return { outcome: "saved", coupon };
}

/** O cadastro de um cupom existente — nunca muda quem é o representante, nem o `active`. */
export async function updateCoupon(adminEmail: string, id: string, input: CouponInput): Promise<SaveCouponResult> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("billing_coupons")
    .update({
      code: normalizeCode(input.code),
      discount_type: input.discount_type,
      discount_percent: input.discount_percent,
      discount_fixed_cents: input.discount_fixed_cents,
      first_payment_only: input.first_payment_only,
      valid_from: input.valid_from,
      valid_until: input.valid_until,
      max_uses: input.max_uses,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select(COUPON)
    .single();
  if (error || !data) {
    if (error?.code === "23505") return DUPLICATE_CODE;
    console.error("cobranças: salvar cupom", error);
    return UNABLE_TO_SAVE;
  }

  const coupon = data as Coupon;
  if (!(await replaceEligibleServices(coupon.id, input.serviceIds))) return UNABLE_TO_SAVE;
  await recordCouponAudit({
    adminEmail,
    representativeId: coupon.representative_id,
    couponId: coupon.id,
    action: "update_coupon",
    detail: `Cupom "${coupon.code}" editado.`,
  });
  return { outcome: "saved", coupon };
}

/**
 * Ativa ou desativa um cupom. Reativar exige que o representante dele esteja
 * ativo — mantém "cupom ativo ⇒ representante ativo" sempre verdadeiro.
 */
export async function setCouponActive(adminEmail: string, id: string, active: boolean): Promise<{ outcome: "updated" } | { outcome: "error"; message: string }> {
  const admin = createAdminClient();
  const { data: existing } = await admin.from("billing_coupons").select("representative_id, code").eq("id", id).maybeSingle();
  if (!existing) return UNABLE_TO_SAVE;

  if (active) {
    const representative = await getRepresentative(existing.representative_id);
    if (!representative || !representative.active) return REPRESENTATIVE_INACTIVE;
  }

  const { error } = await admin.from("billing_coupons").update({ active, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) {
    console.error("cobranças: ativar/desativar cupom", error);
    return UNABLE_TO_SAVE;
  }

  await recordCouponAudit({
    adminEmail,
    representativeId: existing.representative_id,
    couponId: id,
    action: active ? "activate_coupon" : "deactivate_coupon",
    detail: `Cupom "${existing.code}" ${active ? "reativado" : "desativado"}.`,
  });
  return { outcome: "updated" };
}

export interface CouponLookup {
  coupon: Coupon;
  representative: Representative;
  eligibleServiceIds: string[];
}

/**
 * Um cupom pelo código (qualquer caixa), com o representante e os serviços
 * elegíveis. `null` quando o cupom não existe (ou o seu representante, o que
 * nunca deveria acontecer pela FK). Lança em erro de leitura — addCharge
 * trata isso como "não consegui verificar", nunca como "não existe".
 */
export async function lookupCouponByCode(code: string): Promise<CouponLookup | null> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("billing_coupons").select(COUPON).eq("code", normalizeCode(code)).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const coupon = data as Coupon;

  const representative = await getRepresentative(coupon.representative_id);
  if (!representative) return null;

  const eligibleServiceIds = await eligibleServiceIdsFor(coupon.id);
  return { coupon, representative, eligibleServiceIds };
}

/**
 * O histórico de status de uma cobrança, para effectiveUses (coupon-rules.ts).
 * Lança em erro de leitura — uma lista vazia aqui significa "nenhum uso",
 * que é exatamente o que destravaria um cupom no limite por engano.
 */
export async function couponChargeHistory(couponId: string): Promise<{ status: ChargeBucket; created_at: string }[]> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("billing_charges").select("status, created_at").eq("coupon_id", couponId);
  if (error) throw error;
  return (data ?? []) as { status: ChargeBucket; created_at: string }[];
}

/** As cobranças de todos os cupons de um representante, para representativeStats (coupon-rules.ts). */
export async function chargesForRepresentative(representativeId: string): Promise<RepresentativeChargeRow[]> {
  const admin = createAdminClient();
  const { data: coupons } = await admin.from("billing_coupons").select("id").eq("representative_id", representativeId);
  const couponIds = (coupons ?? []).map((row) => row.id);
  if (!couponIds.length) return [];

  const { data } = await admin.from("billing_charges").select("client_id, status, amount_cents, discount_cents").in("coupon_id", couponIds);
  return (data ?? []) as RepresentativeChargeRow[];
}

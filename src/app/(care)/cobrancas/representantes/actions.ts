"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createCoupon, setCouponActive, updateCoupon, type CouponInput } from "@/lib/billing/coupons";
import { endOfDaySaoPaulo, startOfDaySaoPaulo } from "@/lib/billing/coupon-rules";
import { parsePrice } from "@/lib/billing/money";
import { createRepresentative, setRepresentativeActive, updateRepresentative } from "@/lib/billing/representatives";
import { getAdmin } from "@/lib/maintenance/admin";

/*
  As escritas de Representantes e Cupons (Wuavy Cobranças). Mesmo padrão de
  clientes/actions.ts e servicos/actions.ts: cada Server Action verifica o
  administrador sozinha, e devolve o e-mail dele para a auditoria
  (recordCouponAudit, chamado de dentro de representatives.ts/coupons.ts).
*/

const PANEL = "/cobrancas/representantes";

async function guard() {
  const admin = await getAdmin();
  if (!admin) redirect(PANEL);
  return admin;
}

const text = (form: FormData, key: string, max = 400) => {
  const value = form.get(key);
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed ? trimmed.slice(0, max) : null;
};

const uuid = (form: FormData, key: string) => {
  const value = text(form, key, 36);
  return value && /^[0-9a-f-]{36}$/i.test(value) ? value : null;
};

function representativeInput(form: FormData) {
  return {
    name: text(form, "name", 120) ?? "",
    whatsapp: text(form, "whatsapp", 40),
    notes: text(form, "notes", 1000),
  };
}

/** Um representante novo. */
export async function addRepresentative(_state: string | null, form: FormData): Promise<string | null> {
  const admin = await guard();
  const input = representativeInput(form);
  if (!input.name) return "O representante precisa de um nome.";

  const result = await createRepresentative(admin.email, input);
  if (result.outcome === "error") return result.message;

  revalidatePath(PANEL);
  return null;
}

/** O cadastro de um representante existente. */
export async function saveRepresentative(_state: string | null, form: FormData): Promise<string | null> {
  const admin = await guard();
  const id = uuid(form, "id");
  const input = representativeInput(form);
  if (!id) return "Representante não encontrado.";
  if (!input.name) return "O representante precisa de um nome.";

  const result = await updateRepresentative(admin.email, id, input);
  if (result.outcome === "error") return result.message;

  revalidatePath(PANEL);
  return null;
}

/** Ativa ou desativa um representante — desativar desativa os cupons dele junto. */
export async function setRepresentativeStatus(form: FormData): Promise<void> {
  const admin = await guard();
  const id = uuid(form, "id");
  if (!id) return;
  await setRepresentativeActive(admin.email, id, form.get("active") === "yes");
  revalidatePath(PANEL);
}

/**
 * Os campos de um cupom, lidos e validados do formulário. `null` quando algo
 * essencial não bate — quem chama devolve a mensagem genérica de erro.
 */
function couponInput(form: FormData): CouponInput | null {
  const code = text(form, "code", 20);
  if (!code) return null;

  const discountTypeRaw = form.get("discount_type");
  const discountType = discountTypeRaw === "percent" || discountTypeRaw === "fixed" ? discountTypeRaw : null;
  if (!discountType) return null;

  let discountPercent: number | null = null;
  let discountFixedCents: number | null = null;
  if (discountType === "percent") {
    const raw = text(form, "discount_percent", 3);
    const value = raw ? Number(raw) : NaN;
    if (!Number.isInteger(value) || value < 1 || value > 100) return null;
    discountPercent = value;
  } else {
    discountFixedCents = parsePrice(text(form, "discount_fixed_cents", 20) ?? "");
    if (discountFixedCents === null) return null;
  }

  const maxUsesRaw = text(form, "max_uses", 10);
  const maxUses = maxUsesRaw ? Number(maxUsesRaw) : null;
  if (maxUses !== null && (!Number.isInteger(maxUses) || maxUses < 1)) return null;

  const serviceIds = form.getAll("service_ids").filter((value): value is string => typeof value === "string" && /^[0-9a-f-]{36}$/i.test(value));

  // As datas do formulário são "YYYY-MM-DD" no fuso de São Paulo — o dia que
  // a administradora escolheu, não meia-noite UTC do mesmo texto (que
  // terminaria o cupom quase um dia antes do que ela pediu).
  const validFromDate = text(form, "valid_from", 10);
  const validUntilDate = text(form, "valid_until", 10);

  return {
    code,
    discount_type: discountType,
    discount_percent: discountPercent,
    discount_fixed_cents: discountFixedCents,
    first_payment_only: form.get("first_payment_only") === "on",
    valid_from: validFromDate ? startOfDaySaoPaulo(validFromDate) : new Date().toISOString(),
    valid_until: validUntilDate ? endOfDaySaoPaulo(validUntilDate) : null,
    max_uses: maxUses,
    serviceIds,
  };
}

/** Um cupom novo, sob o representante indicado no formulário. */
export async function addCoupon(_state: string | null, form: FormData): Promise<string | null> {
  const admin = await guard();
  const representativeId = uuid(form, "representative_id");
  if (!representativeId) return "Representante não encontrado.";

  const input = couponInput(form);
  if (!input) return "Confira o código e o desconto informado.";

  const result = await createCoupon(admin.email, representativeId, input);
  if (result.outcome === "error") return result.message;

  revalidatePath(PANEL);
  return null;
}

/** O cadastro de um cupom existente. */
export async function saveCoupon(_state: string | null, form: FormData): Promise<string | null> {
  const admin = await guard();
  const id = uuid(form, "id");
  if (!id) return "Cupom não encontrado.";

  const input = couponInput(form);
  if (!input) return "Confira o código e o desconto informado.";

  const result = await updateCoupon(admin.email, id, input);
  if (result.outcome === "error") return result.message;

  revalidatePath(PANEL);
  return null;
}

/** Ativa ou desativa um cupom — reativar exige um representante ativo. */
export async function setCouponStatus(form: FormData): Promise<void> {
  const admin = await guard();
  const id = uuid(form, "id");
  if (!id) return;
  await setCouponActive(admin.email, id, form.get("active") === "yes");
  revalidatePath(PANEL);
}

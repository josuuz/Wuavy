import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { recordCouponAudit } from "./coupon-audit";

/*
  Os representantes do Wuavy Cobranças, migration 0022. Sem login, sem
  comissão: só o cadastro que os cupons (coupons.ts) se ligam a. Mesmo padrão
  de leitura de clients.ts — RLS ligado sem política, então só a service role
  chega aqui, depois de getAdmin().
*/

const REPRESENTATIVE = "id, name, whatsapp, notes, active, created_at";

export interface Representative {
  id: string;
  name: string;
  whatsapp: string | null;
  notes: string | null;
  active: boolean;
  created_at: string;
}

/** Todos os representantes, do mais novo ao mais antigo. */
export async function listRepresentatives(): Promise<Representative[]> {
  const admin = createAdminClient();
  const { data } = await admin.from("billing_representatives").select(REPRESENTATIVE).order("created_at", { ascending: false });
  return (data ?? []) as Representative[];
}

/** Um representante pelo id, ou null. */
export async function getRepresentative(id: string): Promise<Representative | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const admin = createAdminClient();
  const { data } = await admin.from("billing_representatives").select(REPRESENTATIVE).eq("id", id).maybeSingle();
  return (data as Representative | null) ?? null;
}

export interface RepresentativeInput {
  name: string;
  whatsapp: string | null;
  notes: string | null;
}

export type SaveRepresentativeResult = { outcome: "saved"; representative: Representative } | { outcome: "error"; message: string };

/** Um representante novo. */
export async function createRepresentative(adminEmail: string, input: RepresentativeInput): Promise<SaveRepresentativeResult> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("billing_representatives").insert(input).select(REPRESENTATIVE).single();
  if (error || !data) {
    console.error("cobranças: criar representante", error);
    return { outcome: "error", message: "Não foi possível salvar." };
  }
  const representative = data as Representative;
  await recordCouponAudit({
    adminEmail,
    representativeId: representative.id,
    action: "create_representative",
    detail: `Representante "${representative.name}" cadastrado.`,
  });
  return { outcome: "saved", representative };
}

/** O cadastro de um representante existente. */
export async function updateRepresentative(adminEmail: string, id: string, input: RepresentativeInput): Promise<SaveRepresentativeResult> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("billing_representatives").update(input).eq("id", id).select(REPRESENTATIVE).single();
  if (error || !data) {
    console.error("cobranças: salvar representante", error);
    return { outcome: "error", message: "Não foi possível salvar." };
  }
  const representative = data as Representative;
  await recordCouponAudit({
    adminEmail,
    representativeId: representative.id,
    action: "update_representative",
    detail: `Representante "${representative.name}" editado.`,
  });
  return { outcome: "saved", representative };
}

/**
 * Ativa ou desativa um representante. Desativar desativa os cupons dele
 * junto (um UPDATE de verdade, não uma condição calculada na hora).
 * Reativar o representante nunca reativa um cupom de volta: cada um só
 * volta a valer se a administradora reativar aquele cupom especificamente.
 */
export async function setRepresentativeActive(
  adminEmail: string,
  id: string,
  active: boolean,
): Promise<{ outcome: "updated" } | { outcome: "error"; message: string }> {
  const admin = createAdminClient();

  // Desativar: os cupons primeiro, o representante por último — o sentido
  // seguro de falhar. Se a desativação dos cupons der erro, o representante
  // nunca chega a ficar desativado com um cupom ainda ativo por trás; a
  // administradora vê o erro e tenta de novo, em vez de um estado
  // inconsistente silencioso.
  let deactivatedCouponIds: string[] = [];
  if (!active) {
    const { data, error } = await admin
      .from("billing_coupons")
      .update({ active: false })
      .eq("representative_id", id)
      .eq("active", true)
      .select("id");
    if (error) {
      console.error("cobranças: desativar cupons do representante", error);
      return { outcome: "error", message: "Não foi possível salvar." };
    }
    deactivatedCouponIds = (data ?? []).map((row) => row.id);
  }

  const { error } = await admin.from("billing_representatives").update({ active }).eq("id", id);
  if (error) {
    console.error("cobranças: ativar/desativar representante", error);
    return { outcome: "error", message: "Não foi possível salvar." };
  }

  if (!active) {
    await recordCouponAudit({ adminEmail, representativeId: id, action: "deactivate_representative", detail: "Representante desativado." });
    for (const couponId of deactivatedCouponIds) {
      await recordCouponAudit({
        adminEmail,
        representativeId: id,
        couponId,
        action: "deactivate_coupon",
        detail: "Cupom desativado automaticamente: o representante foi desativado.",
      });
    }
  } else {
    await recordCouponAudit({ adminEmail, representativeId: id, action: "activate_representative", detail: "Representante reativado." });
  }

  return { outcome: "updated" };
}

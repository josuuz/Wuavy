"use server";

import { redirect } from "next/navigation";

// Genérico — Supabase Auth + WUAVY_ADMIN_EMAILS — não é específico da manutenção,
// só mora lá por ter sido o primeiro painel a precisar dele.
import { getAdmin } from "@/lib/maintenance/admin";
import { syncSubscription } from "@/lib/flow/billing";
import { createAdminClient } from "@/lib/supabase/admin";

const PANEL = "/pulse/admin";

/** Quem pode gravar, ou nada acontece. */
async function guard() {
  const admin = await getAdmin();
  if (!admin) redirect(PANEL);
  return createAdminClient();
}

const uuid = (form: FormData, key: string) => {
  const value = form.get(key);
  return typeof value === "string" && /^[0-9a-f-]{36}$/i.test(value.trim()) ? value.trim() : null;
};

/**
 * Reler do Mercado Pago agora e gravar o resultado na linha — o mesmo
 * caminho (syncSubscription/syncStanding) que o webhook e o checkout já
 * usam. Nunca cria, cancela ou cobra: só regrava o status/período reais.
 */
export async function reconcile(form: FormData) {
  const db = await guard();
  const id = uuid(form, "id");
  if (!id) return;
  const { data: row } = await db.from("subscriptions").select("provider_subscription_id").eq("id", id).maybeSingle();
  if (row?.provider_subscription_id) {
    try {
      await syncSubscription(row.provider_subscription_id);
    } catch (error) {
      console.error("pulse admin: reconciliar", id, error);
    }
  }
  redirect(`${PANEL}?id=${id}`);
}

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getAdmin, isAdminEmail } from "@/lib/maintenance/admin";
import { cancelSubscription, newToken, syncSubscription } from "@/lib/maintenance/billing";
import { clientById } from "@/lib/maintenance/data";
import { DEFAULT_PRICE, parsePrice } from "@/lib/maintenance/plan";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/*
  As escritas do painel. Toda uma delas começa em getAdmin(): um Server
  Action é alcançável por um POST direto, não só pelo botão da página, então
  quem pode é verificado aqui dentro, em cada uma, e não na página que as
  mostra.

  O valor de um cliente é lido com parsePrice (R$ 40 é o padrão) e nunca vai
  para o banco como texto. O token de um cliente é sorteado no servidor.
*/

const PANEL = "/manutencao/admin";

/** Quem pode escrever, ou nada acontece. */
async function guard() {
  const admin = await getAdmin();
  if (!admin) redirect(PANEL);
  return createAdminClient();
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

/** O site de um cliente, com esquema: um domínio digitado sem http vira https. */
function siteUrl(value: string | null) {
  if (!value) return null;
  const withScheme = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  try {
    return new URL(withScheme).toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

/* ── A porta ────────────────────────────────────────────────── */

/**
 * Entrar no painel: a conta do Supabase que já existe, e o e-mail tem de
 * estar em WUAVY_ADMIN_EMAILS. A mensagem de erro é sempre a mesma, para não
 * contar quem está na lista nem qual e-mail tem conta.
 */
export async function enter(_state: string | null, form: FormData): Promise<string | null> {
  const email = text(form, "email", 200);
  const password = form.get("password");
  if (!email || typeof password !== "string" || !password) return "Informe e-mail e senha.";

  // Fora da lista: nem chega a tentar a senha.
  if (!isAdminEmail(email)) return "E-mail ou senha incorretos.";

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return "E-mail ou senha incorretos.";

  revalidatePath(PANEL);
  redirect(PANEL);
}

export async function leave() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath(PANEL);
  redirect(PANEL);
}

/* ── Clientes ───────────────────────────────────────────────── */

/** Um cliente novo, com o seu link individual. Sem valor digitado, R$ 40. */
export async function addClient(_state: string | null, form: FormData): Promise<string | null> {
  const db = await guard();
  const name = text(form, "name", 120);
  if (!name) return "O cliente precisa de um nome.";

  const typed = text(form, "price", 20);
  const price = typed ? parsePrice(typed) : DEFAULT_PRICE;
  if (price === null) return "Valor inválido. Use algo como 40 ou 149,90.";

  const { error } = await db.from("maintenance_clients").insert({
    name,
    site_url: siteUrl(text(form, "site_url", 300)),
    email: text(form, "email", 200),
    whatsapp: text(form, "whatsapp", 40),
    notes: text(form, "notes", 1000),
    price_cents: price,
    token: newToken(),
  });
  if (error) {
    console.error("manutenção: criar cliente", error);
    return "Não foi possível salvar este cliente.";
  }

  revalidatePath(PANEL);
  return null;
}

/**
 * O cadastro de um cliente. Mudar o valor vale para a próxima assinatura: o
 * que uma assinatura viva cobra está no Mercado Pago, e lá um valor não se
 * troca no meio — o painel diz isso e oferece cancelar e reenviar o link.
 */
export async function saveClient(_state: string | null, form: FormData): Promise<string | null> {
  const db = await guard();
  const id = uuid(form, "id");
  const name = text(form, "name", 120);
  if (!id || !name) return "Cliente não encontrado.";

  const typed = text(form, "price", 20);
  const price = typed ? parsePrice(typed) : null;
  if (typed && price === null) return "Valor inválido. Use algo como 40 ou 149,90.";

  const { error } = await db
    .from("maintenance_clients")
    .update({
      name,
      site_url: siteUrl(text(form, "site_url", 300)),
      email: text(form, "email", 200),
      whatsapp: text(form, "whatsapp", 40),
      notes: text(form, "notes", 1000),
      ...(price === null ? {} : { price_cents: price }),
    })
    .eq("id", id);
  if (error) {
    console.error("manutenção: salvar cliente", error);
    return "Não foi possível salvar.";
  }

  revalidatePath(PANEL);
  revalidatePath(`${PANEL}/${id}`);
  return null;
}

/** Arquivar um cliente fecha o link dele. Nenhuma linha é apagada. */
export async function archive(form: FormData) {
  const db = await guard();
  const id = uuid(form, "id");
  if (!id) return;
  const on = form.get("archived") === "yes";
  await db
    .from("maintenance_clients")
    .update({ archived_at: on ? new Date().toISOString() : null })
    .eq("id", id);
  revalidatePath(PANEL);
  revalidatePath(`${PANEL}/${id}`);
}

/** Sortear um link novo: o anterior deixa de abrir na mesma hora. */
export async function renewLink(form: FormData) {
  const db = await guard();
  const id = uuid(form, "id");
  if (!id) return;
  await db.from("maintenance_clients").update({ token: newToken() }).eq("id", id);
  revalidatePath(PANEL);
  revalidatePath(`${PANEL}/${id}`);
}

/* ── Assinaturas ────────────────────────────────────────────── */

/** Cancelar a cobrança no Mercado Pago. O estado volta de lá, não daqui. */
export async function cancel(form: FormData) {
  await guard();
  const id = uuid(form, "client");
  const providerId = text(form, "provider", 64);
  if (!id || !providerId) return;
  try {
    await cancelSubscription(providerId);
  } catch (error) {
    console.error("manutenção: cancelar", error);
  }
  revalidatePath(PANEL);
  revalidatePath(`${PANEL}/${id}`);
}

/** Reler do Mercado Pago agora, sem esperar o próximo aviso. */
export async function resync(form: FormData) {
  await guard();
  const id = uuid(form, "client");
  if (!id) return;
  const found = await clientById(id);
  if (found?.subscription?.provider_subscription_id) {
    try {
      await syncSubscription(found.subscription.provider_subscription_id);
    } catch (error) {
      console.error("manutenção: reler", error);
    }
  }
  revalidatePath(PANEL);
  revalidatePath(`${PANEL}/${id}`);
}

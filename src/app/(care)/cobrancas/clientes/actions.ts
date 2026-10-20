"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { archiveClient, createClient, linkMaintenance, updateClient, type ClientInput } from "@/lib/billing/clients";
import { getAdmin, isAdminEmail } from "@/lib/maintenance/admin";
import { createClient as createSupabaseClient } from "@/lib/supabase/server";

/*
  As escritas de Clientes (Wuavy Cobranças). Mesmo padrão de
  maintenance/admin/actions.ts: cada Server Action verifica o administrador
  sozinha, porque é alcançável por um POST direto, não só pelo botão da
  página. enter/leave são a mesma porta da manutenção (WUAVY_ADMIN_EMAILS,
  a conta do Supabase que já existe) — Serviços reaproveita estes dois, só
  Clientes precisa de escritas próprias.
*/

const PANEL = "/cobrancas/clientes";

async function guard() {
  const admin = await getAdmin();
  if (!admin) redirect(PANEL);
}

export async function enter(_state: string | null, form: FormData): Promise<string | null> {
  const email = text(form, "email", 200);
  const password = form.get("password");
  if (!email || typeof password !== "string" || !password) return "Informe e-mail e senha.";
  if (!isAdminEmail(email)) return "E-mail ou senha incorretos.";

  const supabase = await createSupabaseClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return "E-mail ou senha incorretos.";

  revalidatePath(PANEL);
  redirect(PANEL);
}

export async function leave() {
  const supabase = await createSupabaseClient();
  await supabase.auth.signOut();
  revalidatePath(PANEL);
  redirect(PANEL);
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

function clientInput(form: FormData): ClientInput {
  return {
    name: text(form, "name", 160) ?? "",
    email: text(form, "email", 200),
    whatsapp: text(form, "whatsapp", 40),
    notes: text(form, "notes", 1000),
  };
}

/** Um cliente novo. "DUPLICATE:" no início da mensagem é o sinal que ClientForm lê para oferecer "salvar assim mesmo". */
export async function addClient(_state: string | null, form: FormData): Promise<string | null> {
  await guard();
  const input = clientInput(form);
  if (!input.name) return "O cliente precisa de um nome.";

  const result = await createClient(input, form.get("force") === "1");
  if (result.outcome === "duplicate") {
    return `DUPLICATE: Já existe um cliente aberto com o mesmo e-mail ou WhatsApp: "${result.duplicate.name}".`;
  }
  if (result.outcome === "error") return result.message;

  revalidatePath(PANEL);
  return null;
}

/** O cadastro de um cliente existente. */
export async function saveClient(_state: string | null, form: FormData): Promise<string | null> {
  await guard();
  const id = uuid(form, "id");
  const input = clientInput(form);
  if (!id) return "Cliente não encontrado.";
  if (!input.name) return "O cliente precisa de um nome.";

  const result = await updateClient(id, input, form.get("force") === "1");
  if (result.outcome === "duplicate") {
    return `DUPLICATE: Já existe um cliente aberto com o mesmo e-mail ou WhatsApp: "${result.duplicate.name}".`;
  }
  if (result.outcome === "error") return result.message;

  revalidatePath(PANEL);
  return null;
}

/** Arquivar fecha o cadastro sem apagar nada. */
export async function archive(form: FormData) {
  await guard();
  const id = uuid(form, "id");
  if (!id) return;
  await archiveClient(id, form.get("archived") === "yes");
  revalidatePath(PANEL);
}

/** Ligar (ou desligar, com maintenanceId vazio) um cliente de manutenção já existente. */
export async function link(form: FormData) {
  await guard();
  const id = uuid(form, "id");
  if (!id) return;
  const maintenanceId = uuid(form, "maintenance_id");
  await linkMaintenance(id, maintenanceId);
  revalidatePath(PANEL);
}

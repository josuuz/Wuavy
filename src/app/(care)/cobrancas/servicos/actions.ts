"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { parsePrice } from "@/lib/billing/money";
import { asServiceKind, createService, updateService } from "@/lib/billing/services";
import { getAdmin } from "@/lib/maintenance/admin";

/*
  As escritas de Serviços (Wuavy Cobranças). Mesmo padrão de clientes/actions.ts:
  o preço nunca vai para o banco como texto, e é lido com parsePrice — nunca
  do que o navegador diria ser o valor em centavos.
*/

const PANEL = "/cobrancas/servicos";

async function guard() {
  const admin = await getAdmin();
  if (!admin) redirect(PANEL);
}

const text = (form: FormData, key: string, max = 500) => {
  const value = form.get(key);
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed ? trimmed.slice(0, max) : null;
};

const uuid = (form: FormData, key: string) => {
  const value = text(form, key, 36);
  return value && /^[0-9a-f-]{36}$/i.test(value) ? value : null;
};

/** Um serviço novo no catálogo. */
export async function addService(_state: string | null, form: FormData): Promise<string | null> {
  await guard();
  const name = text(form, "name", 120);
  if (!name) return "O serviço precisa de um nome.";

  const kind = asServiceKind(String(form.get("kind") ?? ""));
  if (!kind) return "Escolha pagamento único ou recorrente.";

  const priceCents = parsePrice(text(form, "price", 20) ?? "");
  if (priceCents === null) return "Valor inválido. Use algo como 40 ou 1.500,00.";

  const result = await createService({ name, description: text(form, "description", 500), kind, default_price_cents: priceCents });
  if (result.outcome === "error") return result.message;

  revalidatePath(PANEL);
  return null;
}

/** O cadastro de um serviço existente, inclusive ligar/desligar. */
export async function saveService(_state: string | null, form: FormData): Promise<string | null> {
  await guard();
  const id = uuid(form, "id");
  const name = text(form, "name", 120);
  if (!id || !name) return "Serviço não encontrado.";

  const kind = asServiceKind(String(form.get("kind") ?? ""));
  if (!kind) return "Escolha pagamento único ou recorrente.";

  const priceCents = parsePrice(text(form, "price", 20) ?? "");
  if (priceCents === null) return "Valor inválido. Use algo como 40 ou 1.500,00.";

  const result = await updateService(id, {
    name,
    description: text(form, "description", 500),
    kind,
    default_price_cents: priceCents,
    active: form.get("active") === "yes",
  });
  if (result.outcome === "error") return result.message;

  revalidatePath(PANEL);
  return null;
}

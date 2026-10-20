"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  billingReady,
  blockCreation,
  claimCreation,
  closedReason,
  createPreference,
  investigateBlockedCharge,
  payerEmailForCharge,
  persistPreference,
  reconcilePreference,
  releaseClaim,
  runCreateCharge,
  syncByReference,
} from "@/lib/billing/charges";
import { parsePrice } from "@/lib/billing/money";
import { getAdmin } from "@/lib/maintenance/admin";
import { createAdminClient } from "@/lib/supabase/admin";

/*
  A escrita de Cobranças (Checkout Pro). O preço nunca vem do navegador como
  confiável: é sempre lido com parsePrice. A linha da cobrança nasce antes
  de qualquer chamada ao Mercado Pago, com o id que o formulário já trouxe
  (gerado uma vez quando a página renderizou) — é essa linha que decide se
  cria uma Preference nova ou devolve a que já existe (runCreateCharge),
  então recarregar a página nunca gera uma segunda cobrança.
*/

const PANEL = "/cobrancas/lancamentos";

async function guard() {
  const admin = await getAdmin();
  if (!admin) redirect(PANEL);
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

export type ChargeState =
  | { ok: true; url: string; description: string; amountCents: number; clientWhatsapp: string | null }
  | { ok: false; error: string }
  | null;

/** Gera (ou devolve) o link de pagamento de uma cobrança. */
export async function addCharge(_state: ChargeState, form: FormData): Promise<ChargeState> {
  await guard();
  const admin = createAdminClient();

  const clientId = uuid(form, "client_id");
  if (!clientId) return { ok: false, error: "Escolha um cliente." };

  const serviceId = uuid(form, "service_id");
  let description = text(form, "description", 200);
  if (serviceId) {
    const { data: service } = await admin.from("billing_services").select("name, active").eq("id", serviceId).maybeSingle();
    if (!service) return { ok: false, error: "Serviço não encontrado." };
    if (!service.active) return { ok: false, error: "Este serviço está inativo." };
    description ??= service.name;
  }
  if (!description) return { ok: false, error: "Escolha um serviço ou escreva uma descrição." };

  const amountCents = parsePrice(text(form, "price", 20) ?? "");
  if (amountCents === null) return { ok: false, error: "Valor inválido. Use algo como 150,00." };

  const { data: client } = await admin.from("billing_clients").select("id, email, whatsapp, archived_at").eq("id", clientId).maybeSingle();
  if (!client || client.archived_at) return { ok: false, error: "Cliente não encontrado." };

  if (!billingReady()) return { ok: false, error: closedReason() ?? "Cobrança fechada." };

  // A nossa linha primeiro: o id dela é a referência da Preference. Se duas
  // requisições com o mesmo chargeId tentarem inserir ao mesmo tempo (duplo
  // clique, uma repetição de rede), só uma insere — a outra recebe 23505 e
  // simplesmente segue, porque a linha que importa já existe.
  const chargeId = uuid(form, "charge_id") ?? randomUUID();
  const { data: existing } = await admin
    .from("billing_charges")
    .select("id, provider_preference_id, payment_url, creation_blocked_at")
    .eq("id", chargeId)
    .maybeSingle();
  if (!existing) {
    const { error } = await admin
      .from("billing_charges")
      .insert({ id: chargeId, client_id: clientId, service_id: serviceId, description, amount_cents: amountCents });
    if (error && error.code !== "23505") {
      console.error("cobranças: criar cobrança", error);
      return { ok: false, error: "Não foi possível salvar esta cobrança." };
    }
  }

  if (existing?.provider_preference_id && existing.payment_url) {
    return { ok: true, url: existing.payment_url, description, amountCents, clientWhatsapp: client.whatsapp };
  }

  // A reserva atômica: só uma tentativa por vez chega a chamar o Mercado
  // Pago para este chargeId, e uma cobrança bloqueada por um resultado
  // incerto não é tentada de novo sozinha.
  const claim = await claimCreation(chargeId);
  if (claim === "already") {
    const { data: refreshed } = await admin.from("billing_charges").select("payment_url").eq("id", chargeId).maybeSingle();
    return refreshed?.payment_url
      ? { ok: true, url: refreshed.payment_url, description, amountCents, clientWhatsapp: client.whatsapp }
      : { ok: false, error: "Esta cobrança já tem uma Preference registrada, mas sem link salvo. Peça a reconciliação manual." };
  }
  if (claim === "blocked") {
    return {
      ok: false,
      error: "Esta cobrança ficou com o resultado incerto numa tentativa anterior e está travada para criação automática. Peça a reconciliação manual.",
    };
  }
  if (claim === "in_progress") {
    return { ok: false, error: "Outra tentativa para esta cobrança já está em andamento. Aguarde alguns segundos e tente de novo." };
  }

  const payerEmail = payerEmailForCharge(client.email);
  const result = await runCreateCharge(null, () => createPreference({ chargeId, description, amountCents, payerEmail }));

  if (result.outcome === "unconfirmed") {
    // Pode já ter sido criada no Mercado Pago, sem termos como confirmar
    // agora. Travada: só reconciliação manual (nunca uma segunda tentativa
    // automática, que arriscaria uma segunda Preference). Mesmo que esta
    // gravação explícita falhe (Supabase indisponível), a reserva vencida
    // mesmo assim vira "blocked" sozinha na próxima leitura (claimCreation).
    if ((await blockCreation(chargeId)) === "failed") console.error("cobranças: bloqueio após resultado incerto não confirmou", chargeId);
    return {
      ok: false,
      error: `O Mercado Pago não confirmou a tempo. A cobrança foi travada para evitar duplicar — verifique no painel do Mercado Pago pela referência ${chargeId} e reconcilie.`,
    };
  }
  if (result.outcome === "refused") {
    await releaseClaim(chargeId);
    return { ok: false, error: "O Mercado Pago recusou esta cobrança. Confira o valor e tente de novo." };
  }

  const persisted = await persistPreference(chargeId, result.preferenceId, result.url);
  if (persisted === "failed") {
    if ((await blockCreation(chargeId)) === "failed") console.error("cobranças: bloqueio após falha de persistência não confirmou", chargeId);
    return {
      ok: false,
      error: `O Mercado Pago aceitou a cobrança (id ${result.preferenceId}), mas não foi possível salvar aqui depois de tentar. Link: ${result.url} — anote e reconcilie manualmente.`,
    };
  }

  revalidatePath(PANEL);
  return { ok: true, url: result.url, description, amountCents, clientWhatsapp: client.whatsapp };
}

/** O que o painel mostra depois de investigar ou reconciliar — nunca "ok" sem uma Preference de verdade confirmada. */
export type InvestigateState = { ok: true; message: string } | { ok: false; message: string } | null;

/** Reconciliação manual: o administrador já confirmou no Mercado Pago o id da Preference desta cobrança. */
export async function reconcile(_state: InvestigateState, form: FormData): Promise<InvestigateState> {
  await guard();
  const id = uuid(form, "charge_id");
  const preferenceId = text(form, "preference_id", 64);
  if (!id || !preferenceId) return { ok: false, message: "Informe o id da Preference encontrada no Mercado Pago." };
  const result = await reconcilePreference(id, preferenceId);
  revalidatePath(PANEL);
  if (!result.ok) return { ok: false, message: result.error };
  return { ok: true, message: "Preference confirmada e vinculada a esta cobrança." };
}

/**
 * Investiga a cobrança travada: procura a Preference pela referência no
 * Mercado Pago (investigateBlockedCharge) e, no máximo, recupera sozinha uma
 * que já existe de verdade. Isto NUNCA libera a cobrança para uma criação
 * nova — não existe palavra, id digitado ou tempo decorrido que troque "não
 * encontrei evidência" por "não existe". Só dois desfechos:
 *
 * - "recovered": a Preference existia de verdade e só não tinha sido salva
 *   (a resposta "perdida" depois de uma falha de persistência, ou uma
 *   resposta tardia que chegou depois do bloqueio). Recuperada sozinha —
 *   nada novo foi criado.
 * - "stay_blocked": qualquer ambiguidade, falha de consulta, ou busca vazia.
 *   Continua travada; só reconciliação manual com um id específico
 *   (reconcile(), acima) — confirmado fora deste sistema — destrava.
 */
export async function release(_state: InvestigateState, form: FormData): Promise<InvestigateState> {
  await guard();
  const id = uuid(form, "id");
  if (!id) return { ok: false, message: "Cobrança inválida." };

  const investigation = await investigateBlockedCharge(id);
  revalidatePath(PANEL);

  if (investigation.verdict === "recovered") {
    return { ok: true, message: "Encontramos a Preference desta cobrança no Mercado Pago e confirmamos que bate com o valor e a referência. Ela não está mais travada." };
  }
  // investigation.reason já é uma frase objetiva, pensada para o painel —
  // nunca um erro técnico bruto, nunca um token ou corpo de resposta do
  // Mercado Pago. "ok: false" aqui é sempre o caso: continuar travada nunca
  // é mostrado como sucesso.
  return { ok: false, message: investigation.reason };
}

/** Reler o Mercado Pago agora, sem esperar o próximo aviso do webhook. */
export async function resync(form: FormData) {
  await guard();
  const id = uuid(form, "id");
  if (!id) return;
  try {
    await syncByReference(id);
  } catch (error) {
    console.error("cobranças: reler", error);
  }
  revalidatePath(PANEL);
}

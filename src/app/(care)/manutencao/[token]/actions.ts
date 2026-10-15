"use server";

import { describeError, MercadoPagoError } from "@/lib/flow/billing";
import { authorizationLink, billingReady, createSubscription, syncSubscription, testMode } from "@/lib/maintenance/billing";
import { clientByToken } from "@/lib/maintenance/data";
import { isEarning } from "@/lib/maintenance/plan";
import type { Authorized } from "@/lib/maintenance/types";
import { createAdminClient } from "@/lib/supabase/admin";

/*
  A única chamada da página do cliente: autorizar a cobrança mensal.

  Quem é o cliente vem do token da URL, lido no banco aqui dentro — nunca do
  que o navegador diz ser. O valor cobrado vem da linha do cliente, não do
  formulário: um navegador não escolhe o próprio preço.

  O que volta para o navegador é um dos poucos desfechos abaixo, e o endereço
  do Mercado Pago quando há um. Nada mais.
*/

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function authorize(input: { token: string; email?: string }): Promise<Authorized> {
  const token = typeof input?.token === "string" ? input.token : "";
  const found = await clientByToken(token);
  if (!found) return { outcome: "error" };
  const { client, subscription } = found;

  // Já cobrando: nada a autorizar de novo.
  if (isEarning(subscription?.status)) return { outcome: "active" };
  if (!billingReady()) return { outcome: "unavailable" };

  // O e-mail da cobrança: o que já está no cadastro, ou o que o cliente digitou.
  const typed = typeof input.email === "string" ? input.email.trim() : "";
  const email = client.email ?? (EMAIL.test(typed) ? typed : null);
  if (!email) return { outcome: "email" };

  let admin;
  try {
    admin = createAdminClient();
  } catch (error) {
    console.error("manutenção: Supabase", error);
    return { outcome: "unavailable" };
  }

  // Uma autorização interrompida no meio continua de onde parou: a mesma
  // assinatura no Mercado Pago, o mesmo endereço, nunca uma segunda cobrança.
  if (subscription?.status === "pending" && subscription.provider_subscription_id) {
    try {
      const url = await authorizationLink(subscription.provider_subscription_id);
      if (url) return { outcome: "redirect", url };
      // Já não está pendente: o Mercado Pago sabe o que aconteceu.
      return isEarning(await syncSubscription(subscription.provider_subscription_id)) ? { outcome: "active" } : { outcome: "error" };
    } catch (error) {
      console.error("manutenção: retomar autorização", error);
      return { outcome: "error" };
    }
  }

  // Guarda o e-mail que faltava, para o painel e para a próxima cobrança.
  if (!client.email) await admin.from("maintenance_clients").update({ email }).eq("id", client.id);

  // A nossa linha primeiro: o id dela vai ao Mercado Pago como referência,
  // então todo aviso encontra de quem é. Uma linha pendente que nunca chegou
  // ao Mercado Pago (um timeout) é reaproveitada com a mesma chave.
  let rowId = subscription?.status === "pending" ? subscription.id : null;
  if (!rowId) {
    const { data, error } = await admin
      .from("maintenance_subscriptions")
      .insert({ client_id: client.id, amount_cents: client.price_cents, status: "pending" })
      .select("id")
      .single();
    if (error) {
      console.error("manutenção: criar assinatura", error);
      return { outcome: "unavailable" };
    }
    rowId = data.id;
  }

  try {
    const created = await createSubscription({
      reference: rowId,
      email,
      amountCents: client.price_cents,
      planName: client.plan_name,
      backPath: `/manutencao/${client.token}`,
    });
    await admin.from("maintenance_subscriptions").update({ provider_subscription_id: created.id }).eq("id", rowId);
    if (created.init_point) return { outcome: "redirect", url: created.init_point };
    // Sem endereço de autorização: o Mercado Pago já decidiu algo.
    return isEarning(await syncSubscription(created.id)) ? { outcome: "active" } : { outcome: "error" };
  } catch (error) {
    if (error instanceof MercadoPagoError && error.status < 500) {
      // Recusada (dados, valor): a tentativa nunca virou assinatura. A linha sai, e uma nova tentativa ganha uma nova chave.
      console.warn("manutenção: recusada pelo Mercado Pago", error.status, JSON.stringify(error.body));
      await admin.from("maintenance_subscriptions").delete().eq("id", rowId).is("provider_subscription_id", null);
      return { outcome: "error", detail: testMode() ? describeError(error) : undefined };
    }
    // Desfecho desconhecido (queda, timeout): a linha fica, e repetir usa a mesma chave.
    console.error("manutenção: Mercado Pago fora de alcance", error);
    return { outcome: "error" };
  }
}

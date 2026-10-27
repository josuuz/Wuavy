import type { Metadata } from "next";

import { describeError, inspectPayment, inspectSubscription, MercadoPagoError } from "@/lib/flow/billing";
import { getAdmin } from "@/lib/maintenance/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { reconcile } from "./actions";

export const metadata: Metadata = {
  title: { absolute: "Pulse · Reconciliação" },
  robots: { index: false, follow: false },
};

const UUID = /^[0-9a-f-]{36}$/i;
const PAYMENT_ID = /^\d{1,20}$/;

/*
  A menor ferramenta administrativa para o que o Pulse ainda não tinha: olhar
  o estado real de uma assinatura no Mercado Pago (status, pagamento aprovado
  ou não, próxima cobrança) antes de decidir se a linha precisa de
  reconciliação (botão abaixo, que grava via syncSubscription — o mesmo
  caminho do webhook) ou se já está correta. Quem não está em
  WUAVY_ADMIN_EMAILS não vê nada além da porta fechada.
*/
export default async function PulseAdminPage({ searchParams }: { searchParams: Promise<{ id?: string; paymentId?: string }> }) {
  const admin = await getAdmin();
  if (!admin) {
    return (
      <main style={{ maxWidth: 480, margin: "80px auto", padding: 16, fontFamily: "system-ui" }}>
        <p>Acesso restrito.</p>
      </main>
    );
  }

  const { id, paymentId } = await searchParams;
  const subscriptionId = id && UUID.test(id) ? id : null;
  const mpPaymentId = paymentId && PAYMENT_ID.test(paymentId) ? paymentId : null;

  let row: { provider_subscription_id: string | null; status: string | null } | null = null;
  let inspection: Awaited<ReturnType<typeof inspectSubscription>> = null;
  let error: string | null = null;

  if (subscriptionId) {
    const db = createAdminClient();
    const { data } = await db
      .from("subscriptions")
      .select("provider_subscription_id, status")
      .eq("id", subscriptionId)
      .maybeSingle();
    row = data ?? null;
    if (row?.provider_subscription_id) {
      try {
        inspection = await inspectSubscription(row.provider_subscription_id);
      } catch (e) {
        // Texto de validação da própria API do Mercado Pago (ex.: "parâmetro
        // inválido") — nunca cartão, nunca token; a mesma função já usada no
        // checkout em modo de teste (billing.ts:describeError).
        error = e instanceof MercadoPagoError ? describeError(e) : e instanceof Error ? e.message : "Falha ao consultar o Mercado Pago.";
      }
    }
  }

  let paymentInspection: Awaited<ReturnType<typeof inspectPayment>> = null;
  let paymentError: string | null = null;
  if (mpPaymentId) {
    try {
      paymentInspection = await inspectPayment(mpPaymentId);
    } catch (e) {
      paymentError = e instanceof MercadoPagoError ? describeError(e) : e instanceof Error ? e.message : "Falha ao consultar o Mercado Pago.";
    }
  }

  return (
    <main style={{ maxWidth: 560, margin: "40px auto", padding: 16, fontFamily: "system-ui" }}>
      <h1>Reconciliação de assinatura</h1>
      <p style={{ color: "#666" }}>Só leitura até você apertar &quot;Reconciliar&quot;. Nunca mostra cartão nem token.</p>

      <form style={{ display: "flex", gap: 8, margin: "16px 0" }}>
        <input
          name="id"
          defaultValue={subscriptionId ?? ""}
          placeholder="id da assinatura (nossa, da tabela subscriptions)"
          style={{ flex: 1, padding: 8 }}
        />
        <button type="submit">Consultar</button>
      </form>

      {subscriptionId && !row && <p>Nenhuma assinatura com esse id.</p>}
      {row && !row.provider_subscription_id && <p>Essa linha ainda não tem assinatura no Mercado Pago.</p>}
      {error && <p style={{ color: "crimson" }}>{error}</p>}

      {row && (
        <p>
          Status salvo hoje no Supabase: <strong>{row.status ?? "—"}</strong>
        </p>
      )}

      {inspection && (
        <section style={{ marginTop: 16, padding: 16, border: "1px solid #ddd" }}>
          <h2>Estado real no Mercado Pago agora</h2>
          <p>Status real: <strong>{inspection.status}</strong></p>
          {inspection.chargesUnavailable ? (
            <p style={{ color: "#a60" }}>
              A busca de cobranças falhou (comum quando a assinatura nunca chegou a gerar nenhuma) — &quot;pagamento aprovado&quot; e
              &quot;última cobrança&quot; abaixo não respondem por nada, só o status do preapproval é real.
            </p>
          ) : (
            <>
              <p>Pagamento aprovado encontrado: <strong>{inspection.hasConfirmedPayment ? "sim" : "não"}</strong></p>
              <p>
                Última cobrança:{" "}
                {inspection.latestCharge
                  ? `${inspection.latestCharge.status ?? "—"} · pagamento ${inspection.latestCharge.paymentStatus ?? "—"} · ${inspection.latestCharge.dateCreated ?? "—"}`
                  : "nenhuma"}
              </p>
            </>
          )}
          <p>Próxima cobrança / período pago: {inspection.current_period_end ?? "—"}</p>

          <form action={reconcile} style={{ marginTop: 12 }}>
            <input type="hidden" name="id" value={subscriptionId ?? ""} />
            <button type="submit">Reconciliar (grava este status real na linha)</button>
          </form>
        </section>
      )}

      <h1 style={{ marginTop: 40 }}>Consultar pagamento (Mercado Pago)</h1>
      <p style={{ color: "#666" }}>
        Só leitura, sempre — GET /v1/payments/id. Nunca mostra pagador, cartão ou token.
      </p>

      <form style={{ display: "flex", gap: 8, margin: "16px 0" }}>
        <input
          name="paymentId"
          defaultValue={mpPaymentId ?? ""}
          placeholder="id do pagamento (o número que o Mercado Pago deu)"
          style={{ flex: 1, padding: 8 }}
        />
        <button type="submit">Consultar</button>
      </form>

      {mpPaymentId && !paymentInspection && !paymentError && <p>Nenhum pagamento com esse id.</p>}
      {paymentError && <p style={{ color: "crimson" }}>{paymentError}</p>}

      {paymentInspection && (
        <section style={{ marginTop: 16, padding: 16, border: "1px solid #ddd" }}>
          <h2>Estado real no Mercado Pago agora</h2>
          <p>
            Conta:{" "}
            <strong style={{ color: paymentInspection.live_mode ? "#070" : "#a60" }}>
              {paymentInspection.live_mode === null ? "—" : paymentInspection.live_mode ? "LIVE (real)" : "TESTE"}
            </strong>
          </p>
          <p>Status: <strong>{paymentInspection.status ?? "—"}</strong></p>
          <p>Status detail: <strong>{paymentInspection.status_detail ?? "—"}</strong></p>
          <p>Método / tipo: {paymentInspection.payment_method_id ?? "—"} / {paymentInspection.payment_type_id ?? "—"}</p>
          <p>Criado em: {paymentInspection.date_created ?? "—"}</p>
          <p>Aprovado em: {paymentInspection.date_approved ?? "—"}</p>
          {paymentInspection.external_reference && UUID.test(paymentInspection.external_reference) && (
            <p>
              Ligado à nossa assinatura:{" "}
              <a href={`/pulse/admin?id=${paymentInspection.external_reference}`}>{paymentInspection.external_reference}</a>
            </p>
          )}
        </section>
      )}
    </main>
  );
}

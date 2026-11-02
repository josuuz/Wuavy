import type { Metadata } from "next";

import { describeError, inspectPayment, inspectSubscription, MercadoPagoError } from "@/lib/flow/billing";
import { auditByEmail, auditByUserId } from "@/lib/flow/subscription-audit";
import { getAdmin } from "@/lib/maintenance/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { reconcile } from "./actions";

export const metadata: Metadata = {
  title: { absolute: "Clinavy · Reconciliação" },
  robots: { index: false, follow: false },
};

const UUID = /^[0-9a-f-]{36}$/i;
const PAYMENT_ID = /^\d{1,20}$/;

/*
  A menor ferramenta administrativa para o que o Clinavy ainda não tinha: olhar
  o estado real de uma assinatura no Mercado Pago (status, pagamento aprovado
  ou não, próxima cobrança) antes de decidir se a linha precisa de
  reconciliação (botão abaixo, que grava via syncSubscription — o mesmo
  caminho do webhook) ou se já está correta. Quem não está em
  WUAVY_ADMIN_EMAILS não vê nada além da porta fechada.
*/
export default async function PulseAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; paymentId?: string; email?: string; user?: string }>;
}) {
  const admin = await getAdmin();
  if (!admin) {
    return (
      <main style={{ maxWidth: 480, margin: "80px auto", padding: 16, fontFamily: "system-ui" }}>
        <p>Acesso restrito.</p>
      </main>
    );
  }

  const params = await searchParams;
  // Um parâmetro repetido (?email=a&email=b) chega como lista, não como texto: só texto
  // vai adiante, ou o .trim() da busca derrubaria a página com um 500.
  const text = (value: unknown) => (typeof value === "string" ? value : undefined);
  const id = text(params.id);
  const paymentId = text(params.paymentId);
  const email = text(params.email);
  const user = text(params.user);
  const subscriptionId = id && UUID.test(id) ? id : null;
  const mpPaymentId = paymentId && PAYMENT_ID.test(paymentId) ? paymentId : null;
  // O começo normal de um atendimento: o suporte tem o e-mail do cliente e
  // mais nada. Só leitura, e nunca conteúdo de prontuário.
  // Por e-mail, ou pelo id da conta quando ela nunca criou clínica (o e-mail
  // não a alcança — ver subscription-audit.ts).
  const audit = email ? await auditByEmail(email) : user ? await auditByUserId(user) : null;

  let row: {
    provider_subscription_id: string | null;
    status: string | null;
    payer_email: string | null;
    last_refusal_http_status: number | null;
    last_refusal_detail: string | null;
  } | null = null;
  let inspection: Awaited<ReturnType<typeof inspectSubscription>> = null;
  let error: string | null = null;

  if (subscriptionId) {
    const db = createAdminClient();
    const { data } = await db
      .from("subscriptions")
      .select("provider_subscription_id, status, payer_email, last_refusal_http_status, last_refusal_detail")
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
      <h1>Buscar por e-mail do cliente</h1>
      <p style={{ color: "#666" }}>
        Só leitura, sempre. Mostra as contas, as clínicas e as assinaturas ligadas a um e-mail — e, dos dados clínicos,
        apenas a <strong>contagem</strong>: nenhum prontuário, paciente ou agenda é aberto aqui.
      </p>

      <form style={{ display: "flex", gap: 8, margin: "16px 0" }}>
        <input name="email" type="email" defaultValue={audit?.by === "email" ? audit.query : ""} placeholder="e-mail do cliente" style={{ flex: 1, padding: 8 }} />
        <button type="submit">Buscar</button>
      </form>
      <form style={{ display: "flex", gap: 8, margin: "0 0 16px" }}>
        <input
          name="user"
          defaultValue={audit?.by === "user" ? audit.query : ""}
          placeholder="id da conta (Supabase → Authentication → Users) — para quem nunca criou clínica"
          style={{ flex: 1, padding: 8 }}
        />
        <button type="submit">Buscar conta</button>
      </form>

      {audit && audit.failed.length > 0 && (
        <p style={{ color: "crimson" }}>
          <strong>Atenção: uma leitura falhou</strong> ({audit.failed.join("; ")}). O quadro abaixo está incompleto, e
          um &quot;?&quot; ou &quot;nenhuma&quot; aqui pode ser só uma leitura que não respondeu. Não conclua nada sobre
          contas ou dados a partir dele: recarregue.
        </p>
      )}

      {audit && (
        <section style={{ marginTop: 16, padding: 16, border: "1px solid #ddd" }}>
          <p>
            Contas (user_id) encontradas: <strong>{audit.userIds.length}</strong>
            {audit.userIds.length > 1 ? " — mais de uma conta para este e-mail" : ""}
          </p>
          <ul>
            {audit.userIds.map((userId) => (
              <li key={userId}>
                <code>{userId}</code>
              </li>
            ))}
          </ul>

          <h2>Clínicas</h2>
          {audit.clinics.length === 0 && <p>Nenhuma clínica.</p>}
          {audit.clinics.map((clinic) => (
            <p key={clinic.id}>
              <strong>{clinic.name ?? "(sem nome)"}</strong> · <code>{clinic.id}</code>
              <br />
              papel {clinic.role ?? "—"} · acesso {clinic.memberStatus ?? "—"} · {clinic.counts.patients ?? "?"} pacientes ·{" "}
              {clinic.counts.clinicalRecords ?? "?"} prontuários · {clinic.counts.appointments ?? "?"} agendamentos
            </p>
          ))}

          <h2>Assinaturas</h2>
          {audit.subscriptions.length === 0 && <p>Nenhuma assinatura.</p>}
          {audit.subscriptions.map((subscription) => (
            <p key={subscription.id}>
              <a href={`/clinavy/admin?id=${subscription.id}`}>
                <code>{subscription.id}</code>
              </a>{" "}
              · <strong>{subscription.status ?? "—"}</strong> · criada {subscription.created_at}
              <br />
              Mercado Pago: {subscription.provider_subscription_id ?? "nunca criada"} · pagador{" "}
              {subscription.payer_email ?? "— (o e-mail da conta)"} · clínica {subscription.organization_id ?? "nenhuma ainda"}
              <br />
              período até {subscription.current_period_end ?? "—"}
              {subscription.creation_blocked_at ? " · TRAVADA para reconciliação" : ""}
              {subscription.creation_claimed_at ? " · com reserva de criação em aberto" : ""}
              {subscription.last_refusal_http_status !== null || subscription.last_refusal_detail ? (
                <>
                  <br />
                  <span style={{ color: "#a60" }}>
                    recusa registrada: HTTP {subscription.last_refusal_http_status ?? "—"}
                    {subscription.last_refusal_detail ? ` · ${subscription.last_refusal_detail}` : ""}
                  </span>
                </>
              ) : null}
            </p>
          ))}
        </section>
      )}

      {(email || user) && !audit && <p style={{ color: "crimson" }}>Isso não tem forma de e-mail nem de id de conta.</p>}

      <h1 style={{ marginTop: 40 }}>Reconciliação de assinatura</h1>
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
        <>
          <p>
            Status salvo hoje no Supabase: <strong>{row.status ?? "—"}</strong>
          </p>
          <p>
            Pagador registrado nesta linha: <strong>{row.payer_email ?? "— (o e-mail da conta)"}</strong>{" "}
            <span style={{ color: "#666" }}>(em ambiente de teste, o Mercado Pago recebe o comprador de teste, não este e-mail)</span>
          </p>
          {/* Gravado desde a migration 0020 e, até aqui, nunca mostrado: era o
              motivo de uma recusa só poder ser lida num log temporário da Vercel. */}
          {row.last_refusal_http_status !== null || row.last_refusal_detail ? (
            <p style={{ color: "#a60" }}>
              Última recusa de criação registrada: HTTP <strong>{row.last_refusal_http_status ?? "—"}</strong>
              {row.last_refusal_detail ? ` · ${row.last_refusal_detail}` : ""}
            </p>
          ) : (
            <p style={{ color: "#666" }}>Nenhuma recusa de criação registrada nesta linha.</p>
          )}
        </>
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
              <a href={`/clinavy/admin?id=${paymentInspection.external_reference}`}>{paymentInspection.external_reference}</a>
            </p>
          )}
        </section>
      )}
    </main>
  );
}

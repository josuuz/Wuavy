/*
  Regressão para o achado da revisão final (billing.ts:252): current_period_end
  guardava, sem distinção, o que a próxima cobrança prevista (next_payment_date)
  OU o fim do mês já pago (lib/flow/access.ts:paidThrough) deveriam significar.
  syncStanding escrevia sempre a primeira, mesmo quando o status virava
  'cancelled' — apagando, no exato momento em que uma clínica cancelava, a
  data que mantém o Pulse funcionando até o fim do mês já pago.

  Contra o código REAL (lib/flow/billing.ts, lib/flow/access.ts), com
  Supabase em memória (fake-admin.mjs) e Mercado Pago simulado por um mock
  local de fetch — mesmo ambiente de tests/pulse-subscribe-integration.test.mjs.
  Os nove cenários abaixo são os da investigação.
*/

import { register } from "node:module";
import test from "node:test";
import assert from "node:assert/strict";

register("./helpers/pulse-loader.mjs", import.meta.url);

process.env.MERCADOPAGO_ACCESS_TOKEN = "APP_USR-teste-ficticio-0000000000";
process.env.MERCADOPAGO_ENV = "test";
process.env.MERCADOPAGO_TEST_PAYER_EMAIL = "comprador-teste@example.com";
process.env.NEXT_PUBLIC_SITE_URL = "https://teste.example.com";

const { FakeAdmin, setFakeAdminClient } = await import("./helpers/fake-admin.mjs");
const billing = await import("../src/lib/flow/billing.ts");
const { clinicAccess, paidThrough } = await import("../src/lib/flow/access.ts");

const PID = "preapproval-periodo-0001";

function freshRow(overrides = {}) {
  return {
    id: "row-periodo-1",
    user_id: "user-1",
    organization_id: "org-1",
    provider: "mercadopago",
    provider_subscription_id: PID,
    status: "active",
    started_at: "2026-06-13T10:00:00.000Z",
    current_period_end: null,
    creation_claimed_at: null,
    creation_blocked_at: null,
    last_refusal_http_status: null,
    last_refusal_detail: null,
    ...overrides,
  };
}

function withFetchMock(handler, run) {
  const original = globalThis.fetch;
  globalThis.fetch = handler;
  return run().finally(() => {
    globalThis.fetch = original;
  });
}

const jsonResponse = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

/** O preapproval e as cobranças que o Mercado Pago responde, para um cenário. */
function mpMock({ preapproval, charges = [] }) {
  return async (url) => {
    if (url.includes("/authorized_payments/search")) return jsonResponse(200, { results: charges });
    if (url.includes(`/preapproval/${PID}`)) return jsonResponse(200, { id: PID, ...preapproval });
    throw new Error("chamada inesperada: " + url);
  };
}

const sync = (mock) => withFetchMock(mock, () => billing.syncStanding(PID));

// ── 1. Assinatura aprovada e pagamento confirmado ──────────────

test("1) assinatura ativa com cobrança aprovada: current_period_end é a próxima cobrança prevista, sem mudança", async () => {
  setFakeAdminClient(new FakeAdmin({ subscriptions: [freshRow()] }));
  const standing = await sync(mpMock({
    preapproval: { status: "authorized", next_payment_date: "2026-11-13T10:00:00.000Z" },
    charges: [{ status: "processed", payment: { status: "approved" }, date_created: "2026-10-13T10:00:00.000Z" }],
  }));
  assert.equal(standing.status, "active");
  assert.equal(standing.current_period_end, "2026-11-13T10:00:00.000Z");
});

// ── 2. Cancelamento durante o mês pago (o bug) ─────────────────

test("2) cancelamento durante o mês pago: current_period_end vem da cobrança confirmada, nunca de next_payment_date ausente", async () => {
  const admin = new FakeAdmin({ subscriptions: [freshRow()] });
  setFakeAdminClient(admin);
  // O Mercado Pago, ao cancelar, não reporta mais next_payment_date — não há
  // mais nenhum débito agendado. Mas a última cobrança foi aprovada.
  const standing = await sync(mpMock({
    preapproval: { status: "cancelled" },
    charges: [{ status: "processed", payment: { status: "approved" }, date_created: "2026-10-13T10:00:00.000Z" }],
  }));
  assert.equal(standing.status, "cancelled");
  assert.equal(standing.current_period_end, "2026-11-13T10:00:00.000Z", "o mês que a cobrança de 13/10 pagou não desaparece");

  const row = admin.row("subscriptions", "row-periodo-1");
  const future = new Date("2026-10-20T00:00:00.000Z");
  assert.equal(paidThrough({ status: row.status, current_period_end: row.current_period_end }, future), "2026-11-13T10:00:00.000Z");
  assert.equal(clinicAccess({ status: row.status, current_period_end: row.current_period_end }, future).isReadOnly, false, "o Pulse continua funcionando até o fim do mês pago");
});

// ── 3. Mercado Pago retorna next_payment_date: null, mas ainda ativa ──

test("3) ativa sem next_payment_date: mostra sem próxima cobrança, mas nunca perde acesso (releases() nem olha para a data)", async () => {
  setFakeAdminClient(new FakeAdmin({ subscriptions: [freshRow()] }));
  const standing = await sync(mpMock({ preapproval: { status: "authorized" }, charges: [] }));
  assert.equal(standing.status, "active");
  assert.equal(standing.current_period_end, null);
  assert.equal(clinicAccess(standing).isReadOnly, false);
  assert.equal(clinicAccess(standing).canEdit, true);
});

// ── 4. Webhook atrasado depois do cancelamento: idempotente ───

test("4) webhook atrasado depois do cancelamento: sincronizar de novo escreve o mesmo mês pago", async () => {
  const admin = new FakeAdmin({ subscriptions: [freshRow({ status: "cancelled", current_period_end: "2026-11-13T10:00:00.000Z" })] });
  setFakeAdminClient(admin);
  const mock = mpMock({
    preapproval: { status: "cancelled" },
    charges: [{ status: "processed", payment: { status: "approved" }, date_created: "2026-10-13T10:00:00.000Z" }],
  });
  const first = await sync(mock);
  const second = await sync(mock);
  assert.deepEqual(first, second);
  assert.equal(second.current_period_end, "2026-11-13T10:00:00.000Z");
});

// ── 5. Cancelamento antes de qualquer pagamento aprovado ───────

test("5) cancelamento sem nenhum pagamento aprovado: sem mês pago nenhum, acesso vira só consulta", async () => {
  setFakeAdminClient(new FakeAdmin({ subscriptions: [freshRow({ status: "pending", current_period_end: null })] }));
  const standing = await sync(mpMock({ preapproval: { status: "cancelled" }, charges: [] }));
  assert.equal(standing.status, "cancelled");
  assert.equal(standing.current_period_end, null);
  assert.equal(clinicAccess(standing).isReadOnly, true);
});

// ── 6. Pagamento recusado ───────────────────────────────────────

test("6) cancelada com a única cobrança recusada: pagamento recusado não compra mês nenhum", async () => {
  setFakeAdminClient(new FakeAdmin({ subscriptions: [freshRow()] }));
  const standing = await sync(mpMock({
    preapproval: { status: "cancelled" },
    charges: [{ status: "processed", payment: { status: "rejected" }, date_created: "2026-10-13T10:00:00.000Z" }],
  }));
  assert.equal(standing.current_period_end, null);
});

// ── 7. Período pago expirado ────────────────────────────────────

test("7) período pago já expirado: clinicAccess fecha para consulta, mesmo com o status ainda 'cancelled'", async () => {
  setFakeAdminClient(new FakeAdmin({ subscriptions: [freshRow()] }));
  const standing = await sync(mpMock({
    preapproval: { status: "cancelled" },
    charges: [{ status: "processed", payment: { status: "approved" }, date_created: "2026-05-13T10:00:00.000Z" }],
  }));
  assert.equal(standing.current_period_end, "2026-06-13T10:00:00.000Z");
  const muitoDepois = new Date("2026-10-20T00:00:00.000Z");
  assert.equal(paidThrough(standing, muitoDepois), null, "o mês pago em maio já passou");
  assert.equal(clinicAccess(standing, muitoDepois).isReadOnly, true);
});

// ── 8. Estorno ou contestação de pagamento ─────────────────────

test("8) cancelada com a única cobrança estornada: estorno não compra mês nenhum", async () => {
  setFakeAdminClient(new FakeAdmin({ subscriptions: [freshRow()] }));
  const standing = await sync(mpMock({
    preapproval: { status: "cancelled" },
    charges: [{ status: "processed", payment: { status: "refunded" }, date_created: "2026-10-13T10:00:00.000Z" }],
  }));
  assert.equal(standing.current_period_end, null);
});

// ── Auditoria: a busca de cobranças respondeu, mas sem prova nenhuma ──
//
// Diferente do cenário 9 (a busca FALHOU): aqui a busca responde normalmente,
// só que a única cobrança listada ainda não foi efetivamente paga. A ponta a
// ponta de billing.ts precisa herdar a exigência de evidência positiva de
// paidPeriodEnd, não só a função pura isolada.

test("auditoria) cancelada com a única cobrança ainda pendente: busca respondeu, mas sem aprovação nenhuma", async () => {
  setFakeAdminClient(new FakeAdmin({ subscriptions: [freshRow()] }));
  const standing = await sync(mpMock({
    preapproval: { status: "cancelled" },
    charges: [{ status: "processed", payment: { status: "pending" }, date_created: "2026-10-13T10:00:00.000Z" }],
  }));
  assert.equal(standing.current_period_end, null);
  assert.equal(clinicAccess(standing).isReadOnly, true);
});

// ── Auditoria: virada de mês ponta a ponta ──────────────────────

test("auditoria) cobrança confirmada no dia 31: o mês pago ponta a ponta termina no fim de fevereiro", async () => {
  setFakeAdminClient(new FakeAdmin({ subscriptions: [freshRow()] }));
  const standing = await sync(mpMock({
    preapproval: { status: "cancelled" },
    charges: [{ status: "processed", payment: { status: "approved" }, date_created: "2026-01-31T10:00:00.000Z" }],
  }));
  assert.equal(standing.current_period_end, "2026-02-28T10:00:00.000Z");
});

// ── 9. Falha temporária de sincronização (a busca de cobranças) ──

test("9) a busca de cobranças falha temporariamente: o mês pago já salvo não é apagado às pressas", async () => {
  const admin = new FakeAdmin({
    subscriptions: [freshRow({ status: "cancelled", current_period_end: "2026-11-13T10:00:00.000Z" })],
  });
  setFakeAdminClient(admin);
  const standing = await sync(async (url) => {
    if (url.includes("/authorized_payments/search")) throw new Error("indisponível (simulado)");
    if (url.includes(`/preapproval/${PID}`)) return jsonResponse(200, { id: PID, status: "cancelled" });
    throw new Error("chamada inesperada: " + url);
  });
  assert.equal(standing.status, "cancelled");
  assert.equal(standing.current_period_end, "2026-11-13T10:00:00.000Z", "uma falha ao buscar cobranças não pode apagar um mês pago já confirmado antes");
});

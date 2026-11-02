/*
  "Pagamento só vale com evidência financeira positiva" — o que o código garante
  de verdade, e onde.

  O STATUS sozinho não prova pagamento. statusFrom (lib/mercadopago/notice.ts)
  devolve "active" para uma assinatura autorizada cujo último débito não falhou
  — mesmo antes de a primeira cobrança ser aprovada — e "past_due", que também
  libera, para uma pausada. Por isso o que CRIA acesso pago novo, a criação da
  clínica, não confia no status: exige paymentEvidence, uma cobrança processada
  E aprovada pelo Mercado Pago, gravada uma vez em first_payment_confirmed_at.

  Contra o billing.ts REAL, com Supabase em memória e Mercado Pago simulado.
  Os testes nomeiam três respostas, não duas — "confirmed", "none" e
  "unavailable" — porque não saber (uma busca de cobranças que falha, um
  Mercado Pago fora do ar) nunca pode virar "confirmado".
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

const PID = "preapproval-evidencia-0001";

const row = (overrides = {}) => ({
  id: "row-evidencia-1",
  user_id: "user-1",
  organization_id: null,
  provider: "mercadopago",
  provider_subscription_id: PID,
  status: "active",
  started_at: null,
  current_period_end: null,
  creation_claimed_at: null,
  creation_blocked_at: null,
  legacy_access_transition: false,
  first_payment_confirmed_at: null,
  ...overrides,
});

const jsonResponse = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

function withFetchMock(handler, run) {
  const original = globalThis.fetch;
  globalThis.fetch = handler;
  return run().finally(() => {
    globalThis.fetch = original;
  });
}

/** O Mercado Pago de um cenário: o preapproval, e as cobranças (ou a falha da busca). */
function mp({ preapproval = { status: "authorized" }, charges = [], chargesStatus = 200, preapprovalStatus = 200 } = {}) {
  const calls = [];
  const handler = async (url) => {
    calls.push(url);
    if (url.includes("/authorized_payments/search")) return chargesStatus === 200 ? jsonResponse(200, { results: charges }) : jsonResponse(chargesStatus, { message: "erro" });
    if (url.includes(`/preapproval/${PID}`)) return preapprovalStatus === 200 ? jsonResponse(200, { id: PID, ...preapproval }) : jsonResponse(preapprovalStatus, { message: "erro" });
    throw new Error("chamada inesperada: " + url);
  };
  return { handler, calls };
}

const aprovada = { status: "processed", payment: { status: "approved" }, date_created: "2026-10-30T12:00:00.000Z" };

const evidence = (r, scenario) => {
  setFakeAdminClient(new FakeAdmin({ subscriptions: [r] }));
  return withFetchMock(scenario.handler, () => billing.paymentEvidence(r));
};

// ── a prova já gravada ──

test("uma prova já gravada vale, sem perguntar nada ao Mercado Pago", async () => {
  const scenario = mp();
  const result = await evidence(row({ first_payment_confirmed_at: "2026-10-30T12:00:00.000Z" }), scenario);
  assert.equal(result, "confirmed");
  assert.equal(scenario.calls.length, 0, "a prova é gravada uma vez e nunca apagada: não se pergunta de novo");
});

test("sem assinatura no Mercado Pago, não há o que provar", async () => {
  const scenario = mp();
  assert.equal(await evidence(row({ provider_subscription_id: null }), scenario), "none");
  assert.equal(scenario.calls.length, 0);
});

// ── a prova lida agora ──

test("uma cobrança processada E aprovada é a prova — e fica gravada, para QUALQUER linha", async () => {
  const admin = new FakeAdmin({ subscriptions: [row()] });
  setFakeAdminClient(admin);
  const scenario = mp({ charges: [aprovada] });
  const result = await withFetchMock(scenario.handler, () => billing.paymentEvidence(row()));
  assert.equal(result, "confirmed");
  assert.ok(admin.row("subscriptions", "row-evidencia-1").first_payment_confirmed_at, "gravada, uma vez");
});

test("uma assinatura AUTORIZADA sem cobrança aprovada NÃO é prova de pagamento", async () => {
  // O caso que o status esconde: statusFrom já diz 'active' aqui.
  const admin = new FakeAdmin({ subscriptions: [row()] });
  setFakeAdminClient(admin);
  const scenario = mp({ preapproval: { status: "authorized" }, charges: [] });
  const result = await withFetchMock(scenario.handler, () => billing.paymentEvidence(row()));
  assert.equal(result, "none");
  assert.equal(admin.row("subscriptions", "row-evidencia-1").first_payment_confirmed_at, null, "nada é gravado sem dinheiro");
  assert.equal(admin.row("subscriptions", "row-evidencia-1").status, "active", "e o status, sozinho, já liberaria — é por isso que a criação da clínica não confia nele");
});

test("uma cobrança ainda agendada, ou com pagamento pendente, não é prova", async () => {
  for (const charge of [
    { status: "scheduled", payment: { status: "pending" }, date_created: "2026-10-30T12:00:00.000Z" },
    { status: "processed", payment: { status: "in_process" }, date_created: "2026-10-30T12:00:00.000Z" },
    { status: "processed", payment: { status: "rejected" }, date_created: "2026-10-30T12:00:00.000Z" },
    { status: "recycling", payment: { status: "approved" }, date_created: "2026-10-30T12:00:00.000Z" },
  ]) {
    assert.equal(await evidence(row(), mp({ charges: [charge] })), "none", JSON.stringify(charge));
  }
});

test("uma assinatura PAUSADA (past_due, que libera acesso) sem cobrança aprovada não é prova", async () => {
  // past_due libera o uso; para uma clínica NOVA isso seria acesso sem ter pago nada.
  assert.equal(await evidence(row({ status: "past_due" }), mp({ preapproval: { status: "paused" }, charges: [] })), "none");
});

// ── não saber nunca vira "confirmado" ──

test("a busca de cobranças falha: 'não sei' — nunca 'nunca pagou' e nunca 'pagou'", async () => {
  assert.equal(await evidence(row(), mp({ chargesStatus: 500 })), "unavailable");
});

test("a busca responde 400: o Mercado Pago diz que ainda não há cobrança — é 'sem prova', e não 'não sei'", async () => {
  // O caso comum de quem acabou de autorizar no checkout, antes do primeiro débito: a resposta
  // útil é "ainda não confirmou", não um erro genérico de "tente de novo".
  assert.equal(await evidence(row(), mp({ chargesStatus: 400 })), "none");
});

test("um 429 (limite de taxa) e um 401 da busca são 'não sei', como um 5xx", async () => {
  for (const status of [401, 403, 429, 500, 502, 503]) {
    assert.equal(await evidence(row(), mp({ chargesStatus: status })), "unavailable", String(status));
  }
});

test("chargesKnown: só uma busca que respondeu, ou um 400, permite decidir", () => {
  assert.equal(billing.chargesKnown({ chargesRead: true, chargesHttpStatus: null }), true);
  assert.equal(billing.chargesKnown({ chargesRead: false, chargesHttpStatus: 400 }), true);
  for (const status of [null, 401, 429, 500]) assert.equal(billing.chargesKnown({ chargesRead: false, chargesHttpStatus: status }), false, String(status));
});

test("o Mercado Pago fora do ar: 'não sei'", async () => {
  assert.equal(await evidence(row(), mp({ preapprovalStatus: 503 })), "unavailable");
});

test("a rede falha: 'não sei', sem derrubar quem chamou", async () => {
  setFakeAdminClient(new FakeAdmin({ subscriptions: [row()] }));
  const result = await withFetchMock(async () => {
    throw new Error("ECONNRESET");
  }, () => billing.paymentEvidence(row()));
  assert.equal(result, "unavailable");
});

// ── a transição legada continua do jeito que era ──

test("a linha de transição legada continua gravando a prova, como antes", async () => {
  const admin = new FakeAdmin({ subscriptions: [row({ organization_id: "org-1", legacy_access_transition: true })] });
  setFakeAdminClient(admin);
  const scenario = mp({ charges: [aprovada] });
  await withFetchMock(scenario.handler, () => billing.syncStanding(PID));
  assert.ok(admin.row("subscriptions", "row-evidencia-1").first_payment_confirmed_at);
});

test("a prova, uma vez gravada, não é regravada nem apagada por uma leitura posterior sem cobrança", async () => {
  const gravada = "2026-10-01T00:00:00.000Z";
  const admin = new FakeAdmin({ subscriptions: [row({ first_payment_confirmed_at: gravada })] });
  setFakeAdminClient(admin);
  await withFetchMock(mp({ charges: [] }).handler, () => billing.syncStanding(PID));
  assert.equal(admin.row("subscriptions", "row-evidencia-1").first_payment_confirmed_at, gravada);
  await withFetchMock(mp({ charges: [aprovada] }).handler, () => billing.syncStanding(PID));
  assert.equal(admin.row("subscriptions", "row-evidencia-1").first_payment_confirmed_at, gravada, "a primeira prova fica");
});

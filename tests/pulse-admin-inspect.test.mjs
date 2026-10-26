/*
  Regressão: /pulse/admin ("Mercado Pago answered 400" relatado em produção
  para uma assinatura sem nenhuma cobrança ainda). inspectSubscription
  (lib/flow/billing.ts) chamava /authorized_payments/search sem a mesma
  resiliência que syncStanding já tem para essa busca (chargesFetchFailed) —
  uma falha ali derrubava a inspeção inteira, mesmo com o preapproval lido
  com sucesso.

  Contra o código REAL, Mercado Pago simulado por um mock local de fetch —
  mesmo ambiente e loader de tests/pulse-subscription-period.test.mjs.
*/

import { register } from "node:module";
import test from "node:test";
import assert from "node:assert/strict";

register("./helpers/pulse-loader.mjs", import.meta.url);

process.env.MERCADOPAGO_ACCESS_TOKEN = "APP_USR-teste-ficticio-0000000000";
process.env.MERCADOPAGO_ENV = "test";
process.env.MERCADOPAGO_TEST_PAYER_EMAIL = "comprador-teste@example.com";
process.env.NEXT_PUBLIC_SITE_URL = "https://teste.example.com";

const billing = await import("../src/lib/flow/billing.ts");

const PID = "preapproval-inspect-0001";

function withFetchMock(handler, run) {
  const original = globalThis.fetch;
  globalThis.fetch = handler;
  return run().finally(() => {
    globalThis.fetch = original;
  });
}

const jsonResponse = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

const inspect = (mock) => withFetchMock(mock, () => billing.inspectSubscription(PID));

test("1) preapproval ok, busca de cobranças responde 400 (nunca houve nenhuma): a inspeção não lança, devolve o status real com chargesUnavailable=true", async () => {
  const result = await inspect(async (url) => {
    if (String(url).includes("/authorized_payments/search")) return jsonResponse(400, { message: "invalid preapproval_id" });
    if (String(url).includes(`/preapproval/${PID}`)) return jsonResponse(200, { id: PID, status: "authorized" });
    throw new Error("chamada inesperada: " + url);
  });
  assert.equal(result.status, "active", "o status vem só do preapproval quando as cobranças não respondem");
  assert.equal(result.chargesUnavailable, true);
  assert.equal(result.hasConfirmedPayment, false, "sem cobrança nenhuma lida, nunca 'sim' por omissão");
  assert.equal(result.latestCharge, null);
});

test("2) as duas chamadas respondem bem: chargesUnavailable=false e o pagamento aprovado é lido de verdade", async () => {
  const result = await inspect(async (url) => {
    if (String(url).includes("/authorized_payments/search")) {
      return jsonResponse(200, { results: [{ status: "processed", payment: { status: "approved" }, date_created: "2026-10-05T21:35:00.000Z" }] });
    }
    if (String(url).includes(`/preapproval/${PID}`)) return jsonResponse(200, { id: PID, status: "authorized", next_payment_date: "2026-11-05T21:32:17.000Z" });
    throw new Error("chamada inesperada: " + url);
  });
  assert.equal(result.chargesUnavailable, false);
  assert.equal(result.hasConfirmedPayment, true);
  assert.equal(result.status, "active");
  assert.equal(result.current_period_end, "2026-11-05T21:32:17.000Z");
});

test("3) o preapproval em si falha (400): continua lançando — não há o que inspecionar sem ele", async () => {
  await assert.rejects(
    () =>
      inspect(async (url) => {
        if (String(url).includes(`/preapproval/${PID}`)) return jsonResponse(400, { message: "not found" });
        throw new Error("chamada inesperada: " + url);
      }),
    /Mercado Pago answered 400/,
  );
});

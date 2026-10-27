/*
  inspectPayment (lib/flow/billing.ts) — GET /v1/payments/{id}, a ferramenta
  mínima que o painel /pulse/admin usa para diagnosticar uma recusa quando o
  suporte do Mercado Pago só devolve o status_detail por esse endpoint (não
  /preapproval nem /authorized_payments). Nunca repassa pagador, cartão ou
  identificação — só os campos testados abaixo.

  Contra o código REAL, Mercado Pago simulado por um mock local de fetch —
  mesmo ambiente e loader de tests/pulse-admin-inspect.test.mjs.
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

function withFetchMock(handler, run) {
  const original = globalThis.fetch;
  globalThis.fetch = handler;
  return run().finally(() => {
    globalThis.fetch = original;
  });
}

const jsonResponse = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

test("1) pagamento recusado: devolve id, status, status_detail, live_mode e método — nunca pagador nem cartão", async () => {
  const result = await withFetchMock(
    async (url) => {
      assert.match(String(url), /\/v1\/payments\/186303304366$/);
      return jsonResponse(200, {
        id: 186303304366,
        status: "rejected",
        status_detail: "cc_rejected_insufficient_amount",
        live_mode: true,
        payment_method_id: "master",
        payment_type_id: "credit_card",
        date_created: "2026-10-27T05:42:00.000Z",
        date_approved: null,
        external_reference: "58b878cf-f274-4a00-8000-000000000000",
        payer: { email: "cliente@example.com", identification: { type: "CPF", number: "00000000000" } },
        card: { first_six_digits: "515135", last_four_digits: "0183" },
      });
    },
    () => billing.inspectPayment("186303304366"),
  );
  assert.equal(result.id, 186303304366);
  assert.equal(result.status, "rejected");
  assert.equal(result.status_detail, "cc_rejected_insufficient_amount");
  assert.equal(result.live_mode, true);
  assert.equal(result.payment_method_id, "master");
  assert.equal(result.external_reference, "58b878cf-f274-4a00-8000-000000000000");
  assert.deepEqual(Object.keys(result).sort(), [
    "date_approved",
    "date_created",
    "external_reference",
    "id",
    "live_mode",
    "payment_method_id",
    "payment_type_id",
    "status",
    "status_detail",
  ]);
});

test("2) conta de teste: live_mode=false chega intacto (nunca invertido nem omitido)", async () => {
  const result = await withFetchMock(
    () => jsonResponse(200, { id: 999, status: "approved", status_detail: "accredited", live_mode: false }),
    () => billing.inspectPayment("999"),
  );
  assert.equal(result.live_mode, false);
});

test("3) id com letras ou maior que o formato de pagamento: nunca chama a rede, devolve null", async () => {
  const result = await withFetchMock(
    () => {
      throw new Error("não deveria chamar a rede");
    },
    () => billing.inspectPayment("abc123"),
  );
  assert.equal(result, null);
});

test("4) Mercado Pago recusa a consulta (id inexistente): continua lançando, igual a inspectSubscription", async () => {
  await assert.rejects(
    () => withFetchMock(() => jsonResponse(404, { message: "payment not found" }), () => billing.inspectPayment("1")),
    /Mercado Pago answered 404/,
  );
});

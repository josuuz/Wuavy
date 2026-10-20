/*
  A criação idempotente de uma cobrança única (lib/billing/charges.ts),
  sem rede: a mesma lógica de maintenance/billing.ts e notice.ts
  (runCancel, runCardChange), só que para a Preference do Checkout Pro.

  O risco que isto prova: recarregar a página (ou o servidor repetir a
  chamada) nunca gera uma segunda cobrança no Mercado Pago. Uma que já tem
  link é devolvida como está, sem chamar create() de novo; uma recusada
  (4xx) não deixa a linha presa à espera de uma chave que o Mercado Pago já
  disse que não serve; uma resposta ambígua (timeout, 5xx) não é tratada
  como falha — o chamador mantém a linha e repete com a mesma chave depois.
*/

import test from "node:test";
import assert from "node:assert/strict";

import { resolvePaymentUrl, runCreateCharge } from "../src/lib/billing/create-charge.ts";

test("uma cobrança que já tem link é devolvida sem chamar o Mercado Pago de novo", async () => {
  let calls = 0;
  const result = await runCreateCharge({ provider_preference_id: "pref-1", payment_url: "https://mp.example/pref-1" }, async () => {
    calls += 1;
    return { id: "pref-2", url: "https://mp.example/pref-2" };
  });
  assert.deepEqual(result, { outcome: "ready", preferenceId: "pref-1", url: "https://mp.example/pref-1" });
  assert.equal(calls, 0);
});

test("sem cobrança anterior, cria e devolve o que o Mercado Pago respondeu", async () => {
  const result = await runCreateCharge(null, async () => ({ id: "pref-3", url: "https://mp.example/pref-3" }));
  assert.deepEqual(result, { outcome: "ready", preferenceId: "pref-3", url: "https://mp.example/pref-3" });
});

test("uma recusa (4xx) é 'refused': a linha pode ser descartada e tentada de novo com outra chave", async () => {
  const result = await runCreateCharge(null, async () => {
    throw Object.assign(new Error("valor inválido"), { status: 400 });
  });
  assert.equal(result.outcome, "refused");
});

test("uma resposta ambígua (5xx, sem status) é 'unconfirmed': a linha fica, a mesma chave serve de novo", async () => {
  const serverError = await runCreateCharge(null, async () => {
    throw Object.assign(new Error("fora do ar"), { status: 503 });
  });
  assert.equal(serverError.outcome, "unconfirmed");

  const networkError = await runCreateCharge(null, async () => {
    throw new TypeError("fetch failed");
  });
  assert.equal(networkError.outcome, "unconfirmed");
});

/*
  resolvePaymentUrl (lib/billing/charges.ts, paymentUrl): sempre init_point,
  nunca sandbox_init_point — achado na homologação de 2026-10-19, que não
  funciona com o token de uma conta de teste. Fora do modo de teste, não
  exige identidade nenhuma; em teste, fecha diante de qualquer coisa que não
  confirme, pelo próprio Mercado Pago, que a conta é de teste e é esta conta.
*/

const PREF = { init_point: "https://mp.example/pref", sandbox_init_point: "https://sandbox.mercadopago.com.br/pref", collector_id: 42 };
const TEST_ACCOUNT = { id: 42, tags: ["user_product_seller", "test_user", "normal"] };

test("fora do modo de teste: devolve init_point sem pedir identidade nenhuma", () => {
  assert.deepEqual(resolvePaymentUrl(PREF, false, null), { ok: true, url: PREF.init_point });
});

test("em teste, conta vendedora de teste válida e collector_id batendo: devolve init_point", () => {
  assert.deepEqual(resolvePaymentUrl(PREF, true, TEST_ACCOUNT), { ok: true, url: PREF.init_point });
});

test("em teste, sandbox_init_point presente nunca é escolhido — mesmo com tudo confirmado", () => {
  const result = resolvePaymentUrl(PREF, true, TEST_ACCOUNT);
  assert.equal(result.ok, true);
  assert.doesNotMatch(result.url, /sandbox/);
});

test("em teste, conta sem a tag test_user (conta de produção usada indevidamente): fecha", () => {
  const producao = { id: 42, tags: ["user_product_seller", "normal"] };
  assert.deepEqual(resolvePaymentUrl(PREF, true, producao), { ok: false, reason: "not-test-account" });
});

test("em teste, collector_id da Preference diferente do autenticado: fecha", () => {
  const outraConta = { id: 999, tags: ["test_user"] };
  assert.deepEqual(resolvePaymentUrl(PREF, true, outraConta), { ok: false, reason: "collector-mismatch" });
});

test("em teste, verificação de identidade indisponível (collector null): fecha", () => {
  assert.deepEqual(resolvePaymentUrl(PREF, true, null), { ok: false, reason: "identity-unverified" });
});

test("init_point ausente: fecha, dentro ou fora do modo de teste", () => {
  const semLink = { sandbox_init_point: "https://sandbox.mercadopago.com.br/pref", collector_id: 42 };
  assert.deepEqual(resolvePaymentUrl(semLink, false, null), { ok: false, reason: "missing-init-point" });
  assert.deepEqual(resolvePaymentUrl(semLink, true, TEST_ACCOUNT), { ok: false, reason: "missing-init-point" });
});

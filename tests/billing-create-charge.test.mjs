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

import { runCreateCharge } from "../src/lib/billing/create-charge.ts";

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

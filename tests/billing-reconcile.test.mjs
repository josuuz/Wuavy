/*
  O que reconcilePreference (lib/billing/charges.ts) confere antes de salvar
  qualquer coisa — pura, sem rede (lib/billing/create-charge.ts,
  checkReconciliation). O risco que isto prova: uma Preference com a
  referência certa, mas de outro valor ou outra moeda, nunca é aceita só
  porque a referência bate.
*/

import test from "node:test";
import assert from "node:assert/strict";

import { checkReconciliation } from "../src/lib/billing/create-charge.ts";

const CHARGE_ID = "11111111-1111-1111-1111-111111111111";
const charge = { amount_cents: 15000 };

test("referência, valor e moeda batendo: aceita", () => {
  const preference = { external_reference: CHARGE_ID, items: [{ unit_price: 150, quantity: 1, currency_id: "BRL" }] };
  assert.deepEqual(checkReconciliation(charge, preference, CHARGE_ID), { ok: true });
});

test("referência de outra cobrança: recusa sem olhar o resto", () => {
  const preference = { external_reference: "outro-id", items: [{ unit_price: 150, quantity: 1, currency_id: "BRL" }] };
  const result = checkReconciliation(charge, preference, CHARGE_ID);
  assert.equal(result.ok, false);
});

test("referência certa, mas sem nenhum item: recusa (não dá para conferir o valor)", () => {
  const preference = { external_reference: CHARGE_ID, items: [] };
  const result = checkReconciliation(charge, preference, CHARGE_ID);
  assert.equal(result.ok, false);
});

test("referência certa, valor diferente: recusa — é a lacuna que só conferir external_reference deixava passar", () => {
  const preference = { external_reference: CHARGE_ID, items: [{ unit_price: 1, quantity: 1, currency_id: "BRL" }] };
  const result = checkReconciliation(charge, preference, CHARGE_ID);
  assert.equal(result.ok, false);
});

test("referência e valor certos, moeda diferente: recusa", () => {
  const preference = { external_reference: CHARGE_ID, items: [{ unit_price: 150, quantity: 1, currency_id: "USD" }] };
  const result = checkReconciliation(charge, preference, CHARGE_ID);
  assert.equal(result.ok, false);
});

test("mais de um item: soma unit_price * quantity de cada um antes de comparar", () => {
  const preference = {
    external_reference: CHARGE_ID,
    items: [
      { unit_price: 100, quantity: 1, currency_id: "BRL" },
      { unit_price: 25, quantity: 2, currency_id: "BRL" },
    ],
  };
  // 100*1 + 25*2 = 150,00 = 15000 centavos
  assert.deepEqual(checkReconciliation(charge, preference, CHARGE_ID), { ok: true });
});

/*
  O estado da manutenção, a partir do que o Mercado Pago relata. statusFrom
  vem direto de src/lib/mercadopago/notice.ts — a mesma regra do Pulse, e é
  o que maintenance/billing.ts chama; não é reexportado por plan.ts (um
  reexport de valor puxaria node:crypto para o pacote do ClientForm, um
  componente de cliente que importa plan.ts só pelo preço e pelos rótulos).

  Antes desta dedup, a manutenção tinha a sua própria statusFrom que só
  reconhecia "cancelled" (duas letras L); "canceled" (uma letra L) caía no
  `else` e virava "active". Este arquivo prova que isso não acontece mais.
*/

import test from "node:test";
import assert from "node:assert/strict";

import { asMaintenanceStatus, MAINTENANCE_STATUSES } from "../src/lib/maintenance/plan.ts";
import { statusFrom } from "../src/lib/mercadopago/notice.ts";

test("as duas grafias de cancelado viram 'cancelled'", () => {
  assert.equal(statusFrom({ status: "cancelled" }), "cancelled");
  assert.equal(statusFrom({ status: "canceled" }), "cancelled");
});

test("pending e paused, como antes", () => {
  assert.equal(statusFrom({ status: "pending" }), "pending");
  assert.equal(statusFrom({ status: "paused" }), "past_due");
});

test("authorized sem cobrança falhada é 'active'", () => {
  assert.equal(statusFrom({ status: "authorized" }), "active");
});

test("authorized com a última cobrança recusada é 'past_due'", () => {
  assert.equal(statusFrom({ status: "authorized" }, { payment: { status: "rejected" } }), "past_due");
});

test("MAINTENANCE_STATUSES continua com os mesmos quatro valores", () => {
  assert.deepEqual(MAINTENANCE_STATUSES, ["pending", "active", "past_due", "cancelled"]);
});

test("asMaintenanceStatus aceita um valor válido e recusa o resto", () => {
  assert.equal(asMaintenanceStatus("active"), "active");
  assert.equal(asMaintenanceStatus("qualquer-coisa"), null);
  assert.equal(asMaintenanceStatus(null), null);
});

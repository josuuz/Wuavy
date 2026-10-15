/*
  O estado da manutenção, a partir do que o Mercado Pago relata — a mesma
  regra do Pulse (src/lib/mercadopago/notice.ts), reexportada por plan.ts.
  Antes desta dedup, plan.ts tinha a sua própria statusFrom que só reconhecia
  "cancelled" (duas letras L); "canceled" (uma letra L) caía no `else` e virava
  "active". Este arquivo prova que isso não acontece mais.
*/

import test from "node:test";
import assert from "node:assert/strict";

import { asMaintenanceStatus, MAINTENANCE_STATUSES, statusFrom } from "../src/lib/maintenance/plan.ts";

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

/*
  O estado de uma cobrança única (lib/billing/charge-status.ts), a partir do
  que o Mercado Pago relata sobre um pagamento. Só 5 estados existem para o
  painel — pendente, aprovado, recusado, cancelado, reembolsado — e nenhum
  valor desconhecido pode virar "aprovado" por acidente.
*/

import test from "node:test";
import assert from "node:assert/strict";

import { chargeStatusFrom, paymentBucket } from "../src/lib/billing/charge-status.ts";

test("approved e authorized contam como aprovado", () => {
  assert.equal(paymentBucket("approved"), "approved");
  assert.equal(paymentBucket("authorized"), "approved");
});

test("in_process, in_mediation e pending contam como pendente", () => {
  assert.equal(paymentBucket("in_process"), "pending");
  assert.equal(paymentBucket("in_mediation"), "pending");
  assert.equal(paymentBucket("pending"), "pending");
});

test("rejected, cancelled e refunded/charged_back mantêm o nome ou vão para reembolsado", () => {
  assert.equal(paymentBucket("rejected"), "rejected");
  assert.equal(paymentBucket("cancelled"), "cancelled");
  assert.equal(paymentBucket("refunded"), "refunded");
  assert.equal(paymentBucket("charged_back"), "refunded");
});

test("um valor que o Mercado Pago nunca documentou nunca vira 'aprovado' por acidente", () => {
  assert.equal(paymentBucket("qualquer-coisa-nova"), "pending");
  assert.equal(paymentBucket(""), "pending");
});

test("sem nenhum pagamento ainda, a cobrança é pendente", () => {
  assert.equal(chargeStatusFrom([]), "pending");
});

test("um pagamento aprovado vence, mesmo que não seja o mais recente", () => {
  const payments = [
    { status: "rejected", created_at: "2026-02-01T00:00:00Z" },
    { status: "approved", created_at: "2026-01-01T00:00:00Z" },
  ];
  assert.equal(chargeStatusFrom(payments), "approved");
});

test("sem nenhum aprovado, o pagamento mais recente decide", () => {
  const payments = [
    { status: "rejected", created_at: "2026-01-01T00:00:00Z" },
    { status: "cancelled", created_at: "2026-02-01T00:00:00Z" },
  ];
  assert.equal(chargeStatusFrom(payments), "cancelled");
});

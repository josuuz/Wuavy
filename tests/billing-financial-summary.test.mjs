/*
  As contas do painel financeiro (lib/billing/financial-summary.ts).

  O que estes testes protegem é uma regra de negócio, não uma fórmula: nenhum
  número de "recebido" pode sair de algo que não seja um registro de pagamento.
  Em particular, "authorized" no Mercado Pago é cartão reservado, não dinheiro
  creditado — e charge-status.ts junta os dois no mesmo balde de propósito
  (para o painel operacional), então é aqui que a separação tem de existir.

  Nenhum banco, nenhuma rede: funções puras, dados sintéticos.
*/

import test from "node:test";
import assert from "node:assert/strict";

import {
  consolidate,
  nothingYet,
  paymentEvidence,
  summarizeCharges,
  summarizeMaintenance,
  summarizePulse,
} from "../src/lib/billing/financial-summary.ts";

const PULSE_PRICE = 29_700;

test("só 'accredited' prova que o dinheiro entrou", () => {
  assert.equal(paymentEvidence({ status: "approved", status_detail: "accredited" }), "received");
});

test("aprovado sem crédito confirmado fica em 'authorized', nunca em recebido", () => {
  // charges.ts grava status_detail = payment.status_detail ?? payment.status,
  // então um "authorized" do Mercado Pago chega aqui das duas formas.
  assert.equal(paymentEvidence({ status: "approved", status_detail: "pending_capture" }), "authorized");
  assert.equal(paymentEvidence({ status: "approved", status_detail: "authorized" }), "authorized");
  assert.equal(paymentEvidence({ status: "approved", status_detail: null }), "authorized");
  assert.equal(paymentEvidence({ status: "approved" }), "authorized");
});

test("um status_detail que o Mercado Pago documente amanhã não vira receita sozinho", () => {
  assert.equal(paymentEvidence({ status: "approved", status_detail: "algo_novo_qualquer" }), "authorized");
});

test("'accredited' é lido sem se importar com caixa ou espaço em volta", () => {
  assert.equal(paymentEvidence({ status: "approved", status_detail: " Accredited " }), "received");
});

test("pendente, recusado, cancelado e reembolsado não provam nada", () => {
  for (const status of ["pending", "rejected", "cancelled", "refunded"]) {
    assert.equal(paymentEvidence({ status, status_detail: "accredited" }), "none", status);
  }
});

test("o Pulse conta por estado, e em atraso conta como cobrando", () => {
  const pulse = summarizePulse(
    [
      { status: "active" },
      { status: "active" },
      { status: "past_due" },
      { status: "pending" },
      { status: "cancelled" },
      { status: "cancelled" },
    ],
    PULSE_PRICE,
  );
  assert.equal(pulse.active, 2);
  assert.equal(pulse.pastDue, 1);
  assert.equal(pulse.pending, 1);
  assert.equal(pulse.cancelled, 2);
  assert.equal(pulse.subscribers, 3);
  assert.equal(pulse.estimatedMrrCents, 3 * PULSE_PRICE);
});

test("pendente e cancelada ficam fora da projeção do Pulse", () => {
  const pulse = summarizePulse([{ status: "pending" }, { status: "cancelled" }], PULSE_PRICE);
  assert.equal(pulse.subscribers, 0);
  assert.equal(pulse.estimatedMrrCents, 0);
});

test("uma clínica ativada à mão não entra na projeção: ninguém sabe quanto ela paga", () => {
  // provider 'manual' (migration 0004): contratou direto, sem assinatura no
  // Mercado Pago. Somá-la pelo preço de referência seria inventar receita.
  const pulse = summarizePulse(
    [
      { status: "active", provider: "mercadopago" },
      { status: "active", provider: "manual" },
    ],
    PULSE_PRICE,
  );
  assert.equal(pulse.subscribers, 2);
  assert.equal(pulse.billedSubscribers, 1);
  assert.equal(pulse.manualSubscribers, 1);
  assert.equal(pulse.estimatedMrrCents, PULSE_PRICE);
});

test("só clínicas ativadas à mão: acesso liberado, projeção zero", () => {
  const pulse = summarizePulse([{ status: "active", provider: "manual" }, { status: "past_due", provider: "manual" }], PULSE_PRICE);
  assert.equal(pulse.subscribers, 2);
  assert.equal(pulse.manualSubscribers, 2);
  assert.equal(pulse.estimatedMrrCents, 0);
});

test("sem provider declarado, a assinatura conta como do Mercado Pago (o padrão do banco)", () => {
  const pulse = summarizePulse([{ status: "active" }], PULSE_PRICE);
  assert.equal(pulse.billedSubscribers, 1);
  assert.equal(pulse.manualSubscribers, 0);
  assert.equal(pulse.estimatedMrrCents, PULSE_PRICE);
});

test("o Pulse não tem como devolver receita recebida: o campo não existe", () => {
  const pulse = summarizePulse([{ status: "active" }], PULSE_PRICE);
  assert.equal("receivedCents" in pulse, false);
  assert.equal("receivedCount" in pulse, false);
});

test("a projeção do Pulse diz qual preço usou, porque é estimativa", () => {
  const pulse = summarizePulse([{ status: "active" }], 19_900);
  assert.equal(pulse.referencePriceCents, 19_900);
  assert.equal(pulse.estimatedMrrCents, 19_900);
});

test("em Cobranças, uma autorização de cartão não entra na receita", () => {
  const charges = summarizeCharges(
    [
      { status: "approved", status_detail: "accredited", amount_cents: 150_000 },
      { status: "approved", status_detail: "pending_capture", amount_cents: 90_000 },
    ],
    [{ status: "approved" }, { status: "approved" }],
  );
  assert.equal(charges.receivedCents, 150_000);
  assert.equal(charges.receivedCount, 1);
  assert.equal(charges.authorizedCents, 90_000);
  assert.equal(charges.authorizedCount, 1);
});

test("recusado e reembolsado não somam em nada de Cobranças", () => {
  const charges = summarizeCharges(
    [
      { status: "rejected", status_detail: "cc_rejected_high_risk", amount_cents: 150_000 },
      { status: "refunded", status_detail: "refunded", amount_cents: 150_000 },
      { status: "pending", status_detail: "pending_waiting_payment", amount_cents: 150_000 },
    ],
    [{ status: "rejected" }, { status: "refunded" }, { status: "pending" }],
  );
  assert.equal(charges.receivedCents, 0);
  assert.equal(charges.authorizedCents, 0);
  assert.equal(charges.rejectedCharges, 1);
  assert.equal(charges.refundedCharges, 1);
  assert.equal(charges.pendingCharges, 1);
  assert.equal(charges.totalCharges, 3);
});

test("a manutenção soma o recebido pelo que o Mercado Pago marcou como pago", () => {
  const maintenance = summarizeMaintenance(
    [
      { status: "active", amount_cents: 4_000 },
      { status: "past_due", amount_cents: 6_000 },
      { status: "pending", amount_cents: 4_000 },
      { status: "cancelled", amount_cents: 4_000 },
    ],
    [
      { paid: true, amount_cents: 4_000 },
      { paid: true, amount_cents: 6_000 },
      { paid: false, amount_cents: 4_000 },
    ],
  );
  assert.equal(maintenance.mrrCents, 10_000);
  assert.equal(maintenance.earning, 2);
  assert.equal(maintenance.pending, 1);
  assert.equal(maintenance.late, 1);
  assert.equal(maintenance.receivedCents, 10_000);
  assert.equal(maintenance.receivedCount, 2);
});

test("uma cobrança de manutenção não paga não entra no recebido", () => {
  const maintenance = summarizeMaintenance([{ status: "active", amount_cents: 4_000 }], [{ paid: false, amount_cents: 4_000 }]);
  assert.equal(maintenance.receivedCents, 0);
  assert.equal(maintenance.mrrCents, 4_000);
});

test("no consolidado, o Pulse entra só na previsão — nunca no recebido", () => {
  const pulse = summarizePulse([{ status: "active" }, { status: "active" }], PULSE_PRICE);
  const charges = summarizeCharges([{ status: "approved", status_detail: "accredited", amount_cents: 150_000 }], [{ status: "approved" }]);
  const maintenance = summarizeMaintenance([{ status: "active", amount_cents: 4_000 }], [{ paid: true, amount_cents: 4_000 }]);
  const total = consolidate(pulse, charges, maintenance);

  assert.equal(total.receivedCents, 154_000);
  assert.equal(total.projectedMrrCents, 2 * PULSE_PRICE + 4_000);
  assert.equal(total.estimatedMrrCents, 2 * PULSE_PRICE);
});

test("o que foi só autorizado fica fora do recebido e fora da previsão", () => {
  const pulse = summarizePulse([], PULSE_PRICE);
  const charges = summarizeCharges([{ status: "approved", status_detail: "pending_capture", amount_cents: 90_000 }], [{ status: "approved" }]);
  const maintenance = summarizeMaintenance([], []);
  const total = consolidate(pulse, charges, maintenance);

  assert.equal(total.receivedCents, 0);
  assert.equal(total.projectedMrrCents, 0);
  assert.equal(total.awaitingCreditCents, 90_000);
});

test("vinte assinaturas do Pulse ativas não produzem um centavo de recebido", () => {
  const pulse = summarizePulse(
    Array.from({ length: 20 }, () => ({ status: "active" })),
    PULSE_PRICE,
  );
  const total = consolidate(pulse, summarizeCharges([], []), summarizeMaintenance([], []));
  assert.equal(total.receivedCents, 0);
  assert.equal(total.projectedMrrCents, 20 * PULSE_PRICE);
});

test("estado vazio: sem nada registrado, tudo é zero e a tela sabe que está vazia", () => {
  const pulse = summarizePulse([], PULSE_PRICE);
  const charges = summarizeCharges([], []);
  const maintenance = summarizeMaintenance([], []);
  const total = consolidate(pulse, charges, maintenance);

  assert.equal(total.receivedCents, 0);
  assert.equal(total.projectedMrrCents, 0);
  assert.equal(total.estimatedMrrCents, 0);
  assert.equal(total.awaitingCreditCents, 0);
  assert.equal(nothingYet(pulse, charges, maintenance), true);
});

test("estado vazio deixa de valer com uma assinatura do Pulse só pendente", () => {
  const pulse = summarizePulse([{ status: "pending" }], PULSE_PRICE);
  assert.equal(nothingYet(pulse, summarizeCharges([], []), summarizeMaintenance([], [])), false);
});

test("estado vazio deixa de valer com uma cobrança lançada, mesmo sem pagamento", () => {
  const charges = summarizeCharges([], [{ status: "pending" }]);
  assert.equal(nothingYet(summarizePulse([], PULSE_PRICE), charges, summarizeMaintenance([], [])), false);
});

test("estado vazio deixa de valer com uma assinatura de manutenção cobrando", () => {
  const maintenance = summarizeMaintenance([{ status: "active", amount_cents: 4_000 }], []);
  assert.equal(nothingYet(summarizePulse([], PULSE_PRICE), summarizeCharges([], []), maintenance), false);
});

// Qual linha responde pelo acesso quando a clínica tem várias: standingRow
// (lib/flow/access.ts). O bug que estes testes fecham é real e foi relatado
// pela primeira cliente: abrir o checkout cria uma linha 'pending' nova, e
// enquanto quem lia o acesso era "a linha mais recente", desistir no Mercado
// Pago jogava a clínica em modo só-consulta — mesmo com uma assinatura ativa,
// mesmo com um mês já pago correndo. Nada aqui fala com o Mercado Pago.
import test from "node:test";
import assert from "node:assert/strict";

import { clinicAccess, standingRow } from "../src/lib/flow/access.ts";

const HOJE = new Date("2026-11-01T12:00:00.000Z");
const dias = (n) => new Date(HOJE.getTime() + n * 86_400_000).toISOString();

/** Uma linha como o banco a devolve, só com o que o acesso lê. */
const linha = (id, status, extra = {}) => ({
  id,
  status,
  current_period_end: null,
  legacy_access_transition: false,
  legacy_transition_cleared_at: null,
  first_payment_confirmed_at: null,
  ...extra,
});

test("sem nenhuma linha não há o que escolher", () => {
  assert.equal(standingRow([], HOJE), null);
});

test("uma linha só: é ela, qualquer que seja o status", () => {
  assert.equal(standingRow([linha("a", "pending")], HOJE).id, "a");
  assert.equal(standingRow([linha("a", "active")], HOJE).id, "a");
  assert.equal(standingRow([linha("a", "cancelled")], HOJE).id, "a");
});

test("uma tentativa nova pendente não apaga a assinatura ativa — o caso relatado", () => {
  // Ordem como o banco entrega: da mais nova para a mais antiga.
  const rows = [linha("tentativa", "pending"), linha("ativa", "active", { current_period_end: dias(20) })];
  assert.equal(standingRow(rows, HOJE).id, "ativa");
  const access = clinicAccess(standingRow(rows, HOJE), HOJE);
  assert.equal(access.isReadOnly, false, "a clínica continua trabalhando");
  assert.equal(access.canEdit, true);
  assert.equal(access.subscriptionStatus, "active");
});

test("em atraso também libera: past_due avisa, nunca tranca, e uma tentativa nova não muda isso", () => {
  const rows = [linha("tentativa", "pending"), linha("atrasada", "past_due", { current_period_end: dias(-2) })];
  assert.equal(standingRow(rows, HOJE).id, "atrasada");
  assert.equal(clinicAccess(standingRow(rows, HOJE), HOJE).canEdit, true);
});

test("uma tentativa nova não elimina um mês já pago de uma assinatura cancelada", () => {
  const rows = [linha("tentativa", "pending"), linha("cancelada", "cancelled", { current_period_end: dias(10) })];
  assert.equal(standingRow(rows, HOJE).id, "cancelada");
  const access = clinicAccess(standingRow(rows, HOJE), HOJE);
  assert.equal(access.isReadOnly, false, "o mês pago é honrado até o fim");
  assert.equal(access.paidUntil, dias(10));
});

test("entre dois meses pagos, vale o que vai mais longe — nunca se tira dia já pago", () => {
  const rows = [
    linha("curta", "cancelled", { current_period_end: dias(3) }),
    linha("longa", "cancelled", { current_period_end: dias(25) }),
  ];
  assert.equal(standingRow(rows, HOJE).id, "longa");
  assert.equal(standingRow([...rows].reverse(), HOJE).id, "longa", "a ordem não decide");
});

test("ativa ganha de um mês pago cancelado: é a prova mais forte, e dá a próxima cobrança", () => {
  const rows = [
    linha("ativa", "active", { current_period_end: dias(28) }),
    linha("cancelada", "cancelled", { current_period_end: dias(90) }),
  ];
  assert.equal(standingRow(rows, HOJE).id, "ativa");
});

test("um mês pago vencido não vale nada: a tentativa em curso volta a responder", () => {
  const rows = [linha("tentativa", "pending"), linha("cancelada", "cancelled", { current_period_end: dias(-1) })];
  assert.equal(standingRow(rows, HOJE).id, "tentativa");
  assert.equal(clinicAccess(standingRow(rows, HOJE), HOJE).isReadOnly, true);
});

test("a proteção de transição legada vale acima de uma tentativa nova, enquanto ela vale", () => {
  const rows = [linha("tentativa", "pending"), linha("legada", "pending", { legacy_access_transition: true })];
  assert.equal(standingRow(rows, HOJE).id, "legada");
  assert.equal(clinicAccess(standingRow(rows, HOJE), HOJE).canEdit, true);
});

test("encerrada a transição legada, ela não protege mais nada", () => {
  const paga = [
    linha("tentativa", "pending"),
    linha("legada", "pending", { legacy_access_transition: true, first_payment_confirmed_at: dias(-40) }),
  ];
  assert.equal(standingRow(paga, HOJE).id, "tentativa", "um pagamento de verdade já aconteceu");

  const limpa = [
    linha("tentativa", "pending"),
    linha("legada", "pending", { legacy_access_transition: true, legacy_transition_cleared_at: dias(-5) }),
  ];
  assert.equal(standingRow(limpa, HOJE).id, "tentativa", "uma decisão administrativa encerrou a proteção");
});

test("uma clínica nova sem pagamento nenhum nunca ganha acesso pago por esta regra", () => {
  // Duas tentativas, nenhuma prova financeira: segue só-consulta.
  const rows = [linha("segunda", "pending"), linha("primeira", "cancelled", { current_period_end: null })];
  assert.equal(standingRow(rows, HOJE).id, "segunda");
  const access = clinicAccess(standingRow(rows, HOJE), HOJE);
  assert.equal(access.isReadOnly, true);
  assert.equal(access.canEdit, false);
  assert.equal(access.canReachOut, false);
});

test("cancelar uma tentativa não elimina um período já pago por outra linha", () => {
  // A tentativa foi cancelada (nunca cobrou: sem período), e o mês pago segue.
  const rows = [
    linha("tentativa", "cancelled", { current_period_end: null }),
    linha("paga", "cancelled", { current_period_end: dias(12) }),
  ];
  assert.equal(standingRow(rows, HOJE).id, "paga");
  assert.equal(clinicAccess(standingRow(rows, HOJE), HOJE).paidUntil, dias(12));
});

test("uma linha legada cancelada que nunca cobrou NÃO devolve uso total a quem já pagou em outra linha", () => {
  // O achado da revisão de banco: a clínica legada trocou de pagador (a linha A, legada,
  // foi encerrada sem cobrar), pagou na linha B, cancelou, e o mês pago venceu. Sem esta
  // regra a linha A, "legada e sem prova", ganhava de B e a clínica usava de graça para sempre.
  const rows = [
    linha("B", "cancelled", { current_period_end: dias(-10), first_payment_confirmed_at: dias(-40) }),
    linha("A", "cancelled", { legacy_access_transition: true }),
  ];
  assert.equal(standingRow(rows, HOJE).id, "B", "a prova de pagamento de qualquer linha encerra a proteção legada");
  const access = clinicAccess(standingRow(rows, HOJE), HOJE);
  assert.equal(access.isReadOnly, true);
  assert.equal(access.canEdit, false);
});

test("sem prova de pagamento em NENHUMA linha, a transição legada segue protegendo — a regra não vira um buraco para o outro lado", () => {
  const rows = [linha("tentativa", "cancelled"), linha("legada", "cancelled", { legacy_access_transition: true })];
  assert.equal(standingRow(rows, HOJE).id, "legada");
  assert.equal(clinicAccess(standingRow(rows, HOJE), HOJE).canEdit, true);
});

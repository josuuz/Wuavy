// Quando o estado guardado de uma assinatura deixa de valer: lib/flow/access.ts.
// O webhook do Mercado Pago é o caminho normal, e falhar nele custa dinheiro na
// única direção que importa — uma assinatura cancelada lá que continuasse
// liberando o Pulse aqui. Nada nestes testes fala com o Mercado Pago.
import test from "node:test";
import assert from "node:assert/strict";

import { GRACE_DAYS, needsReread, clinicAccess, paidThrough, releases } from "../src/lib/flow/access.ts";

const HOJE = new Date("2026-10-14T12:00:00.000Z");
const dias = (n) => new Date(HOJE.getTime() - n * 86_400_000).toISOString();
const linha = (status, current_period_end) => ({ status, current_period_end });

test("uma assinatura dentro do período não é relida: o webhook dá conta", () => {
  assert.equal(needsReread(linha("active", dias(-20)), HOJE), false, "cobrança no futuro");
  assert.equal(needsReread(linha("active", dias(0)), HOJE), false, "vence hoje");
  assert.equal(needsReread(linha("active", dias(GRACE_DAYS - 1)), HOJE), false, "dentro da folga");
});

test("passada a folga sem aviso nenhum, o estado é relido do Mercado Pago", () => {
  assert.equal(needsReread(linha("active", dias(GRACE_DAYS + 1)), HOJE), true);
  assert.equal(needsReread(linha("active", dias(90)), HOJE), true, "três meses sem aviso");
});

test("em atraso também é relido: é o estado que mais depende de um aviso chegar", () => {
  assert.equal(needsReread(linha("past_due", dias(GRACE_DAYS + 1)), HOJE), true);
});

test("pendente e cancelada não são relidas: já mostram o mínimo, e reler não mudaria nada", () => {
  assert.equal(needsReread(linha("pending", dias(90)), HOJE), false);
  assert.equal(needsReread(linha("cancelled", dias(90)), HOJE), false);
});

test("sem data não há do que desconfiar: uma assinatura que nunca cobrou, uma clínica de antes das assinaturas", () => {
  assert.equal(needsReread(linha("active", null), HOJE), false);
  assert.equal(needsReread(linha(null, null), HOJE), false);
  assert.equal(needsReread(linha("active", "nem data é"), HOJE), false);
});

test("a folga é de dias, não de meses: um ciclo perdido não passa em branco", () => {
  assert.ok(GRACE_DAYS >= 1 && GRACE_DAYS <= 10, `GRACE_DAYS = ${GRACE_DAYS}`);
});

test("só ativa e em atraso abrem o Pulse, e relê-las é o que fecha uma que caducou", () => {
  for (const status of ["active", "past_due"]) {
    assert.equal(releases(status), true, status);
    assert.equal(needsReread(linha(status, dias(30)), HOJE), true, status);
  }
  for (const status of ["pending", "cancelled"]) {
    assert.equal(releases(status), false, status);
    assert.equal(clinicAccess(linha(status, null), HOJE).canEdit, false, status);
    assert.equal(clinicAccess(linha(status, null), HOJE).canReachOut, false, status);
  }
});

test("em atraso avisa e não bloqueia: o Mercado Pago ainda está retentando", () => {
  const access = clinicAccess(linha("past_due", dias(-20)), HOJE);
  assert.equal(access.isReadOnly, false);
  assert.equal(access.canEdit, true);
  assert.equal(access.canReachOut, true);
});

// ── Depois do cancelamento: o mês já pago (item dos Termos) ───

test("cancelada com o mês ainda corrente: o Pulse continua funcionando até o fim dele", () => {
  const fim = dias(-10); // a cobrança seguinte seria daqui a dez dias
  const access = clinicAccess(linha("cancelled", fim), HOJE);
  assert.equal(paidThrough(linha("cancelled", fim), HOJE), fim);
  assert.equal(access.canEdit, true, "ainda escreve");
  assert.equal(access.canReachOut, true, "ainda manda mensagem");
  assert.equal(access.isReadOnly, false);
  assert.equal(access.paidUntil, fim, "a tela diz até quando");
  assert.equal(access.subscriptionStatus, "cancelled", "e continua dizendo que está cancelada");
  assert.equal(access.nextCharge, null, "nada mais será cobrado: não há próxima cobrança");
});

test("passado o mês pago, a clínica cancelada fica só para consulta", () => {
  const access = clinicAccess(linha("cancelled", dias(1)), HOJE);
  assert.equal(paidThrough(linha("cancelled", dias(1)), HOJE), null);
  assert.equal(access.canEdit, false);
  assert.equal(access.canReachOut, false);
  assert.equal(access.isReadOnly, true);
  assert.equal(access.paidUntil, null);
});

test("cancelada sem data nenhuma não ganha um mês de graça", () => {
  assert.equal(paidThrough(linha("cancelled", null), HOJE), null);
  assert.equal(clinicAccess(linha("cancelled", null), HOJE).canEdit, false);
  assert.equal(paidThrough(linha("cancelled", "nem data é"), HOJE), null);
});

test("só o cancelamento ganha o mês pago: pendente com data no futuro continua só consulta", () => {
  // Um pagamento em processamento nunca foi pago; não há mês a preservar.
  assert.equal(paidThrough(linha("pending", dias(-10)), HOJE), null);
  assert.equal(clinicAccess(linha("pending", dias(-10)), HOJE).canEdit, false);
});

test("uma clínica de antes das assinaturas (sem linha) segue com tudo, como tinha", () => {
  for (const sem of [null, linha(null, null)]) {
    const access = clinicAccess(sem, HOJE);
    assert.equal(access.canEdit, true);
    assert.equal(access.subscriptionStatus, null);
  }
});

test("ativa mostra a próxima cobrança; cancelada e pendente não mostram nenhuma", () => {
  assert.equal(clinicAccess(linha("active", dias(-30)), HOJE).nextCharge, dias(-30));
  assert.equal(clinicAccess(linha("past_due", dias(-5)), HOJE).nextCharge, dias(-5));
  assert.equal(clinicAccess(linha("cancelled", dias(-5)), HOJE).nextCharge, null);
  assert.equal(clinicAccess(linha("pending", dias(-5)), HOJE).nextCharge, null);
});

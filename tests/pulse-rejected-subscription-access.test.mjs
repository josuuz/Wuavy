/*
  O bypass crítico: 'rejected' (migration 0020) é um estado só nosso — uma
  tentativa de criação recusada pelo Mercado Pago, que nunca chegou a existir
  lá — mas vira a linha "mais recente" de uma clínica se uma resubscrição
  falhar depois de uma assinatura real (ativa, ou cancelada com o mês ainda
  pago). lib/flow/access.ts:asStatus() não conhece 'rejected' e o lia como
  null, que clinicAccess() trata como "nunca existiu assinatura" — acesso
  total. Isto prova, contra lib/flow/session.ts DE VERDADE (não um fake de
  session.ts, que escondia exatamente este bug — tests/pulse-subscribe-
  integration.test.mjs só prova que a linha grava 'rejected', nunca o que
  acontece quando ela é lida de volta), que uma recusa de resubscrição nunca
  dá acesso total nem apaga o mês já pago de uma assinatura cancelada real.
*/

import { register } from "node:module";
import test from "node:test";
import assert from "node:assert/strict";

register("./helpers/pulse-session-loader.mjs", import.meta.url);

const { FakeServerClient, setFakeServerClient } = await import("./helpers/fake-server-client.mjs");
const { getSubscription, getClinicAccess } = await import("../src/lib/flow/session.ts");

const USER = { id: "user-1", email: "clinica@example.com" };
const ORG = "org-1";
const MEMBER = { user_id: USER.id, organization_id: ORG, name: "Clínica Teste", role: "owner", status: "active" };

/*
  created_at mais antigo primeiro: a ordem real de uma clínica que cancelou
  e depois tentou (e falhou) resubscrever. clinicAccess() compara
  current_period_end contra o relógio de verdade (sem como injetar "agora"
  por getClinicAccess()), então as datas abaixo são deliberadamente distantes
  do presente — passado e futuro robustos, não perto de "hoje".
*/
const T1 = "2020-09-01T12:00:00.000Z";
const T2 = "2020-10-01T12:00:00.000Z"; // a tentativa de resubscrição, depois da real.

function setup({ subscriptions }) {
  setFakeServerClient(new FakeServerClient({ user: USER, tables: { members: [MEMBER], subscriptions } }));
}

const rejectedRow = (overrides = {}) => ({
  id: "sub-rejected",
  status: "rejected",
  organization_id: ORG,
  provider_subscription_id: null,
  current_period_end: null,
  creation_blocked_at: null,
  created_at: T2,
  ...overrides,
});

test("resubscrição recusada depois do cancelamento: não ganha acesso total, nem apaga o mês já pago", async () => {
  const fim = "2099-01-01T00:00:00.000Z"; // robustamente no futuro: o mês já pago continua valendo.
  setup({
    subscriptions: [
      { id: "sub-real", status: "cancelled", organization_id: ORG, provider_subscription_id: "preapproval-1", current_period_end: fim, creation_blocked_at: null, created_at: T1 },
      rejectedRow(),
    ],
  });

  const current = await getSubscription();
  assert.equal(current.id, "sub-real", "a linha recusada nunca é 'a assinatura', mesmo sendo a mais recente");
  assert.equal(current.status, "cancelled");

  const access = await getClinicAccess();
  assert.equal(access.isReadOnly, false, "o mês já pago ainda está correndo");
  assert.equal(access.canEdit, true);
  assert.equal(access.canReachOut, true);
  assert.equal(access.paidUntil, fim, "a recusa de resubscrição não apaga o mês já pago");
});

test("resubscrição recusada depois do mês pago já ter acabado: fica só para consulta, nunca acesso total", async () => {
  const fim = "2020-08-01T00:00:00.000Z"; // robustamente no passado: o mês já pago já acabou.
  setup({
    subscriptions: [
      { id: "sub-real", status: "cancelled", organization_id: ORG, provider_subscription_id: "preapproval-1", current_period_end: fim, creation_blocked_at: null, created_at: T1 },
      rejectedRow(),
    ],
  });

  const access = await getClinicAccess();
  assert.equal(access.isReadOnly, true, "sem isto, a linha 'rejected' colapsa para null e clinicAccess() devolve acesso total");
  assert.equal(access.canEdit, false);
  assert.equal(access.canReachOut, false);
  assert.equal(access.paidUntil, null);
});

test("uma assinatura ativa nunca fica escondida por uma recusa de resubscrição mais recente", async () => {
  setup({
    subscriptions: [
      { id: "sub-real", status: "active", organization_id: ORG, provider_subscription_id: null, current_period_end: null, creation_blocked_at: null, created_at: T1 },
      rejectedRow(),
    ],
  });

  const current = await getSubscription();
  assert.equal(current.id, "sub-real");
  assert.equal(current.status, "active");

  const access = await getClinicAccess();
  assert.equal(access.isReadOnly, false);
  assert.equal(access.canEdit, true);
});

test("clínica sem nenhuma assinatura de verdade, só a recusada: sem regressão, continua a mesma (grandfather)", async () => {
  setup({ subscriptions: [rejectedRow()] });

  const current = await getSubscription();
  assert.equal(current, null, "a única linha é a recusada: para efeitos de acesso, não há assinatura nenhuma");

  const access = await getClinicAccess();
  assert.equal(access.canEdit, true, "o mesmo acesso total de uma clínica de antes das assinaturas — não é regressão, é a mesma regra");
  assert.equal(access.isReadOnly, false);
});

/*
  Transição legada (migration 0017): a coluna existe há semanas sem nenhum
  código a usar — src/lib/flow/access.ts/session.ts nunca liam
  legacy_access_transition nem legacy_transition_cleared_at. Sem isto, a
  PRIMEIRA assinatura de uma clínica que já existe (legada, sem nenhuma linha
  antes) virava só-consulta assim que a linha 'pending' era criada, antes do
  Mercado Pago sequer responder — exatamente o que a 0017 existe para evitar.
*/

test("12) transição legada: pending bloqueada para reconciliação mantém acesso total, nunca some sozinha por timeout", async () => {
  setup({
    subscriptions: [
      {
        id: "sub-legacy",
        status: "pending",
        organization_id: ORG,
        provider_subscription_id: null,
        current_period_end: null,
        creation_blocked_at: new Date().toISOString(),
        legacy_access_transition: true,
        legacy_transition_cleared_at: null,
        created_at: T1,
      },
    ],
  });

  const access = await getClinicAccess();
  assert.equal(access.isReadOnly, false, "a proteção cobre pending E bloqueada — o mesmo estado que uma reconciliação ainda não resolveu");
  assert.equal(access.canEdit, true);
});

test("13) transição legada encerrada por decisão administrativa (legacy_transition_cleared_at): volta a ser só-consulta", async () => {
  setup({
    subscriptions: [
      {
        id: "sub-legacy",
        status: "pending",
        organization_id: ORG,
        provider_subscription_id: null,
        current_period_end: null,
        creation_blocked_at: null,
        legacy_access_transition: true,
        legacy_transition_cleared_at: "2026-10-01T00:00:00.000Z",
        created_at: T1,
      },
    ],
  });

  const access = await getClinicAccess();
  assert.equal(access.isReadOnly, true, "limpa à mão encerra a proteção mesmo sem nenhum pagamento confirmado");
  assert.equal(access.canEdit, false);
});

test("14) transição legada some sozinha assim que o pagamento é confirmado (status active) — nunca depende da limpeza administrativa", async () => {
  setup({
    subscriptions: [
      {
        id: "sub-legacy",
        status: "active",
        organization_id: ORG,
        provider_subscription_id: "preapproval-legacy",
        current_period_end: null,
        creation_blocked_at: null,
        legacy_access_transition: true,
        legacy_transition_cleared_at: null,
        created_at: T1,
      },
    ],
  });

  const access = await getClinicAccess();
  assert.equal(access.isReadOnly, false);
  assert.equal(access.canEdit, true);
});

test("16) transição legada: depois de um pagamento confirmado, cancelar e vencer o período NUNCA recupera o acesso total pela exceção antiga", async () => {
  const fimVencido = "2020-08-01T00:00:00.000Z"; // robustamente no passado
  setup({
    subscriptions: [
      {
        id: "sub-legacy-done",
        status: "cancelled",
        organization_id: ORG,
        provider_subscription_id: "preapproval-legacy-done",
        current_period_end: fimVencido,
        creation_blocked_at: null,
        legacy_access_transition: true,
        legacy_transition_cleared_at: null,
        first_payment_confirmed_at: "2020-07-01T00:00:00.000Z", // pagou de verdade, uma vez, antes de cancelar
        created_at: T1,
      },
    ],
  });

  const access = await getClinicAccess();
  assert.equal(access.isReadOnly, true, "pagou, cancelou, venceu — vira uma cancelada comum sem mês pago, nunca mais a exceção legada");
  assert.equal(access.canEdit, false);
});

test("17) transição legada: mesma clínica, ainda dentro do mês pago depois de cancelar — FULL pelo paidThrough normal, não pela exceção legada", async () => {
  const fimFuturo = "2099-01-01T00:00:00.000Z";
  setup({
    subscriptions: [
      {
        id: "sub-legacy-paid-now",
        status: "cancelled",
        organization_id: ORG,
        provider_subscription_id: "preapproval-legacy-paid-now",
        current_period_end: fimFuturo,
        creation_blocked_at: null,
        legacy_access_transition: true,
        legacy_transition_cleared_at: null,
        first_payment_confirmed_at: "2020-07-01T00:00:00.000Z",
        created_at: T1,
      },
    ],
  });

  const access = await getClinicAccess();
  assert.equal(access.isReadOnly, false);
  assert.equal(access.paidUntil, fimFuturo, "o mês pago aparece certo — a exceção legada não mascara mais o paidUntil depois do pagamento confirmado");
});

test("15) pending comum (sem transição legada) continua só-consulta como sempre — a proteção nunca vaza para quem não é legada", async () => {
  setup({
    subscriptions: [
      {
        id: "sub-comum",
        status: "pending",
        organization_id: ORG,
        provider_subscription_id: null,
        current_period_end: null,
        creation_blocked_at: null,
        legacy_access_transition: false,
        legacy_transition_cleared_at: null,
        created_at: T1,
      },
    ],
  });

  const access = await getClinicAccess();
  assert.equal(access.isReadOnly, true, "sem a proteção, pending continua só-consulta — comportamento inalterado");
  assert.equal(access.canEdit, false);
});

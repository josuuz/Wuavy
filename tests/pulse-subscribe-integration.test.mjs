/*
  Testes de integração do checkout do Pulse (subscribe()/check(),
  claimSubscriptionCreation/persistSubscriptionId/blockSubscriptionCreation/
  recordSubscriptionRefusal) — contra o código REAL, não uma reimplementação.
  Mesmo ambiente das Cobranças (tests/billing-integration.test.mjs): Supabase
  em memória (fake-admin.mjs), sessão/assinatura controláveis (fake-session.
  mjs), Mercado Pago simulado por um mock local de fetch. Nenhuma rede,
  nenhuma credencial real; as credenciais abaixo são fictícias, só para
  passar a checagem de ambiente de lib/mercadopago/environment.ts.

  O que isto prova: depois que o Mercado Pago cria a assinatura, nada é
  relatado como recusa; um resultado indeterminado trava a linha em vez de
  tentar de novo sozinho; duas tentativas simultâneas para a mesma linha
  nunca chamam o Mercado Pago as duas; e uma recusa confirmada fica
  registrada (nunca apagada).
*/

import { register } from "node:module";
import test from "node:test";
import assert from "node:assert/strict";

register("./helpers/pulse-loader.mjs", import.meta.url);

process.env.MERCADOPAGO_ACCESS_TOKEN = "APP_USR-teste-ficticio-0000000000";
process.env.MERCADOPAGO_ENV = "test";
process.env.MERCADOPAGO_TEST_PAYER_EMAIL = "comprador-teste@example.com";
process.env.NEXT_PUBLIC_SITE_URL = "https://teste.example.com";

const { FakeAdmin, setFakeAdminClient } = await import("./helpers/fake-admin.mjs");
const { setFakeSession, setFakeSubscription } = await import("./helpers/fake-session.mjs");
const billing = await import("../src/lib/flow/billing.ts");
const actions = await import("../src/app/(app)/pulse/assinar/actions.ts");

const VALID_TOKEN = "tok-1234567890abcdef";
const USER = { user: { id: "user-1", email: "cliente@example.com" }, member: null };

function withFetchMock(handler, run) {
  const original = globalThis.fetch;
  globalThis.fetch = handler;
  return run().finally(() => {
    globalThis.fetch = original;
  });
}

const jsonResponse = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

function freshRow(id, overrides = {}) {
  return {
    id,
    user_id: USER.user.id,
    organization_id: null,
    provider: "mercadopago",
    provider_subscription_id: null,
    status: "pending",
    started_at: null,
    current_period_end: null,
    creation_claimed_at: null,
    creation_blocked_at: null,
    last_refusal_http_status: null,
    last_refusal_detail: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

function setup(rows = []) {
  const admin = new FakeAdmin({ subscriptions: rows });
  setFakeAdminClient(admin);
  setFakeSession(USER);
  return admin;
}

// ── 1. Assinatura aprovada normalmente ──────────────────────────

test("1) aprovada: cria, salva o id, sincroniza como ativa", async () => {
  const admin = setup([]);
  setFakeSubscription(null);

  const result = await withFetchMock(async (url) => {
    if (url.includes("/authorized_payments/search")) return jsonResponse(200, { results: [] });
    if (url.endsWith("/preapproval") || url.includes("/preapproval/preapproval-1")) {
      return jsonResponse(201, { id: "preapproval-1", status: "authorized" });
    }
    throw new Error("chamada inesperada: " + url);
  }, () => actions.subscribe({ token: VALID_TOKEN, email: "cliente@example.com" }));

  assert.deepEqual(result, { outcome: "active" });
  const rows = admin.tables.get("subscriptions").rows;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].provider_subscription_id, "preapproval-1");
  assert.equal(rows[0].status, "active");
  assert.equal(rows[0].creation_claimed_at, null);
  assert.equal(rows[0].creation_blocked_at, null);
});

// ── 2. Cartão recusado pelo antifraude ───────────────────────────

test("2) recusado (cc_rejected_high_risk): 'rejected', a linha fica — nunca apagada, nunca bloqueada", async () => {
  const admin = setup([]);
  setFakeSubscription(null);

  const result = await withFetchMock(
    async (url) => {
      if (url.endsWith("/preapproval")) {
        return { ok: false, status: 400, json: async () => ({ message: "rejected", cause: [{ description: "cc_rejected_high_risk" }] }) };
      }
      throw new Error("chamada inesperada: " + url);
    },
    () => actions.subscribe({ token: VALID_TOKEN, email: "cliente@example.com" }),
  );

  assert.equal(result.outcome, "rejected");
  const rows = admin.tables.get("subscriptions").rows;
  assert.equal(rows.length, 1, "a linha não foi apagada");
  assert.equal(rows[0].status, "rejected");
  assert.equal(rows[0].provider_subscription_id, null);
  assert.equal(rows[0].last_refusal_http_status, 400);
  assert.equal(rows[0].creation_blocked_at, null, "recusa confirmada nunca bloqueia");
  assert.equal(rows[0].creation_claimed_at, null);
});

// ── 3. Erro do Supabase após a criação ter sido aceita ──────────

test("3) o Mercado Pago cria, mas salvar o id falha sempre: 'unresolved', nunca 'rejected' — e nunca perde o id sozinho", async () => {
  const row = freshRow("row-3");
  const admin = setup([row]);
  setFakeSubscription(row);

  const result = await withFetchMock(async (url) => {
    if (url.endsWith("/preapproval")) {
      // O Mercado Pago aceita; é só a partir daqui que o Supabase "cai".
      admin.setWritesFailing(true);
      return jsonResponse(201, { id: "preapproval-3", status: "authorized" });
    }
    throw new Error("chamada inesperada: " + url);
  }, () => actions.subscribe({ token: VALID_TOKEN, email: "cliente@example.com" }));

  assert.equal(result.outcome, "unresolved");
  assert.notEqual(result.outcome, "rejected", "nunca afirma recusa quando a assinatura pode já existir");
  const saved = admin.row("subscriptions", "row-3");
  assert.equal(saved.provider_subscription_id, null, "o id não foi salvo — por isso precisa ficar travada, não apagada");

  // Autocura: quando o Supabase volta e a reserva (abandonada) venceu, a
  // PRÓXIMA leitura trava sozinha, mesmo sem o bloqueio explícito ter confirmado.
  admin.setWritesFailing(false);
  saved.creation_claimed_at = new Date(Date.now() - 60_000).toISOString();
  const nextClaim = await billing.claimSubscriptionCreation("row-3");
  assert.equal(nextClaim, "blocked");
});

// ── 4. Falha de rede antes da criação ────────────────────────────

test("4a) falha de rede antes de qualquer resposta: 'unresolved', status continua 'pending' (nunca 'rejected')", async () => {
  const row = freshRow("row-4a");
  const admin = setup([row]);
  setFakeSubscription(row);

  const result = await withFetchMock(async () => {
    throw new Error("fetch failed (simulado)");
  }, () => actions.subscribe({ token: VALID_TOKEN, email: "cliente@example.com" }));

  assert.equal(result.outcome, "unresolved");
  const saved = admin.row("subscriptions", "row-4a");
  assert.equal(saved.status, "pending");
  assert.equal(saved.provider_subscription_id, null);
  assert.ok(saved.creation_blocked_at, "trava para reconciliação manual");
});

// ── 5. Falha na consulta de sincronização, depois de criar com sucesso ──

test("5) cria e salva o id, mas a sincronização final falha: 'pending', o id fica salvo mesmo assim", async () => {
  const row = freshRow("row-5");
  const admin = setup([row]);
  setFakeSubscription(row);
  let getCalls = 0;

  const result = await withFetchMock(async (url) => {
    if (url.endsWith("/preapproval")) return jsonResponse(201, { id: "preapproval-5", status: "authorized" });
    if (url.includes("/preapproval/preapproval-5")) {
      getCalls += 1;
      throw new Error("timeout (simulado) na confirmação");
    }
    throw new Error("chamada inesperada: " + url);
  }, () => actions.subscribe({ token: VALID_TOKEN, email: "cliente@example.com" }));

  assert.equal(result.outcome, "pending");
  assert.equal(getCalls, 1);
  const saved = admin.row("subscriptions", "row-5");
  assert.equal(saved.provider_subscription_id, "preapproval-5", "o id foi salvo mesmo com a confirmação falhando depois");
  assert.equal(saved.status, "pending");
});

// ── 6. Webhook duplicado ou atrasado ─────────────────────────────

test("6) sincronizar duas vezes com a mesma resposta escreve o mesmo estado, e limpa uma reserva/bloqueio antigo", async () => {
  const row = freshRow("row-6", { provider_subscription_id: "preapproval-6", creation_blocked_at: new Date().toISOString() });
  const admin = setup([row]);

  const run = () =>
    withFetchMock(async (url) => {
      if (url.includes("/authorized_payments/search")) return jsonResponse(200, { results: [] });
      if (url.includes("/preapproval/preapproval-6")) return jsonResponse(200, { id: "preapproval-6", status: "authorized", external_reference: "row-6" });
      throw new Error("chamada inesperada: " + url);
    }, () => billing.syncSubscription("preapproval-6"));

  const first = await run();
  const afterFirst = { ...admin.row("subscriptions", "row-6") };
  const second = await run();
  const afterSecond = admin.row("subscriptions", "row-6");

  assert.equal(first, "active");
  assert.equal(second, "active");
  assert.equal(afterFirst.status, afterSecond.status);
  assert.equal(afterFirst.provider_subscription_id, afterSecond.provider_subscription_id);
  assert.equal(afterSecond.creation_blocked_at, null, "a confirmação do Mercado Pago limpa um bloqueio antigo");
});

// ── 7. Cliques repetidos no botão de contratação ─────────────────

test("7) duas reivindicações simultâneas na mesma linha: só uma 'claimed', a outra 'in_progress'", async () => {
  const row = freshRow("row-7");
  setup([row]);

  const [first, second] = await Promise.all([billing.claimSubscriptionCreation("row-7"), billing.claimSubscriptionCreation("row-7")]);
  assert.deepEqual([first, second].sort(), ["claimed", "in_progress"]);
});

// ── 8. Nova tentativa com uma operação anterior indeterminada ───

test("8) reserva abandonada (>30s): 'blocked', e subscribe() nunca chega a chamar o Mercado Pago", async () => {
  const row = freshRow("row-8", { creation_claimed_at: new Date(Date.now() - 60_000).toISOString() });
  setup([row]);
  setFakeSubscription(row);

  let mpCalls = 0;
  const result = await withFetchMock(async (url) => {
    mpCalls += 1;
    throw new Error("não deveria chamar o Mercado Pago: " + url);
  }, () => actions.subscribe({ token: VALID_TOKEN, email: "cliente@example.com" }));

  assert.equal(result.outcome, "unresolved");
  assert.equal(mpCalls, 0, "uma tentativa anterior indeterminada nunca libera uma segunda chamada automática");
});

// ── 9. Corrida de inserção: duas abas/cliques simultâneos de quem ainda não tem clínica ──
// Achado da revisão independente (ecc:database-reviewer) sobre a correção de
// concorrência: claimSubscriptionCreation reserva por linha, não por pessoa.
// Migration 0021 (subscriptions_one_live_per_user) fecha isto no banco; aqui
// prova-se o lado do código que lê o 23505 dessa corrida (actions.ts).

function setupRace(winnerOverrides = {}) {
  const winner = freshRow("sub-winner", winnerOverrides);
  const admin = new FakeAdmin(
    { subscriptions: [winner] },
    {
      uniqueConstraints: {
        subscriptions: [
          { columns: ["user_id"], where: (row) => row.organization_id === null && row.status !== "cancelled" && row.status !== "rejected" },
        ],
      },
    },
  );
  setFakeAdminClient(admin);
  setFakeSession(USER);
  setFakeSubscription(null); // esta requisição nunca viu a linha vencedora — a mesma corrida real.
  return admin;
}

test("9a) perdeu a corrida de inserção (23505), vencedora ainda livre: usa a linha vencedora, nunca cria uma segunda", async () => {
  const admin = setupRace();

  const result = await withFetchMock(async (url) => {
    if (url.includes("/authorized_payments/search")) return jsonResponse(200, { results: [] });
    if (url.endsWith("/preapproval") || url.includes("/preapproval/preapproval-winner")) {
      return jsonResponse(201, { id: "preapproval-winner", status: "authorized" });
    }
    throw new Error("chamada inesperada: " + url);
  }, () => actions.subscribe({ token: VALID_TOKEN, email: "cliente@example.com" }));

  assert.equal(result.outcome, "active");
  const rows = admin.tables.get("subscriptions").rows;
  assert.equal(rows.length, 1, "nunca cria uma segunda linha quando perde a corrida");
  assert.equal(rows[0].id, "sub-winner");
  assert.equal(rows[0].provider_subscription_id, "preapproval-winner");
});

test("9b) perdeu a corrida, vencedora já ativa: 'active' direto, nunca chama o Mercado Pago de novo", async () => {
  const admin = setupRace({ status: "active", provider_subscription_id: "preapproval-winner" });

  let mpCalls = 0;
  const result = await withFetchMock(async (url) => {
    mpCalls += 1;
    throw new Error("não deveria chamar o Mercado Pago: " + url);
  }, () => actions.subscribe({ token: VALID_TOKEN, email: "cliente@example.com" }));

  assert.equal(result.outcome, "active");
  assert.equal(mpCalls, 0);
  assert.equal(admin.tables.get("subscriptions").rows.length, 1);
});

// ── 10. blockSubscriptionCreation nunca re-bloqueia uma linha já resolvida ──
// Achado da revisão independente: sem o guard em provider_subscription_id
// null, um bloqueio tardio (depois de um timeout do nosso lado) podia
// sobrescrever uma linha que um webhook concorrente já tinha resolvido.

test("10) a linha resolveu sozinha (webhook) antes do bloqueio tardio chegar: nunca é re-bloqueada", async () => {
  const row = freshRow("row-10", { status: "active", provider_subscription_id: "preapproval-10", creation_claimed_at: new Date().toISOString() });
  const admin = setup([row]);

  const outcome = await billing.blockSubscriptionCreation("row-10");

  assert.equal(outcome, "saved", "nada a bloquear — a corrida já se resolveu sozinha, não é uma falha");
  const saved = admin.row("subscriptions", "row-10");
  assert.equal(saved.creation_blocked_at, null, "uma assinatura ativa nunca fica travada para reconciliação manual");
  assert.equal(saved.status, "active");
});

test("10b) sem resolução nenhuma, o bloqueio grava normalmente", async () => {
  const row = freshRow("row-10b");
  const admin = setup([row]);

  const outcome = await billing.blockSubscriptionCreation("row-10b");

  assert.equal(outcome, "saved");
  assert.ok(admin.row("subscriptions", "row-10b").creation_blocked_at, "o caso real (resultado incerto) ainda trava normalmente");
});

// ── 11. Transição legada (migration 0017): marcar só a linha certa, nunca mais que isso ──

test("11a) clínica já existente, nunca teve nenhuma linha antes: a nova pending nasce com legacy_access_transition=true", async () => {
  const admin = new FakeAdmin({ subscriptions: [] });
  setFakeAdminClient(admin);
  setFakeSession({ user: USER.user, member: { organization_id: "org-legacy" } });
  setFakeSubscription(null);

  const result = await withFetchMock(async (url) => {
    if (url.includes("/authorized_payments/search")) return jsonResponse(200, { results: [] });
    if (url.endsWith("/preapproval") || url.includes("/preapproval/preapproval-legacy")) {
      return jsonResponse(201, { id: "preapproval-legacy", status: "authorized" });
    }
    throw new Error("chamada inesperada: " + url);
  }, () => actions.subscribe({ token: VALID_TOKEN, email: "cliente@example.com" }));

  assert.equal(result.outcome, "active");
  const rows = admin.tables.get("subscriptions").rows;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].legacy_access_transition, true);
});

test("11b) clínica com só uma linha 'rejected' (não é legada): a nova pending nasce com legacy_access_transition=false", async () => {
  const oldRejected = freshRow("sub-old-rejected", { organization_id: "org-tried-before", status: "rejected" });
  const admin = new FakeAdmin({ subscriptions: [oldRejected] });
  setFakeAdminClient(admin);
  setFakeSession({ user: USER.user, member: { organization_id: "org-tried-before" } });
  setFakeSubscription(null); // getSubscription() de verdade também excluiria a rejected — aqui simulado direto

  await withFetchMock(async (url) => {
    if (url.includes("/authorized_payments/search")) return jsonResponse(200, { results: [] });
    if (url.endsWith("/preapproval") || url.includes("/preapproval/preapproval-retry")) {
      return jsonResponse(201, { id: "preapproval-retry", status: "authorized" });
    }
    throw new Error("chamada inesperada: " + url);
  }, () => actions.subscribe({ token: VALID_TOKEN, email: "cliente@example.com" }));

  const rows = admin.tables.get("subscriptions").rows;
  assert.equal(rows.length, 2, "a linha antiga recusada continua, mais a nova");
  const novaLinha = rows.find((r) => r.id !== "sub-old-rejected");
  assert.equal(novaLinha.legacy_access_transition, false, "só uma recusa antes não é transição legada — nunca vira acesso gratuito indevido");
});

test("11c) cliente novo sem clínica ainda: nunca é transição legada, mesmo sem nenhuma linha antes", async () => {
  const admin = setup([]);
  setFakeSubscription(null);

  await withFetchMock(async (url) => {
    if (url.includes("/authorized_payments/search")) return jsonResponse(200, { results: [] });
    if (url.endsWith("/preapproval") || url.includes("/preapproval/preapproval-new")) {
      return jsonResponse(201, { id: "preapproval-new", status: "authorized" });
    }
    throw new Error("chamada inesperada: " + url);
  }, () => actions.subscribe({ token: VALID_TOKEN, email: "cliente@example.com" }));

  const rows = admin.tables.get("subscriptions").rows;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].organization_id, null);
  assert.equal(rows[0].legacy_access_transition, false, "sem clínica ainda, a 0017 nunca se aplica — só quem já existe pode ser legada");
});

test("11d) o pagamento confirmado grava first_payment_confirmed_at na linha legada, uma vez, por prova financeira — nunca inferido do status", async () => {
  const row = freshRow("sub-legacy-pay", {
    organization_id: "org-legacy-pay",
    status: "pending",
    provider_subscription_id: "preapproval-legacy-pay",
    legacy_access_transition: true,
    first_payment_confirmed_at: null,
  });
  const admin = setup([row]);

  await withFetchMock(async (url) => {
    if (url.includes("/authorized_payments/search")) {
      return jsonResponse(200, {
        results: [{ id: 1, status: "processed", date_created: "2026-10-20T12:00:00.000Z", payment: { status: "approved" } }],
      });
    }
    if (url.includes("/preapproval/preapproval-legacy-pay")) {
      return jsonResponse(200, { id: "preapproval-legacy-pay", status: "authorized", external_reference: "sub-legacy-pay" });
    }
    throw new Error("chamada inesperada: " + url);
  }, () => billing.syncSubscription("preapproval-legacy-pay"));

  const saved = admin.row("subscriptions", "sub-legacy-pay");
  assert.ok(saved.first_payment_confirmed_at, "a primeira cobrança approved grava a prova financeira");
  assert.equal(saved.status, "active");
});

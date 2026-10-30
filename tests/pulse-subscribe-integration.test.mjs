/*
  Testes de integração do checkout hospedado do Pulse (subscribe()/check(),
  claimSubscriptionCreation/persistSubscriptionId/blockSubscriptionCreation/
  recordSubscriptionRefusal) — contra o código REAL, não uma reimplementação.
  Mesmo ambiente das Cobranças (tests/billing-integration.test.mjs): Supabase
  em memória (fake-admin.mjs), sessão/assinatura controláveis (fake-session.
  mjs), Mercado Pago simulado por um mock local de fetch. Nenhuma rede,
  nenhuma credencial real; as credenciais abaixo são fictícias, só para
  passar a checagem de ambiente de lib/mercadopago/environment.ts.

  O que isto prova: a criação não envia nenhum dado de cartão e termina
  redirecionando para o init_point que o Mercado Pago devolveu — nunca
  inventado; depois que o Mercado Pago cria a assinatura, nada é relatado
  como recusa; um resultado indeterminado trava a linha em vez de tentar de
  novo sozinho; duas tentativas simultâneas para a mesma linha nunca chamam o
  Mercado Pago as duas; uma recusa confirmada fica registrada (nunca
  apagada); e retomar um checkout pendente reemite a MESMA chamada
  (idempotente pela referência) em vez de criar uma segunda assinatura.
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

const USER = { user: { id: "user-1", email: "cliente@example.com" }, member: null };
const initPointFor = (id) => `https://www.mercadopago.com/subscriptions/checkout?preapproval_id=${id}`;

function withFetchMock(handler, run) {
  const original = globalThis.fetch;
  globalThis.fetch = handler;
  return run().finally(() => {
    globalThis.fetch = original;
  });
}

const jsonResponse = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

/** Espera que `run()` redirecione (lance NEXT_REDIRECT, como o Next faz de verdade) e devolve o endereço. */
async function expectRedirect(run) {
  try {
    await run();
  } catch (error) {
    if (error.__fakeRedirect) return error.__fakeRedirect;
    throw error;
  }
  assert.fail("esperava um redirecionamento (nenhum foi lançado)");
}

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

// ── 1. Criação normal: pending, com init_point, redireciona ────

test("1) cria a assinatura 'pending' sem nenhum dado de cartão, salva o id e redireciona para o init_point do Mercado Pago", async () => {
  const admin = setup([]);
  setFakeSubscription(null);
  let sentBody;

  const initPoint = await withFetchMock(
    async (url, init) => {
      if (url.endsWith("/preapproval")) {
        sentBody = JSON.parse(init.body);
        return jsonResponse(201, { id: "preapproval-1", status: "pending", init_point: initPointFor("preapproval-1") });
      }
      throw new Error("chamada inesperada: " + url);
    },
    () => expectRedirect(() => actions.subscribe()),
  );

  assert.equal(initPoint, initPointFor("preapproval-1"));
  assert.equal(sentBody.status, "pending");
  assert.equal("card_token_id" in sentBody, false, "nenhum dado de cartão vai na criação do checkout hospedado");
  const rows = admin.tables.get("subscriptions").rows;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].provider_subscription_id, "preapproval-1");
  assert.equal(rows[0].status, "pending", "continua pending — só o webhook ou o retorno do Mercado Pago decidem o estado real");
  assert.equal(rows[0].creation_claimed_at, null);
  assert.equal(rows[0].creation_blocked_at, null);
});

test("1b) o Mercado Pago cria mas não devolve init_point: 'unresolved' — o id fica salvo mesmo assim, nunca um endereço inventado", async () => {
  const admin = setup([]);
  setFakeSubscription(null);

  const result = await withFetchMock(
    async (url) => {
      if (url.endsWith("/preapproval")) return jsonResponse(201, { id: "preapproval-1b", status: "pending" });
      throw new Error("chamada inesperada: " + url);
    },
    () => actions.subscribe(),
  );

  assert.deepEqual(result, { outcome: "unresolved" });
  assert.equal(admin.row("subscriptions", admin.tables.get("subscriptions").rows[0].id).provider_subscription_id, "preapproval-1b");
});

// ── 2. Recusa síncrona na criação (configuração, nunca o cartão) ──

test("2) recusado na criação (400): 'rejected', a linha fica — nunca apagada, nunca bloqueada", async () => {
  const admin = setup([]);
  setFakeSubscription(null);

  const result = await withFetchMock(
    async (url) => {
      if (url.endsWith("/preapproval")) {
        return { ok: false, status: 400, json: async () => ({ message: "rejected", cause: [{ description: "invalid_payer_email" }] }) };
      }
      throw new Error("chamada inesperada: " + url);
    },
    () => actions.subscribe(),
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
      return jsonResponse(201, { id: "preapproval-3", status: "pending", init_point: initPointFor("preapproval-3") });
    }
    throw new Error("chamada inesperada: " + url);
  }, () => actions.subscribe());

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
  }, () => actions.subscribe());

  assert.equal(result.outcome, "unresolved");
  const saved = admin.row("subscriptions", "row-4a");
  assert.equal(saved.status, "pending");
  assert.equal(saved.provider_subscription_id, null);
  assert.ok(saved.creation_blocked_at, "trava para reconciliação manual");
});

// ── 5. Depois de persistir o id, subscribe() nunca confirma por conta própria ──
// A confirmação é sempre do webhook ou do retorno do Mercado Pago (check()),
// nunca de uma releitura síncrona dentro da própria criação — por isso nem
// /preapproval/{id} nem /authorized_payments/search são chamados aqui.

test("5) cria e salva o id, e redireciona sem perguntar o estado de novo — nenhuma chamada de confirmação na própria criação", async () => {
  const row = freshRow("row-5");
  const admin = setup([row]);
  setFakeSubscription(row);
  let calls = 0;

  const initPoint = await withFetchMock(async (url) => {
    calls += 1;
    if (url.endsWith("/preapproval")) return jsonResponse(201, { id: "preapproval-5", status: "pending", init_point: initPointFor("preapproval-5") });
    throw new Error("chamada inesperada (deveria ser só a criação): " + url);
  }, () => expectRedirect(() => actions.subscribe()));

  assert.equal(initPoint, initPointFor("preapproval-5"));
  assert.equal(calls, 1, "só a criação — nenhuma releitura de confirmação");
  const saved = admin.row("subscriptions", "row-5");
  assert.equal(saved.provider_subscription_id, "preapproval-5");
  assert.equal(saved.status, "pending");
});

// ── 6. Webhook duplicado ou atrasado (syncSubscription, não muda com o checkout hospedado) ──

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
  }, () => actions.subscribe());

  assert.equal(result.outcome, "unresolved");
  assert.equal(mpCalls, 0, "uma tentativa anterior indeterminada nunca libera uma segunda chamada automática");
});

// ── 9. Corrida de inserção: duas abas/cliques simultâneos de quem ainda não tem clínica ──

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

test("9a) perdeu a corrida de inserção (23505), vencedora ainda livre: usa a linha vencedora, redireciona, nunca cria uma segunda", async () => {
  const admin = setupRace();

  const initPoint = await withFetchMock(async (url) => {
    if (url.endsWith("/preapproval")) return jsonResponse(201, { id: "preapproval-winner", status: "pending", init_point: initPointFor("preapproval-winner") });
    throw new Error("chamada inesperada: " + url);
  }, () => expectRedirect(() => actions.subscribe()));

  assert.equal(initPoint, initPointFor("preapproval-winner"));
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
  }, () => actions.subscribe());

  assert.equal(result.outcome, "active");
  assert.equal(mpCalls, 0);
  assert.equal(admin.tables.get("subscriptions").rows.length, 1);
});

// ── 10. blockSubscriptionCreation nunca re-bloqueia uma linha já resolvida ──

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

  await withFetchMock(async (url) => {
    if (url.endsWith("/preapproval")) return jsonResponse(201, { id: "preapproval-legacy", status: "pending", init_point: initPointFor("preapproval-legacy") });
    throw new Error("chamada inesperada: " + url);
  }, () => expectRedirect(() => actions.subscribe()));

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
    if (url.endsWith("/preapproval")) return jsonResponse(201, { id: "preapproval-retry", status: "pending", init_point: initPointFor("preapproval-retry") });
    throw new Error("chamada inesperada: " + url);
  }, () => expectRedirect(() => actions.subscribe()));

  const rows = admin.tables.get("subscriptions").rows;
  assert.equal(rows.length, 2, "a linha antiga recusada continua, mais a nova");
  const novaLinha = rows.find((r) => r.id !== "sub-old-rejected");
  assert.equal(novaLinha.legacy_access_transition, false, "só uma recusa antes não é transição legada — nunca vira acesso gratuito indevido");
});

test("11c) cliente novo sem clínica ainda: nunca é transição legada, mesmo sem nenhuma linha antes", async () => {
  const admin = setup([]);
  setFakeSubscription(null);

  await withFetchMock(async (url) => {
    if (url.endsWith("/preapproval")) return jsonResponse(201, { id: "preapproval-new", status: "pending", init_point: initPointFor("preapproval-new") });
    throw new Error("chamada inesperada: " + url);
  }, () => expectRedirect(() => actions.subscribe()));

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

// ── 12. Retomar um checkout hospedado pendente — nunca cria uma segunda assinatura ──
// O coração do item "reutilize o link com segurança": uma linha que já tem
// provider_subscription_id e continua 'pending' (a pessoa nunca terminou o
// formulário do Mercado Pago, ou acabou de voltar e o webhook ainda não
// chegou) é sempre retomada, nunca recriada.

test("12a) linha pending com id, Mercado Pago confirma que já está ativa: 'active' direto, sem reemitir a criação", async () => {
  const row = freshRow("row-12a", { provider_subscription_id: "preapproval-12a", status: "pending" });
  setup([row]);
  setFakeSubscription(row);

  const result = await withFetchMock(async (url) => {
    if (url.includes("/authorized_payments/search")) return jsonResponse(200, { results: [] });
    if (url.includes("/preapproval/preapproval-12a")) return jsonResponse(200, { id: "preapproval-12a", status: "authorized", external_reference: "row-12a" });
    throw new Error("não deveria reemitir a criação: " + url);
  }, () => actions.subscribe());

  assert.deepEqual(result, { outcome: "active" });
});

test("12b) linha pending com id, Mercado Pago confirma que foi cancelada (cartão recusado no formulário hospedado): 'declined'", async () => {
  const row = freshRow("row-12b", { provider_subscription_id: "preapproval-12b", status: "pending" });
  setup([row]);
  setFakeSubscription(row);

  const result = await withFetchMock(async (url) => {
    if (url.includes("/authorized_payments/search")) return jsonResponse(200, { results: [] });
    if (url.includes("/preapproval/preapproval-12b")) return jsonResponse(200, { id: "preapproval-12b", status: "cancelled", external_reference: "row-12b" });
    throw new Error("não deveria reemitir a criação: " + url);
  }, () => actions.subscribe());

  assert.deepEqual(result, { outcome: "declined" });
});

test("12c) linha pending com id, ainda pending de verdade: reemite a MESMA criação (idempotente pela referência) e redireciona de novo — nunca cria uma segunda assinatura", async () => {
  const row = freshRow("row-12c", { provider_subscription_id: "preapproval-12c", status: "pending" });
  const admin = setup([row]);
  setFakeSubscription(row);
  let creationCalls = 0;

  const initPoint = await withFetchMock(
    async (url, init) => {
      if (url.includes("/authorized_payments/search")) return jsonResponse(200, { results: [] });
      if (url.includes("/preapproval/preapproval-12c") && (!init || !init.method || init.method === "GET")) {
        return jsonResponse(200, { id: "preapproval-12c", status: "pending", external_reference: "row-12c" });
      }
      if (url.endsWith("/preapproval") && init?.method === "POST") {
        creationCalls += 1;
        // Mercado Pago, pela MESMA chave de idempotência (a referência = o id
        // da linha), devolve a mesma assinatura e o mesmo init_point.
        assert.equal(init.headers["X-Idempotency-Key"], "row-12c");
        return jsonResponse(200, { id: "preapproval-12c", status: "pending", init_point: initPointFor("preapproval-12c") });
      }
      throw new Error("chamada inesperada: " + url);
    },
    () => expectRedirect(() => actions.subscribe()),
  );

  assert.equal(initPoint, initPointFor("preapproval-12c"));
  assert.equal(creationCalls, 1);
  const rows = admin.tables.get("subscriptions").rows;
  assert.equal(rows.length, 1, "nunca cria uma segunda linha ou uma segunda assinatura ao retomar");
  assert.equal(rows[0].provider_subscription_id, "preapproval-12c");
});

test("12d) retomar com o Mercado Pago inalcançável: 'pending' — nunca afirma um estado que não foi confirmado", async () => {
  const row = freshRow("row-12d", { provider_subscription_id: "preapproval-12d", status: "pending" });
  setup([row]);
  setFakeSubscription(row);

  const result = await withFetchMock(async () => {
    throw new Error("fetch failed (simulado)");
  }, () => actions.subscribe());

  assert.deepEqual(result, { outcome: "pending" });
});

test("12e) clique duplo ao retomar: as duas chamadas pedem o mesmo init_point, nunca duas assinaturas", async () => {
  const row = freshRow("row-12e", { provider_subscription_id: "preapproval-12e", status: "pending" });
  const admin = setup([row]);
  setFakeSubscription(row);
  let creationCalls = 0;

  const [first, second] = await withFetchMock(
    async (url, init) => {
      if (url.includes("/authorized_payments/search")) return jsonResponse(200, { results: [] });
      if (url.includes("/preapproval/preapproval-12e") && (!init || !init.method || init.method === "GET")) {
        return jsonResponse(200, { id: "preapproval-12e", status: "pending", external_reference: "row-12e" });
      }
      if (url.endsWith("/preapproval") && init?.method === "POST") {
        creationCalls += 1;
        return jsonResponse(200, { id: "preapproval-12e", status: "pending", init_point: initPointFor("preapproval-12e") });
      }
      throw new Error("chamada inesperada: " + url);
    },
    () =>
      Promise.all([
        expectRedirect(() => actions.subscribe()),
        expectRedirect(() => actions.subscribe()),
      ]),
  );

  assert.equal(first, initPointFor("preapproval-12e"));
  assert.equal(second, initPointFor("preapproval-12e"));
  assert.equal(admin.tables.get("subscriptions").rows.length, 1, "nunca cria uma segunda linha");
});

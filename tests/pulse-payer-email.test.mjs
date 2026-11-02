/*
  A identidade do pagador no Mercado Pago, e a recuperação quando ela não bate.

  O checkout hospedado identifica quem paga pelo payer_email gravado na
  assinatura: quem abre o init_point tem de entrar no Mercado Pago com a conta
  DAQUELE e-mail, ou o próprio Mercado Pago recusa, com "Seu e-mail não
  corresponde ao da assinatura". Enquanto o payer_email era sempre o e-mail da
  conta do Clinavy, não havia saída pela tela — a primeira cliente chegou a
  criar uma segunda conta tentando contornar.

  O que estes testes prendem:
  - o pagador é um dado da LINHA, e é ele que vai em toda tentativa dela
    (o corpo de uma linha nunca muda, que é a regra da chave de idempotência);
  - declarar outro e-mail NUNCA reaproveita um checkout pendente feito para
    outro: a tentativa é encerrada no Mercado Pago antes de qualquer linha
    nova existir;
  - se o encerramento não for confirmado, nenhuma linha nova nasce — duas
    assinaturas recorrentes vivas é o único erro que não se pode cometer;
  - uma assinatura que já cobra nunca é tocada por aqui.

  Mesmo ambiente de tests/pulse-subscribe-payload.test.mjs: Supabase em
  memória, sessão controlável, Mercado Pago simulado por fetch. Nenhuma rede,
  nenhuma credencial real.
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
const { setFakeSession, setFakeSubscription, setFakeStanding, setFakeRows, setFakeReadFailure } = await import("./helpers/fake-session.mjs");
const actions = await import("../src/app/(app)/clinavy/assinar/actions.ts");

const USER = { user: { id: "user-1", email: "conta@example.com" }, member: null };
const OUTRO = "mercadopago@example.com";
const CRIADA = "2026-11-01T18:00:00.000Z";

const initPointFor = (id) => `https://www.mercadopago.com/subscriptions/checkout?preapproval_id=${id}`;
const jsonResponse = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

const row = (id, overrides = {}) => ({
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
  payer_email: null,
  created_at: CRIADA,
  updated_at: CRIADA,
  ...overrides,
});

function setup(rows) {
  const admin = new FakeAdmin({ subscriptions: rows });
  setFakeAdminClient(admin);
  setFakeSession(USER);
  setFakeSubscription(rows[0] ?? null);
  setFakeStanding(rows[0] ?? null);
  return admin;
}

function withFetchMock(handler, run) {
  const original = globalThis.fetch;
  globalThis.fetch = handler;
  return run().finally(() => {
    globalThis.fetch = original;
  });
}

async function expectRedirect(run) {
  try {
    await run();
  } catch (error) {
    if (error.__fakeRedirect) return error.__fakeRedirect;
    throw error;
  }
  assert.fail("esperava um redirecionamento (nenhum foi lançado)");
}

/**
 * Um Mercado Pago simulado. `preapprovals` diz o status de cada assinatura já
 * existente; o PUT de cancelamento passa esse status para "cancelled". Grava
 * o que recebeu para os testes conferirem.
 */
function fakeMercadoPago({
  preapprovals = {},
  idempotency = {},
  cancelRefuses = false,
  cancelNeverConfirms = false,
  paidAfterCancel = false,
  chargesFailAfterCancel = 0,
} = {}) {
  const calls = { posts: [], puts: [], gets: [] };
  const state = { ...preapprovals };
  // A chave de idempotência como o Mercado Pago a trata de verdade: a mesma
  // chave devolve A MESMA assinatura, com o mesmo init_point. É justamente
  // disso que depende uma retomada não criar uma segunda assinatura.
  const byKey = { ...idempotency };
  const handler = async (url, init = {}) => {
    const method = init.method ?? "GET";
    if (url.endsWith("/preapproval") && method === "POST") {
      const body = JSON.parse(init.body);
      const key = init.headers?.["X-Idempotency-Key"];
      const id = byKey[key] ?? `mp-${Object.keys(byKey).length + 1}`;
      byKey[key] = id;
      calls.posts.push({ body, key });
      state[id] ??= "pending";
      return jsonResponse(201, { id, init_point: initPointFor(id), status: state[id], external_reference: body.external_reference });
    }
    const preapproval = /\/preapproval\/([^?]+)$/.exec(url);
    if (preapproval && method === "PUT") {
      const id = preapproval[1];
      calls.puts.push({ id, body: JSON.parse(init.body) });
      if (cancelRefuses) return jsonResponse(500, { message: "indisponível" });
      if (!cancelNeverConfirms) state[id] = "cancelled";
      return jsonResponse(200, { id, status: state[id] });
    }
    if (preapproval && method === "GET") {
      const id = preapproval[1];
      calls.gets.push(id);
      if (!state[id]) return jsonResponse(404, { message: "not found" });
      return jsonResponse(200, { id, status: state[id], external_reference: null, next_payment_date: null });
    }
    if (url.includes("/authorized_payments/search")) {
      // A corrida: a pessoa concluiu o pagamento no checkout ANTIGO; o cancelamento chegou depois.
      const id = new URL(url).searchParams.get("preapproval_id");
      // A busca de cobranças falha só DEPOIS do cancelamento: 400 é o Mercado Pago dizendo que
      // ainda não há cobrança nenhuma; 500 é "não sei".
      if (chargesFailAfterCancel && state[id] === "cancelled") return jsonResponse(chargesFailAfterCancel, { message: "falha simulada" });
      const aprovada = { id: "cobranca-1", preapproval_id: id, status: "processed", date_created: new Date().toISOString(), payment: { status: "approved" } };
      return jsonResponse(200, { results: paidAfterCancel && state[id] === "cancelled" ? [aprovada] : [] });
    }
    throw new Error("chamada inesperada ao Mercado Pago: " + method + " " + url);
  };
  return { handler, calls };
}

// ── o pagador é um dado da linha ──

test("assinar sem declarar nada grava o e-mail da conta como pagador da linha", async () => {
  const admin = setup([]);
  const mp = fakeMercadoPago();
  const to = await expectRedirect(() => withFetchMock(mp.handler, () => actions.subscribe()));
  assert.match(to, /mercadopago\.com/);
  const linhas = admin.tables.get("subscriptions").rows;
  assert.equal(linhas.length, 1, "uma linha, nunca duas");
  assert.equal(linhas[0].payer_email, USER.user.email);
});

test("uma linha que já tem pagador gravado manda esse, não o e-mail da sessão", async () => {
  // Uma linha que nunca chegou ao Mercado Pago, já com o pagador declarado.
  const admin = setup([row("row-1", { payer_email: OUTRO })]);
  const mp = fakeMercadoPago();
  await expectRedirect(() => withFetchMock(mp.handler, () => actions.subscribe()));
  assert.equal(admin.row("subscriptions", "row-1").payer_email, OUTRO, "o pagador da linha não é reescrito");
  assert.equal(mp.calls.posts.length, 1);
  assert.equal(mp.calls.posts[0].key, "row-1", "a chave de idempotência continua sendo o id da linha");
});

test("o arquivo 'use server' só exporta as três ações que conferem a sessão", () => {
  // Todo export de um arquivo "use server" vira um endpoint que qualquer
  // chamador aciona, autenticado ou não. Uma versão anterior exportava um
  // leitor de linha por id com o cliente admin (payerFor) e devolvia o e-mail
  // do pagador de qualquer linha a quem perguntasse. Esta lista é a trava:
  // um export novo aqui tem de ser decidido de propósito, não por acaso.
  assert.deepEqual(Object.keys(actions).sort(), ["check", "subscribe", "subscribeWithPayerEmail"]);
});

test("uma tentativa anterior à coluna (pagador null) saiu com o e-mail da conta: declarar o mesmo e-mail a retoma", async () => {
  // Sem esta comparação, declarar o próprio e-mail da conta cancelaria e
  // recriaria no Mercado Pago uma assinatura idêntica, por nada.
  const admin = setup([row("row-1", { provider_subscription_id: "mp-antiga", payer_email: null })]);
  const mp = fakeMercadoPago({ preapprovals: { "mp-antiga": "pending" }, idempotency: { "row-1": "mp-antiga" } });
  await expectRedirect(() => withFetchMock(mp.handler, () => actions.subscribeWithPayerEmail(USER.user.email)));
  assert.equal(mp.calls.puts.length, 0, "nada foi cancelado");
  assert.equal(admin.tables.get("subscriptions").rows.length, 1, "nenhuma linha nova");
});

test("uma tentativa anterior à coluna, com um e-mail DIFERENTE do da conta, é encerrada e recriada", async () => {
  const admin = setup([row("row-1", { provider_subscription_id: "mp-antiga", payer_email: null })]);
  const mp = fakeMercadoPago({ preapprovals: { "mp-antiga": "pending" }, idempotency: { "row-1": "mp-antiga" } });
  await expectRedirect(() => withFetchMock(mp.handler, () => actions.subscribeWithPayerEmail(OUTRO)));
  assert.deepEqual(mp.calls.puts.map((p) => p.id), ["mp-antiga"]);
  const novas = admin.tables.get("subscriptions").rows.filter((r) => r.id !== "row-1");
  assert.equal(novas.length, 1);
  assert.equal(novas[0].payer_email, OUTRO);
});

// ── declarar outro e-mail do Mercado Pago ──

test("um e-mail sem forma de e-mail é recusado, e nada sai", async () => {
  const admin = setup([]);
  const mp = fakeMercadoPago();
  for (const invalido of ["", "   ", "sem-arroba", "a@b", "a@b.", "@example.com", "a*b@example.com", "%@example.com", "x".repeat(250) + "@example.com"]) {
    const result = await withFetchMock(mp.handler, () => actions.subscribeWithPayerEmail(invalido));
    assert.equal(result.outcome, "rejected", `recusa: ${JSON.stringify(invalido)}`);
    assert.ok(result.detail, "a tela recebe o que corrigir");
  }
  assert.equal(mp.calls.posts.length, 0, "nada foi enviado ao Mercado Pago");
  assert.equal(admin.tables.get("subscriptions").rows.length, 0, "nenhuma linha nasceu");
});

test("sem tentativa nenhuma, declarar o e-mail abre o checkout por ele", async () => {
  const admin = setup([]);
  const mp = fakeMercadoPago();
  const to = await expectRedirect(() => withFetchMock(mp.handler, () => actions.subscribeWithPayerEmail(OUTRO)));
  assert.match(to, /mercadopago\.com/);
  const linhas = admin.tables.get("subscriptions").rows;
  assert.equal(linhas.length, 1);
  assert.equal(linhas[0].payer_email, OUTRO);
  assert.equal(mp.calls.puts.length, 0, "não havia tentativa para encerrar");
});

test("o e-mail declarado é guardado aparado, sem espaços em volta", async () => {
  const admin = setup([]);
  const mp = fakeMercadoPago();
  await expectRedirect(() => withFetchMock(mp.handler, () => actions.subscribeWithPayerEmail(`   ${OUTRO}   `)));
  assert.equal(admin.tables.get("subscriptions").rows[0].payer_email, OUTRO);
});

test("uma tentativa que nunca chegou ao Mercado Pago recebe o pagador novo na mesma linha", async () => {
  const admin = setup([row("row-1", { payer_email: USER.user.email })]);
  const mp = fakeMercadoPago();
  await expectRedirect(() => withFetchMock(mp.handler, () => actions.subscribeWithPayerEmail(OUTRO)));
  assert.equal(admin.tables.get("subscriptions").rows.length, 1, "nenhuma linha a mais: nada tinha saído por esta");
  assert.equal(admin.row("subscriptions", "row-1").payer_email, OUTRO);
  assert.equal(mp.calls.puts.length, 0, "não havia assinatura para encerrar");
});

// ── o caso que importa: um checkout pendente feito para outro e-mail ──

test("um checkout pendente de OUTRO e-mail é encerrado antes de qualquer linha nova — nunca reaproveitado", async () => {
  const admin = setup([row("row-1", { provider_subscription_id: "mp-antiga", payer_email: USER.user.email })]);
  const mp = fakeMercadoPago({ preapprovals: { "mp-antiga": "pending" } });
  const to = await expectRedirect(() => withFetchMock(mp.handler, () => actions.subscribeWithPayerEmail(OUTRO)));

  assert.deepEqual(
    mp.calls.puts.map((p) => p.id),
    ["mp-antiga"],
    "a tentativa antiga foi encerrada no Mercado Pago",
  );
  assert.equal(admin.row("subscriptions", "row-1").status, "cancelled", "a linha antiga fica cancelada, nunca apagada");

  const novas = admin.tables.get("subscriptions").rows.filter((r) => r.id !== "row-1");
  assert.equal(novas.length, 1, "exatamente uma linha nova");
  assert.equal(novas[0].payer_email, OUTRO);
  assert.equal(mp.calls.posts.length, 1, "uma criação só");
  assert.notEqual(mp.calls.posts[0].key, "row-1", "chave nova: o corpo antigo nunca é reusado com outro pagador");
  assert.match(to, /mercadopago\.com/);
});

test("o mesmo e-mail que a tentativa já tem é retomada, nunca um cancelamento à toa", async () => {
  const admin = setup([row("row-1", { provider_subscription_id: "mp-antiga", payer_email: OUTRO })]);
  const mp = fakeMercadoPago({ preapprovals: { "mp-antiga": "pending" }, idempotency: { "row-1": "mp-antiga" } });
  await expectRedirect(() => withFetchMock(mp.handler, () => actions.subscribeWithPayerEmail(OUTRO)));
  assert.equal(mp.calls.puts.length, 0, "nada foi cancelado");
  assert.equal(admin.tables.get("subscriptions").rows.length, 1, "nenhuma linha nova");
  assert.equal(mp.calls.posts[0].key, "row-1", "a mesma chave: é a mesma tentativa");
});

test("maiúsculas e minúsculas não fazem o mesmo pagador parecer outro", async () => {
  const admin = setup([row("row-1", { provider_subscription_id: "mp-antiga", payer_email: OUTRO })]);
  const mp = fakeMercadoPago({ preapprovals: { "mp-antiga": "pending" }, idempotency: { "row-1": "mp-antiga" } });
  await expectRedirect(() => withFetchMock(mp.handler, () => actions.subscribeWithPayerEmail(OUTRO.toUpperCase())));
  assert.equal(mp.calls.puts.length, 0, "nada foi cancelado por diferença de caixa");
  assert.equal(admin.tables.get("subscriptions").rows.length, 1);
});

test("linha anterior à coluna, retomada com o e-mail da conta em outra caixa: o corpo reenviado é o ORIGINAL", async () => {
  // payer_email null: o corpo sai do que a retomada passa. Se passasse o digitado, a mesma chave de
  // idempotência chegaria com outro corpo ("CONTA@" no lugar de "conta@").
  // Em modo de teste o corpo leva o comprador de teste, que esconde o e-mail: este caso roda em modo real.
  const antes = { env: process.env.MERCADOPAGO_ENV, vercel: process.env.VERCEL_ENV };
  process.env.MERCADOPAGO_ENV = "live";
  process.env.VERCEL_ENV = "production";
  try {
    setup([row("row-1", { provider_subscription_id: "mp-antiga", payer_email: null })]);
    const mp = fakeMercadoPago({ preapprovals: { "mp-antiga": "pending" }, idempotency: { "row-1": "mp-antiga" } });
    await expectRedirect(() => withFetchMock(mp.handler, () => actions.subscribeWithPayerEmail(USER.user.email.toUpperCase())));
    assert.equal(mp.calls.puts.length, 0, "é o mesmo pagador: nada foi cancelado");
    assert.equal(mp.calls.posts[0].key, "row-1");
    assert.equal(mp.calls.posts[0].body.payer_email, USER.user.email, "o e-mail que a linha enviou da primeira vez, na mesma caixa");
  } finally {
    for (const [k, v] of [["MERCADOPAGO_ENV", antes.env], ["VERCEL_ENV", antes.vercel]]) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
});

test("se o encerramento não é confirmado, NENHUMA linha nova nasce", async () => {
  const admin = setup([row("row-1", { provider_subscription_id: "mp-antiga", payer_email: USER.user.email })]);
  const mp = fakeMercadoPago({ preapprovals: { "mp-antiga": "pending" }, cancelNeverConfirms: true });
  const result = await withFetchMock(mp.handler, () => actions.subscribeWithPayerEmail(OUTRO));
  assert.equal(result.outcome, "unresolved");
  assert.equal(admin.tables.get("subscriptions").rows.length, 1, "duas assinaturas vivas é o erro que não se comete");
  assert.equal(mp.calls.posts.length, 0, "nada foi criado");
});

test("se o Mercado Pago está fora do ar, o encerramento não é inventado", async () => {
  const admin = setup([row("row-1", { provider_subscription_id: "mp-antiga", payer_email: USER.user.email })]);
  const mp = fakeMercadoPago({ preapprovals: { "mp-antiga": "pending" }, cancelRefuses: true });
  const result = await withFetchMock(mp.handler, () => actions.subscribeWithPayerEmail(OUTRO));
  assert.equal(result.outcome, "unresolved");
  assert.equal(admin.tables.get("subscriptions").rows.length, 1);
  assert.equal(mp.calls.posts.length, 0);
});

test("a tentativa virou ativa enquanto isso: o desfecho real manda, e nada é encerrado", async () => {
  const admin = setup([row("row-1", { provider_subscription_id: "mp-antiga", payer_email: USER.user.email })]);
  const mp = fakeMercadoPago({ preapprovals: { "mp-antiga": "authorized" } });
  const result = await withFetchMock(mp.handler, () => actions.subscribeWithPayerEmail(OUTRO));
  assert.equal(result.outcome, "active");
  assert.equal(mp.calls.puts.length, 0, "uma assinatura que cobra nunca é cancelada por aqui");
  assert.equal(admin.tables.get("subscriptions").rows.length, 1);
});

test("uma assinatura que já cobra não é tocada: trocar o pagador aqui não é a porta para isso", async () => {
  const ativa = row("row-ativa", { status: "active", provider_subscription_id: "mp-ativa", payer_email: USER.user.email });
  const admin = setup([ativa]);
  const mp = fakeMercadoPago({ preapprovals: { "mp-ativa": "authorized" } });
  const result = await withFetchMock(mp.handler, () => actions.subscribeWithPayerEmail(OUTRO));
  assert.equal(result.outcome, "active");
  assert.equal(mp.calls.puts.length, 0);
  assert.equal(mp.calls.posts.length, 0);
  assert.equal(admin.row("subscriptions", "row-ativa").payer_email, USER.user.email, "o pagador de uma assinatura ativa não muda");
});

test("uma tentativa pendente ao lado de uma assinatura ativa não abre uma segunda assinatura", async () => {
  // O cenário do PROBLEMA 4 visto por subscribe(): a tentativa é a linha mais
  // nova, mas quem responde pela clínica é a ativa.
  const tentativa = row("row-tentativa", { provider_subscription_id: "mp-tentativa", payer_email: USER.user.email });
  const ativa = row("row-ativa", { status: "active", provider_subscription_id: "mp-ativa", payer_email: USER.user.email });
  const admin = setup([tentativa, ativa]);
  setFakeStanding(ativa);
  const mp = fakeMercadoPago({ preapprovals: { "mp-tentativa": "pending", "mp-ativa": "authorized" } });
  const result = await withFetchMock(mp.handler, () => actions.subscribe());
  assert.equal(result.outcome, "active", "já paga: nada é criado");
  assert.equal(mp.calls.posts.length, 0);
  assert.equal(admin.tables.get("subscriptions").rows.length, 2, "nenhuma linha nova");
});

// ── a leitura das assinaturas falha ──

test("a leitura das assinaturas falha: nada é aberto, cancelado nem criado — o desfecho é 'ainda não confirmamos'", async () => {
  const admin = setup([row("row-1", { provider_subscription_id: "mp-antiga", payer_email: USER.user.email })]);
  setFakeReadFailure(true);
  const mp = fakeMercadoPago({ preapprovals: { "mp-antiga": "pending" } });
  for (const [nome, run] of [
    ["declarar outro e-mail", () => actions.subscribeWithPayerEmail(OUTRO)],
    ["assinar", () => actions.subscribe()],
  ]) {
    const result = await withFetchMock(mp.handler, run);
    assert.equal(result.outcome, "unresolved", nome);
  }
  assert.equal(await withFetchMock(mp.handler, () => actions.check()), "unresolved", "check()");
  assert.equal(mp.calls.posts.length + mp.calls.puts.length + mp.calls.gets.length, 0, "não falou com o Mercado Pago");
  assert.equal(admin.tables.get("subscriptions").rows.length, 1, "nenhuma linha nova");
  assert.equal(admin.row("subscriptions", "row-1").status, "pending", "a linha ficou como estava");
});

test("uma falha de leitura nunca vira 'sem assinatura' que abre um pagamento novo", async () => {
  // Quem talvez JÁ PAGUE e cuja leitura falhou: criar uma assinatura aqui seria cobrar em dobro.
  const admin = setup([row("row-ativa", { status: "active", provider_subscription_id: "mp-ativa", payer_email: USER.user.email })]);
  setFakeReadFailure(true);
  const mp = fakeMercadoPago({ preapprovals: { "mp-ativa": "authorized" } });
  const result = await withFetchMock(mp.handler, () => actions.subscribe());
  assert.equal(result.outcome, "unresolved");
  assert.equal(mp.calls.posts.length, 0, "nenhuma assinatura criada");
  assert.equal(admin.tables.get("subscriptions").rows.length, 1);
});

// ── o limite de trocas de pagador ──

const minutosAtras = (minutos) => new Date(Date.now() - minutos * 60_000).toISOString();
const antiga = (id, minutos, extra = {}) => row(id, { status: "cancelled", provider_subscription_id: `mp-${id}`, created_at: minutosAtras(minutos), ...extra });

function setupWithRows(rows) {
  const admin = setup(rows);
  setFakeRows(rows);
  return admin;
}

test("até três linhas na última hora: a troca de pagador ainda é aceita", async () => {
  const pendente = row("row-1", { provider_subscription_id: "mp-antiga", payer_email: USER.user.email, created_at: minutosAtras(2) });
  const admin = setupWithRows([pendente, antiga("a", 20), antiga("b", 40)]);
  const mp = fakeMercadoPago({ preapprovals: { "mp-antiga": "pending" } });
  await expectRedirect(() => withFetchMock(mp.handler, () => actions.subscribeWithPayerEmail(OUTRO)));
  assert.deepEqual(mp.calls.puts.map((p) => p.id), ["mp-antiga"]);
  assert.equal(admin.tables.get("subscriptions").rows.length, 4, "uma linha nova");
});

test("a quarta linha em uma hora fecha o laço: nada é cancelado nem criado", async () => {
  const pendente = row("row-1", { provider_subscription_id: "mp-antiga", payer_email: USER.user.email, created_at: minutosAtras(2) });
  const admin = setupWithRows([pendente, antiga("a", 20), antiga("b", 40), antiga("c", 55)]);
  const mp = fakeMercadoPago({ preapprovals: { "mp-antiga": "pending" } });
  const result = await withFetchMock(mp.handler, () => actions.subscribeWithPayerEmail(OUTRO));
  assert.equal(result.outcome, "limited");
  assert.equal(mp.calls.posts.length + mp.calls.puts.length + mp.calls.gets.length, 0, "o Mercado Pago nem é consultado");
  assert.equal(admin.tables.get("subscriptions").rows.length, 4, "nenhuma linha nova");
  assert.equal(admin.row("subscriptions", "row-1").status, "pending", "a tentativa pendente segue intacta");
});

test("linhas de mais de uma hora não contam para o limite", async () => {
  const pendente = row("row-1", { provider_subscription_id: "mp-antiga", payer_email: USER.user.email, created_at: minutosAtras(2) });
  setupWithRows([pendente, antiga("a", 180), antiga("b", 240), antiga("c", 600), antiga("d", 1400)]);
  const mp = fakeMercadoPago({ preapprovals: { "mp-antiga": "pending" } });
  await expectRedirect(() => withFetchMock(mp.handler, () => actions.subscribeWithPayerEmail(OUTRO)));
  assert.equal(mp.calls.puts.length, 1, "tentativas antigas não bloqueiam quem tenta de novo hoje");
});

test("quem já paga responde 'active' ANTES do limite: nunca é tratado como abusador", async () => {
  const ativa = row("row-ativa", { status: "active", provider_subscription_id: "mp-ativa", created_at: minutosAtras(1) });
  setupWithRows([ativa, antiga("a", 5), antiga("b", 6), antiga("c", 7)]);
  setFakeStanding(ativa);
  const mp = fakeMercadoPago({ preapprovals: { "mp-ativa": "authorized" } });
  const result = await withFetchMock(mp.handler, () => actions.subscribeWithPayerEmail(OUTRO));
  assert.equal(result.outcome, "active");
});

// ── quem pode trocar o pagador ──

test("só o responsável pela clínica troca o pagador: um membro comum é recusado e nada acontece", async () => {
  // Trocar o pagador cancela a tentativa pendente da CLÍNICA no Mercado Pago. É decisão do
  // dono (como cancelar o plano), e todo export de um arquivo use server é um endpoint.
  const admin = setup([row("row-1", { organization_id: "org-1", provider_subscription_id: "mp-antiga", payer_email: USER.user.email })]);
  setFakeSession({ user: USER.user, member: { organization_id: "org-1", role: "staff", name: "Recepção" } });
  const mp = fakeMercadoPago({ preapprovals: { "mp-antiga": "pending" } });
  const result = await withFetchMock(mp.handler, () => actions.subscribeWithPayerEmail(OUTRO));
  assert.equal(result.outcome, "rejected");
  assert.match(result.detail, /responsável/i, "a tela diz por quê");
  assert.equal(mp.calls.posts.length + mp.calls.puts.length + mp.calls.gets.length, 0, "o Mercado Pago nem é consultado");
  assert.equal(admin.tables.get("subscriptions").rows.length, 1);
  assert.equal(admin.row("subscriptions", "row-1").status, "pending", "a tentativa da clínica segue intacta");
});

test("o responsável pela clínica troca o pagador normalmente", async () => {
  setup([row("row-1", { organization_id: "org-1", provider_subscription_id: "mp-antiga", payer_email: USER.user.email })]);
  setFakeSession({ user: USER.user, member: { organization_id: "org-1", role: "owner", name: "Dona" } });
  const mp = fakeMercadoPago({ preapprovals: { "mp-antiga": "pending" } });
  await expectRedirect(() => withFetchMock(mp.handler, () => actions.subscribeWithPayerEmail(OUTRO)));
  assert.deepEqual(mp.calls.puts.map((p) => p.id), ["mp-antiga"]);
});

test("quem ainda não tem clínica (sem membro) é o próprio responsável: troca o pagador", async () => {
  setup([]);
  const mp = fakeMercadoPago();
  await expectRedirect(() => withFetchMock(mp.handler, () => actions.subscribeWithPayerEmail(OUTRO)));
  assert.equal(mp.calls.posts.length, 1);
});

// ── a reserva atômica e a corrida com o pagamento ──

test("uma criação em andamento para a linha: declarar outro pagador não o muda por baixo", async () => {
  // Se a troca passasse enquanto outra requisição cria ESTA linha, o banco diria X e o
  // Mercado Pago teria Y — e a retomada reenviaria um corpo diferente sob a mesma chave.
  const admin = setup([row("row-1", { creation_claimed_at: new Date().toISOString(), payer_email: USER.user.email })]);
  const mp = fakeMercadoPago();
  const result = await withFetchMock(mp.handler, () => actions.subscribeWithPayerEmail(OUTRO));
  assert.equal(result.outcome, "pending");
  assert.equal(admin.row("subscriptions", "row-1").payer_email, USER.user.email, "o pagador não mudou");
  assert.equal(mp.calls.posts.length, 0, "nada foi criado");
});

test("o pagamento foi aprovado no checkout antigo durante a troca: NENHUMA assinatura nova nasce", async () => {
  const admin = setup([row("row-1", { provider_subscription_id: "mp-antiga", payer_email: USER.user.email })]);
  const mp = fakeMercadoPago({ preapprovals: { "mp-antiga": "pending" }, paidAfterCancel: true });
  const result = await withFetchMock(mp.handler, () => actions.subscribeWithPayerEmail(OUTRO));
  assert.equal(result.outcome, "unresolved", "uma pessoa decide — não este código");
  assert.deepEqual(mp.calls.puts.map((p) => p.id), ["mp-antiga"]);
  assert.equal(mp.calls.posts.length, 0, "uma segunda assinatura cobraria em dobro");
  assert.equal(admin.tables.get("subscriptions").rows.length, 1, "nenhuma linha nova");
  assert.ok(admin.row("subscriptions", "row-1").first_payment_confirmed_at, "a prova do pagamento ficou gravada");
});

// ── o que a revisão independente achou ──

test("a busca de cobranças FALHA (5xx) depois do cancelamento: não se sabe se foi paga — nenhuma assinatura nova nasce", async () => {
  // Antes, "não dá para saber" só valia quando a leitura LANÇAVA; uma busca que falhava
  // devolvia "sem cobrança" e a segunda assinatura nascia — cobrança em dobro possível.
  const admin = setup([row("row-1", { provider_subscription_id: "mp-antiga", payer_email: USER.user.email })]);
  const mp = fakeMercadoPago({ preapprovals: { "mp-antiga": "pending" }, chargesFailAfterCancel: 500 });
  const result = await withFetchMock(mp.handler, () => actions.subscribeWithPayerEmail(OUTRO));
  assert.equal(result.outcome, "unresolved");
  assert.deepEqual(mp.calls.puts.map((p) => p.id), ["mp-antiga"]);
  assert.equal(mp.calls.posts.length, 0, "nada foi criado");
  assert.equal(admin.tables.get("subscriptions").rows.length, 1);
});

test("a busca responde 400 depois do cancelamento: é o Mercado Pago dizendo que ainda não há cobrança — a recuperação segue", async () => {
  // O caso COMUM: uma tentativa que nunca chegou a cobrar. Se o 400 fechasse o caminho, trocar
  // o pagador nunca funcionaria para quem mais precisa dele.
  const admin = setup([row("row-1", { provider_subscription_id: "mp-antiga", payer_email: USER.user.email })]);
  const mp = fakeMercadoPago({ preapprovals: { "mp-antiga": "pending" }, chargesFailAfterCancel: 400 });
  await expectRedirect(() => withFetchMock(mp.handler, () => actions.subscribeWithPayerEmail(OUTRO)));
  assert.equal(mp.calls.posts.length, 1);
  assert.equal(admin.tables.get("subscriptions").rows.length, 2);
});

test("a tentativa já estava encerrada no Mercado Pago: o e-mail declarado cria a nova, não vira uma tela de 'recusada'", async () => {
  // Antes a pessoa digitava o e-mail, recebia "o Mercado Pago não aprovou" e nada era criado
  // nem guardado: tinha de digitar de novo.
  const admin = setup([row("row-1", { provider_subscription_id: "mp-antiga", payer_email: USER.user.email })]);
  const mp = fakeMercadoPago({ preapprovals: { "mp-antiga": "cancelled" } });
  await expectRedirect(() => withFetchMock(mp.handler, () => actions.subscribeWithPayerEmail(OUTRO)));
  assert.equal(mp.calls.puts.length, 0, "não havia o que cancelar");
  const novas = admin.tables.get("subscriptions").rows.filter((r) => r.id !== "row-1");
  assert.equal(novas.length, 1);
  assert.equal(novas[0].payer_email, OUTRO);
});

test("encerrada no Mercado Pago, mas com cobrança aprovada: NENHUMA nova nasce", async () => {
  const admin = setup([row("row-1", { provider_subscription_id: "mp-antiga", payer_email: USER.user.email })]);
  const mp = fakeMercadoPago({ preapprovals: { "mp-antiga": "cancelled" }, paidAfterCancel: true });
  const result = await withFetchMock(mp.handler, () => actions.subscribeWithPayerEmail(OUTRO));
  assert.equal(result.outcome, "unresolved");
  assert.equal(mp.calls.posts.length, 0);
  assert.equal(admin.tables.get("subscriptions").rows.length, 1);
});

test("o e-mail declarado também vale quando a corrida do 23505 reaproveita a linha vencedora", async () => {
  // Esta requisição não viu a linha da outra, tenta inserir, perde (23505) e segue com a vencedora.
  // Antes, o e-mail declarado se perdia em silêncio neste caminho.
  const vencedora = row("row-vencedora", { payer_email: USER.user.email });
  const admin = new FakeAdmin(
    { subscriptions: [vencedora] },
    { uniqueConstraints: { subscriptions: [{ columns: ["user_id"], where: (r) => r.organization_id === null && r.status !== "cancelled" && r.status !== "rejected" }] } },
  );
  setFakeAdminClient(admin);
  setFakeSession(USER);
  setFakeSubscription(null);
  const mp = fakeMercadoPago();
  await expectRedirect(() => withFetchMock(mp.handler, () => actions.subscribeWithPayerEmail(OUTRO)));
  assert.equal(admin.tables.get("subscriptions").rows.length, 1, "nunca uma segunda linha");
  assert.equal(admin.row("subscriptions", "row-vencedora").payer_email, OUTRO, "o e-mail declarado foi aplicado à linha vencedora");
});

// A corrida do 23505 perdida para uma linha que JÁ saiu para o Mercado Pago com outro pagador.
function perdeAcorrida(vencedora) {
  const admin = new FakeAdmin(
    { subscriptions: [vencedora] },
    { uniqueConstraints: { subscriptions: [{ columns: ["user_id"], where: (r) => r.organization_id === null && r.status !== "cancelled" && r.status !== "rejected" }] } },
  );
  setFakeAdminClient(admin);
  setFakeSession(USER);
  setFakeSubscription(null);
  return admin;
}

test("23505 perdido para uma linha já enviada com OUTRO pagador: diz o que houve, não retoma a conta errada", async () => {
  // Retomar a vencedora mandaria a pessoa de volta ao Mercado Pago com o e-mail dela, sem
  // explicação — o mesmo "o e-mail não corresponde" que ela veio corrigir.
  const admin = perdeAcorrida(row("row-vencedora", { provider_subscription_id: "mp-vencedora", payer_email: USER.user.email }));
  const mp = fakeMercadoPago({ preapprovals: { "mp-vencedora": "pending" } });
  const result = await withFetchMock(mp.handler, () => actions.subscribeWithPayerEmail(OUTRO));
  assert.equal(result.outcome, "rejected");
  assert.match(result.detail, /outro e-mail/i, "a tela mostra o motivo, não o texto genérico de recusa");
  assert.equal(mp.calls.posts.length, 0, "nada foi criado");
  assert.equal(mp.calls.puts.length, 0, "e a tentativa da vencedora não foi mexida");
  assert.equal(admin.tables.get("subscriptions").rows.length, 1);
  assert.equal(admin.row("subscriptions", "row-vencedora").payer_email, USER.user.email, "o pagador gravado não mudou");
});

test("23505 perdido para uma linha já enviada com o MESMO pagador: retoma, como sempre", async () => {
  perdeAcorrida(row("row-vencedora", { provider_subscription_id: "mp-vencedora", payer_email: OUTRO }));
  const mp = fakeMercadoPago({ preapprovals: { "mp-vencedora": "pending" }, idempotency: { "row-vencedora": "mp-vencedora" } });
  await expectRedirect(() => withFetchMock(mp.handler, () => actions.subscribeWithPayerEmail(OUTRO)));
  // Retomar reenvia o MESMO pedido sob a mesma chave: o Mercado Pago devolve a assinatura que já tem.
  assert.deepEqual(mp.calls.posts.map((p) => p.key), ["row-vencedora"], "a chave de idempotência é a da linha");
  assert.equal(mp.calls.puts.length, 0, "nada foi cancelado");
});

test("o e-mail declarado numa linha TRAVADA para reconciliação: nada muda e a resposta é \"ainda não confirmamos\"", async () => {
  // O UPDATE condicional não alcança a linha (creation_blocked_at). Dizer \"em andamento\" a
  // mandaria esperar por algo que só uma pessoa resolve; a resposta certa é a de reconciliação.
  const admin = perdeAcorrida(row("row-vencedora", { payer_email: USER.user.email, creation_blocked_at: new Date().toISOString() }));
  const mp = fakeMercadoPago();
  const result = await withFetchMock(mp.handler, () => actions.subscribeWithPayerEmail(OUTRO));
  assert.equal(result.outcome, "unresolved");
  assert.equal(mp.calls.posts.length, 0, "uma linha travada nunca é tentada de novo sozinha");
  assert.equal(admin.row("subscriptions", "row-vencedora").payer_email, USER.user.email, "o pagador não mudou");
});

test("retomar a MESMA tentativa não é uma tentativa nova: o limite não a barra", async () => {
  const pendente = row("row-1", { provider_subscription_id: "mp-antiga", payer_email: OUTRO, created_at: minutosAtras(2) });
  setupWithRows([pendente, antiga("a", 10), antiga("b", 20), antiga("c", 30)]);
  const mp = fakeMercadoPago({ preapprovals: { "mp-antiga": "pending" }, idempotency: { "row-1": "mp-antiga" } });
  await expectRedirect(() => withFetchMock(mp.handler, () => actions.subscribeWithPayerEmail(OUTRO)));
  assert.equal(mp.calls.puts.length, 0, "nada foi cancelado");
});

test("as linhas RECUSADAS na criação contam para o limite: cada uma custou uma chamada ao Mercado Pago", async () => {
  // Antes só as linhas existentes contavam, e uma sequência de e-mails recusados chamava o
  // Mercado Pago sem fim.
  const recusada = (id, minutos) => row(id, { status: "rejected", created_at: minutosAtras(minutos) });
  const admin = setupWithRows([recusada("r1", 5), recusada("r2", 10), recusada("r3", 20), recusada("r4", 30)]);
  const mp = fakeMercadoPago();
  const result = await withFetchMock(mp.handler, () => actions.subscribeWithPayerEmail(OUTRO));
  assert.equal(result.outcome, "limited");
  assert.equal(mp.calls.posts.length, 0);
  assert.equal(admin.tables.get("subscriptions").rows.length, 4);
});

test("uma linha AINDA NÃO ENVIADA ao Mercado Pago é corrigida mesmo no limite: nada é criado, então o limite não se aplica", async () => {
  // A pessoa errou o e-mail e a linha ainda não saiu. Corrigir reaproveita a linha — nenhuma
  // chamada nova, nenhuma linha nova — e não pode esperar uma hora por causa de um limite que
  // freia justamente chamadas e linhas.
  const naoEnviada = row("row-1", { payer_email: USER.user.email, created_at: minutosAtras(1) });
  const admin = setupWithRows([naoEnviada, antiga("a", 10), antiga("b", 20), antiga("c", 30)]);
  const mp = fakeMercadoPago();
  await expectRedirect(() => withFetchMock(mp.handler, () => actions.subscribeWithPayerEmail(OUTRO)));
  assert.equal(admin.tables.get("subscriptions").rows.length, 4, "nenhuma linha nova");
  assert.equal(admin.row("subscriptions", "row-1").payer_email, OUTRO, "o e-mail corrigido foi aplicado na mesma linha");
  assert.equal(mp.calls.puts.length, 0);
});

test("trocar o pagador numa clínica existente NÃO dá a proteção legada à linha nova", async () => {
  // A proteção legada (migration 0017) é só para a PRIMEIRA tentativa de uma clínica sem
  // nenhuma linha. A linha anterior foi encerrada, mas existe: a nova não pode herdá-la.
  const admin = setup([row("row-1", { organization_id: "org-1", provider_subscription_id: "mp-antiga", payer_email: USER.user.email })]);
  setFakeSession({ user: USER.user, member: { organization_id: "org-1", role: "owner", name: "Dona" } });
  const mp = fakeMercadoPago({ preapprovals: { "mp-antiga": "pending" } });
  await expectRedirect(() => withFetchMock(mp.handler, () => actions.subscribeWithPayerEmail(OUTRO)));
  const nova = admin.tables.get("subscriptions").rows.find((r) => r.id !== "row-1");
  assert.ok(nova, "a linha nova nasceu");
  assert.equal(nova.legacy_access_transition, false, "sem proteção legada: acesso total sem pagamento seria gratuito");
});

test("o 'Assinar' simples também é limitado quando vai criar uma linha nova", async () => {
  const admin = setupWithRows([antiga("a", 5), antiga("b", 10), antiga("c", 20), antiga("d", 30)]);
  const mp = fakeMercadoPago();
  const result = await withFetchMock(mp.handler, () => actions.subscribe());
  assert.equal(result.outcome, "limited");
  assert.equal(mp.calls.posts.length, 0, "nenhuma chamada a POST /preapproval");
  assert.equal(admin.tables.get("subscriptions").rows.length, 4);
});

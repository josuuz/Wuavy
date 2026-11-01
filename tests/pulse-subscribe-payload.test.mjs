/*
  O corpo da criação da assinatura é decidido pela LINHA, nunca pelo código que
  a atende. A chave de idempotência é o id da linha (billing.ts), e quem reenvia
  uma criação com a mesma chave e um corpo diferente fica à mercê de como o
  Mercado Pago trata isso. O rebranding trocou o `reason` e o `back_url`; para
  que uma tentativa anterior ao rebranding, retomada depois dele, repita
  exatamente o que já tinha ido, as linhas criadas antes da virada
  (CLINAVY_PAYLOAD_FROM) continuam levando o corpo antigo.

  Mesmo ambiente de tests/pulse-subscribe-integration.test.mjs: Supabase em
  memória, sessão controlável, Mercado Pago simulado por fetch. Nenhuma rede.
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
const payload = await import("../src/lib/flow/subscription-payload.ts");
const actions = await import("../src/app/(app)/clinavy/assinar/actions.ts");

const USER = { user: { id: "user-1", email: "cliente@example.com" }, member: null };
const initPointFor = (id) => `https://www.mercadopago.com/subscriptions/checkout?preapproval_id=${id}`;
const jsonResponse = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

const BEFORE = "2026-10-31T12:00:00.000Z";
const AFTER = new Date(payload.CLINAVY_PAYLOAD_FROM + 60_000).toISOString();

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
  created_at: BEFORE,
  updated_at: BEFORE,
  ...overrides,
});

function setup(rows) {
  const admin = new FakeAdmin({ subscriptions: rows });
  setFakeAdminClient(admin);
  setFakeSession(USER);
  setFakeSubscription(rows[0]);
  return admin;
}

/** Roda subscribe() contra um MP simulado e devolve o que foi enviado na criação. */
async function sentOnCreation(subscriptionRow, { resumeStatus = "pending" } = {}) {
  setup([subscriptionRow]);
  const sent = [];
  await withFetchMock(
    async (url, init) => {
      if (url.includes("/authorized_payments/search")) return jsonResponse(200, { results: [] });
      if (subscriptionRow.provider_subscription_id && url.includes(`/preapproval/${subscriptionRow.provider_subscription_id}`) && (!init?.method || init.method === "GET")) {
        return jsonResponse(200, { id: subscriptionRow.provider_subscription_id, status: resumeStatus, external_reference: subscriptionRow.id });
      }
      if (url.endsWith("/preapproval") && init?.method === "POST") {
        sent.push({ key: init.headers["X-Idempotency-Key"], body: JSON.parse(init.body) });
        // Pela mesma chave, o Mercado Pago devolve a MESMA assinatura: o id já salvo, se a linha tem um.
        const id = subscriptionRow.provider_subscription_id ?? "preapproval-x";
        return jsonResponse(200, { id, status: "pending", init_point: initPointFor(id) });
      }
      throw new Error("chamada inesperada: " + url);
    },
    () => expectRedirect(() => actions.subscribe()),
  );
  return sent;
}

// ── a decisão, pura ──

test("uma linha criada antes da virada leva o corpo antigo: Wuavy Pulse e /pulse/assinar", () => {
  assert.deepEqual(payload.subscriptionCreationFor(BEFORE), { reason: "Wuavy Pulse", backPath: "/pulse/assinar" });
  assert.deepEqual(payload.subscriptionCreationFor(new Date(BEFORE)), { reason: "Wuavy Pulse", backPath: "/pulse/assinar" });
});

test("uma linha criada na virada ou depois leva o corpo novo: Clinavy e /clinavy/assinar", () => {
  const edge = new Date(payload.CLINAVY_PAYLOAD_FROM).toISOString();
  assert.deepEqual(payload.subscriptionCreationFor(edge), { reason: "Clinavy", backPath: "/clinavy/assinar" });
  assert.deepEqual(payload.subscriptionCreationFor(AFTER), { reason: "Clinavy", backPath: "/clinavy/assinar" });
});

test("sem data legível, o corpo é o antigo: na dúvida nunca se muda o que pode já ter sido enviado", () => {
  for (const unknown of [null, undefined, "", "ontem", Number.NaN]) {
    assert.deepEqual(payload.subscriptionCreationFor(unknown), { reason: "Wuavy Pulse", backPath: "/pulse/assinar" }, String(unknown));
  }
});

test("o mesmo created_at dá sempre o mesmo corpo, não importa quando se pergunta", () => {
  const realNow = Date.now;
  try {
    const first = payload.subscriptionCreationFor(BEFORE);
    Date.now = () => payload.CLINAVY_PAYLOAD_FROM + 365 * 24 * 3600 * 1000;
    assert.deepEqual(payload.subscriptionCreationFor(BEFORE), first);
    assert.deepEqual(payload.subscriptionCreationFor(AFTER), payload.subscriptionCreationFor(AFTER));
  } finally {
    Date.now = realNow;
  }
});

// ── o fluxo real, com o corpo que efetivamente vai ao Mercado Pago ──

test("linha antiga pending sem id (a criação pode ter saído e a resposta se perdido): reenvia o corpo antigo, com a mesma chave", async () => {
  const sent = await sentOnCreation(row("row-old-1"));
  assert.equal(sent.length, 1);
  assert.equal(sent[0].key, "row-old-1");
  assert.equal(sent[0].body.reason, "Wuavy Pulse");
  assert.equal(sent[0].body.back_url, "https://teste.example.com/pulse/assinar");
  assert.equal(sent[0].body.external_reference, "row-old-1");
});

test("linha antiga pending com id (retomar o checkout): a reemissão leva o corpo antigo, não o novo", async () => {
  const sent = await sentOnCreation(row("row-old-2", { provider_subscription_id: "preapproval-old-2" }));
  assert.equal(sent.length, 1);
  assert.equal(sent[0].key, "row-old-2");
  assert.equal(sent[0].body.reason, "Wuavy Pulse");
  assert.equal(sent[0].body.back_url, "https://teste.example.com/pulse/assinar");
});

test("linha nova (criada depois da virada) leva o corpo novo", async () => {
  const sent = await sentOnCreation(row("row-new-1", { created_at: AFTER, updated_at: AFTER }));
  assert.equal(sent.length, 1);
  assert.equal(sent[0].key, "row-new-1");
  assert.equal(sent[0].body.reason, "Clinavy");
  assert.equal(sent[0].body.back_url, "https://teste.example.com/clinavy/assinar");
});

test("o resto do corpo é idêntico entre os dois: valor, frequência, e-mail, referência e status", async () => {
  const [oldSent] = await sentOnCreation(row("row-same", { created_at: BEFORE }));
  const [newSent] = await sentOnCreation(row("row-same", { created_at: AFTER }));
  const strip = (body) => Object.fromEntries(Object.entries(body).filter(([key]) => key !== "reason" && key !== "back_url"));
  assert.deepEqual(strip(oldSent.body), strip(newSent.body));
  assert.equal(oldSent.key, newSent.key);
});

test("duas tentativas da mesma linha antiga enviam corpos byte a byte iguais", async () => {
  const [a] = await sentOnCreation(row("row-twice"));
  const [b] = await sentOnCreation(row("row-twice"));
  assert.equal(JSON.stringify(a.body), JSON.stringify(b.body));
  assert.equal(a.key, b.key);
});

// ── a leitura da data da linha falha: nunca se adivinha um corpo ──

/** Faz só a leitura de created_at falhar (o resto do banco responde normalmente). */
function breakCreatedAtRead(admin, { asMissingRow = false } = {}) {
  const realFrom = admin.from.bind(admin);
  admin.from = (table) => {
    const query = realFrom(table);
    if (table !== "subscriptions") return query;
    const realSelect = query.select.bind(query);
    query.select = (cols) =>
      cols === "created_at"
        ? { eq: () => ({ maybeSingle: async () => (asMissingRow ? { data: null, error: null } : { data: null, error: { message: "simulado: leitura falhou" } }) }) }
        : realSelect(cols);
    return query;
  };
}

for (const [name, opts] of [
  ["erro de leitura", {}],
  ["linha que não existe mais", { asMissingRow: true }],
]) {
  test(`${name} na data da linha: nenhuma criação sai (nem com o corpo antigo, nem com o novo) e a reserva é liberada`, async () => {
    // Uma linha NOVA: se o código "chutasse" o corpo antigo, contradiria a primeira tentativa.
    const admin = setup([row("row-read-fail", { created_at: AFTER, updated_at: AFTER })]);
    breakCreatedAtRead(admin, opts);
    let posts = 0;
    const result = await withFetchMock(
      async (url, init) => {
        if (url.endsWith("/preapproval") && init?.method === "POST") posts += 1;
        throw new Error("não deveria chamar o Mercado Pago: " + url);
      },
      () => actions.subscribe(),
    );
    assert.deepEqual(result, { outcome: "unavailable" });
    assert.equal(posts, 0, "nada foi enviado ao Mercado Pago");
    assert.equal(admin.row("subscriptions", "row-read-fail").creation_claimed_at, null, "a linha fica livre para outra tentativa");
  });
}

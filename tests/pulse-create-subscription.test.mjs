/*
  O que runCreateSubscription, claimDecision e runPersistRetry decidem sem
  rede (lib/mercadopago/create-subscription.ts). O risco que isto prova:
  depois que o Mercado Pago aceita criar a assinatura, nenhum erro
  subsequente (gravar o id, sincronizar o status) pode voltar a ser
  relatado como "cartão recusado" — e nenhuma segunda chamada automática ao
  Mercado Pago acontece enquanto uma tentativa anterior ficou incerta.
*/

import test from "node:test";
import assert from "node:assert/strict";

import { claimDecision, runCreateSubscription, runPersistRetry } from "../src/lib/mercadopago/create-subscription.ts";

// ── runCreateSubscription ─────────────────────────────────────

test("o Mercado Pago aceita: 'created', com o id e o init_point do checkout hospedado", async () => {
  const result = await runCreateSubscription(async () => ({ id: "preapproval-1", init_point: "https://www.mercadopago.com/subscriptions/checkout?preapproval_id=preapproval-1" }));
  assert.deepEqual(result, {
    outcome: "created",
    providerId: "preapproval-1",
    initPoint: "https://www.mercadopago.com/subscriptions/checkout?preapproval_id=preapproval-1",
  });
});

test("o Mercado Pago aceita mas não devolve init_point: 'created', initPoint null — nunca inventa o endereço", async () => {
  const result = await runCreateSubscription(async () => ({ id: "preapproval-2" }));
  assert.deepEqual(result, { outcome: "created", providerId: "preapproval-2", initPoint: null });
});

test("uma recusa de alto risco (400, com a causa) é 'refused' — nada foi criado", async () => {
  const result = await runCreateSubscription(async () => {
    throw Object.assign(new Error("recusado"), { status: 400, body: { cause: [{ description: "cc_rejected_high_risk" }] } });
  });
  assert.equal(result.outcome, "refused");
  assert.equal(result.httpStatus, 400);
});

for (const status of [401, 403, 429]) {
  test(`${status} é 'ours' — nossas credenciais ou limite, nunca o cartão`, async () => {
    const result = await runCreateSubscription(async () => {
      throw Object.assign(new Error("negado"), { status });
    });
    assert.deepEqual(result, { outcome: "ours", httpStatus: status });
  });
}

test("uma falha de rede sem status (timeout, conexão caiu) é 'unconfirmed' — pode já ter sido criada", async () => {
  const result = await runCreateSubscription(async () => {
    throw new Error("fetch failed");
  });
  assert.deepEqual(result, { outcome: "unconfirmed" });
});

test("um 5xx do Mercado Pago também é 'unconfirmed', nunca 'refused'", async () => {
  const result = await runCreateSubscription(async () => {
    throw Object.assign(new Error("indisponível"), { status: 503 });
  });
  assert.deepEqual(result, { outcome: "unconfirmed" });
});

// ── claimDecision ──────────────────────────────────────────────

const row = (overrides = {}) => ({ provider_subscription_id: null, creation_blocked_at: null, creation_claimed_at: null, ...overrides });

test("sem nenhuma marca, a primeira tentativa reivindica livremente", () => {
  assert.equal(claimDecision(row(), Date.now(), 30_000), "claimed");
});

test("já com provider_subscription_id, nada a reivindicar", () => {
  assert.equal(claimDecision(row({ provider_subscription_id: "preapproval-1" }), Date.now(), 30_000), "already");
});

test("bloqueada para reconciliação, nunca reivindicada de novo", () => {
  assert.equal(claimDecision(row({ creation_blocked_at: "2026-01-01T00:00:00Z" }), Date.now(), 30_000), "blocked");
});

test("reivindicada há pouco: a segunda tentativa simultânea espera, não cria", () => {
  const now = Date.now();
  assert.equal(claimDecision(row({ creation_claimed_at: new Date(now).toISOString() }), now + 500, 30_000), "in_progress");
});

test("reivindicação vencida nunca volta a ficar livre sozinha — vira bloqueio", () => {
  const claimedAt = Date.now() - 60_000;
  assert.equal(claimDecision(row({ creation_claimed_at: new Date(claimedAt).toISOString() }), Date.now(), 30_000), "blocked");
});

// ── runPersistRetry ────────────────────────────────────────────

test("a gravação que funciona de primeira nunca espera nem repete", async () => {
  let writes = 0;
  let waits = 0;
  const result = await runPersistRetry(
    async () => {
      writes += 1;
      return true;
    },
    3,
    async () => {
      waits += 1;
    },
  );
  assert.equal(result, "saved");
  assert.equal(writes, 1);
  assert.equal(waits, 0);
});

test("falha duas vezes e salva na terceira: 'saved'", async () => {
  let attempt = 0;
  const result = await runPersistRetry(
    async () => {
      attempt += 1;
      return attempt >= 3;
    },
    3,
    async () => {},
  );
  assert.equal(result, "saved");
  assert.equal(attempt, 3);
});

test("falha em todas as tentativas: 'failed', nunca mais que o limite", async () => {
  let attempts = 0;
  const result = await runPersistRetry(
    async () => {
      attempts += 1;
      return false;
    },
    3,
    async () => {},
  );
  assert.equal(result, "failed");
  assert.equal(attempts, 3);
});

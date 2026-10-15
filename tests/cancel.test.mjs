/*
  O cancelamento, passo a passo, sem rede — a parte que o Pulse e as
  Assinaturas de Sites tinham copiada cada um na sua billing.ts: tentar as
  duas grafias via PUT, parar na primeira aceita, e depois disso nunca
  relatar como falha (a releitura, confirmedStatus, já é segura).

  Achado na revisão final do sub-projeto 1: a manutenção não tinha nenhum
  teste para essa parte (só os primitivos puros que ela usa tinham). Este
  arquivo prova o laço em si, com as chamadas injetadas — o mesmo estilo de
  tests/card-change.test.mjs.
*/

import test from "node:test";
import assert from "node:assert/strict";

import { runCancel } from "../src/lib/mercadopago/notice.ts";

const ID = "f87361b4e1294597be3d0305c46e40c5";

/** Um erro de Mercado Pago, com o `status` que o laço inspeciona. */
const mpError = (status) => Object.assign(new Error(`Mercado Pago answered ${status}`), { status });

function calls({ sendFails = [], confirmResult = "cancelled" } = {}) {
  const count = { send: 0, confirm: 0 };
  const bodies = [];
  const failures = [...sendFails];
  return {
    count,
    bodies,
    api: {
      send: async (body) => {
        count.send += 1;
        bodies.push(body);
        const failure = failures.shift();
        if (failure) throw failure;
      },
      confirm: async () => {
        count.confirm += 1;
        return confirmResult;
      },
    },
  };
}

test("um id que não é um id nunca chega a mandar nada", async () => {
  const { api, count } = calls();
  assert.equal(await runCancel("não é um id", api), null);
  assert.deepEqual(count, { send: 0, confirm: 0 });
});

test("a primeira grafia aceita: um PUT, depois a confirmação", async () => {
  const { api, count, bodies } = calls();
  assert.equal(await runCancel(ID, api), "cancelled");
  assert.deepEqual(count, { send: 1, confirm: 1 });
  assert.deepEqual(bodies, [{ status: "cancelled" }]);
});

test("400 na primeira grafia tenta a segunda, e para nela", async () => {
  const { api, count, bodies } = calls({ sendFails: [mpError(400)] });
  assert.equal(await runCancel(ID, api), "cancelled");
  assert.deepEqual(count, { send: 2, confirm: 1 }, "tentou as duas grafias, confirmou uma vez só");
  assert.deepEqual(bodies, [{ status: "cancelled" }, { status: "canceled" }]);
});

test("uma recusa que não é 400 sobe como veio, sem tentar a outra grafia nem confirmar", async () => {
  const boom = mpError(401);
  const { api, count } = calls({ sendFails: [boom] });
  await assert.rejects(() => runCancel(ID, api), boom);
  assert.deepEqual(count, { send: 1, confirm: 0 }, "não tentou a segunda grafia nem leu de volta");
});

test("400 nas duas grafias sobe o erro da segunda tentativa", async () => {
  const first = mpError(400);
  const second = mpError(400);
  const { api, count } = calls({ sendFails: [first, second] });
  await assert.rejects(() => runCancel(ID, api), second);
  assert.equal(count.send, 2);
});

test("depois do PUT aceito, a confirmação que não responde não vira erro — devolve o que ela devolver", async () => {
  const { api } = calls({ confirmResult: null });
  assert.equal(await runCancel(ID, api), null, "null é 'ainda não confirmado', não uma exceção");
});

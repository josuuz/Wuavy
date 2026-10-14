/*
  A troca de cartão, nos quatro desfechos que ela pode ter.

  O que estes testes guardam não é o caminho feliz: é a linha do PUT. Antes
  dela, falhar é falhar. Depois dela o cartão já está no Mercado Pago, e
  qualquer coisa relatada como erro viraria um convite a mandar outro cartão
  por cima de uma troca que talvez já valha. Por isso cada teste conta as
  chamadas, e não só o resultado.

  Nada aqui toca a rede: runCardChange recebe as três chamadas por argumento
  (src/lib/flow/mercadopago-notice.ts), e billing.ts liga as de verdade.

  O que estes testes NÃO provam, e nenhum deles afirma: que a próxima cobrança
  mensal vai usar o cartão novo. O Mercado Pago responde que recebeu o cartão,
  não que vai cobrar nele; isso só se sabe na cobrança seguinte.
*/

import test from "node:test";
import assert from "node:assert/strict";

import { confirmedStatus, runCardChange } from "../src/lib/flow/mercadopago-notice.ts";

const ID = "f87361b4e1294597be3d0305c46e40c5";
const TOKEN = "abcdefgh12345678";

/** Um 429 do Mercado Pago, como o módulo de cobrança o levanta. */
const tooManyRequests = () => Object.assign(new Error("Mercado Pago answered 429"), { status: 429 });

/**
 * As três chamadas, contadas. `read` e `send` respondem o que o teste mandar;
 * `confirm` recebe a lista de respostas que a releitura dá, em ordem — um
 * Error na lista é levantado, para o teste poder encenar um 429.
 */
function calls({ status = "authorized", sendFails = null, readBack = ["active"] } = {}) {
  const count = { read: 0, send: 0, confirm: 0 };
  const bodies = [];
  const answers = [...readBack];
  return {
    count,
    bodies,
    api: {
      read: async () => {
        count.read += 1;
        return { status };
      },
      send: async (body) => {
        count.send += 1;
        bodies.push(body);
        if (sendFails) throw sendFails;
      },
      confirm: () =>
        confirmedStatus(
          async () => {
            count.confirm += 1;
            const answer = answers.shift();
            if (answer instanceof Error) throw answer;
            return answer ?? null;
          },
          async () => {},
        ),
    },
  };
}

test("refused: um id que não é um id nunca chega ao Mercado Pago", async () => {
  const { api, count } = calls();
  assert.deepEqual(await runCardChange("não é um id", TOKEN, api), { outcome: "refused" });
  assert.deepEqual(count, { read: 0, send: 0, confirm: 0 }, "nada foi chamado");
});

test("refused: um token curto demais para ser do Brick nunca é mandado", async () => {
  const { api, count } = calls();
  assert.deepEqual(await runCardChange(ID, "curto", api), { outcome: "refused" });
  assert.equal(count.send, 0, "o cartão não saiu daqui");
});

test("cancelled: uma assinatura cancelada é lida, e nada é mandado para ela", async () => {
  const { api, count } = calls({ status: "cancelled" });
  assert.deepEqual(await runCardChange(ID, TOKEN, api), { outcome: "cancelled" });
  assert.equal(count.read, 1);
  assert.equal(count.send, 0, "o Mercado Pago não aceita mudança numa cancelada; nem tentamos");
});

test("cancelled: a outra grafia do Mercado Pago (canceled) vale o mesmo", async () => {
  const { api, count } = calls({ status: "canceled" });
  assert.deepEqual(await runCardChange(ID, TOKEN, api), { outcome: "cancelled" });
  assert.equal(count.send, 0);
});

test("changed: aceito e lido de volta, o estado é o que o Mercado Pago disse", async () => {
  const { api, count } = calls({ readBack: ["active"] });
  assert.deepEqual(await runCardChange(ID, TOKEN, api), { outcome: "changed", status: "active" });
  assert.deepEqual(count, { read: 1, send: 1, confirm: 1 });
});

test("changed: o corpo mandado leva só o token — nunca o valor da assinatura", async () => {
  const { api, bodies } = calls();
  await runCardChange(ID, TOKEN, api);
  assert.deepEqual(bodies, [{ card_token_id: TOKEN }]);
  assert.equal("auto_recurring" in bodies[0], false, "o valor dos R$ 297 fica onde está");
});

test("changed: uma assinatura pausada volta a authorized, ou o cartão novo ficaria sem ser cobrado", async () => {
  const { api, bodies } = calls({ status: "paused" });
  await runCardChange(ID, TOKEN, api);
  assert.deepEqual(bodies, [{ card_token_id: TOKEN, status: "authorized" }]);
});

test("changed: um 429 na primeira releitura não é falha — a segunda leitura resolve", async () => {
  const { api, count } = calls({ readBack: [tooManyRequests(), "active"] });
  assert.deepEqual(await runCardChange(ID, TOKEN, api), { outcome: "changed", status: "active" });
  assert.equal(count.confirm, 2, "leu de novo");
  assert.equal(count.send, 1, "e mandou o cartão uma vez só");
});

test("unconfirmed: PUT aceito e GET com 429 nas duas vezes não vira erro", async () => {
  const { api } = calls({ readBack: [tooManyRequests(), tooManyRequests()] });
  const result = await runCardChange(ID, TOKEN, api);
  assert.deepEqual(result, { outcome: "unconfirmed" });
  assert.notEqual(result.outcome, "changed", "não diz que deu certo");
  assert.notEqual(result.outcome, "refused", "nem que falhou");
});

test("unconfirmed: a releitura se repete, o PUT nunca", async () => {
  const { api, count } = calls({ readBack: [tooManyRequests(), tooManyRequests()] });
  await runCardChange(ID, TOKEN, api);
  assert.equal(count.confirm, 2, "o GET foi repetido, porque ler não muda nada");
  assert.equal(count.send, 1, "o PUT não foi repetido: o cartão pode já estar valendo");
});

test("unconfirmed: a releitura só se repete uma vez, e para", async () => {
  const { api, count } = calls({ readBack: [tooManyRequests(), tooManyRequests(), "active"] });
  assert.deepEqual(await runCardChange(ID, TOKEN, api), { outcome: "unconfirmed" });
  assert.equal(count.confirm, 2, "não fica insistindo");
});

test("unconfirmed: uma releitura que responde 'não é nossa' (null) também fica sem confirmação", async () => {
  const { api } = calls({ readBack: [null] });
  assert.deepEqual(await runCardChange(ID, TOKEN, api), { outcome: "unconfirmed" });
});

test("antes do PUT, uma falha continua sendo falha: a leitura inicial levanta o erro", async () => {
  const boom = tooManyRequests();
  const api = {
    read: async () => {
      throw boom;
    },
    send: async () => assert.fail("não deveria mandar o cartão"),
    confirm: async () => assert.fail("não deveria conferir"),
  };
  await assert.rejects(() => runCardChange(ID, TOKEN, api), boom);
});

test("o PUT recusado levanta o erro, e nada foi alterado", async () => {
  const boom = tooManyRequests();
  const { api, count } = calls({ sendFails: boom });
  await assert.rejects(() => runCardChange(ID, TOKEN, api), boom);
  assert.equal(count.confirm, 0, "não há o que confirmar: a troca não passou");
});

test("confirmedStatus: respondendo de primeira, não espera nem lê de novo", async () => {
  let reads = 0;
  let waited = false;
  const status = await confirmedStatus(
    async () => {
      reads += 1;
      return "active";
    },
    async () => {
      waited = true;
    },
  );
  assert.equal(status, "active");
  assert.equal(reads, 1);
  assert.equal(waited, false, "não espera à toa");
});

test("confirmedStatus: espera entre a primeira leitura e a segunda", async () => {
  const order = [];
  const status = await confirmedStatus(
    async () => {
      order.push("read");
      if (order.filter((step) => step === "read").length === 1) throw tooManyRequests();
      return "past_due";
    },
    async () => {
      order.push("wait");
    },
  );
  assert.equal(status, "past_due");
  assert.deepEqual(order, ["read", "wait", "read"]);
});

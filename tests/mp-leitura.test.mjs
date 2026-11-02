/*
  A leitura comparativa do Mercado Pago (supabase/propostas/clinavy-assinatura/
  mp-leitura.mjs) promete duas coisas, e estes testes as provam em vez de
  confiar nelas:

  1. SÓ LEITURA: nenhuma chamada sai com método diferente de GET.
  2. NADA SENSÍVEL NA SAÍDA: nem e-mail, nem token, nem o corpo de um erro.

  O cenário é sintético e espelha o caso real: uma venda aprovada por uma
  conta do Mercado Pago, uma assinatura enviada com OUTRO e-mail (o do Clinavy),
  outra com o e-mail certo, e uma de outra conta vendedora.
*/
import test from "node:test";
import assert from "node:assert/strict";

import { comparar, renderizar } from "../supabase/propostas/clinavy-assinatura/mp-leitura.mjs";

const TOKEN = "APP_USR-SEGREDO-que-nao-pode-vazar-0000";
const EMAIL_MP = "pagadora.real@exemplo.com"; // a conta do Mercado Pago que pagou a venda
const EMAIL_CLINAVY = "conta.clinavy@exemplo.com"; // o e-mail da conta do Clinavy
const VAZADO = "email@vazado-no-erro.com";

const json = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

/** Um Mercado Pago simulado que grava como foi chamado. */
function mercadoPago({ falhaNosPagamentos = false } = {}) {
  const chamadas = [];
  const fetchImpl = async (url, init = {}) => {
    chamadas.push({ url, method: init.method, auth: init.headers?.Authorization });
    const caminho = url.replace("https://api.mercadopago.com", "");
    if (caminho === "/users/me") return json(200, { id: 1111, nickname: "NOME.DO.VENDEDOR", email: "vendedor@exemplo.com" });
    if (caminho === "/v1/payments/555") {
      return json(200, {
        id: 555,
        status: "approved",
        status_detail: "accredited",
        live_mode: true,
        collector_id: 1111,
        transaction_amount: 20,
        payment_method_id: "master",
        payment_type_id: "credit_card",
        date_created: "2026-10-31T15:00:00.000-03:00",
        date_approved: "2026-10-31T15:00:02.000-03:00",
        payer: { id: 900, email: EMAIL_MP, identification: { type: "CPF", number: "12345678900" }, first_name: "Nome", last_name: "Sobrenome" },
        card: { last_four_digits: "4321", first_six_digits: "999999" },
      });
    }
    if (caminho.startsWith("/preapproval/search")) {
      return json(200, {
        results: [
          // A: enviada com o e-mail do Clinavy — diferente do da conta que pagou
          { id: "pre-A", status: "pending", date_created: "2026-10-31T16:00:00.000-03:00", collector_id: 1111, payer_id: null, payer_email: EMAIL_CLINAVY, auto_recurring: { transaction_amount: 297 } },
          // B: enviada com o e-mail da conta do Mercado Pago, que tem payer_id
          { id: "pre-B", status: "cancelled", date_created: "2026-11-01T10:00:00.000-03:00", collector_id: 1111, payer_id: 900, payer_email: EMAIL_MP, auto_recurring: { transaction_amount: 297 } },
          // C: fora da janela
          { id: "pre-C", status: "cancelled", date_created: "2026-09-01T10:00:00.000-03:00", collector_id: 1111, payer_id: 900, payer_email: EMAIL_MP, auto_recurring: { transaction_amount: 297 } },
          // D: de OUTRA conta vendedora
          { id: "pre-D", status: "pending", date_created: "2026-10-20T10:00:00.000-03:00", collector_id: 2222, payer_id: 77, payer_email: "outro@exemplo.com", auto_recurring: { transaction_amount: 297 } },
        ],
      });
    }
    if (caminho.startsWith("/authorized_payments/search")) {
      if (caminho.includes("pre-B")) {
        return json(200, {
          results: [{ status: "cancelled", date_created: "2026-11-01T10:05:00.000-03:00", payment: { status: "rejected", status_detail: "cc_rejected_other_reason" } }],
        });
      }
      return json(200, { results: [] });
    }
    if (caminho.startsWith("/v1/payments/search")) {
      if (falhaNosPagamentos) return json(500, { message: `falha com dado do cliente ${VAZADO}` });
      return json(200, {
        results: [
          { transaction_amount: 297, status: "rejected", status_detail: "cc_rejected_high_risk", payment_method_id: "master", live_mode: true, collector_id: 1111, date_created: "2026-10-17T10:00:00.000-03:00", payer: { id: 900, email: EMAIL_MP } },
          { transaction_amount: 297, status: "rejected", status_detail: "cc_rejected_bad_filled_security_code", payment_method_id: "master", live_mode: true, collector_id: 1111, date_created: "2026-10-18T10:00:00.000-03:00", payer: { id: 901, email: "outra@exemplo.com" } },
          { transaction_amount: 20, status: "approved", status_detail: "accredited", payment_method_id: "master", live_mode: true, collector_id: 1111, date_created: "2026-10-31T15:00:00.000-03:00", payer: { id: 900, email: EMAIL_MP } },
        ],
      });
    }
    throw new Error("chamada inesperada: " + url);
  };
  return { fetchImpl, chamadas };
}

const rodar = (opcoes) => comparar({ token: TOKEN, venda: "555", desde: "2026-10-16", ate: "2026-11-02", ...opcoes });

// ── 1. só leitura ──

test("nenhuma chamada sai com método diferente de GET", async () => {
  const mp = mercadoPago();
  await rodar({ fetchImpl: mp.fetchImpl });
  assert.ok(mp.chamadas.length >= 5, "leu a conta, a venda, as assinaturas, as cobranças e os pagamentos");
  for (const chamada of mp.chamadas) assert.equal(chamada.method, "GET", chamada.url);
});

test("o token vai só no cabeçalho de autorização, nunca na URL", async () => {
  const mp = mercadoPago();
  await rodar({ fetchImpl: mp.fetchImpl });
  for (const chamada of mp.chamadas) {
    assert.equal(chamada.auth, `Bearer ${TOKEN}`);
    assert.ok(!chamada.url.includes(TOKEN), "o token não aparece na URL");
  }
});

// ── 2. a comparação ──

test("a venda é da conta do token, e as assinaturas dizem se são da mesma conta vendedora", async () => {
  const relatorio = await rodar({ fetchImpl: mercadoPago().fetchImpl });
  assert.equal(relatorio.venda.mesmaContaDoToken, true);
  const porDia = Object.fromEntries(relatorio.tentativas.map((t) => [t.criadaEm.slice(0, 10), t]));
  assert.equal(porDia["2026-10-31"].mesmaContaDaVenda, true, "A");
  assert.equal(porDia["2026-11-01"].mesmaContaDaVenda, true, "B");
  assert.equal(porDia["2026-10-20"].mesmaContaDaVenda, false, "D é de outra conta vendedora");
});

test("só entram as assinaturas da janela pedida", async () => {
  const relatorio = await rodar({ fetchImpl: mercadoPago().fetchImpl });
  assert.equal(relatorio.tentativas.length, 3, "A, B e D — a C é de setembro");
});

test("diz se o e-mail que ENVIAMOS é o da conta que pagou a venda — o coração do erro de e-mail", async () => {
  const relatorio = await rodar({ fetchImpl: mercadoPago().fetchImpl });
  const A = relatorio.tentativas.find((t) => t.criadaEm.startsWith("2026-10-31"));
  const B = relatorio.tentativas.find((t) => t.criadaEm.startsWith("2026-11-01"));
  assert.equal(A.payerEmailIgualAoDaVenda, false, "A foi enviada com o e-mail do Clinavy, que não é o da conta que pagou");
  assert.equal(B.payerEmailIgualAoDaVenda, true, "B foi enviada com o e-mail da conta do Mercado Pago");
});

test("a identidade do pagador no Mercado Pago: igual, diferente ou ausente (indeterminado, nunca 'não')", async () => {
  const relatorio = await rodar({ fetchImpl: mercadoPago().fetchImpl });
  const A = relatorio.tentativas.find((t) => t.criadaEm.startsWith("2026-10-31"));
  const B = relatorio.tentativas.find((t) => t.criadaEm.startsWith("2026-11-01"));
  const D = relatorio.tentativas.find((t) => t.criadaEm.startsWith("2026-10-20"));
  assert.equal(B.pagadorIdIgualAoDaVenda, true);
  assert.equal(D.pagadorIdIgualAoDaVenda, false);
  assert.equal(A.temPagadorNoMercadoPago, false);
  assert.equal(A.pagadorIdIgualAoDaVenda, null, "sem payer_id não dá para afirmar que é outra conta");
});

test("traz o status_detail de cada cobrança e de cada pagamento de R$ 297", async () => {
  const relatorio = await rodar({ fetchImpl: mercadoPago().fetchImpl });
  const B = relatorio.tentativas.find((t) => t.criadaEm.startsWith("2026-11-01"));
  assert.equal(B.cobrancas[0].statusDetail, "cc_rejected_other_reason");
  assert.deepEqual(
    relatorio.pagamentos297.map((p) => p.statusDetail),
    ["cc_rejected_high_risk", "cc_rejected_bad_filled_security_code"],
    "só os de R$ 297: a venda de R$ 20 fica de fora",
  );
});

// ── 3. nada sensível na saída ──

test("a saída em texto não tem e-mail, token, documento, cartão nem nome", async () => {
  const texto = renderizar(await rodar({ fetchImpl: mercadoPago().fetchImpl }));
  assert.ok(!texto.includes("@"), "nenhum '@' — logo, nenhum e-mail");
  for (const proibido of [TOKEN, "APP_USR", EMAIL_MP, EMAIL_CLINAVY, "12345678900", "4321", "999999", "NOME.DO.VENDEDOR", "Sobrenome"]) {
    assert.ok(!texto.includes(proibido), `não deveria conter ${proibido}`);
  }
  // E o que importa está lá.
  for (const esperado of ["cc_rejected_high_risk", "cc_rejected_other_reason", "accredited", "live_mode=true", "collector_id 1111"]) {
    assert.ok(texto.includes(esperado), `deveria conter ${esperado}`);
  }
});

test("o relatório em objeto também não carrega e-mail nem documento", async () => {
  const bruto = JSON.stringify(await rodar({ fetchImpl: mercadoPago().fetchImpl }));
  assert.ok(!bruto.includes("@"));
  for (const proibido of [TOKEN, "12345678900", "4321", "999999", "NOME.DO.VENDEDOR"]) assert.ok(!bruto.includes(proibido), proibido);
});

// ── 4. falhas e entradas ruins ──

test("uma leitura que falha aparece como falha, sem derrubar o resto e sem vazar o corpo do erro", async () => {
  const relatorio = await rodar({ fetchImpl: mercadoPago({ falhaNosPagamentos: true }).fetchImpl });
  assert.equal(relatorio.pagamentos297.length, 0);
  assert.ok(relatorio.erros.some((e) => e.includes("/v1/payments/search") && e.includes("500")));
  const texto = renderizar(relatorio);
  assert.ok(texto.includes("LEITURAS QUE FALHARAM"));
  assert.ok(!texto.includes(VAZADO) && !JSON.stringify(relatorio).includes(VAZADO), "o corpo do erro nunca é copiado");
  assert.equal(relatorio.tentativas.length, 3, "o resto do relatório segue de pé");
});

test("sem token, nada é chamado", async () => {
  const mp = mercadoPago();
  await assert.rejects(() => comparar({ token: "", venda: "555", desde: "2026-10-16", ate: "2026-11-02", fetchImpl: mp.fetchImpl }), /MERCADOPAGO_ACCESS_TOKEN/);
  await assert.rejects(() => comparar({ token: undefined, venda: "555", desde: "2026-10-16", ate: "2026-11-02", fetchImpl: mp.fetchImpl }), /MERCADOPAGO_ACCESS_TOKEN/);
  assert.equal(mp.chamadas.length, 0);
});

test("um número de venda que não é número é recusado antes de qualquer chamada", async () => {
  const mp = mercadoPago();
  for (const ruim of ["", "abc", "555/../x", "5 55", undefined]) {
    await assert.rejects(() => comparar({ token: TOKEN, venda: ruim, desde: "2026-10-16", ate: "2026-11-02", fetchImpl: mp.fetchImpl }), /--venda/);
  }
  assert.equal(mp.chamadas.length, 0);
});

test("uma venda que o token não enxerga é dita assim, sem inventar conta", async () => {
  const fetchImpl = async (url) => {
    if (url.endsWith("/users/me")) return json(200, { id: 1111 });
    if (url.includes("/v1/payments/555")) return json(404, { message: "payment not found" });
    return json(200, { results: [] });
  };
  const relatorio = await comparar({ token: TOKEN, venda: "555", desde: "2026-10-16", ate: "2026-11-02", fetchImpl });
  assert.equal(relatorio.venda.encontrada, false);
  assert.match(renderizar(relatorio), /não encontrada com este token/);
});

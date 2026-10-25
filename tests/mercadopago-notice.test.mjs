// O que o Mercado Pago diz, lido sem rede: lib/flow/mercadopago-notice.ts. São
// as duas regras que decidem o que entra — o estado que uma assinatura
// significa, e o que separa um aviso do Mercado Pago de um aviso de qualquer
// um. Nenhum segredo aqui é real e nada nestes testes fala com o Mercado Pago.
import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

import {
  CANCEL_STATES,
  cancelBodies,
  cardChangeBody,
  httpsUrl,
  latestCharge,
  paidPeriodEnd,
  retryOtherSpelling,
  statusFrom,
  verifyNotice,
} from "../src/lib/mercadopago/notice.ts";

const SECRET = "segredo-sintetico-do-painel";

/** Assina como o Mercado Pago assina, para o teste poder conferir a conferência. */
const sign = ({ secret = SECRET, id, requestId, ts = "1760000000" }) => {
  const manifest = `${id ? `id:${id};` : ""}${requestId ? `request-id:${requestId};` : ""}ts:${ts};`;
  return { signature: `ts=${ts},v1=${createHmac("sha256", secret).update(manifest).digest("hex")}`, ts };
};

// ── O estado de uma assinatura ────────────────────────────────

test("uma assinatura autorizada, sem cobrança falhada, está ativa", () => {
  assert.equal(statusFrom({ status: "authorized" }), "active");
  assert.equal(statusFrom({ status: "authorized" }, { status: "processed" }), "active");
  assert.equal(statusFrom({ status: "authorized" }, { status: "processed", payment: { status: "approved" } }), "active");
});

test("a cobrança do mês falhando deixa em atraso, e não cancela nem bloqueia", () => {
  // recycling é o Mercado Pago retentando; o cartão recusado é o outro caminho.
  assert.equal(statusFrom({ status: "authorized" }, { status: "recycling" }), "past_due");
  assert.equal(statusFrom({ status: "authorized" }, { payment: { status: "rejected" } }), "past_due");
  assert.equal(statusFrom({ status: "authorized" }, { payment: { status: "cancelled" } }), "past_due");
});

test("uma assinatura pausada está em atraso, não cancelada: voltar a cobrar a reativa", () => {
  assert.equal(statusFrom({ status: "paused" }), "past_due");
});

test("cancelada e pendente são o que dizem ser, qualquer que seja a última cobrança", () => {
  assert.equal(statusFrom({ status: "cancelled" }, { status: "processed" }), "cancelled");
  assert.equal(statusFrom({ status: "pending" }, { status: "processed" }), "pending");
  assert.equal(statusFrom({ status: "cancelled" }, { status: "recycling" }), "cancelled");
});

test("o estado é sempre um dos quatro que o banco aceita (migração 0003)", () => {
  const allowed = new Set(["pending", "active", "past_due", "cancelled"]);
  for (const status of ["pending", "authorized", "paused", "cancelled"]) {
    assert.ok(allowed.has(statusFrom({ status })), status);
  }
});

// ── Qual cobrança manda ───────────────────────────────────────

test("a cobrança mais recente é a que decide, venha a lista na ordem que vier", () => {
  const charges = [
    { date_created: "2026-08-13T10:00:00.000-03:00", status: "processed" },
    { date_created: "2026-10-13T10:00:00.000-03:00", status: "recycling" },
    { date_created: "2026-09-13T10:00:00.000-03:00", status: "processed" },
  ];
  assert.equal(latestCharge(charges).status, "recycling");
  assert.equal(statusFrom({ status: "authorized" }, latestCharge(charges)), "past_due");
});

test("sem cobrança nenhuma a assinatura autorizada continua ativa: ela acabou de nascer", () => {
  assert.equal(latestCharge([]), undefined);
  assert.equal(latestCharge(undefined), undefined);
  assert.equal(statusFrom({ status: "authorized" }, latestCharge([])), "active");
});

test("uma cobrança sem data não passa na frente de uma datada", () => {
  const charges = [{ status: "processed" }, { date_created: "2026-10-13T10:00:00.000-03:00", status: "recycling" }];
  assert.equal(latestCharge(charges).status, "recycling");
});

// ── A assinatura HMAC de um aviso ─────────────────────────────

test("um aviso assinado com o nosso segredo é aceito", () => {
  const { signature } = sign({ id: "2c938084726fca480172750000000000", requestId: "pedido-1" });
  assert.equal(verifyNotice(SECRET, signature, "pedido-1", "2c938084726fca480172750000000000"), true);
});

test("sem segredo configurado nenhum aviso entra: a recorrência para em silêncio, e é por isso que o webhook grita", () => {
  const { signature } = sign({ id: "abc123", requestId: "pedido-1" });
  assert.equal(verifyNotice(undefined, signature, "pedido-1", "abc123"), false);
  assert.equal(verifyNotice("", signature, "pedido-1", "abc123"), false);
  assert.equal(verifyNotice("   ", signature, "pedido-1", "abc123"), false);
});

test("um aviso assinado com outro segredo é recusado", () => {
  const { signature } = sign({ secret: "segredo-de-outra-pessoa", id: "abc123", requestId: "pedido-1" });
  assert.equal(verifyNotice(SECRET, signature, "pedido-1", "abc123"), false);
});

test("trocar qualquer parte do molde invalida a assinatura", () => {
  const { signature } = sign({ id: "abc123", requestId: "pedido-1" });
  assert.equal(verifyNotice(SECRET, signature, "pedido-2", "abc123"), false, "outro request-id");
  assert.equal(verifyNotice(SECRET, signature, "pedido-1", "abc124"), false, "outro data.id");
  assert.equal(verifyNotice(SECRET, signature.replace("ts=1760000000", "ts=1760000001"), "pedido-1", "abc123"), false, "outro ts");
});

test("sem assinatura, ou com uma que não traz ts e v1, não entra", () => {
  assert.equal(verifyNotice(SECRET, null, "pedido-1", "abc123"), false);
  assert.equal(verifyNotice(SECRET, "", "pedido-1", "abc123"), false);
  assert.equal(verifyNotice(SECRET, "v1=deadbeef", "pedido-1", "abc123"), false, "sem ts");
  assert.equal(verifyNotice(SECRET, "ts=1760000000", "pedido-1", "abc123"), false, "sem v1");
  assert.equal(verifyNotice(SECRET, "ts=1760000000,v1=", "pedido-1", "abc123"), false, "v1 vazio");
});

test("um v1 do tamanho errado é recusado sem explodir na comparação", () => {
  assert.equal(verifyNotice(SECRET, "ts=1760000000,v1=curto", "pedido-1", "abc123"), false);
  assert.equal(verifyNotice(SECRET, `ts=1760000000,v1=${"f".repeat(200)}`, "pedido-1", "abc123"), false);
});

test("espaços em volta das partes não mudam o resultado: o Mercado Pago manda \"ts=…, v1=…\"", () => {
  const { signature } = sign({ id: "abc123", requestId: "pedido-1" });
  const spaced = signature.split(",").join(", ");
  assert.equal(verifyNotice(SECRET, spaced, "pedido-1", "abc123"), true);
});

test("um data.id alfanumérico confere em minúsculas, como o Mercado Pago documenta", () => {
  const { signature } = sign({ id: "abc123def", requestId: "pedido-1" });
  assert.equal(verifyNotice(SECRET, signature, "pedido-1", "ABC123DEF"), true);
  assert.equal(verifyNotice(SECRET, signature, "pedido-1", "abc123def"), true);
});

test("uma parte que não vem sai do molde, em vez de entrar vazia", () => {
  const semId = sign({ requestId: "pedido-1" });
  assert.equal(verifyNotice(SECRET, semId.signature, "pedido-1", null), true);
  const semPedido = sign({ id: "abc123" });
  assert.equal(verifyNotice(SECRET, semPedido.signature, null, "abc123"), true);
  const soTs = sign({});
  assert.equal(verifyNotice(SECRET, soTs.signature, null, null), true);
});

test("um molde com a parte vazia no lugar de ausente não é o mesmo molde", () => {
  // Quem assinasse "id:;request-id:pedido-1;ts:…;" não seria aceito como quem omitiu o id.
  const ts = "1760000000";
  const v1 = createHmac("sha256", SECRET).update(`id:;request-id:pedido-1;ts:${ts};`).digest("hex");
  assert.equal(verifyNotice(SECRET, `ts=${ts},v1=${v1}`, "pedido-1", null), false);
});

// ── O endereço de volta ───────────────────────────────────────

const CANONICAL = "https://wuavy.com";

test("em produção o retorno é o domínio do site, tal como está", () => {
  assert.equal(httpsUrl("/pulse/assinar", "https://wuavy.com", CANONICAL), "https://wuavy.com/pulse/assinar");
});

test("rodando em localhost o retorno cai no domínio canônico: o Mercado Pago recusa um back_url http", () => {
  assert.equal(httpsUrl("/pulse/assinar", "http://localhost:3000", CANONICAL), "https://wuavy.com/pulse/assinar");
});

test("um preview em https é https, e serve como retorno de uma assinatura de teste", () => {
  assert.equal(
    httpsUrl("/pulse/assinar", "https://wuavy-bo55.vercel.app", CANONICAL),
    "https://wuavy-bo55.vercel.app/pulse/assinar",
  );
});

test("nenhum endereço de volta sai sem https, qualquer que seja a URL configurada", () => {
  for (const configured of ["http://localhost:3000", "http://wuavy.com", "http://192.168.0.10:3000"]) {
    assert.ok(httpsUrl("/pulse/assinar", configured, CANONICAL).startsWith("https://"), configured);
  }
});

// ── Cancelar: as duas grafias do enum ─────────────────────────

test("as duas grafias de cancelamento são lidas como cancelamento", () => {
  // A referência da API não fixa o enum; a grafia não reconhecida cairia no
  // "else" e uma assinatura cancelada seria lida como ATIVA. Este é o teste
  // que impede isso.
  for (const status of CANCEL_STATES) {
    assert.equal(statusFrom({ status }), "cancelled", status);
    assert.equal(statusFrom({ status }, { status: "processed" }), "cancelled", `${status} com cobrança boa`);
  }
});

test("nenhum estado desconhecido vira \"ativo\" por acidente nas duas grafias", () => {
  assert.notEqual(statusFrom({ status: "canceled" }), "active");
  assert.notEqual(statusFrom({ status: "cancelled" }), "active");
});

test("cancelar tenta as duas grafias, em ordem, e manda só o status", () => {
  const bodies = cancelBodies();
  assert.deepEqual(bodies, [{ status: "cancelled" }, { status: "canceled" }]);
  for (const body of bodies) {
    assert.deepEqual(Object.keys(body), ["status"], "nada além do status vai no corpo");
  }
});

test("só um valor recusado (400) vale tentar com a outra grafia", () => {
  assert.equal(retryOtherSpelling(400), true);
  // Credenciais, assinatura inexistente, limite, indisponibilidade: repetir
  // com a outra palavra daria o mesmo e esconderia o erro real.
  for (const status of [401, 403, 404, 409, 429, 500, 502, 503]) {
    assert.equal(retryOtherSpelling(status), false, String(status));
  }
});

// ── Até quando o mês já pago vale (achado: billing.ts:252) ─────
//
// current_period_end guardava, sem distinção, o que a próxima cobrança
// prevista (next_payment_date) OU o fim do mês já pago deveriam significar.
// next_payment_date é, pela própria documentação do Mercado Pago, só a
// "date of the next payment debit" — nada que uma assinatura cancelada,
// sem mais nenhum débito agendado, tenha motivo para continuar informando.
// paidPeriodEnd nunca olha para next_payment_date: deriva o fim do período
// pago só de uma cobrança CONFIRMADA (status "processed", sem estorno nem
// contestação), um ciclo (sempre mensal — createSubscription) a partir da
// data dela.

test("uma cobrança processada e aprovada paga um mês a partir da sua data", () => {
  const fim = paidPeriodEnd([{ status: "processed", date_created: "2026-09-13T10:00:00.000-03:00", payment: { status: "approved" } }]);
  assert.equal(fim, "2026-10-13T13:00:00.000Z");
});

test("sem cobrança nenhuma (cancelada antes de qualquer pagamento aprovado) não há mês pago", () => {
  assert.equal(paidPeriodEnd([]), null);
  assert.equal(paidPeriodEnd(undefined), null);
});

test("uma cobrança 'scheduled' ou 'recycling' não é uma cobrança confirmada", () => {
  assert.equal(paidPeriodEnd([{ status: "scheduled", date_created: "2026-09-13T10:00:00.000Z" }]), null);
  assert.equal(paidPeriodEnd([{ status: "recycling", date_created: "2026-09-13T10:00:00.000Z" }]), null);
});

test("pagamento recusado não paga nada, mesmo que a cobrança em si diga 'processed'", () => {
  assert.equal(paidPeriodEnd([{ status: "processed", payment: { status: "rejected" }, date_created: "2026-09-13T10:00:00.000Z" }]), null);
});

test("estorno ou contestação: uma cobrança processada mas depois revertida não prova pagamento", () => {
  assert.equal(paidPeriodEnd([{ status: "processed", payment: { status: "refunded" }, date_created: "2026-09-13T10:00:00.000Z" }]), null);
  assert.equal(paidPeriodEnd([{ status: "processed", payment: { status: "charged_back" }, date_created: "2026-09-13T10:00:00.000Z" }]), null);
});

test("a cobrança confirmada mais recente é a que decide, mesmo com cobranças mais antigas na lista", () => {
  const fim = paidPeriodEnd([
    { status: "processed", payment: { status: "approved" }, date_created: "2026-07-13T10:00:00.000Z" },
    { status: "processed", payment: { status: "approved" }, date_created: "2026-09-13T10:00:00.000Z" },
    { status: "rejected", payment: { status: "rejected" }, date_created: "2026-10-13T10:00:00.000Z" },
  ]);
  assert.equal(fim, "2026-10-13T10:00:00.000Z");
});

test("uma cobrança sem data não é usada: não há de onde contar o ciclo", () => {
  assert.equal(paidPeriodEnd([{ status: "processed", payment: { status: "approved" } }]), null);
});

// ── Auditoria: evidência POSITIVA, nunca ausência de negativa ──
//
// A própria documentação do Mercado Pago (assinaturas, recorrência) diz que
// uma parcela fica em "recycling" sendo retentada e, esgotadas as
// tentativas, passa para "processed" mesmo associada a um pagamento
// recusado — "processed" não é prova de pagamento, é só "o ciclo de
// tentativas terminou". Por isso paidPeriodEnd nunca pode aceitar uma
// cobrança por faltar um status negativo na lista; só por ter
// payment.status === "approved" explicitamente.

test("pendente ou em processamento: nada foi efetivamente cobrado ainda, não compra mês nenhum", () => {
  assert.equal(paidPeriodEnd([{ status: "processed", payment: { status: "pending" }, date_created: "2026-09-13T10:00:00.000Z" }]), null);
  assert.equal(paidPeriodEnd([{ status: "processed", payment: { status: "in_process" }, date_created: "2026-09-13T10:00:00.000Z" }]), null);
});

test("autorizada mas não capturada: autorização de cartão não é dinheiro recebido", () => {
  assert.equal(paidPeriodEnd([{ status: "processed", payment: { status: "authorized" }, date_created: "2026-09-13T10:00:00.000Z" }]), null);
});

test("sem objeto payment nenhum: ausência de informação nunca vira aprovação", () => {
  assert.equal(paidPeriodEnd([{ status: "processed", date_created: "2026-09-13T10:00:00.000Z" }]), null);
});

// ── Auditoria: statusFrom não lê estorno/contestação como "ativa" ──

test("a última cobrança foi estornada ou contestada depois de aprovada: em atraso, não ativa", () => {
  assert.equal(statusFrom({ status: "authorized" }, { status: "processed", payment: { status: "refunded" } }), "past_due");
  assert.equal(statusFrom({ status: "authorized" }, { status: "processed", payment: { status: "charged_back" } }), "past_due");
});

// ── Auditoria: viradas de mês ────────────────────────────────────
//
// setMonth/setUTCMonth do JavaScript somam o dia do mês sem olhar quantos
// dias o mês de destino tem: 31 de janeiro mais um mês viraria 2 ou 3 de
// março (fevereiro não tem 31 dias), não o fim de fevereiro. A frequência
// contratada é sempre mensal (createSubscription); o dia tem que ser
// limitado ao último dia do mês de destino quando ele não existir.

test("cobrança no dia 31: o mês pago termina no fim de fevereiro, nunca em março", () => {
  // 2026 não é bissexto: fevereiro tem 28 dias.
  assert.equal(
    paidPeriodEnd([{ status: "processed", payment: { status: "approved" }, date_created: "2026-01-31T10:00:00.000Z" }]),
    "2026-02-28T10:00:00.000Z",
  );
});

test("cobrança no dia 29 de janeiro bissexto: o mês pago ainda assim respeita fevereiro", () => {
  // 2028 é bissexto: fevereiro tem 29 dias, e o dia 29 existe nele.
  assert.equal(
    paidPeriodEnd([{ status: "processed", payment: { status: "approved" }, date_created: "2028-01-29T10:00:00.000Z" }]),
    "2028-02-29T10:00:00.000Z",
  );
});

test("cobrança num mês comum: o dia simplesmente se mantém", () => {
  assert.equal(
    paidPeriodEnd([{ status: "processed", payment: { status: "approved" }, date_created: "2026-03-15T08:30:00.000Z" }]),
    "2026-04-15T08:30:00.000Z",
  );
});

test("cobrança em dezembro: o ciclo vira o ano corretamente", () => {
  assert.equal(
    paidPeriodEnd([{ status: "processed", payment: { status: "approved" }, date_created: "2026-12-10T10:00:00.000Z" }]),
    "2027-01-10T10:00:00.000Z",
  );
});

// ── Trocar o cartão ───────────────────────────────────────────

test("a troca de cartão manda o token e nada mais", () => {
  const body = cardChangeBody("authorized", "CARD-TOKEN-SINTETICO-0001");
  assert.deepEqual(body, { card_token_id: "CARD-TOKEN-SINTETICO-0001" });
});

test("o valor NUNCA vai numa troca de cartão: é ele que guarda os R$ 297 das fundadoras", () => {
  for (const status of ["authorized", "paused", "pending"]) {
    const body = cardChangeBody(status, "CARD-TOKEN-SINTETICO-0001");
    assert.equal("auto_recurring" in body, false, status);
    assert.equal("transaction_amount" in body, false, status);
    assert.equal("reason" in body, false, status);
    assert.equal("back_url" in body, false, status);
  }
});

test("uma assinatura pausada volta a authorized junto com o cartão novo, ou o cartão ficaria sem cobrança", () => {
  assert.deepEqual(cardChangeBody("paused", "CARD-TOKEN-SINTETICO-0002"), {
    card_token_id: "CARD-TOKEN-SINTETICO-0002",
    status: "authorized",
  });
});

test("uma assinatura que já cobra não é \"reativada\" sem necessidade", () => {
  assert.equal("status" in cardChangeBody("authorized", "CARD-TOKEN-SINTETICO-0003"), false);
  assert.equal("status" in cardChangeBody("pending", "CARD-TOKEN-SINTETICO-0003"), false);
});

test("montar o corpo duas vezes dá o mesmo corpo: repetir a chamada não muda nada", () => {
  const a = cardChangeBody("paused", "CARD-TOKEN-SINTETICO-0004");
  const b = cardChangeBody("paused", "CARD-TOKEN-SINTETICO-0004");
  assert.deepEqual(a, b);
  assert.deepEqual(cancelBodies(), cancelBodies());
});

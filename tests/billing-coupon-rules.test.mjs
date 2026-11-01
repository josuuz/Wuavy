import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeCode, isServiceEligible, discountCentsFor, effectiveUses,
  PENDING_RESERVATION_TTL_MS, resolveCoupon, representativeStats, shareMessage, prospectInviteMessage,
  startOfDaySaoPaulo, endOfDaySaoPaulo,
} from "../src/lib/billing/coupon-rules.ts";

test("normalizeCode caixa-alta e sem espaço nas pontas", () => {
  assert.equal(normalizeCode(" bru10 "), "BRU10");
});

test("isServiceEligible: lista vazia vale para qualquer serviço, inclusive sem serviço", () => {
  assert.equal(isServiceEligible([], "svc-1"), true);
  assert.equal(isServiceEligible([], null), true);
});

test("isServiceEligible: lista restrita recusa serviço fora dela e recusa cobrança sem serviço", () => {
  assert.equal(isServiceEligible(["svc-1"], "svc-2"), false);
  assert.equal(isServiceEligible(["svc-1"], null), false);
  assert.equal(isServiceEligible(["svc-1"], "svc-1"), true);
});

test("discountCentsFor: percentual arredonda, fixo é o próprio valor", () => {
  assert.equal(discountCentsFor({ discount_type: "percent", discount_percent: 10, discount_fixed_cents: null }, 15_000), 1_500);
  assert.equal(discountCentsFor({ discount_type: "fixed", discount_percent: null, discount_fixed_cents: 2_000 }, 15_000), 2_000);
});

test("effectiveUses: aprovada e reembolsada sempre contam, pendente só dentro da janela, rejeitada/cancelada nunca", () => {
  const now = Date.parse("2026-10-27T12:00:00Z");
  const hour = 60 * 60 * 1000;
  const rows = [
    { status: "approved", created_at: "2026-01-01T00:00:00Z" },
    { status: "refunded", created_at: "2026-01-01T00:00:00Z" },
    { status: "pending", created_at: new Date(now - 1 * hour).toISOString() },
    { status: "pending", created_at: new Date(now - 49 * hour).toISOString() },
    { status: "rejected", created_at: new Date(now - 1 * hour).toISOString() },
    { status: "cancelled", created_at: new Date(now - 1 * hour).toISOString() },
  ];
  assert.equal(effectiveUses(rows, now, PENDING_RESERVATION_TTL_MS), 3);
});

test("resolveCoupon: sem código, não aplica nada e não recusa", () => {
  const result = resolveCoupon({
    couponCode: null, coupon: null, eligibleServiceIds: [], chargeHistory: [],
    representativeActive: true, nowMs: Date.now(), amountCents: 15_000, serviceId: null, serviceKind: null,
  });
  assert.deepEqual(result, { applied: false });
});

test("resolveCoupon: cupom inexistente recusa com mensagem", () => {
  const result = resolveCoupon({
    couponCode: "BRU10", coupon: null, eligibleServiceIds: [], chargeHistory: [],
    representativeActive: true, nowMs: Date.now(), amountCents: 15_000, serviceId: null, serviceKind: null,
  });
  assert.equal(result.applied, false);
  assert.ok("error" in result);
});

test("resolveCoupon: desconto de 100% é recusado, nunca uma cobrança de R$ 0", () => {
  const coupon = {
    id: "c1", active: true, discount_type: "percent", discount_percent: 100, discount_fixed_cents: null,
    valid_from: "2026-01-01T00:00:00Z", valid_until: null, max_uses: null,
  };
  const result = resolveCoupon({
    couponCode: "BRU10", coupon, eligibleServiceIds: [], chargeHistory: [],
    representativeActive: true, nowMs: Date.parse("2026-06-01T00:00:00Z"), amountCents: 15_000, serviceId: null, serviceKind: null,
  });
  assert.equal(result.applied, false);
  assert.ok("error" in result);
});

test("resolveCoupon: serviço recorrente recusa mesmo com cupom válido", () => {
  const coupon = {
    id: "c1", active: true, discount_type: "fixed", discount_percent: null, discount_fixed_cents: 1_000,
    valid_from: "2026-01-01T00:00:00Z", valid_until: null, max_uses: null,
  };
  const result = resolveCoupon({
    couponCode: "BRU10", coupon, eligibleServiceIds: [], chargeHistory: [],
    representativeActive: true, nowMs: Date.parse("2026-06-01T00:00:00Z"), amountCents: 15_000, serviceId: "svc-1", serviceKind: "recurring",
  });
  assert.equal(result.applied, false);
});

test("resolveCoupon: fora da validade recusa", () => {
  const coupon = {
    id: "c1", active: true, discount_type: "fixed", discount_percent: null, discount_fixed_cents: 1_000,
    valid_from: "2026-01-01T00:00:00Z", valid_until: "2026-02-01T00:00:00Z", max_uses: null,
  };
  const result = resolveCoupon({
    couponCode: "BRU10", coupon, eligibleServiceIds: [], chargeHistory: [],
    representativeActive: true, nowMs: Date.parse("2026-03-01T00:00:00Z"), amountCents: 15_000, serviceId: null, serviceKind: null,
  });
  assert.equal(result.applied, false);
});

test("resolveCoupon: limite de uso atingido recusa", () => {
  const coupon = {
    id: "c1", active: true, discount_type: "fixed", discount_percent: null, discount_fixed_cents: 1_000,
    valid_from: "2026-01-01T00:00:00Z", valid_until: null, max_uses: 1,
  };
  const history = [{ status: "approved", created_at: "2026-01-02T00:00:00Z" }];
  const result = resolveCoupon({
    couponCode: "BRU10", coupon, eligibleServiceIds: [], chargeHistory: history,
    representativeActive: true, nowMs: Date.parse("2026-06-01T00:00:00Z"), amountCents: 15_000, serviceId: null, serviceKind: null,
  });
  assert.equal(result.applied, false);
});

test("resolveCoupon: representante desativado recusa mesmo com cupom válido", () => {
  const coupon = {
    id: "c1", active: true, discount_type: "fixed", discount_percent: null, discount_fixed_cents: 1_000,
    valid_from: "2026-01-01T00:00:00Z", valid_until: null, max_uses: null,
  };
  const result = resolveCoupon({
    couponCode: "BRU10", coupon, eligibleServiceIds: [], chargeHistory: [],
    representativeActive: false, nowMs: Date.parse("2026-06-01T00:00:00Z"), amountCents: 15_000, serviceId: null, serviceKind: null,
  });
  assert.equal(result.applied, false);
  assert.ok("error" in result);
});

test("resolveCoupon: tudo certo aplica e devolve o final já descontado", () => {
  const coupon = {
    id: "c1", active: true, discount_type: "percent", discount_percent: 10, discount_fixed_cents: null,
    valid_from: "2026-01-01T00:00:00Z", valid_until: null, max_uses: null,
  };
  const result = resolveCoupon({
    couponCode: "bru10", coupon, eligibleServiceIds: [], chargeHistory: [],
    representativeActive: true, nowMs: Date.parse("2026-06-01T00:00:00Z"), amountCents: 15_000, serviceId: null, serviceKind: null,
  });
  assert.deepEqual(result, { applied: true, discountCents: 1_500, finalCents: 13_500 });
});

test("representativeStats separa pendentes, aprovadas e não repete cliente convertido", () => {
  const rows = [
    { client_id: "a", status: "approved", amount_cents: 10_000, discount_cents: 1_000 },
    { client_id: "a", status: "approved", amount_cents: 20_000, discount_cents: 2_000 },
    { client_id: "b", status: "pending", amount_cents: 5_000, discount_cents: 500 },
    { client_id: "c", status: "refunded", amount_cents: 7_000, discount_cents: 700 },
    { client_id: "d", status: "rejected", amount_cents: 3_000, discount_cents: 300 },
  ];
  assert.deepEqual(representativeStats(rows), {
    registeredReferrals: 5,
    pendingCharges: 1,
    confirmedSales: 2,
    convertedClients: 1,
    attributedRevenueCents: 30_000,
    grantedDiscountCents: 3_000,
  });
});

test("representativeStats: sem nenhuma cobrança, tudo zero", () => {
  assert.deepEqual(representativeStats([]), {
    registeredReferrals: 0, pendingCharges: 0, confirmedSales: 0,
    convertedClients: 0, attributedRevenueCents: 0, grantedDiscountCents: 0,
  });
});

test("prospectInviteMessage: convite na voz de quem vai clicar, código em maiúsculas", () => {
  const message = prospectInviteMessage("bru10");
  assert.match(message, /BRU10/);
});

test("shareMessage: texto para o representante compartilhar, com o código e o link do cliente para a Wuavy embutido", () => {
  const message = shareMessage("bru10", "https://wa.me/5519999999999?text=ola");
  assert.match(message, /BRU10/);
  assert.match(message, /https:\/\/wa\.me\/5519999999999\?text=ola/);
});

test("startOfDaySaoPaulo: meia-noite em São Paulo (UTC-3), não em UTC", () => {
  assert.equal(startOfDaySaoPaulo("2026-11-30"), "2026-11-30T03:00:00.000Z");
});

test("endOfDaySaoPaulo: o último instante do dia em São Paulo, não em UTC", () => {
  assert.equal(endOfDaySaoPaulo("2026-11-30"), "2026-12-01T02:59:59.999Z");
});

test("resolveCoupon: válido até o último instante de valid_until em São Paulo, recusa 1ms depois", () => {
  const coupon = {
    id: "c1", active: true, discount_type: "fixed", discount_percent: null, discount_fixed_cents: 1_000,
    valid_from: "2026-01-01T00:00:00Z", valid_until: endOfDaySaoPaulo("2026-11-30"), max_uses: null,
  };
  const input = {
    couponCode: "BRU10", coupon, eligibleServiceIds: [], chargeHistory: [],
    representativeActive: true, amountCents: 15_000, serviceId: null, serviceKind: null,
  };
  const atTheLimit = resolveCoupon({ ...input, nowMs: Date.parse(coupon.valid_until) });
  assert.equal(atTheLimit.applied, true);

  const oneMsLate = resolveCoupon({ ...input, nowMs: Date.parse(coupon.valid_until) + 1 });
  assert.equal(oneMsLate.applied, false);
});

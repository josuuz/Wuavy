/*
  E2E do módulo de Cupons de Representantes, contra o Postgres DE VERDADE do
  projeto de TESTE (wazxofdzvzfgonmwsdhs) — mesmo padrão de segurança de
  billing-integration-real.test.mjs: o host de Supabase é confirmado por
  igualdade exata antes de qualquer escrita, Mercado Pago é sempre simulado
  (tests/helpers/fetch-firewall.mjs — sem handler registrado, a chamada
  falha alto), e produção é host explicitamente proibido.

  PREPARADO, AINDA NÃO EXECUTADO: migration 0022 (billing_representatives,
  billing_coupons, billing_coupon_services, billing_coupon_audit) não foi
  aplicada ao projeto de teste. Este arquivo confere isso antes de registrar
  qualquer teste — sem a migration, sai com um aviso e zero testes, para
  nunca quebrar `node --test tests/*.test.mjs` enquanto isso não acontece.

  Fluxo coberto, na ordem pedida: representante → cupom → cobrança →
  desconto → pagamento aprovado (simulado) → atribuição da venda; mais
  desativação em cascata, limite de uso (e a janela de 48h da reserva
  pendente), e preservação do histórico de desconto depois de desativar.

  Sobre "cobranças simultâneas" (item 6 do pedido): o teste 6 prova a
  CONTAGEM (effectiveUses vendo a primeira tentativa e recusando a segunda),
  não concorrência de rede de verdade — a janela de corrida entre duas
  chamadas simultâneas para o ÚLTIMO slot de um cupom é uma limitação
  aceita e documentada no spec (sem stored procedure, painel de um operador
  só), não algo que este teste de processo único poderia provar de qualquer
  forma.

  Opt-in: diferente de billing-integration-real.test.mjs (mesmo padrão, sem
  este gate), este arquivo só roda com WUAVY_RUN_REAL_E2E=1 — um
  `node --test tests/*.test.mjs` comum pula ele, de propósito, em vez de
  tentar ler o arquivo de credenciais local e travar em qualquer máquina
  que não seja esta.
*/
import { register } from "node:module";
import { randomUUID } from "node:crypto";
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { installFetchFirewall } from "./helpers/fetch-firewall.mjs";
import { TEST_COLLECTOR_ID, withMpIdentity } from "./helpers/mp-identity.mjs";

// -- Opt-in: nunca dispara sozinho num `node --test tests/*.test.mjs`. --
if (process.env.WUAVY_RUN_REAL_E2E !== "1") {
  console.log("Pulado (tests/billing-coupons-e2e-real.test.mjs): defina WUAVY_RUN_REAL_E2E=1 para rodar contra o Supabase de TESTE de verdade.");
  process.exit(0);
}

// -- Credenciais do projeto de TESTE, lidas do arquivo local; nunca impressas. --
const ENV_PATH = "C:\\Users\\User\\wuavy-secrets\\supabase-test.env";
const envVars = Object.fromEntries(
  readFileSync(ENV_PATH, "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1)];
    }),
);

const SUPABASE_URL = envVars.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_HOST = new URL(SUPABASE_URL).host;
const PRODUCTION_REF = "trwrulahqytfbmoxajnc";
const TEST_REF = "wazxofdzvzfgonmwsdhs";

assert.equal(SUPABASE_HOST, `${TEST_REF}.supabase.co`, "O host configurado não é o do projeto de TESTE esperado.");
assert.ok(!SUPABASE_HOST.includes(PRODUCTION_REF), "PARADA DE SEGURANÇA: o host configurado contém a referência de PRODUÇÃO.");
console.log(`Confirmado: escrevendo exclusivamente em ${SUPABASE_HOST} (projeto de TESTE).`);

process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE_URL;
process.env.SUPABASE_SERVICE_ROLE_KEY = envVars.SUPABASE_SERVICE_ROLE_KEY;
// Mercado Pago FICTÍCIO, só para passar a checagem de ambiente — o firewall
// nunca deixa uma chamada de verdade saído daqui.
process.env.MERCADOPAGO_ACCESS_TOKEN = "APP_USR-teste-ficticio-0000000000";
process.env.MERCADOPAGO_ENV = "test";
process.env.MERCADOPAGO_TEST_PAYER_EMAIL = "comprador-teste@example.com";
process.env.NEXT_PUBLIC_SITE_URL = "https://teste.example.com";

const firewall = installFetchFirewall({
  testSupabaseHost: SUPABASE_HOST,
  forbiddenHosts: [`${PRODUCTION_REF}.supabase.co`, `db.${PRODUCTION_REF}.supabase.co`],
});

register("./helpers/real-pg-loader.mjs", import.meta.url);
const { createAdminClient } = await import("../src/lib/supabase/admin.ts");
const admin = createAdminClient();

// ── Guarda: migration 0022 ainda não aplicada? Sai sem registrar testes. ──
{
  const { error } = await admin.from("billing_representatives").select("id").limit(1);
  if (error) {
    console.log(`\nAVISO: billing_representatives não existe em ${SUPABASE_HOST} (${error.message}).`);
    console.log("Migration 0022 ainda não foi aplicada — nenhum teste deste arquivo foi registrado.\n");
    firewall.restore();
    process.exit(0);
  }
}

const charges = await import("../src/lib/billing/charges.ts");
const coupons = await import("../src/lib/billing/coupons.ts");
const representatives = await import("../src/lib/billing/representatives.ts");
const { resolveCoupon, effectiveUses, representativeStats, prospectInviteMessage, shareMessage, PENDING_RESERVATION_TTL_MS } = await import(
  "../src/lib/billing/coupon-rules.ts"
);
const { waLink } = await import("../src/lib/billing/whatsapp.ts");
const { whatsapp } = await import("../src/data/site.ts");

const RUN_ID = randomUUID();
const runTag = `teste-cupons-${RUN_ID}`;
const ADMIN_EMAIL = `${runTag}@example.com`;

const createdChargeIds = [];
const createdClientIds = [];
const createdServiceIds = [];
const createdRepresentativeIds = [];
const createdCouponIds = [];

const jsonResponse = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const isoMsAgo = (ms) => new Date(Date.now() - ms).toISOString();
function freshChargeId() {
  const id = randomUUID();
  createdChargeIds.push(id);
  return id;
}

// -- Fixtures únicas desta execução: cliente, serviço, representante, cupom BRU10. --
let fixtureClientId, fixtureServiceId, repId, couponId;
{
  const { data: client, error: clientError } = await admin
    .from("billing_clients")
    .insert({ name: `${runTag} — cliente`, email: null, whatsapp: null })
    .select("id")
    .single();
  if (clientError) throw new Error("fixture cliente: " + clientError.message);
  fixtureClientId = client.id;
  createdClientIds.push(fixtureClientId);

  const { data: service, error: serviceError } = await admin
    .from("billing_services")
    .insert({ name: `${runTag} — serviço`, kind: "once", default_price_cents: 15000 })
    .select("id")
    .single();
  if (serviceError) throw new Error("fixture serviço: " + serviceError.message);
  fixtureServiceId = service.id;
  createdServiceIds.push(fixtureServiceId);

  const repResult = await representatives.createRepresentative(ADMIN_EMAIL, {
    name: `${runTag} — Bruna`,
    whatsapp: "+5519999990000",
    notes: null,
  });
  assert.equal(repResult.outcome, "saved");
  repId = repResult.representative.id;
  createdRepresentativeIds.push(repId);

  const couponResult = await coupons.createCoupon(ADMIN_EMAIL, repId, {
    code: "BRU10",
    discount_type: "percent",
    discount_percent: 10,
    discount_fixed_cents: null,
    first_payment_only: true,
    valid_from: isoMsAgo(86_400_000),
    valid_until: null,
    max_uses: null,
    serviceIds: [],
  });
  assert.equal(couponResult.outcome, "saved");
  couponId = couponResult.coupon.id;
  createdCouponIds.push(couponId);

  console.log(`Fixtures: cliente ${fixtureClientId}, serviço ${fixtureServiceId}, representante ${repId}, cupom ${couponId} (${runTag}).`);
}

test("1) cadastro de representante e criação do cupom BRU10", async () => {
  const lookup = await coupons.lookupCouponByCode("bru10"); // caixa baixa de propósito
  assert.ok(lookup, "o cupom é encontrado independente da caixa");
  assert.equal(lookup.coupon.code, "BRU10");
  assert.equal(lookup.representative.id, repId);
});

test("2) validação e aplicação do desconto: 10% sobre R$150,00", async () => {
  const lookup = await coupons.lookupCouponByCode("BRU10");
  const history = await coupons.couponChargeHistory(couponId);
  const resolution = resolveCoupon({
    couponCode: "BRU10",
    coupon: lookup.coupon,
    eligibleServiceIds: lookup.eligibleServiceIds,
    chargeHistory: history,
    representativeActive: lookup.representative.active,
    nowMs: Date.now(),
    amountCents: 15000,
    serviceId: fixtureServiceId,
    serviceKind: "once",
  });
  assert.deepEqual(resolution, { applied: true, discountCents: 1500, finalCents: 13500 });
});

let approvedChargeId;
test("3) geração de cobrança com o valor correto (Checkout Pro simulado) e link de WhatsApp para a Wuavy", async () => {
  approvedChargeId = freshChargeId();
  const { error } = await admin.from("billing_charges").insert({
    id: approvedChargeId,
    client_id: fixtureClientId,
    service_id: fixtureServiceId,
    description: `${runTag} — cobrança com cupom`,
    amount_cents: 13500,
    coupon_id: couponId,
    discount_cents: 1500,
  });
  if (error) throw error;

  let receivedUnitPrice = null;
  firewall.setMpHandler(
    withMpIdentity(async (url, init) => {
      if (url.includes("/checkout/preferences") && init?.method === "POST") {
        const body = JSON.parse(init.body);
        receivedUnitPrice = body.items[0].unit_price;
        return jsonResponse(201, { id: `pref-${runTag}`, init_point: `https://mp.example/pref-${runTag}`, collector_id: TEST_COLLECTOR_ID });
      }
      throw new Error("URL de Mercado Pago inesperada: " + url);
    }),
  );

  const result = await charges.createPreference({
    chargeId: approvedChargeId,
    description: "cobrança com cupom",
    amountCents: 13500,
    payerEmail: null,
  });
  assert.equal(receivedUnitPrice, 135, "o Mercado Pago recebeu o valor JÁ com desconto, nunca os R$150 originais");
  assert.ok(result.url.startsWith("https://mp.example/"));

  const link = waLink(whatsapp.number, prospectInviteMessage("BRU10"));
  assert.ok(link.startsWith(`https://wa.me/${whatsapp.number.replace(/\D/g, "")}`), "o link do cliente vai para o WhatsApp oficial da Wuavy, não para a representante");
  assert.match(shareMessage("BRU10", link), /BRU10/);
});

test("4) pagamento aprovado (simulado) e atribuição da venda ao representante", async () => {
  const paymentId = `pagamento-${runTag}`;
  firewall.setMpHandler(
    withMpIdentity(async (url) => {
      if (url.includes(`/v1/payments/${paymentId}`)) {
        return jsonResponse(200, {
          id: paymentId,
          status: "approved",
          external_reference: approvedChargeId,
          transaction_amount: 135,
          currency_id: "BRL",
          date_created: new Date().toISOString(),
        });
      }
      throw new Error("URL de Mercado Pago inesperada: " + url);
    }),
  );
  await charges.syncPayment(paymentId);

  const { data: row } = await admin.from("billing_charges").select("status").eq("id", approvedChargeId).maybeSingle();
  assert.equal(row.status, "approved");

  const repCharges = await coupons.chargesForRepresentative(repId);
  const stats = representativeStats(repCharges);
  assert.equal(stats.confirmedSales, 1);
  assert.equal(stats.convertedClients, 1);
  assert.equal(stats.attributedRevenueCents, 13500);
  assert.equal(stats.grantedDiscountCents, 1500);
});

test("5) contabilização só depois de aprovado: uma cobrança pendente não entra nos resultados", async () => {
  const pendingId = freshChargeId();
  const { error } = await admin.from("billing_charges").insert({
    id: pendingId,
    client_id: fixtureClientId,
    service_id: fixtureServiceId,
    description: `${runTag} — pendente`,
    amount_cents: 13500,
    coupon_id: couponId,
    discount_cents: 1500,
  });
  if (error) throw error;

  const repCharges = await coupons.chargesForRepresentative(repId);
  const stats = representativeStats(repCharges);
  assert.equal(stats.confirmedSales, 1, "ainda só a aprovada do teste 4 conta como venda");
  assert.equal(stats.registeredReferrals, 2, "mas a indicação pendente já está registrada");
  assert.equal(stats.pendingCharges, 1);
});

test("6) limite de uso: cupom com max_uses=1 recusa a segunda tentativa mesmo com a primeira só pendente", async () => {
  const limited = await coupons.createCoupon(ADMIN_EMAIL, repId, {
    code: `L${runTag.slice(-7).toUpperCase()}`,
    discount_type: "fixed",
    discount_percent: null,
    discount_fixed_cents: 1000,
    first_payment_only: true,
    valid_from: isoMsAgo(86_400_000),
    valid_until: null,
    max_uses: 1,
    serviceIds: [],
  });
  assert.equal(limited.outcome, "saved");
  createdCouponIds.push(limited.coupon.id);

  const firstId = freshChargeId();
  await admin.from("billing_charges").insert({
    id: firstId,
    client_id: fixtureClientId,
    service_id: fixtureServiceId,
    description: `${runTag} — primeira do cupom limitado`,
    amount_cents: 14000,
    coupon_id: limited.coupon.id,
    discount_cents: 1000,
  });

  const history = await coupons.couponChargeHistory(limited.coupon.id);
  const resolution = resolveCoupon({
    couponCode: limited.coupon.code,
    coupon: limited.coupon,
    eligibleServiceIds: [],
    chargeHistory: history,
    representativeActive: true,
    nowMs: Date.now(),
    amountCents: 15000,
    serviceId: fixtureServiceId,
    serviceKind: "once",
  });
  assert.equal(resolution.applied, false);
  assert.match(resolution.error, /limite/i);
});

test("7) reserva pendente expira em 48h: uma pendente velha não bloqueia uma tentativa nova", async () => {
  const stale = [{ status: "pending", created_at: isoMsAgo(PENDING_RESERVATION_TTL_MS + 60_000) }];
  assert.equal(effectiveUses(stale, Date.now(), PENDING_RESERVATION_TTL_MS), 0, "pendente com mais de 48h não conta mais");
  const fresh = [{ status: "pending", created_at: isoMsAgo(60_000) }];
  assert.equal(effectiveUses(fresh, Date.now(), PENDING_RESERVATION_TTL_MS), 1, "pendente recente ainda reserva a vaga");
});

test("8) desativação em cascata e preservação do histórico de desconto", async () => {
  await representatives.setRepresentativeActive(ADMIN_EMAIL, repId, false);

  const lookup = await coupons.lookupCouponByCode("BRU10");
  assert.equal(lookup.coupon.active, false, "desativar o representante desativou o cupom em cascata");

  const resolution = resolveCoupon({
    couponCode: "BRU10",
    coupon: lookup.coupon,
    eligibleServiceIds: [],
    chargeHistory: [],
    representativeActive: lookup.representative.active,
    nowMs: Date.now(),
    amountCents: 15000,
    serviceId: fixtureServiceId,
    serviceKind: "once",
  });
  assert.equal(resolution.applied, false, "um novo uso é recusado depois da desativação");

  const { data: oldRow } = await admin
    .from("billing_charges")
    .select("coupon_id, discount_cents, amount_cents")
    .eq("id", approvedChargeId)
    .maybeSingle();
  assert.deepEqual(
    oldRow,
    { coupon_id: couponId, discount_cents: 1500, amount_cents: 13500 },
    "a cobrança já aprovada antes da desativação continua exatamente como estava",
  );
});

after(async () => {
  firewall.restore();

  if (createdChargeIds.length) {
    const { error } = await admin.from("billing_charges").delete().in("id", createdChargeIds);
    if (error) console.error("LIMPEZA: falha ao apagar billing_charges", error.message, createdChargeIds);
  }
  if (createdCouponIds.length) {
    const { error } = await admin.from("billing_coupons").delete().in("id", createdCouponIds);
    if (error) console.error("LIMPEZA: falha ao apagar billing_coupons", error.message, createdCouponIds);
  }
  if (createdRepresentativeIds.length) {
    const { error } = await admin.from("billing_representatives").delete().in("id", createdRepresentativeIds);
    if (error) console.error("LIMPEZA: falha ao apagar billing_representatives", error.message, createdRepresentativeIds);
  }
  if (createdServiceIds.length) {
    const { error } = await admin.from("billing_services").delete().in("id", createdServiceIds);
    if (error) console.error("LIMPEZA: falha ao apagar billing_services", error.message, createdServiceIds);
  }
  if (createdClientIds.length) {
    const { error } = await admin.from("billing_clients").delete().in("id", createdClientIds);
    if (error) console.error("LIMPEZA: falha ao apagar billing_clients", error.message, createdClientIds);
  }
  // billing_coupon_services cai em cascata com billing_coupons (migration 0022).
  // billing_coupon_audit não é apagado: é o próprio registro de auditoria —
  // fica marcado com o e-mail ADMIN_EMAIL desta execução para quem quiser conferir.

  const leftovers = {};
  for (const [table, column] of [
    ["billing_clients", "name"],
    ["billing_services", "name"],
    ["billing_representatives", "name"],
  ]) {
    const { data } = await admin.from(table).select("id").ilike(column, `%${runTag}%`);
    if (data && data.length) leftovers[table] = data.map((r) => r.id);
  }
  const { data: leftoverCharges } = await admin.from("billing_charges").select("id").in("id", createdChargeIds);
  if (leftoverCharges && leftoverCharges.length) leftovers.billing_charges = leftoverCharges.map((r) => r.id);
  const { data: leftoverCoupons } = await admin.from("billing_coupons").select("id").in("id", createdCouponIds);
  if (leftoverCoupons && leftoverCoupons.length) leftovers.billing_coupons = leftoverCoupons.map((r) => r.id);

  if (Object.keys(leftovers).length) {
    console.error("LIMPEZA INCOMPLETA — registros restantes:", JSON.stringify(leftovers));
    throw new Error("Limpeza incompleta: ver ids acima. Nenhuma exclusão genérica foi executada.");
  }
  console.log(`Limpeza confirmada: nenhum registro do prefixo ${runTag} restante.`);
});

/*
  Homologação final: os mesmos cenários de concorrência/reconciliação já
  provados contra o FakeAdmin (billing-integration.test.mjs), agora contra o
  Postgres DE VERDADE do projeto Supabase de TESTE (wazxofdzvzfgonmwsdhs).

  Segurança desta suíte (tests/helpers/fetch-firewall.mjs):
  - api.mercadopago.com é sempre simulado por um handler que cada teste
    registra; sem handler, a chamada falha alto.
  - o host do Supabase de TESTE (confirmado abaixo, por igualdade exata com
    a URL configurada) vai para a rede real.
  - qualquer outro host — em especial o de produção, nomeado explicitamente —
    é bloqueado antes de sair qualquer pacote.

  Nenhuma tabela fora de billing_clients/billing_services/billing_charges/
  billing_payments é tocada. Toda fixture leva um prefixo único desta
  execução e é apagada no fim, pelos próprios ids registrados.
*/

import { register } from "node:module";
import { randomUUID } from "node:crypto";
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { installFetchFirewall } from "./helpers/fetch-firewall.mjs";
import { TEST_COLLECTOR_ID, withMpIdentity } from "./helpers/mp-identity.mjs";

// -- 1. Credenciais do projeto de TESTE, lidas do arquivo local; nunca impressas. --
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

// Confirmação explícita ANTES de qualquer escrita, pela URL/host
// efetivamente usados — não por uma suposição.
assert.equal(SUPABASE_HOST, `${TEST_REF}.supabase.co`, "O host configurado não é o do projeto de TESTE esperado.");
assert.ok(!SUPABASE_HOST.includes(PRODUCTION_REF), "PARADA DE SEGURANÇA: o host configurado contém a referência de PRODUÇÃO.");
console.log(`Confirmado: escrevendo exclusivamente em ${SUPABASE_HOST} (projeto de TESTE).`);

process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE_URL;
process.env.SUPABASE_SERVICE_ROLE_KEY = envVars.SUPABASE_SERVICE_ROLE_KEY;
// Credenciais do Mercado Pago FICTÍCIAS, só para passar a checagem de
// ambiente — o firewall abaixo nunca deixa uma chamada de Mercado Pago sair
// de verdade, então nenhuma delas é usada como requisição real.
process.env.MERCADOPAGO_ACCESS_TOKEN = "APP_USR-teste-ficticio-0000000000";
process.env.MERCADOPAGO_ENV = "test";
process.env.MERCADOPAGO_TEST_PAYER_EMAIL = "comprador-teste@example.com";
process.env.NEXT_PUBLIC_SITE_URL = "https://teste.example.com";

const firewall = installFetchFirewall({
  testSupabaseHost: SUPABASE_HOST,
  forbiddenHosts: [`${PRODUCTION_REF}.supabase.co`, `db.${PRODUCTION_REF}.supabase.co`],
});

register("./helpers/real-pg-loader.mjs", import.meta.url);
const charges = await import("../src/lib/billing/charges.ts");
const { createAdminClient } = await import("../src/lib/supabase/admin.ts");

const admin = createAdminClient();
const RUN_ID = randomUUID();
const runTag = `teste-concorrencia-${RUN_ID}`;

const createdChargeIds = [];
const createdClientIds = [];
const createdServiceIds = [];

function freshChargeId() {
  const id = randomUUID();
  createdChargeIds.push(id);
  return id;
}

async function insertCharge(overrides = {}) {
  const id = freshChargeId();
  const { error } = await admin.from("billing_charges").insert({
    id,
    client_id: fixtureClientId,
    service_id: fixtureServiceId,
    description: `${runTag} — cobrança fictícia`,
    amount_cents: 15000,
    ...overrides,
  });
  if (error) throw new Error("Falha ao inserir fixture de cobrança: " + error.message);
  return id;
}

async function readCharge(id) {
  const { data, error } = await admin.from("billing_charges").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}

const jsonResponse = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const isoMsAgo = (ms) => new Date(Date.now() - ms).toISOString();

let createCalls = 0; // conta só POST /checkout/preferences (criação de verdade).

// -- Fixtures de cliente e serviço, únicas desta execução -----------------
let fixtureClientId;
let fixtureServiceId;

{
  const { data: client, error: clientError } = await admin
    .from("billing_clients")
    .insert({ name: `${runTag} — cliente fictício`, email: null, whatsapp: null })
    .select("id")
    .single();
  if (clientError) throw new Error("Falha ao criar cliente fictício: " + clientError.message);
  fixtureClientId = client.id;
  createdClientIds.push(fixtureClientId);

  const { data: service, error: serviceError } = await admin
    .from("billing_services")
    .insert({ name: `${runTag} — serviço fictício`, kind: "once", default_price_cents: 15000 })
    .select("id")
    .single();
  if (serviceError) throw new Error("Falha ao criar serviço fictício: " + serviceError.message);
  fixtureServiceId = service.id;
  createdServiceIds.push(fixtureServiceId);

  console.log(`Fixtures criadas: cliente ${fixtureClientId}, serviço ${fixtureServiceId} (prefixo ${runTag}).`);
}

// ── A. Duas requisições simultâneas, Postgres real ──────────────────────

test("A) duas conexões reais disputando a mesma cobrança: só uma reivindica", async () => {
  const id = await insertCharge();
  const [r1, r2] = await Promise.all([charges.claimCreation(id), charges.claimCreation(id)]);
  const results = [r1, r2].sort();
  assert.deepEqual(results, ["claimed", "in_progress"]);

  const row = await readCharge(id);
  assert.ok(row.creation_claimed_at, "a reserva foi gravada de verdade no Postgres");
});

// ── B. Reserva vencida travando atomicamente, no Postgres real ─────────

test("B) reserva vencida: claimCreation grava creation_blocked_at de verdade", async () => {
  const id = await insertCharge();
  const { error } = await admin.from("billing_charges").update({ creation_claimed_at: isoMsAgo(60_000) }).eq("id", id);
  if (error) throw error;

  const result = await charges.claimCreation(id);
  assert.equal(result, "blocked");

  const row = await readCharge(id);
  assert.ok(row.creation_blocked_at, "o bloqueio foi persistido no Postgres real");
  assert.equal(row.provider_preference_id, null);
});

// ── C. Falha de persistência REAL (violação de constraint única) ───────

test("C) falha de persistência real: provider_preference_id duplicado é rejeitado pelo Postgres de verdade", async () => {
  const idA = await insertCharge();
  const idB = await insertCharge();
  const sharedPreferenceId = `pref-conflito-${runTag}`;

  // B já "tem" essa Preference — grava direto, só para criar o conflito real.
  const { error: setupError } = await admin
    .from("billing_charges")
    .update({ provider_preference_id: sharedPreferenceId, payment_url: "https://mp.example/" + sharedPreferenceId })
    .eq("id", idB);
  if (setupError) throw setupError;

  assert.equal(await charges.claimCreation(idA), "claimed");
  // persistPreference tenta gravar o MESMO id em A: o índice único de
  // provider_preference_id (migration 0019) recusa de verdade.
  const outcome = await charges.persistPreference(idA, sharedPreferenceId, "https://mp.example/" + sharedPreferenceId);
  assert.equal(outcome, "failed");

  const rowA = await readCharge(idA);
  assert.equal(rowA.provider_preference_id, null, "nada foi gravado em A depois da rejeição real do Postgres");
});

// ── D. Resposta tardia legítima, recuperada no Postgres real ───────────

test("D) resposta tardia legítima: persistPreference recupera mesmo com a linha bloqueada de verdade", async () => {
  const id = await insertCharge();
  assert.equal(await charges.claimCreation(id), "claimed");

  // Simula outra chamada bloqueando a linha ENQUANTO esta ainda está em
  // andamento — uma escrita direta e real no Postgres.
  const { error } = await admin.from("billing_charges").update({ creation_blocked_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;

  const preferenceId = `pref-tardio-${runTag}`;
  const outcome = await charges.persistPreference(id, preferenceId, "https://mp.example/" + preferenceId);
  assert.equal(outcome, "saved");

  const row = await readCharge(id);
  assert.equal(row.provider_preference_id, preferenceId);
  assert.equal(row.creation_blocked_at, null, "a recuperação também limpou o bloqueio, de verdade");
});

// ── E. Recuperação automática, Preference validada, Postgres real ──────

test("E) investigateBlockedCharge recupera uma Preference válida encontrada na busca (mock de MP, Postgres real)", async () => {
  const id = await insertCharge({ amount_cents: 15000 });
  const { error } = await admin.from("billing_charges").update({ creation_blocked_at: isoMsAgo(60_000) }).eq("id", id);
  if (error) throw error;

  const preferenceId = `pref-recuperado-${runTag}`;
  firewall.setMpHandler(withMpIdentity(async (url) => {
    if (url.includes("/checkout/preferences/search")) return jsonResponse(200, { elements: [{ id: preferenceId }], total: 1, next_offset: 1 });
    if (url.includes(`/checkout/preferences/${preferenceId}`)) {
      return jsonResponse(200, {
        id: preferenceId,
        init_point: "https://mp.example/" + preferenceId,
        collector_id: TEST_COLLECTOR_ID,
        external_reference: id,
        items: [{ unit_price: 150, quantity: 1, currency_id: "BRL" }],
      });
    }
    throw new Error("URL de Mercado Pago inesperada: " + url);
  }));

  const result = await charges.investigateBlockedCharge(id);
  assert.equal(result.verdict, "recovered");

  const row = await readCharge(id);
  assert.equal(row.provider_preference_id, preferenceId);
  assert.equal(row.creation_blocked_at, null);
});

// ── F. Busca indisponível ou ambígua: mantém bloqueio, Postgres real ───

test("F1) busca de Preferences indisponível: mantém bloqueio real", async () => {
  const id = await insertCharge();
  const { error } = await admin.from("billing_charges").update({ creation_blocked_at: isoMsAgo(60_000) }).eq("id", id);
  if (error) throw error;

  firewall.setMpHandler(async () => {
    throw new TypeError("fetch failed (simulado)");
  });

  const result = await charges.investigateBlockedCharge(id);
  assert.equal(result.verdict, "stay_blocked");
  const row = await readCharge(id);
  assert.equal(row.provider_preference_id, null);
  assert.ok(row.creation_blocked_at);
});

test("F2) múltiplas Preferences para a mesma referência: mantém bloqueio real, nunca escolhe sozinha", async () => {
  const id = await insertCharge();
  const { error } = await admin.from("billing_charges").update({ creation_blocked_at: isoMsAgo(60_000) }).eq("id", id);
  if (error) throw error;

  firewall.setMpHandler(async (url) => {
    if (url.includes("/checkout/preferences/search")) return jsonResponse(200, { elements: [{ id: "pref-x" }, { id: "pref-y" }], total: 2, next_offset: 2 });
    throw new Error("URL inesperada: " + url);
  });

  const result = await charges.investigateBlockedCharge(id);
  assert.equal(result.verdict, "stay_blocked");
  const row = await readCharge(id);
  assert.equal(row.provider_preference_id, null);
});

// ── G. Paginação inconsistente: falha fechado, Postgres real ───────────

test("G) next_offset não avança: falha fechado, mantém bloqueio real", async () => {
  const id = await insertCharge();
  const { error } = await admin.from("billing_charges").update({ creation_blocked_at: isoMsAgo(60_000) }).eq("id", id);
  if (error) throw error;

  let calls = 0;
  firewall.setMpHandler(async () => {
    calls += 1;
    return jsonResponse(200, { elements: [{ id: "pref-1" }], total: 5, next_offset: 0 }); // nunca avança
  });

  const result = await charges.investigateBlockedCharge(id);
  assert.equal(result.verdict, "stay_blocked");
  assert.equal(calls, 1, "parou na primeira página, nunca em loop");
  const row = await readCharge(id);
  assert.equal(row.provider_preference_id, null);
});

// ── H. Nenhum caminho cria uma segunda Preference quando é incerto ─────

test("H) criação com resposta perdida: 1 única chamada de criação em toda a sequência, mesmo depois de travar e investigar", async () => {
  const id = await insertCharge();
  assert.equal(await charges.claimCreation(id), "claimed");

  const preferenceId = `pref-perdido-${runTag}`;
  firewall.setMpHandler(withMpIdentity(async (url, init) => {
    if (url.includes("/checkout/preferences") && init?.method === "POST") {
      createCalls += 1;
      return jsonResponse(201, { id: preferenceId, init_point: "https://mp.example/" + preferenceId, collector_id: TEST_COLLECTOR_ID });
    }
    throw new Error("URL inesperada no handler H (criação): " + url);
  }));
  const created = await charges.createPreference({ chargeId: id, description: "Serviço", amountCents: 15000, payerEmail: null });
  assert.equal(created.id, preferenceId);

  // A resposta "se perde": nunca persiste nem bloqueia. Tempo passa.
  const { error } = await admin.from("billing_charges").update({ creation_claimed_at: isoMsAgo(60_000) }).eq("id", id);
  if (error) throw error;
  assert.equal(await charges.claimCreation(id), "blocked", "trava sozinha, nunca reivindica de novo");

  firewall.setMpHandler(withMpIdentity(async (url, init) => {
    if (url.includes("/checkout/preferences") && init?.method === "POST") {
      createCalls += 1; // se isto disparar, o teste abaixo falha — é a prova.
      return jsonResponse(201, { id: "outra-preference-que-nao-deveria-existir" });
    }
    if (url.includes("/checkout/preferences/search")) return jsonResponse(200, { elements: [{ id: preferenceId }], total: 1, next_offset: 1 });
    if (url.includes(`/checkout/preferences/${preferenceId}`)) {
      return jsonResponse(200, {
        id: preferenceId,
        init_point: "https://mp.example/" + preferenceId,
        collector_id: TEST_COLLECTOR_ID,
        external_reference: id,
        items: [{ unit_price: 150, quantity: 1, currency_id: "BRL" }],
      });
    }
    throw new Error("URL inesperada no handler H (investigação): " + url);
  }));

  const result = await charges.investigateBlockedCharge(id);
  assert.equal(result.verdict, "recovered");
  assert.equal(createCalls, 1, "createPreference nunca foi chamado uma segunda vez, em todo o cenário");

  const row = await readCharge(id);
  assert.equal(row.provider_preference_id, preferenceId);
});

// ── Limpeza: só pelos ids registrados desta execução, e verificação final ──

after(async () => {
  firewall.restore();

  if (createdChargeIds.length) {
    const { error } = await admin.from("billing_charges").delete().in("id", createdChargeIds);
    if (error) console.error("LIMPEZA: falha ao apagar billing_charges", error.message, createdChargeIds);
  }
  if (createdServiceIds.length) {
    const { error } = await admin.from("billing_services").delete().in("id", createdServiceIds);
    if (error) console.error("LIMPEZA: falha ao apagar billing_services", error.message, createdServiceIds);
  }
  if (createdClientIds.length) {
    const { error } = await admin.from("billing_clients").delete().in("id", createdClientIds);
    if (error) console.error("LIMPEZA: falha ao apagar billing_clients", error.message, createdClientIds);
  }

  // Verificação final: nenhuma linha com o prefixo desta execução deve sobrar
  // em nenhuma das quatro tabelas.
  const leftovers = {};
  for (const [table, column] of [
    ["billing_clients", "name"],
    ["billing_services", "name"],
  ]) {
    const { data } = await admin.from(table).select("id").ilike(column, `%${runTag}%`);
    if (data && data.length) leftovers[table] = data.map((r) => r.id);
  }
  const { data: leftoverCharges } = await admin.from("billing_charges").select("id").in("id", createdChargeIds);
  if (leftoverCharges && leftoverCharges.length) leftovers.billing_charges = leftoverCharges.map((r) => r.id);

  if (Object.keys(leftovers).length) {
    console.error("LIMPEZA INCOMPLETA — registros restantes:", JSON.stringify(leftovers));
    throw new Error("Limpeza incompleta: ver ids acima. Nenhuma exclusão genérica foi executada.");
  }
  console.log(`Limpeza confirmada: nenhum registro do prefixo ${runTag} restante nas 4 tabelas.`);
  console.log(`Total de chamadas reais de criação de Preference simuladas (POST): ${createCalls}`);
  console.log(`Total de chamadas ao Mercado Pago simuladas (todas): ${firewall.getMpCallCount()}`);
});

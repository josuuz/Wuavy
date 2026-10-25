/*
  Homologação final da reserva atômica de criação de assinatura
  (claimSubscriptionCreation/persistSubscriptionId/blockSubscriptionCreation),
  os mesmos cenários já provados contra o FakeAdmin
  (tests/pulse-subscribe-integration.test.mjs, testes 7 e 8), agora contra o
  Postgres DE VERDADE do projeto Supabase de TESTE (wazxofdzvzfgonmwsdhs).
  Mesmo padrão de tests/billing-integration-real.test.mjs.

  Nenhuma das funções exercitadas aqui chama o Mercado Pago (são operações
  puras sobre a linha em subscriptions) — mesmo assim o firewall de
  tests/helpers/fetch-firewall.mjs é instalado, pela mesma razão de sempre:
  qualquer chamada de rede que não seja para o host do projeto de TESTE
  lança, em vez de silenciosamente sair para outro lugar.

  Segurança desta suíte:
  - o host do Supabase de TESTE (confirmado abaixo, por igualdade exata com
    a URL configurada) vai para a rede real.
  - qualquer outro host — em especial o de produção, nomeado explicitamente —
    é bloqueado antes de sair qualquer pacote.
  - cada usuário e cada linha de subscriptions desta execução leva um
    sufixo/prefixo único e é apagado no fim, pelos próprios ids registrados,
    com verificação de que nada sobrou.
*/

import { register } from "node:module";
import { randomUUID } from "node:crypto";
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { installFetchFirewall } from "./helpers/fetch-firewall.mjs";

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
// Credenciais do Mercado Pago FICTÍCIAS, só para o módulo carregar — nenhuma
// das quatro funções testadas aqui chama o Mercado Pago.
process.env.MERCADOPAGO_ACCESS_TOKEN = "APP_USR-teste-ficticio-0000000000";
process.env.MERCADOPAGO_ENV = "test";
process.env.MERCADOPAGO_TEST_PAYER_EMAIL = "comprador-teste@example.com";
process.env.NEXT_PUBLIC_SITE_URL = "https://teste.example.com";

const firewall = installFetchFirewall({
  testSupabaseHost: SUPABASE_HOST,
  forbiddenHosts: [`${PRODUCTION_REF}.supabase.co`, `db.${PRODUCTION_REF}.supabase.co`],
});

register("./helpers/pulse-real-pg-loader.mjs", import.meta.url);
const billing = await import("../src/lib/flow/billing.ts");
const { createAdminClient } = await import("../src/lib/supabase/admin.ts");

const admin = createAdminClient();
const RUN_ID = randomUUID();
const runTag = `teste-claim-${RUN_ID}`;

const createdSubscriptionIds = [];
const createdUserIds = [];

async function freshUser() {
  const { data, error } = await admin.auth.admin.createUser({
    email: `${runTag}-${createdUserIds.length}@exemplo.invalido`,
    email_confirm: true,
  });
  if (error) throw new Error("Falha ao criar usuário fictício: " + error.message);
  createdUserIds.push(data.user.id);
  return data.user.id;
}

async function insertSubscriptionRow(overrides = {}) {
  const userId = await freshUser();
  const id = randomUUID();
  const { error } = await admin.from("subscriptions").insert({
    id,
    user_id: userId,
    organization_id: null,
    status: "pending",
    ...overrides,
  });
  if (error) throw new Error("Falha ao inserir fixture de assinatura: " + error.message);
  createdSubscriptionIds.push(id);
  return id;
}

async function readRow(id) {
  const { data, error } = await admin.from("subscriptions").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}

const isoMsAgo = (ms) => new Date(Date.now() - ms).toISOString();

// ── A. Duas reivindicações reais disputando a mesma linha ──────────────

test("A) duas conexões reais disputando a mesma linha: só uma 'claimed'", async () => {
  const id = await insertSubscriptionRow();
  const [r1, r2] = await Promise.all([billing.claimSubscriptionCreation(id), billing.claimSubscriptionCreation(id)]);
  assert.deepEqual([r1, r2].sort(), ["claimed", "in_progress"]);

  const row = await readRow(id);
  assert.ok(row.creation_claimed_at, "a reserva foi gravada de verdade no Postgres");
});

// ── B. Reserva vencida travando atomicamente, no Postgres real ─────────

test("B) reserva vencida: claimSubscriptionCreation grava creation_blocked_at de verdade", async () => {
  const id = await insertSubscriptionRow({ creation_claimed_at: isoMsAgo(60_000) });
  const result = await billing.claimSubscriptionCreation(id);
  assert.equal(result, "blocked");

  const row = await readRow(id);
  assert.ok(row.creation_blocked_at, "o bloqueio foi persistido no Postgres real");
  assert.equal(row.provider_subscription_id, null);
});

// ── C. Falha de persistência REAL (violação de índice único) ───────────

test("C) falha de persistência real: provider_subscription_id duplicado é rejeitado pelo Postgres de verdade", async () => {
  const idA = await insertSubscriptionRow();
  const idB = await insertSubscriptionRow();
  const sharedProviderId = `preapproval-conflito-${runTag}`;

  // B já "tem" essa assinatura no Mercado Pago — grava direto, só para criar o conflito real.
  const { error: setupError } = await admin.from("subscriptions").update({ provider_subscription_id: sharedProviderId }).eq("id", idB);
  if (setupError) throw setupError;

  assert.equal(await billing.claimSubscriptionCreation(idA), "claimed");
  // persistSubscriptionId tenta gravar o MESMO id em A: o índice único de
  // provider_subscription_id (migration 0003) recusa de verdade.
  const outcome = await billing.persistSubscriptionId(idA, sharedProviderId);
  assert.equal(outcome, "failed");

  const rowA = await readRow(idA);
  assert.equal(rowA.provider_subscription_id, null, "nada foi gravado em A depois da rejeição real do Postgres");
});

// ── D. Resposta tardia legítima, recuperada no Postgres real ──────────

test("D) resposta tardia legítima: persistSubscriptionId recupera mesmo com a linha bloqueada de verdade", async () => {
  const id = await insertSubscriptionRow();
  assert.equal(await billing.claimSubscriptionCreation(id), "claimed");

  // Simula outra chamada bloqueando a linha ENQUANTO esta ainda está em
  // andamento — uma escrita direta e real no Postgres.
  const { error } = await admin.from("subscriptions").update({ creation_blocked_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;

  const providerId = `preapproval-tardio-${runTag}`;
  // O UPDATE condicional de persistSubscriptionId não afeta a linha (está
  // bloqueada de verdade), mas o código distingue esse caso de um id
  // duplicado: lê o estado atual, vê que não há provider_subscription_id
  // nenhum ainda, e recupera pelo caminho seguro
  // (writeRecoveredSubscriptionId) — "saved", nunca descartando a resposta
  // legítima do Mercado Pago só porque chegou depois do bloqueio.
  const outcome = await billing.persistSubscriptionId(id, providerId);
  assert.equal(outcome, "saved", "a resposta tardia e legítima é recuperada, de verdade, mesmo com a linha bloqueada");

  const row = await readRow(id);
  assert.equal(row.provider_subscription_id, providerId);
  assert.equal(row.creation_blocked_at, null, "a recuperação também limpou o bloqueio, de verdade");
});

// ── E. Dois ids diferentes para a mesma linha nunca se sobrescrevem ────

test("E) duas respostas diferentes para a mesma linha: persistSubscriptionId nunca sobrescreve, mesmo bloqueada de verdade", async () => {
  const id = await insertSubscriptionRow();
  const jaSalvo = `preapproval-ja-salvo-${runTag}`;
  const { error } = await admin
    .from("subscriptions")
    .update({ provider_subscription_id: jaSalvo, creation_blocked_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;

  const outcome = await billing.persistSubscriptionId(id, `preapproval-outro-${runTag}`);
  assert.equal(outcome, "failed", "duas assinaturas diferentes para a mesma linha nunca se resolvem sozinhas");

  const row = await readRow(id);
  assert.equal(row.provider_subscription_id, jaSalvo, "o id que já estava salvo continua, intacto");
});

// ── F/G. Migration 0021: uma assinatura viva por pessoa, sem clínica ainda ──

test("F) migration 0021: duas linhas 'pending' sem clínica para o mesmo usuário são rejeitadas de verdade pelo índice novo", async () => {
  const userId = await freshUser();
  const idA = randomUUID();
  const { error: errorA } = await admin.from("subscriptions").insert({ id: idA, user_id: userId, organization_id: null, status: "pending" });
  if (errorA) throw errorA;
  createdSubscriptionIds.push(idA);

  const idB = randomUUID();
  const { error: errorB } = await admin.from("subscriptions").insert({ id: idB, user_id: userId, organization_id: null, status: "pending" });
  assert.ok(errorB, "a segunda linha pending para o mesmo usuário sem clínica deveria ser rejeitada pelo Postgres de verdade");
  assert.match(errorB.message, /unique|duplicate/i);

  const { data: leftover } = await admin.from("subscriptions").select("id").eq("id", idB);
  assert.equal(leftover?.length ?? 0, 0, "a linha rejeitada pelo índice nunca chegou a existir");
});

test("G) migration 0021: duas linhas 'rejected' sem clínica para o mesmo usuário não conflitam — retentativa continua livre", async () => {
  const userId = await freshUser();
  const idA = randomUUID();
  const { error: errorA } = await admin.from("subscriptions").insert({ id: idA, user_id: userId, organization_id: null, status: "rejected" });
  if (errorA) throw errorA;
  createdSubscriptionIds.push(idA);

  const idB = randomUUID();
  const { error: errorB } = await admin.from("subscriptions").insert({ id: idB, user_id: userId, organization_id: null, status: "rejected" });
  assert.equal(errorB, null, "duas recusas para a mesma pessoa não violam o índice novo, de verdade");
  createdSubscriptionIds.push(idB);
});

// ── Limpeza: só pelos ids registrados desta execução, e verificação final ──

after(async () => {
  firewall.restore();

  if (createdSubscriptionIds.length) {
    const { error } = await admin.from("subscriptions").delete().in("id", createdSubscriptionIds);
    if (error) console.error("LIMPEZA: falha ao apagar subscriptions", error.message, createdSubscriptionIds);
  }
  for (const userId of createdUserIds) {
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) console.error("LIMPEZA: falha ao apagar usuário fictício", error.message, userId);
  }

  const { data: leftoverSubs } = await admin.from("subscriptions").select("id").in("id", createdSubscriptionIds);
  if (leftoverSubs && leftoverSubs.length) {
    console.error("LIMPEZA INCOMPLETA — subscriptions restantes:", JSON.stringify(leftoverSubs.map((r) => r.id)));
    throw new Error("Limpeza incompleta: ver ids acima. Nenhuma exclusão genérica foi executada.");
  }
  console.log(`Limpeza confirmada: nenhuma linha de subscriptions do prefixo ${runTag} restante.`);
});

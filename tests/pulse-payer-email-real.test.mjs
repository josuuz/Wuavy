/*
  A migration 0023 (payer_email) contra o Postgres e o PostgREST DE VERDADE do projeto
  Supabase de TESTE (wazxofdzvzfgonmwsdhs). A prova local em PGlite
  (supabase/propostas/clinavy-assinatura/pgspike) prova o SQL; esta prova o AMBIENTE:
  a restrição, a RLS e os privilégios como o Supabase os aplica de fato, com usuários
  reais de autenticação, e as consultas exatas que lib/flow/session.ts faz.

  Segurança (mesmo padrão de billing-integration-real.test.mjs):
  - o host é conferido por igualdade exata contra o do TESTE, e o ref de produção é
    nomeado e proibido, ANTES de qualquer requisição;
  - tests/helpers/fetch-firewall.mjs bloqueia qualquer host que não seja o do TESTE —
    inclusive o de produção, nomeado explicitamente;
  - toda fixture leva uma etiqueta única desta execução e é apagada no fim (apagar o
    usuário leva as assinaturas por cascata), com verificação de que nada sobrou;
  - as linhas que já existiam no TESTE nunca são lidas para escrita nem tocadas.

  Opt-in: só roda com WUAVY_RUN_REAL_E2E=1, como billing-coupons-e2e-real.test.mjs. Sem a
  migration 0023 aplicada no TESTE, falha de propósito: é isso que ele verifica.
*/

import { randomUUID } from "node:crypto";
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { createClient } from "@supabase/supabase-js";

import { installFetchFirewall } from "./helpers/fetch-firewall.mjs";
import { SUBSCRIPTION_SELECT } from "./helpers/subscription-select.mjs";

// -- Opt-in: nunca dispara sozinho num `node --test tests/*.test.mjs`. --
if (process.env.WUAVY_RUN_REAL_E2E !== "1") {
  console.log("Pulado (tests/pulse-payer-email-real.test.mjs): defina WUAVY_RUN_REAL_E2E=1 para rodar contra o Supabase de TESTE de verdade.");
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

installFetchFirewall({
  testSupabaseHost: SUPABASE_HOST,
  forbiddenHosts: [`${PRODUCTION_REF}.supabase.co`, `db.${PRODUCTION_REF}.supabase.co`],
});

const NO_SESSION = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(SUPABASE_URL, envVars.SUPABASE_SERVICE_ROLE_KEY, NO_SESSION);
const PUBLISHABLE = envVars.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

const RUN = randomUUID();
const runTag = `teste-payer-${RUN}`;
const createdUserIds = [];

async function freshUser(label) {
  const password = `Aa1!${randomUUID()}`;
  const email = `${runTag}-${label}@exemplo.invalido`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw new Error("Falha ao criar usuário fictício: " + error.message);
  createdUserIds.push(data.user.id);
  const client = createClient(SUPABASE_URL, PUBLISHABLE, NO_SESSION);
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) throw new Error("Falha ao entrar como usuário fictício: " + signInError.message);
  return { id: data.user.id, client };
}

async function insert(userId, overrides = {}) {
  return admin
    .from("subscriptions")
    .insert({ id: randomUUID(), user_id: userId, status: "rejected", ...overrides })
    .select("id, payer_email")
    .single();
}

const A = await freshUser("a");
const B = await freshUser("b");
const payerA = `pagador-${RUN}@exemplo.invalido`;

// ── inserção e leitura ──────────────────────────────────────────

test("insere com pagador e lê de volta o mesmo valor", async () => {
  const { data, error } = await insert(A.id, { payer_email: payerA });
  assert.equal(error, null, error?.message);
  assert.equal(data.payer_email, payerA);
});

test("COMPATIBILIDADE: o insert do código ANTIGO (sem a coluna) continua valendo, e fica null", async () => {
  const { data, error } = await insert(A.id);
  assert.equal(error, null, error?.message);
  assert.equal(data.payer_email, null);
});

test("COMPATIBILIDADE: a leitura do código antigo (sem payer_email na lista) funciona", async () => {
  const antiga = SUBSCRIPTION_SELECT.split(",")
    .map((c) => c.trim())
    .filter((c) => c !== "payer_email" && c !== "created_at")
    .join(", ");
  const { error } = await admin.from("subscriptions").select(antiga).eq("user_id", A.id);
  assert.equal(error, null, error?.message);
});

// ── a restrição ─────────────────────────────────────────────────

test("CONSTRAINT: recusa e-mail com espaço em branco, curto demais, vazio e longo demais, com o nome da restrição", async () => {
  for (const torto of [" x@y.com", "x@y.com ", "\tx@y.com", "x@y.com\n", "ab", "", "a".repeat(255)]) {
    const { error } = await insert(A.id, { payer_email: torto });
    assert.ok(error, `deveria recusar ${JSON.stringify(torto.slice(0, 12))}`);
    assert.equal(error.code, "23514", `check_violation para ${JSON.stringify(torto.slice(0, 12))}`);
    assert.match(error.message, /subscriptions_payer_email_shape/);
  }
});

test("CONSTRAINT: aceita o limite exato de 254 caracteres e um endereço comum", async () => {
  const limite = "a".repeat(254 - "@x.co".length) + "@x.co";
  for (const ok of [limite, `joao_silva+${RUN}@exemplo.com.br`]) {
    const { error } = await insert(A.id, { payer_email: ok });
    assert.equal(error, null, error?.message);
  }
});

test("CONSTRAINT: as garantias de unicidade das 0020/0021 seguem de pé com a coluna nova", async () => {
  const solo = await freshUser("solo");
  const primeira = await insert(solo.id, { status: "pending", payer_email: `a-${RUN}@exemplo.invalido` });
  assert.equal(primeira.error, null, primeira.error?.message);
  const segunda = await insert(solo.id, { status: "pending", payer_email: `b-${RUN}@exemplo.invalido` });
  assert.equal(segunda.error?.code, "23505", "duas vivas para a mesma pessoa, sem clínica");
  const cancelada = await insert(solo.id, { status: "cancelled", payer_email: `a-${RUN}@exemplo.invalido` });
  assert.equal(cancelada.error, null, "cancelada não é viva");
});

// ── a RLS, como o Supabase a aplica ─────────────────────────────

test("RLS: a pessoa lê, com a consulta EXATA de session.ts, só as próprias linhas — com o pagador", async () => {
  const { data, error } = await A.client
    .from("subscriptions")
    .select(SUBSCRIPTION_SELECT)
    .or(`user_id.eq.${A.id}`)
    .neq("status", "rejected")
    .order("created_at", { ascending: false })
    .limit(200);
  assert.equal(error, null, error?.message);
  // As fixtures de A são quase todas 'rejected' (para não colidir com a unicidade) e ficam
  // de fora desta leitura, como no app; o que importa aqui é a CONSULTA funcionar de ponta a ponta.
  assert.ok(Array.isArray(data));
  assert.ok(data.every((row) => "payer_email" in row && "created_at" in row), "as colunas da lista do app existem e chegam");

  const todas = await A.client.from("subscriptions").select("id, payer_email").eq("payer_email", payerA);
  assert.equal(todas.error, null);
  assert.equal(todas.data.length, 1, "a pessoa lê o pagador da própria linha");
});

test("RLS: uma pessoa nunca vê a linha, nem o pagador, de outra", async () => {
  const { error: seed } = await insert(B.id, { payer_email: `segredo-${RUN}@exemplo.invalido` });
  assert.equal(seed, null, seed?.message);

  const proprias = await A.client.from("subscriptions").select("id, user_id, payer_email");
  assert.equal(proprias.error, null);
  assert.ok(proprias.data.every((row) => row.user_id === A.id), "só as da própria pessoa");

  const alheias = await A.client.from("subscriptions").select("id, payer_email").eq("user_id", B.id);
  assert.equal(alheias.error, null);
  assert.deepEqual(alheias.data, [], "pedir as de outra pessoa pelo filtro devolve nada");
});

test("RLS: sem login (anon) não se lê nenhuma assinatura", async () => {
  const anon = createClient(SUPABASE_URL, PUBLISHABLE, NO_SESSION);
  const { data, error } = await anon.from("subscriptions").select("id, payer_email").in("user_id", [A.id, B.id]);
  assert.ok(error || (data ?? []).length === 0, "negado por privilégio, ou lista vazia pela RLS — nunca linhas");
  assert.deepEqual(data ?? [], []);
});

// ── os privilégios: a segunda trava ─────────────────────────────

test("PRIVILÉGIO: authenticated não escreve — nem o pagador, nem o status, nem apaga, nem insere", async () => {
  const dono = await freshUser("escrita");
  const linha = await insert(dono.id, { status: "pending", payer_email: `alvo-${RUN}@exemplo.invalido` });
  assert.equal(linha.error, null, linha.error?.message);

  const troca = await dono.client.from("subscriptions").update({ payer_email: "atacante@exemplo.invalido" }).eq("id", linha.data.id).select();
  assert.equal(troca.error?.code, "42501", "atualizar o pagador: permission denied");
  const status = await dono.client.from("subscriptions").update({ status: "active" }).eq("id", linha.data.id).select();
  assert.equal(status.error?.code, "42501", "marcar como ativa: permission denied");
  const apaga = await dono.client.from("subscriptions").delete().eq("id", linha.data.id).select();
  assert.equal(apaga.error?.code, "42501", "apagar: permission denied");
  const cria = await dono.client.from("subscriptions").insert({ user_id: dono.id, status: "active", payer_email: "x@exemplo.invalido" });
  assert.equal(cria.error?.code, "42501", "inserir uma ativa: permission denied");

  const { data } = await admin.from("subscriptions").select("status, payer_email").eq("id", linha.data.id).single();
  assert.deepEqual(data, { status: "pending", payer_email: `alvo-${RUN}@exemplo.invalido` }, "a linha ficou exatamente como estava");
});

test("PRIVILÉGIO: o servidor (service_role) escreve normalmente", async () => {
  const { data: criada } = await insert(A.id, { payer_email: `antes-${RUN}@exemplo.invalido` });
  const { error } = await admin.from("subscriptions").update({ payer_email: `depois-${RUN}@exemplo.invalido` }).eq("id", criada.id);
  assert.equal(error, null, error?.message);
  const { data } = await admin.from("subscriptions").select("payer_email").eq("id", criada.id).single();
  assert.equal(data.payer_email, `depois-${RUN}@exemplo.invalido`);
});

// ── a consulta do limite de tentativas ──────────────────────────

test("COMPATIBILIDADE: a contagem do limite (head + count + gte) funciona no PostgREST real e inclui as recusadas", async () => {
  const contador = await freshUser("contagem");
  for (const status of ["rejected", "rejected", "cancelled"]) {
    const { error } = await insert(contador.id, { status });
    assert.equal(error, null, error?.message);
  }
  const desde = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count, error } = await contador.client
    .from("subscriptions")
    .select("id", { count: "exact", head: true })
    .or(`user_id.eq.${contador.id}`)
    .gte("created_at", desde);
  assert.equal(error, null, error?.message);
  assert.equal(count, 3, "as duas recusadas e a cancelada, todas na janela");

  const fora = await contador.client
    .from("subscriptions")
    .select("id", { count: "exact", head: true })
    .or(`user_id.eq.${contador.id}`)
    .gte("created_at", new Date(Date.now() + 60 * 60 * 1000).toISOString());
  assert.equal(fora.count, 0, "uma janela no futuro não conta nada");
});

// ── limpeza ─────────────────────────────────────────────────────

after(async () => {
  for (const id of createdUserIds) {
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) console.error("Falha ao apagar o usuário fictício", id, error.message);
  }
  const { data: sobras } = await admin.from("subscriptions").select("id").in("user_id", createdUserIds);
  const { data: contas } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const usuariosRestantes = (contas?.users ?? []).filter((u) => u.email?.startsWith(runTag));
  console.log(
    `Limpeza: ${createdUserIds.length} usuários fictícios apagados; assinaturas que sobraram: ${sobras?.length ?? "?"}; usuários que sobraram: ${usuariosRestantes.length}.`,
  );
  assert.equal(sobras?.length ?? 0, 0, "nenhuma assinatura de teste sobrou");
  assert.equal(usuariosRestantes.length, 0, "nenhum usuário de teste sobrou");
});

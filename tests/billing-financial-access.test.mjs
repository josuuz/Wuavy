/*
  Quem pode ver o painel financeiro (lib/maintenance/admin.ts, o gate REAL —
  o mesmo que as outras abas de Cobranças já usam).

  O que se prova aqui: dinheiro da agência não aparece para quem não está em
  WUAVY_ADMIN_EMAILS, e uma lista ausente fecha o painel em vez de abri-lo.
  O Supabase embaixo do gate é falso (tests/helpers/admin-loader.mjs), mas a
  decisão de quem é administrador é a de produção.

  Cada caso importa o módulo com uma query diferente ("?caso=...") de
  propósito: getAdmin é embrulhado em cache() do React, e um módulo novo por
  caso garante que a resposta de um não seja memoizada para o seguinte.
*/

import { register } from "node:module";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

register("./helpers/admin-loader.mjs", import.meta.url);

const load = (caso) => import(`../src/lib/maintenance/admin.ts?caso=${caso}`);

test("a lista vazia fecha o painel: ninguém é administrador", async () => {
  process.env.WUAVY_ADMIN_EMAILS = "";
  const { adminListReady, isAdminEmail } = await load("lista-vazia");
  assert.equal(adminListReady(), false);
  assert.equal(isAdminEmail("qualquer@pessoa.com"), false);
});

test("sem a variável definida também: um painel que se abre sozinho é pior que um fechado", async () => {
  delete process.env.WUAVY_ADMIN_EMAILS;
  const { adminListReady, isAdminEmail } = await load("sem-variavel");
  assert.equal(adminListReady(), false);
  assert.equal(isAdminEmail("dono@wuavy.com"), false);
});

test("só os e-mails da lista entram, em qualquer caixa e com espaço em volta", async () => {
  process.env.WUAVY_ADMIN_EMAILS = "dono@wuavy.com, socio@wuavy.com";
  const { isAdminEmail } = await load("lista-com-dois");
  assert.equal(isAdminEmail("dono@wuavy.com"), true);
  assert.equal(isAdminEmail("socio@wuavy.com"), true);
  assert.equal(isAdminEmail("  DONO@WUAVY.COM  "), true);
  assert.equal(isAdminEmail("cliente@clinica.com"), false);
  assert.equal(isAdminEmail(null), false);
  assert.equal(isAdminEmail(undefined), false);
  assert.equal(isAdminEmail(""), false);
});

test("um e-mail parecido não entra: a comparação é exata, não por domínio", async () => {
  process.env.WUAVY_ADMIN_EMAILS = "dono@wuavy.com";
  const { isAdminEmail } = await load("parecidos");
  assert.equal(isAdminEmail("dono@wuavy.com.br"), false);
  assert.equal(isAdminEmail("odono@wuavy.com"), false);
  assert.equal(isAdminEmail("outro@wuavy.com"), false);
});

test("getAdmin devolve o administrador quando a sessão é de um e-mail da lista", async () => {
  process.env.WUAVY_ADMIN_EMAILS = "dono@wuavy.com";
  process.env.TEST_SESSION_EMAIL = "dono@wuavy.com";
  const { getAdmin } = await load("sessao-admin");
  const admin = await getAdmin();
  assert.notEqual(admin, null);
  assert.equal(admin.email, "dono@wuavy.com");
});

test("getAdmin devolve null para quem está logado mas não é administrador", async () => {
  process.env.WUAVY_ADMIN_EMAILS = "dono@wuavy.com";
  process.env.TEST_SESSION_EMAIL = "cliente@clinica.com";
  const { getAdmin } = await load("sessao-cliente");
  assert.equal(await getAdmin(), null);
});

test("getAdmin devolve null sem sessão nenhuma", async () => {
  process.env.WUAVY_ADMIN_EMAILS = "dono@wuavy.com";
  delete process.env.TEST_SESSION_EMAIL;
  const { getAdmin } = await load("sem-sessao");
  assert.equal(await getAdmin(), null);
});

/*
  Os dois seguintes são guardas estruturais, não testes de comportamento: eles
  leem o código-fonte. Existem porque o risco que importa aqui não é a função
  do gate estar errada — é alguém, um dia, ler o financeiro antes de chamar o
  gate, ou mover essa leitura para o navegador. Nenhuma das duas coisas um
  teste de unidade da página pegaria sem o runtime do Next.
*/

test("a página financeira chama o gate antes de ler qualquer número", () => {
  const source = readFileSync(new URL("../src/app/(care)/cobrancas/financeiro/page.tsx", import.meta.url), "utf8");
  const gate = source.indexOf("await getAdmin()");
  const refusal = source.indexOf("if (!admin) return <SignIn");
  const read = source.indexOf("financialOverview(");

  assert.ok(gate > 0, "a página tem de chamar getAdmin()");
  assert.ok(refusal > gate, "a recusa vem depois do gate");
  assert.ok(read > refusal, "a leitura financeira só acontece depois da recusa");
});

test("a leitura financeira é server-only: não há como ir para o navegador", () => {
  const source = readFileSync(new URL("../src/lib/billing/financial-data.ts", import.meta.url), "utf8");
  assert.ok(source.includes('import "server-only"'), "financial-data.ts tem de ser server-only");
});

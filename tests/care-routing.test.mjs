/*
  O roteamento de src/proxy.ts para o grupo (care): manutenção de sites e
  Wuavy Cobranças devem passar direto (nunca ser localizados por
  app/(site)/[locale]), e as páginas que exigem um administrador devem ter a
  sessão do Supabase renovada antes de chegar lá. A causa do bug encontrado
  no Preview: CARE/CARE_SESSION só reconheciam /manutencao, então
  /cobrancas/* caía no catch-all de locale (app/(site)/[locale]/[...missing])
  e voltava 404 — mesmo a rota existindo e constando no build.
*/
import test from "node:test";
import assert from "node:assert/strict";

import { CARE, CARE_SESSION, clinavyPath, PULSE_APP, PULSE_SESSION } from "../src/lib/care-routing.ts";

test("/cobrancas e suas sub-rotas passam direto, nunca caem no catch-all de locale", () => {
  for (const path of ["/cobrancas", "/cobrancas/clientes", "/cobrancas/servicos", "/cobrancas/lancamentos"]) {
    assert.equal(CARE.test(path), true, path);
  }
});

test("/cobrancas é só painel administrativo: toda rota renova a sessão, sem exceção pública", () => {
  for (const path of ["/cobrancas", "/cobrancas/clientes", "/cobrancas/servicos", "/cobrancas/lancamentos", "/cobrancas/clientes/qualquer-coisa"]) {
    assert.equal(CARE_SESSION.test(path), true, path);
  }
});

test("/manutencao continua passando direto, como antes", () => {
  for (const path of ["/manutencao", "/manutencao/um-token-de-cliente", "/manutencao/admin", "/manutencao/admin/um-cliente"]) {
    assert.equal(CARE.test(path), true, path);
  }
});

test("só o painel de manutenção (/manutencao/admin) renova a sessão — a página do cliente, pelo token, não", () => {
  assert.equal(CARE_SESSION.test("/manutencao/admin"), true);
  assert.equal(CARE_SESSION.test("/manutencao/admin/um-cliente"), true);
  assert.equal(CARE_SESSION.test("/manutencao/um-token-de-cliente"), false);
  assert.equal(CARE_SESSION.test("/manutencao"), false);
});

test("nada parecido com /cobrancas ou /manutencao em outro lugar do site é capturado por engano", () => {
  for (const path of ["/", "/sobre", "/clinavy", "/clinavy/entrar", "/cobrancas-promocao", "/manutencaox", "/algo/cobrancas"]) {
    assert.equal(CARE.test(path), false, path);
  }
});

test("as rotas do Clinavy continuam exatamente como eram, sem interferência do grupo (care)", () => {
  assert.equal(PULSE_SESSION.test("/clinavy/entrar"), true);
  assert.equal(PULSE_SESSION.test("/clinavy/app"), true);
  assert.equal(PULSE_SESSION.test("/clinavy/app/vendas"), true);
  assert.equal(PULSE_APP.test("/clinavy/qualquer-coisa"), true);
  assert.equal(CARE.test("/clinavy/entrar"), false);
  assert.equal(CARE_SESSION.test("/clinavy/entrar"), false);
});

test("os endereços antigos do produto (/pulse, /flow) viram o /clinavy equivalente", () => {
  assert.equal(clinavyPath("/pulse"), "/clinavy");
  assert.equal(clinavyPath("/pulse/entrar"), "/clinavy/entrar");
  assert.equal(clinavyPath("/pulse/app/pacientes"), "/clinavy/app/pacientes");
  assert.equal(clinavyPath("/pulse/assinar"), "/clinavy/assinar");
  assert.equal(clinavyPath("/pulse/auth/callback"), "/clinavy/auth/callback");
  assert.equal(clinavyPath("/pulse/convite"), "/clinavy/convite");
  assert.equal(clinavyPath("/flow"), "/clinavy");
  assert.equal(clinavyPath("/flow/redefinir-senha"), "/clinavy/redefinir-senha");
  assert.equal(clinavyPath("/flow/auth/callback"), "/clinavy/auth/callback");
});

test("a tela de CRM antiga cai em Vendas, na demo e no app", () => {
  assert.equal(clinavyPath("/pulse/demo/crm"), "/clinavy/demo/vendas");
  assert.equal(clinavyPath("/pulse/app/crm"), "/clinavy/app/vendas");
  assert.equal(clinavyPath("/flow/demo/crm"), "/clinavy/demo/vendas");
});

test("a versão pt-PT da página do produto mantém o idioma", () => {
  assert.equal(clinavyPath("/pt-pt/pulse"), "/pt-pt/clinavy");
  assert.equal(clinavyPath("/pt-PT/pulse"), "/pt-PT/clinavy");
  assert.equal(clinavyPath("/pt-br/pulse"), "/pt-br/clinavy");
});

test("o que não é o produto antigo não é tocado: /clinavy, APIs, webhooks, outras rotas parecidas", () => {
  for (const path of [
    "/",
    "/clinavy",
    "/clinavy/entrar",
    "/pulsex",
    "/pulse-icon-192.png",
    "/pt-pt",
    "/pt-pt/clinavy",
    "/trabalho/pulse",
    "/api/mercadopago/webhook",
    "/api/pulse/algo",
    "/manutencao/admin",
  ]) {
    assert.equal(clinavyPath(path), null, path);
  }
});

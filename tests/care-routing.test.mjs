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

import { CARE, CARE_SESSION, PULSE_APP, PULSE_SESSION } from "../src/lib/care-routing.ts";

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
  for (const path of ["/", "/sobre", "/pulse", "/pulse/entrar", "/cobrancas-promocao", "/manutencaox", "/algo/cobrancas"]) {
    assert.equal(CARE.test(path), false, path);
  }
});

test("as rotas do Pulse continuam exatamente como eram, sem interferência do grupo (care)", () => {
  assert.equal(PULSE_SESSION.test("/pulse/entrar"), true);
  assert.equal(PULSE_SESSION.test("/pulse/app"), true);
  assert.equal(PULSE_SESSION.test("/pulse/app/vendas"), true);
  assert.equal(PULSE_APP.test("/pulse/qualquer-coisa"), true);
  assert.equal(CARE.test("/pulse/entrar"), false);
  assert.equal(CARE_SESSION.test("/pulse/entrar"), false);
});

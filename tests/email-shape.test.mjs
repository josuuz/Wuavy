/*
  A forma de e-mail que o checkout aceita gravar e que a busca de suporte consegue achar
  (lib/flow/email-shape.ts). Uma regra só: se divergissem, um pagador aceito de um lado
  ficaria invisível do outro, e o erro seria silencioso.
*/
import test from "node:test";
import assert from "node:assert/strict";

import { isEmailShape, MAX_EMAIL_LENGTH } from "../src/lib/flow/email-shape.ts";

test("aceita endereços comuns, com +, _, ponto e subdomínios", () => {
  for (const ok of ["pessoa@exemplo.com", "joao_silva@exemplo.com.br", "a+etiqueta@sub.exemplo.org", "x.y.z@exemplo.co"]) {
    assert.equal(isEmailShape(ok), true, ok);
  }
});

test("recusa o que não tem forma de e-mail", () => {
  for (const ruim of ["", "sem-arroba", "a@b", "a@b.", "@exemplo.com", "a@@exemplo.com", "a b@exemplo.com", "a@exemplo .com", "a@.com"]) {
    assert.equal(isEmailShape(ruim), false, JSON.stringify(ruim));
  }
});

test("recusa os curingas do LIKE: a busca de suporte usa o e-mail num LIKE", () => {
  for (const curinga of ["%@exemplo.com", "a%b@exemplo.com", "a*b@exemplo.com", "*@exemplo.com"]) {
    assert.equal(isEmailShape(curinga), false, curinga);
  }
});

test("recusa qualquer espaço em branco, inclusive tabulação e quebra de linha", () => {
  for (const ruim of ["\tpessoa@exemplo.com", "pessoa@exemplo.com\n", "pe ssoa@exemplo.com", " pessoa@exemplo.com"]) {
    assert.equal(isEmailShape(ruim), false, JSON.stringify(ruim));
  }
});

test("o tamanho máximo é o de um endereço: 254 passa, 255 não", () => {
  const com = (n) => "a".repeat(n - "@x.co".length) + "@x.co";
  assert.equal(MAX_EMAIL_LENGTH, 254);
  assert.equal(isEmailShape(com(254)), true);
  assert.equal(isEmailShape(com(255)), false);
});

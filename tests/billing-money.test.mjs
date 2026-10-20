/*
  O dinheiro do catálogo da agência (lib/billing/money.ts). Separado de
  lib/maintenance/plan.ts porque os limites são outros: um site custa mais
  que R$ 10.000,00, o teto da manutenção.
*/

import test from "node:test";
import assert from "node:assert/strict";

import { brl, MAX_PRICE, MIN_PRICE, parsePrice, reais } from "../src/lib/billing/money.ts";

test("parsePrice lê '150000,00' e '1.500,00' em centavos", () => {
  assert.equal(parsePrice("1500,00"), 150_000);
  assert.equal(parsePrice("1.500,00"), 150_000);
  assert.equal(parsePrice("40"), 4_000);
});

test("parsePrice recusa o que não é um número cobrável", () => {
  assert.equal(parsePrice(""), null);
  assert.equal(parsePrice("abc"), null);
  assert.equal(parsePrice("0"), null);
});

test("parsePrice aceita o teto de R$ 100.000,00, e nada acima dele", () => {
  assert.equal(parsePrice("100000,00"), MAX_PRICE);
  assert.equal(parsePrice("100000,01"), null);
});

test("parsePrice recusa abaixo do piso de R$ 5,00", () => {
  assert.equal(parsePrice("4,99"), null);
  assert.equal(MIN_PRICE, 500);
});

test("brl e reais formatam o mesmo valor para ler e para digitar", () => {
  assert.equal(brl(150_000), "R$ 1.500,00");
  assert.equal(reais(150_000), "1500,00");
});

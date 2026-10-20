/*
  Achado real ao validar a manutenção contra a API (Tarefa 6): o fallback de
  httpsUrl por si só mandou o aviso de uma assinatura de teste para o webhook
  de PRODUÇÃO (o domínio canônico é sempre um domínio real). testSafeUrl
  fecha isso em modo de teste, antes de qualquer chamada ao Mercado Pago.
*/

import test from "node:test";
import assert from "node:assert/strict";

import { testSafeUrl } from "../src/lib/mercadopago/notice.ts";

const CANONICAL = "https://wuavy.com";

test("fora do modo de teste, comporta-se como httpsUrl: não-https cai no canônico", () => {
  assert.equal(testSafeUrl("/x", "http://localhost:3230", CANONICAL, false), "https://wuavy.com/x");
});

test("fora do modo de teste, um https válido é usado como está (produção, preview)", () => {
  assert.equal(testSafeUrl("/x", "https://wuavy-preview.vercel.app", CANONICAL, false), "https://wuavy-preview.vercel.app/x");
});

test("em teste, http://localhost falha antes de qualquer chamada", () => {
  assert.throws(() => testSafeUrl("/x", "http://localhost:3230", CANONICAL, true), /https alcançável/);
});

test("em teste, https://localhost também falha (não é alcançável, com ou sem https)", () => {
  assert.throws(() => testSafeUrl("/x", "https://localhost:3230", CANONICAL, true), /https alcançável/);
});

test("em teste, o próprio domínio canônico é recusado", () => {
  assert.throws(() => testSafeUrl("/x", CANONICAL, CANONICAL, true), /domínio de produção/);
});

test("em teste, um subdomínio do canônico também é recusado", () => {
  assert.throws(() => testSafeUrl("/x", "https://app.wuavy.com", CANONICAL, true), /domínio de produção/);
});

test("em teste, um domínio https de teste de verdade é aceito", () => {
  assert.equal(testSafeUrl("/x", "https://abc123.ngrok-free.app", CANONICAL, true), "https://abc123.ngrok-free.app/x");
});

test("em teste, um site.url inválido falha com mensagem clara", () => {
  assert.throws(() => testSafeUrl("/x", "não é uma url", CANONICAL, true), /endereço de site inválido/);
});

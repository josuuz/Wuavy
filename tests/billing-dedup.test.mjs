/*
  A prevenção de duplicidade de clientes (lib/billing/dedup.ts): avisa de um
  possível cliente repetido sem nunca impedir dois clientes legítimos com
  nome parecido de existirem. Só e-mail e WhatsApp contam — nome é comum
  demais para decidir sozinho.
*/

import test from "node:test";
import assert from "node:assert/strict";

import { findDuplicate } from "../src/lib/billing/dedup.ts";

const client = (over = {}) => ({
  id: "c1",
  name: "Clínica Vida Natural",
  email: "contato@vidanatural.com.br",
  whatsapp: "+55 19 99999-0001",
  archived_at: null,
  ...over,
});

test("mesmo e-mail, maiúsculas e espaços diferentes, é duplicata", () => {
  const found = findDuplicate([client()], { name: "Outro nome", email: " Contato@VidaNatural.com.br ", whatsapp: null });
  assert.equal(found?.id, "c1");
});

test("mesmo WhatsApp, pontuação diferente, é duplicata", () => {
  const found = findDuplicate([client()], { name: "Outro nome", email: null, whatsapp: "19999990001" });
  assert.equal(found?.id, "c1");
});

test("nome parecido sozinho não é duplicata: clientes legítimos não são bloqueados", () => {
  const found = findDuplicate([client()], { name: "Clínica Vida Natural Ltda", email: "outro@exemplo.com", whatsapp: "+55 11 90000-0002" });
  assert.equal(found, null);
});

test("cliente arquivado não conta como duplicata", () => {
  const found = findDuplicate([client({ archived_at: "2026-01-01T00:00:00Z" })], {
    name: "Qualquer",
    email: "contato@vidanatural.com.br",
    whatsapp: null,
  });
  assert.equal(found, null);
});

test("sem e-mail nem whatsapp no novo cliente, nunca há duplicata", () => {
  const found = findDuplicate([client()], { name: "Clínica Vida Natural", email: null, whatsapp: null });
  assert.equal(found, null);
});

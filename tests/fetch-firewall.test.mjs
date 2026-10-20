/*
  Teste do próprio firewall (tests/helpers/fetch-firewall.mjs), sem rede
  nenhuma: prova que um host de produção nomeado explicitamente, e qualquer
  host desconhecido, são bloqueados ANTES de qualquer chamada de rede —
  nunca repassados ao fetch real.
*/

import test from "node:test";
import assert from "node:assert/strict";

import { installFetchFirewall } from "./helpers/fetch-firewall.mjs";

test("host de produção nomeado explicitamente: bloqueado, nunca chega à rede", async () => {
  const original = globalThis.fetch;
  let realFetchCalled = false;
  globalThis.fetch = async () => {
    realFetchCalled = true;
    throw new Error("não deveria ter sido chamado");
  };
  const fw = installFetchFirewall({ testSupabaseHost: "teste.supabase.co", forbiddenHosts: ["producao.supabase.co"] });
  try {
    await assert.rejects(() => fetch("https://producao.supabase.co/rest/v1/qualquer"), /PROIBIDO/);
    assert.equal(realFetchCalled, false, "o fetch original nunca foi chamado para o host proibido");
  } finally {
    fw.restore();
    globalThis.fetch = original;
  }
});

test("host desconhecido (nem teste, nem Mercado Pago, nem listado como proibido): bloqueado do mesmo jeito", async () => {
  const original = globalThis.fetch;
  let realFetchCalled = false;
  globalThis.fetch = async () => {
    realFetchCalled = true;
    throw new Error("não deveria ter sido chamado");
  };
  const fw = installFetchFirewall({ testSupabaseHost: "teste.supabase.co" });
  try {
    await assert.rejects(() => fetch("https://algum-host-aleatorio.example.com/x"), /não autorizado/);
    assert.equal(realFetchCalled, false);
  } finally {
    fw.restore();
    globalThis.fetch = original;
  }
});

test("host do Supabase de teste: passa para o fetch real (aqui, um stub de teste)", async () => {
  const original = globalThis.fetch;
  let realFetchCalledWith = null;
  globalThis.fetch = async (url) => {
    realFetchCalledWith = String(url);
    return { ok: true, status: 200, json: async () => ({}) };
  };
  const fw = installFetchFirewall({ testSupabaseHost: "teste.supabase.co" });
  try {
    await fetch("https://teste.supabase.co/rest/v1/billing_charges");
    assert.equal(realFetchCalledWith, "https://teste.supabase.co/rest/v1/billing_charges");
  } finally {
    fw.restore();
    globalThis.fetch = original;
  }
});

test("Mercado Pago sem handler registrado: falha alto, nunca cai para fora silenciosamente", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("não deveria ter sido chamado");
  };
  const fw = installFetchFirewall({ testSupabaseHost: "teste.supabase.co" });
  try {
    await assert.rejects(() => fetch("https://api.mercadopago.com/v1/payments"), /nenhum mock/i);
  } finally {
    fw.restore();
    globalThis.fetch = original;
  }
});

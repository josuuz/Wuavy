/*
  Testes de integração da Etapa C (concorrência e reconciliação), contra o
  código REAL de lib/billing/charges.ts e cobrancas/lancamentos/actions.ts —
  não uma reimplementação da lógica, as próprias funções.

  Ambiente: só em processo, nesta máquina. Nenhum Supabase real (o Supabase é
  um FakeAdmin em memória — tests/helpers/fake-admin.mjs) e nenhum Mercado
  Pago real (global.fetch é substituído por um mock local antes de qualquer
  teste que precise de uma resposta do Mercado Pago, e as credenciais nas
  variáveis de ambiente abaixo são fictícias, usadas só para passar a
  checagem de ambiente de lib/mercadopago/environment.ts — nunca chegam a
  sair como requisição de verdade, porque fetch está substituído).

  O loader (tests/helpers/charges-loader.mjs, via module.register) troca
  "@/lib/supabase/admin" pelo FakeAdmin, "next/cache"/"next/navigation" por
  versões mínimas, e "@/lib/maintenance/admin" por um getAdmin() que sempre
  autoriza — o que se prova aqui é a lógica de cobrança, não o login do
  painel nem o runtime do Next.
*/

import { register } from "node:module";
import test from "node:test";
import assert from "node:assert/strict";

register("./helpers/charges-loader.mjs", import.meta.url);

// Credenciais FICTÍCIAS, só para passar a checagem de ambiente — antes de
// importar qualquer módulo que as leia no topo do arquivo (@/data/site
// captura NEXT_PUBLIC_SITE_URL na primeira importação). fetch é substituído
// em todo teste que chega a chamar o Mercado Pago, então nenhuma delas nunca
// sai como requisição real.
process.env.MERCADOPAGO_ACCESS_TOKEN = "APP_USR-teste-ficticio-0000000000";
process.env.MERCADOPAGO_ENV = "test";
process.env.MERCADOPAGO_TEST_PAYER_EMAIL = "comprador-teste@example.com";
process.env.NEXT_PUBLIC_SITE_URL = "https://teste.example.com";

const { FakeAdmin, setFakeAdminClient } = await import("./helpers/fake-admin.mjs");
const charges = await import("../src/lib/billing/charges.ts");
const actions = await import("../src/app/(care)/cobrancas/lancamentos/actions.ts");

const CHARGE_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const CHARGE_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const CHARGE_C = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const CHARGE_D = "dddddddd-dddd-dddd-dddd-dddddddddddd";

const isoMsAgo = (ms) => new Date(Date.now() - ms).toISOString();

function freshCharge(id, overrides = {}) {
  return {
    id,
    client_id: "cliente-1",
    amount_cents: 15000,
    description: "Serviço de teste",
    status: "pending",
    provider_preference_id: null,
    payment_url: null,
    creation_blocked_at: null,
    creation_claimed_at: null,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

function withFetchMock(handler, run) {
  const original = globalThis.fetch;
  globalThis.fetch = handler;
  return run().finally(() => {
    globalThis.fetch = original;
  });
}

const jsonResponse = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

// ── 1. Duas requisições simultâneas tentando criar a mesma cobrança ────────

test("1) duas requisições simultâneas: só uma reivindica, a outra vê 'in_progress', nunca as duas 'claimed'", async () => {
  const admin = new FakeAdmin({ billing_charges: [freshCharge(CHARGE_A)] });
  setFakeAdminClient(admin);

  const [first, second] = await Promise.all([charges.claimCreation(CHARGE_A), charges.claimCreation(CHARGE_A)]);
  const results = [first, second].sort();
  assert.deepEqual(results, ["claimed", "in_progress"]);

  const row = admin.row("billing_charges", CHARGE_A);
  assert.ok(row.creation_claimed_at, "a reserva foi gravada");
});

// ── 2. Reserva vencida com bloqueio persistido atomicamente no banco ───────

test("2) reserva vencida: claimCreation nunca reivindica de novo, e grava creation_blocked_at no banco na hora", async () => {
  const admin = new FakeAdmin({
    billing_charges: [freshCharge(CHARGE_B, { creation_claimed_at: isoMsAgo(60_000) })],
  });
  setFakeAdminClient(admin);

  const result = await charges.claimCreation(CHARGE_B);
  assert.equal(result, "blocked");

  const row = admin.row("billing_charges", CHARGE_B);
  assert.ok(row.creation_blocked_at, "o bloqueio foi persistido no banco, não só devolvido");
  assert.equal(row.provider_preference_id, null, "nenhuma Preference foi criada");

  // Chamar de novo não muda nada: continua bloqueada, nunca volta a "claimed".
  assert.equal(await charges.claimCreation(CHARGE_B), "blocked");
});

// ── 3. Falha na persistência após uma Preference ter sido criada ──────────

test("3) Preference criada no Mercado Pago, mas a gravação local falha: bloqueia, e uma tentativa posterior não cria outra Preference", async () => {
  const admin = new FakeAdmin({ billing_charges: [freshCharge(CHARGE_C)] });
  setFakeAdminClient(admin);

  assert.equal(await charges.claimCreation(CHARGE_C), "claimed");

  let mpCalls = 0;
  const created = await withFetchMock(
    async (url) => {
      mpCalls += 1;
      assert.match(String(url), /\/checkout\/preferences$/);
      return jsonResponse(201, { id: "pref-real-1", init_point: "https://mp.example/pref-real-1" });
    },
    () => charges.createPreference({ chargeId: CHARGE_C, description: "Serviço", amountCents: 15000, payerEmail: null }),
  );
  assert.equal(mpCalls, 1, "o Mercado Pago foi chamado exatamente uma vez");
  assert.equal(created.id, "pref-real-1");

  // Supabase "cai" bem na hora de gravar o que o Mercado Pago aceitou.
  admin.setWritesFailing(true);
  const persisted = await charges.persistPreference(CHARGE_C, created.id, created.url);
  assert.equal(persisted, "failed");
  assert.equal(admin.row("billing_charges", CHARGE_C).provider_preference_id, null, "nada foi gravado");

  const blocked = await charges.blockCreation(CHARGE_C);
  assert.equal(blocked, "failed", "o próprio bloqueio também não confirmou — Supabase continua indisponível");
  assert.equal(admin.row("billing_charges", CHARGE_C).creation_blocked_at, null);

  // Supabase volta. Uma tentativa imediata ainda vê a reserva como em
  // andamento (não é da conta dela saber que a Preference já existe de
  // verdade no Mercado Pago) — o ponto é que ELA NUNCA CHAMA O MERCADO PAGO
  // DE NOVO enquanto isso.
  admin.setWritesFailing(false);
  assert.equal(await charges.claimCreation(CHARGE_C), "in_progress");

  // Passado o tempo (reserva agora vencida), a própria claimCreation trava —
  // mesmo que a gravação explícita do bloqueio nunca tenha confirmado antes.
  admin.row("billing_charges", CHARGE_C).creation_claimed_at = isoMsAgo(60_000);
  assert.equal(await charges.claimCreation(CHARGE_C), "blocked");
  assert.ok(admin.row("billing_charges", CHARGE_C).creation_blocked_at, "travou sozinha desta vez");
  assert.equal(mpCalls, 1, "o Mercado Pago nunca foi chamado uma segunda vez em toda a sequência");
});

// ── 4. Reconciliação manual com valor, moeda e referência corretos ─────────

test("4) reconciliação com referência, valor e moeda corretos: aceita e libera a cobrança", async () => {
  const admin = new FakeAdmin({
    billing_charges: [freshCharge(CHARGE_D, { amount_cents: 15000, creation_blocked_at: isoMsAgo(120_000) })],
  });
  setFakeAdminClient(admin);

  const result = await withFetchMock(
    async (url) => {
      assert.match(String(url), /\/checkout\/preferences\/pref-certo$/);
      return jsonResponse(200, {
        id: "pref-certo",
        init_point: "https://mp.example/pref-certo",
        external_reference: CHARGE_D,
        items: [{ unit_price: 150, quantity: 1, currency_id: "BRL" }],
      });
    },
    () => charges.reconcilePreference(CHARGE_D, "pref-certo"),
  );

  assert.equal(result.ok, true);
  const row = admin.row("billing_charges", CHARGE_D);
  assert.equal(row.provider_preference_id, "pref-certo");
  assert.equal(row.payment_url, "https://mp.example/pref-certo");
  assert.equal(row.creation_blocked_at, null);
  assert.equal(row.creation_claimed_at, null);
});

// ── 5. Tentativas de reconciliação com dados divergentes ───────────────────

test("5) reconciliação com dados divergentes: recusa e não grava nada, em cada caso", async () => {
  const casos = [
    {
      nome: "referência de outra cobrança",
      preference: { id: "pref-x", init_point: "https://mp.example/pref-x", external_reference: "outra-cobranca", items: [{ unit_price: 150, quantity: 1, currency_id: "BRL" }] },
    },
    {
      nome: "valor diferente",
      preference: { id: "pref-y", init_point: "https://mp.example/pref-y", external_reference: CHARGE_D, items: [{ unit_price: 1, quantity: 1, currency_id: "BRL" }] },
    },
    {
      nome: "moeda diferente",
      preference: { id: "pref-z", init_point: "https://mp.example/pref-z", external_reference: CHARGE_D, items: [{ unit_price: 150, quantity: 1, currency_id: "USD" }] },
    },
  ];

  for (const caso of casos) {
    const admin = new FakeAdmin({
      billing_charges: [freshCharge(CHARGE_D, { amount_cents: 15000, creation_blocked_at: isoMsAgo(120_000) })],
    });
    setFakeAdminClient(admin);

    const result = await withFetchMock(
      async () => jsonResponse(200, caso.preference),
      () => charges.reconcilePreference(CHARGE_D, caso.preference.id),
    );

    assert.equal(result.ok, false, caso.nome);
    const row = admin.row("billing_charges", CHARGE_D);
    assert.equal(row.provider_preference_id, null, caso.nome + ": nada foi gravado");
    assert.ok(row.creation_blocked_at, caso.nome + ": continua bloqueada, exigindo nova reconciliação");
  }
});

// ── 6. Recuperação manual com LIBERAR, sem permitir cobrança duplicada ─────

function formWith(fields) {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  return form;
}

// Mock de busca "nada encontrado": zero Preferences, zero pagamentos — o
// único caso em que a confirmação digitada chega a importar.
const emptySearchFetch = async (url) => {
  const s = String(url);
  if (s.includes("/checkout/preferences/search")) return jsonResponse(200, { elements: [], total: 0, next_offset: 0 });
  if (s.includes("/v1/payments/search")) return jsonResponse(200, { results: [] });
  throw new Error("URL inesperada no mock: " + s);
};

test("6a) release() numa cobrança sem nenhuma evidência encontrada: continua bloqueada — nenhum FormData libera", async () => {
  const admin = new FakeAdmin({
    billing_charges: [freshCharge(CHARGE_D, { creation_blocked_at: isoMsAgo(60_000) })],
  });
  setFakeAdminClient(admin);

  const state = await withFetchMock(emptySearchFetch, () => actions.release(null, formWith({ id: CHARGE_D })));
  assert.equal(state.ok, false, "a interface nunca recebe ok:true quando a cobrança continua travada");
  assert.equal(typeof state.message, "string");
  const row = admin.row("billing_charges", CHARGE_D);
  assert.ok(row.creation_blocked_at, "continua bloqueada: nenhuma evidência encontrada");
});

test("6b) release() com qualquer coisa digitada em 'confirm': irrelevante — o campo nem existe mais no formulário real, e mesmo que viesse não teria efeito", async () => {
  const admin = new FakeAdmin({
    billing_charges: [freshCharge(CHARGE_D, { creation_blocked_at: isoMsAgo(60_000) })],
  });
  setFakeAdminClient(admin);

  await withFetchMock(emptySearchFetch, () => actions.release(null, formWith({ id: CHARGE_D, confirm: CHARGE_D.slice(-8) })));
  const row = admin.row("billing_charges", CHARGE_D);
  assert.ok(row.creation_blocked_at, "continua bloqueada: release() não lê mais nenhum campo de confirmação");
});

test("6c) 10 minutos de bloqueio não mudam nada: busca vazia continua travando, com ou sem tempo decorrido", async () => {
  const admin = new FakeAdmin({
    billing_charges: [freshCharge(CHARGE_D, { creation_blocked_at: isoMsAgo(24 * 60 * 60_000) })], // um dia inteiro bloqueada
  });
  setFakeAdminClient(admin);

  await withFetchMock(emptySearchFetch, () => actions.release(null, formWith({ id: CHARGE_D, confirm: "LIBERAR" })));
  const row = admin.row("billing_charges", CHARGE_D);
  assert.ok(row.creation_blocked_at, "nenhuma quantidade de tempo bloqueado, sozinha, libera para nova criação");
});

test("6d) release() numa cobrança que JÁ tem Preference: nunca libera, nem chega a consultar o Mercado Pago", async () => {
  const admin = new FakeAdmin({
    billing_charges: [
      freshCharge(CHARGE_D, {
        provider_preference_id: "pref-ja-existe",
        payment_url: "https://mp.example/pref-ja-existe",
        creation_blocked_at: isoMsAgo(60_000),
      }),
    ],
  });
  setFakeAdminClient(admin);

  let mpCalled = false;
  await withFetchMock(
    async () => {
      mpCalled = true;
      throw new Error("não deveria ter chamado o Mercado Pago");
    },
    () => actions.release(null, formWith({ id: CHARGE_D, confirm: CHARGE_D.slice(-8) })),
  );
  assert.equal(mpCalled, false, "investigateBlockedCharge recusa antes de qualquer chamada, só de ver provider_preference_id");

  const row = admin.row("billing_charges", CHARGE_D);
  assert.equal(row.provider_preference_id, "pref-ja-existe", "a Preference real nunca é apagada");
  assert.ok(row.creation_blocked_at, "continua bloqueada");
  assert.equal(await charges.claimCreation(CHARGE_D), "already");
});

test("6e) release() recupera de verdade: só agora o estado devolvido é ok:true, com uma mensagem objetiva", async () => {
  const admin = new FakeAdmin({
    billing_charges: [freshCharge(CHARGE_D, { amount_cents: 15000, creation_blocked_at: isoMsAgo(60_000) })],
  });
  setFakeAdminClient(admin);

  const state = await withFetchMock(
    async (url) => {
      const s = String(url);
      if (s.includes("/checkout/preferences/search")) return jsonResponse(200, { elements: [{ id: "pref-ok" }], total: 1, next_offset: 1 });
      if (s.includes("/checkout/preferences/pref-ok")) {
        return jsonResponse(200, {
          id: "pref-ok",
          init_point: "https://mp.example/pref-ok",
          external_reference: CHARGE_D,
          items: [{ unit_price: 150, quantity: 1, currency_id: "BRL" }],
        });
      }
      throw new Error("URL inesperada: " + s);
    },
    () => actions.release(null, formWith({ id: CHARGE_D })),
  );

  assert.equal(state.ok, true);
  assert.equal(typeof state.message, "string");
  // A mensagem é objetiva: não cita token, header, status HTTP nem corpo bruto.
  assert.doesNotMatch(state.message, /token|bearer|status \d|{.*}/i);
});

test("6f) reconcile() com dados divergentes: ok:false, e a mensagem é a mesma de checkReconciliation — nunca 'sucesso'", async () => {
  const admin = new FakeAdmin({
    billing_charges: [freshCharge(CHARGE_D, { amount_cents: 15000, creation_blocked_at: isoMsAgo(60_000) })],
  });
  setFakeAdminClient(admin);

  const state = await withFetchMock(
    async () =>
      jsonResponse(200, {
        id: "pref-errado",
        init_point: "https://mp.example/pref-errado",
        external_reference: CHARGE_D,
        items: [{ unit_price: 1, quantity: 1, currency_id: "BRL" }], // valor não bate
      }),
    () => actions.reconcile(null, formWith({ charge_id: CHARGE_D, preference_id: "pref-errado" })),
  );

  assert.equal(state.ok, false);
  assert.match(state.message, /valor/i);
  assert.equal(admin.row("billing_charges", CHARGE_D).provider_preference_id, null);
});

// ── 7. Investigação automática: busca de Preferences, múltiplos resultados,
//       consulta indisponível, recuperação sem nova criação ────────────────

test("7a) busca encontra exatamente uma Preference válida: recupera sozinha, sem confirmação nenhuma", async () => {
  const admin = new FakeAdmin({
    billing_charges: [freshCharge(CHARGE_D, { amount_cents: 15000, creation_blocked_at: isoMsAgo(60_000) })],
  });
  setFakeAdminClient(admin);

  const result = await withFetchMock(async (url) => {
    const s = String(url);
    if (s.includes("/checkout/preferences/search")) return jsonResponse(200, { elements: [{ id: "pref-recuperado" }], total: 1, next_offset: 1 });
    if (s.includes("/checkout/preferences/pref-recuperado")) {
      return jsonResponse(200, {
        id: "pref-recuperado",
        init_point: "https://mp.example/pref-recuperado",
        external_reference: CHARGE_D,
        items: [{ unit_price: 150, quantity: 1, currency_id: "BRL" }],
      });
    }
    throw new Error("URL inesperada: " + s);
  }, () => charges.investigateBlockedCharge(CHARGE_D));

  assert.equal(result.verdict, "recovered");
  const row = admin.row("billing_charges", CHARGE_D);
  assert.equal(row.provider_preference_id, "pref-recuperado");
  assert.equal(row.creation_blocked_at, null);

  // Prova central do pedido: nenhuma segunda Preference é criada depois disso.
  assert.equal(await charges.claimCreation(CHARGE_D), "already");
});

test("7b) busca encontra múltiplas Preferences para a mesma referência: mantém bloqueada, nunca escolhe sozinha", async () => {
  const admin = new FakeAdmin({
    billing_charges: [freshCharge(CHARGE_D, { creation_blocked_at: isoMsAgo(60_000) })],
  });
  setFakeAdminClient(admin);

  const result = await withFetchMock(
    async () => jsonResponse(200, { elements: [{ id: "pref-x" }, { id: "pref-y" }], total: 2, next_offset: 2 }),
    () => charges.investigateBlockedCharge(CHARGE_D),
  );

  assert.equal(result.verdict, "stay_blocked");
  const row = admin.row("billing_charges", CHARGE_D);
  assert.equal(row.provider_preference_id, null);
  assert.ok(row.creation_blocked_at, "continua bloqueada");
});

test("7c) busca de Preferences indisponível (erro/timeout): mantém bloqueada", async () => {
  const admin = new FakeAdmin({
    billing_charges: [freshCharge(CHARGE_D, { creation_blocked_at: isoMsAgo(60_000) })],
  });
  setFakeAdminClient(admin);

  const result = await withFetchMock(
    async () => {
      throw new TypeError("fetch failed");
    },
    () => charges.investigateBlockedCharge(CHARGE_D),
  );

  assert.equal(result.verdict, "stay_blocked");
  assert.match(result.reason, /não foi possível consultar/i);
});

test("7d) nada na busca de Preferences, mas existe um pagamento para a referência: mantém bloqueada", async () => {
  const admin = new FakeAdmin({
    billing_charges: [freshCharge(CHARGE_D, { creation_blocked_at: isoMsAgo(60_000) })],
  });
  setFakeAdminClient(admin);

  const result = await withFetchMock(async (url) => {
    const s = String(url);
    if (s.includes("/checkout/preferences/search")) return jsonResponse(200, { elements: [], total: 0, next_offset: 0 });
    if (s.includes("/v1/payments/search")) return jsonResponse(200, { results: [{ id: 999 }] });
    throw new Error("URL inesperada: " + s);
  }, () => charges.investigateBlockedCharge(CHARGE_D));

  assert.equal(result.verdict, "stay_blocked");
  const row = admin.row("billing_charges", CHARGE_D);
  assert.equal(row.provider_preference_id, null);
  assert.ok(row.creation_blocked_at);
});

test("7e) cobrança mais antiga que a janela de busca (90 dias), nada encontrado: inconclusivo, mantém bloqueada", async () => {
  const admin = new FakeAdmin({
    billing_charges: [
      freshCharge(CHARGE_D, { creation_blocked_at: isoMsAgo(60_000), created_at: isoMsAgo(100 * 86_400_000) }),
    ],
  });
  setFakeAdminClient(admin);

  const result = await withFetchMock(emptySearchFetch, () => charges.investigateBlockedCharge(CHARGE_D));
  assert.equal(result.verdict, "stay_blocked");
  assert.match(result.reason, /90 dias/);
});

test("7f) criação com resposta perdida: Preference criada, processo nunca chega a persistir nem bloquear — a investigação, mais tarde, recupera sem criar outra", async () => {
  const admin = new FakeAdmin({ billing_charges: [freshCharge(CHARGE_D)] });
  setFakeAdminClient(admin);

  assert.equal(await charges.claimCreation(CHARGE_D), "claimed");
  // O Mercado Pago aceita a Preference, mas o processo "cai" aqui — nunca
  // chama persistPreference nem blockCreation. A reserva fica órfã.
  let mpCalls = 0;
  await withFetchMock(
    async () => {
      mpCalls += 1;
      return jsonResponse(201, { id: "pref-perdido", init_point: "https://mp.example/pref-perdido" });
    },
    () => charges.createPreference({ chargeId: CHARGE_D, description: "Serviço", amountCents: 15000, payerEmail: null }),
  );
  assert.equal(mpCalls, 1);

  // Tempo passa. A reserva vence e trava sozinha (correção anterior).
  admin.row("billing_charges", CHARGE_D).creation_claimed_at = isoMsAgo(60_000);
  assert.equal(await charges.claimCreation(CHARGE_D), "blocked");

  // Alguém investiga a cobrança travada: a busca encontra a Preference que o
  // Mercado Pago aceitou de verdade, e ela é recuperada — sem chamar
  // createPreference de novo.
  const result = await withFetchMock(async (url) => {
    const s = String(url);
    if (s.includes("/checkout/preferences/search")) return jsonResponse(200, { elements: [{ id: "pref-perdido" }], total: 1, next_offset: 1 });
    if (s.includes("/checkout/preferences/pref-perdido")) {
      return jsonResponse(200, {
        id: "pref-perdido",
        init_point: "https://mp.example/pref-perdido",
        external_reference: CHARGE_D,
        items: [{ unit_price: 150, quantity: 1, currency_id: "BRL" }],
      });
    }
    throw new Error("URL inesperada: " + s);
  }, () => charges.investigateBlockedCharge(CHARGE_D));

  assert.equal(result.verdict, "recovered");
  assert.equal(admin.row("billing_charges", CHARGE_D).provider_preference_id, "pref-perdido");
  assert.equal(mpCalls, 1, "o Mercado Pago nunca foi chamado para criar uma segunda Preference");
});

test("7g) nenhuma Preference, nenhum pagamento, dentro da janela: AINDA ASSIM stay_blocked — a única saída seria reconciliação manual", async () => {
  const admin = new FakeAdmin({
    billing_charges: [freshCharge(CHARGE_D, { creation_blocked_at: isoMsAgo(60_000) })],
  });
  setFakeAdminClient(admin);

  const result = await withFetchMock(emptySearchFetch, () => charges.investigateBlockedCharge(CHARGE_D));
  assert.equal(result.verdict, "stay_blocked");
  assert.match(result.reason, /não prova/);
  assert.equal(admin.row("billing_charges", CHARGE_D).provider_preference_id, null);
});

test("7i) paginação real: duas páginas, total bate só depois da segunda — acumula antes de classificar", async () => {
  const admin = new FakeAdmin({
    billing_charges: [freshCharge(CHARGE_D, { creation_blocked_at: isoMsAgo(60_000) })],
  });
  setFakeAdminClient(admin);

  const result = await withFetchMock(async (url) => {
    const s = String(url);
    if (s.includes("/checkout/preferences/search") && s.includes("offset=0")) {
      return jsonResponse(200, { elements: [{ id: "pref-1" }], total: 2, next_offset: 1 });
    }
    if (s.includes("/checkout/preferences/search") && s.includes("offset=1")) {
      return jsonResponse(200, { elements: [{ id: "pref-2" }], total: 2, next_offset: 2 });
    }
    throw new Error("URL inesperada: " + s);
  }, () => charges.investigateBlockedCharge(CHARGE_D));

  // As duas páginas juntas dão 2 Preferences para a mesma referência: ambíguo.
  assert.equal(result.verdict, "stay_blocked");
  assert.match(result.reason, /pref-1/);
  assert.match(result.reason, /pref-2/);
});

test("7j) next_offset não avança: nunca entra em loop, falha fechado", async () => {
  const admin = new FakeAdmin({
    billing_charges: [freshCharge(CHARGE_D, { creation_blocked_at: isoMsAgo(60_000) })],
  });
  setFakeAdminClient(admin);

  let calls = 0;
  const result = await withFetchMock(
    async () => {
      calls += 1;
      // total sempre diz que falta mais, mas next_offset nunca sai de 0.
      return jsonResponse(200, { elements: [{ id: "pref-1" }], total: 5, next_offset: 0 });
    },
    () => charges.investigateBlockedCharge(CHARGE_D),
  );

  assert.equal(result.verdict, "stay_blocked");
  assert.equal(calls, 1, "para na primeira página assim que percebe que next_offset não avançou");
});

test("7k) limite de páginas estourado sem fechar a conta com 'total': falha fechado, nunca avalia parcial", async () => {
  const admin = new FakeAdmin({
    billing_charges: [freshCharge(CHARGE_D, { creation_blocked_at: isoMsAgo(60_000) })],
  });
  setFakeAdminClient(admin);

  let calls = 0;
  const result = await withFetchMock(
    async (url) => {
      calls += 1;
      const offset = Number(new URL(url).searchParams.get("offset"));
      return jsonResponse(200, { elements: [{ id: `pref-${offset}` }], total: 999, next_offset: offset + 1 });
    },
    () => charges.investigateBlockedCharge(CHARGE_D),
  );

  assert.equal(result.verdict, "stay_blocked");
  assert.ok(calls <= 5, "nunca pagina além do limite de segurança");
});

// ── Ponto central: nem tempo, nem busca vazia, nem confirmação manual
//    autorizam uma segunda Preference enquanto houver incerteza ───────────

test("9) nem 10+ minutos de bloqueio, nem buscas vazias, nem qualquer confirmação em release() chegam a chamar createPreference de novo", async () => {
  const admin = new FakeAdmin({
    billing_charges: [freshCharge(CHARGE_D, { creation_blocked_at: isoMsAgo(24 * 60 * 60_000) })],
  });
  setFakeAdminClient(admin);

  let mpWriteCalls = 0;
  const fetchMock = async (url, init) => {
    const s = String(url);
    if (s.includes("/checkout/preferences/search")) return jsonResponse(200, { elements: [], total: 0, next_offset: 0 });
    if (s.includes("/v1/payments/search")) return jsonResponse(200, { results: [] });
    if (s.includes("/checkout/preferences") && init?.method === "POST") {
      mpWriteCalls += 1;
      return jsonResponse(201, { id: "pref-nao-deveria-existir", init_point: "https://mp.example/x" });
    }
    throw new Error("URL inesperada: " + s);
  };

  // Tenta de todas as formas: sem confirmação, com confirmação antiga
  // (LIBERAR), com os últimos 8 caracteres do id, e investigando direto.
  await withFetchMock(fetchMock, () => actions.release(null, formWith({ id: CHARGE_D })));
  await withFetchMock(fetchMock, () => actions.release(null, formWith({ id: CHARGE_D, confirm: "LIBERAR" })));
  await withFetchMock(fetchMock, () => actions.release(null, formWith({ id: CHARGE_D, confirm: CHARGE_D.slice(-8) })));
  await withFetchMock(fetchMock, () => charges.investigateBlockedCharge(CHARGE_D));

  assert.equal(mpWriteCalls, 0, "createPreference nunca foi chamado, em nenhuma tentativa");
  const row = admin.row("billing_charges", CHARGE_D);
  assert.equal(row.provider_preference_id, null);
  assert.ok(row.creation_blocked_at, "continua bloqueada no final de tudo");
});

// ── 8. persistPreference e releaseClaim nunca desbloqueiam/sobrescrevem
//       indevidamente — e uma resposta tardia legítima nunca se perde ──────

test("8a) persistPreference: a linha trava ENQUANTO a gravação normal está em andamento — a resposta legítima é recuperada, não perdida", async () => {
  const admin = new FakeAdmin({ billing_charges: [freshCharge(CHARGE_D)] });
  setFakeAdminClient(admin);

  // Simula a corrida: a escrita normal (guardada por creation_blocked_at IS
  // NULL) não afeta nada porque, entre a leitura e a escrita, a linha já foi
  // bloqueada por outra chamada (claimCreation detectando uma reserva
  // vencida, por exemplo). persistPreference precisa reconhecer isso e
  // gravar pelo caminho de recuperação — nunca descartar o id.
  admin.row("billing_charges", CHARGE_D).creation_blocked_at = new Date().toISOString();

  const outcome = await charges.persistPreference(CHARGE_D, "pref-tardio", "https://mp.example/pref-tardio");
  assert.equal(outcome, "saved");
  const row = admin.row("billing_charges", CHARGE_D);
  assert.equal(row.provider_preference_id, "pref-tardio");
  assert.equal(row.payment_url, "https://mp.example/pref-tardio");
  assert.equal(row.creation_blocked_at, null, "a recuperação também limpa o bloqueio — não há mais nada incerto");
});

test("8b) persistPreference: nunca sobrescreve uma Preference DIFERENTE já salva na linha", async () => {
  const admin = new FakeAdmin({
    billing_charges: [freshCharge(CHARGE_D, { provider_preference_id: "pref-ja-salva", payment_url: "https://mp.example/pref-ja-salva" })],
  });
  setFakeAdminClient(admin);

  const outcome = await charges.persistPreference(CHARGE_D, "pref-outra", "https://mp.example/pref-outra");
  assert.equal(outcome, "failed");
  assert.equal(admin.row("billing_charges", CHARGE_D).provider_preference_id, "pref-ja-salva", "a Preference já salva nunca é trocada às cegas");
});

test("8c) persistPreference: repetir com a MESMA Preference já salva é idempotente ('saved', nada muda)", async () => {
  const admin = new FakeAdmin({
    billing_charges: [freshCharge(CHARGE_D, { provider_preference_id: "pref-1", payment_url: "https://mp.example/pref-1" })],
  });
  setFakeAdminClient(admin);

  const outcome = await charges.persistPreference(CHARGE_D, "pref-1", "https://mp.example/pref-1");
  assert.equal(outcome, "saved");
});

test("8d) releaseClaim nunca limpa a reserva de uma linha já bloqueada", async () => {
  const admin = new FakeAdmin({
    billing_charges: [freshCharge(CHARGE_D, { creation_claimed_at: new Date().toISOString(), creation_blocked_at: isoMsAgo(1_000) })],
  });
  setFakeAdminClient(admin);

  await charges.releaseClaim(CHARGE_D);
  const row = admin.row("billing_charges", CHARGE_D);
  assert.ok(row.creation_claimed_at, "a reserva não foi limpa: a linha está bloqueada");
});

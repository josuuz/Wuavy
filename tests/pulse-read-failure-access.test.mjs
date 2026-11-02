/*
  O fail-open: uma consulta financeira que FALHA nunca pode ser lida como
  "esta clínica não tem assinatura".

  lib/flow/access.ts trata "nenhuma linha" como uma clínica de antes das
  assinaturas, que mantém o uso total. Quando getSubscriptions() engolia o erro
  de leitura (data nulo → lista vazia), qualquer falha — uma coluna que ainda
  não existe porque o deploy saiu antes da migration, uma queda, um timeout —
  caía nesse ramo e liberava acesso total a quem não tinha direito comprovado.

  Registrar o erro não basta. Estes testes rodam lib/flow/session.ts DE VERDADE
  (não um fake dele, que escondia bugs desta família) contra um Supabase falso
  cuja tabela subscriptions FALHA, e provam o que o sistema faz em seguida:
  fecha — nada de editar, nada de agir para fora — sem dizer que a assinatura
  está cancelada (não se sabe) e sem mandar a pessoa assinar de novo.

  O que NÃO muda, e também é provado: uma leitura que funciona e volta VAZIA
  segue sendo uma clínica de antes das assinaturas, com o uso de sempre.
*/

import { register } from "node:module";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { SUBSCRIPTION_SELECT } from "./helpers/subscription-select.mjs";

register("./helpers/pulse-session-loader.mjs", import.meta.url);

const { FakeServerClient, setFakeServerClient } = await import("./helpers/fake-server-client.mjs");
const session = await import("../src/lib/flow/session.ts");
const { UNVERIFIED_MESSAGE, READ_ONLY_MESSAGE, denialMessage } = await import("../src/lib/flow/access.ts");

const USER = { id: "user-1", email: "clinica@example.com" };
const ORG = "org-1";
const MEMBER = { user_id: USER.id, organization_id: ORG, name: "Clínica Teste", role: "owner", status: "active" };

function setup({ subscriptions = [], failTables = [], members = [MEMBER] } = {}) {
  setFakeServerClient(new FakeServerClient({ user: USER, tables: { members, subscriptions }, failTables }));
}

const ativa = {
  id: "sub-ativa",
  status: "active",
  organization_id: ORG,
  provider_subscription_id: "preapproval-1",
  payer_email: null,
  current_period_end: null,
  creation_blocked_at: null,
  created_at: "2026-10-01T12:00:00.000Z",
};

// ── o defeito, em cada ponto de entrada ──

test("a leitura das assinaturas falha: a clínica NÃO ganha acesso total", async () => {
  setup({ subscriptions: [ativa], failTables: ["subscriptions"] });
  const access = await session.getClinicAccess();
  assert.ok(access, "o acesso é decidido, nunca omitido");
  assert.equal(access.canEdit, false, "não edita sem direito comprovado");
  assert.equal(access.canReachOut, false, "não age para fora (mensagens, automações, integrações)");
  assert.equal(access.isReadOnly, true);
  assert.equal(access.unverified, true, "diz que NÃO SABE — não que a assinatura acabou");
});

test("a falha de leitura não é apresentada como um estado de assinatura", async () => {
  setup({ subscriptions: [ativa], failTables: ["subscriptions"] });
  const access = await session.getClinicAccess();
  assert.equal(access.subscriptionStatus, null, "nem 'cancelada', nem 'pendente', nem 'ativa': a leitura não disse nada");
  assert.equal(access.paidUntil, null, "não inventa um mês pago");
  assert.equal(access.nextCharge, null);
});

test("getSubscriptions, getSubscription e getStanding lançam em vez de devolver 'nenhuma'", async () => {
  setup({ subscriptions: [ativa], failTables: ["subscriptions"] });
  await assert.rejects(() => session.getSubscriptions(), session.SubscriptionReadError);
  await assert.rejects(() => session.getSubscription(), session.SubscriptionReadError);
  await assert.rejects(() => session.getStanding(), session.SubscriptionReadError);
});

test("quem ainda não tem clínica e cuja leitura falha não é mandado para o onboarding", async () => {
  // Pago e sem clínica: se a leitura falhasse e isso virasse "nenhuma assinatura",
  // ele iria para a demo (fecha); o ponto é que NUNCA vá para /comecar sem prova.
  const paga = { ...ativa, id: "sub-paga", organization_id: null };
  setup({ members: [], subscriptions: [paga], failTables: ["subscriptions"] });
  assert.equal(await session.homePath(), "/clinavy/demo");
});

test("a mensagem de uma falha de leitura não manda ninguém assinar de novo", async () => {
  setup({ subscriptions: [ativa], failTables: ["subscriptions"] });
  const access = await session.getClinicAccess();
  const message = denialMessage(access);
  assert.equal(message, UNVERIFIED_MESSAGE);
  assert.notEqual(message, READ_ONLY_MESSAGE, "'assinatura inativa — assine' seria falso e levaria a uma cobrança duplicada");
  assert.doesNotMatch(message, /assine/i);
  assert.match(message, /confirmar/i);
});

test("uma assinatura realmente inativa segue com a mensagem de sempre", async () => {
  assert.equal(denialMessage({ unverified: false }), READ_ONLY_MESSAGE);
  assert.equal(denialMessage({}), READ_ONLY_MESSAGE);
});

// ── uma leitura possivelmente incompleta também não decide acesso ──

test("uma leitura que ENCHE o limite é tratada como falha: a linha que dá acesso pode estar além dela", async () => {
  // A melhor prova financeira (um mês pago ainda correndo, a transição legada) pode ser a
  // mais antiga: acesso não se decide com uma página cheia, que talvez esconda linhas.
  const muitas = Array.from({ length: 200 }, (_, i) => ({
    ...ativa,
    id: `sub-${i}`,
    status: "cancelled",
    created_at: new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString(),
  }));
  setup({ subscriptions: muitas });
  const access = await session.getClinicAccess();
  assert.equal(access.unverified, true);
  assert.equal(access.canEdit, false);
  await assert.rejects(() => session.getSubscriptions(), session.SubscriptionReadError);
});

test("uma página que NÃO enche o limite é lida por inteiro, como sempre", async () => {
  const quase = Array.from({ length: 199 }, (_, i) => ({
    ...ativa,
    id: `sub-${i}`,
    status: "cancelled",
    created_at: new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString(),
  }));
  setup({ subscriptions: quase });
  const rows = await session.getSubscriptions();
  assert.equal(rows.length, 199);
  const access = await session.getClinicAccess();
  assert.equal(access.unverified, undefined, "leitura completa, nada de falha");
});

// ── o limite de tentativas lê o que getSubscriptions() esconde ──

test("countRecentAttempts conta as linhas da janela, inclusive as RECUSADAS, e só as da própria clínica", async () => {
  // getSubscriptions() exclui 'rejected' de propósito (nunca existiu no Mercado Pago), mas cada
  // uma custou uma chamada a ele: o limite de tentativas tem de contá-las.
  const iso = (minutos) => new Date(Date.now() - minutos * 60_000).toISOString();
  setup({
    subscriptions: [
      { ...ativa, id: "a", status: "cancelled", created_at: iso(5) },
      { ...ativa, id: "b", status: "rejected", created_at: iso(10) },
      { ...ativa, id: "c", status: "cancelled", created_at: iso(90) },
      { ...ativa, id: "d", status: "pending", organization_id: "outra-clinica", created_at: iso(5) },
    ],
  });
  assert.equal(await session.countRecentAttempts(60 * 60 * 1000), 2, "a e b: a de 90 minutos e a de outra clínica ficam de fora");
  assert.equal((await session.getSubscriptions()).some((row) => row.id === "b"), false, "e a recusada continua fora da leitura de acesso");
});

test("countRecentAttempts: uma leitura que falha lança, nunca vira zero tentativas", async () => {
  setup({ subscriptions: [ativa], failTables: ["subscriptions"] });
  await assert.rejects(() => session.countRecentAttempts(60 * 60 * 1000), session.SubscriptionReadError);
});

// ── a consulta que o teste real prova é a que o app faz ──

test("a lista de colunas provada contra o Postgres real é a MESMA que session.ts consulta", () => {
  // tests/pulse-payer-email-real.test.mjs prova, no PostgREST de verdade, a consulta com
  // SUBSCRIPTION_SELECT. Se session.ts mudasse a lista e o helper não, a prova real seria de
  // uma consulta que o app não faz mais, e ninguém notaria.
  const source = readFileSync(new URL("../src/lib/flow/session.ts", import.meta.url), "utf8");
  assert.ok(source.includes(`"${SUBSCRIPTION_SELECT}"`), "session.ts consulta a lista de tests/helpers/subscription-select.mjs");
});

// ── o que não pode mudar ──

test("uma leitura que FUNCIONA e volta vazia continua sendo uma clínica de antes das assinaturas", async () => {
  setup({ subscriptions: [] });
  const access = await session.getClinicAccess();
  assert.equal(access.canEdit, true);
  assert.equal(access.canReachOut, true);
  assert.equal(access.unverified, undefined, "não é uma falha de leitura");
});

test("uma leitura que funciona e traz uma assinatura ativa libera como sempre", async () => {
  setup({ subscriptions: [ativa] });
  const access = await session.getClinicAccess();
  assert.equal(access.canEdit, true);
  assert.equal(access.subscriptionStatus, "active");
  assert.equal(access.unverified, undefined);
});

test("a falha de outra tabela não é confundida com a das assinaturas", async () => {
  // As assinaturas leem bem: o acesso vem delas, como sempre.
  setup({ subscriptions: [ativa], failTables: ["organizations"] });
  const access = await session.getClinicAccess();
  assert.equal(access.canEdit, true);
});

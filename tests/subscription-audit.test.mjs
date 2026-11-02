/*
  A auditoria de suporte (lib/flow/subscription-audit.ts): somente leitura, e
  estreita. Estes testes prendem o que uma revisão achou na primeira versão:

  - o e-mail era colado numa string de filtro `.or(...)`, onde uma vírgula ou
    um parêntese muda a consulta;
  - o `ilike` não escapava `_` nem `%`: "%@gmail.com" trazia o domínio inteiro
    e "joao_silva@x.com" também casava "joaoXsilva@x.com".

  O cliente é um gravador: registra cada chamada e devolve o que o teste manda.
  Assim se prova O QUE FOI PERGUNTADO ao banco, que é onde a falha estava —
  não só o que voltou.
*/

import { register } from "node:module";
import test from "node:test";
import assert from "node:assert/strict";

register("./helpers/pulse-loader.mjs", import.meta.url);

const { setFakeAdminClient } = await import("./helpers/fake-admin.mjs");
const audit = await import("../src/lib/flow/subscription-audit.ts");

const ORG = "11111111-1111-4111-8111-111111111111";
const USER = "22222222-2222-4222-8222-222222222222";
const OUTRA = "33333333-3333-4333-8333-333333333333";

/** Um cliente que grava cada consulta e responde pelo `respond(call)` do teste. */
function recorder(respond) {
  const calls = [];
  const client = {
    calls,
    from(table) {
      const call = { table, ops: [] };
      calls.push(call);
      const builder = new Proxy(
        {},
        {
          get(_, prop) {
            if (prop === "then") return (resolve, reject) => Promise.resolve(respond(call)).then(resolve, reject);
            return (...args) => {
              call.ops.push([prop, ...args]);
              return builder;
            };
          },
        },
      );
      return builder;
    },
  };
  setFakeAdminClient(client);
  return client;
}

const opNames = (call) => call.ops.map(([name]) => name);
const has = (call, name, ...args) => call.ops.some(([n, ...a]) => n === name && args.every((arg, i) => a[i] === arg));

const sub = (id, overrides = {}) => ({
  id,
  status: "pending",
  organization_id: null,
  user_id: USER,
  provider_subscription_id: null,
  payer_email: null,
  current_period_end: null,
  creation_blocked_at: null,
  creation_claimed_at: null,
  last_refusal_http_status: null,
  last_refusal_detail: null,
  created_at: "2026-11-01T18:00:00.000Z",
  ...overrides,
});

// ── o e-mail precisa ter forma de e-mail, e nada de curinga ──

test("o que não tem forma de e-mail não consulta nada", async () => {
  const client = recorder(() => ({ data: [], error: null }));
  for (const invalido of ["", "   ", "sem-arroba", "a@b", "a@b.", "@x.com", "%@gmail.com", "a*b@x.com", "a%b@x.com", "x".repeat(250) + "@x.com"]) {
    assert.equal(await audit.auditByEmail(invalido), null, JSON.stringify(invalido));
  }
  assert.equal(client.calls.length, 0, "nenhuma consulta saiu");
});

// ── o e-mail nunca entra numa string de filtro ──

test("vírgula e parênteses no e-mail não reescrevem a consulta: nenhum `or` é usado", async () => {
  const hostil = "a,user_id.neq.x)@dominio.com";
  const client = recorder(() => ({ data: [], error: null, count: 0 }));
  const result = await audit.auditByEmail(hostil);
  assert.ok(result, "tem forma de e-mail, então consulta — mas de forma segura");
  for (const call of client.calls) {
    assert.ok(!opNames(call).includes("or"), `${call.table}: nenhum .or() com string interpolada`);
  }
  // O texto hostil só pode aparecer como ARGUMENTO de ilike, nunca como filtro.
  const ilikes = client.calls.filter((c) => has(c, "ilike"));
  assert.ok(ilikes.length >= 2, "members e subscriptions.payer_email");
  for (const call of ilikes) {
    const [, column, pattern] = call.ops.find(([n]) => n === "ilike");
    assert.ok(["email", "payer_email"].includes(column));
    assert.equal(pattern, hostil.replace(/[\\_]/g, (c) => `\\${c}`));
  }
});

test("o sublinhado do e-mail é literal no LIKE, e o resultado ainda é conferido por igualdade exata", async () => {
  // "_" casa qualquer letra num LIKE; sem escape, joao_silva também traria joaoXsilva.
  const client = recorder((call) => {
    if (call.table === "members") {
      return {
        data: [
          { organization_id: ORG, user_id: USER, role: "owner", status: "active", email: "joao_silva@x.com" },
          { organization_id: OUTRA, user_id: OUTRA, role: "owner", status: "active", email: "joaoXsilva@x.com" },
        ],
        error: null,
      };
    }
    if (call.table === "organizations") return { data: [{ id: ORG, name: "Clínica" }], error: null };
    return { data: [], error: null, count: 0 };
  });
  const result = await audit.auditByEmail("  Joao_Silva@X.com  ");

  const members = client.calls.find((c) => c.table === "members");
  assert.deepEqual(members.ops.find(([n]) => n === "ilike"), ["ilike", "email", "joao\\_silva@x.com"], "sublinhado escapado, e-mail em minúsculas");
  assert.deepEqual(result.userIds, [USER], "o homônimo que o LIKE deixaria passar foi descartado pela igualdade exata");
  assert.deepEqual(result.clinics.map((c) => c.id), [ORG]);
});

// ── somente leitura, e só contagem de dado clínico ──

test("de dado clínico só sai contagem: head + count, nunca conteúdo", async () => {
  const client = recorder((call) => {
    if (call.table === "members") return { data: [{ organization_id: ORG, user_id: USER, role: "owner", status: "active", email: "a@x.com" }], error: null };
    if (call.table === "organizations") return { data: [{ id: ORG, name: "Clínica" }], error: null };
    if (["patients", "clinical_records", "appointments"].includes(call.table)) return { data: null, error: null, count: 7 };
    return { data: [], error: null };
  });
  const result = await audit.auditByEmail("a@x.com");
  assert.deepEqual(result.clinics[0].counts, { patients: 7, clinicalRecords: 7, appointments: 7 });

  for (const call of client.calls.filter((c) => ["patients", "clinical_records", "appointments"].includes(c.table))) {
    const [, columns, options] = call.ops.find(([n]) => n === "select");
    assert.equal(columns, "id", `${call.table}: nenhuma coluna de conteúdo`);
    assert.deepEqual(options, { count: "exact", head: true }, `${call.table}: só a contagem`);
  }
});

test("nenhuma escrita sai da auditoria, qualquer que seja a busca", async () => {
  const client = recorder(() => ({ data: [], error: null, count: 0 }));
  await audit.auditByEmail("a@x.com");
  await audit.auditByUserId(USER);
  const writes = ["insert", "update", "upsert", "delete", "rpc"];
  for (const call of client.calls) {
    for (const write of writes) assert.ok(!opNames(call).includes(write), `${call.table}: sem ${write}`);
  }
});

// ── a conta que o e-mail não alcança ──

test("uma conta sem clínica é achada pelo id, com suas tentativas e a recusa registrada", async () => {
  const client = recorder((call) => {
    if (call.table === "members") return { data: [], error: null };
    if (call.table === "subscriptions" && has(call, "in", "user_id")) {
      return { data: [sub("s-2", { last_refusal_http_status: 400, last_refusal_detail: "invalid_payer_email" })], error: null };
    }
    return { data: [], error: null, count: 0 };
  });
  const result = await audit.auditByUserId(USER.toUpperCase());
  assert.equal(result.by, "user");
  assert.equal(result.query, USER, "normalizado");
  assert.deepEqual(result.userIds, [USER]);
  assert.equal(result.clinics.length, 0, "ainda sem clínica");
  assert.equal(result.subscriptions[0].last_refusal_detail, "invalid_payer_email");
  const members = client.calls.find((c) => c.table === "members");
  assert.deepEqual(members.ops.find(([n]) => n === "eq"), ["eq", "user_id", USER]);
});

test("um uuid sem nenhuma linha não é apresentado como uma conta encontrada", async () => {
  // O id digitado serve para consultar; só a participação ou uma assinatura prova que a conta existe.
  recorder(() => ({ data: [], error: null, count: 0 }));
  const result = await audit.auditByUserId(OUTRA);
  assert.deepEqual(result.userIds, [], "nada prova esta conta: o painel não pode inventá-la");
  assert.deepEqual(result.clinics, []);
  assert.deepEqual(result.subscriptions, []);
});

test("o que não é um uuid não consulta nada", async () => {
  const client = recorder(() => ({ data: [], error: null }));
  for (const invalido of ["", "abc", "1; drop table subscriptions", USER + "x", "not-a-uuid-at-all"]) {
    assert.equal(await audit.auditByUserId(invalido), null, JSON.stringify(invalido));
  }
  assert.equal(client.calls.length, 0);
});

test("assinaturas achadas por três caminhos aparecem uma vez só, da mais nova para a mais antiga", async () => {
  const comum = sub("s-comum", { created_at: "2026-10-20T10:00:00.000Z", organization_id: ORG, payer_email: "a@x.com" });
  recorder((call) => {
    if (call.table === "members") return { data: [{ organization_id: ORG, user_id: USER, role: "owner", status: "active", email: "a@x.com" }], error: null };
    if (call.table === "subscriptions" && has(call, "ilike", "payer_email")) return { data: [comum], error: null };
    if (call.table === "subscriptions" && has(call, "in", "user_id")) return { data: [comum, sub("s-nova", { created_at: "2026-11-01T18:00:00.000Z" })], error: null };
    if (call.table === "subscriptions" && has(call, "in", "organization_id")) return { data: [comum], error: null };
    if (call.table === "organizations") return { data: [{ id: ORG, name: "Clínica" }], error: null };
    return { data: [], error: null, count: 0 };
  });
  const result = await audit.auditByEmail("a@x.com");
  assert.deepEqual(result.subscriptions.map((s) => s.id), ["s-nova", "s-comum"]);
  assert.deepEqual(result.failed, [], "tudo respondeu: nenhuma leitura falhou");
});

// ── uma leitura que falha não pode parecer "zero" ──

test("uma contagem que falha vira null, nunca zero, e a falha é listada — o painel decide sobre contas", async () => {
  recorder((call) => {
    if (call.table === "members") return { data: [{ organization_id: ORG, user_id: USER, role: "owner", status: "active", email: "a@x.com" }], error: null };
    if (call.table === "organizations") return { data: [{ id: ORG, name: "Clínica" }], error: null };
    if (call.table === "patients") return { data: null, error: { message: "boom" }, count: null };
    return { data: [], error: null, count: 3 };
  });
  const result = await audit.auditByEmail("a@x.com");
  assert.equal(result.clinics[0].counts.patients, null, "não é zero: não se sabe");
  assert.equal(result.clinics[0].counts.clinicalRecords, 3);
  assert.equal(result.clinics[0].counts.appointments, 3);
  assert.ok(result.failed.some((f) => f.includes("patients")), "a falha aparece para quem lê o painel");
});

test("a leitura das assinaturas que falha não vira 'nenhuma assinatura'", async () => {
  recorder((call) => {
    if (call.table === "members") return { data: [{ organization_id: ORG, user_id: USER, role: "owner", status: "active", email: "a@x.com" }], error: null };
    if (call.table === "subscriptions" && has(call, "in", "user_id")) return { data: null, error: { message: "boom" } };
    if (call.table === "organizations") return { data: [], error: null };
    return { data: [], error: null, count: 0 };
  });
  const result = await audit.auditByEmail("a@x.com");
  assert.deepEqual(result.subscriptions, [], "nada veio");
  assert.ok(result.failed.includes("assinaturas por conta"), "mas o painel é avisado de que isso NÃO quer dizer que não existam");
});

test("a leitura de participação que falha também é listada, na busca por id da conta", async () => {
  recorder((call) => (call.table === "members" ? { data: null, error: { message: "boom" } } : { data: [], error: null, count: 0 }));
  const result = await audit.auditByUserId(USER);
  assert.ok(result.failed.length > 0);
});

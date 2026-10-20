/*
  A decisão pura de investigateBlockedCharge (lib/billing/charges.ts) — sem
  rede (lib/billing/create-charge.ts: classifyPreferenceSearch,
  isWithinSearchWindow, decideInvestigation). O risco que isto prova:
  nenhuma situação ambígua, incompleta ou vazia libera uma criação nova
  sozinha — só uma correspondência inequívoca recupera, e tudo o mais
  mantém a cobrança bloqueada.
*/

import test from "node:test";
import assert from "node:assert/strict";

import { classifyPreferenceSearch, decideInvestigation, isWithinSearchWindow, PREFERENCE_SEARCH_SAFE_DAYS } from "../src/lib/billing/create-charge.ts";

// ── classifyPreferenceSearch ────────────────────────────────────────────

test("busca falhou (elements null): nunca é 'nenhuma encontrada'", () => {
  assert.deepEqual(classifyPreferenceSearch(null), { kind: "failed" });
});

test("busca sem resultado: 'none'", () => {
  assert.deepEqual(classifyPreferenceSearch([]), { kind: "none" });
});

test("busca com mais de um resultado: 'ambiguous', com os ids", () => {
  const result = classifyPreferenceSearch([{ id: "a" }, { id: "b" }]);
  assert.deepEqual(result, { kind: "ambiguous", ids: ["a", "b"] });
});

test("busca com exatamente um resultado: 'candidate'", () => {
  assert.deepEqual(classifyPreferenceSearch([{ id: "pref-1" }]), { kind: "candidate", id: "pref-1" });
});

// ── isWithinSearchWindow ─────────────────────────────────────────────────

test("cobrança recente: dentro da janela", () => {
  const now = Date.now();
  const createdAt = new Date(now - 2 * 86_400_000).toISOString();
  assert.equal(isWithinSearchWindow(createdAt, now), true);
});

test("cobrança além da margem de segurança (85 dias): fora da janela", () => {
  const now = Date.now();
  const createdAt = new Date(now - (PREFERENCE_SEARCH_SAFE_DAYS + 1) * 86_400_000).toISOString();
  assert.equal(isWithinSearchWindow(createdAt, now), false);
});

test("data inválida: nunca é tratada como dentro da janela", () => {
  assert.equal(isWithinSearchWindow("não é uma data", Date.now()), false);
});

// ── decideInvestigation ──────────────────────────────────────────────────

const base = { paymentFound: false, withinSearchWindow: true };

test("consulta de Preferences falhou: stay_blocked", () => {
  const result = decideInvestigation({ ...base, searchOutcome: { kind: "failed" } });
  assert.equal(result.verdict, "stay_blocked");
});

test("múltiplas Preferences: stay_blocked, com os ids na mensagem", () => {
  const result = decideInvestigation({ ...base, searchOutcome: { kind: "ambiguous", ids: ["pref-1", "pref-2"] } });
  assert.equal(result.verdict, "stay_blocked");
  assert.match(result.reason, /pref-1/);
  assert.match(result.reason, /pref-2/);
});

test("um candidato, mas a validação (valor/moeda/referência) recusa: stay_blocked", () => {
  const result = decideInvestigation({
    ...base,
    searchOutcome: { kind: "candidate", id: "pref-1" },
    candidateCheck: { ok: false, error: "O valor dessa Preference não bate com o valor desta cobrança." },
  });
  assert.equal(result.verdict, "stay_blocked");
  assert.match(result.reason, /valor/);
});

test("um candidato, validação passa, mas sem detalhe (sem link): stay_blocked, nunca recovered sem url", () => {
  const result = decideInvestigation({
    ...base,
    searchOutcome: { kind: "candidate", id: "pref-1" },
    candidateCheck: { ok: true },
    candidateDetail: undefined,
  });
  assert.equal(result.verdict, "stay_blocked");
});

test("um candidato válido, com detalhe: recovered, com o id e a url certos", () => {
  const result = decideInvestigation({
    ...base,
    searchOutcome: { kind: "candidate", id: "pref-1" },
    candidateCheck: { ok: true },
    candidateDetail: { id: "pref-1", url: "https://mp.example/pref-1" },
  });
  assert.deepEqual(result, { verdict: "recovered", preferenceId: "pref-1", url: "https://mp.example/pref-1" });
});

test("nenhuma Preference, mas a busca de pagamentos falhou ('unknown'): stay_blocked", () => {
  const result = decideInvestigation({ ...base, searchOutcome: { kind: "none" }, paymentFound: "unknown" });
  assert.equal(result.verdict, "stay_blocked");
});

test("nenhuma Preference, mas existe um pagamento para a referência: stay_blocked mesmo assim", () => {
  const result = decideInvestigation({ ...base, searchOutcome: { kind: "none" }, paymentFound: true });
  assert.equal(result.verdict, "stay_blocked");
});

test("nenhuma Preference, nenhum pagamento, mas fora da janela de busca: stay_blocked — vazio não é prova", () => {
  const result = decideInvestigation({ searchOutcome: { kind: "none" }, paymentFound: false, withinSearchWindow: false });
  assert.equal(result.verdict, "stay_blocked");
  assert.match(result.reason, /90 dias/);
});

test("nenhuma Preference, nenhum pagamento, dentro da janela: AINDA ASSIM stay_blocked — busca vazia nunca é prova de inexistência", () => {
  const result = decideInvestigation({ ...base, searchOutcome: { kind: "none" } });
  assert.equal(result.verdict, "stay_blocked");
  assert.match(result.reason, /não prova/);
});

test("o único desfecho que não é stay_blocked é 'recovered' — não existe um terceiro caminho de liberação", () => {
  // Varre os quatro tipos de searchOutcome com o melhor caso possível em cada
  // um (exceto 'candidate', coberto num teste próprio acima): nenhum deles,
  // fora o candidato validado, chega a um verdict diferente de stay_blocked.
  const casos = [
    { searchOutcome: { kind: "failed" } },
    { searchOutcome: { kind: "ambiguous", ids: ["a"] } },
    { searchOutcome: { kind: "none" }, paymentFound: false, withinSearchWindow: true },
    { searchOutcome: { kind: "none" }, paymentFound: false, withinSearchWindow: false },
    { searchOutcome: { kind: "none" }, paymentFound: true, withinSearchWindow: true },
    { searchOutcome: { kind: "none" }, paymentFound: "unknown", withinSearchWindow: true },
  ];
  for (const caso of casos) {
    const result = decideInvestigation({ paymentFound: false, withinSearchWindow: true, ...caso });
    assert.equal(result.verdict, "stay_blocked", JSON.stringify(caso));
  }
});

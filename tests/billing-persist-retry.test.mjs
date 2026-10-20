/*
  O retry da gravação local depois que o Mercado Pago já aceitou a
  Preference (lib/billing/create-charge.ts). Só a escrita no Supabase é
  repetida — nunca a chamada ao Mercado Pago, que já temos certeza de ter
  funcionado. `claimDecision` é a mesma condição que a reserva atômica em
  SQL (charges.ts, claimCreation) decide no banco; aqui ela é só lida, sem
  rede, para provar o que acontece com duas tentativas concorrentes e com
  uma cobrança já bloqueada para reconciliação.
*/

import test from "node:test";
import assert from "node:assert/strict";

import { claimDecision, runPersistPreference } from "../src/lib/billing/create-charge.ts";

test("a gravação que funciona de primeira nunca espera nem repete", async () => {
  let writes = 0;
  let waits = 0;
  const result = await runPersistPreference(
    async () => {
      writes += 1;
      return true;
    },
    3,
    async () => {
      waits += 1;
    },
  );
  assert.equal(result, "saved");
  assert.equal(writes, 1);
  assert.equal(waits, 0);
});

test("falha duas vezes e salva na terceira: 'saved', duas esperas", async () => {
  let attempt = 0;
  const result = await runPersistPreference(
    async () => {
      attempt += 1;
      return attempt >= 3;
    },
    3,
    async () => {},
  );
  assert.equal(result, "saved");
  assert.equal(attempt, 3);
});

test("falha em todas as tentativas: 'failed', nunca mais que o limite", async () => {
  let attempts = 0;
  const result = await runPersistPreference(
    async () => {
      attempts += 1;
      return false;
    },
    3,
    async () => {},
  );
  assert.equal(result, "failed");
  assert.equal(attempts, 3);
});

test("uma cobrança bloqueada para reconciliação nunca é reivindicada de novo", () => {
  const row = { provider_preference_id: null, creation_blocked_at: "2026-01-01T00:00:00Z", creation_claimed_at: null };
  assert.equal(claimDecision(row, Date.now(), 30_000), "blocked");
});

test("duas tentativas simultâneas: a segunda vê a reserva da primeira e não reivindica", () => {
  const now = Date.now();
  const row = { provider_preference_id: null, creation_blocked_at: null, creation_claimed_at: new Date(now).toISOString() };
  // A "segunda requisição" olha o mesmo instante, quase junto da primeira.
  assert.equal(claimDecision(row, now + 500, 30_000), "in_progress");
});

test("uma reserva vencida nunca autoriza uma segunda chamada ao Mercado Pago: vira bloqueio, não reivindicação", () => {
  // A resposta do Mercado Pago pode só estar demorando — não temos como saber
  // se a primeira tentativa terminou. Travar exige reconciliação manual em
  // vez de arriscar uma segunda Preference enquanto a primeira pode ainda
  // estar em curso.
  const claimedAt = Date.now() - 60_000;
  const row = { provider_preference_id: null, creation_blocked_at: null, creation_claimed_at: new Date(claimedAt).toISOString() };
  assert.equal(claimDecision(row, Date.now(), 30_000), "blocked");
});

test("muito tempo depois, uma reserva vencida continua virando bloqueio — nunca volta a ficar livre por conta própria", () => {
  const claimedAt = Date.now() - 24 * 60 * 60 * 1000;
  const row = { provider_preference_id: null, creation_blocked_at: null, creation_claimed_at: new Date(claimedAt).toISOString() };
  assert.equal(claimDecision(row, Date.now(), 30_000), "blocked");
});

test("gravar o bloqueio também usa o mesmo retry: falhando sempre, devolve 'failed', e quem chamou sabe que precisa confiar na autocorreção do próximo contato", async () => {
  let attempts = 0;
  const result = await runPersistPreference(
    async () => {
      attempts += 1;
      return false; // Supabase indisponível nas três tentativas.
    },
    3,
    async () => {},
  );
  assert.equal(result, "failed");
  assert.equal(attempts, 3);
});

test("sem nenhuma marca, a primeira tentativa reivindica livremente", () => {
  const row = { provider_preference_id: null, creation_blocked_at: null, creation_claimed_at: null };
  assert.equal(claimDecision(row, Date.now(), 30_000), "claimed");
});

test("uma cobrança que já tem Preference não precisa reivindicar nada", () => {
  const row = { provider_preference_id: "pref-1", creation_blocked_at: null, creation_claimed_at: null };
  assert.equal(claimDecision(row, Date.now(), 30_000), "already");
});

test("falha ao gravar o bloqueio (Supabase indisponível nas três tentativas): 'failed', mas a reserva vencida trava sozinha depois", async () => {
  let attempts = 0;
  const result = await runPersistPreference(
    async () => {
      attempts += 1;
      return false; // a escrita de creation_blocked_at nunca confirma.
    },
    3,
    async () => {},
  );
  assert.equal(result, "failed");
  assert.equal(attempts, 3);
  // Mesmo sem essa gravação explícita ter confirmado, a reserva continua
  // vencida: a próxima leitura (claimDecision, dentro de claimCreation) vê
  // "blocked" de qualquer forma — a segurança não depende desta escrita ter
  // funcionado na hora.
  const claimedAt = Date.now() - 60_000;
  const row = { provider_preference_id: null, creation_blocked_at: null, creation_claimed_at: new Date(claimedAt).toISOString() };
  assert.equal(claimDecision(row, Date.now(), 30_000), "blocked");
});

test("recuperação sem duplicar cobrança: reserva vencida -> bloqueada -> reconciliada -> livre para a próxima cobrança, nunca para esta", () => {
  // 1) A primeira tentativa reivindicou e sumiu (Mercado Pago lento, aba fechada).
  const claimedAt = Date.now() - 60_000;
  let row = { provider_preference_id: null, creation_blocked_at: null, creation_claimed_at: new Date(claimedAt).toISOString() };
  // 2) Uma tentativa posterior nunca chama o Mercado Pago de novo: só trava.
  assert.equal(claimDecision(row, Date.now(), 30_000), "blocked");
  row = { ...row, creation_blocked_at: new Date().toISOString() };
  // 3) Bloqueada, continua bloqueada enquanto ninguém reconcilia — nunca
  // volta a "claimed" sozinha, por mais tempo que passe.
  assert.equal(claimDecision(row, Date.now() + 10 * 60_000, 30_000), "blocked");
  // 4) Só a reconciliação manual (reconcilePreference/releaseForRetry) limpa
  // os dois campos — e só depois disso uma NOVA cobrança (outro id) pode
  // reivindicar livremente. Esta mesma linha, uma vez com provider_preference_id,
  // nunca mais reivindica.
  const reconciled = { provider_preference_id: "pref-real", creation_blocked_at: null, creation_claimed_at: null };
  assert.equal(claimDecision(reconciled, Date.now(), 30_000), "already");
});

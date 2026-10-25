// Prova, contra um Postgres de verdade (PGlite), o que
// 0021_pulse_subscription_one_per_user.sql promete: uma pessoa sem clínica
// ainda (organization_id null) não consegue ter duas linhas vivas de
// subscriptions ao mesmo tempo — a lacuna que o ecc:database-reviewer achou
// na correção de concorrência de 0020 (a reserva é por linha, não por
// pessoa). Nenhum código de lib/flow/billing.ts é usado aqui — só o SQL.
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { freshDb } from "./run.mjs";

async function seedUser(db) {
  const userId = randomUUID();
  await db.query("insert into auth.users (id, email) values ($1, $2)", [userId, `${userId}@exemplo.invalido`]);
  return userId;
}

async function insertSub(db, { userId, orgId = null, status }) {
  const id = randomUUID();
  await db.query("insert into subscriptions (id, user_id, organization_id, status) values ($1, $2, $3, $4)", [id, userId, orgId, status]);
  return id;
}

test("duas linhas 'pending' sem clínica para a mesma pessoa violam o índice novo", async () => {
  const db = await freshDb();
  const userId = await seedUser(db);

  await insertSub(db, { userId, status: "pending" });
  await assert.rejects(() => insertSub(db, { userId, status: "pending" }), /unique|duplicate/i);
});

test("'active' depois de 'pending' para a mesma pessoa sem clínica também viola — não é só o status inicial", async () => {
  const db = await freshDb();
  const userId = await seedUser(db);

  await insertSub(db, { userId, status: "active" });
  await assert.rejects(() => insertSub(db, { userId, status: "pending" }), /unique|duplicate/i);
});

test("duas linhas 'rejected' sem clínica para a mesma pessoa não violam — uma recusa libera a próxima tentativa", async () => {
  const db = await freshDb();
  const userId = await seedUser(db);

  await insertSub(db, { userId, status: "rejected" });
  await insertSub(db, { userId, status: "rejected" }); // não deve lançar

  const { rows } = await db.query("select count(*)::int as n from subscriptions where user_id = $1 and status = 'rejected'", [userId]);
  assert.equal(rows[0].n, 2);
});

test("'rejected' seguida de uma 'pending' nova para a mesma pessoa não viola — a correção de 0020 continua liberando retentativa", async () => {
  const db = await freshDb();
  const userId = await seedUser(db);

  await insertSub(db, { userId, status: "rejected" });
  await insertSub(db, { userId, status: "pending" }); // não deve lançar: é exatamente o caso que 0020 existe para permitir
});

test("mesma pessoa, uma linha sem clínica e outra já com clínica: índices diferentes, nenhum conflito entre eles", async () => {
  const db = await freshDb();
  const userId = await seedUser(db);
  const orgId = randomUUID();
  await db.query("insert into organizations (id, name) values ($1, 'clínica fictícia')", [orgId]);

  await insertSub(db, { userId, orgId: null, status: "cancelled" }); // histórico pré-onboarding, já cancelado
  await insertSub(db, { userId, orgId, status: "active" }); // não deve lançar: organization_id not null usa o outro índice (0020)

  const { rows } = await db.query("select count(*)::int as n from subscriptions where user_id = $1", [userId]);
  assert.equal(rows[0].n, 2);
});

test("duas pessoas diferentes, cada uma sem clínica: não competem entre si", async () => {
  const db = await freshDb();
  const userA = await seedUser(db);
  const userB = await seedUser(db);

  await insertSub(db, { userId: userA, status: "pending" });
  await insertSub(db, { userId: userB, status: "pending" }); // não deve lançar
});

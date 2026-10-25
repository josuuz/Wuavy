// Prova, contra um Postgres de verdade (PGlite), as duas afirmações que o
// próprio cabeçalho de 0020_pulse_subscription_claim.sql faz: que o índice
// "uma assinatura viva por clínica" ajustado deixa 'rejected' de fora (duas
// linhas 'rejected' no mesmo organization_id não violam nada), e que o check
// constraint de status aceita 'rejected' sem deixar passar lixo. Nenhum
// código de lib/flow/billing.ts é usado aqui — é só o SQL da migration.
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { freshDb } from "./run.mjs";

async function seedOrg(db) {
  const userId = randomUUID();
  const orgId = randomUUID();
  await db.query("insert into auth.users (id, email) values ($1, $2)", [userId, `${userId}@exemplo.invalido`]);
  await db.query("insert into organizations (id, name) values ($1, 'clínica fictícia')", [orgId]);
  return { userId, orgId };
}

async function insertSub(db, { userId, orgId, status }) {
  const id = randomUUID();
  await db.query(
    "insert into subscriptions (id, user_id, organization_id, status) values ($1, $2, $3, $4)",
    [id, userId, orgId, status],
  );
  return id;
}

test("duas linhas 'rejected' no mesmo organization_id não violam o índice", async () => {
  const db = await freshDb();
  const { userId, orgId } = await seedOrg(db);

  await insertSub(db, { userId, orgId, status: "rejected" });
  await insertSub(db, { userId, orgId, status: "rejected" }); // não deve lançar

  const { rows } = await db.query("select count(*)::int as n from subscriptions where organization_id = $1 and status = 'rejected'", [orgId]);
  assert.equal(rows[0].n, 2);
});

test("controle: duas linhas 'active' no mesmo organization_id violam o índice, como sempre violaram", async () => {
  const db = await freshDb();
  const { userId, orgId } = await seedOrg(db);

  await insertSub(db, { userId, orgId, status: "active" });
  await assert.rejects(() => insertSub(db, { userId, orgId, status: "active" }), /unique|duplicate/i);
});

test("o check constraint aceita 'rejected' e continua recusando lixo", async () => {
  const db = await freshDb();
  const { userId, orgId } = await seedOrg(db);

  await insertSub(db, { userId, orgId: null, status: "rejected" }); // não deve lançar
  await assert.rejects(
    () => insertSub(db, { userId, orgId: null, status: "qualquer-coisa" }),
    /check/i,
  );
});

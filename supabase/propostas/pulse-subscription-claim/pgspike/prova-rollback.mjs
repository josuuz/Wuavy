// Prova que reverter-0020-subscription-claim.sql reverte de verdade (aplicar
// -> reverter -> reaplicar, numa tabela vazia) e prova o risco que o próprio
// cabeçalho do script descreve: reverter com uma linha 'rejected' já
// existente deve falhar, não apagar em silêncio o que ela significa.
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { freshDb } from "./run.mjs";

const PROP = path.resolve(import.meta.dirname, "..");
const read = (p) => fs.readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const strip = (sql) => sql.split("\n").filter((l) => !/^\s*\\/.test(l)).join("\n");

const MIGRATION_0020 = strip(read(path.join(PROP, "..", "..", "migrations", "0020_pulse_subscription_claim.sql")));
const REVERT_0020 = strip(read(path.join(PROP, "reverter-0020-subscription-claim.sql")));

test("0020 aplica, reverte e reaplica sem erro, numa tabela vazia", async () => {
  // freshDb() já aplica 0001..0020; para testar a reversão isoladamente,
  // reverte e reaplica a 0020 em cima disso.
  const db = await freshDb();
  await db.exec(REVERT_0020);
  await db.exec(MIGRATION_0020); // não deve lançar
  const { rows } = await db.query(
    "select column_name from information_schema.columns where table_name = 'subscriptions' and column_name = 'creation_claimed_at'",
  );
  assert.equal(rows.length, 1, "a coluna voltou depois de reaplicar");
});

test("reverter com uma linha 'rejected' já existente FALHA ao recriar o check constraint antigo", async () => {
  const db = await freshDb();
  const userId = randomUUID();
  const orgId = randomUUID();
  await db.query("insert into auth.users (id, email) values ($1, $2)", [userId, `${userId}@exemplo.invalido`]);
  await db.query("insert into organizations (id, name) values ($1, 'clínica fictícia')", [orgId]);
  await db.query(
    "insert into subscriptions (id, user_id, organization_id, status) values ($1, $2, $3, 'rejected')",
    [randomUUID(), userId, orgId],
  );

  await assert.rejects(() => db.exec(REVERT_0020), /check/i, "o constraint antigo não lista 'rejected' — a reversão precisa falhar, não apagar em silêncio");

  // O BEGIN...COMMIT do script falhou a meio e o Postgres deixa a sessão em
  // "transação abortada" até um ROLLBACK explícito — é assim que qualquer
  // sessão real se comporta, não uma particularidade do PGlite. Sem isto, a
  // consulta de verificação abaixo falharia com "current transaction is
  // aborted", mascarando o que de fato importa: nada do que a 0020 criou foi
  // perdido, porque a transação nunca chegou a COMMIT.
  await db.query("rollback");

  // E a linha original continua lá, intacta: a transação do rollback script falhou e desfez tudo.
  const { rows } = await db.query("select status from subscriptions where organization_id = $1", [orgId]);
  assert.equal(rows[0].status, "rejected");
});

test("reverter com uma 'rejected' PAREADA a uma linha viva no mesmo organization_id também falha, no mesmo ponto documentado", async () => {
  // Achado da revisão independente: este é o caso realista que a 0020 existe
  // para permitir (uma clínica tenta de novo depois de uma recusa) — e, na
  // ordem antiga do script, violaria o índice antes de chegar ao check
  // constraint, com um erro diferente do que o cabeçalho documenta. Depois
  // de reordenar (check constraint primeiro), os dois casos falham no mesmo
  // ponto.
  const db = await freshDb();
  const userId = randomUUID();
  const orgId = randomUUID();
  await db.query("insert into auth.users (id, email) values ($1, $2)", [userId, `${userId}@exemplo.invalido`]);
  await db.query("insert into organizations (id, name) values ($1, 'clínica fictícia')", [orgId]);
  await db.query(
    "insert into subscriptions (id, user_id, organization_id, status) values ($1, $2, $3, 'rejected')",
    [randomUUID(), userId, orgId],
  );
  await db.query(
    "insert into subscriptions (id, user_id, organization_id, status) values ($1, $2, $3, 'pending')",
    [randomUUID(), userId, orgId],
  );

  await assert.rejects(() => db.exec(REVERT_0020), /check/i, "falha no check constraint, não no índice — o par 'rejected'+viva nunca deveria violar o índice antigo antes de chegar lá");
  await db.query("rollback");

  const { rows } = await db.query("select status from subscriptions where organization_id = $1 order by status", [orgId]);
  assert.deepEqual(rows.map((r) => r.status), ["pending", "rejected"], "as duas linhas continuam intactas");
});

// Prova, contra um Postgres de verdade (PGlite, em memória), o que
// 0023_clinavy_subscription_payer_email.sql promete:
//   - aplica por cima de um banco que JÁ TEM assinaturas, sem tocar nelas;
//   - a coluna é opcional e as linhas de antes ficam null;
//   - o CHECK recusa o e-mail torto e aceita null e o válido;
//   - as garantias de unicidade das 0020/0021 continuam de pé;
//   - a RLS não muda: lê quem lia, e o papel authenticated continua sem escrever;
//   - a reversão documentada na própria migration funciona e não perde dado.
// Nada aqui toca o Supabase remoto. NÃO substitui a validação no projeto de
// TESTE: prova o SQL, não o ambiente.
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { applyFile, dbBefore0023, freshDb } from "./run.mjs";

const FILE = "0023_clinavy_subscription_payer_email.sql";

async function seedUser(db) {
  const id = randomUUID();
  await db.query("insert into auth.users (id, email) values ($1, $2)", [id, `${id}@exemplo.invalido`]);
  return id;
}

async function insertSub(db, { userId, status = "pending", orgId = null, payer }) {
  const id = randomUUID();
  const hasPayer = payer !== undefined;
  await db.query(
    `insert into subscriptions (id, user_id, organization_id, status${hasPayer ? ", payer_email" : ""}) values ($1, $2, $3, $4${hasPayer ? ", $5" : ""})`,
    hasPayer ? [id, userId, orgId, status, payer] : [id, userId, orgId, status],
  );
  return id;
}

/** Roda como o papel e o usuário indicados, e volta ao papel de dono ao fim. */
async function as(db, role, userId, run) {
  await db.exec(`set role ${role}`);
  // A chave anônima do Supabase não tem "sub": auth.uid() é nulo. Simular anon COM um sub seria outro papel.
  await db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify(userId ? { sub: userId, role } : { role })]);
  try {
    return await run();
  } finally {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claims', '', false)");
  }
}

test("aplica por cima de um banco que já tem assinaturas, sem tocar nelas", async () => {
  const db = await dbBefore0023();
  const userId = await seedUser(db);
  const ativa = await insertSub(db, { userId, status: "active" });
  const cancelada = await insertSub(db, { userId, status: "cancelled" });
  const antes = (await db.query("select * from subscriptions order by id")).rows;

  await applyFile(db, FILE);

  const { rows: depois } = await db.query("select * from subscriptions order by id");
  assert.equal(depois.length, antes.length, "nenhuma linha a mais, nenhuma a menos");
  for (const row of depois) {
    const { payer_email, ...resto } = row;
    assert.equal(payer_email, null, "as linhas de antes ficam com pagador null");
    assert.deepEqual(resto, antes.find((a) => a.id === row.id), `a linha ${row.id} é idêntica fora da coluna nova`);
  }
  assert.deepEqual(depois.map((r) => r.id).sort(), [ativa, cancelada].sort());
});

test("a coluna é opcional: inserir sem pagador continua valendo, como o código de antes fazia", async () => {
  const db = await freshDb();
  const userId = await seedUser(db);
  const id = await insertSub(db, { userId });
  const { rows } = await db.query("select payer_email from subscriptions where id = $1", [id]);
  assert.equal(rows[0].payer_email, null);
});

test("o tipo e a anulabilidade são os prometidos", async () => {
  const db = await freshDb();
  const { rows } = await db.query(
    "select data_type, is_nullable from information_schema.columns where table_name = 'subscriptions' and column_name = 'payer_email'",
  );
  assert.deepEqual(rows, [{ data_type: "text", is_nullable: "YES" }]);
});

test("o CHECK aceita um e-mail válido, e o limite de 254 caracteres", async () => {
  const db = await freshDb();
  const userId = await seedUser(db);
  await insertSub(db, { userId, status: "rejected", payer: "pessoa@exemplo.com.br" });
  const limite = "a".repeat(254 - "@x.co".length) + "@x.co"; // exatamente 254
  assert.equal(limite.length, 254);
  await insertSub(db, { userId, status: "rejected", payer: limite });
});

test("o CHECK recusa o e-mail torto: espaço nas pontas, curto demais, longo demais", async () => {
  const db = await freshDb();
  const userId = await seedUser(db);
  for (const torto of [" pessoa@exemplo.com", "pessoa@exemplo.com ", "\tpessoa@exemplo.com", "ab", "", "a".repeat(255)]) {
    await assert.rejects(
      () => insertSub(db, { userId, status: "rejected", payer: torto }),
      /subscriptions_payer_email_shape|check/i,
      JSON.stringify(torto.slice(0, 20)),
    );
  }
});

test("as garantias de unicidade das 0020/0021 continuam de pé com a coluna nova", async () => {
  const db = await freshDb();
  const userId = await seedUser(db);
  await insertSub(db, { userId, status: "pending", payer: "a@exemplo.com" });
  await assert.rejects(() => insertSub(db, { userId, status: "pending", payer: "b@exemplo.com" }), /unique|duplicate/i, "duas vivas para a mesma pessoa");
  await insertSub(db, { userId, status: "cancelled", payer: "a@exemplo.com" });
  await insertSub(db, { userId, status: "rejected", payer: "a@exemplo.com" });
});

test("RLS: a pessoa lê o pagador da própria assinatura e não o de outra", async () => {
  const db = await freshDb();
  const eu = await seedUser(db);
  const outra = await seedUser(db);
  await insertSub(db, { userId: eu, payer: "eu@exemplo.com" });
  await insertSub(db, { userId: outra, payer: "outra@exemplo.com" });

  const vistas = await as(db, "authenticated", eu, async () => (await db.query("select payer_email from subscriptions")).rows);
  assert.deepEqual(vistas, [{ payer_email: "eu@exemplo.com" }], "só a própria linha");

  const anonimo = await as(db, "anon", null, async () => {
    try {
      return (await db.query("select payer_email from subscriptions")).rows;
    } catch {
      return []; // negado por privilégio ou por RLS: ambos são "não vê"
    }
  });
  assert.deepEqual(anonimo, [], "anon não lê nada");
});

test("privilégios: authenticated e anon só leem — a escrita foi revogada (a segunda trava)", async () => {
  const db = await freshDb();
  const priv = async (role, op) => (await db.query("select has_table_privilege($1, 'subscriptions', $2) as ok", [role, op])).rows[0].ok;
  for (const role of ["authenticated", "anon"]) {
    for (const op of ["INSERT", "UPDATE", "DELETE"]) assert.equal(await priv(role, op), false, `${role} sem ${op}`);
  }
  assert.equal(await priv("authenticated", "SELECT"), true, "authenticated ainda lê (a política decide quais linhas)");
  for (const op of ["INSERT", "UPDATE", "DELETE", "SELECT"]) assert.equal(await priv("service_role", op), true, `o servidor mantém ${op}`);
});

test("RLS + privilégio: authenticated não escreve — nem o pagador, nem o status, nem apaga, nem insere", async () => {
  const db = await freshDb();
  const eu = await seedUser(db);
  const id = await insertSub(db, { userId: eu, payer: "eu@exemplo.com" });

  await as(db, "authenticated", eu, async () => {
    for (const [sql, params] of [
      ["update subscriptions set payer_email = 'atacante@exemplo.com' where id = $1", [id]],
      ["update subscriptions set status = 'active' where id = $1", [id]],
      ["delete from subscriptions where id = $1", [id]],
      ["insert into subscriptions (user_id, status, payer_email) values ($1, 'active', 'x@exemplo.com')", [eu]],
    ]) {
      await assert.rejects(() => db.query(sql, params), /permission denied/i, sql);
    }
  });

  const { rows } = await db.query("select payer_email, status from subscriptions where id = $1", [id]);
  assert.deepEqual(rows, [{ payer_email: "eu@exemplo.com", status: "pending" }], "a linha ficou exatamente como estava");
});

test("as duas travas são independentes: devolvido o privilégio, a RLS sozinha ainda nega a escrita", async () => {
  // O ponto da segunda trava: se um dia alguém devolver o privilégio por engano, a
  // ausência de política continua protegendo — e o inverso também.
  const db = await freshDb();
  const eu = await seedUser(db);
  const id = await insertSub(db, { userId: eu, payer: "eu@exemplo.com" });
  await db.exec("grant insert, update, delete on subscriptions to authenticated");

  await as(db, "authenticated", eu, async () => {
    const update = await db.query("update subscriptions set payer_email = 'atacante@exemplo.com' where id = $1 returning id", [id]);
    assert.equal(update.rows.length, 0, "sem política, o update não afeta linha nenhuma");
    const del = await db.query("delete from subscriptions where id = $1 returning id", [id]);
    assert.equal(del.rows.length, 0, "nem apagar");
    await assert.rejects(
      () => db.query("insert into subscriptions (user_id, status, payer_email) values ($1, 'active', 'x@exemplo.com')", [eu]),
      /row-level security|policy/i,
      "nem inserir",
    );
  });

  const { rows } = await db.query("select payer_email from subscriptions where id = $1", [id]);
  assert.equal(rows[0].payer_email, "eu@exemplo.com");
});

test("o servidor (service_role) escreve normalmente", async () => {
  const db = await freshDb();
  const userId = await seedUser(db);
  const id = await insertSub(db, { userId, payer: "antes@exemplo.com" });
  await as(db, "service_role", userId, async () => {
    await db.query("update subscriptions set payer_email = 'depois@exemplo.com' where id = $1", [id]);
  });
  const { rows } = await db.query("select payer_email from subscriptions where id = $1", [id]);
  assert.equal(rows[0].payer_email, "depois@exemplo.com");
});

test("a reversão documentada na migration remove a coluna e a restrição, e preserva o resto", async () => {
  const db = await freshDb();
  const userId = await seedUser(db);
  const id = await insertSub(db, { userId, status: "active", payer: "x@exemplo.com" });

  await db.exec("alter table subscriptions drop column payer_email");

  const { rows } = await db.query("select id, status from subscriptions where id = $1", [id]);
  assert.deepEqual(rows, [{ id, status: "active" }], "a assinatura segue ali");
  const constraint = await db.query("select 1 from pg_constraint where conname = 'subscriptions_payer_email_shape'");
  assert.equal(constraint.rows.length, 0, "a restrição saiu junto com a coluna");
  // E dá para reaplicar a migration depois da reversão.
  await applyFile(db, FILE);
  const again = await db.query("select payer_email from subscriptions where id = $1", [id]);
  assert.equal(again.rows[0].payer_email, null);
});

test("aplicar a migration duas vezes falha de forma limpa, sem corromper nada", async () => {
  const db = await freshDb();
  const userId = await seedUser(db);
  await insertSub(db, { userId, status: "active", payer: "x@exemplo.com" });
  await assert.rejects(() => applyFile(db, FILE), /already exists|já existe/i);
  const { rows } = await db.query("select payer_email from subscriptions");
  assert.deepEqual(rows, [{ payer_email: "x@exemplo.com" }]);
});

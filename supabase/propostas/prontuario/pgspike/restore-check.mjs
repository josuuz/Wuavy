// Valida que o backup é restaurável: levanta um Postgres em memória (PGlite),
// aplica bootstrap + migrations 0001–0013 do repositório, restaura o backup e
// confere contagens, paridade de colunas e integridade referencial.
// Não há rede: nada aqui toca produção nem o projeto de testes.
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";

const REPO = "C:/Users/User/Wuavy web";
const SPIKE = path.resolve(import.meta.dirname);
const BK = process.argv[2];
if (!BK) {
  console.error("uso: restore-check.mjs <pasta-do-backup>");
  process.exit(1);
}

const BACKSLASH = String.fromCharCode(92);
const read = (p) => fs.readFileSync(p, "utf8").split("\r\n").join("\n");
// psql meta-commands (\set …) não existem fora do psql.
const strip = (s) =>
  s
    .split("\n")
    .filter((l) => l.trimStart()[0] !== BACKSLASH)
    .join("\n");
const noPgcrypto = (s) =>
  s.replace(/create extension if not exists\s+"?pgcrypto"?\s*;/gi, "-- [harness] pgcrypto: gen_random_uuid() é do núcleo;");

const db = await PGlite.create();
let fail = 0;
const ok = (cond, msg) => {
  console.log(`  ${cond ? "ok    " : "FALHOU"}  ${msg}`);
  if (!cond) fail += 1;
};

// ── esquema, só do que já está no repositório ──────────────────
await db.exec(noPgcrypto(strip(read(path.join(SPIKE, "bootstrap.sql")))));
const migs = fs
  .readdirSync(path.join(REPO, "supabase/migrations"))
  .filter((f) => f.endsWith(".sql"))
  .sort();
for (const f of migs) await db.exec(noPgcrypto(strip(read(path.join(REPO, "supabase/migrations", f)))));
console.log(`esquema: bootstrap + ${migs.length} migrations (${migs[0]} … ${migs.at(-1)})\n`);

const manifest = JSON.parse(read(path.join(BK, "manifest.json")));

const colsOf = async (schema, table) => {
  const r = await db.query(
    `select column_name, data_type from information_schema.columns
      where table_schema = $1 and table_name = $2`,
    [schema, table],
  );
  return new Map(r.rows.map((c) => [c.column_name, c]));
};
const ser = (v, col) => {
  if (v === null || v === undefined) return null;
  const t = col ? col.data_type : "";
  if (t === "jsonb" || t === "json") return JSON.stringify(v);
  if (t === "ARRAY") return v;
  if (typeof v === "object") return JSON.stringify(v);
  return v;
};

const insert = async (schema, table, rows, cols) => {
  for (const r of rows) {
    const keys = Object.keys(r).filter((k) => cols.has(k));
    const names = keys.map((k) => `"${k}"`).join(", ");
    const holes = keys.map((_, i) => `$${i + 1}`).join(", ");
    await db.query(
      `insert into ${schema}."${table}" (${names}) values (${holes})`,
      keys.map((k) => ser(r[k], cols.get(k))),
    );
  }
};

// Um restore de verdade carrega os dados com os gatilhos desligados — é o que
// `pg_dump --disable-triggers` faz. Sem isso, restaurar auth.users dispara
// pulse_profile_on_signup (0005) e a linha de profiles do backup colide com a
// que o gatilho acabou de criar. `replica` também suspende a checagem de FK,
// então a ordem de carga deixa de importar; a integridade é conferida no fim,
// sobre os dados já restaurados.
await db.exec("set session_replication_role = 'replica'");

// ── auth.users primeiro: quase tudo referencia ─────────────────
const users = JSON.parse(read(path.join(BK, "auth-users.json")));
await insert("auth", "users", users, await colsOf("auth", "users"));
ok(users.length === manifest.auth.users, `auth.users restauradas: ${users.length}/${manifest.auth.users}`);

// ── ordem topológica pelas chaves estrangeiras reais ───────────
const tables = Object.keys(manifest.tables);
const deps = await db.query(`
  select c.relname as child, f.relname as parent
    from pg_constraint k
    join pg_class c on c.oid = k.conrelid
    join pg_class f on f.oid = k.confrelid
   where k.contype = 'f'
     and c.relnamespace = 'public'::regnamespace
     and f.relnamespace = 'public'::regnamespace`);
const edges = new Map(tables.map((t) => [t, new Set()]));
for (const d of deps.rows) {
  if (edges.has(d.child) && tables.includes(d.parent) && d.child !== d.parent) edges.get(d.child).add(d.parent);
}
const order = [];
const done = new Set();
const visit = (t, stack) => {
  if (done.has(t) || stack.has(t)) return;
  stack.add(t);
  for (const p of edges.get(t) || []) visit(p, stack);
  stack.delete(t);
  done.add(t);
  order.push(t);
};
for (const t of tables) visit(t, new Set());

// ── restaura, conferindo paridade de colunas no caminho ────────
let total = 0;
const drift = [];
for (const t of order) {
  const rows = JSON.parse(read(path.join(BK, "tables", `${t}.json`)));
  const cols = await colsOf("public", t);
  if (rows.length) {
    const missing = Object.keys(rows[0]).filter((c) => !cols.has(c));
    if (missing.length) drift.push(`${t}: produção tem colunas que as migrations não criam -> ${missing.join(", ")}`);
  }
  await insert("public", t, rows, cols);
  total += rows.length;
}

await db.exec("set session_replication_role = 'origin'");

console.log("");
let mismatch = 0;
for (const t of tables) {
  const got = Number((await db.query(`select count(*)::int as n from public."${t}"`)).rows[0].n);
  const want = manifest.tables[t].exported;
  if (got !== want) {
    console.log(`  FALHOU  ${t}: restaurado ${got}, backup ${want}`);
    mismatch += 1;
    fail += 1;
  }
}
ok(mismatch === 0, `contagens idênticas em ${tables.length} tabelas (${total} linhas)`);
ok(
  drift.length === 0,
  drift.length
    ? `DERIVA DE ESQUEMA:\n            ${drift.join("\n            ")}`
    : "nenhuma deriva de esquema entre produção e as migrations",
);

// ── e as chaves estrangeiras valem sobre os dados restaurados ──
// `alter table … validate constraint` não serve aqui: numa constraint já válida
// é um no-op e passaria de graça. A pergunta certa é se sobrou órfão, então cada
// chave é conferida com a consulta correspondente, em semântica MATCH SIMPLE
// (linha com qualquer coluna nula não é checada, como no Postgres).
const fks = (
  await db.query(`
  select k.conname,
         k.conrelid::regclass::text  as child,
         k.confrelid::regclass::text as parent,
         (select array_agg(a.attname order by u.ord)
            from unnest(k.conkey) with ordinality u(attnum, ord)
            join pg_attribute a on a.attrelid = k.conrelid and a.attnum = u.attnum) as childcols,
         (select array_agg(a.attname order by u.ord)
            from unnest(k.confkey) with ordinality u(attnum, ord)
            join pg_attribute a on a.attrelid = k.confrelid and a.attnum = u.attnum) as parentcols
    from pg_constraint k
   where k.contype = 'f'
     and k.conrelid::regclass::text in (
       select quote_ident(table_name) from information_schema.tables where table_schema = 'public')`)
).rows;

let orphans = 0;
for (const c of fks) {
  const cc = c.childcols;
  const pc = c.parentcols;
  const join = cc.map((col, i) => `p."${pc[i]}" = c."${col}"`).join(" and ");
  const notNull = cc.map((col) => `c."${col}" is not null`).join(" and ");
  const r = await db.query(`
    select count(*)::int as n from ${c.child} c
     where ${notNull}
       and not exists (select 1 from ${c.parent} p where ${join})`);
  const n = Number(r.rows[0].n);
  if (n > 0) {
    console.log(`  FALHOU  ${c.conname} (${c.child} -> ${c.parent}): ${n} órfã(s)`);
    orphans += n;
    fail += 1;
  }
}
ok(orphans === 0, `${fks.length} chaves estrangeiras sem órfãos sobre os dados restaurados`);

console.log(`\n${fail === 0 ? "BACKUP RESTAURÁVEL E VALIDADO" : `BACKUP NÃO VALIDADO: ${fail} falha(s)`}`);
process.exit(fail === 0 ? 0 : 1);

// Monta um Postgres efêmero em memória (PGlite) com o andaime do Supabase e as
// migrations do repositório. Lê os arquivos; não escreve em nenhum. Nada aqui
// toca o Supabase remoto: não há rede envolvida. Mesmo andaime de
// supabase/propostas/pulse-subscription-claim/pgspike/run.mjs, com a raiz do
// repositório calculada a partir deste arquivo (não fixada num caminho).
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";

const HERE = import.meta.dirname;
const REPO = path.resolve(HERE, "../../../..");
const MIGRATIONS = path.join(REPO, "supabase/migrations");

const read = (p) => fs.readFileSync(p, "utf8").replace(/\r\n/g, "\n");
// psql meta-commands (\set …) não existem fora do psql.
const strip = (sql) => sql.split("\n").filter((l) => !/^\s*\\/.test(l)).join("\n");
// DIVERGÊNCIA DECLARADA: o PGlite não traz pgcrypto. As migrations só a pedem por
// gen_random_uuid(), do núcleo desde o PG 13. A linha é comentada; nada mais muda.
const noPgcrypto = (sql) =>
  sql.replace(/create extension if not exists\s+"?pgcrypto"?\s*;/gi, "-- [harness] pgcrypto: gen_random_uuid() é do núcleo;");

export const migrationFiles = () => fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort();

export async function applyFile(db, file) {
  await db.exec(noPgcrypto(strip(read(path.join(MIGRATIONS, file)))));
}

/** Um PGlite novo com o andaime e as migrations de `files` aplicadas, na ordem. */
export async function dbWith(files) {
  const db = await PGlite.create();
  await db.exec(read(path.join(HERE, "bootstrap.sql")));
  for (const f of files) await applyFile(db, f);
  return db;
}

/** Tudo, como ficará depois da publicação. */
export const freshDb = () => dbWith(migrationFiles());

/** Tudo ANTES da 0023: o banco como está hoje em produção. */
export const dbBefore0023 = () => dbWith(migrationFiles().filter((f) => f < "0023"));

// Roda as migrações 0001–0020 num Postgres efêmero em memória (PGlite). Lê os
// arquivos do repositório; não escreve em nenhum deles. Nada aqui toca o
// Supabase remoto: não há rede envolvida. Adaptado de
// supabase/propostas/prontuario/pgspike/run.mjs: aqui a lista de migrations é
// lida do disco (não fixada em código), para que uma 0021 futura seja
// replayada sem editar este arquivo.
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const REPO = "C:/Users/User/wuavy-pulse-checkout-fix";
const HERE = import.meta.dirname;

const read = (p) => fs.readFileSync(p, "utf8").replace(/\r\n/g, "\n");
// psql meta-commands (\set …) não existem fora do psql.
const strip = (sql) => sql.split("\n").filter((l) => !/^\s*\\/.test(l)).join("\n");

// DIVERGÊNCIA DECLARADA: o PGlite não traz pgcrypto. As migrations só a pedem por
// gen_random_uuid(), do núcleo desde o PG 13, e nenhuma usa crypt/digest/hmac/pgp_*.
// A linha é comentada para a migration aplicar; nada mais do arquivo muda.
const noPgcrypto = (sql) =>
  sql.replace(/create extension if not exists\s+"?pgcrypto"?\s*;/gi, "-- [harness] pgcrypto: gen_random_uuid() é do núcleo;");

async function run(db, label, sql) {
  try {
    await db.exec(noPgcrypto(strip(sql)));
    console.log(`  aplicado  ${label}`);
    return true;
  } catch (e) {
    console.log(`  FALHOU    ${label}\n            ${String(e.message).split("\n")[0].slice(0, 200)}`);
    throw e;
  }
}

/** Um PGlite novo, com bootstrap.sql e todas as migrations de supabase/migrations/ (0001…a mais recente) já aplicadas. */
export async function freshDb() {
  const db = await PGlite.create();
  await run(db, "bootstrap.sql", read(path.join(HERE, "bootstrap.sql")));
  const existing = fs.readdirSync(path.join(REPO, "supabase/migrations")).filter((f) => f.endsWith(".sql")).sort();
  for (const f of existing) {
    await run(db, f, read(path.join(REPO, "supabase/migrations", f)));
  }
  return db;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  console.log("── andaime + migrations do projeto ─────────────────");
  await freshDb();
  console.log("\nChegou ao fim: todas as migrations aplicaram.");
}

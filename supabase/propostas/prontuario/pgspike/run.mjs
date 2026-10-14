// Roda as migrações e o teste de isolamento num Postgres efêmero em memória
// (PGlite). Lê os arquivos do repositório e da proposta; não escreve em nenhum
// dos dois. Nada aqui toca o Supabase remoto: não há rede envolvida.
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";

const REPO = "C:/Users/User/Wuavy web";
const PROP = path.resolve(import.meta.dirname, "..");
const HERE = import.meta.dirname;

const read = (p) => fs.readFileSync(p, "utf8").replace(/\r\n/g, "\n");
// psql meta-commands (\set …) não existem fora do psql.
const strip = (sql) => sql.split("\n").filter((l) => !/^\s*\\/.test(l)).join("\n");

// DIVERGÊNCIA DECLARADA: o PGlite não traz pgcrypto. As migrations só a pedem por
// gen_random_uuid(), do núcleo desde o PG 13, e nenhuma usa crypt/digest/hmac/pgp_*.
// A linha é comentada para a migration aplicar; nada mais do arquivo muda.
const noPgcrypto = (sql) =>
  sql.replace(/create extension if not exists\s+"?pgcrypto"?\s*;/gi, "-- [harness] pgcrypto: gen_random_uuid() é do núcleo;");

const db = await PGlite.create();
const notices = [];
let failures = 0;

async function run(label, sql) {
  try {
    await db.exec(noPgcrypto(strip(sql)));
    console.log(`  aplicado  ${label}`);
    return true;
  } catch (e) {
    console.log(`  FALHOU    ${label}\n            ${String(e.message).split("\n")[0].slice(0, 200)}`);
    failures += 1;
    return false;
  }
}

console.log("── andaime ────────────────────────────────────────");
if (!(await run("bootstrap.sql", read(path.join(HERE, "bootstrap.sql"))))) process.exit(1);

console.log("── migrations do projeto (0001–0013) ──────────────");
const existing = fs.readdirSync(path.join(REPO, "supabase/migrations")).filter((f) => f.endsWith(".sql")).sort();
for (const f of existing) {
  if (!(await run(f, read(path.join(REPO, "supabase/migrations", f))))) {
    console.log("\nParando: uma migration existente não aplicou. O andaime não reproduz o Supabase o bastante.");
    process.exit(1);
  }
}

console.log("── proposta (0014–0016) ───────────────────────────");
for (const f of ["0014_anamnesis.sql", "0015_clinical_evolution.sql", "0016_clinical_attachments.sql"]) {
  if (!(await run(f, read(path.join(PROP, f))))) {
    console.log("\nParando: a proposta não aplica. Corrigir antes de testar.");
    process.exit(1);
  }
}

console.log("── teste de isolamento ────────────────────────────");
// As asserções falam por RAISE NOTICE; PGlite entrega isso no onNotice.
const sql = strip(read(path.join(PROP, "teste-isolamento.sql")));
let crashed = null;
try {
  await db.exec(sql, { onNotice: (n) => notices.push(n.message ?? String(n)) });
} catch (e) {
  crashed = String(e.message).split("\n")[0];
}

const ok = notices.filter((m) => m.startsWith("ok:"));
const ctrl = notices.filter((m) => m.startsWith("controle:"));
for (const m of notices) console.log("  " + m);
if (crashed) console.log(`\n  INTERROMPIDO: ${crashed}`);

console.log("\n── resumo ─────────────────────────────────────────");
console.log(`  asserções aprovadas: ${ok.length}`);
console.log(`  controles de fixture: ${ctrl.length}`);
console.log(`  interrompido em: ${crashed ?? "nada — chegou ao fim"}`);
process.exit(crashed ? 1 : 0);

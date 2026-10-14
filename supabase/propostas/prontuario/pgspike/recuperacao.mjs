// Valida a reversão de privilégios da 0015 num Postgres efêmero em memória
// (PGlite). Nada de rede: nem o Supabase de produção nem o de testes é tocado.
//
// A pergunta: depois de aplicar 0014–0016 e rodar reverter-0015-privilegios.sql,
// o ACL de clinical_records volta a ser EXATAMENTE o de antes da 0015?
// E reaplicar a seção 5 devolve o estado publicado?
//
// Lê os arquivos de supabase/migrations (0001–0013) e de
// supabase/propostas/prontuario (0014–0016 e a reversão). Não escreve em nenhum.
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";

const REPO = "C:/Users/User/Wuavy web";
const PROP = path.join(REPO, "supabase/propostas/prontuario");
const HERE = import.meta.dirname;

const read = (p) => fs.readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const strip = (sql) => sql.split("\n").filter((l) => !/^\s*\\/.test(l)).join("\n");
const noPgcrypto = (sql) =>
  sql.replace(/create extension if not exists\s+"?pgcrypto"?\s*;/gi, "-- [harness] pgcrypto;");

const db = await PGlite.create();
const run = async (label, sql) => {
  try {
    await db.exec(noPgcrypto(strip(sql)));
    return true;
  } catch (e) {
    console.log(`  FALHOU  ${label}: ${String(e.message).split("\n")[0].slice(0, 160)}`);
    process.exit(1);
  }
};

/**
 * O ACL de clinical_records, tabela e colunas, como o Postgres o guarda.
 * relacl/attacl são a verdade: o information_schema expande e reordena, o que
 * esconderia diferenças que importam. Aqui a comparação é sobre texto normalizado.
 */
async function acl() {
  const t = await db.query(`
    select coalesce(array_to_string(relacl, E'\\n'), '(nenhum)') as a
      from pg_class where relname = 'clinical_records' and relkind = 'r'`);
  const c = await db.query(`
    select a.attname, array_to_string(a.attacl, ', ') as acl
      from pg_attribute a join pg_class c on c.oid = a.attrelid
     where c.relname = 'clinical_records' and a.attacl is not null
     order by a.attname`);
  return {
    tabela: t.rows[0].a.split("\n").sort().join("\n"),
    colunas: c.rows.map((r) => `${r.attname}: ${r.acl}`).join("\n") || "(nenhum)",
  };
}

const ident = (s) => s.split("\n").map((l) => "     " + l).join("\n");
const mostra = (nome, x) =>
  console.log(`\n  [${nome}]\n   tabela:\n${ident(x.tabela)}\n   colunas:\n${ident(x.colunas)}`);

const igual = (a, b) => a.tabela === b.tabela && a.colunas === b.colunas;

let falhas = 0;
const assert = (cond, msg) => {
  console.log(`  ${cond ? "ok:" : "FALHOU:"} ${msg}`);
  if (!cond) falhas += 1;
};

console.log("── andaime e migrations publicadas (0001–0013) ────");
await run("bootstrap.sql", read(path.join(HERE, "bootstrap.sql")));
for (const f of fs.readdirSync(path.join(REPO, "supabase/migrations")).filter((f) => f.endsWith(".sql")).sort()) {
  await run(f, read(path.join(REPO, "supabase/migrations", f)));
}
const publicado = await acl();
mostra("estado publicado hoje, depois da 0013", publicado);

console.log("\n── proposta (0014–0016) ───────────────────────────");
await run("0014", read(path.join(PROP, "0014_anamnesis.sql")));
const depois0014 = await acl();
assert(igual(publicado, depois0014), "a 0014 não mexe no ACL de clinical_records (é aditiva)");

await run("0015", read(path.join(PROP, "0015_clinical_evolution.sql")));
const depois0015 = await acl();
await run("0016", read(path.join(PROP, "0016_clinical_attachments.sql")));
const depois0016 = await acl();
assert(igual(depois0015, depois0016), "a 0016 não mexe no ACL de clinical_records (é aditiva)");
mostra("depois da proposta inteira", depois0016);

assert(!igual(publicado, depois0015), "a 0015 de fato estreita os privilégios (senão não haveria o que reverter)");
assert(depois0015.colunas !== "(nenhum)", "a 0015 deixa privilégios de coluna para authenticated");

console.log("\n── reversão (reverter-0015-privilegios.sql) ───────");
await run("reverter-0015-privilegios.sql", read(path.join(PROP, "reverter-0015-privilegios.sql")));
const revertido = await acl();
mostra("depois da reversão", revertido);
assert(igual(revertido, publicado), "o ACL volta a ser IDÊNTICO ao de antes da 0015");
assert(revertido.colunas === "(nenhum)", "os privilégios de coluna da 0015 saíram junto (revoke on table limpa as colunas)");

console.log("\n── voltar ao estado publicado (seção 5 da 0015) ───");
// A seção 5 reaplicada sozinha, como o RECUPERACAO.md manda. Idempotente.
await run("0015 §5", `
  revoke insert, update on clinical_records from anon, authenticated;
  grant insert (
    id, organization_id, patient_id, recorded_at, chief_complaint, notes, appointment_id, procedure_id
  ) on clinical_records to authenticated;
  grant update (
    recorded_at, chief_complaint, notes, appointment_id, procedure_id
  ) on clinical_records to authenticated;`);
const devolta = await acl();
assert(igual(devolta, depois0015), "reaplicar a seção 5 devolve exatamente o estado da proposta");

console.log("\n── o que a reversão NÃO apaga ─────────────────────");
for (const t of ["anamneses", "anamnesis_revisions", "anamnesis_forms", "anamnesis_form_versions", "clinical_records", "clinical_record_revisions", "clinical_attachments"]) {
  const { rows } = await db.query(`select count(*)::int as n from ${t}`);
  assert(true, `${t} continua de pé (${rows[0].n} linhas)`);
}

console.log("\n── resumo ─────────────────────────────────────────");
console.log(`  falhas: ${falhas}`);
process.exit(falhas ? 1 : 0);

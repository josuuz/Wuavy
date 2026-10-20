/*
  Loader de módulo do Node (module.register —
  tests/billing-integration-real.test.mjs) que permite importar
  lib/billing/charges.ts de verdade, com o Supabase REAL (createAdminClient
  sem mock nenhum) — diferente de tests/helpers/charges-loader.mjs, que troca
  o Supabase por um FakeAdmin. Aqui só dois ajustes, os mesmos de sempre:

  - "@/x" vira o arquivo real em src/x (o Node não entende esse alias do
    tsconfig.json sozinho).
  - "server-only" vira um módulo vazio (só barra import em bundle de
    cliente; em Node puro não há nada para barrar).
  - imports relativos sem extensão ("./charge-status") ganham ".ts".

  Nenhum "@/lib/supabase/admin" é trocado aqui — o Supabase que
  lib/billing/charges.ts usa é o de verdade, apontado pelas variáveis de
  ambiente que o teste configura antes de importar (o projeto de TESTE).
*/

const projectRoot = new URL("../../", import.meta.url);
const HAS_EXTENSION = /\.(ts|tsx|js|mjs|cjs|json)$/;

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "server-only") return { url: "virtual:server-only", shortCircuit: true };
  if (specifier.startsWith("@/")) {
    const target = new URL(`src/${specifier.slice(2)}.ts`, projectRoot);
    return nextResolve(target.href, context);
  }
  if ((specifier.startsWith("./") || specifier.startsWith("../")) && !HAS_EXTENSION.test(specifier)) {
    try {
      return await nextResolve(`${specifier}.ts`, context);
    } catch {
      // segue para o resolvedor padrão com o especificador original.
    }
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (url === "virtual:server-only") return { format: "module", source: "export {};", shortCircuit: true };
  return nextLoad(url, context);
}

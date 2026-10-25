/*
  Loader de módulo do Node (module.register —
  tests/pulse-subscribe-claim-real.test.mjs) que permite importar
  lib/flow/billing.ts de verdade, com o Supabase REAL (createAdminClient sem
  mock nenhum) — a combinação de tests/helpers/real-pg-loader.mjs (não troca
  "@/lib/supabase/admin") com tests/helpers/pulse-loader.mjs (troca
  "@/lib/flow/session" por uma sessão/assinatura controláveis, porque login e
  cookies não são o que se prova aqui — a atomicidade do claim contra o
  Postgres de verdade é).

  - "@/x" vira o arquivo real em src/x.
  - "server-only" vira um módulo vazio.
  - "@/lib/flow/session" vira fake-session.mjs.
  - "next/navigation" vira um redirect() que lança, como o Next faz de
    verdade.

  Nenhum "@/lib/supabase/admin" é trocado aqui — o Supabase que
  lib/flow/billing.ts usa é o de verdade, apontado pelas variáveis de
  ambiente que o teste configura antes de importar (o projeto de TESTE).
*/

const projectRoot = new URL("../../", import.meta.url);
const fakeSessionUrl = new URL("./fake-session.mjs", import.meta.url).href;

const VIRTUAL = {
  "server-only": "virtual:server-only",
  "@/lib/flow/session": "virtual:flow-session",
  "next/navigation": "virtual:next-navigation",
};

const HAS_EXTENSION = /\.(ts|tsx|js|mjs|cjs|json)$/;

export async function resolve(specifier, context, nextResolve) {
  if (VIRTUAL[specifier]) return { url: VIRTUAL[specifier], shortCircuit: true };
  if (specifier.startsWith("@/")) {
    const target = new URL(`src/${specifier.slice(2)}.ts`, projectRoot);
    return nextResolve(target.href, context);
  }
  if ((specifier.startsWith("./") || specifier.startsWith("../")) && !HAS_EXTENSION.test(specifier)) {
    try {
      return await nextResolve(`${specifier}.ts`, context);
    } catch {
      // Segue para o resolvedor padrão com o especificador original.
    }
  }
  return nextResolve(specifier, context);
}

const SOURCES = {
  "virtual:server-only": "export {};",
  "virtual:flow-session": `export * from ${JSON.stringify(fakeSessionUrl)};`,
  "virtual:next-navigation": `
    export function redirect(path) {
      const error = new Error("NEXT_REDIRECT:" + path);
      error.__fakeRedirect = path;
      throw error;
    }
  `,
};

export async function load(url, context, nextLoad) {
  if (SOURCES[url]) return { format: "module", source: SOURCES[url], shortCircuit: true };
  return nextLoad(url, context);
}

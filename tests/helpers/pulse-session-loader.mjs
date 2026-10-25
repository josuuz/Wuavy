/*
  Loader de módulo do Node (module.register) que permite importar
  lib/flow/session.ts DE VERDADE num teste puro de Node — ao contrário de
  pulse-loader.mjs, que troca session.ts inteiro por um fake (fake-
  session.mjs) para testar a orquestração de subscribe()/check(). Aqui é
  justamente session.ts (getSubscription, getClinicAccess) que está sendo
  provado: só "server-only" e @/lib/supabase/server (cookies, Next) são
  trocados por um Supabase falso em memória (fake-server-client.mjs).
  "react" (cache) e ./access.ts seguem reais.
*/

const projectRoot = new URL("../../", import.meta.url);
const fakeServerUrl = new URL("./fake-server-client.mjs", import.meta.url).href;

const VIRTUAL = {
  "server-only": "virtual:server-only",
  "@/lib/supabase/server": "virtual:supabase-server",
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
  "virtual:supabase-server": `
    import { getFakeServerClient } from ${JSON.stringify(fakeServerUrl)};
    export async function createClient() { return getFakeServerClient(); }
  `,
};

export async function load(url, context, nextLoad) {
  if (SOURCES[url]) return { format: "module", source: SOURCES[url], shortCircuit: true };
  return nextLoad(url, context);
}

/*
  Loader de módulo do Node (module.register — tests/pulse-subscribe-
  integration.test.mjs) que permite importar pulse/assinar/actions.ts e
  lib/flow/billing.ts REAIS num teste puro de Node, sem o bundler do Next.
  Mesma ideia de tests/helpers/charges-loader.mjs (Cobranças):

  - "@/x" vira o arquivo real em src/x.
  - "server-only" vira um módulo vazio.
  - "@/lib/supabase/admin" vira o Supabase falso (fake-admin.mjs).
  - "next/navigation" vira um redirect() que lança, como o Next faz de
    verdade (o teste pode conferir que foi chamado pela mensagem).
  - "@/lib/flow/session" vira fake-session.mjs — login e cookies não são o
    que se prova aqui, a orquestração de subscribe()/check() é.

  Nenhuma chamada de rede, nenhum Supabase real, nenhuma credencial real em
  lugar nenhum deste arquivo.
*/

const projectRoot = new URL("../../", import.meta.url);
const fakeAdminUrl = new URL("./fake-admin.mjs", import.meta.url).href;
const fakeSessionUrl = new URL("./fake-session.mjs", import.meta.url).href;

const VIRTUAL = {
  "server-only": "virtual:server-only",
  "@/lib/supabase/admin": "virtual:supabase-admin",
  "next/navigation": "virtual:next-navigation",
  "@/lib/flow/session": "virtual:flow-session",
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
  "virtual:supabase-admin": `
    import { getFakeAdminClient } from ${JSON.stringify(fakeAdminUrl)};
    export function createAdminClient() { return getFakeAdminClient(); }
  `,
  "virtual:next-navigation": `
    export function redirect(path) {
      const error = new Error("NEXT_REDIRECT:" + path);
      error.__fakeRedirect = path;
      throw error;
    }
  `,
  "virtual:flow-session": `export * from ${JSON.stringify(fakeSessionUrl)};`,
};

export async function load(url, context, nextLoad) {
  if (SOURCES[url]) return { format: "module", source: SOURCES[url], shortCircuit: true };
  return nextLoad(url, context);
}

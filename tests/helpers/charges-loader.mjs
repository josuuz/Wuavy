/*
  Loader de módulo do Node (module.register — tests/billing-integration.test.mjs)
  que permite importar o lib/billing/charges.ts e o actions.ts REAIS num teste
  puro de Node, sem o bundler do Next.js:

  - "@/x" vira o arquivo real em src/x (o alias que o tsconfig.json declara;
    o Node sozinho não entende esse alias fora do Next).
  - "server-only" vira um módulo vazio (ele só barra import em bundle de
    cliente; em Node puro não há nada para barrar).
  - "@/lib/supabase/admin" vira o Supabase falso (fake-admin.mjs) — nunca o
    cliente real, nunca uma rede, nunca um projeto Supabase de verdade.
  - "next/cache" e "next/navigation" viram versões mínimas o bastante para
    actions.ts rodar fora do runtime do Next (revalidatePath vira no-op;
    redirect lança, como o Next faz de verdade).
  - "@/lib/maintenance/admin" vira um getAdmin() que sempre autoriza — o que
    se testa aqui é a lógica de cobrança, não o login do painel.

  Nenhuma chamada de rede, nenhum Supabase real, nenhuma credencial real em
  lugar nenhum deste arquivo.
*/

const projectRoot = new URL("../../", import.meta.url);
const fakeAdminUrl = new URL("./fake-admin.mjs", import.meta.url).href;

const VIRTUAL = {
  "server-only": "virtual:server-only",
  "@/lib/supabase/admin": "virtual:supabase-admin",
  "next/cache": "virtual:next-cache",
  "next/navigation": "virtual:next-navigation",
  "@/lib/maintenance/admin": "virtual:maintenance-admin",
};

const HAS_EXTENSION = /\.(ts|tsx|js|mjs|cjs|json)$/;

export async function resolve(specifier, context, nextResolve) {
  if (VIRTUAL[specifier]) return { url: VIRTUAL[specifier], shortCircuit: true };
  if (specifier.startsWith("@/")) {
    const target = new URL(`src/${specifier.slice(2)}.ts`, projectRoot);
    return nextResolve(target.href, context);
  }
  // O código fonte importa uns dos outros sem extensão ("./charge-status"),
  // como o TypeScript/Next permitem. O Node puro não resolve isso sozinho —
  // tenta .ts antes de deixar o resolvedor padrão decidir.
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
  "virtual:next-cache": `
    export function revalidatePath() {}
  `,
  "virtual:next-navigation": `
    export function redirect(path) {
      const error = new Error("NEXT_REDIRECT:" + path);
      error.__fakeRedirect = path;
      throw error;
    }
  `,
  "virtual:maintenance-admin": `
    export async function getAdmin() { return { email: "admin@teste.local" }; }
  `,
};

export async function load(url, context, nextLoad) {
  if (SOURCES[url]) return { format: "module", source: SOURCES[url], shortCircuit: true };
  return nextLoad(url, context);
}

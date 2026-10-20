/*
  Loader de módulo do Node (module.register — tests/billing-financial-access.test.mjs)
  que permite importar o lib/maintenance/admin.ts REAL num teste puro de Node,
  sem o runtime do Next.js.

  Mesma ideia do charges-loader.mjs, com uma diferença importante: aqui
  "@/lib/maintenance/admin" NÃO é substituído por um getAdmin() que sempre
  autoriza. É justamente o gate real que se quer provar — quem é administrador
  e quem não é. O que vira falso é só o que está embaixo dele:

  - "server-only" vira um módulo vazio (em Node puro não há bundle de cliente
    para ele barrar).
  - "@/lib/supabase/server" vira um createClient() cujo auth.getUser() devolve
    a sessão que o teste escolher, por TEST_SESSION_EMAIL (vazia = ninguém
    logado). Nenhuma rede, nenhum Supabase real, nenhuma credencial em lugar
    nenhum deste arquivo.
*/

const projectRoot = new URL("../../", import.meta.url);

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
    export async function createClient() {
      return {
        auth: {
          async getUser() {
            const email = process.env.TEST_SESSION_EMAIL;
            return { data: { user: email ? { email } : null } };
          },
        },
      };
    }
  `,
};

export async function load(url, context, nextLoad) {
  if (SOURCES[url]) return { format: "module", source: SOURCES[url], shortCircuit: true };
  return nextLoad(url, context);
}

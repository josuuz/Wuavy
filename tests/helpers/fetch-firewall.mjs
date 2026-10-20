/*
  O "firewall" de fetch dos testes com Postgres real
  (tests/billing-integration-real.test.mjs). Não existe aqui nenhuma
  substituição indiscriminada de global.fetch: cada requisição é inspecionada
  pelo host antes de decidir o que fazer com ela.

  - api.mercadopago.com: sempre simulado, por um handler que cada teste
    registra antes de precisar dele (setMpHandler). Sem handler registrado,
    a chamada falha alto — nunca cai silenciosamente para fora.
  - o host do Supabase de TESTE, conferido por igualdade exata de string
    contra o que foi passado em installFetchFirewall: vai para a rede de
    verdade (o próprio fetch original, nunca reescrito).
  - qualquer outro host (incluindo, explicitamente, o de produção) é
    bloqueado e lança — nunca chega a sair um pacote.
*/

export function installFetchFirewall({ testSupabaseHost, forbiddenHosts = [] }) {
  const realFetch = globalThis.fetch;
  if (!testSupabaseHost) throw new Error("installFetchFirewall precisa de testSupabaseHost.");

  let mpHandler = null;
  let mpCalls = 0;

  function hostOf(input) {
    try {
      const href = typeof input === "string" ? input : (input?.url ?? String(input));
      return new URL(href).host;
    } catch {
      return null;
    }
  }

  globalThis.fetch = async (input, init) => {
    const href = typeof input === "string" ? input : (input?.url ?? String(input));
    const host = hostOf(input);

    if (host === "api.mercadopago.com") {
      mpCalls += 1;
      if (!mpHandler) throw new Error("Firewall: nenhum mock do Mercado Pago registrado para esta chamada — " + href);
      return mpHandler(href, init);
    }

    if (host === testSupabaseHost) {
      return realFetch(input, init);
    }

    if (forbiddenHosts.includes(host)) {
      throw new Error(`Firewall: BLOQUEADO — tentativa de acessar um host PROIBIDO (${host}): ${href}`);
    }

    throw new Error(`Firewall: BLOQUEADO — requisição para host não autorizado (${host}): ${href}`);
  };

  return {
    setMpHandler: (fn) => {
      mpHandler = fn;
    },
    getMpCallCount: () => mpCalls,
    restore: () => {
      globalThis.fetch = realFetch;
    },
  };
}

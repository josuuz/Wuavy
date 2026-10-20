/*
  A identidade de conta de teste que charges.ts confere em GET /users/me
  antes de devolver init_point (src/lib/billing/charges.ts, paymentUrl).
  Usado pelos testes que precisam de um mock de Mercado Pago que já responde
  /users/me sozinho, sem repetir isso em cada handler — os testes que são
  sobre essa verificação em si (identidade errada, divergente, indisponível)
  continuam escrevendo o próprio /users/me explicitamente.
*/

export const TEST_COLLECTOR_ID = 555666777;

export const testCollectorAccount = (overrides = {}) => ({ id: TEST_COLLECTOR_ID, tags: ["test_user"], ...overrides });

const jsonResponse = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

/** Envolve um handler de mock de Mercado Pago para responder /users/me automaticamente, delegando qualquer outra URL ao handler original. */
export function withMpIdentity(handler, account = testCollectorAccount()) {
  return async (url, init) => {
    if (String(url).endsWith("/users/me")) return jsonResponse(200, account);
    return handler(url, init);
  };
}

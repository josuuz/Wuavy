/*
  Uma sessão e uma assinatura controláveis pelo teste, para rodar
  pulse/assinar/actions.ts fora do runtime do Next (tests/helpers/
  pulse-loader.mjs troca @/lib/flow/session por este módulo). O que se prova
  nos testes de integração é a orquestração de subscribe()/check(), não o
  login nem os cookies — a mesma fronteira que charges-loader.mjs traça para
  @/lib/maintenance/admin nas Cobranças.
*/

let session = { user: { id: "user-1", email: "cliente@example.com" }, member: null };
let subscription = null;
/** undefined = "igual à tentativa"; qualquer outro valor (inclusive null) manda. */
let standing;
/** undefined = derivar de subscription/standing; uma lista explícita manda (o limite de trocas conta linhas). */
let rows;
/** A leitura das assinaturas FALHA, como falha o Supabase de verdade. */
let readFails = false;

/** O mesmo erro que lib/flow/session.ts lança quando a leitura falha. */
export class SubscriptionReadError extends Error {}

export function setFakeSession(value) {
  session = value;
}

export function setFakeSubscription(value) {
  subscription = value;
  // Trocar a tentativa reseta a dupla: o caso comum é uma linha só, em que a
  // tentativa e a linha que responde pelo acesso são a mesma.
  standing = undefined;
  rows = undefined;
  readFails = false;
}

/** As linhas que getSubscriptions() devolve, da mais nova para a mais antiga. */
export function setFakeRows(value) {
  rows = value;
}

/** Faz toda leitura de assinatura falhar (true) ou voltar ao normal (false). */
export function setFakeReadFailure(value) {
  readFails = value;
}

function guard() {
  if (readFails) throw new SubscriptionReadError("simulado: a leitura das assinaturas falhou");
}

/**
 * A linha que responde pelo acesso, quando o teste quer que ela seja
 * diferente da tentativa em curso (uma clínica com uma assinatura ativa e uma
 * tentativa pendente ao lado). Sem chamar isto, as duas são a mesma.
 */
export function setFakeStanding(value) {
  standing = value;
}

export async function getSession() {
  return session;
}

export async function getSubscriptions() {
  guard();
  if (rows) return rows;
  const list = [subscription, standing].filter(Boolean);
  return list.filter((row, i) => list.findIndex((other) => other.id === row.id) === i);
}

/** Quantas linhas foram criadas na janela — TODAS, inclusive as recusadas (o limite de tentativas). */
export async function countRecentAttempts(windowMs) {
  guard();
  const list = rows ?? [subscription, standing].filter(Boolean);
  const since = Date.now() - windowMs;
  return list.filter((row) => Date.parse(row.created_at) >= since).length;
}

export async function getSubscription() {
  guard();
  return rows ? (rows[0] ?? null) : subscription;
}

export async function getStanding() {
  guard();
  return standing === undefined ? subscription : standing;
}

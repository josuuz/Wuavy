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

export function setFakeSession(value) {
  session = value;
}

export function setFakeSubscription(value) {
  subscription = value;
}

export async function getSession() {
  return session;
}

export async function getSubscription() {
  return subscription;
}

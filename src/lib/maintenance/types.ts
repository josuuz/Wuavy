/*
  O contrato entre a página do cliente e a sua ação de servidor. Fica aqui,
  e não dentro da rota, para o componente do navegador poder lê-lo sem
  importar um caminho com colchetes.
*/

/** Os desfechos de uma tentativa de autorizar a cobrança. */
export type AuthorizeOutcome =
  /** Há onde autorizar: o endereço do Mercado Pago vem em `url`. */
  | "redirect"
  /** Já está cobrando. */
  | "active"
  /** O servidor não tem credenciais do Mercado Pago. */
  | "unavailable"
  /** Falta o e-mail da cobrança. */
  | "email"
  /** Recusada, ou o Mercado Pago fora de alcance. */
  | "error";

export interface Authorized {
  outcome: AuthorizeOutcome;
  /** Onde o cliente autoriza, no Mercado Pago. Só em "redirect". */
  url?: string;
  /** O que o Mercado Pago recusou, em uma linha. Só em ambiente de teste. */
  detail?: string;
}

/** O que a página do cliente mostra quando abre. */
export type ClientStage = "form" | "pending" | "active" | "past_due" | "unavailable";

/** A ação que o navegador chama. */
export type AuthorizeAction = (input: { token: string; email?: string }) => Promise<Authorized>;

/*
  O que vai ao Mercado Pago na criação da assinatura de UMA linha, decidido só
  pela linha (a data em que ela nasceu), nunca pelo código que a atende.

  Por quê: a chave de idempotência da criação é o id da linha
  (lib/flow/billing.ts, createSubscription) e a regra é "o mesmo corpo para a
  mesma referência": uma tentativa que saiu, cuja resposta se perdeu, ou um
  checkout pendente retomado reenvia a criação com a mesma chave. Se o corpo
  mudasse entre a primeira tentativa e a segunda, o resultado ficaria nas mãos
  de como o Mercado Pago trata uma chave reusada com outro corpo — com o risco
  de recusa, ou de uma segunda assinatura. O rebranding para Clinavy trocou
  dois campos do corpo (`reason` e `back_url`); sem esta decisão, toda linha
  criada antes dele e retomada depois dele violaria a regra.

  Então: linha criada antes de CLINAVY_PAYLOAD_FROM leva exatamente o corpo de
  antes (reason "Wuavy Pulse", volta por /pulse/assinar, que redireciona para
  /clinavy/assinar com a query intacta); linha criada depois leva o corpo novo.
  Sem data legível a função devolve o corpo de antes, mas o fluxo real nem
  chega aqui: createAndRedirect (assinar/actions.ts) não envia nada quando não
  consegue ler a data da linha, porque qualquer corpo seria um palpite. É uma
  função pura da data da linha, então dá o mesmo resultado hoje e daqui a um
  ano, e em qualquer instância do servidor.

  CLINAVY_PAYLOAD_FROM tem de ser POSTERIOR ao instante em que o código com o
  nome novo entra no ar: assim nenhuma linha criada pelo código antigo é
  tratada como nova. O custo é pequeno e conhecido: as assinaturas criadas
  entre a publicação e este instante ainda levam o nome antigo no Mercado
  Pago. Depois disso, as novas levam Clinavy. Não é uma regra para apagar: as
  linhas anteriores à virada existirão enquanto existirem assinaturas.
*/

/** Instante da virada (ms desde a época), 2026-11-01T12:30:00Z. */
export const CLINAVY_PAYLOAD_FROM = Date.UTC(2026, 10, 1, 12, 30, 0);

export type SubscriptionCreation = {
  /** O nome que o Mercado Pago mostra e guarda na assinatura. */
  reason: string;
  /** Para onde o Mercado Pago devolve a pessoa (o caminho; o domínio vem de returnUrl). */
  backPath: string;
};

const BEFORE: SubscriptionCreation = { reason: "Wuavy Pulse", backPath: "/pulse/assinar" };
const AFTER: SubscriptionCreation = { reason: "Clinavy", backPath: "/clinavy/assinar" };

/** O corpo da criação para uma linha, pela data de criação dela (ISO, Date, ou desconhecida). */
export function subscriptionCreationFor(rowCreatedAt: string | number | Date | null | undefined): SubscriptionCreation {
  const at = rowCreatedAt instanceof Date ? rowCreatedAt.getTime() : typeof rowCreatedAt === "number" ? rowCreatedAt : Date.parse(rowCreatedAt ?? "");
  return Number.isFinite(at) && at >= CLINAVY_PAYLOAD_FROM ? { ...AFTER } : { ...BEFORE };
}

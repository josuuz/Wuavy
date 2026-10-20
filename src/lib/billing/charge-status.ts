/*
  O estado de uma cobrança única, a partir do que o Mercado Pago relata
  sobre os pagamentos dela (GET /v1/payments/{id}). O provedor tem mais
  estados do que o painel precisa mostrar — authorized, in_process,
  in_mediation, charged_back — então paymentBucket reduz todos a cinco:
  pendente, aprovado, recusado, cancelado, reembolsado. Um valor que o
  Mercado Pago documente no futuro e que não esteja aqui cai em "pending",
  nunca em "approved": dinheiro que ainda não é nosso não pode parecer que é.
*/

export type ChargeBucket = "pending" | "approved" | "rejected" | "cancelled" | "refunded";

const BUCKET: Record<string, ChargeBucket> = {
  pending: "pending",
  in_process: "pending",
  in_mediation: "pending",
  authorized: "approved",
  approved: "approved",
  rejected: "rejected",
  cancelled: "cancelled",
  refunded: "refunded",
  charged_back: "refunded",
};

/** O status de um pagamento do Mercado Pago, reduzido aos cinco estados do painel. */
export const paymentBucket = (status: string): ChargeBucket => BUCKET[status] ?? "pending";

/**
 * O estado de uma cobrança, a partir de todos os pagamentos já registrados
 * para ela. Um aprovado vence sempre — é o desfecho que interessa, mesmo que
 * tentativas recusadas tenham vindo depois (um cliente que tenta de novo até
 * passar). Sem nenhum aprovado, o pagamento mais recente decide. Sem nenhum
 * pagamento, a cobrança ainda está pendente.
 */
export function chargeStatusFrom(payments: readonly { status: string; created_at: string }[]): ChargeBucket {
  if (!payments.length) return "pending";
  if (payments.some((payment) => paymentBucket(payment.status) === "approved")) return "approved";
  const latest = [...payments].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  return paymentBucket(latest.status);
}

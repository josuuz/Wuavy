/*
  A aritmética do painel financeiro. Puro, sem banco: a mesma separação que
  charge-status.ts (puro) tem de charges.ts (que escreve), para que estas
  contas possam ser testadas com `node --test` sem subir nada.

  Uma regra manda em todas as outras: dinheiro recebido e dinheiro previsto
  nunca entram na mesma soma.

  - Recebido só sai de um registro que o sustente: um pagamento de Cobranças
    que o Mercado Pago creditou (status_detail "accredited") ou uma cobrança
    de manutenção que ele marcou como paga (maintenance_payments.paid).
  - Previsto é projeção: assinatura cobrando × valor. Não é prova de que o
    mês entrou.
  - O Pulse entra só em previsto. Ele não guarda pagamento nenhum — a
    migration 0003 guarda o estado da assinatura, não o histórico dela —
    então qualquer "recebido" vindo do Pulse seria invenção, e aqui não tem
    como ser somado por acidente: summarizePulse não devolve esse campo.
*/

/** O status_detail com que o Mercado Pago diz que o dinheiro foi creditado. */
export const ACCREDITED = "accredited";

/** O que um pagamento prova: crédito, só autorização, ou nada. */
export type PaymentEvidence = "received" | "authorized" | "none";

/**
 * O que um pagamento de Cobranças sustenta.
 *
 * billing_payments.status guarda o balde de charge-status.ts, e lá
 * "authorized" (cartão reservado, valor não capturado) cai no mesmo balde
 * que "approved". Para o painel operacional isso está certo; para receita,
 * não serve. Só status_detail "accredited" diz que o valor entrou.
 *
 * Qualquer outro detalhe — "pending_capture", o próprio "authorized" que
 * charges.ts grava quando o Mercado Pago não manda status_detail, ou um
 * valor que ele documente amanhã — fica em "authorized": aparece no painel,
 * fora da receita. Classificação conservadora por falta de prova, nunca
 * otimista por falta de informação.
 */
export function paymentEvidence(payment: { status: string; status_detail?: string | null }): PaymentEvidence {
  if (payment.status !== "approved") return "none";
  return (payment.status_detail ?? "").trim().toLowerCase() === ACCREDITED ? "received" : "authorized";
}

export interface PulseSummary {
  /** Assinaturas que liberam o Pulse: ativas e em atraso (lib/flow/access.ts, releases). */
  subscribers: number;
  /** Destas, as que passam pelo Mercado Pago — as únicas a que o preço de referência se aplica. */
  billedSubscribers: number;
  /** Destas, as ativadas à mão (provider 'manual'): fora da projeção, porque o valor delas não existe em lugar nenhum. */
  manualSubscribers: number;
  active: number;
  pastDue: number;
  pending: number;
  cancelled: number;
  /** Projeção em centavos: assinantes do Mercado Pago × preço de referência. Nunca é recebido. */
  estimatedMrrCents: number;
  /** O preço usado na projeção, para a tela poder dizer qual foi. */
  referencePriceCents: number;
}

/**
 * As assinaturas do Pulse contadas por estado, e a projeção mensal.
 *
 * A projeção é estimativa de verdade, não um arredondamento: o valor de cada
 * assinatura do Pulse só existe no Mercado Pago (auto_recurring.transaction_amount
 * da preapproval), nunca numa coluna nossa — ao contrário da manutenção, que
 * congela amount_cents na própria linha. Então aqui multiplica-se pelo preço
 * de referência que a tela mostra ao lado, e uma clínica com preço fundador
 * diferente do atual não aparece com o valor dela. Em atraso conta como
 * cobrando, o mesmo critério do isEarning da manutenção.
 *
 * As ativadas à mão (provider 'manual', migration 0004 — clínicas que
 * contrataram direto) ficam fora da projeção. Elas não têm assinatura no
 * Mercado Pago, e o que combinaram pagar não está em nenhum registro: somá-las
 * pelo preço de referência seria inventar receita. Aparecem contadas à parte.
 */
export function summarizePulse(rows: readonly { status: string; provider?: string | null }[], referencePriceCents: number): PulseSummary {
  const count = (status: string) => rows.filter((row) => row.status === status).length;
  const active = count("active");
  const pastDue = count("past_due");
  const releasing = rows.filter((row) => row.status === "active" || row.status === "past_due");
  const billedSubscribers = releasing.filter((row) => row.provider !== "manual").length;
  return {
    subscribers: active + pastDue,
    billedSubscribers,
    manualSubscribers: releasing.length - billedSubscribers,
    active,
    pastDue,
    pending: count("pending"),
    cancelled: count("cancelled"),
    estimatedMrrCents: billedSubscribers * referencePriceCents,
    referencePriceCents,
  };
}

export interface ChargesSummary {
  /** Creditado: soma dos pagamentos com prova de crédito. */
  receivedCents: number;
  receivedCount: number;
  /** Aprovado sem prova de crédito. Fora da receita de propósito. */
  authorizedCents: number;
  authorizedCount: number;
  pendingCharges: number;
  rejectedCharges: number;
  refundedCharges: number;
  totalCharges: number;
}

/**
 * As cobranças avulsas: o que entrou, o que só foi autorizado, e as contagens
 * por estado da cobrança.
 *
 * Soma os pagamentos (billing_payments), não as cobranças: é o pagamento que
 * carrega valor, data e o status_detail que prova o crédito. provider_payment_id
 * é único na tabela (migration 0019), então o mesmo aviso do Mercado Pago
 * chegando duas vezes é a mesma linha — não há o que deduplicar aqui.
 */
export function summarizeCharges(
  payments: readonly { status: string; status_detail?: string | null; amount_cents: number }[],
  charges: readonly { status: string }[],
): ChargesSummary {
  const summary: ChargesSummary = {
    receivedCents: 0,
    receivedCount: 0,
    authorizedCents: 0,
    authorizedCount: 0,
    pendingCharges: charges.filter((charge) => charge.status === "pending").length,
    rejectedCharges: charges.filter((charge) => charge.status === "rejected").length,
    refundedCharges: charges.filter((charge) => charge.status === "refunded").length,
    totalCharges: charges.length,
  };

  for (const payment of payments) {
    const evidence = paymentEvidence(payment);
    if (evidence === "received") {
      summary.receivedCents += payment.amount_cents;
      summary.receivedCount += 1;
    } else if (evidence === "authorized") {
      summary.authorizedCents += payment.amount_cents;
      summary.authorizedCount += 1;
    }
  }

  return summary;
}

export interface MaintenanceSummary {
  /** Receita recorrente mensal em centavos: as assinaturas que cobram. */
  mrrCents: number;
  earning: number;
  pending: number;
  late: number;
  /** Creditado: as cobranças que o Mercado Pago marcou como pagas. */
  receivedCents: number;
  receivedCount: number;
}

/**
 * A manutenção de sites: projeção pelas assinaturas, recebido pelo histórico.
 *
 * Aqui o recebido não precisa de heurística: maintenance_payments.paid já é a
 * leitura que lib/maintenance/billing.ts fez do Mercado Pago ("whether that
 * status means the money came in"). O valor vem de amount_cents da própria
 * linha do pagamento, não da assinatura, porque é o que foi cobrado naquele
 * mês. A projeção usa amount_cents da assinatura, congelado na criação, que é
 * por isso que a manutenção não precisa de estimativa como o Pulse.
 */
export function summarizeMaintenance(
  subscriptions: readonly { status: string; amount_cents: number }[],
  payments: readonly { paid: boolean; amount_cents: number }[],
): MaintenanceSummary {
  const earning = subscriptions.filter((row) => row.status === "active" || row.status === "past_due");
  const received = payments.filter((payment) => payment.paid);
  return {
    mrrCents: earning.reduce((total, row) => total + row.amount_cents, 0),
    earning: earning.length,
    pending: subscriptions.filter((row) => row.status === "pending").length,
    late: subscriptions.filter((row) => row.status === "past_due").length,
    receivedCents: received.reduce((total, payment) => total + payment.amount_cents, 0),
    receivedCount: received.length,
  };
}

export interface Consolidated {
  /** Dinheiro com registro que o sustente. O Pulse nunca entra aqui. */
  receivedCents: number;
  /** Projeção mensal somada. Contém a estimativa do Pulse. */
  projectedMrrCents: number;
  /** Quanto da projeção é estimativa sem valor gravado (só o Pulse). */
  estimatedMrrCents: number;
  /** Aprovado sem prova de crédito: nem recebido, nem previsto. */
  awaitingCreditCents: number;
}

/**
 * O resumo da agência. Três produtos, três tabelas distintas — a soma não
 * duplica nada porque cada pagamento existe em um lugar só. Um cliente de
 * Cobranças ligado a um de manutenção (billing_clients.maintenance_client_id)
 * é a mesma pessoa, não o mesmo dinheiro: a mensalidade dela e um site avulso
 * são duas cobranças que de fato entraram separadas.
 */
export function consolidate(pulse: PulseSummary, charges: ChargesSummary, maintenance: MaintenanceSummary): Consolidated {
  return {
    receivedCents: charges.receivedCents + maintenance.receivedCents,
    projectedMrrCents: pulse.estimatedMrrCents + maintenance.mrrCents,
    estimatedMrrCents: pulse.estimatedMrrCents,
    awaitingCreditCents: charges.authorizedCents,
  };
}

/** Nada ainda em nenhum dos três produtos: a tela diz isso em vez de enfileirar zeros. */
export const nothingYet = (pulse: PulseSummary, charges: ChargesSummary, maintenance: MaintenanceSummary) =>
  !pulse.active &&
  !pulse.pastDue &&
  !pulse.pending &&
  !pulse.cancelled &&
  !charges.totalCharges &&
  !charges.receivedCount &&
  !charges.authorizedCount &&
  !maintenance.earning &&
  !maintenance.pending &&
  !maintenance.late &&
  !maintenance.receivedCount;

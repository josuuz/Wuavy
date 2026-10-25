/*
  A parte sem rede da criação de uma assinatura do Pulse: puro, sem
  credenciais, sem fetch e sem Supabase — a mesma separação de
  mercadopago/notice.ts (runCancel, runCardChange) e de
  billing/create-charge.ts (runCreateCharge, claimDecision,
  runPersistPreference), testável sem rede
  (tests/pulse-create-subscription.test.mjs). lib/flow/billing.ts (com
  "server-only") liga a chamada de verdade.

  claimDecision e runPersistRetry duplicam de propósito a mesma lógica já
  provada em billing/create-charge.ts, com o nome da coluna certo para esta
  tabela (provider_subscription_id, não provider_preference_id). As
  Cobranças são um produto diferente, já publicado; esta correção não o
  toca.
*/

/** Credenciais ou limite nossos — nunca o cartão. Mesmo conjunto de actions.ts, agora aqui para ser testado sem rede. */
const OURS = new Set([401, 403, 429]);

export type CreateSubscriptionOutcome =
  /** O Mercado Pago criou a assinatura: o id existe do lado dele a partir de agora. */
  | { outcome: "created"; providerId: string }
  /** Recusada sincronamente pelo Mercado Pago (cartão, dados) — nada foi criado. */
  | { outcome: "refused"; httpStatus: number; body: unknown }
  /** Nossas credenciais ou um limite de taxa — nada foi criado, mas não é o cartão. */
  | { outcome: "ours"; httpStatus: number }
  /** Sem resposta classificável (rede, timeout, 5xx): pode já ter sido criada. */
  | { outcome: "unconfirmed" };

/**
 * Classifica só a chamada de criação (POST /preapproval) — nunca chama nada,
 * só decide o que o erro (ou a falta de um) significa. Depois que `create`
 * devolve com sucesso, o id existe do lado do Mercado Pago: nada a partir
 * daqui pode voltar a ser "refused" sem arriscar perder o vínculo (o mesmo
 * risco que billing.ts tinha antes desta correção).
 */
export async function runCreateSubscription(create: () => Promise<{ id: string }>): Promise<CreateSubscriptionOutcome> {
  let created: { id: string };
  try {
    created = await create();
  } catch (error) {
    const status = (error as { status?: unknown } | null)?.status;
    if (typeof status !== "number" || status >= 500) return { outcome: "unconfirmed" };
    if (OURS.has(status)) return { outcome: "ours", httpStatus: status };
    return { outcome: "refused", httpStatus: status, body: (error as { body?: unknown } | null)?.body };
  }
  return { outcome: "created", providerId: created.id };
}

/*
  A reserva antes de chamar o Mercado Pago, e o retry da gravação local
  depois. Mesma regra de billing/create-charge.ts (claimDecision,
  runPersistPreference) — ver lá o porquê de cada desfecho; aqui só o nome
  do campo muda.
*/

export type ClaimOutcome = "claimed" | "in_progress" | "blocked" | "already";

export interface SubscriptionClaimRow {
  provider_subscription_id: string | null;
  creation_blocked_at: string | null;
  creation_claimed_at: string | null;
}

/**
 * - "already": já tem assinatura no Mercado Pago — nada a reivindicar.
 * - "blocked": uma criação anterior terminou incerta (ou não foi salva) —
 *   fechada para automação até reconciliação manual.
 * - "in_progress": outra tentativa reivindicou há pouco — espera, não cria.
 * - "claimed": livre; quem chamou pode criar a assinatura agora.
 */
export function claimDecision(row: SubscriptionClaimRow, nowMs: number, staleMs: number): ClaimOutcome {
  if (row.provider_subscription_id) return "already";
  if (row.creation_blocked_at) return "blocked";
  if (row.creation_claimed_at) {
    const claimedMs = new Date(row.creation_claimed_at).getTime();
    // Uma reserva vencida nunca volta a ficar livre sozinha: a resposta do
    // Mercado Pago pode só estar demorando. "blocked", não "claimed" — só
    // reconciliação manual destrava.
    return nowMs - claimedMs < staleMs ? "in_progress" : "blocked";
  }
  return "claimed";
}

export type PersistOutcome = "saved" | "failed";

/**
 * Repete só a gravação local até `attempts` vezes — nunca a chamada ao
 * Mercado Pago, que já aconteceu e já funcionou quando isto é chamado.
 * `write` devolve true quando a escrita confirmou; qualquer `false` espera
 * e tenta de novo. Esgotadas as tentativas, "failed": quem chamou deve
 * bloquear a linha (creation_blocked_at) em vez de criar uma segunda
 * assinatura — o id já existe, só não foi salvo.
 */
export async function runPersistRetry(write: () => Promise<boolean>, attempts: number, wait: (attempt: number) => Promise<void>): Promise<PersistOutcome> {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    if (await write()) return "saved";
    if (attempt < attempts) await wait(attempt);
  }
  return "failed";
}

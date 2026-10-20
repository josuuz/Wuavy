/*
  A parte sem rede da criação de uma cobrança única: puro, sem credenciais,
  sem fetch e sem Supabase — a mesma separação de mercadopago/notice.ts
  (runCancel, runCardChange), testável sem rede
  (tests/billing-create-charge.test.mjs). lib/billing/charges.ts (com
  "server-only") liga a chamada de verdade.
*/

export type CreateChargeOutcome =
  | { outcome: "ready"; preferenceId: string; url: string }
  | { outcome: "refused" }
  | { outcome: "unconfirmed" };

/**
 * Se a linha já tem uma Preference, devolve o que já existe e nunca chama
 * `create` de novo — é o que impede uma segunda cobrança quando a página é
 * recarregada ou a chamada é repetida. Senão, chama uma vez; uma recusa
 * (status < 500 — valor, dados) é "refused", e quem chama pode descartar a
 * linha para tentar de novo com outra chave. Qualquer outra coisa — sem
 * status (uma falha de rede) ou >= 500 — é "unconfirmed": a Preference pode
 * já existir do lado do Mercado Pago, então a linha fica e uma repetição
 * usa a mesma chave.
 */
export async function runCreateCharge(
  existing: { provider_preference_id: string | null; payment_url: string | null } | null,
  create: () => Promise<{ id: string; url: string }>,
): Promise<CreateChargeOutcome> {
  if (existing?.provider_preference_id && existing.payment_url) {
    return { outcome: "ready", preferenceId: existing.provider_preference_id, url: existing.payment_url };
  }
  try {
    const created = await create();
    return { outcome: "ready", preferenceId: created.id, url: created.url };
  } catch (error) {
    const status = (error as { status?: unknown } | null)?.status;
    return typeof status === "number" && status < 500 ? { outcome: "refused" } : { outcome: "unconfirmed" };
  }
}

/*
  A reserva antes de chamar o Mercado Pago, e o retry depois. Nenhum dos
  dois toca rede ou Supabase — são as mesmas decisões que charges.ts
  (claimCreation, persistPreference) executa de verdade, isoladas aqui para
  serem provadas sem banco (tests/billing-persist-retry.test.mjs).
*/

export type ClaimOutcome = "claimed" | "in_progress" | "blocked" | "already";

export interface ClaimRow {
  provider_preference_id: string | null;
  creation_blocked_at: string | null;
  creation_claimed_at: string | null;
}

/**
 * O que uma reserva de criação deve fazer, a partir do estado da linha.
 * Esta é a mesma condição que a reserva atômica expressa em SQL
 * (charges.ts: UPDATE ... WHERE provider_preference_id IS NULL AND
 * creation_blocked_at IS NULL AND (creation_claimed_at IS NULL OR
 * creation_claimed_at < agora - staleMs)) — a atomicidade real é do banco
 * (um UPDATE condicional só afeta a linha para quem chega primeiro); esta
 * função só documenta e prova a regra para duas tentativas no mesmo
 * instante, e para uma reserva velha de uma tentativa que travou.
 *
 * - "already": já tem Preference — nada a reivindicar, devolve o que existe.
 * - "blocked": uma criação anterior terminou incerta ou não foi salva —
 *   fechada para automação até alguém reconciliar manualmente.
 * - "in_progress": outra tentativa reivindicou há pouco — espera, não chama o Mercado Pago.
 * - "claimed": livre; quem chamou pode criar a Preference agora.
 */
export function claimDecision(row: ClaimRow, nowMs: number, staleMs: number): ClaimOutcome {
  if (row.provider_preference_id) return "already";
  if (row.creation_blocked_at) return "blocked";
  if (row.creation_claimed_at) {
    const claimedMs = new Date(row.creation_claimed_at).getTime();
    // Uma reserva vencida nunca volta a ficar livre sozinha: a resposta do
    // Mercado Pago pode so estar demorando, e nao ha como saber se a
    // primeira tentativa ainda vai terminar. "blocked" em vez de "claimed" e
    // o que impede uma segunda chamada automatica a /checkout/preferences -
    // so reconciliacao manual (reconcilePreference/releaseForRetry) destrava.
    return nowMs - claimedMs < staleMs ? "in_progress" : "blocked";
  }
  return "claimed";
}

export type PersistOutcome = "saved" | "failed";

/**
 * Repete só a gravação local até `attempts` vezes — nunca a chamada ao
 * Mercado Pago, que já aconteceu e já funcionou quando isto é chamado.
 * `write` devolve true quando a escrita confirmou; qualquer `false` espera
 * (`wait`) e tenta de novo. Esgotadas as tentativas, "failed": quem chamou
 * deve bloquear a cobrança (creation_blocked_at) em vez de tentar criar uma
 * segunda Preference — o id e o link já existem, só não foram salvos.
 */
export async function runPersistPreference(write: () => Promise<boolean>, attempts: number, wait: (attempt: number) => Promise<void>): Promise<PersistOutcome> {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    if (await write()) return "saved";
    if (attempt < attempts) await wait(attempt);
  }
  return "failed";
}

/*
  O que reconcilePreference confere antes de salvar qualquer coisa — pura,
  sem rede, para ser provada contra uma Preference com referencia certa mas
  valor ou moeda diferentes (o caso que conferir so external_reference
  deixava passar).
*/

export type ReconcileCheck = { ok: true } | { ok: false; error: string };

export interface ReconcilePreferenceData {
  external_reference?: string;
  items?: { unit_price?: number; quantity?: number; currency_id?: string }[];
}

export interface ReconcileChargeRow {
  amount_cents: number;
}

/**
 * A referencia precisa ser desta cobranca, os itens precisam somar o mesmo
 * amount_cents congelado na criacao, e a moeda de cada item precisa ser BRL
 * — a mesma conferencia de syncPayment (charges.ts), aqui para o recurso
 * Preference em vez de Payment.
 */
export function checkReconciliation(charge: ReconcileChargeRow, preference: ReconcilePreferenceData, chargeId: string): ReconcileCheck {
  if (preference.external_reference !== chargeId) {
    return { ok: false, error: "Esse id não é desta cobrança (a referência não confere)." };
  }
  const items = preference.items ?? [];
  if (items.length === 0) {
    return { ok: false, error: "Essa Preference não tem itens para conferir o valor." };
  }
  const totalCents = items.reduce((sum, item) => sum + Math.round((item.unit_price ?? 0) * (item.quantity ?? 1) * 100), 0);
  if (totalCents !== charge.amount_cents) {
    return { ok: false, error: "O valor dessa Preference não bate com o valor desta cobrança." };
  }
  if (items.some((item) => (item.currency_id ?? "BRL") !== "BRL")) {
    return { ok: false, error: "Essa Preference não está em reais (BRL)." };
  }
  return { ok: true };
}

/*
  A investigação automática de uma cobrança travada (charges.ts,
  investigateBlockedCharge) — pura aqui, para provar sem rede que nenhum
  resultado ambíguo, incompleto ou vazio libera uma criação nova sozinho.

  GET /checkout/preferences/search?external_reference= é documentado pelo
  Mercado Pago, mas só cobre os últimos 90 dias (a própria documentação diz
  isso) e o retorno não confirma a referência nem traz o link de pagamento —
  só um candidato a conferir com GET /checkout/preferences/{id} e
  checkReconciliation. Por isso "nenhum resultado" nunca é tratado aqui como
  prova de que nada foi criado: é só "nenhuma evidência", e só conta alguma
  coisa dentro da janela em que a busca garante cobertura.
*/

/** Dias que o Mercado Pago documenta cobrir na busca de Preferences. */
export const PREFERENCE_SEARCH_WINDOW_DAYS = 90;
/** Margem de segurança: perto do limite documentado, um resultado vazio já não é confiável. */
export const PREFERENCE_SEARCH_SAFE_DAYS = 85;

/** Se a cobrança ainda está dentro da janela em que a busca cobre com segurança. */
export function isWithinSearchWindow(chargeCreatedAt: string, nowMs: number): boolean {
  const createdMs = Date.parse(chargeCreatedAt);
  if (!Number.isFinite(createdMs)) return false;
  const ageDays = (nowMs - createdMs) / 86_400_000;
  return ageDays <= PREFERENCE_SEARCH_SAFE_DAYS;
}

export type PreferenceSearchOutcome =
  | { kind: "failed" }
  | { kind: "none" }
  | { kind: "ambiguous"; ids: string[] }
  | { kind: "candidate"; id: string };

/**
 * Classifica o retorno de GET /checkout/preferences/search. `elements` é
 * `null` quando a própria consulta falhou (rede, erro HTTP) — isso nunca
 * pode ser confundido com "nenhuma encontrada": uma consulta que falhou não
 * prova coisa nenhuma, então "failed" fecha a porta da liberação automática
 * do mesmo jeito que "ambiguous".
 */
export function classifyPreferenceSearch(elements: { id: string }[] | null): PreferenceSearchOutcome {
  if (elements === null) return { kind: "failed" };
  if (elements.length === 0) return { kind: "none" };
  if (elements.length > 1) return { kind: "ambiguous", ids: elements.map((e) => e.id) };
  return { kind: "candidate", id: elements[0].id };
}

export type InvestigationVerdict = { verdict: "recovered"; preferenceId: string; url: string } | { verdict: "stay_blocked"; reason: string };

/**
 * A decisão final de uma investigação — nunca cria nada, e nunca libera para
 * uma criação nova. Só dois desfechos existem: "recovered" (uma Preference
 * já existente foi encontrada e validada de forma inequívoca — nada novo foi
 * criado, só terminou de salvar o que já estava lá) ou "stay_blocked"
 * (qualquer outra coisa, incluindo busca vazia). Nenhuma quantidade de tempo
 * decorrido, nenhuma busca vazia e nenhuma confirmação digitada em
 * lancamentos/actions.ts jamais transforma "não encontrei nada" em
 * autorização para chamar createPreference de novo — "não encontrei" não é
 * "não existe".
 */
export function decideInvestigation(input: {
  searchOutcome: PreferenceSearchOutcome;
  /** Só quando searchOutcome.kind === "candidate": o resultado de validar o detalhe do candidato. */
  candidateCheck?: ReconcileCheck;
  candidateDetail?: { id: string; url: string };
  /** "unknown" quando a própria busca de pagamentos falhou — tratado como stay_blocked, nunca como "não achei". */
  paymentFound: boolean | "unknown";
  withinSearchWindow: boolean;
}): InvestigationVerdict {
  const { searchOutcome, candidateCheck, candidateDetail, paymentFound, withinSearchWindow } = input;

  if (searchOutcome.kind === "failed") {
    return { verdict: "stay_blocked", reason: "Não foi possível consultar as Preferences no Mercado Pago agora. Tente de novo mais tarde." };
  }
  if (searchOutcome.kind === "ambiguous") {
    return {
      verdict: "stay_blocked",
      reason: `Mais de uma Preference encontrada para esta referência (${searchOutcome.ids.join(", ")}). Reconcilie manualmente com o id correto.`,
    };
  }
  if (searchOutcome.kind === "candidate") {
    if (candidateCheck?.ok && candidateDetail) {
      return { verdict: "recovered", preferenceId: candidateDetail.id, url: candidateDetail.url };
    }
    return {
      verdict: "stay_blocked",
      reason: candidateCheck && !candidateCheck.ok ? candidateCheck.error : "A Preference encontrada não pôde ser validada.",
    };
  }

  // searchOutcome.kind === "none": nenhuma evidência de Preference. Isto
  // nunca é tratado como prova de que nada foi criado — só muda a mensagem
  // para orientar a reconciliação manual; o desfecho é sempre stay_blocked.
  if (paymentFound === "unknown") {
    return { verdict: "stay_blocked", reason: "Não foi possível confirmar se existe algum pagamento para esta referência. Tente de novo mais tarde." };
  }
  if (paymentFound) {
    return {
      verdict: "stay_blocked",
      reason: "Existe pelo menos um pagamento registrado para esta referência no Mercado Pago, mesmo sem a Preference aparecer na busca. Reconcilie manualmente.",
    };
  }
  if (!withinSearchWindow) {
    return {
      verdict: "stay_blocked",
      reason: "Esta cobrança é mais antiga que a janela de busca de Preferences do Mercado Pago (90 dias): resultado vazio não é conclusivo. Reconcilie manualmente com um id encontrado por fora.",
    };
  }
  return {
    verdict: "stay_blocked",
    reason:
      "Nenhuma Preference nem pagamento foram encontrados para esta referência, mas isso não prova que nada foi criado. Esta cobrança não pode ser liberada automaticamente — só reconciliação manual com um id confirmado fora deste sistema.",
  };
}

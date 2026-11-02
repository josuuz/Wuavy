"use server";

import { redirect } from "next/navigation";

import { releases, type SubscriptionStatus } from "@/lib/flow/access";
import {
  billingReady,
  blockSubscriptionCreation,
  cancelSubscription,
  chargesKnown,
  claimSubscriptionCreation,
  createSubscription,
  describeError,
  MercadoPagoError,
  persistSubscriptionId,
  recordSubscriptionRefusal,
  releaseSubscriptionClaim,
  runCreateSubscription,
  syncStanding,
  syncSubscription,
  testMode,
} from "@/lib/flow/billing";
import { countRecentAttempts, getSession, getStanding, getSubscription, SubscriptionReadError } from "@/lib/flow/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { isEmailShape } from "@/lib/flow/email-shape";

/*
  The checkout, now hosted by Mercado Pago. subscribe() never collects a
  card: it creates (or resumes) a subscription with status "pending" and
  redirects to init_point, the page Mercado Pago itself returns. The card is
  typed there, on Mercado Pago's own domain — never on ours, not even as a
  token. check() reads what the subscription stands at now, whether the
  person just submitted the form, just returned from Mercado Pago, or is
  revisiting later.

  Creating is a claim, not a bare call: claimSubscriptionCreation reserves
  the row before anything reaches Mercado Pago (lib/mercadopago/
  create-subscription.ts, the same mechanism billing/charges.ts already
  proved for Cobranças), so two requests for the same row — a double click, a
  retried network call — never both call POST /preapproval. Once Mercado Pago
  answers "created", nothing after that point is ever reported as "rejected":
  either the id is saved (persistSubscriptionId, with retries) or the row is
  blocked for manual reconciliation. A row is never deleted and never
  silently loses the id of an assinatura that may already exist at Mercado
  Pago.

  A row that already has a provider_subscription_id but is still "pending" —
  the person started the hosted checkout and never finished it, or just came
  back and the webhook has not landed yet — is resumed, never recreated:
  Mercado Pago's own idempotency key (the row's id) makes a repeated
  POST /preapproval answer with the very same subscription and the very same
  init_point, so sending the person back there is always safe.
*/

export type CheckoutOutcome =
  | "active"
  /** Ainda em andamento: nenhum erro, só esperando o Mercado Pago confirmar. */
  | "pending"
  /** O Mercado Pago recusou a criação, sincronamente (dados da configuração, nunca o cartão: nenhum cartão existe ainda nesta etapa). */
  | "rejected"
  /** O Mercado Pago criou a assinatura e já a cancelou, sem nunca ter cobrado nada. */
  | "declined"
  /** Resultado desconhecido (rede, timeout, falha ao salvar): travado para reconciliação manual. */
  | "unresolved"
  /** Nossas credenciais ou um limite de taxa. */
  | "unavailable"
  /** Trocas de pagador demais em pouco tempo: espera antes de abrir outro pagamento. */
  | "limited";

/** The outcome, and in test mode only, why Mercado Pago refused. */
export interface Subscribed {
  outcome: CheckoutOutcome;
  detail?: string;
}

/**
 * 'declined' aqui nunca é a mesma coisa que a assinatura recusada na criação
 * (runCreateSubscription's "refused"): é o Mercado Pago confirmando que
 * criou a assinatura e já a cancelou — sempre para uma linha desta própria
 * tentativa, que nunca chegou a ficar ativa (started_at nunca foi gravado).
 * "declined", nunca "rejected": a tela mostra uma frase mais cautelosa, sem
 * afirmar que nada foi cobrado com a mesma certeza de uma recusa síncrona.
 */
const outcome = (status: SubscriptionStatus | null): CheckoutOutcome =>
  releases(status) ? "active" : status === "cancelled" ? "declined" : "pending";

/**
 * Quando a linha nasceu: é ela que decide o corpo da criação (nome e volta),
 * para uma retomada repetir exatamente o que a primeira tentativa enviou
 * (lib/flow/subscription-payload.ts). A coluna nunca é nula; null aqui quer
 * dizer que não deu para ler (erro, ou a linha sumiu), e nesse caso nada é
 * enviado: qualquer corpo seria um palpite, e um palpite errado reusa a chave
 * de idempotência com outro corpo.
 */
interface RowFacts {
  createdAt: string;
  /** O e-mail do pagador gravado nesta linha. null quando a linha nasceu antes da coluna existir. */
  payerEmail: string | null;
}

async function rowFacts(rowId: string): Promise<RowFacts | null> {
  try {
    const { data, error } = await createAdminClient().from("subscriptions").select("created_at, payer_email").eq("id", rowId).maybeSingle();
    if (error) {
      console.error("subscribe: ler os dados da linha", rowId, error.message);
      return null;
    }
    const createdAt = data?.created_at as string | undefined;
    if (!createdAt) return null;
    return { createdAt, payerEmail: data?.payer_email ?? null };
  } catch (error) {
    console.error("subscribe: ler os dados da linha", rowId, error);
    return null;
  }
}

/**
 * O que termina uma criação (ou uma retomada): chama o Mercado Pago, trata
 * cada desfecho exatamente como subscribe() sempre tratou
 * (recusado/nosso/incerto/criado) e, só quando a assinatura existe e o
 * init_point veio, redireciona para o checkout hospedado — nunca retorna
 * nesse caminho. Retorna normalmente em qualquer outro desfecho.
 */
async function createAndRedirect(rowId: string, email: string): Promise<Subscribed> {
  const facts = await rowFacts(rowId);
  if (!facts) {
    // Nada foi enviado: libera a reserva, a mesma linha pode tentar de novo depois.
    await releaseSubscriptionClaim(rowId);
    return { outcome: "unavailable" };
  }
  // O pagador vem da LINHA, nunca do código que a atende: é isso que faz uma
  // retomada reenviar o corpo idêntico sob a mesma chave de idempotência
  // (lib/flow/subscription-payload.ts diz por quê). Só uma linha anterior à
  // coluna cai no e-mail da sessão.
  const payer = facts.payerEmail ?? email;
  const result = await runCreateSubscription(() => createSubscription({ reference: rowId, email: payer, rowCreatedAt: facts.createdAt }));

  if (result.outcome === "ours") {
    // Ours, not theirs: credentials or rate limit. Nada foi criado — libera
    // a reserva, a mesma linha pode tentar de novo depois.
    console.error("subscribe: Mercado Pago refused our credentials or rate-limited us", result.httpStatus);
    await releaseSubscriptionClaim(rowId);
    return { outcome: "unavailable" };
  }

  if (result.outcome === "refused") {
    // Recusado na própria configuração (payer_email, moeda, valor): a
    // tentativa nunca chegou a existir no Mercado Pago. Marca como recusada —
    // nunca apaga — e libera para uma tentativa nova (uma linha nova).
    console.warn("subscribe: refused by Mercado Pago", result.httpStatus, JSON.stringify(result.body));
    const detail = testMode() ? describeError(new MercadoPagoError(result.httpStatus, result.body)) : undefined;
    if ((await recordSubscriptionRefusal(rowId, result.httpStatus, detail)) === "failed") {
      console.error("subscribe: gravar recusa não confirmou", rowId);
    }
    return { outcome: "rejected", detail };
  }

  if (result.outcome === "unconfirmed") {
    // Rede, timeout, 5xx: a assinatura pode já existir do lado do Mercado
    // Pago sem termos como confirmar agora. Trava para reconciliação manual
    // — nunca repete a chamada sozinha, que arriscaria uma segunda
    // assinatura recorrente.
    console.error("subscribe: Mercado Pago unreachable, resultado indeterminado", rowId);
    if ((await blockSubscriptionCreation(rowId)) === "failed") console.error("subscribe: bloqueio após resultado incerto não confirmou", rowId);
    return { outcome: "unresolved" };
  }

  // result.outcome === "created": o Mercado Pago criou a assinatura. A
  // partir de agora nada mais é relatado como recusa.
  const persisted = await persistSubscriptionId(rowId, result.providerId);
  if (persisted === "failed") {
    // O id existe no Mercado Pago (result.providerId) mas não foi possível
    // salvá-lo aqui mesmo depois de tentar: registra os dois ids juntos —
    // sem isto, uma reconciliação manual não teria como saber qual
    // assinatura, do lado do Mercado Pago, pertence a esta linha.
    console.error("subscribe: não foi possível salvar o id da assinatura", { rowId, providerId: result.providerId });
    if ((await blockSubscriptionCreation(rowId)) === "failed") console.error("subscribe: bloqueio após falha de persistência não confirmou", rowId);
    return { outcome: "unresolved" };
  }

  if (!result.initPoint) {
    // O id já está salvo (persistSubscriptionId confirmou) — nunca perdido —
    // mas sem init_point não há para onde mandar a pessoa. Não devia
    // acontecer numa criação "pending" sem card_token_id; se acontecer, pede
    // para verificar de novo em vez de travar ou inventar um endereço.
    console.error("subscribe: Mercado Pago criou a assinatura sem init_point", rowId, result.providerId);
    return { outcome: "unresolved" };
  }

  redirect(result.initPoint);
}

/**
 * Retoma um checkout hospedado já criado para esta linha. Confirma o estado
 * real primeiro — nunca confia em "ainda pending" guardado sem perguntar de
 * novo ao Mercado Pago — e só quando ele de fato ainda não resolveu reemite a
 * MESMA chamada de criação (idempotente pela chave = o id desta linha) para
 * recuperar o mesmo init_point e levar a pessoa de volta.
 */
async function resumeCheckout(rowId: string, providerId: string, email: string): Promise<Subscribed> {
  let fresh: SubscriptionStatus | null;
  try {
    fresh = await syncSubscription(providerId);
  } catch (error) {
    console.error("subscribe: resync ao retomar checkout pendente", rowId, error);
    return { outcome: "pending" };
  }
  if (fresh !== "pending") return { outcome: outcome(fresh) };
  return createAndRedirect(rowId, email);
}

/*
  A identidade do pagador no Mercado Pago.

  O checkout hospedado identifica quem paga pelo payer_email da assinatura: a
  pessoa tem de entrar no Mercado Pago com a conta DAQUELE e-mail, ou o próprio
  Mercado Pago recusa, com "Seu e-mail não corresponde ao da assinatura". O
  e-mail da conta do Clinavy não é necessariamente o da conta do Mercado Pago,
  e enquanto só ele era enviado não havia saída nenhuma pela tela — a primeira
  cliente chegou a criar uma segunda conta tentando contornar isso.

  Então o pagador é um dado da LINHA (coluna payer_email, migration 0023),
  declarado pela pessoa quando o e-mail da conta não serve. Nada aqui burla
  validação do Mercado Pago; ao contrário, manda exatamente o que ele valida —
  e ele continua sendo quem decide, porque quem não entrar com aquela conta
  segue recusado.

  E como a chave de idempotência da criação é o id da linha, trocar o pagador
  nunca reescreve o corpo de uma tentativa que já saiu: a tentativa pendente é
  encerrada no Mercado Pago e uma linha nova nasce com o pagador novo.
*/

/**
 * O e-mail declarado pela pessoa, pronto para ir ao banco — ou null quando não serve. A
 * forma é a MESMA da busca de suporte (email-shape.ts): um pagador gravado aqui que a
 * busca não conseguisse achar não serviria a ninguém. Existência, quem confere é o
 * Mercado Pago.
 */
function payerFrom(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim();
  return isEmailShape(email) ? email : null;
}

const PAYER_INVALID = "Confira o e-mail da sua conta do Mercado Pago.";
const NOT_OWNER = "Só o responsável pela clínica pode trocar quem paga a assinatura.";
const RACE_DETAIL = "Já havia uma tentativa em andamento com outro e-mail. Tente de novo em instantes.";

/*
  Cada troca de pagador cancela uma tentativa e cria outra no Mercado Pago. Nada
  é cobrado, mas é uma chamada externa que qualquer pessoa logada podia repetir
  sem fim — e cada repetição deixa uma linha. O limite conta as linhas que a
  pessoa/clínica criou na última hora: quatro cobrem um uso honesto (errar o
  e-mail uma ou duas vezes) e fecham o laço.
*/
const ATTEMPT_WINDOW_MS = 60 * 60 * 1000;
const MAX_ATTEMPTS_PER_WINDOW = 4;

/** Esta pessoa/clínica já criou tentativas demais na última hora? Conta TODAS, inclusive as recusadas na criação. */
const overLimit = async (): Promise<boolean> => (await countRecentAttempts(ATTEMPT_WINDOW_MS)) >= MAX_ATTEMPTS_PER_WINDOW;

/*
  Atenção: todo export de um arquivo "use server" vira um endpoint que qualquer
  chamador pode acionar, autenticado ou não. Aqui só saem as três ações que
  conferem a sessão (subscribe, subscribeWithPayerEmail, check). Um leitor
  auxiliar de linha por id, que usa o cliente admin, NUNCA pode ser exportado:
  foi exatamente o erro de uma versão anterior (payerFor), que devolvia o
  e-mail do pagador de qualquer linha a quem perguntasse. A tela lê o pagador
  da própria assinatura da pessoa (session.ts, sob a row-level security), e
  tests/pulse-payer-email.test.mjs trava a lista de exports.
*/

/**
 * Encerra, no Mercado Pago, uma tentativa pendente que não vai mais ser usada
 * — e só ela. Uma assinatura que libera nunca chega aqui (quem chama confere
 * antes), e nada é criado: é este passo que garante que trocar o pagador não
 * deixe duas assinaturas recorrentes vivas para a mesma clínica.
 *
 * Devolve `retired` quando o Mercado Pago confirmou que a tentativa acabou —
 * cancelada agora por nós, ou já encerrada por ele — E nenhuma cobrança foi
 * aprovada nela. Em qualquer outro caso devolve o desfecho para a tela e NENHUMA
 * linha nova nasce: duas assinaturas vivas é o único erro que não se pode cometer.
 *
 * "Não dá para saber se foi paga" conta como "pode ter sido paga": a busca de
 * cobranças que falha (5xx, rede, 429) fecha o caminho. Um 400 dela é o Mercado
 * Pago dizendo que ainda não há cobrança nenhuma (chargesKnown), o caso comum de
 * uma tentativa que nunca chegou a cobrar — e esse caminho segue aberto, ou a
 * recuperação nunca funcionaria.
 */
async function retireAttempt(providerId: string): Promise<{ retired: true } | { retired: false; answer: Subscribed }> {
  const unresolved = (why: string): { retired: false; answer: Subscribed } => {
    console.error("subscribeWithPayerEmail: nenhuma tentativa nova é criada —", why, providerId);
    return { retired: false, answer: { outcome: "unresolved" } };
  };

  let before: Awaited<ReturnType<typeof syncStanding>>;
  try {
    before = await syncStanding(providerId);
  } catch (error) {
    console.error("subscribeWithPayerEmail: reler a tentativa antes de encerrar", error);
    return { retired: false, answer: { outcome: "pending" } };
  }
  if (!before) return unresolved("a assinatura não é uma das nossas");

  // Resolveu sozinha enquanto isso (já cobra, ou está em atraso): o desfecho real
  // manda — inclusive "já está ativa" — e nada é encerrado.
  if (before.status !== "pending" && before.status !== "cancelled") {
    return { retired: false, answer: { outcome: outcome(before.status) } };
  }

  // O Mercado Pago já encerrou esta tentativa (venceu, ou foi cancelada lá): não há o
  // que cancelar, e a pessoa declarou um e-mail para uma tentativa NOVA. Mostrar
  // "recusada" e descartar o e-mail a obrigaria a digitá-lo de novo. Só não se cria
  // outra se uma cobrança foi aprovada nela, ou se não dá para saber.
  if (before.status === "cancelled") {
    if (before.first_payment_confirmed_at || !chargesKnown(before)) return unresolved("encerrada no Mercado Pago, mas paga ou não verificável");
    return { retired: true };
  }

  try {
    const after = await cancelSubscription(providerId);
    if (after !== "cancelled") return unresolved("o Mercado Pago não confirmou o encerramento");
    // Corrida: a pessoa pode ter concluído o pagamento no checkout ANTIGO entre a
    // leitura de cima e este cancelamento. Se uma cobrança foi aprovada nesta
    // assinatura — ou se não dá para saber —, NENHUMA nova nasce: o mês pago
    // continua valendo (standingRow) e uma segunda assinatura cobraria em dobro.
    // É uma decisão para uma pessoa, não para este código.
    const synced = await syncStanding(providerId).catch(() => null);
    if (!synced || synced.first_payment_confirmed_at || !chargesKnown(synced)) return unresolved("paga, ou não verificável, na corrida do cancelamento");
    return { retired: true };
  } catch (error) {
    console.error("subscribeWithPayerEmail: encerrar a tentativa pendente", providerId, error);
    return { retired: false, answer: { outcome: "unresolved" } };
  }
}

/**
 * A pessoa declara o e-mail da conta do Mercado Pago dela e tenta de novo por
 * ali. A recuperação para "Seu e-mail não corresponde ao da assinatura", sem
 * conta nova e sem cobrança duplicada.
 *
 * Nunca reaproveita um checkout pendente feito para outro e-mail: ou o
 * pagador é o mesmo e a tentativa é retomada, ou ela é encerrada no Mercado
 * Pago antes de qualquer linha nova existir. E nunca mexe numa assinatura que
 * já cobra — para essa, o caminho é trocar o cartão em Configurações.
 */
export async function subscribeWithPayerEmail(email: string): Promise<Subscribed> {
  const session = await getSession();
  if (!session) redirect("/clinavy/entrar?depois=assinar");

  // Cancelar a tentativa pendente da clínica e escolher quem paga é decisão do
  // responsável, como cancelar o plano (subscription-actions.ts, owning()). Todo
  // export de um arquivo "use server" é um endpoint: esconder o botão não basta.
  if (session.member && session.member.role !== "owner") return { outcome: "rejected", detail: NOT_OWNER };

  const payer = payerFrom(email);
  if (!payer) return { outcome: "rejected", detail: PAYER_INVALID };

  let standing: Awaited<ReturnType<typeof getStanding>>;
  let attempt: Awaited<ReturnType<typeof getSubscription>>;
  try {
    standing = await getStanding();
    attempt = await getSubscription();
  } catch (error) {
    // Não se leu a assinatura: nada é aberto, cancelado nem criado às cegas.
    if (error instanceof SubscriptionReadError) return { outcome: "unresolved" };
    throw error;
  }
  if (standing && releases(standing.status)) return { outcome: "active" };

  if (attempt?.status === "pending" && attempt.provider_subscription_id) {
    // Quem esta tentativa nomeia como pagador. Uma linha anterior à coluna
    // (null) saiu com o e-mail da conta, então é com ele que se compara —
    // sem isto, declarar o próprio e-mail da conta cancelaria e recriaria uma
    // assinatura idêntica por nada.
    const current = attempt.payer_email ?? session.user.email ?? null;
    if (current && current.toLowerCase() === payer.toLowerCase()) {
      // O mesmo pagador: é a mesma tentativa. Retomar é o certo — encerrar e
      // recriar uma assinatura por nada seria pior do que não fazer nada. E não é
      // uma tentativa NOVA, então o limite não se aplica (nada é criado).
      // Com o e-mail da LINHA (`current`), não com o digitado: numa linha anterior à coluna o
      // corpo reenviado sai do que se passa aqui, e "Maria@X.com" no lugar de "maria@x.com"
      // seria outro corpo sob a mesma chave de idempotência.
      return resumeCheckout(attempt.id, attempt.provider_subscription_id, current);
    }
    // Daqui em diante algo é cancelado e algo é criado: é isto que o limite freia, e só
    // aqui ele é consultado (retomar não cria nada; criar uma linha nova, start() confere).
    // É um freio contra abuso, não uma fronteira de segurança: a contagem e a inserção não
    // são atômicas, então requisições simultâneas podem ultrapassá-lo por pouco.
    try {
      if (await overLimit()) return { outcome: "limited" };
    } catch (error) {
      if (error instanceof SubscriptionReadError) return { outcome: "unresolved" };
      throw error;
    }
    const retired = await retireAttempt(attempt.provider_subscription_id);
    if (!retired.retired) return retired.answer;
    // A linha acabou de ser encerrada, mas getSubscription() é memoizado por
    // requisição (React cache): nesta mesma requisição ela ainda volta como
    // "pending". Dizer explicitamente para ignorá-la é o que impede start()
    // de retomar o checkout que acabamos de cancelar.
    return start(payer, attempt.id);
  }

  // Sem tentativa para encerrar: start() reaproveita uma linha ainda não enviada (nada é
  // criado, nenhum limite se aplica) ou, ao criar uma linha nova, aplica o limite ele mesmo.
  return start(payer);
}

export async function subscribe(): Promise<Subscribed> {
  return start(null);
}

/**
 * Criar ou retomar a assinatura. `declared` é o e-mail do Mercado Pago que a
 * pessoa declarou (subscribeWithPayerEmail) — null no caminho comum, em que o pagador é
 * o e-mail da conta. `retiredAttemptId` é uma linha que acabou de ser
 * encerrada nesta mesma requisição e que, por isso, não pode ser retomada nem
 * reaproveitada, por mais que a leitura memoizada ainda a mostre viva.
 */
async function start(declared: string | null, retiredAttemptId?: string): Promise<Subscribed> {
  const session = await getSession();
  if (!session) redirect("/clinavy/entrar?depois=assinar");

  const email = session.user.email;

  // Já paga? A pergunta é sobre a clínica inteira (getStanding), não sobre a
  // última linha a nascer: é o que impede uma segunda assinatura recorrente
  // quando uma tentativa abandonada ficou ao lado de uma assinatura ativa.
  let standing: Awaited<ReturnType<typeof getStanding>>;
  let latest: Awaited<ReturnType<typeof getSubscription>>;
  try {
    standing = await getStanding();
    latest = await getSubscription();
  } catch (error) {
    // Não se leu a assinatura: sem saber se já paga, não se cria uma segunda.
    if (error instanceof SubscriptionReadError) return { outcome: "unresolved" };
    throw error;
  }
  if (standing && releases(standing.status)) return { outcome: "active" };

  // Uma linha encerrada agora mesmo não é mais a tentativa de ninguém.
  const current = latest && latest.id !== retiredAttemptId ? latest : null;
  // Already waiting on one: never a second subscription.
  if (current?.status === "pending" && current.provider_subscription_id) {
    if (!email) return { outcome: "rejected" };
    return resumeCheckout(current.id, current.provider_subscription_id, email);
  }

  if (!billingReady()) return { outcome: "unavailable" };
  if (!email) return { outcome: "rejected" };

  let admin;
  try {
    admin = createAdminClient();
  } catch (error) {
    console.error("subscribe:", error);
    return { outcome: "unavailable" };
  }

  // Our row first: its id goes to Mercado Pago as the reference, so every notice finds it.
  // A pending row that never reached Mercado Pago (a timeout, a block) is reused with the same key.
  const orgId = session.member?.organization_id ?? null;
  // O pagador desta tentativa: o que a pessoa declarou, ou o e-mail da conta.
  const payer = declared ?? email;
  let rowId = current?.status === "pending" && !current.provider_subscription_id ? current.id : null;
  let inserted = false;
  if (!rowId) {
    // Uma linha NOVA é uma chamada ao Mercado Pago (e, se ele recusar, uma linha
    // 'rejected' que também conta): o mesmo limite de subscribeWithPayerEmail vale para
    // quem só aperta "Assinar" repetidamente depois de recusas.
    try {
      if (await overLimit()) return { outcome: "limited" };
    } catch (error) {
      if (error instanceof SubscriptionReadError) return { outcome: "unresolved" };
      throw error;
    }
    // Transição legada (migration 0017): só true quando a clínica já existe
    // (orgId) e NUNCA teve nenhuma linha antes — nem uma "rejected". current
    // null aqui tanto pode ser "nunca existiu nenhuma" quanto "só existe uma
    // 'rejected'" (getSubscription() exclui as duas da mesma forma); uma
    // clínica com só uma recusa não é legada — não ganha a proteção, para
    // nunca virar acesso gratuito indevido por causa de uma linha rejected.
    let legacyAccessTransition = false;
    if (orgId) {
      const { data: anyRow, error: anyRowError } = await admin.from("subscriptions").select("id").eq("organization_id", orgId);
      if (anyRowError) console.error("subscribe: checar histórico para transição legada", anyRowError);
      else legacyAccessTransition = (anyRow?.length ?? 0) === 0;
    }
    const { data, error } = await admin
      .from("subscriptions")
      .insert({
        user_id: session.user.id,
        organization_id: orgId,
        status: "pending",
        legacy_access_transition: legacyAccessTransition,
        // Gravado no nascimento da linha, e é ele que vai ao Mercado Pago em
        // toda tentativa desta linha — primeira ou retomada (createAndRedirect).
        payer_email: payer,
      })
      .select("id")
      .single();
    if (error) {
      // 23505 (unique_violation): perdeu a corrida contra outra requisição
      // simultânea da mesma pessoa (subscriptions_one_live_per_user, pré-
      // clínica, ou subscriptions_one_live_per_clinic, já com clínica —
      // migrations 0021/0020). Nunca insere uma segunda linha: lê a que já
      // existe e segue com ela, como se tivesse sido encontrada por
      // getSubscription() desde o início.
      if (error.code === "23505") {
        const base = admin.from("subscriptions").select("id, status, provider_subscription_id, payer_email").eq("user_id", session.user.id);
        // organization_id null precisa de .is(), nunca .eq(): o índice que
        // gerou esta corrida (subscriptions_one_live_per_user) é justamente
        // sobre organization_id is null, e .eq(col, null) não bate com NULL
        // no Postgres/PostgREST.
        const { data: rows, error: readError } = await (orgId ? base.eq("organization_id", orgId) : base.is("organization_id", null));
        const won = rows?.find((r) => r.status !== "cancelled" && r.status !== "rejected") ?? null;
        if (readError || !won) {
          console.error("subscribe: linha vencedora da corrida não encontrada", readError);
          return { outcome: "unavailable" };
        }
        if (releases(won.status as SubscriptionStatus)) return { outcome: "active" };
        if (won.status === "pending" && won.provider_subscription_id) {
          // A vencedora já saiu para o Mercado Pago com o pagador DELA. Se a pessoa declarou
          // outro, retomar a mandaria de volta à conta errada, sem explicação, e ela veria
          // o mesmo "e-mail não corresponde". Diz-se o que houve; ao tentar de novo, o
          // caminho normal de troca (que encerra a tentativa antes) cuida disso.
          if (declared && (won.payer_email ?? email).toLowerCase() !== declared.toLowerCase()) return { outcome: "rejected", detail: RACE_DETAIL };
          return resumeCheckout(won.id, won.provider_subscription_id, email);
        }
        rowId = won.id;
      } else {
        console.error("subscribe: row", error);
        return { outcome: "unavailable" };
      }
    } else {
      rowId = data.id;
      inserted = true;
    }
  }

  // O pagador declarado vale também para uma linha REAPROVEITADA — a pendente que nunca
  // chegou ao Mercado Pago, ou a que venceu a corrida do 23505 (antes o e-mail se perdia
  // em silêncio neste segundo caso). Uma linha que acabou de nascer já o leva.
  //
  // Nada saiu com o corpo antigo, então a chave de idempotência segue limpa; as três
  // condições abaixo é que provam isso: com assinatura gravada, travada para
  // reconciliação ou com reserva em andamento (creation_claimed_at), NÃO se toca.
  // Trocar o pagador por baixo de uma criação em curso deixaria o banco dizendo X e o
  // Mercado Pago com Y, e a retomada reenviaria um corpo diferente sob a mesma chave.
  if (declared && !inserted) {
    const { data: updated, error: payerError } = await admin
      .from("subscriptions")
      .update({ payer_email: declared, updated_at: new Date().toISOString() })
      .eq("id", rowId)
      .is("provider_subscription_id", null)
      .is("creation_blocked_at", null)
      .is("creation_claimed_at", null)
      .select("id");
    if (payerError) {
      console.error("subscribe: gravar o pagador declarado", rowId, payerError.message);
      return { outcome: "unavailable" };
    }
    // Nenhuma linha mudou: a criação está em andamento, a linha foi enviada ou ela está
    // TRAVADA para reconciliação. Não se mexe — e uma linha travada não é "aguardando":
    // diz "ainda não confirmamos", que manda esperar e não tentar de novo.
    if (!updated?.length) {
      const { data: now } = await admin.from("subscriptions").select("creation_blocked_at").eq("id", rowId).maybeSingle();
      return { outcome: now?.creation_blocked_at ? "unresolved" : "pending" };
    }
  }

  // A reserva atômica: duas requisições para a mesma linha nunca chamam
  // POST /preapproval as duas. Uma linha travada por um resultado anterior
  // incerto nunca é tentada de novo sozinha — só reconciliação manual.
  const claim = await claimSubscriptionCreation(rowId);
  if (claim === "already") return { outcome: await check() };
  if (claim === "blocked") return { outcome: "unresolved" };
  if (claim === "in_progress") return { outcome: "pending" };

  return createAndRedirect(rowId, email);
}

/** Where the signed-in person's subscription stands, read again from Mercado Pago while it is pending. */
export async function check(): Promise<CheckoutOutcome> {
  const session = await getSession();
  if (!session) redirect("/clinavy/entrar?depois=assinar");
  // Uma assinatura que libera manda, venha ela da tentativa em curso ou de
  // outra linha da clínica: sem isto a tela ficava "aguardando confirmação"
  // para sempre quando uma tentativa abandonada ficava ao lado de uma ativa.
  let standing: Awaited<ReturnType<typeof getStanding>>;
  let current: Awaited<ReturnType<typeof getSubscription>>;
  try {
    standing = await getStanding();
    current = await getSubscription();
  } catch (error) {
    // Leitura que falha não é "sem assinatura": a tela diz que não confirmou e pede para esperar.
    if (error instanceof SubscriptionReadError) return "unresolved";
    throw error;
  }
  if (standing && releases(standing.status)) return "active";
  if (!current) return "rejected";
  // Bloqueada para reconciliação: continua "unresolved" enquanto isso não
  // for limpo (syncStanding, numa leitura confirmada) — nunca volta a
  // "pending" sozinha, por mais vezes que a página pergunte de novo.
  if (current.creation_blocked_at) return "unresolved";
  if (current.status !== "pending" || !current.provider_subscription_id) return outcome(current.status);
  try {
    return outcome(await syncSubscription(current.provider_subscription_id));
  } catch (error) {
    console.error("check: Mercado Pago", error);
    return "pending";
  }
}

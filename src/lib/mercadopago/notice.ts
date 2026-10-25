/*
  O que o Mercado Pago diz, lido sem rede: o estado que uma assinatura e a
  sua última cobrança significam, e a conferência da assinatura HMAC de um
  aviso (webhook).

  Módulo compartilhado: o Pulse (lib/flow/billing.ts) e as Assinaturas de
  Sites (lib/maintenance/billing.ts) importam daqui, em vez de cada um ter a
  sua própria cópia de statusFrom e companhia. Puro de propósito — nada de
  credenciais, de fetch e de Supabase — para poder ser testado sem rede
  (tests/mercadopago-notice.test.mjs, tests/card-change.test.mjs) e para
  nenhum dos dois produtos precisar confiar no outro para ficar certo.
*/

import { createHmac, timingSafeEqual } from "node:crypto";

/** O estado que os dois produtos guardam: quatro valores, nunca mais. */
export type BillingStatus = "pending" | "active" | "past_due" | "cancelled";

/*
  O estado de cancelamento vem nas duas grafias. A referência da API não fixa
  o enum (o exemplo do PUT só mostra "pending"), e o Mercado Pago escreve
  "cancelled" em parte da documentação e "canceled" em outra. Ler as duas é o
  que impede o pior caso: uma grafia não reconhecida cairia no `else` de
  statusFrom e uma assinatura cancelada seria lida como ativa.

  Para escrever, CANCEL_STATES é a ordem de tentativa (lib/flow/billing.ts,
  lib/maintenance/billing.ts).
*/
export const CANCEL_STATES = ["cancelled", "canceled"] as const;
const isCancelled = (status: string) => (CANCEL_STATES as readonly string[]).includes(status);

/** Uma assinatura, como o Mercado Pago a relata. */
export interface Preapproval {
  id: string;
  status: "pending" | "authorized" | "paused" | "cancelled" | "canceled";
  external_reference?: string;
  next_payment_date?: string;
}

/** Uma cobrança mensal de uma assinatura (um "authorized payment"). */
export interface Charge {
  id: number | string;
  preapproval_id: string;
  /** scheduled, processed, recycling (falhou, sendo retentada), cancelled. */
  status?: string;
  date_created?: string;
  payment?: { status?: string };
}

/**
 * O estado que guardamos. Uma assinatura autorizada está ativa: o Mercado
 * Pago validou o cartão e o cobra sozinho. A última cobrança ter falhado, ou
 * a assinatura estar pausada, deixa em atraso.
 */
export function statusFrom(
  subscription: Pick<Preapproval, "status">,
  last?: Pick<Charge, "status" | "payment">,
): BillingStatus {
  if (isCancelled(subscription.status)) return "cancelled";
  if (subscription.status === "pending") return "pending";
  if (subscription.status === "paused") return "past_due";
  // refunded/charged_back: uma cobrança que foi aprovada e depois revertida
  // (estorno, contestação) não é mais dinheiro em caixa — a mesma razão que
  // paidPeriodEnd nunca a conta como paga.
  const failed =
    last?.status === "recycling" ||
    last?.payment?.status === "rejected" ||
    last?.payment?.status === "cancelled" ||
    last?.payment?.status === "refunded" ||
    last?.payment?.status === "charged_back";
  return failed ? "past_due" : "active";
}

/**
 * A mais recente de uma lista de cobranças, pela data que o Mercado Pago deu
 * (ISO 8601, que ordena como texto). Uma cobrança sem data vai para o fim:
 * não é ela que decide o estado de quem tem cobrança datada.
 */
export const latestCharge = <T extends Pick<Charge, "date_created">>(charges: readonly T[] | undefined): T | undefined =>
  [...(charges ?? [])].sort((a, b) => String(b.date_created ?? "").localeCompare(String(a.date_created ?? "")))[0];

/**
 * A assinatura HMAC de um aviso (x-signature: "ts=…,v1=…"): HMAC-SHA256, com
 * o segredo do painel do Mercado Pago, de
 * "id:{data.id};request-id:{x-request-id};ts:{ts};" — uma parte sai do
 * molde quando o seu valor não vem. Sem segredo, sem assinatura, ou com
 * assinatura que não bate: não é do Mercado Pago.
 *
 * O segredo entra por argumento para que o teste não precise do ambiente.
 */
export function verifyNotice(
  secret: string | undefined,
  signature: string | null,
  requestId: string | null,
  dataId: string | null,
): boolean {
  if (!secret?.trim() || !signature) return false;
  const parts = new Map(
    signature.split(",").map((part) => {
      const [key, ...value] = part.split("=");
      return [key.trim(), value.join("=").trim()] as const;
    }),
  );
  const ts = parts.get("ts");
  const v1 = parts.get("v1");
  if (!ts || !v1) return false;
  // O Mercado Pago documenta o data.id em minúsculas quando é alfanumérico.
  const id = dataId && /^[a-z0-9]+$/i.test(dataId) ? dataId.toLowerCase() : dataId;
  const manifest = `${id ? `id:${id};` : ""}${requestId ? `request-id:${requestId};` : ""}ts:${ts};`;
  const expected = Buffer.from(createHmac("sha256", secret).update(manifest).digest("hex"));
  const given = Buffer.from(v1);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/**
 * O endereço de volta que vai ao Mercado Pago. Ele recusa um back_url que não
 * seja https, e a URL do site é http://localhost no desenvolvimento e o
 * endereço de um preview num preview — então o que não for https cai no
 * domínio canônico. Sem isto a assinatura falha antes de o cartão ser lido, e
 * a recusa chega parecendo um cartão recusado.
 */
export function httpsUrl(path: string, siteUrl: string, canonical: string): string {
  const url = new URL(path, siteUrl);
  return url.protocol === "https:" ? url.toString() : new URL(path, canonical).toString();
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

/**
 * A mesma regra de httpsUrl, mas recusando o domínio de produção quando quem
 * pergunta diz estar em teste. Achado real ao validar a manutenção contra a
 * API (Tarefa 6): o fallback de httpsUrl por si só manda o aviso de uma
 * assinatura de teste para o webhook de PRODUÇÃO, de verdade — o domínio
 * canônico é sempre um domínio real, teste nenhum o alcança de volta.
 *
 * Em teste: localhost (ou qualquer http) falha aqui, antes de qualquer
 * chamada ao Mercado Pago, em vez de cair em produção silenciosamente; um
 * endereço https que seja o próprio domínio canônico (ou um subdomínio dele)
 * também falha. Qualquer outro https é um endereço de teste válido. Fora do
 * modo de teste, o comportamento é idêntico ao de httpsUrl — isto não muda
 * nada em produção nem no Pulse, que continua chamando httpsUrl direto.
 */
export function testSafeUrl(path: string, siteUrl: string, canonical: string, isTestMode: boolean): string {
  if (!isTestMode) return httpsUrl(path, siteUrl, canonical);

  let url: URL;
  try {
    url = new URL(path, siteUrl);
  } catch {
    throw new Error(`Cobrança de teste fechada: endereço de site inválido (${siteUrl}).`);
  }
  if (url.protocol !== "https:" || LOCAL_HOSTS.has(url.hostname)) {
    throw new Error(
      `Cobrança de teste fechada: defina um endereço https alcançável e específico para teste (nunca localhost) antes de validar contra a API real do Mercado Pago. Recebido: ${siteUrl}`,
    );
  }
  const productionHost = new URL(canonical).hostname;
  if (url.hostname === productionHost || url.hostname.endsWith(`.${productionHost}`)) {
    throw new Error(`Cobrança de teste fechada: o endereço aponta para o domínio de produção (${productionHost}). Use um endereço de teste.`);
  }
  return url.toString();
}

/*
  Até quando o mês já pago vale — nunca lido de next_payment_date. Esse campo
  é, pela própria documentação do Mercado Pago, só a "date of the next
  payment debit": uma data de agendamento futuro, não um registro do que já
  foi pago. Uma assinatura cancelada não tem mais nenhum débito agendado, e
  billing.ts:syncStanding escrevia esse campo (ou a ausência dele) direto em
  current_period_end, qualquer que fosse o status — o que apagava, no exato
  momento em que uma clínica cancelava, a data que lib/flow/access.ts:
  paidThrough usa para manter o Pulse funcionando até o fim do mês já pago.
*/

/*
 * Evidência POSITIVA, nunca ausência de uma lista de estados negativos: a
 * própria documentação de assinaturas do Mercado Pago diz que uma parcela
 * recusada fica em "recycling" sendo retentada e, esgotadas as tentativas,
 * passa para "processed" mesmo associada a um pagamento recusado —
 * "processed" é só "o ciclo de tentativas terminou", nunca prova de
 * pagamento. Uma lista do que É proibido (rejected, cancelled…) sempre deixa
 * de fora o que ainda não se sabe (pending, in_process, authorized sem
 * captura, ou nenhum payment.status nenhum) — e isso contaria como pago.
 * Por isso a prova exigida é a única positiva que existe: "approved".
 */
const CONFIRMED_PAYMENT = "approved";

/** Um mês a partir de `date`, com o dia preso ao último dia do mês de destino quando ele não existir (31 de janeiro -> 28/29 de fevereiro, nunca 2/3 de março). */
function addOneMonthClamped(date: Date): Date {
  const day = date.getUTCDate();
  const firstOfMonth = new Date(date);
  firstOfMonth.setUTCDate(1); // antes de somar o mês, para a soma nunca estourar por conta do dia.
  firstOfMonth.setUTCMonth(firstOfMonth.getUTCMonth() + 1);
  const daysInTargetMonth = new Date(Date.UTC(firstOfMonth.getUTCFullYear(), firstOfMonth.getUTCMonth() + 1, 0)).getUTCDate();
  firstOfMonth.setUTCDate(Math.min(day, daysInTargetMonth));
  return firstOfMonth;
}

/**
 * O fim do período que a cobrança CONFIRMADA mais recente cobre: um ciclo —
 * sempre mensal, a única cadência que createSubscription usa, com o dia
 * preso ao mês de destino (addOneMonthClamped) — a partir da data dessa
 * cobrança. "Confirmada" é status "processed" com payment.status
 * exatamente "approved"; qualquer outra coisa (pendente, em processamento,
 * autorizada sem captura, recusada, estornada, contestada, ou sem
 * informação nenhuma) não conta, e sem nenhuma cobrança confirmada o
 * resultado é null — nunca um mês inventado. Puro: não decide o que isso
 * significa para o acesso (lib/flow/access.ts), só o que uma cobrança
 * confirmada, de verdade, paga.
 */
export function paidPeriodEnd(charges: readonly Pick<Charge, "status" | "date_created" | "payment">[] | undefined): string | null {
  const confirmed = (charges ?? []).filter((c) => c.status === "processed" && c.payment?.status === CONFIRMED_PAYMENT);
  const last = latestCharge(confirmed);
  if (!last?.date_created) return null;
  const paidAt = new Date(last.date_created);
  if (!Number.isFinite(paidAt.getTime())) return null;
  return addOneMonthClamped(paidAt).toISOString();
}

/*
  O que vai no corpo de um PUT /preapproval/{id}. Montado aqui, puro, porque é
  onde está o risco que nenhum tipo pega: um campo a mais muda a cobrança de
  uma clínica ou de um cliente de site. Em particular `auto_recurring` nunca
  aparece — é ele que guarda o valor de cada assinatura, de cada produto.
*/

/** Os corpos a tentar para cancelar, na ordem (as duas grafias do enum). */
export const cancelBodies = (): { status: string }[] => CANCEL_STATES.map((status) => ({ status }));

/**
 * Só um 400 vale tentar com a outra grafia: é a resposta de um valor
 * recusado. Um 401, um 404 ou uma indisponibilidade responderiam o mesmo às
 * duas, e repetir só esconderia o erro de verdade.
 */
export const retryOtherSpelling = (status: number) => status === 400;

/**
 * O corpo de uma troca de cartão. Só o token — e, numa assinatura que o
 * Mercado Pago pausou depois de cobranças falhadas, o status de volta para
 * `authorized`, ou o cartão novo ficaria lá sem ser cobrado.
 */
export function cardChangeBody(current: Preapproval["status"], cardToken: string): Record<string, string> {
  return { card_token_id: cardToken, ...(current === "paused" ? { status: "authorized" } : {}) };
}

/*
  A troca de cartão, passo a passo, sem rede.

  A ordem é a regra inteira: ler, mandar, conferir. O que decide tudo é onde o
  cartão já saiu daqui — depois do PUT nada mais pode ser relatado como falha,
  porque a troca pode já estar valendo e uma segunda tentativa pousaria outro
  cartão em cima dela.

  Por isso o passo a passo mora aqui, puro, com as chamadas entrando por
  argumento: assim um teste prova o que nenhuma chamada real prova de forma
  barata — que um 429 depois do PUT não vira erro, e que repetir a leitura não
  repete o PUT (tests/card-change.test.mjs). billing.ts liga as chamadas de
  verdade.
*/

/** Um id do Mercado Pago, como ele os escreve. */
export const PROVIDER_ID = /^[\w-]{1,64}$/;
/** Um token de cartão do Mercado Pago, como o Brick o faz. */
export const CARD_TOKEN = /^[\w-]{8,128}$/;

/**
 * Como terminou uma troca de cartão. A distinção que importa é se o cartão
 * novo chegou ao Mercado Pago: a partir daí, nada é falha.
 */
export type CardChange =
  /** Recusado aqui, antes de qualquer chamada: o id ou o token não são um. Nada foi mandado. */
  | { outcome: "refused" }
  /** O Mercado Pago tem esta assinatura cancelada e não aceita mudanças. Nada foi mandado. */
  | { outcome: "cancelled" }
  /** Aceito, e a assinatura lida de volta depois. */
  | { outcome: "changed"; status: BillingStatus }
  /** Aceito, mas o Mercado Pago não respondeu à releitura (um 429, uma indisponibilidade). */
  | { outcome: "unconfirmed" };

/**
 * A releitura depois de o Mercado Pago já ter aceitado uma mudança.
 *
 * Só a leitura se repete, e só uma vez. Um GET não muda nada, então perguntar
 * de novo é seguro; o PUT que já passou nunca é mandado duas vezes. Sem
 * resposta nas duas, devolve null — que quem chamou lê como "ainda não
 * confirmado", nunca como "falhou".
 */
export async function confirmedStatus(
  read: () => Promise<BillingStatus | null>,
  wait: () => Promise<void>,
): Promise<BillingStatus | null> {
  try {
    return await read();
  } catch {
    await wait();
    try {
      return await read();
    } catch {
      return null;
    }
  }
}

/**
 * Cancela uma assinatura, passo a passo, sem rede: tenta cada grafia de
 * cancelamento via PUT, e um 400 (valor recusado) tenta a seguinte; qualquer
 * outra recusa sobe como veio, sem tentar a outra grafia nem confirmar.
 * Depois que uma tentativa é aceita, nada mais é relatado como falha — a
 * releitura (`confirm`) já é segura (confirmedStatus).
 *
 * `send` recebe um corpo e levanta um erro com `status` quando o Mercado
 * Pago recusa — o mesmo contrato que o erro de cada produto já tem, sem este
 * módulo precisar conhecer a classe de erro de nenhum dos dois.
 *
 * O Pulse (flow/billing.ts) e as Assinaturas de Sites (maintenance/billing.ts)
 * ligam as chamadas de verdade; só a ordem e a decisão de repetir moram aqui.
 */
export async function runCancel(
  providerId: string,
  calls: {
    send: (body: { status: string }) => Promise<void>;
    confirm: () => Promise<BillingStatus | null>;
  },
): Promise<BillingStatus | null> {
  if (!PROVIDER_ID.test(providerId)) return null;
  let refusal: unknown;
  for (const body of cancelBodies()) {
    try {
      await calls.send(body);
      refusal = undefined;
      break;
    } catch (error) {
      const status = (error as { status?: unknown } | null)?.status;
      if (typeof status !== "number" || !retryOtherSpelling(status)) throw error;
      refusal = error;
    }
  }
  if (refusal) throw refusal;
  return calls.confirm();
}

/**
 * Aponta a assinatura para outro cartão. `read` e `send` falhando levantam o
 * erro, porque aí nada saiu daqui; de `send` em diante o erro não existe mais
 * como resposta: ou a assinatura é lida de volta (`changed`), ou fica
 * `unconfirmed`.
 */
export async function runCardChange(
  providerId: string,
  cardToken: string,
  calls: {
    read: () => Promise<Pick<Preapproval, "status">>;
    send: (body: Record<string, string>) => Promise<void>;
    confirm: () => Promise<BillingStatus | null>;
  },
): Promise<CardChange> {
  if (!PROVIDER_ID.test(providerId) || !CARD_TOKEN.test(cardToken)) return { outcome: "refused" };
  const current = await calls.read();
  if (statusFrom(current) === "cancelled") return { outcome: "cancelled" };
  await calls.send(cardChangeBody(current.status, cardToken));
  const status = await calls.confirm();
  return status === null ? { outcome: "unconfirmed" } : { outcome: "changed", status };
}

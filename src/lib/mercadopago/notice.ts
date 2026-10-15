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
  const failed =
    last?.status === "recycling" || last?.payment?.status === "rejected" || last?.payment?.status === "cancelled";
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

import type { ChargeBucket } from "./charge-status";

/*
  O cupom de representante, puro: nenhuma rede, nenhum Supabase. A decisão de
  um cupom poder ou não se aplicar a uma cobrança — e por quanto — vive toda
  aqui, no mesmo espírito de lib/billing/create-charge.ts.
*/

export type DiscountType = "percent" | "fixed";

export interface CouponRow {
  id: string;
  active: boolean;
  discount_type: DiscountType;
  discount_percent: number | null;
  discount_fixed_cents: number | null;
  valid_from: string;
  valid_until: string | null;
  max_uses: number | null;
}

/** Código em caixa alta, sem espaço nas pontas — a forma em que todo cupom é guardado e procurado. */
export const normalizeCode = (input: string): string => input.trim().toUpperCase();

/**
 * Lista vazia de serviços elegíveis vale para qualquer cobrança, inclusive
 * uma sem serviço (descrição livre). Uma lista restrita só aceita um dos
 * serviços nela — nunca uma cobrança sem serviço, que não tem como estar
 * "na lista".
 */
export function isServiceEligible(eligibleServiceIds: string[], serviceId: string | null): boolean {
  if (eligibleServiceIds.length === 0) return true;
  return serviceId !== null && eligibleServiceIds.includes(serviceId);
}

/** O desconto de um cupom sobre um valor: percentual arredonda, fixo é o próprio valor em centavos. */
export function discountCentsFor(
  coupon: Pick<CouponRow, "discount_type" | "discount_percent" | "discount_fixed_cents">,
  amountCents: number,
): number {
  if (coupon.discount_type === "percent") {
    return Math.round((amountCents * (coupon.discount_percent ?? 0)) / 100);
  }
  return coupon.discount_fixed_cents ?? 0;
}

/** Quanto tempo uma cobrança pendente ainda reserva a vaga de um cupom antes de parar de contar. */
export const PENDING_RESERVATION_TTL_MS = 48 * 60 * 60 * 1000;

/**
 * Quantas vezes um cupom já foi "usado" para fins de `max_uses`: aprovada e
 * reembolsada contam para sempre (reembolso nunca libera a vaga de volta);
 * pendente só enquanto estiver dentro da janela de reserva; rejeitada e
 * cancelada nunca contam.
 */
export function effectiveUses(
  charges: { status: ChargeBucket; created_at: string }[],
  nowMs: number,
  pendingTtlMs: number,
): number {
  return charges.filter((charge) => {
    if (charge.status === "approved" || charge.status === "refunded") return true;
    if (charge.status === "pending") return nowMs - Date.parse(charge.created_at) < pendingTtlMs;
    return false;
  }).length;
}

/**
 * Meia-noite e o último instante de um dia (`"YYYY-MM-DD"`), em America/Sao_Paulo
 * (UTC-3, sem horário de verão desde 2019) — não em UTC. Quem digita "30/11" num
 * campo de data pensa no fuso daqui; é esse instante, não a meia-noite UTC do
 * mesmo texto, que valid_from/valid_until precisam guardar (coupon-audit.ts e
 * actions.ts) e que CouponForm.tsx precisa mostrar de volta.
 */
export const startOfDaySaoPaulo = (date: string): string => new Date(`${date}T00:00:00-03:00`).toISOString();
export const endOfDaySaoPaulo = (date: string): string => new Date(`${date}T23:59:59.999-03:00`).toISOString();

export type CouponRejectReason =
  | "not-found"
  | "inactive"
  | "representative-inactive"
  | "not-yet-valid"
  | "expired"
  | "service-not-eligible"
  | "service-recurring"
  | "discount-exceeds-amount"
  | "max-uses-reached";

export const COUPON_REJECT_MESSAGE: Record<CouponRejectReason, string> = {
  "not-found": "Cupom não encontrado.",
  inactive: "Este cupom está desativado.",
  "representative-inactive": "O representante deste cupom está desativado.",
  "not-yet-valid": "Este cupom ainda não começou a valer.",
  expired: "Este cupom já venceu.",
  "service-not-eligible": "Este cupom não vale para o serviço escolhido.",
  "service-recurring": "Este serviço é recorrente; cupons só se aplicam a cobranças únicas nesta etapa.",
  "discount-exceeds-amount": "O desconto deste cupom é maior ou igual ao valor da cobrança.",
  "max-uses-reached": "Este cupom já atingiu o limite de utilizações.",
};

export type ResolveCouponResult =
  | { applied: false }
  | { applied: false; error: string }
  | { applied: true; discountCents: number; finalCents: number };

/**
 * A decisão inteira de um cupom sobre uma cobrança: sem código, não aplica
 * nada e não recusa (o caminho normal, sem cupom). Com código, recusa na
 * primeira regra que falhar — nunca abate ou limita em silêncio.
 */
export function resolveCoupon(input: {
  couponCode: string | null;
  coupon: CouponRow | null;
  eligibleServiceIds: string[];
  chargeHistory: { status: ChargeBucket; created_at: string }[];
  /** Falso quando o representante deste cupom está desativado — mantém "cupom ativo ⇒ representante ativo" mesmo que a escrita em cascata (representatives.ts) falhe. */
  representativeActive: boolean;
  nowMs: number;
  amountCents: number;
  serviceId: string | null;
  serviceKind: "once" | "recurring" | null;
}): ResolveCouponResult {
  if (input.couponCode === null) return { applied: false };

  const reject = (reason: CouponRejectReason): ResolveCouponResult => ({ applied: false, error: COUPON_REJECT_MESSAGE[reason] });

  const { coupon } = input;
  if (!coupon) return reject("not-found");
  if (!coupon.active) return reject("inactive");
  if (!input.representativeActive) return reject("representative-inactive");
  if (input.nowMs < Date.parse(coupon.valid_from)) return reject("not-yet-valid");
  if (coupon.valid_until !== null && input.nowMs > Date.parse(coupon.valid_until)) return reject("expired");
  if (input.serviceKind === "recurring") return reject("service-recurring");
  if (!isServiceEligible(input.eligibleServiceIds, input.serviceId)) return reject("service-not-eligible");
  if (coupon.max_uses !== null) {
    const uses = effectiveUses(input.chargeHistory, input.nowMs, PENDING_RESERVATION_TTL_MS);
    if (uses >= coupon.max_uses) return reject("max-uses-reached");
  }

  const discountCents = discountCentsFor(coupon, input.amountCents);
  if (discountCents >= input.amountCents) return reject("discount-exceeds-amount");

  return { applied: true, discountCents, finalCents: input.amountCents - discountCents };
}

export interface RepresentativeChargeRow {
  client_id: string;
  status: ChargeBucket;
  amount_cents: number;
  discount_cents: number;
}

export interface RepresentativeStats {
  registeredReferrals: number;
  pendingCharges: number;
  confirmedSales: number;
  convertedClients: number;
  attributedRevenueCents: number;
  grantedDiscountCents: number;
}

/**
 * Os números do painel de um representante. "Clientes convertidos" conta
 * clientes distintos entre as aprovadas — nunca o total de cobranças — para
 * não repetir o mesmo cliente duas vezes se ele comprar de novo com o mesmo
 * cupom. Faturamento e desconto concedido somam só as aprovadas: reembolso
 * ainda ocupa a vaga do cupom (effectiveUses, acima), mas não é receita.
 */
export function representativeStats(charges: RepresentativeChargeRow[]): RepresentativeStats {
  const approved = charges.filter((charge) => charge.status === "approved");
  return {
    registeredReferrals: charges.length,
    pendingCharges: charges.filter((charge) => charge.status === "pending").length,
    confirmedSales: approved.length,
    convertedClients: new Set(approved.map((charge) => charge.client_id)).size,
    attributedRevenueCents: approved.reduce((total, charge) => total + charge.amount_cents, 0),
    grantedDiscountCents: approved.reduce((total, charge) => total + charge.discount_cents, 0),
  };
}

/**
 * O que um cliente em potencial manda, na própria voz dele, ao clicar no
 * link de indicação — nunca um texto do representante. É este texto que vai
 * dentro do link `wa.me` para o WhatsApp oficial da Wuavy (não o pessoal do
 * representante), montado por quem chama (representantes/page.tsx, que
 * conhece o número verificado em src/data/site.ts e o waLink que o constrói).
 * O código do cupom, em caixa alta, é como a administradora identifica
 * depois qual representante originou a indicação.
 */
export function prospectInviteMessage(couponCode: string): string {
  return `Olá! Quero usar o cupom ${normalizeCode(couponCode)} na Wuavy.`;
}

/**
 * O convite pronto para o representante compartilhar: o código e, embutido,
 * o link que abre uma conversa com a Wuavy (nunca com o representante) já
 * preenchida com prospectInviteMessage. `prospectWhatsappLink` é esse link
 * já pronto — esta função só monta o texto em volta dele.
 */
export function shareMessage(couponCode: string, prospectWhatsappLink: string): string {
  return `Use o cupom ${normalizeCode(couponCode)} na Wuavy e garanta seu desconto. Fale com a gente: ${prospectWhatsappLink}`;
}

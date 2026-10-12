/*
  O que a Wuavy mantém, e por quanto. Um lugar só: a página do cliente, o
  painel e o que vai ao Mercado Pago leem daqui.

  Este é um produto separado do Wuavy Pulse. O preço do Pulse está em
  src/lib/flow/access.ts e não tem relação com o desta página.
*/

/** O plano padrão. O administrador pode definir outro valor por cliente. */
export const PLAN = {
  name: "Manutenção Essencial",
  /** Em centavos, para dinheiro nunca ser um float. R$ 40,00/mês. */
  priceCents: 4_000,
  frequency: "mensal",
  includes: [
    "Manutenção básica do site: atualizações, backups e monitoramento.",
    "Correções técnicas: links quebrados, erros de layout, formulários que pararam.",
    "Até uma pequena alteração por mês: trocar um texto, uma imagem, um preço.",
  ],
  excludes: [
    "Domínio e hospedagem paga — ficam no nome de quem é dono do site.",
    "Mudanças maiores: páginas novas, redesenho, funcionalidades novas.",
    "Criação de conteúdo, campanhas e gestão de redes.",
  ],
} as const;

/** O valor padrão, em centavos. R$ 40/mês. */
export const DEFAULT_PRICE = PLAN.priceCents;

/** Os limites de um valor personalizado, em centavos (iguais aos do banco). */
export const MIN_PRICE = 500;
export const MAX_PRICE = 1_000_000;

export const MAINTENANCE_STATUSES = ["pending", "active", "past_due", "cancelled"] as const;
export type MaintenanceStatus = (typeof MAINTENANCE_STATUSES)[number];

export const STATUS_LABEL: Record<MaintenanceStatus, string> = {
  pending: "Aguardando autorização",
  active: "Ativa",
  past_due: "Pagamento atrasado",
  cancelled: "Cancelada",
};

/** As assinaturas que contam como receita recorrente: cobrando, mesmo que atrasado. */
export const isEarning = (status: MaintenanceStatus | null | undefined) => status === "active" || status === "past_due";

/** Uma cobrança que não entrou: o Mercado Pago a recusou, cancelou, ou está retentando. */
export const chargeFailed = (charge?: { status?: string; payment?: { status?: string } }) =>
  charge?.status === "recycling" || charge?.payment?.status === "rejected" || charge?.payment?.status === "cancelled";

/**
 * O status que guardamos, a partir do que o Mercado Pago relata. Uma
 * assinatura autorizada está ativa: o Mercado Pago validou o cartão e cobra
 * sozinho todo mês. A última cobrança falhar, ou a assinatura estar pausada,
 * deixa a assinatura atrasada.
 *
 * Função pura, e de propósito: é a regra que decide se um cliente está em
 * dia, e ela se lê e se testa sem rede nem banco.
 */
export function statusFrom(
  subscription: { status: string },
  last?: { status?: string; payment?: { status?: string } },
): MaintenanceStatus {
  if (subscription.status === "cancelled") return "cancelled";
  if (subscription.status === "pending") return "pending";
  if (subscription.status === "paused") return "past_due";
  return chargeFailed(last) ? "past_due" : "active";
}

/** Um status do banco, ou null quando o valor não é um. */
export function asMaintenanceStatus(value: string | null | undefined): MaintenanceStatus | null {
  return (MAINTENANCE_STATUSES as readonly string[]).includes(value ?? "") ? (value as MaintenanceStatus) : null;
}

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** Centavos para "R$ 40,00". */
export const brl = (cents: number) => money.format(cents / 100);

/** Centavos para "40,00" — o que o administrador digita e lê num campo. */
export const reais = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");

/**
 * "40", "40,00", "R$ 40,00" ou "1.240,50" em centavos. null quando não é um
 * valor que possamos cobrar (fora dos limites, ou não um número).
 */
export function parsePrice(input: string): number | null {
  const cleaned = input
    .replace(/[^\d.,]/g, "")
    // "1.240,50": o ponto é milhar, a vírgula é decimal.
    .replace(/\.(?=\d{3}\b)/g, "")
    .replace(",", ".");
  if (!cleaned) return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value)) return null;
  const cents = Math.round(value * 100);
  return cents >= MIN_PRICE && cents <= MAX_PRICE ? cents : null;
}

/*
  "9 de out. de 2026", no fuso de São Paulo: uma cobrança que o Mercado Pago
  marca para a madrugada não pode aparecer um dia adiantada para quem lê.
*/
const dateFormat = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "short", year: "numeric", timeZone: "America/Sao_Paulo" });

export const dateLabel = (iso: string | null | undefined) => (iso ? dateFormat.format(new Date(iso)) : "—");

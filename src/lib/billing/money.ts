/*
  O dinheiro do catálogo da agência Wuavy Cobranças: o que o cadastro de um
  serviço e o valor de uma cobrança leem e escrevem. Separado de
  lib/maintenance/plan.ts porque os limites são outros — um site custa mais
  que o teto da manutenção — mas o formato (centavos, nunca float) é o mesmo.
*/

/** Os limites de um preço, em centavos (iguais aos da migration 0018). */
export const MIN_PRICE = 500;
export const MAX_PRICE = 10_000_000;

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** Centavos para "R$ 1.500,00" (espaço comum, nunca o   que o Intl devolve). */
export const brl = (cents: number) => money.format(cents / 100).replace(" ", " ");

/** Centavos para "1500,00" — o que o administrador digita e lê num campo. */
export const reais = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");

/**
 * "40", "40,00", "R$ 40,00" ou "1.500,00" em centavos. null quando não é um
 * valor que possamos cobrar (fora dos limites, ou não um número).
 */
export function parsePrice(input: string): number | null {
  const cleaned = input
    .replace(/[^\d.,]/g, "")
    // "1.500,00": o ponto é milhar, a vírgula é decimal.
    .replace(/\.(?=\d{3}\b)/g, "")
    .replace(",", ".");
  if (!cleaned) return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value)) return null;
  const cents = Math.round(value * 100);
  return cents >= MIN_PRICE && cents <= MAX_PRICE ? cents : null;
}

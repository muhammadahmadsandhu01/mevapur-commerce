/**
 * Authoritative Money & Currency Arithmetic Utilities
 * Adheres strictly to backend integer/floating-point decimal precision.
 */

const EPSILON = 0.0000001;

/**
 * Rounds a monetary amount to 2 decimal places using backend-matching epsilon rounding.
 * Strictly preserves legitimate numeric zeros.
 */
export function roundMoney(amount: number | string | null | undefined): number {
  if (amount === 0 || amount === '0') return 0;
  const num = Number(amount);
  if (!Number.isFinite(num)) return 0;
  const rounded = Math.round((num + EPSILON) * 100) / 100;
  return Object.is(rounded, -0) ? 0 : Math.max(0, rounded);
}

/**
 * Formats a numeric monetary value for storefront presentation.
 */
export function formatMoney(
  amount: number | string | null | undefined,
  currency: string = 'PKR'
): string {
  const clean = roundMoney(amount);
  const formatted = clean.toLocaleString('en-PK', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });

  return `${currency} ${formatted}`;
}

/**
 * Calculates line total (unit price * quantity) safely rounded.
 */
export function calculateLineTotal(
  unitPrice: number | string | null | undefined,
  quantity: number | null | undefined
): number {
  const price = roundMoney(unitPrice);
  const qty = Math.max(0, Math.floor(Number(quantity) || 0));
  return roundMoney(price * qty);
}

/**
 * Computes subtotal from an array of items containing price and quantity.
 */
export function calculateSubtotal(
  items: Array<{ price?: number | string | null; quantity?: number | null }>
): number {
  if (!items || !Array.isArray(items) || items.length === 0) return 0;
  const rawSum = items.reduce((sum, item) => {
    return sum + calculateLineTotal(item.price, item.quantity);
  }, 0);
  return roundMoney(rawSum);
}

/**
 * Calculates discount amount ensuring it never exceeds the eligible subtotal.
 */
export function calculateEstimatedDiscount(
  rawDiscount: number | string | null | undefined,
  subtotal: number = 0
): number {
  const discount = roundMoney(rawDiscount);
  if (discount <= 0) return 0;
  return roundMoney(Math.min(discount, Math.max(0, subtotal)));
}

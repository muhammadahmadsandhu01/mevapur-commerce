// src/lib/checkout/pricing.ts

export interface PricingResult {
  subtotal: number;
  discountPercent: number;
  discountAmount: number;
  shippingCost: number;
  totalSavings: number;
  grandTotal: number;
}

const FREE_SHIPPING_THRESHOLD = 1500;
const SHIPPING_COST = 150;

export function calculatePricing(
  subtotal: number,
  discountPercent: number = 0
): PricingResult {
  const safeSubtotal = Math.max(0, subtotal);
  const safeDiscount = Math.max(0, discountPercent);

  const discountAmount = Number(
    ((safeSubtotal * safeDiscount) / 100).toFixed(2)
  );

  const afterDiscount = safeSubtotal - discountAmount;

  const shippingCost =
    afterDiscount >= FREE_SHIPPING_THRESHOLD
      ? 0
      : SHIPPING_COST;

  const grandTotal = Number(
    (afterDiscount + shippingCost).toFixed(2)
  );

  const totalSavings = Number(
    (
      discountAmount +
      (shippingCost === 0 ? SHIPPING_COST : 0)
    ).toFixed(2)
  );

  return {
    subtotal: safeSubtotal,
    discountPercent: safeDiscount,
    discountAmount,
    shippingCost,
    totalSavings,
    grandTotal,
  };
}
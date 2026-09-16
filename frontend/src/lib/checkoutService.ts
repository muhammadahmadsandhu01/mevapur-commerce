/**
 * Authoritative Checkout & Coupon Service
 * Manages checkout payload serialization, idempotency lifecycle, quote orchestration, and order verification.
 */

import api from './api.ts';
import type { CartItem } from '../store/cartStore.ts';
import type {
  AuthoritativeQuote,
  CheckoutQuoteRequest,
  CheckoutQuoteResponse,
  MarketConfigResponse,
} from '../types/commerce.ts';
import { normalizeMinorString, getCurrencyExponent, type MoneyExact } from './exactMoney.ts';

export interface CouponPreviewResult {
  code: string;
  type: string;
  value: number;
  discountAmount: number;
  estimatedDiscount: number;
  freeShipping: boolean;
  eligibleSubtotal: number;
  subtotal: number;
  newSubtotal: number;
  expiresAt: string;
  isNonBindingPreview: boolean;
}

export interface ShippingAddressInput {
  fullName: string;
  phone: string;
  address: string;
  addressLine2?: string;
  city: string;
  province?: string;
  postalCode?: string;
  country?: string;
  countryCode?: string;
}

export interface CheckoutPayload {
  items: Array<{
    productId: string;
    variantId?: string;
    quantity: number;
  }>;
  shippingAddress: {
    fullName: string;
    phone: string;
    address: string;
    addressLine2?: string;
    city: string;
    province?: string;
    postalCode?: string;
    country?: string;
    countryCode?: string;
  };
  paymentMethod: string;
  currency?: string;
  couponCode?: string;
  customerNote?: string;
  quoteToken?: string;
  shippingServiceLevel?: string;
}

export interface CreatedOrderResult {
  _id: string;
  orderId: string;
  totalAmount: number;
  totalAmountExact?: MoneyExact;
  subtotal?: number;
  subtotalExact?: MoneyExact;
  shippingCost?: number;
  shippingCostExact?: MoneyExact;
  taxAmount?: number;
  taxAmountExact?: MoneyExact;
  discount?: number;
  discountExact?: MoneyExact;
  currency?: string;
  paymentMethod: string;
  orderStatus: string;
  paymentStatus: string;
  items: Array<{
    productId: string;
    name: string;
    price: number;
    priceExact?: MoneyExact;
    quantity: number;
    variantId?: string;
    originCountry?: string;
    locationCode?: string;
    shipmentGroup?: string;
  }>;
  shippingAddress: ShippingAddressInput;
  shippingQuote?: {
    serviceLevel?: string;
    zoneName?: string;
    deliveryMinDays?: number;
    deliveryMaxDays?: number;
    remoteArea?: boolean;
    deliveryPromise?: import('../types/commerce.ts').DeliveryPromiseExact;
    shipmentGroups?: import('../types/commerce.ts').QuoteShipmentGroup[];
  };
  createdAt: string;
}

/**
 * Validates a coupon preview with the public endpoint.
 * Never transmits userId or client-side calculated discounts.
 */
export async function validateCouponPreview(
  code: string,
  items: CartItem[],
  signal?: AbortSignal
): Promise<CouponPreviewResult> {
  const normalizedCode = String(code || '').trim().toUpperCase();
  if (!normalizedCode) {
    throw new Error('Please enter a valid coupon code');
  }

  const payload = {
    code: normalizedCode,
    items: items.map((item) => ({
      productId: item.productId || item.id,
      variantId: item.variantId || undefined,
      quantity: Math.max(1, Math.floor(item.quantity || 1)),
    })),
  };

  const response = await api.post('/coupons/validate', payload, { signal });
  if (!response.data?.success || !response.data?.data) {
    throw new Error(response.data?.message || 'Invalid coupon code');
  }

  return response.data.data as CouponPreviewResult;
}

/**
 * Fetches authoritative public market configuration.
 */
export async function fetchMarketConfig(signal?: AbortSignal): Promise<MarketConfigResponse> {
  const response = await api.get('/commerce/market', { signal });
  if (!response.data?.success || !response.data?.data) {
    throw new Error(response.data?.message || 'Failed to load market configuration');
  }
  return response.data.data as MarketConfigResponse;
}

/**
 * Fetches authoritative checkout quote from Phase 6A backend quote boundary.
 */
export async function fetchCheckoutQuote(
  request: CheckoutQuoteRequest,
  signal?: AbortSignal
): Promise<CheckoutQuoteResponse> {
  const response = await api.post('/commerce/checkout/quote', request, { signal });
  if (!response.data?.success || !response.data?.data?.quote) {
    throw new Error(response.data?.message || 'Failed to generate checkout quote');
  }
  return response.data as CheckoutQuoteResponse;
}

/**
 * Generates a cryptographically strong UUID v4 idempotency key.
 */
export function generateIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Computes a material customer intent fingerprint.
 * Excludes quoteToken so quote re-fetches for identical customer intent maintain the same durable idempotency key.
 */
export function computeCheckoutFingerprint(
  items: Array<{ productId?: string; id?: string; variantId?: string; quantity: number }>,
  shippingAddress: ShippingAddressInput,
  paymentMethod: string,
  shippingServiceLevel: string = 'standard',
  couponCode?: string
): string {
  const canonicalItems = items
    .map((i) => `${i.productId || i.id}:${i.variantId || ''}:${i.quantity}`)
    .sort()
    .join('|');

  const countryCode = (shippingAddress.countryCode || shippingAddress.country || '').trim().toUpperCase();
  const canonicalAddress = [
    shippingAddress.fullName?.trim() || '',
    shippingAddress.phone?.trim() || '',
    shippingAddress.address?.trim() || '',
    shippingAddress.city?.trim() || '',
    shippingAddress.province?.trim() || '',
    shippingAddress.postalCode?.trim() || '',
    countryCode,
  ].join(':');

  return `${canonicalItems}#${canonicalAddress}#${paymentMethod}#${shippingServiceLevel}#${couponCode?.trim().toUpperCase() || ''}`;
}

/**
 * Manages the state of a customer-confirmed checkout attempt.
 */
export interface CheckoutAttemptState {
  attemptId: string;
  idempotencyKey: string;
  fingerprint: string;
  createdAt: number;
}

let currentAttempt: CheckoutAttemptState | null = null;

export function getOrCreateCheckoutAttempt(
  items: Array<{ productId?: string; id?: string; variantId?: string; quantity: number }>,
  shippingAddress: ShippingAddressInput,
  paymentMethod: string,
  shippingServiceLevel: string = 'standard',
  couponCode?: string,
  forceNewAttempt = false
): CheckoutAttemptState {
  const fingerprint = computeCheckoutFingerprint(
    items,
    shippingAddress,
    paymentMethod,
    shippingServiceLevel,
    couponCode
  );

  if (
    forceNewAttempt ||
    !currentAttempt ||
    currentAttempt.fingerprint !== fingerprint ||
    Date.now() - currentAttempt.createdAt > 30 * 60 * 1000 // 30 min max attempt age
  ) {
    currentAttempt = {
      attemptId: generateIdempotencyKey(),
      idempotencyKey: generateIdempotencyKey(),
      fingerprint,
      createdAt: Date.now(),
    };
  }

  return currentAttempt;
}

export function clearCheckoutAttempt(): void {
  currentAttempt = null;
}

/**
 * Detects whether a newly received quote materially differs from the previously confirmed quote.
 * Compares exact authoritative integer minor units, currency, exponent, breakdown components,
 * Incoterm, duty prepaid treatment, destination country, and delivery estimates.
 */
export function detectMaterialQuoteChange(
  previousQuote: AuthoritativeQuote | null,
  newQuote: AuthoritativeQuote | null
): { changed: boolean; reason?: string } {
  if (!previousQuote || !newQuote) {
    return { changed: false };
  }

  // 1. Currency
  if ((previousQuote.currency || '').trim().toUpperCase() !== (newQuote.currency || '').trim().toUpperCase()) {
    return {
      changed: true,
      reason: `Currency changed from ${previousQuote.currency} to ${newQuote.currency}`,
    };
  }

  // 2. Exponent
  const prevExp = getCurrencyExponent(previousQuote.currency, previousQuote.totals.grandTotalExact?.exponent);
  const newExp = getCurrencyExponent(newQuote.currency, newQuote.totals.grandTotalExact?.exponent);
  if (prevExp !== newExp) {
    return {
      changed: true,
      reason: `Currency precision exponent changed from ${prevExp} to ${newExp}`,
    };
  }

  // 3-8. Exact Breakdown & Totals (Minor-unit string comparisons)
  try {
    const prevSubtotal = normalizeMinorString(previousQuote.totals.subtotalExact?.amountMinor);
    const newSubtotal = normalizeMinorString(newQuote.totals.subtotalExact?.amountMinor);
    if (prevSubtotal !== newSubtotal) {
      return {
        changed: true,
        reason: 'The items subtotal has been updated.',
      };
    }

    const prevDiscount = normalizeMinorString(previousQuote.totals.discountExact?.amountMinor || '0');
    const newDiscount = normalizeMinorString(newQuote.totals.discountExact?.amountMinor || '0');
    if (prevDiscount !== newDiscount) {
      return {
        changed: true,
        reason: 'The applied discount amount has been updated.',
      };
    }

    const prevShipping = normalizeMinorString(previousQuote.totals.shippingExact?.amountMinor);
    const newShipping = normalizeMinorString(newQuote.totals.shippingExact?.amountMinor);
    if (prevShipping !== newShipping) {
      return {
        changed: true,
        reason: 'Shipping rates for your destination have been updated.',
      };
    }

    const prevTax = normalizeMinorString(previousQuote.totals.taxExact?.amountMinor);
    const newTax = normalizeMinorString(newQuote.totals.taxExact?.amountMinor);
    if (prevTax !== newTax) {
      return {
        changed: true,
        reason: 'Taxes for your destination have changed.',
      };
    }

    const prevDuties = normalizeMinorString(previousQuote.totals.dutiesExact?.amountMinor || '0');
    const newDuties = normalizeMinorString(newQuote.totals.dutiesExact?.amountMinor || '0');
    if (prevDuties !== newDuties) {
      return {
        changed: true,
        reason: 'Customs duties for your destination have changed.',
      };
    }

    const prevGrandTotal = normalizeMinorString(previousQuote.totals.grandTotalExact?.amountMinor);
    const newGrandTotal = normalizeMinorString(newQuote.totals.grandTotalExact?.amountMinor);
    if (prevGrandTotal !== newGrandTotal) {
      return {
        changed: true,
        reason: 'The grand total payable amount has been updated by the server.',
      };
    }
  } catch {
    return { changed: true, reason: 'Authoritative quote pricing terms were updated.' };
  }

  // 9. Shipping Service Level
  const prevService = previousQuote.shipping?.selectedOption?.serviceLevel;
  const newService = newQuote.shipping?.selectedOption?.serviceLevel;
  if (prevService !== newService) {
    return {
      changed: true,
      reason: `Shipping service level changed to ${newService}`,
    };
  }

  // 10. Incoterm
  const prevIncoterm = previousQuote.taxesAndDuties?.incoterm || previousQuote.incoterm;
  const newIncoterm = newQuote.taxesAndDuties?.incoterm || newQuote.incoterm;
  if (prevIncoterm !== newIncoterm) {
    return {
      changed: true,
      reason: `Shipping Incoterm terms updated to ${newIncoterm}`,
    };
  }

  // 11. Tax classification
  const prevTaxType = previousQuote.taxesAndDuties?.taxType;
  const newTaxType = newQuote.taxesAndDuties?.taxType;
  if (prevTaxType !== newTaxType) {
    return {
      changed: true,
      reason: 'Tax classification has changed.',
    };
  }

  // 12. Destination Country
  const prevCountry = (previousQuote.destination?.countryCode || previousQuote.destination?.country || '').trim().toUpperCase();
  const newCountry = (newQuote.destination?.countryCode || newQuote.destination?.country || '').trim().toUpperCase();
  if (prevCountry !== newCountry) {
    return {
      changed: true,
      reason: `Destination country changed to ${newCountry}`,
    };
  }

  // 13. Material Delivery Estimate
  const prevEst = previousQuote.shipping?.selectedOption?.deliveryEstimate;
  const newEst = newQuote.shipping?.selectedOption?.deliveryEstimate;
  if (prevEst?.minDays !== newEst?.minDays || prevEst?.maxDays !== newEst?.maxDays) {
    return {
      changed: true,
      reason: 'Estimated delivery timeframe has changed.',
    };
  }

  return { changed: false };
}

/**
 * Serializes and sanitizes checkout submission payload.
 */
export function serializeCheckoutPayload(
  items: CartItem[],
  shippingAddress: ShippingAddressInput,
  paymentMethod: string,
  quoteTokenOrCouponCode?: string,
  shippingServiceLevelOrCustomerNote: string = 'standard',
  couponCode?: string,
  customerNote?: string,
  currency?: string
): CheckoutPayload {
  let effectiveQuoteToken: string | undefined = undefined;
  let effectiveServiceLevel: string = 'standard';
  let effectiveCouponCode: string | undefined = couponCode;
  let effectiveCustomerNote: string | undefined = customerNote;

  if (couponCode !== undefined || customerNote !== undefined || currency !== undefined || (quoteTokenOrCouponCode && quoteTokenOrCouponCode.length > 50)) {
    effectiveQuoteToken = quoteTokenOrCouponCode;
    effectiveServiceLevel = shippingServiceLevelOrCustomerNote || 'standard';
  } else if (shippingServiceLevelOrCustomerNote && !couponCode) {
    if (quoteTokenOrCouponCode && (quoteTokenOrCouponCode.startsWith('eyJ') || quoteTokenOrCouponCode.length > 50)) {
      effectiveQuoteToken = quoteTokenOrCouponCode;
      effectiveServiceLevel = shippingServiceLevelOrCustomerNote;
    } else {
      // Legacy signature: (items, address, paymentMethod, couponCode, customerNote)
      effectiveCouponCode = quoteTokenOrCouponCode;
      effectiveCustomerNote = shippingServiceLevelOrCustomerNote;
      effectiveQuoteToken = undefined;
      effectiveServiceLevel = 'standard';
    }
  } else {
    effectiveQuoteToken = quoteTokenOrCouponCode;
    effectiveServiceLevel = shippingServiceLevelOrCustomerNote || 'standard';
  }

  const cleanItems = items.map((i) => {
    const pId = String(i.productId || i.id).trim();
    const vId = i.variantId ? String(i.variantId).trim() : undefined;
    const qty = Math.min(50, Math.max(1, Math.floor(Number(i.quantity) || 1)));

    return {
      productId: pId,
      variantId: vId,
      quantity: qty,
    };
  });

  const country = String(shippingAddress.country || shippingAddress.countryCode || '').trim().slice(0, 100);
  const countryCode = String(shippingAddress.countryCode || shippingAddress.country || '').trim().toUpperCase().slice(0, 2);

  const cleanAddress = {
    fullName: String(shippingAddress.fullName || '').trim().slice(0, 100),
    phone: String(shippingAddress.phone || '').trim().slice(0, 20),
    address: String(shippingAddress.address || '').trim().slice(0, 300),
    addressLine2: shippingAddress.addressLine2 ? String(shippingAddress.addressLine2).trim().slice(0, 200) : undefined,
    city: String(shippingAddress.city || '').trim().slice(0, 100),
    province: shippingAddress.province ? String(shippingAddress.province).trim().slice(0, 100) : undefined,
    postalCode: shippingAddress.postalCode ? String(shippingAddress.postalCode).trim().slice(0, 20) : undefined,
    country,
    countryCode,
  };

  const payload: CheckoutPayload = {
    items: cleanItems,
    shippingAddress: cleanAddress,
    paymentMethod: String(paymentMethod).trim(),
    currency: currency ? String(currency).trim().toUpperCase().slice(0, 3) : undefined,
    shippingServiceLevel: effectiveServiceLevel,
  };

  if (effectiveQuoteToken && typeof effectiveQuoteToken === 'string' && effectiveQuoteToken.trim()) {
    payload.quoteToken = effectiveQuoteToken.trim().slice(0, 4096);
  }

  if (effectiveCouponCode && effectiveCouponCode.trim()) {
    payload.couponCode = effectiveCouponCode.trim().toUpperCase().slice(0, 50);
  }

  if (effectiveCustomerNote && effectiveCustomerNote.trim()) {
    payload.customerNote = effectiveCustomerNote.trim().slice(0, 500);
  }

  return payload;
}

/**
 * Submits an order with an authoritative Idempotency-Key header.
 */
export async function submitOrder(
  payload: CheckoutPayload,
  idempotencyKey: string,
  signal?: AbortSignal
): Promise<{ order: CreatedOrderResult; idempotentReplay: boolean }> {
  if (!idempotencyKey || idempotencyKey.length < 8) {
    throw new Error('A valid idempotency key is required to place an order');
  }

  const response = await api.post('/orders', payload, {
    headers: {
      'Idempotency-Key': idempotencyKey,
    },
    signal,
  });

  if (!response.data?.success || !response.data?.data?.order) {
    throw new Error(response.data?.message || 'Order creation failed');
  }

  return {
    order: response.data.data.order as CreatedOrderResult,
    idempotentReplay: Boolean(response.data.data.idempotentReplay),
  };
}

/**
 * Retrieves and verifies order details by canonical ID or reference.
 */
export async function getVerifiedOrder(
  orderIdOrRef: string,
  signal?: AbortSignal
): Promise<CreatedOrderResult> {
  const ref = String(orderIdOrRef || '').trim();
  if (!ref) {
    throw new Error('Missing order identifier');
  }

  const response = await api.get(`/orders/${encodeURIComponent(ref)}`, { signal });
  if (!response.data?.success || !response.data?.data?.order) {
    throw new Error(response.data?.message || 'Order not found');
  }

  return response.data.data.order as CreatedOrderResult;
}

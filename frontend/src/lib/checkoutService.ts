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
import { normalizeMinorString } from './exactMoney.ts';

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
  shippingServiceLevel?: 'standard' | 'express';
}

export interface CreatedOrderResult {
  _id: string;
  orderId: string;
  totalAmount: number;
  paymentMethod: string;
  orderStatus: string;
  paymentStatus: string;
  items: Array<{
    productId: string;
    name: string;
    price: number;
    quantity: number;
    variantId?: string;
  }>;
  shippingAddress: ShippingAddressInput;
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

  const countryCode = (shippingAddress.countryCode || shippingAddress.country || 'PK').trim().toUpperCase();
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
 * Compares exact authoritative integer minor units, currency, Incoterm, and service level.
 */
export function detectMaterialQuoteChange(
  previousQuote: AuthoritativeQuote | null,
  newQuote: AuthoritativeQuote | null
): { changed: boolean; reason?: string } {
  if (!previousQuote || !newQuote) {
    return { changed: false };
  }

  if (previousQuote.currency !== newQuote.currency) {
    return {
      changed: true,
      reason: `Currency changed from ${previousQuote.currency} to ${newQuote.currency}`,
    };
  }

  try {
    const prevGrandTotalMinor = normalizeMinorString(previousQuote.totals.grandTotalExact.amountMinor);
    const newGrandTotalMinor = normalizeMinorString(newQuote.totals.grandTotalExact.amountMinor);
    if (prevGrandTotalMinor !== newGrandTotalMinor) {
      return {
        changed: true,
        reason: 'The grand total payable amount has been updated by the server.',
      };
    }

    const prevShippingMinor = normalizeMinorString(previousQuote.totals.shippingExact.amountMinor);
    const newShippingMinor = normalizeMinorString(newQuote.totals.shippingExact.amountMinor);
    if (prevShippingMinor !== newShippingMinor) {
      return {
        changed: true,
        reason: 'Shipping rates for your destination have been updated.',
      };
    }

    const prevTaxMinor = normalizeMinorString(previousQuote.totals.taxExact.amountMinor);
    const newTaxMinor = normalizeMinorString(newQuote.totals.taxExact.amountMinor);
    if (prevTaxMinor !== newTaxMinor) {
      return {
        changed: true,
        reason: 'Taxes or duty assessments for your destination have changed.',
      };
    }

    const prevDutiesMinor = normalizeMinorString(previousQuote.totals.dutiesExact.amountMinor);
    const newDutiesMinor = normalizeMinorString(newQuote.totals.dutiesExact.amountMinor);
    if (prevDutiesMinor !== newDutiesMinor) {
      return {
        changed: true,
        reason: 'Customs duties or terms for your destination have changed.',
      };
    }
  } catch {
    return { changed: true, reason: 'Authoritative quote pricing terms were updated.' };
  }

  if (previousQuote.taxesAndDuties.incoterm !== newQuote.taxesAndDuties.incoterm) {
    return {
      changed: true,
      reason: `Shipping Incoterm terms updated to ${newQuote.taxesAndDuties.incoterm}`,
    };
  }

  if (previousQuote.shipping.selectedOption.serviceLevel !== newQuote.shipping.selectedOption.serviceLevel) {
    return {
      changed: true,
      reason: `Shipping service level changed to ${newQuote.shipping.selectedOption.serviceLevel}`,
    };
  }

  return { changed: false };
}

/**
 * Allowlisted serializer for checkout requests.
 * Strictly preserves exact fields and prevents prototype pollution.
 */
export function serializeCheckoutPayload(
  items: CartItem[],
  shippingAddress: ShippingAddressInput,
  paymentMethod: string,
  quoteToken?: string,
  shippingServiceLevel: 'standard' | 'express' = 'standard',
  couponCode?: string,
  customerNote?: string,
  currency: string = 'PKR'
): CheckoutPayload {
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

  const country = String(shippingAddress.country || shippingAddress.countryCode || 'PK').trim().slice(0, 100);
  const countryCode = String(shippingAddress.countryCode || shippingAddress.country || 'PK').trim().toUpperCase().slice(0, 2);

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
    currency: String(currency || 'PKR').trim().toUpperCase().slice(0, 3),
    shippingServiceLevel,
  };

  if (quoteToken && typeof quoteToken === 'string' && quoteToken.trim()) {
    payload.quoteToken = quoteToken.trim().slice(0, 4096);
  }

  if (couponCode && couponCode.trim()) {
    payload.couponCode = couponCode.trim().toUpperCase().slice(0, 50);
  }

  if (customerNote && customerNote.trim()) {
    payload.customerNote = customerNote.trim().slice(0, 500);
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

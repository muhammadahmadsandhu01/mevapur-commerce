/**
 * Authoritative Checkout & Coupon Service
 * Manages checkout payload serialization, idempotency lifecycle, coupon preview, and order verification.
 */

import api from './api.ts';
import type { CartItem } from '../store/cartStore.ts';

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
  province: string;
  postalCode?: string;
  country?: string;
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
    province: string;
    postalCode?: string;
    country: string;
  };
  paymentMethod: 'cod' | 'bank_transfer' | 'raast' | 'stripe' | 'jazzcash' | 'easypaisa';
  currency?: string;
  couponCode?: string;
  customerNote?: string;
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
 * Generates a cryptographically strong UUID v4 idempotency key.
 */
export function generateIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback for older test environments
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Computes a fingerprint representing the material checkout intent.
 */
export function computeCheckoutFingerprint(
  items: CartItem[],
  shippingAddress: ShippingAddressInput,
  paymentMethod: string,
  couponCode?: string
): string {
  const canonicalItems = items
    .map((i) => `${i.productId || i.id}:${i.variantId || ''}:${i.quantity}`)
    .sort()
    .join('|');

  const canonicalAddress = [
    shippingAddress.fullName?.trim(),
    shippingAddress.phone?.trim(),
    shippingAddress.address?.trim(),
    shippingAddress.city?.trim(),
    shippingAddress.province?.trim(),
    shippingAddress.postalCode?.trim(),
    shippingAddress.country?.trim() || 'PK',
  ].join(':');

  return `${canonicalItems}#${canonicalAddress}#${paymentMethod}#${couponCode?.trim().toUpperCase() || ''}`;
}

/**
 * Allowlisted serializer for checkout requests.
 * Rejects arbitrary prototype pollution and omits all internal or untrusted fields.
 */
export function serializeCheckoutPayload(
  items: CartItem[],
  shippingAddress: ShippingAddressInput,
  paymentMethod: 'cod' | 'bank_transfer' | 'raast' | 'stripe' | 'jazzcash' | 'easypaisa',
  couponCode?: string,
  customerNote?: string,
  currency: string = 'PKR'
): CheckoutPayload {
  const cleanItems = items.map((i) => {
    const pId = String(i.productId || i.id).trim();
    const vId = i.variantId ? String(i.variantId).trim() : undefined;
    const qty = Math.min(20, Math.max(1, Math.floor(Number(i.quantity) || 1)));

    return {
      productId: pId,
      variantId: vId,
      quantity: qty,
    };
  });

  const cleanAddress = {
    fullName: String(shippingAddress.fullName || '').trim().slice(0, 100),
    phone: String(shippingAddress.phone || '').trim().slice(0, 20),
    address: String(shippingAddress.address || '').trim().slice(0, 300),
    addressLine2: shippingAddress.addressLine2 ? String(shippingAddress.addressLine2).trim().slice(0, 200) : undefined,
    city: String(shippingAddress.city || '').trim().slice(0, 100),
    province: String(shippingAddress.province || '').trim().slice(0, 100),
    postalCode: shippingAddress.postalCode ? String(shippingAddress.postalCode).trim().slice(0, 20) : undefined,
    country: String(shippingAddress.country || 'PK').trim().slice(0, 100),
  };

  const payload: CheckoutPayload = {
    items: cleanItems,
    shippingAddress: cleanAddress,
    paymentMethod,
    currency: String(currency || 'PKR').trim().toUpperCase().slice(0, 3),
  };

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

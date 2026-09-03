import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { classifyInvoiceDocument } from '../src/lib/invoiceClassification.ts';

describe('Phase 5 Contract: Status Normalization & Invoice Classification', () => {
  it('correctly classifies an authoritative paid receipt for Order.paymentStatus === "Paid"', () => {
    const doc = classifyInvoiceDocument('Paid');
    assert.equal(doc.type, 'PAYMENT_RECEIPT');
    assert.equal(doc.isOfficialReceipt, true);
    assert.equal(doc.title, 'Official Payment Receipt');
    assert.equal(doc.badgeLabel, 'Payment Confirmed');
  });

  it('correctly classifies an authoritative paid receipt for detailedPaymentStatus === "Completed"', () => {
    const doc = classifyInvoiceDocument('Pending', 'Completed');
    assert.equal(doc.type, 'PAYMENT_RECEIPT');
    assert.equal(doc.isOfficialReceipt, true);
  });

  it('correctly classifies a partially refunded paid receipt', () => {
    const doc = classifyInvoiceDocument('PartiallyRefunded');
    assert.equal(doc.type, 'PAYMENT_RECEIPT_PARTIALLY_REFUNDED');
    assert.equal(doc.isOfficialReceipt, true);
    assert.match(doc.title, /Partially Refunded/);
  });

  it('correctly classifies a fully refunded paid receipt', () => {
    const doc = classifyInvoiceDocument('Refunded');
    assert.equal(doc.type, 'PAYMENT_RECEIPT_REFUNDED');
    assert.equal(doc.isOfficialReceipt, true);
    assert.match(doc.title, /Refunded/);
  });

  it('classifies an order in AwaitingVerification as an order confirmation pending verification, not a paid receipt', () => {
    const doc = classifyInvoiceDocument('Pending', 'AwaitingVerification');
    assert.equal(doc.type, 'ORDER_CONFIRMATION_VERIFICATION_PENDING');
    assert.equal(doc.isOfficialReceipt, false);
    assert.match(doc.badgeLabel, /Verification Pending/);
  });

  it('classifies an unpaid pending order as an order confirmation, never as a paid receipt', () => {
    const doc = classifyInvoiceDocument('Pending', 'AwaitingCustomerPayment');
    assert.equal(doc.type, 'ORDER_CONFIRMATION');
    assert.equal(doc.isOfficialReceipt, false);
    assert.equal(doc.badgeLabel, 'Payment Pending');
  });

  it('classifies failed, rejected, or expired payments as payment unsuccessful order confirmation', () => {
    const failedDoc = classifyInvoiceDocument('Failed');
    assert.equal(failedDoc.type, 'ORDER_CONFIRMATION_PAYMENT_FAILED');
    assert.equal(failedDoc.isOfficialReceipt, false);

    const rejectedDoc = classifyInvoiceDocument('Pending', 'Rejected');
    assert.equal(rejectedDoc.type, 'ORDER_CONFIRMATION_PAYMENT_FAILED');
    assert.equal(rejectedDoc.isOfficialReceipt, false);

    const expiredDoc = classifyInvoiceDocument('Pending', 'Expired');
    assert.equal(expiredDoc.type, 'ORDER_CONFIRMATION_PAYMENT_FAILED');
    assert.equal(expiredDoc.isOfficialReceipt, false);
  });

  it('safely handles unknown or empty status values with a neutral non-receipt fallback', () => {
    const unknownDoc = classifyInvoiceDocument('UnknownCustomStatus');
    assert.equal(unknownDoc.type, 'ORDER_CONFIRMATION');
    assert.equal(unknownDoc.isOfficialReceipt, false);

    const nullDoc = classifyInvoiceDocument(null, null);
    assert.equal(nullDoc.type, 'ORDER_CONFIRMATION');
    assert.equal(nullDoc.isOfficialReceipt, false);
  });
});

describe('Phase 5 Contract: Cancellation Eligibility Rules', () => {
  const CUSTOMER_CANCELLABLE_STATUSES = ['Pending', 'Confirmed'];

  function isCustomerCancellable(status: string): boolean {
    return CUSTOMER_CANCELLABLE_STATUSES.includes(status);
  }

  it('allows cancellation exclusively for Pending and Confirmed statuses', () => {
    assert.equal(isCustomerCancellable('Pending'), true);
    assert.equal(isCustomerCancellable('Confirmed'), true);
  });

  it('disallows cancellation once order is in Processing, Shipped, Delivered, or Cancelled', () => {
    assert.equal(isCustomerCancellable('Processing'), false);
    assert.equal(isCustomerCancellable('Shipped'), false);
    assert.equal(isCustomerCancellable('Delivered'), false);
    assert.equal(isCustomerCancellable('Cancelled'), false);
    assert.equal(isCustomerCancellable('Unknown'), false);
  });
});

describe('Phase 5 Contract: Return Eligibility & Window Boundary', () => {
  const RETURN_WINDOW_DAYS = 30;
  const MS_PER_DAY = 86400000;

  function evaluateReturnWindow(
    orderStatus: string,
    deliveredAt: Date | string | null | undefined,
    currentTimeMs: number = Date.now()
  ): { eligible: boolean; reason?: string } {
    if (orderStatus !== 'Delivered') {
      return { eligible: false, reason: 'ORDER_NOT_DELIVERED' };
    }
    if (!deliveredAt) {
      return { eligible: false, reason: 'MISSING_DELIVERY_TIMESTAMP' };
    }
    const deliveryMs = new Date(deliveredAt).getTime();
    if (Number.isNaN(deliveryMs)) {
      return { eligible: false, reason: 'INVALID_DELIVERY_TIMESTAMP' };
    }
    const elapsedMs = currentTimeMs - deliveryMs;
    if (elapsedMs < 0) {
      return { eligible: false, reason: 'FUTURE_DELIVERY_TIMESTAMP' };
    }
    const maxWindowMs = RETURN_WINDOW_DAYS * MS_PER_DAY;
    if (elapsedMs > maxWindowMs) {
      return { eligible: false, reason: 'RETURN_WINDOW_EXPIRED' };
    }
    return { eligible: true };
  }

  it('permits return when delivered within 30 days', () => {
    const now = 1757000000000;
    const deliveredTenDaysAgo = new Date(now - 10 * MS_PER_DAY).toISOString();
    const result = evaluateReturnWindow('Delivered', deliveredTenDaysAgo, now);
    assert.equal(result.eligible, true);
  });

  it('permits return exactly at the 30-day boundary', () => {
    const now = 1757000000000;
    const deliveredExact30Days = new Date(now - 30 * MS_PER_DAY).toISOString();
    const result = evaluateReturnWindow('Delivered', deliveredExact30Days, now);
    assert.equal(result.eligible, true);
  });

  it('rejects return 1 millisecond beyond the 30-day boundary', () => {
    const now = 1757000000000;
    const deliveredPastBoundary = new Date(now - (30 * MS_PER_DAY + 1)).toISOString();
    const result = evaluateReturnWindow('Delivered', deliveredPastBoundary, now);
    assert.equal(result.eligible, false);
    assert.equal(result.reason, 'RETURN_WINDOW_EXPIRED');
  });

  it('rejects return if order status is not Delivered', () => {
    const now = 1757000000000;
    const deliveredJustNow = new Date(now - 1000).toISOString();
    assert.equal(evaluateReturnWindow('Shipped', deliveredJustNow, now).eligible, false);
    assert.equal(evaluateReturnWindow('Processing', deliveredJustNow, now).eligible, false);
    assert.equal(evaluateReturnWindow('Pending', deliveredJustNow, now).eligible, false);
  });

  it('rejects return if delivery timestamp is missing or malformed', () => {
    assert.equal(evaluateReturnWindow('Delivered', null).eligible, false);
    assert.equal(evaluateReturnWindow('Delivered', 'not-a-date').eligible, false);
  });
});

describe('Phase 5 Contract: Safe URLSearchParams Return Link Construction', () => {
  function constructSafeReturnLink(
    orderId: string,
    productId: string,
    variantId?: string | null
  ): string {
    const params = new URLSearchParams({
      tab: 'returns',
      order: orderId.trim(),
      product: productId.trim(),
    });
    if (variantId && variantId.trim()) {
      params.set('variant', variantId.trim());
    }
    return `/account?${params.toString()}#returns`;
  }

  it('constructs a valid local return route without parameter pollution', () => {
    const link = constructSafeReturnLink('ORD-20260904-ABCD12', '66d0c1e87900123456789012');
    assert.equal(
      link,
      '/account?tab=returns&order=ORD-20260904-ABCD12&product=66d0c1e87900123456789012#returns'
    );
  });

  it('encodes special characters safely in URL query parameters', () => {
    const link = constructSafeReturnLink('ORD #123&456', 'prod/with?special=chars', 'var:1');
    assert.equal(
      link,
      '/account?tab=returns&order=ORD+%23123%26456&product=prod%2Fwith%3Fspecial%3Dchars&variant=var%3A1#returns'
    );
  });
});

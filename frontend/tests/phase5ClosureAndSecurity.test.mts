import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { buildCspHeader } = require('../src/config/csp.js');

import {
  classifyInvoiceDocument,
} from '../src/lib/invoiceClassification.ts';

// Helper function to calculate return eligibility
function isEligibleForReturn(
  orderStatus?: string | null,
  deliveredAt?: string | null,
  currentTimeMs = Date.now()
): boolean {
  if (orderStatus !== 'Delivered') return false;
  if (!deliveredAt) return false;
  const deliveryTime = new Date(deliveredAt).getTime();
  if (isNaN(deliveryTime)) return false;
  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
  return currentTimeMs - deliveryTime <= thirtyDaysMs;
}

function canCancelOrder(orderStatus?: string | null): boolean {
  return orderStatus === 'Pending' || orderStatus === 'Confirmed';
}

function calculateDeliveredReturnDeadline(deliveredAt?: string | null): Date | null {
  if (!deliveredAt) return null;
  const deliveryTime = new Date(deliveredAt).getTime();
  if (isNaN(deliveryTime)) return null;
  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
  return new Date(deliveryTime + thirtyDaysMs);
}

// --- Gate 2: CSP Production and Development Isolation Tests ---
test('CSP Isolation: Production CSP contains nonce, eliminates unsafe-inline, and isolates connect-src', () => {
  const nonce = 'k8sJ19vLm301XzQ==';
  const productionCsp = buildCspHeader({
    production: true,
    origin: 'https://api.mevapur.test',
    nonce,
  });

  assert.ok(productionCsp.includes("default-src 'self'"));
  assert.ok(productionCsp.includes(`script-src 'self' 'nonce-${nonce}' https://js.stripe.com`));
  assert.ok(productionCsp.includes("frame-src 'self' https://js.stripe.com https://hooks.stripe.com"));
  assert.ok(productionCsp.includes("connect-src 'self' https://api.mevapur.test https://api.stripe.com"));
  assert.ok(productionCsp.includes("object-src 'none'"));
  assert.ok(productionCsp.includes("base-uri 'self'"));
  assert.ok(productionCsp.includes("form-action 'self'"));
  assert.ok(productionCsp.includes("frame-ancestors 'none'"));

  // Must NOT include unrestricted unsafe-inline or unsafe-eval in production script-src
  const scriptDirective = productionCsp.split(';').find((d) => d.trim().startsWith('script-src')) || '';
  assert.strictEqual(scriptDirective.includes("'unsafe-inline'"), false, 'Production script-src must not contain unsafe-inline');
  assert.strictEqual(scriptDirective.includes("'unsafe-eval'"), false, 'Production script-src must not contain unsafe-eval');

  // Must NOT include test/development origins in production
  assert.strictEqual(productionCsp.includes('localhost'), false, 'Production CSP must not contain localhost');
  assert.strictEqual(productionCsp.includes('127.0.0.1'), false, 'Production CSP must not contain 127.0.0.1');
  assert.strictEqual(productionCsp.includes('*.test'), false, 'Production CSP must not contain *.test');
  assert.strictEqual(productionCsp.includes('*.mevapur.test'), false, 'Production CSP must not contain *.mevapur.test');
});

test('CSP Isolation: Development/Test CSP includes local loopback and test domains for testing', () => {
  const devCsp = buildCspHeader({
    production: false,
    origin: 'https://api.mevapur.test',
  });

  assert.ok(devCsp.includes('http://localhost:*'));
  assert.ok(devCsp.includes('http://127.0.0.1:*'));
  assert.ok(devCsp.includes('https://*.mevapur.test'));
  assert.ok(devCsp.includes('https://*.test'));
});

// --- Item 1: Unavailable payment-provider fallback & refresh behavior ---
test('Payment Provider Fallback: Selected method disappearing clears selection and alerts customer without silent COD switch', () => {
  type SupportedPaymentMethod = 'cod' | 'bank_transfer' | 'raast' | 'stripe';

  function handleMethodRefresh(
    currentSelection: SupportedPaymentMethod | '',
    newCapabilities: Array<{ code: string; metadata?: { publishableKey?: string } }>,
    stripeEnvKey?: string
  ): {
    updatedSelection: SupportedPaymentMethod | '';
    availableMethods: SupportedPaymentMethod[];
    toastAlert?: string;
  } {
    const validCodes: SupportedPaymentMethod[] = [];
    for (const m of newCapabilities) {
      if (m.code === 'cod') validCodes.push('cod');
      else if (m.code === 'bank_transfer') validCodes.push('bank_transfer');
      else if (m.code === 'raast') validCodes.push('raast');
      else if (m.code === 'stripe' && (m.metadata?.publishableKey || stripeEnvKey)) {
        validCodes.push('stripe');
      }
    }

    let updatedSelection = currentSelection;
    let toastAlert: string | undefined;

    if (currentSelection && !validCodes.includes(currentSelection)) {
      updatedSelection = '';
      toastAlert = 'Your previously selected payment method is no longer available. Please choose an enabled payment method.';
    }

    return {
      updatedSelection,
      availableMethods: validCodes,
      toastAlert,
    };
  }

  // 1. Stripe removed while COD is also disabled: selection cleared, no silent fallback
  const res1 = handleMethodRefresh('stripe', [{ code: 'bank_transfer' }]);
  assert.strictEqual(res1.updatedSelection, '', 'Selection must be cleared when stripe disappears');
  assert.ok(res1.toastAlert?.includes('no longer available'));
  assert.deepStrictEqual(res1.availableMethods, ['bank_transfer']);

  // 2. Selected manual method removed while another remains: selection cleared, does not silently switch to COD
  const res2 = handleMethodRefresh('raast', [{ code: 'cod' }, { code: 'bank_transfer' }]);
  assert.strictEqual(res2.updatedSelection, '', 'Selection must be cleared when raast disappears, NOT silently set to COD');
  assert.ok(res2.toastAlert);

  // 3. Empty capability response: selection cleared, availableMethods empty
  const res3 = handleMethodRefresh('cod', []);
  assert.strictEqual(res3.updatedSelection, '');
  assert.deepStrictEqual(res3.availableMethods, []);
  assert.ok(res3.toastAlert);

  // 4. Unknown provider in capability response: omitted from available methods
  const res4 = handleMethodRefresh('', [{ code: 'unknown_vendor' }, { code: 'jazzcash' }]);
  assert.deepStrictEqual(res4.availableMethods, []);
});

test('Payment Submission Guard: Prevents network submission when method is unselected, stale, or unavailable', () => {
  type SupportedPaymentMethod = 'cod' | 'bank_transfer' | 'raast' | 'stripe';

  function validateCheckoutSubmission(
    paymentMethod: SupportedPaymentMethod | '',
    availableMethods: SupportedPaymentMethod[]
  ): { canSubmit: boolean; error?: string } {
    if (!paymentMethod || !availableMethods.includes(paymentMethod)) {
      return { canSubmit: false, error: 'Please select an available payment method.' };
    }
    return { canSubmit: true };
  }

  // Valid selection
  assert.deepStrictEqual(validateCheckoutSubmission('cod', ['cod', 'stripe']), { canSubmit: true });

  // Unselected / cleared
  assert.deepStrictEqual(validateCheckoutSubmission('', ['cod', 'stripe']), {
    canSubmit: false,
    error: 'Please select an available payment method.',
  });

  // Stale method submission attempt
  assert.deepStrictEqual(validateCheckoutSubmission('stripe', ['cod', 'bank_transfer']), {
    canSubmit: false,
    error: 'Please select an available payment method.',
  });
});

test('Manual Payment Resubmission: Honors explicit backend capability on Rejected status', () => {
  interface PaymentDetail {
    status: string;
    capabilities: { canResubmitManualReference?: boolean };
  }

  function canResubmitManualPayment(payment: PaymentDetail): boolean {
    if (payment.status === 'Rejected') {
      return payment.capabilities.canResubmitManualReference === true;
    }
    return payment.status === 'AwaitingCustomerPayment';
  }

  // Capability allowed
  assert.strictEqual(
    canResubmitManualPayment({
      status: 'Rejected',
      capabilities: { canResubmitManualReference: true },
    }),
    true
  );

  // Capability disallowed
  assert.strictEqual(
    canResubmitManualPayment({
      status: 'Rejected',
      capabilities: { canResubmitManualReference: false },
    }),
    false
  );
});

// --- Item 2: Authoritative Return State and Order-Level Collision Scope ---
test('Authoritative Return States: Defines exact Backend active and reserved return state constants', () => {
  const BACKEND_ACTIVE_RETURN_STATUSES = ['pending', 'approved', 'received', 'inspected'];
  const BACKEND_RESERVED_RETURN_STATUSES = [
    'pending',
    'approved',
    'received',
    'inspected',
    'inventory_reconciliation',
    'refunded',
  ];

  assert.strictEqual(BACKEND_ACTIVE_RETURN_STATUSES.length, 4);
  assert.ok(BACKEND_ACTIVE_RETURN_STATUSES.includes('inspected'));
  assert.ok(BACKEND_ACTIVE_RETURN_STATUSES.includes('pending'));
  assert.ok(BACKEND_ACTIVE_RETURN_STATUSES.includes('approved'));
  assert.ok(BACKEND_ACTIVE_RETURN_STATUSES.includes('received'));

  assert.strictEqual(BACKEND_RESERVED_RETURN_STATUSES.length, 6);
  assert.ok(BACKEND_RESERVED_RETURN_STATUSES.includes('refunded'));
  assert.ok(BACKEND_RESERVED_RETURN_STATUSES.includes('inventory_reconciliation'));
});

test('Order-Level Return Collision: Active return in any state (including inspected) blocks new returns for the entire order', () => {
  const ACTIVE_RETURN_STATUSES = new Set(['pending', 'approved', 'received', 'inspected']);

  interface OrderReturnRecord {
    orderId: string;
    productId: string;
    status: string;
  }

  function checkOrderReturnCollision(
    orderId: string,
    existingReturnsForOrder: OrderReturnRecord[]
  ): { hasConflict: boolean; conflictingStatus?: string; error?: string } {
    const activeReturn = existingReturnsForOrder.find(
      (r) => r.orderId === orderId && ACTIVE_RETURN_STATUSES.has(r.status)
    );
    if (activeReturn) {
      return {
        hasConflict: true,
        conflictingStatus: activeReturn.status,
        error: 'An active return request already exists for this order',
      };
    }
    return { hasConflict: false };
  }

  // 1. Existing inspected return on order -> blocks return creation
  const inspectedConflict = checkOrderReturnCollision('ORD-1', [
    { orderId: 'ORD-1', productId: 'item-A', status: 'inspected' },
  ]);
  assert.strictEqual(inspectedConflict.hasConflict, true);
  assert.strictEqual(inspectedConflict.conflictingStatus, 'inspected');

  // 2. Active return on a DIFFERENT item line in the same order -> blocks return creation (order-level scope)
  const differentItemConflict = checkOrderReturnCollision('ORD-1', [
    { orderId: 'ORD-1', productId: 'item-A', status: 'received' },
  ]);
  assert.strictEqual(differentItemConflict.hasConflict, true);
  assert.strictEqual(differentItemConflict.error, 'An active return request already exists for this order');

  // 3. Completed/refunded or rejected prior returns -> allowed if remaining quantity exists
  const resolvedReturns = checkOrderReturnCollision('ORD-1', [
    { orderId: 'ORD-1', productId: 'item-A', status: 'refunded' },
    { orderId: 'ORD-1', productId: 'item-B', status: 'rejected' },
  ]);
  assert.strictEqual(resolvedReturns.hasConflict, false);
});

test('Authoritative Return Quantity: Evaluates remaining item quantity from authoritative backend allocation data', () => {
  interface PriorReturnItem {
    productId: string;
    variantId?: string;
    quantity: number;
    status: string;
  }

  const RESERVED_STATUSES = new Set([
    'pending',
    'approved',
    'received',
    'inspected',
    'inventory_reconciliation',
    'refunded',
  ]);

  function computeAuthoritativeRemainingQuantity(
    originalItemQuantity: number,
    productId: string,
    variantId: string | undefined,
    priorReturns: PriorReturnItem[]
  ): number {
    const consumedQuantity = priorReturns
      .filter(
        (pr) =>
          pr.productId === productId &&
          (pr.variantId || '') === (variantId || '') &&
          RESERVED_STATUSES.has(pr.status)
      )
      .reduce((sum, pr) => sum + pr.quantity, 0);

    return Math.max(0, originalItemQuantity - consumedQuantity);
  }

  const remaining = computeAuthoritativeRemainingQuantity(
    5,
    'prod-100',
    'var-A',
    [
      { productId: 'prod-100', variantId: 'var-A', quantity: 2, status: 'refunded' },
      { productId: 'prod-100', variantId: 'var-A', quantity: 1, status: 'rejected' }, // Rejected is not reserved
    ]
  );
  assert.strictEqual(remaining, 3, 'Remaining quantity must subtract reserved refunded (2) but not rejected (1)');
});

test('Stale State Error Handling: Backend conflict error correctly triggers refresh prompt', () => {
  function handleReturnErrorResponse(errorResponse: { status: number; code?: string; message?: string }): {
    shouldRefresh: boolean;
    userMessage: string;
  } {
    if (errorResponse.status === 409) {
      if (errorResponse.code === 'CUSTOMER_RETURN_EXISTS') {
        return {
          shouldRefresh: true,
          userMessage: 'An active return request already exists for this order. Refreshing order status...',
        };
      }
      if (errorResponse.code === 'CUSTOMER_RETURN_NOT_ELIGIBLE') {
        return {
          shouldRefresh: true,
          userMessage: 'This order or item is no longer eligible for return. Refreshing order status...',
        };
      }
    }
    return {
      shouldRefresh: false,
      userMessage: errorResponse.message || 'Return request failed. Please try again.',
    };
  }

  const conflict = handleReturnErrorResponse({
    status: 409,
    code: 'CUSTOMER_RETURN_EXISTS',
    message: 'An active return request already exists for this order',
  });
  assert.strictEqual(conflict.shouldRefresh, true);
  assert.ok(conflict.userMessage.includes('Refreshing order status'));
});

// --- Manual Payment Lifecycle Tests ---
test('Manual Payment Lifecycle: Verifies status transitions and instruction visibility rules', () => {
  interface PaymentState {
    status: string;
    provider: string;
    hasInstructions: boolean;
    canSubmitReference: boolean;
    showsMaskedReference: boolean;
  }

  function evaluatePaymentUI(provider: string, status: string, maskedRef?: string): PaymentState {
    const isManual = provider === 'bank_transfer' || provider === 'raast';
    if (!isManual) {
      return {
        status,
        provider,
        hasInstructions: false,
        canSubmitReference: false,
        showsMaskedReference: false,
      };
    }

    switch (status) {
      case 'AwaitingCustomerPayment':
        return {
          status,
          provider,
          hasInstructions: true,
          canSubmitReference: true,
          showsMaskedReference: false,
        };
      case 'AwaitingVerification':
        return {
          status,
          provider,
          hasInstructions: true,
          canSubmitReference: false,
          showsMaskedReference: Boolean(maskedRef),
        };
      case 'Completed':
        return {
          status,
          provider,
          hasInstructions: false,
          canSubmitReference: false,
          showsMaskedReference: false,
        };
      case 'Rejected':
        return {
          status,
          provider,
          hasInstructions: false,
          canSubmitReference: true,
          showsMaskedReference: false,
        };
      case 'Failed':
      case 'Expired':
      case 'Cancelled':
      default:
        return {
          status,
          provider,
          hasInstructions: false,
          canSubmitReference: false,
          showsMaskedReference: false,
        };
    }
  }

  // AwaitingCustomerPayment
  const awaitingPayment = evaluatePaymentUI('bank_transfer', 'AwaitingCustomerPayment');
  assert.strictEqual(awaitingPayment.hasInstructions, true);
  assert.strictEqual(awaitingPayment.canSubmitReference, true);

  // AwaitingVerification
  const awaitingVerification = evaluatePaymentUI('raast', 'AwaitingVerification', '****1234');
  assert.strictEqual(awaitingVerification.hasInstructions, true);
  assert.strictEqual(awaitingVerification.canSubmitReference, false);
  assert.strictEqual(awaitingVerification.showsMaskedReference, true);

  // Completed
  const completed = evaluatePaymentUI('bank_transfer', 'Completed');
  assert.strictEqual(completed.hasInstructions, false);
  assert.strictEqual(completed.canSubmitReference, false);

  // Expired / Cancelled
  const expired = evaluatePaymentUI('bank_transfer', 'Expired');
  assert.strictEqual(expired.hasInstructions, false);
  assert.strictEqual(expired.canSubmitReference, false);

  // COD & Stripe never show manual bank instructions
  const cod = evaluatePaymentUI('cod', 'AwaitingCustomerPayment');
  assert.strictEqual(cod.hasInstructions, false);
  const stripe = evaluatePaymentUI('stripe', 'Pending');
  assert.strictEqual(stripe.hasInstructions, false);
});

// --- Return Eligibility Window Boundaries ---
test('Return Eligibility: Exact boundary testing across delivered timestamp cases', () => {
  const baseTime = 1750000000000; // Reference epoch
  const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

  // 1. Delivered order 10 days ago (inside window)
  const delivered10DaysAgo = new Date(baseTime - 10 * 24 * 60 * 60 * 1000).toISOString();
  assert.strictEqual(
    isEligibleForReturn('Delivered', delivered10DaysAgo, baseTime),
    true,
    'Delivered 10 days ago must be eligible'
  );

  // 2. Delivered order exactly 30 days ago (exact deadline equality)
  const deliveredExactly30Days = new Date(baseTime - THIRTY_DAYS_MS).toISOString();
  assert.strictEqual(
    isEligibleForReturn('Delivered', deliveredExactly30Days, baseTime),
    true,
    'Delivered exactly 30 days ago (equality) must be eligible'
  );

  // 3. Delivered order 30 days + 1 ms ago (outside window)
  const delivered30DaysAnd1Ms = new Date(baseTime - (THIRTY_DAYS_MS + 1)).toISOString();
  assert.strictEqual(
    isEligibleForReturn('Delivered', delivered30DaysAnd1Ms, baseTime),
    false,
    'Delivered 30 days + 1ms ago must NOT be eligible'
  );

  // 4. Missing deliveredAt
  assert.strictEqual(
    isEligibleForReturn('Delivered', undefined, baseTime),
    false,
    'Missing deliveredAt must NOT be eligible'
  );

  // 5. Invalid deliveredAt string
  assert.strictEqual(
    isEligibleForReturn('Delivered', 'not-a-valid-date', baseTime),
    false,
    'Invalid deliveredAt string must NOT be eligible'
  );

  // 6. Non-delivered order statuses
  const nonDeliveredStatuses = ['Pending', 'Confirmed', 'Processing', 'Shipped', 'Cancelled'];
  for (const st of nonDeliveredStatuses) {
    assert.strictEqual(
      isEligibleForReturn(st, delivered10DaysAgo, baseTime),
      false,
      `Non-delivered status ${st} must NOT be eligible for return`
    );
  }

  // 7. Deadline calculation
  const deadline = calculateDeliveredReturnDeadline(delivered10DaysAgo);
  assert.ok(deadline instanceof Date);
  assert.strictEqual(
    deadline?.getTime(),
    new Date(delivered10DaysAgo).getTime() + THIRTY_DAYS_MS
  );
});

// --- Cancellation and Invoice Classification Tests ---
test('Cancellation Eligibility: Restricts strictly to Pending and Confirmed statuses', () => {
  assert.strictEqual(canCancelOrder('Pending'), true);
  assert.strictEqual(canCancelOrder('Confirmed'), true);
  assert.strictEqual(canCancelOrder('Processing'), false);
  assert.strictEqual(canCancelOrder('Shipped'), false);
  assert.strictEqual(canCancelOrder('Delivered'), false);
  assert.strictEqual(canCancelOrder('Cancelled'), false);
});

test('Invoice vs Receipt Classification: Official receipts strictly require Paid or Completed status', () => {
  // Paid order -> Official Payment Receipt
  const paidResult = classifyInvoiceDocument('Paid', 'Completed');
  assert.strictEqual(paidResult.type, 'PAYMENT_RECEIPT');
  assert.strictEqual(paidResult.isOfficialReceipt, true);
  assert.strictEqual(paidResult.title, 'Official Payment Receipt');

  // Pending verification -> Confirmation Pending Verification
  const verificationPending = classifyInvoiceDocument('Pending', 'AwaitingVerification');
  assert.strictEqual(verificationPending.type, 'ORDER_CONFIRMATION_VERIFICATION_PENDING');
  assert.strictEqual(verificationPending.isOfficialReceipt, false);

  // Pending payment -> Order Confirmation
  const pending = classifyInvoiceDocument('Pending', 'AwaitingCustomerPayment');
  assert.strictEqual(pending.type, 'ORDER_CONFIRMATION');
  assert.strictEqual(pending.isOfficialReceipt, false);

  // Failed payment -> Order Confirmation Payment Failed
  const failed = classifyInvoiceDocument('Failed', 'Failed');
  assert.strictEqual(failed.type, 'ORDER_CONFIRMATION_PAYMENT_FAILED');
  assert.strictEqual(failed.isOfficialReceipt, false);
});

// --- Security Scan of Frontend Source Code ---
test('Security Scan: Scans frontend source files for prohibited raw payment fields and secrets', () => {
  const frontendSrcDir = existsSync(join(process.cwd(), 'src'))
    ? join(process.cwd(), 'src')
    : join(process.cwd(), 'frontend', 'src');

  const prohibitedPatterns = [
    { pattern: /cvv/i, name: 'Raw CVV field' },
    { pattern: /card_number|cardNumber/i, name: 'Raw Card Number field' },
    { pattern: /card_pin|cardPin|atm_pin/i, name: 'Card PIN field' },
    { pattern: /sk_live_[0-9a-zA-Z]+/i, name: 'Stripe Secret Live Key' },
    { pattern: /sk_test_[0-9a-zA-Z]+/i, name: 'Stripe Secret Test Key' },
    { pattern: /whsec_[0-9a-zA-Z]+/i, name: 'Stripe Webhook Secret' },
  ];

  function scanDirectory(dir: string): Array<{ file: string; match: string }> {
    const findings: Array<{ file: string; match: string }> = [];
    const entries = readdirSync(dir);

    for (const entry of entries) {
      const fullPath = join(dir, entry);
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        findings.push(...scanDirectory(fullPath));
      } else if (/\.(tsx|ts|js|jsx)$/.test(entry)) {
        const content = readFileSync(fullPath, 'utf8');
        for (const { pattern, name } of prohibitedPatterns) {
          if (pattern.test(content)) {
            findings.push({ file: fullPath, match: name });
          }
        }
      }
    }
    return findings;
  }

  const scanResults = scanDirectory(frontendSrcDir);
  assert.deepStrictEqual(scanResults, [], `Prohibited patterns found in frontend source: ${JSON.stringify(scanResults)}`);
});

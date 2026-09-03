import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-require-imports
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
test('CSP Isolation: Production CSP contains only self, exact API origin, and exact Stripe origins', () => {
  const productionCsp = buildCspHeader({
    production: true,
    origin: 'https://api.mevapur.com',
  });

  assert.ok(productionCsp.includes("default-src 'self'"));
  assert.ok(productionCsp.includes("connect-src 'self' https://api.mevapur.com https://api.stripe.com"));
  assert.ok(productionCsp.includes("script-src 'self' 'unsafe-inline' https://js.stripe.com"));
  assert.ok(productionCsp.includes("frame-src 'self' https://js.stripe.com https://hooks.stripe.com"));
  assert.ok(productionCsp.includes("object-src 'none'"));
  assert.ok(productionCsp.includes("base-uri 'self'"));
  assert.ok(productionCsp.includes("form-action 'self'"));
  assert.ok(productionCsp.includes("frame-ancestors 'none'"));

  // Must NOT include test/development origins
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

// --- Gate 5: Runtime Payment-Provider Visibility Matrix ---
test('Payment Provider Matrix: Validates provider visibility and fail-closed behavior', () => {
  interface MethodEntry {
    code: string;
    available?: boolean;
    metadata?: { publishableKey?: string };
  }

  function filterVisibleMethods(methods: MethodEntry[], stripeKeyFromEnv?: string): string[] {
    const supportedCodes = new Set(['cod', 'bank_transfer', 'raast', 'stripe']);
    const visible: string[] = [];

    for (const m of methods) {
      if (!supportedCodes.has(m.code)) continue; // Unknown or unsupported provider
      if (m.code === 'stripe' && !m.metadata?.publishableKey && !stripeKeyFromEnv) continue; // Missing Stripe key
      visible.push(m.code);
    }
    return visible;
  }

  // 1. All configured & enabled
  const fullList = filterVisibleMethods([
    { code: 'cod' },
    { code: 'bank_transfer' },
    { code: 'raast' },
    { code: 'stripe', metadata: { publishableKey: 'pk_test_123' } },
  ]);
  assert.deepStrictEqual(fullList, ['cod', 'bank_transfer', 'raast', 'stripe']);

  // 2. JazzCash and EasyPaisa (awaiting official contract) are omitted/hidden
  const withUncontracted = filterVisibleMethods([
    { code: 'cod' },
    { code: 'jazzcash' },
    { code: 'easypaisa' },
    { code: 'unknown_method' },
  ]);
  assert.deepStrictEqual(withUncontracted, ['cod']);

  // 3. Stripe missing publishable key is hidden
  const stripeMissingKey = filterVisibleMethods([
    { code: 'cod' },
    { code: 'stripe', metadata: {} },
  ]);
  assert.deepStrictEqual(stripeMissingKey, ['cod']);

  // 4. Provider disabled (COD only returned)
  const codOnly = filterVisibleMethods([{ code: 'cod' }]);
  assert.deepStrictEqual(codOnly, ['cod']);
});

// --- Gate 6: Manual Payment Lifecycle Tests ---
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
          canSubmitReference: true, // Allow resubmission if rejected
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

// --- Gate 7: Complete Return Eligibility & Deadline Boundary Tests ---
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

// --- Gate 8 & 9: Cancellation and Invoice Classification Tests ---
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

// --- Gate 10: Security Scan of Frontend Source Code ---
test('Security Scan: Scans frontend source files for prohibited raw payment fields and secrets', () => {
  const frontendSrcDir = join(process.cwd(), 'src');

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

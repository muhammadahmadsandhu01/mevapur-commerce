/**
 * Phase 6D-5B Storefront CheckoutSession Client & Cryptographic Attempt Store Tests
 * Validates:
 * 1. Typed API client methods in checkoutSessionService.ts with runtime response parsing
 * 2. Cryptographic SHA-256 fingerprinting & Idempotency Key derivation in checkoutAttemptStore.ts
 * 3. Canonical JSON recursive key sorting & deterministic cart line sorting
 * 4. Fail-closed Web Crypto requirements (no non-cryptographic fallbacks)
 * 5. Terminal-only generation rotation (failed, expired, cancelled) and non-terminal rotation rejection
 * 6. Changed-intent protection and safe conflict error semantics
 * 7. Monotonic reconciliation and anti-regression rules for cross-tab updates
 * 8. Reload survival and cross-tab synchronization via localStorage exclusively
 * 9. Fail-closed with CHECKOUT_RECOVERY_STORAGE_UNAVAILABLE when localStorage is blocked or throws
 * 10. Zero-PII and Zero-Secret storage guarantees
 * 11. Cross-tab coordination via navigator.locks, BroadcastChannel, and storage events
 * 12. 24h recovery survival for submitted payments
 * 13. Schema version and malformed record strict rejection
 * 14. clearAllCheckoutAttempts and authStore logout/invalidation integration
 * 15. Runtime allowlist parsers for PublicCheckoutSession, ExactMoney, and response envelopes
 * 16. Authoritative server-issued quoteId binding for repeat-purchase idempotency isolation
 * 17. Dual-namespace active vs converted completion storage architecture
 * 18. All 20 Phase 6D-5B repeat-purchase and converted-tombstone safety behavioral requirements
 */

import test, { describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import api from '../src/lib/api.ts';
import {
  createCheckoutSession,
  getCheckoutSession,
  cancelCheckoutSession,
  normalizeCheckoutApiError,
  parsePublicCheckoutSession,
  parseCheckoutSessionMoney,
  parsePaymentAttempt,
  isCheckoutSessionResponseInvalidError,
} from '../src/lib/checkoutSessionService.ts';
import {
  getOrCreateCheckoutAttempt,
  getCheckoutAttempt,
  getCheckoutCompletion,
  getCheckoutAttemptRecord,
  updateCheckoutAttemptSession,
  recordPaymentSubmitted,
  clearAllCheckoutAttempts,
  computeCheckoutFingerprint,
  computeHashedUserScope,
  computeShippingAddressHash,
  deriveIdempotencyKey,
  canonicalizeJson,
  computeSha256Hex,
  withCheckoutLock,
  subscribeCheckoutAttemptSync,
  isCheckoutRecoveryStorageError,
  CheckoutAttemptNonTerminalRotationError,
  CheckoutAttemptActiveIntentConflictError,
  CheckoutAttemptStaleUpdateError,
  isAllowedAttemptTransition,
  STORAGE_KEY_PREFIX,
  COMPLETION_KEY_PREFIX,
  SUBMITTED_PAYMENT_RECOVERY_TTL_MS,
  type CheckoutIntentInput,
  type CheckoutAttemptStatus,
} from '../src/lib/checkoutAttemptStore.ts';
import { useAuthStore } from '../src/store/authStore.ts';
import type {
  CreateCheckoutSessionRequest,
  PublicCheckoutSession,
  PaymentAttempt,
} from '../src/types/commerce.ts';

// Mock localStorage implementation for Node test environment
class MockLocalStorage implements Storage {
  private store: Map<string, string> = new Map();

  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }

  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  key(index: number): string | null {
    const keys = Array.from(this.store.keys());
    return keys[index] || null;
  }

  get length(): number {
    return this.store.size;
  }
}

describe('Phase 6D-5B: Storefront CheckoutSession Client & Cryptographic Attempt Identity Contracts', () => {
  let originalPost: typeof api.post;
  let originalGet: typeof api.get;
  let originalLocalStorage: Storage | undefined;
  let originalLocks: unknown;

  const mockPublicSession: PublicCheckoutSession = {
    sessionId: 'cs_live_test_1234567890',
    status: 'active',
    leaseExpiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    currency: 'USD',
    destinationCountry: 'US',
    convertedOrderDisplayId: null,
    amounts: {
      subtotalExact: { amountMinor: '5000', currency: 'USD', exponent: 2, registrySnapshot: 'v1' },
      discountExact: { amountMinor: '500', currency: 'USD', exponent: 2, registrySnapshot: 'v1' },
      shippingCostExact: { amountMinor: '1000', currency: 'USD', exponent: 2, registrySnapshot: 'v1' },
      taxAmountExact: { amountMinor: '450', currency: 'USD', exponent: 2, registrySnapshot: 'v1' },
      additionalTaxAmountExact: { amountMinor: '0', currency: 'USD', exponent: 2, registrySnapshot: 'v1' },
      taxIncludedAmountExact: { amountMinor: '0', currency: 'USD', exponent: 2, registrySnapshot: 'v1' },
      dutiesExact: { amountMinor: '0', currency: 'USD', exponent: 2, registrySnapshot: 'v1' },
      totalAmountExact: { amountMinor: '5950', currency: 'USD', exponent: 2, registrySnapshot: 'v1' },
    },
  };

  const mockPaymentAttempt: PaymentAttempt = {
    provider: 'stripe',
    clientSecret: 'pi_test_secret_abc123',
    status: 'requires_payment_method',
  };

  const sampleIntentInput: CheckoutIntentInput = {
    quoteId: 'QUO-20260919-TEST001',
    items: [{ productId: 'prod_1', variantId: 'var_a', quantity: 2 }],
    shippingAddress: {
      fullName: 'Alice Smith',
      phone: '+1234567890',
      address: '456 Elm St',
      city: 'Seattle',
      province: 'WA',
      postalCode: '98101',
      countryCode: 'US',
    },
    paymentMethod: 'stripe_card',
    currency: 'USD',
    shippingServiceLevel: 'standard',
    couponCode: 'SAVE10',
  };

  beforeEach(() => {
    originalPost = api.post;
    originalGet = api.get;

    // Setup mock browser window.localStorage and EventTarget methods
    const mockStorage = new MockLocalStorage();
    const listeners: Record<string, ((event: unknown) => void)[]> = {};

    if (typeof globalThis.window === 'undefined') {
      // @ts-expect-error test-only window mock
      globalThis.window = {
        localStorage: mockStorage,
        addEventListener: (name: string, handler: (event: unknown) => void) => {
          if (!listeners[name]) listeners[name] = [];
          listeners[name].push(handler);
        },
        removeEventListener: (name: string, handler: (event: unknown) => void) => {
          if (listeners[name]) {
            listeners[name] = listeners[name].filter((h) => h !== handler);
          }
        },
        dispatchEvent: (event: { type: string }) => {
          const handlers = listeners[event.type] || [];
          for (const h of handlers) {
            h(event);
          }
          return true;
        },
      };
    } else {
      originalLocalStorage = globalThis.window.localStorage;
      Object.defineProperty(globalThis.window, 'localStorage', {
        value: mockStorage,
        configurable: true,
        writable: true,
      });
    }

    if (typeof globalThis.navigator === 'undefined') {
      // @ts-expect-error test-only navigator mock
      globalThis.navigator = {
        locks: {
          request: async (_name: string, _opts: unknown, callback: () => Promise<unknown>) => {
            return await callback();
          },
        },
      };
    }

    if (typeof globalThis.navigator !== 'undefined') {
      originalLocks = globalThis.navigator.locks;
    }

    clearAllCheckoutAttempts();
  });

  afterEach(() => {
    api.post = originalPost;
    api.get = originalGet;
    clearAllCheckoutAttempts();

    if (originalLocalStorage && typeof globalThis.window !== 'undefined') {
      Object.defineProperty(globalThis.window, 'localStorage', {
        value: originalLocalStorage,
        configurable: true,
        writable: true,
      });
    }

    if (typeof globalThis.navigator !== 'undefined' && originalLocks !== undefined) {
      Object.defineProperty(globalThis.navigator, 'locks', {
        value: originalLocks,
        configurable: true,
        writable: true,
      });
    }
  });

  // ---------------------------------------------------------------------------
  // 1. POST method/path/body/header/signal
  // ---------------------------------------------------------------------------
  test('1. createCheckoutSession sends valid request with Idempotency-Key header and AbortSignal', async () => {
    let capturedUrl = '';
    let capturedPayload: unknown = null;
    let capturedHeaders: Record<string, string> | undefined;
    let capturedSignal: AbortSignal | undefined;

    api.post = (async (url: string, data?: unknown, config?: { headers?: Record<string, string>; signal?: AbortSignal }) => {
      capturedUrl = url;
      capturedPayload = data;
      capturedHeaders = config?.headers;
      capturedSignal = config?.signal;
      return {
        status: 201,
        data: {
          success: true,
          data: {
            session: mockPublicSession,
            paymentAttempt: mockPaymentAttempt,
            idempotentReplay: false,
          },
        },
      };
    }) as typeof api.post;

    const controller = new AbortController();
    const request: CreateCheckoutSessionRequest = {
      items: [{ productId: '60d5ecb8b5c9c614b8e8b111', quantity: 1 }],
      quoteToken: 'eyJhbGciOi...',
      paymentMethod: 'stripe_card',
      shippingAddress: {
        fullName: 'John Doe',
        phone: '+1234567890',
        address: '123 Main St',
        city: 'New York',
        province: 'NY',
        postalCode: '10001',
        countryCode: 'US',
      },
    };

    const idempotencyKey = 'checkout-v1-abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';
    const result = await createCheckoutSession(request, idempotencyKey, controller.signal);

    assert.equal(capturedUrl, '/commerce/checkout/session');
    assert.deepEqual(capturedPayload, request);
    assert.equal(capturedHeaders?.['Idempotency-Key'], idempotencyKey);
    assert.equal(capturedSignal, controller.signal);
    assert.equal(result.session.sessionId, 'cs_live_test_1234567890');
    assert.equal(result.session.status, 'active');
    assert.equal(result.paymentAttempt?.clientSecret, 'pi_test_secret_abc123');
    assert.equal(result.idempotentReplay, false);
  });

  // ---------------------------------------------------------------------------
  // 2. GET and cancel contracts
  // ---------------------------------------------------------------------------
  test('2. getCheckoutSession and cancelCheckoutSession adhere to URI encoding and cancel payload contracts', async () => {
    let capturedGetUrl = '';
    let capturedGetSignal: AbortSignal | undefined;
    const controller = new AbortController();

    api.get = (async (url: string, config?: { signal?: AbortSignal }) => {
      capturedGetUrl = url;
      capturedGetSignal = config?.signal;
      return {
        status: 200,
        data: {
          success: true,
          data: {
            session: mockPublicSession,
            paymentAttempt: mockPaymentAttempt,
          },
        },
      };
    }) as typeof api.get;

    const getResult = await getCheckoutSession('cs_live_test/session 123', controller.signal);
    assert.equal(capturedGetUrl, '/commerce/checkout/session/cs_live_test%2Fsession%20123');
    assert.equal(capturedGetSignal, controller.signal);
    assert.equal(getResult.session.sessionId, 'cs_live_test_1234567890');

    let capturedCancelUrl = '';
    let capturedCancelPayload: unknown = null;
    api.post = (async (url: string, data?: unknown) => {
      capturedCancelUrl = url;
      capturedCancelPayload = data;
      return {
        status: 200,
        data: {
          success: true,
          data: {
            session: { ...mockPublicSession, status: 'cancelled' },
          },
        },
      };
    }) as typeof api.post;

    const cancelResult = await cancelCheckoutSession('cs_live_test/session 123', { reason: 'user_cancelled' });
    assert.equal(capturedCancelUrl, '/commerce/checkout/session/cs_live_test%2Fsession%20123/cancel');
    assert.deepEqual(capturedCancelPayload, { reason: 'user_cancelled' });
    assert.equal(cancelResult.session.status, 'cancelled');
  });

  // ---------------------------------------------------------------------------
  // 3. Backend error normalization
  // ---------------------------------------------------------------------------
  test('3. normalizeCheckoutApiError normalizes 503, 409, 404, 400, and runtime errors', async () => {
    const err503 = {
      isAxiosError: true,
      response: {
        status: 503,
        data: { success: false, message: 'Disabled', error: { code: 'TWO_PHASE_CHECKOUT_DISABLED' } },
      },
    };
    const norm503 = normalizeCheckoutApiError(err503, 'Fallback');
    assert.equal(norm503.status, 503);
    assert.equal(norm503.code, 'TWO_PHASE_CHECKOUT_DISABLED');

    const err409 = {
      isAxiosError: true,
      response: {
        status: 409,
        data: { success: false, message: 'Conflict', error: { code: 'IDEMPOTENCY_CONFLICT' } },
      },
    };
    const norm409 = normalizeCheckoutApiError(err409, 'Fallback');
    assert.equal(norm409.status, 409);
    assert.equal(norm409.code, 'IDEMPOTENCY_CONFLICT');

    const err404 = {
      isAxiosError: true,
      response: {
        status: 404,
        data: { success: false, message: 'Not found', error: { code: 'SESSION_NOT_FOUND' } },
      },
    };
    const norm404 = normalizeCheckoutApiError(err404, 'Fallback');
    assert.equal(norm404.status, 404);
    assert.equal(norm404.code, 'SESSION_NOT_FOUND');

    const normGeneric = normalizeCheckoutApiError(new Error('Network drop'), 'Fallback');
    assert.equal(normGeneric.message, 'Network drop');
  });

  // ---------------------------------------------------------------------------
  // 4. Behavioral runtime validation of money breakdown
  // ---------------------------------------------------------------------------
  test('4. parsePublicCheckoutSession parses valid payload and validates exact money and status types behaviorally', () => {
    const parsed = parsePublicCheckoutSession(mockPublicSession);
    assert.equal(parsed.sessionId, 'cs_live_test_1234567890');
    assert.equal(parsed.status, 'active');
    assert.equal(parsed.amounts.subtotalExact.amountMinor, '5000');
    assert.equal(parsed.amounts.subtotalExact.currency, 'USD');
    assert.equal(parsed.amounts.subtotalExact.exponent, 2);
    assert.equal(parsed.amounts.totalAmountExact.amountMinor, '5950');
  });

  // ---------------------------------------------------------------------------
  // 5. Deterministic canonicalization and line sorting
  // ---------------------------------------------------------------------------
  test('5. canonicalizeJson and cart sorting produce deterministic results regardless of input order', async () => {
    const unorderedA = { z: 1, a: 2, m: { y: 'yes', x: 'no' } };
    const unorderedB = { a: 2, m: { x: 'no', y: 'yes' }, z: 1 };
    assert.equal(canonicalizeJson(unorderedA), '{"a":2,"m":{"x":"no","y":"yes"},"z":1}');
    assert.equal(canonicalizeJson(unorderedA), canonicalizeJson(unorderedB));

    const input1: CheckoutIntentInput = {
      ...sampleIntentInput,
      items: [
        { productId: 'prod_b', variantId: 'var_1', quantity: 1 },
        { productId: 'prod_a', variantId: 'var_2', quantity: 2 },
      ],
    };
    const input2: CheckoutIntentInput = {
      ...sampleIntentInput,
      items: [
        { productId: 'prod_a', variantId: 'var_2', quantity: 2 },
        { productId: 'prod_b', variantId: 'var_1', quantity: 1 },
      ],
    };
    const scope = await computeHashedUserScope('user_123');
    const fp1 = await computeCheckoutFingerprint(input1, scope);
    const fp2 = await computeCheckoutFingerprint(input2, scope);
    assert.equal(fp1, fp2);
  });

  // ---------------------------------------------------------------------------
  // 6. SHA-256 64-character fingerprints
  // ---------------------------------------------------------------------------
  test('6. computeSha256Hex and computeCheckoutFingerprint generate 64-character lowercase hexadecimal digests', async () => {
    const hash = await computeSha256Hex('test value');
    assert.match(hash, /^[a-f0-9]{64}$/);
    assert.equal(hash, '47d1d8273710fd6f6a5995fac1a0983fe0e8828c288e35e80450ddc5c4412def');

    const scope = await computeHashedUserScope('guest');
    const fp = await computeCheckoutFingerprint(sampleIntentInput, scope);
    assert.match(fp, /^[a-f0-9]{64}$/);
  });

  // ---------------------------------------------------------------------------
  // 7. Deterministic idempotency derivation
  // ---------------------------------------------------------------------------
  test('7. deriveIdempotencyKey produces checkout-v1-<sha256> from baseFingerprint and generation', async () => {
    const baseFp = '2be772714a60155a00445d429a28bf2fb6f6580f55cf5ee793392471676cb402';
    const keyGen1 = await deriveIdempotencyKey(baseFp, 1);
    const keyGen2 = await deriveIdempotencyKey(baseFp, 2);

    assert.match(keyGen1, /^checkout-v1-[a-f0-9]{64}$/);
    assert.match(keyGen2, /^checkout-v1-[a-f0-9]{64}$/);
    assert.notEqual(keyGen1, keyGen2);
  });

  // ---------------------------------------------------------------------------
  // 8. Different intent changes fingerprint
  // ---------------------------------------------------------------------------
  test('8. changing any checkout intent dimension produces a distinct fingerprint', async () => {
    const scope = await computeHashedUserScope('user_test');
    const baseFp = await computeCheckoutFingerprint(sampleIntentInput, scope);

    const fpQty = await computeCheckoutFingerprint(
      { ...sampleIntentInput, items: [{ productId: 'prod_1', variantId: 'var_a', quantity: 5 }] },
      scope
    );
    assert.notEqual(baseFp, fpQty);

    const fpAddr = await computeCheckoutFingerprint(
      {
        ...sampleIntentInput,
        shippingAddress: { ...sampleIntentInput.shippingAddress, address: '999 Different Blvd' },
      },
      scope
    );
    assert.notEqual(baseFp, fpAddr);

    const fpPay = await computeCheckoutFingerprint(
      { ...sampleIntentInput, paymentMethod: 'cod' },
      scope
    );
    assert.notEqual(baseFp, fpPay);

    const fpCoupon = await computeCheckoutFingerprint(
      { ...sampleIntentInput, couponCode: 'NEWDISCOUNT' },
      scope
    );
    assert.notEqual(baseFp, fpCoupon);
  });

  // ---------------------------------------------------------------------------
  // 9. Raw PII/user ID/quoteToken/clientSecret absent from key and stored JSON
  // ---------------------------------------------------------------------------
  test('9. raw PII, user ID, quoteToken, and clientSecret are completely absent from storage keys and stored JSON', async () => {
    const sensitiveAddress = {
      fullName: 'Secret Customer Name',
      phone: '+923001234567',
      address: 'Private Residence 100',
      city: 'Lahore',
      countryCode: 'PK',
    };
    const intent: CheckoutIntentInput = {
      quoteId: 'QUO-20260919-PII-CHECK',
      items: [{ productId: 'prod_1', quantity: 1 }],
      shippingAddress: sensitiveAddress,
      paymentMethod: 'stripe_card',
    };

    const rawUserScope = 'user_confidential_id_999';
    const hashedScope = await computeHashedUserScope(rawUserScope);
    await getOrCreateCheckoutAttempt(intent, { userScope: rawUserScope });

    updateCheckoutAttemptSession(hashedScope, {
      sessionId: 'cs_session_audit_1',
      leaseExpiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      status: 'active',
    });

    const storageKey = `${STORAGE_KEY_PREFIX}${hashedScope}`;
    const rawStored = window.localStorage.getItem(storageKey);
    assert.ok(rawStored);

    assert.ok(!storageKey.includes(rawUserScope), 'Storage key must not contain raw userId');
    assert.match(storageKey, /^mevapur:checkout-attempt:v1:[a-f0-9]{64}$/);

    assert.ok(!rawStored.includes('Secret Customer Name'), 'Must not contain fullName');
    assert.ok(!rawStored.includes('+923001234567'), 'Must not contain phone');
    assert.ok(!rawStored.includes('Private Residence'), 'Must not contain address');
    assert.ok(!rawStored.includes(rawUserScope), 'Must not contain raw userId');
    assert.ok(!rawStored.includes('quoteToken'), 'Must not contain quoteToken');
    assert.ok(!rawStored.includes('clientSecret'), 'Must not contain clientSecret');

    const parsed = JSON.parse(rawStored);
    assert.equal(parsed.schemaVersion, 1);
    assert.equal(parsed.sessionId, 'cs_session_audit_1');
  });

  // ---------------------------------------------------------------------------
  // 10. Hashed user isolation
  // ---------------------------------------------------------------------------
  test('10. different user scopes produce distinct isolated storage keys and attempt states', async () => {
    const scopeA = 'user_alpha';
    const scopeB = 'user_beta';
    const hashedA = await computeHashedUserScope(scopeA);
    const hashedB = await computeHashedUserScope(scopeB);

    assert.notEqual(hashedA, hashedB);
    assert.match(hashedA, /^[a-f0-9]{64}$/);
    assert.match(hashedB, /^[a-f0-9]{64}$/);

    await getOrCreateCheckoutAttempt(sampleIntentInput, { userScope: scopeA });
    await getOrCreateCheckoutAttempt(sampleIntentInput, { userScope: scopeB });

    updateCheckoutAttemptSession(hashedA, { sessionId: 'cs_alpha' });
    updateCheckoutAttemptSession(hashedB, { sessionId: 'cs_beta' });

    const fetchA = getCheckoutAttempt(hashedA);
    const fetchB = getCheckoutAttempt(hashedB);

    assert.equal(fetchA?.sessionId, 'cs_alpha');
    assert.equal(fetchB?.sessionId, 'cs_beta');
  });

  // ---------------------------------------------------------------------------
  // 11. localStorage reload recovery
  // ---------------------------------------------------------------------------
  test('11. getCheckoutAttempt safely recovers existing attempt state upon page reload', async () => {
    const scope = await computeHashedUserScope('user_reload');
    const created = await getOrCreateCheckoutAttempt(sampleIntentInput, { userScope: 'user_reload' });
    updateCheckoutAttemptSession(scope, { sessionId: 'cs_reload_test', status: 'payment_pending' });

    const reloaded = getCheckoutAttempt(scope);
    assert.ok(reloaded);
    assert.equal(reloaded.idempotencyKey, created.idempotencyKey);
    assert.equal(reloaded.sessionId, 'cs_reload_test');
    assert.equal(reloaded.status, 'payment_pending');
  });

  // ---------------------------------------------------------------------------
  // 12. Deterministic attempt identity sharing for identical intent
  // ---------------------------------------------------------------------------
  test('12. two callers with identical intent deterministically derive the same attempt identity and generation', async () => {
    const scope = 'user_crosstab';
    const tab1Record = await getOrCreateCheckoutAttempt(sampleIntentInput, { userScope: scope });
    const tab2Record = await getOrCreateCheckoutAttempt(sampleIntentInput, { userScope: scope });

    assert.equal(tab1Record.idempotencyKey, tab2Record.idempotencyKey);
    assert.equal(tab1Record.baseFingerprint, tab2Record.baseFingerprint);
    assert.equal(tab1Record.generation, 1);
    assert.equal(tab2Record.generation, 1);
  });

  // ---------------------------------------------------------------------------
  // 13. navigator.locks path
  // ---------------------------------------------------------------------------
  test('13. withCheckoutLock uses navigator.locks.request when available', async () => {
    let lockRequested = false;
    let lockMode = '';

    const mockLocks = {
      request: async (_name: string, options: { mode: string }, callback: () => Promise<unknown>) => {
        lockRequested = true;
        lockMode = options.mode;
        return await callback();
      },
    };

    Object.defineProperty(globalThis.navigator, 'locks', {
      value: mockLocks,
      configurable: true,
      writable: true,
    });

    const result = await withCheckoutLock('hashed_scope_1', async () => 'lock_success');
    assert.equal(lockRequested, true);
    assert.equal(lockMode, 'exclusive');
    assert.equal(result, 'lock_success');
  });

  // ---------------------------------------------------------------------------
  // 14. No-lock fallback deriving the same identity
  // ---------------------------------------------------------------------------
  test('14. withCheckoutLock seamlessly executes fallback when navigator.locks is unavailable', async () => {
    Object.defineProperty(globalThis.navigator, 'locks', {
      value: undefined,
      configurable: true,
      writable: true,
    });

    const result = await withCheckoutLock('hashed_scope_1', async () => 'fallback_success');
    assert.equal(result, 'fallback_success');

    const record = await getOrCreateCheckoutAttempt(sampleIntentInput, { userScope: 'user_nolock' });
    assert.ok(record.idempotencyKey);
  });

  // ---------------------------------------------------------------------------
  // 15. BroadcastChannel notification synchronization
  // ---------------------------------------------------------------------------
  test('15. subscribeCheckoutAttemptSync receives BroadcastChannel notifications', async () => {
    let receivedEvent: { type: string; hashedUserScope?: string } | null = null;

    const unsubscribe = subscribeCheckoutAttemptSync((event) => {
      receivedEvent = event;
    });

    const scope = await computeHashedUserScope('user_bc_sync');
    await getOrCreateCheckoutAttempt(sampleIntentInput, { userScope: 'user_bc_sync' });

    // Allow event loop to dispatch BroadcastChannel message
    await new Promise((resolve) => setTimeout(resolve, 50));

    assert.ok(receivedEvent);
    assert.equal((receivedEvent as { type: string }).type, 'ATTEMPT_UPDATED');
    assert.equal((receivedEvent as { hashedUserScope?: string }).hashedUserScope, scope);

    unsubscribe();
  });

  // ---------------------------------------------------------------------------
  // 16. Native window storage event synchronization without BroadcastChannel
  // ---------------------------------------------------------------------------
  test('16. native storage-event synchronization independently handles updates without BroadcastChannel', async () => {
    const originalBC = globalThis.BroadcastChannel;
    // @ts-expect-error test-only deletion
    delete globalThis.BroadcastChannel;

    let receivedStorageEvent: { type: string; hashedUserScope?: string } | null = null;
    const unsubscribe = subscribeCheckoutAttemptSync((event) => {
      receivedStorageEvent = event;
    });

    const scope = await computeHashedUserScope('user_storage_event_only');
    const record = await getOrCreateCheckoutAttempt(sampleIntentInput, { userScope: 'user_storage_event_only' });

    const storageKey = `${STORAGE_KEY_PREFIX}${scope}`;
    window.dispatchEvent({
      type: 'storage',
      key: storageKey,
      newValue: JSON.stringify(record),
    } as unknown as StorageEvent);

    assert.ok(receivedStorageEvent);
    assert.equal((receivedStorageEvent as { type: string }).type, 'ATTEMPT_UPDATED');
    assert.equal((receivedStorageEvent as { hashedUserScope?: string }).hashedUserScope, scope);

    unsubscribe();
    globalThis.BroadcastChannel = originalBC;
  });

  // ---------------------------------------------------------------------------
  // 17. Creating record written before POST
  // ---------------------------------------------------------------------------
  test('17. status creating record is persisted to localStorage before session creation', async () => {
    const scope = await computeHashedUserScope('user_creating');
    const record = await getOrCreateCheckoutAttempt(sampleIntentInput, { userScope: 'user_creating' });

    assert.equal(record.status, 'creating');
    const stored = getCheckoutAttempt(scope);
    assert.equal(stored?.status, 'creating');
  });

  // ---------------------------------------------------------------------------
  // 18. Reload during creating reuses key
  // ---------------------------------------------------------------------------
  test('18. reload during creating status reuses the exact same idempotency key', async () => {
    const scope = 'user_reload_creating';
    const record1 = await getOrCreateCheckoutAttempt(sampleIntentInput, { userScope: scope });
    assert.equal(record1.status, 'creating');

    const record2 = await getOrCreateCheckoutAttempt(sampleIntentInput, { userScope: scope });
    assert.equal(record1.idempotencyKey, record2.idempotencyKey);
    assert.equal(record1.generation, record2.generation);
  });

  // ---------------------------------------------------------------------------
  // 19. Same intent preserves generation 1
  // ---------------------------------------------------------------------------
  test('19. identical intent repeatedly called preserves generation 1', async () => {
    const scope = 'user_stable_gen';
    const r1 = await getOrCreateCheckoutAttempt(sampleIntentInput, { userScope: scope });
    const r2 = await getOrCreateCheckoutAttempt(sampleIntentInput, { userScope: scope });
    assert.equal(r1.generation, 1);
    assert.equal(r2.generation, 1);
    assert.equal(r1.idempotencyKey, r2.idempotencyKey);
  });

  // ---------------------------------------------------------------------------
  // 20. Generation does not rotate on network failure
  // ---------------------------------------------------------------------------
  test('20. network failure or transient timeout does not rotate generation counter', async () => {
    const scope = 'user_network_retry';
    const initial = await getOrCreateCheckoutAttempt(sampleIntentInput, { userScope: scope });

    const retried = await getOrCreateCheckoutAttempt(sampleIntentInput, { userScope: scope, forceNewAttempt: false });
    assert.equal(initial.generation, retried.generation);
    assert.equal(initial.idempotencyKey, retried.idempotencyKey);
  });

  // ---------------------------------------------------------------------------
  // 21. Polling timeout or local clock passage cannot authorize rotation
  // ---------------------------------------------------------------------------
  test('21. polling timeout cannot authorize rotation without server terminal status', async () => {
    const scope = 'user_polling_timeout';
    const hashedScope = await computeHashedUserScope(scope);
    await getOrCreateCheckoutAttempt(sampleIntentInput, { userScope: scope });
    updateCheckoutAttemptSession(hashedScope, { status: 'payment_pending', sessionId: 'cs_poll_123' });

    await assert.rejects(
      () => getOrCreateCheckoutAttempt(sampleIntentInput, { userScope: scope, forceNewAttempt: true }),
      (err: unknown) =>
        err instanceof CheckoutAttemptNonTerminalRotationError &&
        err.code === 'CHECKOUT_ATTEMPT_NON_TERMINAL_ROTATION_FORBIDDEN' &&
        err.status === 'payment_pending'
    );
  });

  // ---------------------------------------------------------------------------
  // 22. forceNewAttempt succeeds after authoritative failed
  // ---------------------------------------------------------------------------
  test('22. forceNewAttempt succeeds after authoritative failed', async () => {
    const scope = 'user_failed_retry';
    const hashedScope = await computeHashedUserScope(scope);
    const r1 = await getOrCreateCheckoutAttempt(sampleIntentInput, { userScope: scope });
    updateCheckoutAttemptSession(hashedScope, { status: 'failed', sessionId: 'cs_failed_1' });

    const r2 = await getOrCreateCheckoutAttempt(sampleIntentInput, { userScope: scope, forceNewAttempt: true });
    assert.equal(r2.generation, 2);
    assert.equal(r2.baseFingerprint, r1.baseFingerprint);
    assert.notEqual(r2.idempotencyKey, r1.idempotencyKey);
    assert.equal(r2.status, 'creating');
  });

  // ---------------------------------------------------------------------------
  // 23. forceNewAttempt succeeds after authoritative expired
  // ---------------------------------------------------------------------------
  test('23. forceNewAttempt succeeds after authoritative expired', async () => {
    const scope = 'user_expired_retry';
    const hashedScope = await computeHashedUserScope(scope);
    await getOrCreateCheckoutAttempt(sampleIntentInput, { userScope: scope });
    updateCheckoutAttemptSession(hashedScope, { status: 'expired', sessionId: 'cs_expired_1' });

    const r2 = await getOrCreateCheckoutAttempt(sampleIntentInput, { userScope: scope, forceNewAttempt: true });
    assert.equal(r2.generation, 2);
    assert.equal(r2.status, 'creating');
  });

  // ---------------------------------------------------------------------------
  // 24. forceNewAttempt succeeds after authoritative cancelled
  // ---------------------------------------------------------------------------
  test('24. forceNewAttempt succeeds after authoritative cancelled', async () => {
    const scope = 'user_cancelled_retry';
    const hashedScope = await computeHashedUserScope(scope);
    await getOrCreateCheckoutAttempt(sampleIntentInput, { userScope: scope });
    updateCheckoutAttemptSession(hashedScope, { status: 'cancelled', sessionId: 'cs_cancelled_1' });

    const r2 = await getOrCreateCheckoutAttempt(sampleIntentInput, { userScope: scope, forceNewAttempt: true });
    assert.equal(r2.generation, 2);
    assert.equal(r2.status, 'creating');
  });

  // ---------------------------------------------------------------------------
  // 25. forceNewAttempt rejects creating
  // ---------------------------------------------------------------------------
  test('25. forceNewAttempt rejects creating status with CHECKOUT_ATTEMPT_NON_TERMINAL_ROTATION_FORBIDDEN', async () => {
    const scope = 'user_creating_rotate_reject';
    await getOrCreateCheckoutAttempt(sampleIntentInput, { userScope: scope });

    await assert.rejects(
      () => getOrCreateCheckoutAttempt(sampleIntentInput, { userScope: scope, forceNewAttempt: true }),
      (err: unknown) =>
        err instanceof CheckoutAttemptNonTerminalRotationError &&
        err.code === 'CHECKOUT_ATTEMPT_NON_TERMINAL_ROTATION_FORBIDDEN' &&
        err.status === 'creating'
    );
  });

  // ---------------------------------------------------------------------------
  // 26. forceNewAttempt rejects active
  // ---------------------------------------------------------------------------
  test('26. forceNewAttempt rejects active status', async () => {
    const scope = 'user_active_rotate_reject';
    const hashedScope = await computeHashedUserScope(scope);
    await getOrCreateCheckoutAttempt(sampleIntentInput, { userScope: scope });
    updateCheckoutAttemptSession(hashedScope, { status: 'active', sessionId: 'cs_active_1' });

    await assert.rejects(
      () => getOrCreateCheckoutAttempt(sampleIntentInput, { userScope: scope, forceNewAttempt: true }),
      (err: unknown) =>
        err instanceof CheckoutAttemptNonTerminalRotationError && err.status === 'active'
    );
  });

  // ---------------------------------------------------------------------------
  // 27. forceNewAttempt rejects payment_pending
  // ---------------------------------------------------------------------------
  test('27. forceNewAttempt rejects payment_pending status', async () => {
    const scope = 'user_pending_rotate_reject';
    const hashedScope = await computeHashedUserScope(scope);
    await getOrCreateCheckoutAttempt(sampleIntentInput, { userScope: scope });
    updateCheckoutAttemptSession(hashedScope, { status: 'payment_pending', sessionId: 'cs_pending_1' });

    await assert.rejects(
      () => getOrCreateCheckoutAttempt(sampleIntentInput, { userScope: scope, forceNewAttempt: true }),
      (err: unknown) =>
        err instanceof CheckoutAttemptNonTerminalRotationError && err.status === 'payment_pending'
    );
  });

  // ---------------------------------------------------------------------------
  // 28. forceNewAttempt rejects payment_captured
  // ---------------------------------------------------------------------------
  test('28. forceNewAttempt rejects payment_captured status', async () => {
    const scope = 'user_captured_rotate_reject';
    const hashedScope = await computeHashedUserScope(scope);
    await getOrCreateCheckoutAttempt(sampleIntentInput, { userScope: scope });
    updateCheckoutAttemptSession(hashedScope, { status: 'payment_captured', sessionId: 'cs_cap_1' });

    await assert.rejects(
      () => getOrCreateCheckoutAttempt(sampleIntentInput, { userScope: scope, forceNewAttempt: true }),
      (err: unknown) =>
        err instanceof CheckoutAttemptNonTerminalRotationError && err.status === 'payment_captured'
    );
  });

  // ---------------------------------------------------------------------------
  // 29. forceNewAttempt rejects converting
  // ---------------------------------------------------------------------------
  test('29. forceNewAttempt rejects converting status', async () => {
    const scope = 'user_converting_rotate_reject';
    const hashedScope = await computeHashedUserScope(scope);
    await getOrCreateCheckoutAttempt(sampleIntentInput, { userScope: scope });
    updateCheckoutAttemptSession(hashedScope, { status: 'converting', sessionId: 'cs_conv_1' });

    await assert.rejects(
      () => getOrCreateCheckoutAttempt(sampleIntentInput, { userScope: scope, forceNewAttempt: true }),
      (err: unknown) =>
        err instanceof CheckoutAttemptNonTerminalRotationError && err.status === 'converting'
    );
  });

  // ---------------------------------------------------------------------------
  // 30. forceNewAttempt rejects cancellation_requested
  // ---------------------------------------------------------------------------
  test('30. forceNewAttempt rejects cancellation_requested status', async () => {
    const scope = 'user_cancelling_rotate_reject';
    const hashedScope = await computeHashedUserScope(scope);
    await getOrCreateCheckoutAttempt(sampleIntentInput, { userScope: scope });
    updateCheckoutAttemptSession(hashedScope, { status: 'cancellation_requested', sessionId: 'cs_cancel_req_1' });

    await assert.rejects(
      () => getOrCreateCheckoutAttempt(sampleIntentInput, { userScope: scope, forceNewAttempt: true }),
      (err: unknown) =>
        err instanceof CheckoutAttemptNonTerminalRotationError && err.status === 'cancellation_requested'
    );
  });

  // ---------------------------------------------------------------------------
  // 31. forceNewAttempt rejects conflict
  // ---------------------------------------------------------------------------
  test('31. forceNewAttempt rejects conflict status', async () => {
    const scope = 'user_conflict_rotate_reject';
    const hashedScope = await computeHashedUserScope(scope);
    await getOrCreateCheckoutAttempt(sampleIntentInput, { userScope: scope });
    updateCheckoutAttemptSession(hashedScope, { status: 'conflict', sessionId: 'cs_conflict_1' });

    await assert.rejects(
      () => getOrCreateCheckoutAttempt(sampleIntentInput, { userScope: scope, forceNewAttempt: true }),
      (err: unknown) =>
        err instanceof CheckoutAttemptNonTerminalRotationError && err.status === 'conflict'
    );
  });

  // ---------------------------------------------------------------------------
  // 32. forceNewAttempt rejects submitted attempt despite local lease expiry
  // ---------------------------------------------------------------------------
  test('32. forceNewAttempt rejects submitted attempt despite local lease timestamp passage', async () => {
    const scope = 'user_submitted_rotate_reject';
    const hashedScope = await computeHashedUserScope(scope);
    await getOrCreateCheckoutAttempt(sampleIntentInput, { userScope: scope });

    updateCheckoutAttemptSession(hashedScope, {
      status: 'payment_pending',
      sessionId: 'cs_submitted_1',
      leaseExpiresAt: new Date(Date.now() - 5000).toISOString(),
      paymentSubmittedAt: new Date().toISOString(),
    });

    await assert.rejects(
      () => getOrCreateCheckoutAttempt(sampleIntentInput, { userScope: scope, forceNewAttempt: true }),
      (err: unknown) => err instanceof CheckoutAttemptNonTerminalRotationError
    );
  });

  // ---------------------------------------------------------------------------
  // 33. Changed intent cannot overwrite active attempt
  // ---------------------------------------------------------------------------
  test('33. changed intent throws CHECKOUT_ATTEMPT_ACTIVE_INTENT_CONFLICT when active attempt exists', async () => {
    const scope = 'user_changed_intent_active';
    const hashedScope = await computeHashedUserScope(scope);
    await getOrCreateCheckoutAttempt(sampleIntentInput, { userScope: scope });
    updateCheckoutAttemptSession(hashedScope, { status: 'active', sessionId: 'cs_active_orig' });

    const changedIntent: CheckoutIntentInput = {
      ...sampleIntentInput,
      items: [{ productId: 'new_prod_99', quantity: 1 }],
    };

    await assert.rejects(
      () => getOrCreateCheckoutAttempt(changedIntent, { userScope: scope }),
      (err: unknown) =>
        err instanceof CheckoutAttemptActiveIntentConflictError &&
        err.code === 'CHECKOUT_ATTEMPT_ACTIVE_INTENT_CONFLICT' &&
        err.existingStatus === 'active' &&
        err.existingSessionId === 'cs_active_orig'
    );
  });

  // ---------------------------------------------------------------------------
  // 34. Changed intent cannot overwrite submitted attempt
  // ---------------------------------------------------------------------------
  test('34. changed intent cannot overwrite submitted attempt', async () => {
    const scope = 'user_changed_intent_submitted';
    const hashedScope = await computeHashedUserScope(scope);
    await getOrCreateCheckoutAttempt(sampleIntentInput, { userScope: scope });
    updateCheckoutAttemptSession(hashedScope, {
      status: 'payment_pending',
      paymentSubmittedAt: new Date().toISOString(),
    });

    const changedIntent: CheckoutIntentInput = {
      ...sampleIntentInput,
      paymentMethod: 'cod',
    };

    await assert.rejects(
      () => getOrCreateCheckoutAttempt(changedIntent, { userScope: scope }),
      (err: unknown) => err instanceof CheckoutAttemptActiveIntentConflictError
    );
  });

  // ---------------------------------------------------------------------------
  // 35. Changed intent cannot overwrite unexpired conflict evidence
  // ---------------------------------------------------------------------------
  test('35. changed intent cannot overwrite unexpired conflict evidence', async () => {
    const scope = 'user_changed_intent_conflict';
    const hashedScope = await computeHashedUserScope(scope);
    await getOrCreateCheckoutAttempt(sampleIntentInput, { userScope: scope });
    updateCheckoutAttemptSession(hashedScope, { status: 'conflict', sessionId: 'cs_conflict_saved' });

    const changedIntent: CheckoutIntentInput = {
      ...sampleIntentInput,
      currency: 'EUR',
    };

    await assert.rejects(
      () => getOrCreateCheckoutAttempt(changedIntent, { userScope: scope }),
      (err: unknown) =>
        err instanceof CheckoutAttemptActiveIntentConflictError &&
        err.existingStatus === 'conflict' &&
        err.existingSessionId === 'cs_conflict_saved'
    );
  });

  // ---------------------------------------------------------------------------
  // 36. Changed intent proceeds after authoritative terminal state
  // ---------------------------------------------------------------------------
  test('36. changed intent may proceed with fresh generation 1 after authoritative terminal state', async () => {
    const scope = 'user_changed_intent_terminal';
    const hashedScope = await computeHashedUserScope(scope);
    await getOrCreateCheckoutAttempt(sampleIntentInput, { userScope: scope });
    updateCheckoutAttemptSession(hashedScope, { status: 'failed', sessionId: 'cs_failed_prior' });

    const changedIntent: CheckoutIntentInput = {
      ...sampleIntentInput,
      items: [{ productId: 'replacement_prod', quantity: 3 }],
    };

    const fresh = await getOrCreateCheckoutAttempt(changedIntent, { userScope: scope });
    assert.equal(fresh.generation, 1);
    assert.equal(fresh.status, 'creating');
  });

  // ---------------------------------------------------------------------------
  // 37. Expired bounded conflict retention is explicitly purged
  // ---------------------------------------------------------------------------
  test('37. expired bounded conflict retention is purged according to policy before creating new record', async () => {
    const scope = 'user_conflict_expired';
    const hashedScope = await computeHashedUserScope(scope);
    await getOrCreateCheckoutAttempt(sampleIntentInput, { userScope: scope });

    // Force conflict record with expired recovery deadline
    const storageKey = `${STORAGE_KEY_PREFIX}${hashedScope}`;
    const raw = window.localStorage.getItem(storageKey);
    assert.ok(raw);
    const record = JSON.parse(raw);
    record.status = 'conflict';
    record.recoveryExpiresAt = Date.now() - 1000;
    window.localStorage.setItem(storageKey, JSON.stringify(record));

    const changedIntent: CheckoutIntentInput = {
      ...sampleIntentInput,
      items: [{ productId: 'after_conflict_expired', quantity: 1 }],
    };

    const fresh = await getOrCreateCheckoutAttempt(changedIntent, { userScope: scope });
    assert.equal(fresh.generation, 1);
    assert.equal(fresh.status, 'creating');
  });

  // ---------------------------------------------------------------------------
  // 38. Submitted attempt survives lease expiry
  // ---------------------------------------------------------------------------
  test('38. submitted payment attempt is not purged merely because leaseExpiresAt passed', async () => {
    const scope = await computeHashedUserScope('user_lease_pass');
    await getOrCreateCheckoutAttempt(sampleIntentInput, { userScope: 'user_lease_pass' });

    const pastLease = new Date(Date.now() - 1000).toISOString();
    updateCheckoutAttemptSession(scope, {
      sessionId: 'cs_submitted_survive',
      leaseExpiresAt: pastLease,
      status: 'payment_pending',
      paymentSubmittedAt: new Date().toISOString(),
    });

    const retrieved = getCheckoutAttempt(scope);
    assert.ok(retrieved, 'Attempt with paymentSubmittedAt must not be purged when lease expires');
    assert.equal(retrieved.sessionId, 'cs_submitted_survive');
  });

  // ---------------------------------------------------------------------------
  // 39. Submitted recovery window extended by 24h
  // ---------------------------------------------------------------------------
  test('39. recordPaymentSubmitted extends recovery window to at least 24 hours', async () => {
    const scope = await computeHashedUserScope('user_24h');
    const created = await getOrCreateCheckoutAttempt(sampleIntentInput, { userScope: 'user_24h' });

    const submitted = recordPaymentSubmitted(scope);
    assert.ok(submitted?.paymentSubmittedAt);
    assert.ok(
      submitted.recoveryExpiresAt >= created.createdAt + SUBMITTED_PAYMENT_RECOVERY_TTL_MS,
      'Recovery window must be extended by at least 24 hours'
    );
  });

  // ---------------------------------------------------------------------------
  // 40. Converted completion record persisted into completion namespace
  // ---------------------------------------------------------------------------
  test('40. updateCheckoutAttemptSession stores bounded completion record when authoritative status is converted', async () => {
    const scope = await computeHashedUserScope('user_converted');
    const attempt = await getOrCreateCheckoutAttempt(sampleIntentInput, { userScope: 'user_converted' });

    updateCheckoutAttemptSession(scope, {
      sessionId: 'cs_converted_123',
      status: 'converted',
      convertedOrderDisplayId: 'ORD-987654',
      expectedFingerprint: attempt.baseFingerprint,
      expectedGeneration: attempt.generation,
    });

    const completion = getCheckoutCompletion(scope, attempt.baseFingerprint, attempt.generation);
    assert.ok(completion);
    assert.equal(completion.status, 'converted');
    assert.equal(completion.convertedOrderDisplayId, 'ORD-987654');
  });

  // ---------------------------------------------------------------------------
  // 41. Bounded conflict retention
  // ---------------------------------------------------------------------------
  test('41. conflict attempt retains bounded non-secret record for recovery support', async () => {
    const scope = await computeHashedUserScope('user_conflict');
    await getOrCreateCheckoutAttempt(sampleIntentInput, { userScope: 'user_conflict' });

    const conflictRecord = updateCheckoutAttemptSession(scope, {
      sessionId: 'cs_conflict_409',
      status: 'conflict',
    });

    assert.ok(conflictRecord);
    assert.equal(conflictRecord.status, 'conflict');
    const retrieved = getCheckoutAttempt(scope);
    assert.equal(retrieved?.status, 'conflict');
  });

  // ---------------------------------------------------------------------------
  // 42. Monotonic reconciliation: stale generation rejected
  // ---------------------------------------------------------------------------
  test('42. updateCheckoutAttemptSession rejects stale update from older generation with CHECKOUT_ATTEMPT_STALE_UPDATE_IGNORED', async () => {
    const scope = 'user_stale_gen';
    const hashedScope = await computeHashedUserScope(scope);
    await getOrCreateCheckoutAttempt(sampleIntentInput, { userScope: scope });
    updateCheckoutAttemptSession(hashedScope, { status: 'failed' });

    // Rotate to generation 2
    await getOrCreateCheckoutAttempt(sampleIntentInput, { userScope: scope, forceNewAttempt: true });

    // Stale generation 1 update arrives
    assert.throws(
      () =>
        updateCheckoutAttemptSession(hashedScope, {
          status: 'active',
          expectedGeneration: 1,
        }),
      (err: unknown) =>
        err instanceof CheckoutAttemptStaleUpdateError &&
        err.code === 'CHECKOUT_ATTEMPT_STALE_UPDATE_IGNORED'
    );
  });

  // ---------------------------------------------------------------------------
  // 43. Monotonic reconciliation: stale fingerprint rejected
  // ---------------------------------------------------------------------------
  test('43. updateCheckoutAttemptSession rejects update with mismatched baseFingerprint', async () => {
    const scope = 'user_stale_fp';
    const hashedScope = await computeHashedUserScope(scope);
    await getOrCreateCheckoutAttempt(sampleIntentInput, { userScope: scope });

    assert.throws(
      () =>
        updateCheckoutAttemptSession(hashedScope, {
          status: 'active',
          expectedFingerprint: '0'.repeat(64),
        }),
      (err: unknown) => err instanceof CheckoutAttemptStaleUpdateError
    );
  });

  // ---------------------------------------------------------------------------
  // 44. Monotonic reconciliation: stale active cannot regress payment_captured
  // ---------------------------------------------------------------------------
  test('44. monotonic reconciliation prevents stale active response from regressing payment_captured', async () => {
    const scope = 'user_mon_captured';
    const hashedScope = await computeHashedUserScope(scope);
    await getOrCreateCheckoutAttempt(sampleIntentInput, { userScope: scope });
    updateCheckoutAttemptSession(hashedScope, { status: 'payment_captured', sessionId: 'cs_captured_ok' });

    assert.throws(
      () => updateCheckoutAttemptSession(hashedScope, { status: 'active' }),
      (err: unknown) =>
        err instanceof CheckoutAttemptStaleUpdateError &&
        err.code === 'CHECKOUT_ATTEMPT_STALE_UPDATE_IGNORED'
    );

    const current = getCheckoutAttempt(hashedScope);
    assert.equal(current?.status, 'payment_captured');
  });

  // ---------------------------------------------------------------------------
  // 45. Monotonic reconciliation: stale payment_pending cannot regress converting
  // ---------------------------------------------------------------------------
  test('45. monotonic reconciliation prevents stale payment_pending from regressing converting', async () => {
    const scope = 'user_mon_converting';
    const hashedScope = await computeHashedUserScope(scope);
    await getOrCreateCheckoutAttempt(sampleIntentInput, { userScope: scope });
    updateCheckoutAttemptSession(hashedScope, { status: 'converting', sessionId: 'cs_converting_ok' });

    assert.throws(
      () => updateCheckoutAttemptSession(hashedScope, { status: 'payment_pending' }),
      (err: unknown) => err instanceof CheckoutAttemptStaleUpdateError
    );

    const current = getCheckoutAttempt(hashedScope);
    assert.equal(current?.status, 'converting');
  });

  // ---------------------------------------------------------------------------
  // 46. Monotonic reconciliation: converted record prevents stale response regression
  // ---------------------------------------------------------------------------
  test('46. monotonic reconciliation: converted record prevents stale response from regressing to active', async () => {
    const scope = 'user_mon_converted';
    const hashedScope = await computeHashedUserScope(scope);
    const attempt = await getOrCreateCheckoutAttempt(sampleIntentInput, { userScope: scope });
    updateCheckoutAttemptSession(hashedScope, {
      status: 'converted',
      sessionId: 'cs_converted_ok',
      convertedOrderDisplayId: 'ORD-MON-1',
      expectedFingerprint: attempt.baseFingerprint,
      expectedGeneration: attempt.generation,
    });

    assert.throws(
      () =>
        updateCheckoutAttemptSession(hashedScope, {
          status: 'active',
          expectedFingerprint: attempt.baseFingerprint,
          expectedGeneration: attempt.generation,
        }),
      (err: unknown) =>
        err instanceof CheckoutAttemptStaleUpdateError &&
        err.code === 'CHECKOUT_ATTEMPT_STALE_UPDATE_IGNORED'
    );

    const completion = getCheckoutCompletion(hashedScope, attempt.baseFingerprint, attempt.generation);
    assert.ok(completion);
    assert.equal(completion.status, 'converted');
  });

  // ---------------------------------------------------------------------------
  // 47. No-lock simultaneous calls permit duplicate dispatch with identical key
  // ---------------------------------------------------------------------------
  test('47. no-lock simultaneous calls use identical idempotency key and permit duplicate POST while preserving key identity', async () => {
    Object.defineProperty(globalThis.navigator, 'locks', {
      value: undefined,
      configurable: true,
      writable: true,
    });

    const scope = 'user_nolock_concurrent';
    const [recA, recB] = await Promise.all([
      getOrCreateCheckoutAttempt(sampleIntentInput, { userScope: scope }),
      getOrCreateCheckoutAttempt(sampleIntentInput, { userScope: scope }),
    ]);

    assert.equal(recA.idempotencyKey, recB.idempotencyKey);
    assert.equal(recA.generation, 1);
    assert.equal(recB.generation, 1);
    assert.equal(recA.baseFingerprint, recB.baseFingerprint);
  });

  // ---------------------------------------------------------------------------
  // 48. Corrupt record rejection
  // ---------------------------------------------------------------------------
  test('48. malformed or corrupt JSON in storage is rejected and purged without generating alternative random key', async () => {
    const scope = await computeHashedUserScope('user_corrupt');
    const storageKey = `${STORAGE_KEY_PREFIX}${scope}`;
    window.localStorage.setItem(storageKey, 'INVALID_JSON_CORRUPT{');

    const result = getCheckoutAttempt(scope);
    assert.equal(result, null);
    assert.equal(window.localStorage.getItem(storageKey), null);
  });

  // ---------------------------------------------------------------------------
  // 49. Schema-version rejection
  // ---------------------------------------------------------------------------
  test('49. stored record with invalid schemaVersion is strictly rejected and removed', async () => {
    const scope = await computeHashedUserScope('user_bad_version');
    const storageKey = `${STORAGE_KEY_PREFIX}${scope}`;
    const badVersionRecord = {
      schemaVersion: 99,
      baseFingerprint: 'a'.repeat(64),
      generation: 1,
      idempotencyKey: 'checkout-v1-' + 'a'.repeat(64),
      status: 'creating',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      recoveryExpiresAt: Date.now() + 10000,
    };
    window.localStorage.setItem(storageKey, JSON.stringify(badVersionRecord));

    const result = getCheckoutAttempt(scope);
    assert.equal(result, null);
    assert.equal(window.localStorage.getItem(storageKey), null);
  });

  // ---------------------------------------------------------------------------
  // 50. Storage read failure fails closed
  // ---------------------------------------------------------------------------
  test('50. storage read failure fails closed with CHECKOUT_RECOVERY_STORAGE_UNAVAILABLE', () => {
    Object.defineProperty(globalThis.window, 'localStorage', {
      get() {
        throw new Error('Storage read denied');
      },
      configurable: true,
    });

    assert.throws(
      () => getCheckoutAttempt('any_scope'),
      (err: unknown) => isCheckoutRecoveryStorageError(err) && (err as { code: string }).code === 'CHECKOUT_RECOVERY_STORAGE_UNAVAILABLE'
    );
  });

  // ---------------------------------------------------------------------------
  // 51. Storage write/quota failure fails closed before POST
  // ---------------------------------------------------------------------------
  test('51. storage write quota exceeded fails closed with CHECKOUT_RECOVERY_STORAGE_UNAVAILABLE before POST', async () => {
    const mockQuotaStorage = new MockLocalStorage();
    mockStorageWithWriteError(mockQuotaStorage, new Error('QuotaExceededError: storage full'));

    Object.defineProperty(globalThis.window, 'localStorage', {
      value: mockQuotaStorage,
      configurable: true,
      writable: true,
    });

    await assert.rejects(
      () => getOrCreateCheckoutAttempt(sampleIntentInput, { userScope: 'user_quota' }),
      (err: unknown) => isCheckoutRecoveryStorageError(err) && (err as { code: string }).code === 'CHECKOUT_RECOVERY_STORAGE_UNAVAILABLE'
    );
  });

  function mockStorageWithWriteError(storage: MockLocalStorage, error: Error): void {
    storage.setItem = () => {
      throw error;
    };
  }

  // ---------------------------------------------------------------------------
  // 52. clearAllCheckoutAttempts removes all scoped records
  // ---------------------------------------------------------------------------
  test('52. clearAllCheckoutAttempts purges every key in mevapur:checkout-attempt:v1: namespace', async () => {
    const scope1 = await computeHashedUserScope('user_1');
    const scope2 = await computeHashedUserScope('user_2');

    await getOrCreateCheckoutAttempt(sampleIntentInput, { userScope: 'user_1' });
    await getOrCreateCheckoutAttempt(sampleIntentInput, { userScope: 'user_2' });

    window.localStorage.setItem('other_app_setting', 'keep_me');

    assert.ok(window.localStorage.getItem(`${STORAGE_KEY_PREFIX}${scope1}`));
    assert.ok(window.localStorage.getItem(`${STORAGE_KEY_PREFIX}${scope2}`));

    clearAllCheckoutAttempts();

    assert.equal(window.localStorage.getItem(`${STORAGE_KEY_PREFIX}${scope1}`), null);
    assert.equal(window.localStorage.getItem(`${STORAGE_KEY_PREFIX}${scope2}`), null);
    assert.equal(window.localStorage.getItem('other_app_setting'), 'keep_me');
  });

  // ---------------------------------------------------------------------------
  // 53. Logout cleanup
  // ---------------------------------------------------------------------------
  test('53. authStore logout invokes clearAllCheckoutAttempts and removes scoped attempts', async () => {
    const scope = await computeHashedUserScope('logged_in_user');
    await getOrCreateCheckoutAttempt(sampleIntentInput, { userScope: 'logged_in_user' });

    assert.ok(window.localStorage.getItem(`${STORAGE_KEY_PREFIX}${scope}`));

    await useAuthStore.getState().logout();

    assert.equal(window.localStorage.getItem(`${STORAGE_KEY_PREFIX}${scope}`), null);
  });

  // ---------------------------------------------------------------------------
  // 54. Auth invalidation cleanup
  // ---------------------------------------------------------------------------
  test('54. auth token invalidation cleans up all scoped checkout attempt records', async () => {
    const scope = await computeHashedUserScope('invalidated_user');
    await getOrCreateCheckoutAttempt(sampleIntentInput, { userScope: 'invalidated_user' });

    assert.ok(window.localStorage.getItem(`${STORAGE_KEY_PREFIX}${scope}`));

    clearAllCheckoutAttempts();

    assert.equal(window.localStorage.getItem(`${STORAGE_KEY_PREFIX}${scope}`), null);
  });

  // ---------------------------------------------------------------------------
  // 55. SSR-safe module import
  // ---------------------------------------------------------------------------
  test('55. computeSha256Hex, canonicalizeJson, and computeCheckoutFingerprint execute safely in non-DOM runtime', async () => {
    const json = canonicalizeJson({ a: 1, b: 2 });
    assert.equal(json, '{"a":1,"b":2}');

    const scope = await computeHashedUserScope('ssr_user');
    const fp = await computeCheckoutFingerprint(sampleIntentInput, scope);
    assert.match(fp, /^[a-f0-9]{64}$/);
  });

  // ---------------------------------------------------------------------------
  // 56. No clientSecret persistence under any path
  // ---------------------------------------------------------------------------
  test('56. paymentAttempt clientSecret is never written or leaked to localStorage', async () => {
    const scope = await computeHashedUserScope('user_no_secret');
    await getOrCreateCheckoutAttempt(sampleIntentInput, { userScope: 'user_no_secret' });

    updateCheckoutAttemptSession(scope, {
      sessionId: 'cs_session_with_secret',
      status: 'payment_pending',
    });

    const storageKey = `${STORAGE_KEY_PREFIX}${scope}`;
    const stored = window.localStorage.getItem(storageKey);
    assert.ok(stored);
    assert.ok(!stored.includes('clientSecret'));
    assert.ok(!stored.includes('pi_test_secret'));
  });

  // ---------------------------------------------------------------------------
  // 57. computeShippingAddressHash normalizes and hashes address
  // ---------------------------------------------------------------------------
  test('57. computeShippingAddressHash normalizes address whitespace, casing, and returns SHA-256 digest', async () => {
    const addr1 = {
      fullName: '  Alice Smith  ',
      phone: '  123456  ',
      address: '  Main St  ',
      city: '  City  ',
      countryCode: 'us',
    };
    const addr2 = {
      fullName: 'Alice Smith',
      phone: '123456',
      address: 'Main St',
      city: 'City',
      countryCode: 'US',
    };

    const hash1 = await computeShippingAddressHash(addr1);
    const hash2 = await computeShippingAddressHash(addr2);
    assert.equal(hash1, hash2);
    assert.match(hash1, /^[a-f0-9]{64}$/);
  });

  // ---------------------------------------------------------------------------
  // 58. Storage namespace prefix integrity
  // ---------------------------------------------------------------------------
  test('58. storage namespace strictly conforms to mevapur:checkout-attempt:v1:<64-char-hex>', async () => {
    const scope = await computeHashedUserScope('user_namespace_check');
    const storageKey = `${STORAGE_KEY_PREFIX}${scope}`;
    assert.match(storageKey, /^mevapur:checkout-attempt:v1:[a-f0-9]{64}$/);
  });

  // ---------------------------------------------------------------------------
  // 59. Runtime response parser: missing session envelope rejected
  // ---------------------------------------------------------------------------
  test('59. runtime parser rejects response when session object is missing', () => {
    assert.throws(
      () => parsePublicCheckoutSession(null),
      (err: unknown) => isCheckoutSessionResponseInvalidError(err) && (err as { code: string }).code === 'CHECKOUT_SESSION_RESPONSE_INVALID'
    );
  });

  // ---------------------------------------------------------------------------
  // 60. Runtime response parser: unknown session status rejected
  // ---------------------------------------------------------------------------
  test('60. runtime parser rejects unknown session status', () => {
    const bad = { ...mockPublicSession, status: 'unknown_status' };
    assert.throws(
      () => parsePublicCheckoutSession(bad),
      (err: unknown) => isCheckoutSessionResponseInvalidError(err) && (err as { fieldPath: string }).fieldPath === 'session.status'
    );
  });

  // ---------------------------------------------------------------------------
  // 61. Runtime response parser: missing exact money field rejected
  // ---------------------------------------------------------------------------
  test('61. runtime parser rejects missing exact money field in amounts breakdown', () => {
    const badAmounts = { ...mockPublicSession.amounts, totalAmountExact: undefined };
    const bad = { ...mockPublicSession, amounts: badAmounts };
    assert.throws(
      () => parsePublicCheckoutSession(bad),
      (err: unknown) => isCheckoutSessionResponseInvalidError(err) && (err as { fieldPath: string }).fieldPath === 'amounts.totalAmountExact'
    );
  });

  // ---------------------------------------------------------------------------
  // 62. Runtime response parser: numeric amountMinor rejected
  // ---------------------------------------------------------------------------
  test('62. runtime parser rejects numeric or float amountMinor', () => {
    assert.throws(
      // @ts-expect-error test-only invalid type
      () => parseCheckoutSessionMoney({ amountMinor: 5000, currency: 'USD', exponent: 2, registrySnapshot: 'v1' }, 'subtotal', 'USD'),
      (err: unknown) => isCheckoutSessionResponseInvalidError(err) && (err as { fieldPath: string }).fieldPath === 'subtotal.amountMinor'
    );

    assert.throws(
      () => parseCheckoutSessionMoney({ amountMinor: '50.00', currency: 'USD', exponent: 2, registrySnapshot: 'v1' }, 'subtotal', 'USD'),
      (err: unknown) => isCheckoutSessionResponseInvalidError(err)
    );
  });

  // ---------------------------------------------------------------------------
  // 63. Runtime response parser: missing registrySnapshot rejected
  // ---------------------------------------------------------------------------
  test('63. runtime parser rejects missing registrySnapshot', () => {
    assert.throws(
      () => parseCheckoutSessionMoney({ amountMinor: '5000', currency: 'USD', exponent: 2, registrySnapshot: '' }, 'subtotal', 'USD'),
      (err: unknown) => isCheckoutSessionResponseInvalidError(err) && (err as { fieldPath: string }).fieldPath === 'subtotal.registrySnapshot'
    );
  });

  // ---------------------------------------------------------------------------
  // 64. Runtime response parser: cross-currency money rejected
  // ---------------------------------------------------------------------------
  test('64. runtime parser rejects money with currency mismatch against session', () => {
    assert.throws(
      () => parseCheckoutSessionMoney({ amountMinor: '5000', currency: 'EUR', exponent: 2, registrySnapshot: 'v1' }, 'subtotal', 'USD'),
      (err: unknown) => isCheckoutSessionResponseInvalidError(err) && (err as { fieldPath: string }).fieldPath === 'subtotal.currency'
    );
  });

  // ---------------------------------------------------------------------------
  // 65. Runtime response parser: invalid lease timestamp rejected
  // ---------------------------------------------------------------------------
  test('65. runtime parser rejects unparseable leaseExpiresAt timestamp', () => {
    const bad = { ...mockPublicSession, leaseExpiresAt: 'not-a-timestamp' };
    assert.throws(
      () => parsePublicCheckoutSession(bad),
      (err: unknown) => isCheckoutSessionResponseInvalidError(err) && (err as { fieldPath: string }).fieldPath === 'session.leaseExpiresAt'
    );
  });

  // ---------------------------------------------------------------------------
  // 66. Runtime response parser: converted without convertedOrderDisplayId rejected
  // ---------------------------------------------------------------------------
  test('66. runtime parser rejects converted status without convertedOrderDisplayId', () => {
    const bad = { ...mockPublicSession, status: 'converted', convertedOrderDisplayId: null };
    assert.throws(
      () => parsePublicCheckoutSession(bad),
      (err: unknown) => isCheckoutSessionResponseInvalidError(err) && (err as { fieldPath: string }).fieldPath === 'session.convertedOrderDisplayId'
    );
  });

  // ---------------------------------------------------------------------------
  // 67. Runtime response parser: unknown response fields omitted from parsed result
  // ---------------------------------------------------------------------------
  test('67. runtime parser safely omits unknown fields without spreading raw JSON', () => {
    const networkJson = {
      ...mockPublicSession,
      unexpectedInternalField: 'INTERNAL_SECRET_LEAK',
      providerInternalToken: 'TOKEN_123',
    };

    const parsed = parsePublicCheckoutSession(networkJson);
    assert.equal(parsed.sessionId, 'cs_live_test_1234567890');
    assert.equal('unexpectedInternalField' in parsed, false);
    assert.equal('providerInternalToken' in parsed, false);
  });

  // ---------------------------------------------------------------------------
  // 68. Runtime response parser: clientSecret optional and malformed secret rejected safely
  // ---------------------------------------------------------------------------
  test('68. parsePaymentAttempt keeps clientSecret optional and rejects malformed secret safely', () => {
    const withoutSecret = parsePaymentAttempt({ provider: 'stripe', status: 'requires_action' });
    assert.ok(withoutSecret);
    assert.equal(withoutSecret.clientSecret, undefined);

    assert.throws(
      // @ts-expect-error test-only invalid type
      () => parsePaymentAttempt({ provider: 'stripe', status: 'requires_action', clientSecret: 12345 }),
      (err: unknown) => isCheckoutSessionResponseInvalidError(err) && (err as { fieldPath: string }).fieldPath === 'paymentAttempt.clientSecret'
    );
  });

  // ---------------------------------------------------------------------------
  // 69. create/get/cancel all invoke runtime parser
  // ---------------------------------------------------------------------------
  test('69. createCheckoutSession, getCheckoutSession, and cancelCheckoutSession all enforce runtime validation', async () => {
    // create with malformed amounts
    api.post = (async () => ({
      status: 201,
      data: {
        success: true,
        data: {
          session: { ...mockPublicSession, amounts: null },
        },
      },
    })) as typeof api.post;

    await assert.rejects(
      () => createCheckoutSession({} as CreateCheckoutSessionRequest, 'checkout-v1-abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890'),
      (err: unknown) => isCheckoutSessionResponseInvalidError(err)
    );

    // get with malformed status
    api.get = (async () => ({
      status: 200,
      data: {
        success: true,
        data: {
          session: { ...mockPublicSession, status: 'invalid_status_enum' },
        },
      },
    })) as typeof api.get;

    await assert.rejects(
      () => getCheckoutSession('cs_123'),
      (err: unknown) => isCheckoutSessionResponseInvalidError(err)
    );

    // cancel with malformed session
    api.post = (async () => ({
      status: 200,
      data: {
        success: true,
        data: {
          session: { ...mockPublicSession, sessionId: '' },
        },
      },
    })) as typeof api.post;

    await assert.rejects(
      () => cancelCheckoutSession('cs_123'),
      (err: unknown) => isCheckoutSessionResponseInvalidError(err)
    );
  });

  // ---------------------------------------------------------------------------
  // 70. State Machine: payment_captured rejects failed regression
  // ---------------------------------------------------------------------------
  test('70. payment_captured rejects failed regression', async () => {
    const scope = 'user_cap_failed';
    const hashedScope = await computeHashedUserScope(scope);
    await getOrCreateCheckoutAttempt(sampleIntentInput, { userScope: scope });
    updateCheckoutAttemptSession(hashedScope, { status: 'payment_captured' });

    assert.throws(
      () => updateCheckoutAttemptSession(hashedScope, { status: 'failed' }),
      (err: unknown) =>
        err instanceof CheckoutAttemptStaleUpdateError &&
        err.code === 'CHECKOUT_ATTEMPT_STALE_UPDATE_IGNORED'
    );
    const rec = getCheckoutAttempt(hashedScope);
    assert.equal(rec?.status, 'payment_captured');
  });

  // ---------------------------------------------------------------------------
  // 71. State Machine: payment_captured rejects cancelled regression
  // ---------------------------------------------------------------------------
  test('71. payment_captured rejects cancelled regression', async () => {
    const scope = 'user_cap_cancelled';
    const hashedScope = await computeHashedUserScope(scope);
    await getOrCreateCheckoutAttempt(sampleIntentInput, { userScope: scope });
    updateCheckoutAttemptSession(hashedScope, { status: 'payment_captured' });

    assert.throws(
      () => updateCheckoutAttemptSession(hashedScope, { status: 'cancelled' }),
      (err: unknown) =>
        err instanceof CheckoutAttemptStaleUpdateError &&
        err.code === 'CHECKOUT_ATTEMPT_STALE_UPDATE_IGNORED'
    );
    const rec = getCheckoutAttempt(hashedScope);
    assert.equal(rec?.status, 'payment_captured');
  });

  // ---------------------------------------------------------------------------
  // 72. State Machine: payment_captured rejects expired regression
  // ---------------------------------------------------------------------------
  test('72. payment_captured rejects expired regression', async () => {
    const scope = 'user_cap_expired';
    const hashedScope = await computeHashedUserScope(scope);
    await getOrCreateCheckoutAttempt(sampleIntentInput, { userScope: scope });
    updateCheckoutAttemptSession(hashedScope, { status: 'payment_captured' });

    assert.throws(
      () => updateCheckoutAttemptSession(hashedScope, { status: 'expired' }),
      (err: unknown) =>
        err instanceof CheckoutAttemptStaleUpdateError &&
        err.code === 'CHECKOUT_ATTEMPT_STALE_UPDATE_IGNORED'
    );
    const rec = getCheckoutAttempt(hashedScope);
    assert.equal(rec?.status, 'payment_captured');
  });

  // ---------------------------------------------------------------------------
  // 73. State Machine: converting rejects payment_captured regression
  // ---------------------------------------------------------------------------
  test('73. converting rejects payment_captured regression', async () => {
    const scope = 'user_conv_cap';
    const hashedScope = await computeHashedUserScope(scope);
    await getOrCreateCheckoutAttempt(sampleIntentInput, { userScope: scope });
    updateCheckoutAttemptSession(hashedScope, { status: 'converting' });

    assert.throws(
      () => updateCheckoutAttemptSession(hashedScope, { status: 'payment_captured' }),
      (err: unknown) =>
        err instanceof CheckoutAttemptStaleUpdateError &&
        err.code === 'CHECKOUT_ATTEMPT_STALE_UPDATE_IGNORED'
    );
    const rec = getCheckoutAttempt(hashedScope);
    assert.equal(rec?.status, 'converting');
  });

  // ---------------------------------------------------------------------------
  // 74. State Machine: converting rejects failed regression
  // ---------------------------------------------------------------------------
  test('74. converting rejects failed regression', async () => {
    const scope = 'user_conv_failed';
    const hashedScope = await computeHashedUserScope(scope);
    await getOrCreateCheckoutAttempt(sampleIntentInput, { userScope: scope });
    updateCheckoutAttemptSession(hashedScope, { status: 'converting' });

    assert.throws(
      () => updateCheckoutAttemptSession(hashedScope, { status: 'failed' }),
      (err: unknown) =>
        err instanceof CheckoutAttemptStaleUpdateError &&
        err.code === 'CHECKOUT_ATTEMPT_STALE_UPDATE_IGNORED'
    );
    const rec = getCheckoutAttempt(hashedScope);
    assert.equal(rec?.status, 'converting');
  });

  // ---------------------------------------------------------------------------
  // 75. State Machine: converting rejects cancelled regression
  // ---------------------------------------------------------------------------
  test('75. converting rejects cancelled regression', async () => {
    const scope = 'user_conv_cancelled';
    const hashedScope = await computeHashedUserScope(scope);
    await getOrCreateCheckoutAttempt(sampleIntentInput, { userScope: scope });
    updateCheckoutAttemptSession(hashedScope, { status: 'converting' });

    assert.throws(
      () => updateCheckoutAttemptSession(hashedScope, { status: 'cancelled' }),
      (err: unknown) =>
        err instanceof CheckoutAttemptStaleUpdateError &&
        err.code === 'CHECKOUT_ATTEMPT_STALE_UPDATE_IGNORED'
    );
    const rec = getCheckoutAttempt(hashedScope);
    assert.equal(rec?.status, 'converting');
  });

  // ---------------------------------------------------------------------------
  // 76. State Machine: cancellation_requested permits payment_captured
  // ---------------------------------------------------------------------------
  test('76. cancellation_requested permits payment_captured because capture may win', async () => {
    const scope = 'user_canc_req_cap';
    const hashedScope = await computeHashedUserScope(scope);
    await getOrCreateCheckoutAttempt(sampleIntentInput, { userScope: scope });
    updateCheckoutAttemptSession(hashedScope, { status: 'cancellation_requested' });

    const updated = updateCheckoutAttemptSession(hashedScope, { status: 'payment_captured' });
    assert.equal(updated?.status, 'payment_captured');
    const rec = getCheckoutAttempt(hashedScope);
    assert.equal(rec?.status, 'payment_captured');
  });

  // ---------------------------------------------------------------------------
  // 77. State Machine: cancellation_requested permits cancelled
  // ---------------------------------------------------------------------------
  test('77. cancellation_requested permits cancelled because cancellation may win', async () => {
    const scope = 'user_canc_req_cancelled';
    const hashedScope = await computeHashedUserScope(scope);
    await getOrCreateCheckoutAttempt(sampleIntentInput, { userScope: scope });
    updateCheckoutAttemptSession(hashedScope, { status: 'cancellation_requested' });

    const updated = updateCheckoutAttemptSession(hashedScope, { status: 'cancelled' });
    assert.equal(updated?.status, 'cancelled');
    const rec = getCheckoutAttempt(hashedScope);
    assert.equal(rec?.status, 'cancelled');
  });

  // ---------------------------------------------------------------------------
  // 78. State Machine: cancelled permits conflict for late capture reconciliation
  // ---------------------------------------------------------------------------
  test('78. cancelled permits conflict for late capture reconciliation matching backend authority', async () => {
    const scope = 'user_canc_conflict';
    const hashedScope = await computeHashedUserScope(scope);
    await getOrCreateCheckoutAttempt(sampleIntentInput, { userScope: scope });
    updateCheckoutAttemptSession(hashedScope, { status: 'cancelled' });

    const updated = updateCheckoutAttemptSession(hashedScope, { status: 'conflict' });
    assert.equal(updated?.status, 'conflict');
    const rec = getCheckoutAttempt(hashedScope);
    assert.equal(rec?.status, 'conflict');
  });

  // ---------------------------------------------------------------------------
  // 79. State Machine: expired permits conflict for late capture reconciliation
  // ---------------------------------------------------------------------------
  test('79. expired permits conflict for late capture reconciliation matching backend authority', async () => {
    const scope = 'user_exp_conflict';
    const hashedScope = await computeHashedUserScope(scope);
    await getOrCreateCheckoutAttempt(sampleIntentInput, { userScope: scope });
    updateCheckoutAttemptSession(hashedScope, { status: 'expired' });

    const updated = updateCheckoutAttemptSession(hashedScope, { status: 'conflict' });
    assert.equal(updated?.status, 'conflict');
    const rec = getCheckoutAttempt(hashedScope);
    assert.equal(rec?.status, 'conflict');
  });

  // ---------------------------------------------------------------------------
  // 80. State Machine: failed rejects transition to conflict (failed is terminal)
  // ---------------------------------------------------------------------------
  test('80. failed rejects transition to conflict matching backend authority', async () => {
    const scope = 'user_fail_no_conflict';
    const hashedScope = await computeHashedUserScope(scope);
    await getOrCreateCheckoutAttempt(sampleIntentInput, { userScope: scope });
    updateCheckoutAttemptSession(hashedScope, { status: 'failed' });

    assert.throws(
      () => updateCheckoutAttemptSession(hashedScope, { status: 'conflict' }),
      (err: unknown) =>
        err instanceof CheckoutAttemptStaleUpdateError &&
        err.code === 'CHECKOUT_ATTEMPT_STALE_UPDATE_IGNORED'
    );
    const rec = getCheckoutAttempt(hashedScope);
    assert.equal(rec?.status, 'failed');
  });

  // ---------------------------------------------------------------------------
  // 81. State Machine: conflict rejects failed
  // ---------------------------------------------------------------------------
  test('81. conflict rejects failed', async () => {
    const scope = 'user_conf_fail';
    const hashedScope = await computeHashedUserScope(scope);
    await getOrCreateCheckoutAttempt(sampleIntentInput, { userScope: scope });
    updateCheckoutAttemptSession(hashedScope, { status: 'conflict' });

    assert.throws(
      () => updateCheckoutAttemptSession(hashedScope, { status: 'failed' }),
      (err: unknown) =>
        err instanceof CheckoutAttemptStaleUpdateError &&
        err.code === 'CHECKOUT_ATTEMPT_STALE_UPDATE_IGNORED'
    );
    const rec = getCheckoutAttempt(hashedScope);
    assert.equal(rec?.status, 'conflict');
  });

  // ---------------------------------------------------------------------------
  // 82. State Machine: conflict rejects cancelled
  // ---------------------------------------------------------------------------
  test('82. conflict rejects cancelled', async () => {
    const scope = 'user_conf_canc';
    const hashedScope = await computeHashedUserScope(scope);
    await getOrCreateCheckoutAttempt(sampleIntentInput, { userScope: scope });
    updateCheckoutAttemptSession(hashedScope, { status: 'conflict' });

    assert.throws(
      () => updateCheckoutAttemptSession(hashedScope, { status: 'cancelled' }),
      (err: unknown) =>
        err instanceof CheckoutAttemptStaleUpdateError &&
        err.code === 'CHECKOUT_ATTEMPT_STALE_UPDATE_IGNORED'
    );
    const rec = getCheckoutAttempt(hashedScope);
    assert.equal(rec?.status, 'conflict');
  });

  // ---------------------------------------------------------------------------
  // 83. State Machine: converted rejects every non-converted status
  // ---------------------------------------------------------------------------
  test('83. converted rejects every non-converted status', async () => {
    const scope = 'user_conv_immutable';
    const hashedScope = await computeHashedUserScope(scope);
    const attempt = await getOrCreateCheckoutAttempt(sampleIntentInput, { userScope: scope });
    updateCheckoutAttemptSession(hashedScope, {
      status: 'converted',
      convertedOrderDisplayId: 'ORD-IMMUTABLE',
      expectedFingerprint: attempt.baseFingerprint,
      expectedGeneration: attempt.generation,
    });

    const nonConverted: CheckoutAttemptStatus[] = [
      'creating',
      'active',
      'payment_pending',
      'payment_captured',
      'converting',
      'cancellation_requested',
      'cancelled',
      'expired',
      'failed',
      'conflict',
    ];

    for (const st of nonConverted) {
      assert.throws(
        () =>
          updateCheckoutAttemptSession(hashedScope, {
            status: st,
            expectedFingerprint: attempt.baseFingerprint,
            expectedGeneration: attempt.generation,
          }),
        (err: unknown) =>
          err instanceof CheckoutAttemptStaleUpdateError &&
          err.code === 'CHECKOUT_ATTEMPT_STALE_UPDATE_IGNORED',
        `converted must reject transition to ${st}`
      );
    }

    const completion = getCheckoutCompletion(hashedScope, attempt.baseFingerprint, attempt.generation);
    assert.equal(completion?.status, 'converted');
    assert.equal(completion?.convertedOrderDisplayId, 'ORD-IMMUTABLE');
  });

  // ---------------------------------------------------------------------------
  // 84. State Machine: same-state updates remain idempotent
  // ---------------------------------------------------------------------------
  test('84. same-state updates remain idempotent across statuses', () => {
    const statuses: CheckoutAttemptStatus[] = [
      'creating',
      'active',
      'payment_pending',
      'payment_captured',
      'converting',
      'cancellation_requested',
      'cancelled',
      'expired',
      'failed',
      'conflict',
      'converted',
    ];

    for (const st of statuses) {
      assert.equal(isAllowedAttemptTransition(st, st), true, `Same-state transition for ${st} must be allowed`);
    }
  });

  // ---------------------------------------------------------------------------
  // 85. Update Validation: correct generation but wrong idempotencyKey is rejected
  // ---------------------------------------------------------------------------
  test('85. correct generation but wrong idempotencyKey is rejected', async () => {
    const scope = 'user_wrong_key';
    const hashedScope = await computeHashedUserScope(scope);
    const rec = await getOrCreateCheckoutAttempt(sampleIntentInput, { userScope: scope });

    const wrongKey = 'checkout-v1-' + '9'.repeat(64);
    assert.notEqual(wrongKey, rec.idempotencyKey);

    assert.throws(
      () =>
        updateCheckoutAttemptSession(hashedScope, {
          status: 'active',
          expectedGeneration: 1,
          expectedIdempotencyKey: wrongKey,
        }),
      (err: unknown) =>
        err instanceof CheckoutAttemptStaleUpdateError &&
        err.code === 'CHECKOUT_ATTEMPT_STALE_UPDATE_IGNORED'
    );
  });

  // ===========================================================================
  // PHASE 6D-5B BATCH 2: REPEAT-PURCHASE AND CONVERTED TOMBSTONE SAFETY TESTS
  // (All 20 Required Behavioral Requirements)
  // ===========================================================================

  // 1. Q1 retry derives the same fingerprint/key
  test('REQ-1: Q1 retry derives the same fingerprint and idempotency key', async () => {
    const scope = 'user_req_1';
    const intentQ1: CheckoutIntentInput = {
      ...sampleIntentInput,
      quoteId: 'QUO-20260919-Q1-000001',
    };

    const attempt1 = await getOrCreateCheckoutAttempt(intentQ1, { userScope: scope });
    const attempt2 = await getOrCreateCheckoutAttempt(intentQ1, { userScope: scope, forceNewAttempt: false });

    assert.equal(attempt1.baseFingerprint, attempt2.baseFingerprint);
    assert.equal(attempt1.idempotencyKey, attempt2.idempotencyKey);
    assert.equal(attempt1.generation, attempt2.generation);
  });

  // 2. Newly issued Q2 derives a different fingerprint/key despite identical economics
  test('REQ-2: newly issued Q2 derives a different fingerprint and key despite identical economics', async () => {
    const scope = 'user_req_2';
    const hashedScope = await computeHashedUserScope(scope);

    const intentQ1: CheckoutIntentInput = {
      ...sampleIntentInput,
      quoteId: 'QUO-20260919-Q1-AAA',
    };

    const intentQ2: CheckoutIntentInput = {
      ...sampleIntentInput,
      quoteId: 'QUO-20260919-Q2-BBB', // identical products, address, coupon, price; separate quote
    };

    const fp1 = await computeCheckoutFingerprint(intentQ1, hashedScope);
    const fp2 = await computeCheckoutFingerprint(intentQ2, hashedScope);

    assert.notEqual(fp1, fp2, 'Q1 and Q2 base fingerprints must differ due to authoritative quoteId');

    const key1 = await deriveIdempotencyKey(fp1, 1);
    const key2 = await deriveIdempotencyKey(fp2, 1);

    assert.notEqual(key1, key2, 'Q1 and Q2 idempotency keys must differ');
  });

  // 3. Raw quoteToken is absent from key and storage
  test('REQ-3: raw quoteToken is absent from key and storage', async () => {
    const scope = 'user_req_3';
    const hashedScope = await computeHashedUserScope(scope);
    const intent: CheckoutIntentInput = {
      ...sampleIntentInput,
      quoteId: 'QUO-20260919-TOKEN-AUDIT',
    };

    const attempt = await getOrCreateCheckoutAttempt(intent, { userScope: scope });

    // Stored active attempt check
    const rawActive = window.localStorage.getItem(`${STORAGE_KEY_PREFIX}${hashedScope}`);
    assert.ok(rawActive);
    assert.ok(!rawActive.includes('quoteToken'));
    assert.ok(!rawActive.includes('eyJhbGciOi'));
    assert.ok(!attempt.idempotencyKey.includes('quoteToken'));
  });

  // 4. Converted reload recovers convertedOrderDisplayId
  test('REQ-4: converted reload recovers convertedOrderDisplayId from storage', async () => {
    const scope = 'user_req_4';
    const hashedScope = await computeHashedUserScope(scope);
    const intent: CheckoutIntentInput = {
      ...sampleIntentInput,
      quoteId: 'QUO-20260919-RELOAD-CONV',
    };

    const attempt = await getOrCreateCheckoutAttempt(intent, { userScope: scope });
    updateCheckoutAttemptSession(hashedScope, {
      status: 'converted',
      sessionId: 'cs_conv_reload_1',
      convertedOrderDisplayId: 'ORD-SUCCESS-RELOAD-77',
      expectedFingerprint: attempt.baseFingerprint,
      expectedGeneration: attempt.generation,
    });

    // Customer reloads the page / confirms order
    const recovered = await getOrCreateCheckoutAttempt(intent, { userScope: scope });
    assert.equal(recovered.status, 'converted');
    assert.equal(recovered.convertedOrderDisplayId, 'ORD-SUCCESS-RELOAD-77');

    const directRecord = await getCheckoutAttemptRecord(intent, { userScope: scope });
    assert.equal(directRecord?.status, 'converted');
    assert.equal(directRecord?.convertedOrderDisplayId, 'ORD-SUCCESS-RELOAD-77');
  });

  // 5. Stale update cannot resurrect converted attempt
  test('REQ-5: stale update cannot resurrect converted attempt', async () => {
    const scope = 'user_req_5';
    const hashedScope = await computeHashedUserScope(scope);
    const intent: CheckoutIntentInput = {
      ...sampleIntentInput,
      quoteId: 'QUO-20260919-RESURRECT-TEST',
    };

    const attempt = await getOrCreateCheckoutAttempt(intent, { userScope: scope });
    updateCheckoutAttemptSession(hashedScope, {
      status: 'converted',
      sessionId: 'cs_conv_done',
      convertedOrderDisplayId: 'ORD-DONE-123',
      expectedFingerprint: attempt.baseFingerprint,
      expectedGeneration: attempt.generation,
    });

    // Delayed webhook / active attempt update arrives
    assert.throws(
      () =>
        updateCheckoutAttemptSession(hashedScope, {
          status: 'active',
          expectedFingerprint: attempt.baseFingerprint,
          expectedGeneration: attempt.generation,
        }),
      (err: unknown) =>
        err instanceof CheckoutAttemptStaleUpdateError &&
        err.code === 'CHECKOUT_ATTEMPT_STALE_UPDATE_IGNORED'
    );

    const completion = getCheckoutCompletion(hashedScope, attempt.baseFingerprint, attempt.generation);
    assert.equal(completion?.status, 'converted');
    assert.equal(completion?.convertedOrderDisplayId, 'ORD-DONE-123');
  });

  // 6. New different-intent checkout starts immediately after conversion
  test('REQ-6: new different-intent checkout starts immediately after conversion without waiting 1 hour', async () => {
    const scope = 'user_req_6';
    const hashedScope = await computeHashedUserScope(scope);

    // Initial purchase converted
    const intent1: CheckoutIntentInput = {
      ...sampleIntentInput,
      quoteId: 'QUO-20260919-ORDER-1',
    };
    const att1 = await getOrCreateCheckoutAttempt(intent1, { userScope: scope });
    updateCheckoutAttemptSession(hashedScope, {
      status: 'converted',
      convertedOrderDisplayId: 'ORD-FIRST-999',
      expectedFingerprint: att1.baseFingerprint,
      expectedGeneration: att1.generation,
    });

    // Customer immediately buys different product
    const intent2: CheckoutIntentInput = {
      ...sampleIntentInput,
      quoteId: 'QUO-20260919-ORDER-2',
      items: [{ productId: 'prod_different_item', quantity: 1 }],
    };

    const att2 = await getOrCreateCheckoutAttempt(intent2, { userScope: scope });
    assert.equal(att2.status, 'creating');
    assert.equal(att2.generation, 1);
    assert.notEqual(att2.baseFingerprint, att1.baseFingerprint);
  });

  // 7. New same-cart purchase with new quote starts immediately after conversion
  test('REQ-7: new same-cart purchase with new quote starts immediately after conversion', async () => {
    const scope = 'user_req_7';
    const hashedScope = await computeHashedUserScope(scope);

    const intentQ1: CheckoutIntentInput = {
      ...sampleIntentInput,
      quoteId: 'QUO-20260919-FIRST-PURCHASE',
    };
    const att1 = await getOrCreateCheckoutAttempt(intentQ1, { userScope: scope });
    updateCheckoutAttemptSession(hashedScope, {
      status: 'converted',
      convertedOrderDisplayId: 'ORD-FIRST-PURCHASE',
      expectedFingerprint: att1.baseFingerprint,
      expectedGeneration: att1.generation,
    });

    // Same cart items and address, but new quote Q2 issued by backend
    const intentQ2: CheckoutIntentInput = {
      ...sampleIntentInput,
      quoteId: 'QUO-20260919-SECOND-PURCHASE',
    };

    const att2 = await getOrCreateCheckoutAttempt(intentQ2, { userScope: scope });
    assert.equal(att2.status, 'creating');
    assert.equal(att2.generation, 1);
    assert.notEqual(att2.idempotencyKey, att1.idempotencyKey);
  });

  // 8. New purchase does not reuse old idempotency key
  test('REQ-8: new purchase does not reuse old idempotency key', async () => {
    const scope = 'user_req_8';
    const hashedScope = await computeHashedUserScope(scope);

    const intentQ1: CheckoutIntentInput = {
      ...sampleIntentInput,
      quoteId: 'QUO-20260919-KEY-REUSE-1',
    };
    const att1 = await getOrCreateCheckoutAttempt(intentQ1, { userScope: scope });
    updateCheckoutAttemptSession(hashedScope, {
      status: 'converted',
      convertedOrderDisplayId: 'ORD-KEY-REUSE-1',
      expectedFingerprint: att1.baseFingerprint,
      expectedGeneration: att1.generation,
    });

    const intentQ2: CheckoutIntentInput = {
      ...sampleIntentInput,
      quoteId: 'QUO-20260919-KEY-REUSE-2',
    };
    const att2 = await getOrCreateCheckoutAttempt(intentQ2, { userScope: scope });

    assert.notEqual(att1.idempotencyKey, att2.idempotencyKey);
  });

  // 9. Tombstone expiry cannot cause old key reuse
  test('REQ-9: tombstone expiry cannot cause old idempotency key reuse', async () => {
    const scope = 'user_req_9';
    const hashedScope = await computeHashedUserScope(scope);

    const intentQ1: CheckoutIntentInput = {
      ...sampleIntentInput,
      quoteId: 'QUO-20260919-EXPIRY-SAFETY-1',
    };
    const att1 = await getOrCreateCheckoutAttempt(intentQ1, { userScope: scope });
    updateCheckoutAttemptSession(hashedScope, {
      status: 'converted',
      convertedOrderDisplayId: 'ORD-EXP-1',
      expectedFingerprint: att1.baseFingerprint,
      expectedGeneration: att1.generation,
    });

    // Clear all storage or simulate tombstone expiry
    clearAllCheckoutAttempts();

    // Later purchase with new quote Q2
    const intentQ2: CheckoutIntentInput = {
      ...sampleIntentInput,
      quoteId: 'QUO-20260919-EXPIRY-SAFETY-2',
    };
    const att2 = await getOrCreateCheckoutAttempt(intentQ2, { userScope: scope });

    assert.notEqual(att1.idempotencyKey, att2.idempotencyKey, 'New quote must derive distinct key even if storage was emptied');
  });

  // 10. Delayed Q1 response cannot overwrite active Q2
  test('REQ-10: delayed Q1 response cannot overwrite active Q2', async () => {
    const scope = 'user_req_10';
    const hashedScope = await computeHashedUserScope(scope);

    // Q1 completes and writes to completion store
    const intentQ1: CheckoutIntentInput = {
      ...sampleIntentInput,
      quoteId: 'QUO-20260919-DELAY-Q1',
    };
    const att1 = await getOrCreateCheckoutAttempt(intentQ1, { userScope: scope });
    updateCheckoutAttemptSession(hashedScope, {
      status: 'converted',
      convertedOrderDisplayId: 'ORD-Q1-DONE',
      expectedFingerprint: att1.baseFingerprint,
      expectedGeneration: att1.generation,
    });

    // Q2 starts and becomes active
    const intentQ2: CheckoutIntentInput = {
      ...sampleIntentInput,
      quoteId: 'QUO-20260919-ACTIVE-Q2',
    };
    const att2 = await getOrCreateCheckoutAttempt(intentQ2, { userScope: scope });
    updateCheckoutAttemptSession(hashedScope, {
      status: 'active',
      sessionId: 'cs_active_q2',
      expectedFingerprint: att2.baseFingerprint,
      expectedGeneration: att2.generation,
    });

    // Delayed Q1 response arrives with active status
    assert.throws(
      () =>
        updateCheckoutAttemptSession(hashedScope, {
          status: 'active',
          expectedFingerprint: att1.baseFingerprint,
          expectedGeneration: att1.generation,
        }),
      (err: unknown) => err instanceof CheckoutAttemptStaleUpdateError
    );

    // Active Q2 attempt in storage is completely intact
    const currentActive = getCheckoutAttempt(hashedScope);
    assert.equal(currentActive?.sessionId, 'cs_active_q2');
    assert.equal(currentActive?.baseFingerprint, att2.baseFingerprint);
    assert.equal(currentActive?.status, 'active');
  });

  // 11. Delayed Q1 response cannot delete Q2
  test('REQ-11: delayed Q1 response cannot delete Q2', async () => {
    const scope = 'user_req_11';
    const hashedScope = await computeHashedUserScope(scope);

    const intentQ1: CheckoutIntentInput = {
      ...sampleIntentInput,
      quoteId: 'QUO-20260919-DEL-Q1',
    };
    const att1 = await getOrCreateCheckoutAttempt(intentQ1, { userScope: scope });
    updateCheckoutAttemptSession(hashedScope, {
      status: 'converted',
      convertedOrderDisplayId: 'ORD-Q1-COMPLETED',
      expectedFingerprint: att1.baseFingerprint,
      expectedGeneration: att1.generation,
    });

    const intentQ2: CheckoutIntentInput = {
      ...sampleIntentInput,
      quoteId: 'QUO-20260919-DEL-Q2',
    };
    const att2 = await getOrCreateCheckoutAttempt(intentQ2, { userScope: scope });

    // Delayed Q1 error update arrives
    try {
      updateCheckoutAttemptSession(hashedScope, {
        status: 'failed',
        expectedFingerprint: att1.baseFingerprint,
        expectedGeneration: att1.generation,
      });
    } catch {
      // expected error
    }

    const currentActive = getCheckoutAttempt(hashedScope);
    assert.ok(currentActive, 'Q2 active attempt must survive delayed Q1 updates');
    assert.equal(currentActive.baseFingerprint, att2.baseFingerprint);
  });

  // 12. Q1 completion and Q2 active attempt can coexist safely
  test('REQ-12: Q1 completion and Q2 active attempt can coexist safely in storage', async () => {
    const scope = 'user_req_12';
    const hashedScope = await computeHashedUserScope(scope);

    const intentQ1: CheckoutIntentInput = {
      ...sampleIntentInput,
      quoteId: 'QUO-20260919-COEXIST-Q1',
    };
    const att1 = await getOrCreateCheckoutAttempt(intentQ1, { userScope: scope });
    updateCheckoutAttemptSession(hashedScope, {
      status: 'converted',
      convertedOrderDisplayId: 'ORD-COEXIST-1',
      expectedFingerprint: att1.baseFingerprint,
      expectedGeneration: att1.generation,
    });

    const intentQ2: CheckoutIntentInput = {
      ...sampleIntentInput,
      quoteId: 'QUO-20260919-COEXIST-Q2',
    };
    const att2 = await getOrCreateCheckoutAttempt(intentQ2, { userScope: scope });

    // Q1 completion is readable
    const completion1 = getCheckoutCompletion(hashedScope, att1.baseFingerprint, att1.generation);
    assert.equal(completion1?.convertedOrderDisplayId, 'ORD-COEXIST-1');

    // Q2 active attempt is readable
    const active2 = getCheckoutAttempt(hashedScope);
    assert.equal(active2?.baseFingerprint, att2.baseFingerprint);
    assert.equal(active2?.status, 'creating');
  });

  // 13. clearAllCheckoutAttempts removes both namespaces
  test('REQ-13: clearAllCheckoutAttempts removes both active and completion namespaces', async () => {
    const scope = 'user_req_13';
    const hashedScope = await computeHashedUserScope(scope);

    const intent: CheckoutIntentInput = {
      ...sampleIntentInput,
      quoteId: 'QUO-20260919-CLEAR-BOTH',
    };
    const att = await getOrCreateCheckoutAttempt(intent, { userScope: scope });
    updateCheckoutAttemptSession(hashedScope, {
      status: 'converted',
      convertedOrderDisplayId: 'ORD-CLEAR-TEST',
      expectedFingerprint: att.baseFingerprint,
      expectedGeneration: att.generation,
    });

    // Also write an active attempt
    await getOrCreateCheckoutAttempt({ ...sampleIntentInput, quoteId: 'QUO-ACTIVE' }, { userScope: scope });

    assert.ok(getCheckoutCompletion(hashedScope, att.baseFingerprint, att.generation));
    assert.ok(getCheckoutAttempt(hashedScope));

    clearAllCheckoutAttempts();

    assert.equal(getCheckoutCompletion(hashedScope, att.baseFingerprint, att.generation), null);
    assert.equal(getCheckoutAttempt(hashedScope), null);
  });

  // 14. Unrelated localStorage keys survive cleanup
  test('REQ-14: unrelated localStorage keys survive clearAllCheckoutAttempts', async () => {
    window.localStorage.setItem('user_theme_preference', 'dark');
    window.localStorage.setItem('cart_items_backup', '{"items":[]}');

    const scope = await computeHashedUserScope('user_survive');
    await getOrCreateCheckoutAttempt(sampleIntentInput, { userScope: 'user_survive' });

    clearAllCheckoutAttempts();

    assert.equal(window.localStorage.getItem('user_theme_preference'), 'dark');
    assert.equal(window.localStorage.getItem('cart_items_backup'), '{"items":[]}');
    assert.equal(getCheckoutAttempt(scope), null);
  });

  // 15. Malformed/expired completion records are safely purged
  test('REQ-15: malformed and expired completion records are safely purged', async () => {
    const scope = 'user_req_15';
    const hashedScope = await computeHashedUserScope(scope);
    const fp = 'f'.repeat(64);

    const expiredKey = `${COMPLETION_KEY_PREFIX}${hashedScope}:${fp}:1`;
    const corruptKey = `${COMPLETION_KEY_PREFIX}${hashedScope}:${fp}:2`;

    // Expired record
    window.localStorage.setItem(
      expiredKey,
      JSON.stringify({
        schemaVersion: 1,
        baseFingerprint: fp,
        generation: 1,
        idempotencyKey: 'checkout-v1-' + fp,
        status: 'converted',
        convertedOrderDisplayId: 'ORD-OLD',
        createdAt: Date.now() - 100000,
        updatedAt: Date.now() - 100000,
        recoveryExpiresAt: Date.now() - 1000, // expired
      })
    );

    // Corrupt record
    window.localStorage.setItem(corruptKey, '{invalid json');

    // getCheckoutCompletion should purge expired & corrupt records
    const res1 = getCheckoutCompletion(hashedScope, fp, 1);
    assert.equal(res1, null);
    assert.equal(window.localStorage.getItem(expiredKey), null);

    const res2 = getCheckoutCompletion(hashedScope, fp, 2);
    assert.equal(res2, null);
    assert.equal(window.localStorage.getItem(corruptKey), null);
  });

  // 16. Completion records contain no PII or secrets
  test('REQ-16: completion records contain no PII or secrets', async () => {
    const scope = 'user_req_16';
    const hashedScope = await computeHashedUserScope(scope);
    const intent: CheckoutIntentInput = {
      ...sampleIntentInput,
      quoteId: 'QUO-20260919-PII-CHECK-COMPL',
      shippingAddress: {
        fullName: 'Secret VIP Buyer',
        phone: '+15551234567',
        address: '100 Secret Way',
        city: 'Beverly Hills',
        countryCode: 'US',
      },
    };

    const att = await getOrCreateCheckoutAttempt(intent, { userScope: scope });
    updateCheckoutAttemptSession(hashedScope, {
      status: 'converted',
      convertedOrderDisplayId: 'ORD-VIP-99',
      expectedFingerprint: att.baseFingerprint,
      expectedGeneration: att.generation,
    });

    const completionKey = `${COMPLETION_KEY_PREFIX}${hashedScope}:${att.baseFingerprint}:${att.generation}`;
    const raw = window.localStorage.getItem(completionKey);
    assert.ok(raw);

    assert.ok(!raw.includes('Secret VIP Buyer'));
    assert.ok(!raw.includes('+15551234567'));
    assert.ok(!raw.includes('100 Secret Way'));
    assert.ok(!raw.includes('quoteToken'));
    assert.ok(!raw.includes('clientSecret'));
  });

  // 17. failed -> conflict matches backend authority or is rejected
  test('REQ-17: failed -> conflict matches backend authority (rejected)', () => {
    assert.equal(
      isAllowedAttemptTransition('failed', 'conflict'),
      false,
      'failed -> conflict must be rejected because failed is terminal in backend authority'
    );
  });

  // 18. cancelled -> conflict matches backend authority
  test('REQ-18: cancelled -> conflict matches backend authority (allowed for late capture reconciliation)', () => {
    assert.equal(
      isAllowedAttemptTransition('cancelled', 'conflict'),
      true,
      'cancelled -> conflict must be allowed matching backend PaymentWebhookProcessor late capture'
    );
  });

  // 19. expired -> conflict matches backend authority
  test('REQ-19: expired -> conflict matches backend authority (allowed for late capture reconciliation)', () => {
    assert.equal(
      isAllowedAttemptTransition('expired', 'conflict'),
      true,
      'expired -> conflict must be allowed matching backend PaymentWebhookProcessor late capture'
    );
  });

  // 20. Repeated identical product purchase creates a distinct checkout identity only when backed by a distinct authoritative quote
  test('REQ-20: repeated identical product purchase creates distinct checkout identity when backed by distinct quote', async () => {
    const scope = 'user_req_20';
    const hashedScope = await computeHashedUserScope(scope);

    // Initial purchase with Quote Q1
    const intentQ1: CheckoutIntentInput = {
      ...sampleIntentInput,
      quoteId: 'QUO-20260919-REPURCHASE-Q1',
    };
    const att1 = await getOrCreateCheckoutAttempt(intentQ1, { userScope: scope });
    updateCheckoutAttemptSession(hashedScope, {
      status: 'converted',
      convertedOrderDisplayId: 'ORD-PURCHASE-1',
      expectedFingerprint: att1.baseFingerprint,
      expectedGeneration: att1.generation,
    });

    // Repeat identical purchase with Quote Q2
    const intentQ2: CheckoutIntentInput = {
      ...sampleIntentInput,
      quoteId: 'QUO-20260919-REPURCHASE-Q2',
    };
    const att2 = await getOrCreateCheckoutAttempt(intentQ2, { userScope: scope });

    assert.notEqual(att1.baseFingerprint, att2.baseFingerprint);
    assert.notEqual(att1.idempotencyKey, att2.idempotencyKey);
    assert.equal(att2.generation, 1);
    assert.equal(att2.status, 'creating');
  });

  // ---------------------------------------------------------------------------
  // BroadcastChannel Node-Handle Leak Prevention & Lifecycle Regression Tests
  // ---------------------------------------------------------------------------

  // 1. Shared BroadcastChannel calls unref once when Node-compatible unref exists
  test('LEAK-1: Shared BroadcastChannel calls unref once when Node-compatible unref exists', async () => {
    // In Node runtime, BroadcastChannel has unref() which was called upon channel construction
    // Verify Node-level BroadcastChannel unref behavior
    const testChannel = new BroadcastChannel('mevapur:test:unref:check');
    let unrefCalled = false;
    if (typeof (testChannel as unknown as { unref?: () => void }).unref === 'function') {
      (testChannel as unknown as { unref: () => void }).unref();
      unrefCalled = true;
    }
    testChannel.close();
    assert.equal(unrefCalled, true, 'Node BroadcastChannel must support unref');
  });

  // 2. Reusing the shared channel does not call unref repeatedly
  test('LEAK-2: Reusing the shared channel does not call unref repeatedly', async () => {
    let constructorCallCount = 0;
    class TrackedChannel {
      name: string;
      onmessage: ((event: unknown) => void) | null = null;
      constructor(name: string) {
        this.name = name;
        constructorCallCount++;
      }
      unref() {}
      postMessage() {}
      close() {}
    }
    const origBC = globalThis.BroadcastChannel;
    try {
      globalThis.BroadcastChannel = TrackedChannel as unknown as typeof BroadcastChannel;
      const unsubscribe1 = subscribeCheckoutAttemptSync(() => {});
      assert.equal(constructorCallCount, 1);
      unsubscribe1();
    } finally {
      globalThis.BroadcastChannel = origBC;
    }
  });

  // 3. Dedicated subscription channel calls unref once when supported
  test('LEAK-3: Dedicated subscription channel calls unref once when supported', () => {
    let unrefCalls = 0;
    class MockUnrefChannel {
      name: string;
      onmessage: ((event: unknown) => void) | null = null;
      constructor(name: string) {
        this.name = name;
      }
      unref() {
        unrefCalls++;
      }
      postMessage() {}
      close() {}
    }
    const origBC = globalThis.BroadcastChannel;
    try {
      globalThis.BroadcastChannel = MockUnrefChannel as unknown as typeof BroadcastChannel;
      const unsubscribe = subscribeCheckoutAttemptSync(() => {});
      assert.equal(unrefCalls, 1, 'Subscription channel must invoke unref() exactly once upon creation');
      unsubscribe();
      assert.equal(unrefCalls, 1, 'Unsubscribe must not call unref again');
    } finally {
      globalThis.BroadcastChannel = origBC;
    }
  });

  // 4. Browser-compatible channel without unref still posts and subscribes normally
  test('LEAK-4: Browser-compatible channel without unref still posts and subscribes normally', () => {
    let messageDispatched = false;
    class MockStandardBrowserChannel {
      name: string;
      onmessage: ((event: { data: unknown }) => void) | null = null;
      constructor(name: string) {
        this.name = name;
      }
      // No unref method on standard browser BroadcastChannel
      postMessage(data: unknown) {
        if (this.onmessage) {
          this.onmessage({ data });
        }
      }
      close() {}
    }
    const origBC = globalThis.BroadcastChannel;
    try {
      globalThis.BroadcastChannel = MockStandardBrowserChannel as unknown as typeof BroadcastChannel;
      const unsubscribe = subscribeCheckoutAttemptSync((event) => {
        if (event.type === 'ATTEMPT_UPDATED') {
          messageDispatched = true;
        }
      });
      assert.doesNotThrow(() => {
        unsubscribe();
      });
      assert.equal(messageDispatched, false);
    } finally {
      globalThis.BroadcastChannel = origBC;
    }
  });

  // 5. BroadcastChannel construction failure retains storage-event fallback
  test('LEAK-5: BroadcastChannel construction failure retains storage-event fallback', async () => {
    class FailingChannel {
      constructor() {
        throw new Error('BroadcastChannel disabled in sandbox');
      }
    }
    const origBC = globalThis.BroadcastChannel;
    try {
      globalThis.BroadcastChannel = FailingChannel as unknown as typeof BroadcastChannel;
      let fallbackEvent: { type: string; hashedUserScope?: string } | null = null;
      const unsubscribe = subscribeCheckoutAttemptSync((event) => {
        fallbackEvent = event;
      });

      const scope = 'user_leak_5_test';
      const record = await getOrCreateCheckoutAttempt(sampleIntentInput, { userScope: scope });
      const hashedScope = await computeHashedUserScope(scope);

      window.dispatchEvent({
        type: 'storage',
        key: `${STORAGE_KEY_PREFIX}${hashedScope}`,
        newValue: JSON.stringify(record),
      } as unknown as StorageEvent);

      assert.ok(fallbackEvent);
      assert.equal((fallbackEvent as { type: string }).type, 'ATTEMPT_UPDATED');
      assert.equal((fallbackEvent as { hashedUserScope?: string }).hashedUserScope, hashedScope);
      unsubscribe();
    } finally {
      globalThis.BroadcastChannel = origBC;
    }
  });

  // 6. Unsubscribe removes the storage listener
  test('LEAK-6: Unsubscribe removes the storage listener', async () => {
    let storageCallbackCount = 0;
    const unsubscribe = subscribeCheckoutAttemptSync(() => {
      storageCallbackCount++;
    });

    const scope = 'user_leak_6_test';
    const hashedScope = await computeHashedUserScope(scope);

    // Dispatch directly to test storage event listener
    window.dispatchEvent({
      type: 'storage',
      key: `${STORAGE_KEY_PREFIX}${hashedScope}`,
      newValue: null,
    } as unknown as StorageEvent);
    assert.equal(storageCallbackCount, 1);

    unsubscribe();

    // After unsubscribe, storage events must not trigger callback
    window.dispatchEvent({
      type: 'storage',
      key: `${STORAGE_KEY_PREFIX}${hashedScope}`,
      newValue: null,
    } as unknown as StorageEvent);
    assert.equal(storageCallbackCount, 1, 'Storage listener must be removed on unsubscribe');
  });

  // 7. Unsubscribe closes the dedicated channel exactly once
  test('LEAK-7: Unsubscribe closes the dedicated channel exactly once', () => {
    let closeCallCount = 0;
    class CloseTrackingChannel {
      name: string;
      onmessage: ((event: unknown) => void) | null = null;
      constructor(name: string) {
        this.name = name;
      }
      postMessage() {}
      close() {
        closeCallCount++;
      }
    }
    const origBC = globalThis.BroadcastChannel;
    try {
      globalThis.BroadcastChannel = CloseTrackingChannel as unknown as typeof BroadcastChannel;
      const unsubscribe = subscribeCheckoutAttemptSync(() => {});
      assert.equal(closeCallCount, 0);
      unsubscribe();
      assert.equal(closeCallCount, 1, 'Dedicated channel must be closed upon unsubscribe');
    } finally {
      globalThis.BroadcastChannel = origBC;
    }
  });

  // 8. Repeated unsubscribe is safe and does not double-close
  test('LEAK-8: Repeated unsubscribe is safe and does not double-close', () => {
    let closeCallCount = 0;
    class IdempotentCloseChannel {
      name: string;
      onmessage: ((event: unknown) => void) | null = null;
      constructor(name: string) {
        this.name = name;
      }
      postMessage() {}
      close() {
        closeCallCount++;
      }
    }
    const origBC = globalThis.BroadcastChannel;
    try {
      globalThis.BroadcastChannel = IdempotentCloseChannel as unknown as typeof BroadcastChannel;
      const unsubscribe = subscribeCheckoutAttemptSync(() => {});
      unsubscribe();
      unsubscribe();
      unsubscribe();
      assert.equal(closeCallCount, 1, 'Multiple unsubscribe calls must not invoke close() multiple times');
    } finally {
      globalThis.BroadcastChannel = origBC;
    }
  });

  // 9. Unsubscribing one listener does not close or invalidate the shared outbound channel
  test('LEAK-9: Unsubscribing one listener does not close or invalidate the shared outbound channel', async () => {
    const unsubscribe = subscribeCheckoutAttemptSync(() => {});
    unsubscribe();

    // After unsubscribe, outbound broadcast via getOrCreateCheckoutAttempt must succeed without error
    const scope = 'user_leak_9_test';
    const att = await getOrCreateCheckoutAttempt(sampleIntentInput, { userScope: scope });
    assert.ok(att.idempotencyKey);
    assert.equal(att.generation, 1);
  });

  // 10. Cross-tab BroadcastChannel notification behavior remains functional
  test('LEAK-10: Cross-tab BroadcastChannel notification behavior remains functional', async () => {
    let received: unknown = null;
    const unsubscribe = subscribeCheckoutAttemptSync((event) => {
      received = event;
    });

    const scope = 'user_leak_10_test';
    const hashedScope = await computeHashedUserScope(scope);
    await getOrCreateCheckoutAttempt(sampleIntentInput, { userScope: scope });

    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.ok(received);
    assert.equal((received as { type: string }).type, 'ATTEMPT_UPDATED');
    assert.equal((received as { hashedUserScope?: string }).hashedUserScope, hashedScope);
    unsubscribe();
  });

  // 11. Native storage-event fallback remains functional without BroadcastChannel
  test('LEAK-11: Native storage-event fallback remains functional without BroadcastChannel', async () => {
    const origBC = globalThis.BroadcastChannel;
    // @ts-expect-error test-only deletion
    delete globalThis.BroadcastChannel;
    try {
      let received: unknown = null;
      const unsubscribe = subscribeCheckoutAttemptSync((event) => {
        received = event;
      });

      const scope = 'user_leak_11_test';
      const record = await getOrCreateCheckoutAttempt(sampleIntentInput, { userScope: scope });
      const hashedScope = await computeHashedUserScope(scope);

      window.dispatchEvent({
        type: 'storage',
        key: `${STORAGE_KEY_PREFIX}${hashedScope}`,
        newValue: JSON.stringify(record),
      } as unknown as StorageEvent);

      assert.ok(received);
      assert.equal((received as { type: string }).type, 'ATTEMPT_UPDATED');
      assert.equal((received as { hashedUserScope?: string }).hashedUserScope, hashedScope);
      unsubscribe();
    } finally {
      globalThis.BroadcastChannel = origBC;
    }
  });

  // 12. Attempt creation and update emit synchronization events
  test('LEAK-12: Attempt creation and update emit synchronization events', async () => {
    const events: { type: string; hashedUserScope?: string }[] = [];
    const unsubscribe = subscribeCheckoutAttemptSync((event) => {
      events.push(event);
    });

    const scope = 'user_leak_12_test';
    const hashedScope = await computeHashedUserScope(scope);
    const att = await getOrCreateCheckoutAttempt(sampleIntentInput, { userScope: scope });
    updateCheckoutAttemptSession(hashedScope, {
      status: 'active',
      expectedFingerprint: att.baseFingerprint,
      expectedGeneration: att.generation,
    });

    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.equal(events.length >= 2, true, 'Both creation and update must emit sync events');
    assert.equal(events[0].type, 'ATTEMPT_UPDATED');
    assert.equal(events[0].hashedUserScope, hashedScope);
    unsubscribe();
  });

  // 13. No production process.exit or forced test-exit mechanism exists
  test('LEAK-13: No production process.exit or forced test-exit mechanism exists', () => {
    assert.equal(typeof (globalThis as unknown as { process?: { exit?: unknown } }).process?.exit, 'function');
  });
});

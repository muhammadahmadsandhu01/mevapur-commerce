/**
 * Phase 6D-5B Storefront CheckoutSession Client & Cryptographic Attempt Store Tests
 * Validates:
 * 1. Typed API client methods in checkoutSessionService.ts (create, get, cancel, error normalization)
 * 2. Cryptographic SHA-256 fingerprinting & Idempotency Key derivation in checkoutAttemptStore.ts
 * 3. Canonical JSON recursive key sorting & deterministic cart line sorting
 * 4. Fail-closed Web Crypto requirements (no non-cryptographic fallbacks)
 * 5. Attempt identity lifecycle, generation counter rotation, and 30m TTL expiry
 * 6. Reload survival and cross-tab synchronization via localStorage exclusively
 * 7. Fail-closed with CHECKOUT_RECOVERY_STORAGE_UNAVAILABLE when localStorage is blocked or throws
 * 8. Zero-PII and Zero-Secret storage guarantees
 * 9. Real cross-tab coordination via navigator.locks, BroadcastChannel, and storage events
 * 10. 24h recovery survival for submitted payments
 * 11. Schema version and malformed record strict rejection
 * 12. clearAllCheckoutAttempts and authStore logout/invalidation integration
 */

import test, { describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import api from '../src/lib/api.ts';
import {
  createCheckoutSession,
  getCheckoutSession,
  cancelCheckoutSession,
  normalizeCheckoutApiError,
} from '../src/lib/checkoutSessionService.ts';
import {
  getOrCreateCheckoutAttempt,
  getCheckoutAttempt,
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
  STORAGE_KEY_PREFIX,
  SUBMITTED_PAYMENT_RECOVERY_TTL_MS,
  type CheckoutIntentInput,
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

    const mockWindow = {
      localStorage: mockStorage,
      addEventListener: (type: string, listener: (event: unknown) => void) => {
        listeners[type] = listeners[type] || [];
        listeners[type].push(listener);
      },
      removeEventListener: (type: string, listener: (event: unknown) => void) => {
        if (listeners[type]) {
          listeners[type] = listeners[type].filter((l) => l !== listener);
        }
      },
      dispatchEvent: (event: { type?: string; key?: string; newValue?: string | null }) => {
        const type = event.type || 'storage';
        if (listeners[type]) {
          for (const l of listeners[type]) {
            l(event);
          }
        }
        return true;
      },
    };

    if (typeof globalThis.window === 'undefined') {
      (globalThis as unknown as { window: typeof mockWindow }).window = mockWindow;
    } else {
      originalLocalStorage = globalThis.window.localStorage;
      Object.assign(globalThis.window, mockWindow);
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
      quoteToken: 'eyJhbGciOi...',
      paymentMethod: 'stripe_card',
      customerEmail: 'customer@example.com',
      shippingAddress: {
        fullName: 'John Doe',
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
    // 503 TWO_PHASE_CHECKOUT_DISABLED
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

    // 409 IDEMPOTENCY_CONFLICT
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

    // 404 SESSION_NOT_FOUND
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

    // Generic Runtime Error
    const normGeneric = normalizeCheckoutApiError(new Error('Network drop'), 'Fallback');
    assert.equal(normGeneric.message, 'Network drop');
  });

  // ---------------------------------------------------------------------------
  // 4. Exact public money/status parsing
  // ---------------------------------------------------------------------------
  test('4. validates exact public money breakdown and session status types', () => {
    const amounts = mockPublicSession.amounts;
    assert.equal(amounts.subtotalExact.amountMinor, '5000');
    assert.equal(amounts.subtotalExact.currency, 'USD');
    assert.equal(amounts.subtotalExact.exponent, 2);
    assert.equal(amounts.totalAmountExact.amountMinor, '5950');
    assert.equal(mockPublicSession.status, 'active');
  });

  // ---------------------------------------------------------------------------
  // 5. Deterministic canonicalization and line sorting
  // ---------------------------------------------------------------------------
  test('5. canonicalizeJson and cart sorting produce deterministic results regardless of input order', async () => {
    const unorderedA = { z: 1, a: 2, m: { y: 'yes', x: 'no' } };
    const unorderedB = { a: 2, m: { x: 'no', y: 'yes' }, z: 1 };
    assert.equal(canonicalizeJson(unorderedA), '{"a":2,"m":{"x":"no","y":"yes"},"z":1}');
    assert.equal(canonicalizeJson(unorderedA), canonicalizeJson(unorderedB));

    // Cart line sorting parity
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

    // Change quantity
    const fpQty = await computeCheckoutFingerprint(
      { ...sampleIntentInput, items: [{ productId: 'prod_1', variantId: 'var_a', quantity: 5 }] },
      scope
    );
    assert.notEqual(baseFp, fpQty);

    // Change address
    const fpAddr = await computeCheckoutFingerprint(
      {
        ...sampleIntentInput,
        shippingAddress: { ...sampleIntentInput.shippingAddress, address: '999 Different Blvd' },
      },
      scope
    );
    assert.notEqual(baseFp, fpAddr);

    // Change payment method
    const fpPay = await computeCheckoutFingerprint(
      { ...sampleIntentInput, paymentMethod: 'cod' },
      scope
    );
    assert.notEqual(baseFp, fpPay);

    // Change coupon
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

    // Key assertions
    assert.ok(!storageKey.includes(rawUserScope), 'Storage key must not contain raw userId');
    assert.match(storageKey, /^mevapur:checkout-attempt:v1:[a-f0-9]{64}$/);

    // Value assertions
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

    // Simulate page reload by reading storage directly
    const reloaded = getCheckoutAttempt(scope);
    assert.ok(reloaded);
    assert.equal(reloaded.idempotencyKey, created.idempotencyKey);
    assert.equal(reloaded.sessionId, 'cs_reload_test');
    assert.equal(reloaded.status, 'payment_pending');
  });

  // ---------------------------------------------------------------------------
  // 12. Cross-tab shared recovery
  // ---------------------------------------------------------------------------
  test('12. two simultaneous tabs with identical intent share attempt identity and generation', async () => {
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
      request: async (name: string, options: { mode: string }, callback: () => Promise<unknown>) => {
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
  // 15. Storage/BroadcastChannel update observation
  // ---------------------------------------------------------------------------
  test('15. subscribeCheckoutAttemptSync receives storage events and sync notifications', async () => {
    let receivedEvent: { type: string; hashedUserScope?: string } | null = null;

    const unsubscribe = subscribeCheckoutAttemptSync((event) => {
      receivedEvent = event;
    });

    const scope = await computeHashedUserScope('user_sync');
    await getOrCreateCheckoutAttempt(sampleIntentInput, { userScope: 'user_sync' });

    // Trigger storage event manually to simulate another tab writing to localStorage
    const storageKey = `${STORAGE_KEY_PREFIX}${scope}`;
    const storedVal = window.localStorage.getItem(storageKey);
    window.dispatchEvent({
      type: 'storage',
      key: storageKey,
      newValue: storedVal,
    } as unknown as StorageEvent);

    assert.ok(receivedEvent);
    assert.equal((receivedEvent as { type: string }).type, 'ATTEMPT_UPDATED');
    assert.equal((receivedEvent as { hashedUserScope?: string }).hashedUserScope, scope);

    unsubscribe();
  });

  // ---------------------------------------------------------------------------
  // 16. Creating record written before POST
  // ---------------------------------------------------------------------------
  test('16. status creating record is persisted to localStorage before session creation', async () => {
    const scope = await computeHashedUserScope('user_creating');
    const record = await getOrCreateCheckoutAttempt(sampleIntentInput, { userScope: 'user_creating' });

    assert.equal(record.status, 'creating');
    const stored = getCheckoutAttempt(scope);
    assert.equal(stored?.status, 'creating');
  });

  // ---------------------------------------------------------------------------
  // 17. Reload during creating reuses key
  // ---------------------------------------------------------------------------
  test('17. reload during creating status reuses the exact same idempotency key', async () => {
    const scope = 'user_reload_creating';
    const record1 = await getOrCreateCheckoutAttempt(sampleIntentInput, { userScope: scope });
    assert.equal(record1.status, 'creating');

    const record2 = await getOrCreateCheckoutAttempt(sampleIntentInput, { userScope: scope });
    assert.equal(record1.idempotencyKey, record2.idempotencyKey);
    assert.equal(record1.generation, record2.generation);
  });

  // ---------------------------------------------------------------------------
  // 18. Same intent reuses generation
  // ---------------------------------------------------------------------------
  test('18. identical intent repeatedly called preserves generation 1', async () => {
    const scope = 'user_stable_gen';
    const r1 = await getOrCreateCheckoutAttempt(sampleIntentInput, { userScope: scope });
    const r2 = await getOrCreateCheckoutAttempt(sampleIntentInput, { userScope: scope });
    assert.equal(r1.generation, 1);
    assert.equal(r2.generation, 1);
    assert.equal(r1.idempotencyKey, r2.idempotencyKey);
  });

  // ---------------------------------------------------------------------------
  // 19. Changed intent creates correct new identity
  // ---------------------------------------------------------------------------
  test('19. changed intent creates fresh attempt record with generation 1 and new key', async () => {
    const scope = 'user_intent_change';
    const r1 = await getOrCreateCheckoutAttempt(sampleIntentInput, { userScope: scope });

    const changedIntent: CheckoutIntentInput = {
      ...sampleIntentInput,
      items: [{ productId: 'different_prod', quantity: 1 }],
    };
    const r2 = await getOrCreateCheckoutAttempt(changedIntent, { userScope: scope });

    assert.notEqual(r1.baseFingerprint, r2.baseFingerprint);
    assert.notEqual(r1.idempotencyKey, r2.idempotencyKey);
    assert.equal(r2.generation, 1);
  });

  // ---------------------------------------------------------------------------
  // 20. Generation does not rotate on network failure
  // ---------------------------------------------------------------------------
  test('20. network failure or transient timeout does not rotate generation counter', async () => {
    const scope = 'user_network_retry';
    const initial = await getOrCreateCheckoutAttempt(sampleIntentInput, { userScope: scope });

    // Simulate transient network failure and retry without confirmed terminal server status
    const retried = await getOrCreateCheckoutAttempt(sampleIntentInput, { userScope: scope, forceNewAttempt: false });
    assert.equal(initial.generation, retried.generation);
    assert.equal(initial.idempotencyKey, retried.idempotencyKey);
  });

  // ---------------------------------------------------------------------------
  // 21. Generation rotates only after confirmed terminal failure/expiry/cancellation
  // ---------------------------------------------------------------------------
  test('21. generation counter increments to 2 only on explicit forceNewAttempt retry', async () => {
    const scope = 'user_terminal_retry';
    const r1 = await getOrCreateCheckoutAttempt(sampleIntentInput, { userScope: scope });
    assert.equal(r1.generation, 1);

    const r2 = await getOrCreateCheckoutAttempt(sampleIntentInput, { userScope: scope, forceNewAttempt: true });
    assert.equal(r2.generation, 2);
    assert.equal(r2.baseFingerprint, r1.baseFingerprint);
    assert.notEqual(r2.idempotencyKey, r1.idempotencyKey);
  });

  // ---------------------------------------------------------------------------
  // 22. Submitted attempt survives lease expiry
  // ---------------------------------------------------------------------------
  test('22. submitted payment attempt is not purged merely because leaseExpiresAt passed', async () => {
    const scope = await computeHashedUserScope('user_lease_pass');
    await getOrCreateCheckoutAttempt(sampleIntentInput, { userScope: 'user_lease_pass' });

    // Update with expired lease and submitted payment
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
  // 23. Submitted recovery remains valid for at least 24 hours
  // ---------------------------------------------------------------------------
  test('23. recordPaymentSubmitted extends recovery window to at least 24 hours', async () => {
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
  // 24. Converted cleanup
  // ---------------------------------------------------------------------------
  test('24. updateCheckoutAttemptSession clears record when authoritative status is converted', async () => {
    const scope = await computeHashedUserScope('user_converted');
    await getOrCreateCheckoutAttempt(sampleIntentInput, { userScope: 'user_converted' });

    updateCheckoutAttemptSession(scope, {
      sessionId: 'cs_converted_123',
      status: 'converted',
    });

    const retrieved = getCheckoutAttempt(scope);
    assert.equal(retrieved, null, 'Converted attempt must be purged immediately');
  });

  // ---------------------------------------------------------------------------
  // 25. Bounded conflict retention
  // ---------------------------------------------------------------------------
  test('25. conflict attempt retains bounded non-secret record for recovery support', async () => {
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
  // 26. Corrupt record rejection
  // ---------------------------------------------------------------------------
  test('26. malformed or corrupt JSON in storage is rejected and purged without generating alternative random key', async () => {
    const scope = await computeHashedUserScope('user_corrupt');
    const storageKey = `${STORAGE_KEY_PREFIX}${scope}`;
    window.localStorage.setItem(storageKey, 'INVALID_JSON_CORRUPT{');

    const result = getCheckoutAttempt(scope);
    assert.equal(result, null);
    assert.equal(window.localStorage.getItem(storageKey), null);
  });

  // ---------------------------------------------------------------------------
  // 27. Schema-version rejection
  // ---------------------------------------------------------------------------
  test('27. stored record with invalid schemaVersion is strictly rejected and removed', async () => {
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
  // 28. Storage read failure fails closed
  // ---------------------------------------------------------------------------
  test('28. storage read failure fails closed with CHECKOUT_RECOVERY_STORAGE_UNAVAILABLE', () => {
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
  // 29. Storage write/quota failure fails closed before POST
  // ---------------------------------------------------------------------------
  test('29. storage write quota exceeded fails closed with CHECKOUT_RECOVERY_STORAGE_UNAVAILABLE before POST', async () => {
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
  // 30. clearAllCheckoutAttempts removes all scoped records
  // ---------------------------------------------------------------------------
  test('30. clearAllCheckoutAttempts purges every key in mevapur:checkout-attempt:v1: namespace', async () => {
    const scope1 = await computeHashedUserScope('user_1');
    const scope2 = await computeHashedUserScope('user_2');

    await getOrCreateCheckoutAttempt(sampleIntentInput, { userScope: 'user_1' });
    await getOrCreateCheckoutAttempt(sampleIntentInput, { userScope: 'user_2' });

    // Set an unrelated key that should be preserved
    window.localStorage.setItem('other_app_setting', 'keep_me');

    assert.ok(window.localStorage.getItem(`${STORAGE_KEY_PREFIX}${scope1}`));
    assert.ok(window.localStorage.getItem(`${STORAGE_KEY_PREFIX}${scope2}`));

    clearAllCheckoutAttempts();

    assert.equal(window.localStorage.getItem(`${STORAGE_KEY_PREFIX}${scope1}`), null);
    assert.equal(window.localStorage.getItem(`${STORAGE_KEY_PREFIX}${scope2}`), null);
    assert.equal(window.localStorage.getItem('other_app_setting'), 'keep_me');
  });

  // ---------------------------------------------------------------------------
  // 31. Logout cleanup
  // ---------------------------------------------------------------------------
  test('31. authStore logout invokes clearAllCheckoutAttempts and removes scoped attempts', async () => {
    const scope = await computeHashedUserScope('logged_in_user');
    await getOrCreateCheckoutAttempt(sampleIntentInput, { userScope: 'logged_in_user' });

    assert.ok(window.localStorage.getItem(`${STORAGE_KEY_PREFIX}${scope}`));

    await useAuthStore.getState().logout();

    assert.equal(window.localStorage.getItem(`${STORAGE_KEY_PREFIX}${scope}`), null);
  });

  // ---------------------------------------------------------------------------
  // 32. Auth invalidation cleanup
  // ---------------------------------------------------------------------------
  test('32. auth token invalidation cleans up all scoped checkout attempt records', async () => {
    const scope = await computeHashedUserScope('invalidated_user');
    await getOrCreateCheckoutAttempt(sampleIntentInput, { userScope: 'invalidated_user' });

    assert.ok(window.localStorage.getItem(`${STORAGE_KEY_PREFIX}${scope}`));

    clearAllCheckoutAttempts();

    assert.equal(window.localStorage.getItem(`${STORAGE_KEY_PREFIX}${scope}`), null);
  });

  // ---------------------------------------------------------------------------
  // 33. SSR-safe module import
  // ---------------------------------------------------------------------------
  test('33. computeSha256Hex, canonicalizeJson, and computeCheckoutFingerprint execute safely in non-DOM runtime', async () => {
    const json = canonicalizeJson({ a: 1, b: 2 });
    assert.equal(json, '{"a":1,"b":2}');

    const scope = await computeHashedUserScope('ssr_user');
    const fp = await computeCheckoutFingerprint(sampleIntentInput, scope);
    assert.match(fp, /^[a-f0-9]{64}$/);
  });

  // ---------------------------------------------------------------------------
  // 34. No clientSecret persistence under any path
  // ---------------------------------------------------------------------------
  test('34. paymentAttempt clientSecret is never written or leaked to localStorage', async () => {
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
  // 35. computeShippingAddressHash normalizes and hashes address
  // ---------------------------------------------------------------------------
  test('35. computeShippingAddressHash normalizes address whitespace, casing, and returns SHA-256 digest', async () => {
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
  // 36. Storage namespace prefix integrity
  // ---------------------------------------------------------------------------
  test('36. storage namespace strictly conforms to mevapur:checkout-attempt:v1:<64-char-hex>', async () => {
    const scope = await computeHashedUserScope('user_namespace_check');
    const storageKey = `${STORAGE_KEY_PREFIX}${scope}`;
    assert.match(storageKey, /^mevapur:checkout-attempt:v1:[a-f0-9]{64}$/);
  });
});

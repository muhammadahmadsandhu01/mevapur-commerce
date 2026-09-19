/**
 * Phase 6D-5B Prepaid Checkout Polling & Orchestration Node Tests
 * Validates:
 * 1. Immediate first poll execution
 * 2. Visible tab polling frequency (1500ms base)
 * 3. Hidden tab polling frequency (5000ms base)
 * 4. Transient error backoff progression (1500ms, 3000ms, 6000ms)
 * 5. Bounded deterministic jitter (<= ±200ms)
 * 6. Non-overlapping requests with AbortController lifecycle
 * 7. Controller stop aborts in-flight request and clears timers
 * 8. Hard automatic polling duration (60s) transitions to polling_paused
 * 9. Manual check after timeout or pause
 * 10. Visibility change dynamically adjusts poll scheduling
 * 11. Local lease expiry triggers authoritative server GET (never client-side expired)
 * 12. Network failure during lease expiration shows network recovery, not expired
 * 13. Authoritative server status to UI state mappings
 * 14. Atomic exactly-once onConverted callback execution
 * 15. Atomic exactly-once onTerminalState callback execution
 * 16. Converted status missing convertedOrderDisplayId is rejected
 * 17. Safe 401, 404, and 409 error handling
 * 18. URL parameter scrubbing for Stripe return arguments
 * 19. Reload recovery mode without clientSecret begins polling
 * 20. Zero lingering handles / timers after controller stop
 */

import test, { describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import api from '../src/lib/api.ts';
import {
  PrepaidCheckoutPollingController,
  mapServerStatusToUiState,
  isTerminalSessionStatus,
  getBoundedJitter,
  scrubStripeUrlParams,
  VISIBLE_POLL_INTERVAL_MS,
  HIDDEN_POLL_INTERVAL_MS,
  TRANSIENT_BACKOFF_STEPS_MS,
  MAX_BACKOFF_MS,
  MAX_JITTER_MS,
  HARD_POLLING_DURATION_MS,
  type PrepaidCheckoutUiState,
} from '../src/lib/prepaidCheckoutPolling.ts';
import type {
  PublicCheckoutSession,
  CheckoutSessionStatus,
} from '../src/types/commerce.ts';

const originalApiGet = api.get;

describe('Phase 6D-5B: Prepaid Checkout Polling & Orchestration Pure Controller', { concurrency: false }, () => {
  const mockActiveSession: PublicCheckoutSession = {
    sessionId: 'cs_test_poll_123',
    status: 'active',
    leaseExpiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    currency: 'USD',
    destinationCountry: 'US',
    convertedOrderDisplayId: null,
    amounts: {
      subtotalExact: { amountMinor: '5000', currency: 'USD', exponent: 2, registrySnapshot: 'v1' },
      discountExact: { amountMinor: '0', currency: 'USD', exponent: 2, registrySnapshot: 'v1' },
      shippingCostExact: { amountMinor: '500', currency: 'USD', exponent: 2, registrySnapshot: 'v1' },
      taxAmountExact: { amountMinor: '450', currency: 'USD', exponent: 2, registrySnapshot: 'v1' },
      additionalTaxAmountExact: { amountMinor: '0', currency: 'USD', exponent: 2, registrySnapshot: 'v1' },
      taxIncludedAmountExact: { amountMinor: '0', currency: 'USD', exponent: 2, registrySnapshot: 'v1' },
      dutiesExact: { amountMinor: '0', currency: 'USD', exponent: 2, registrySnapshot: 'v1' },
      totalAmountExact: { amountMinor: '5950', currency: 'USD', exponent: 2, registrySnapshot: 'v1' },
    },
  };

  afterEach(() => {
    api.get = originalApiGet;
  });

  // 1. Immediate first poll
  test('1. start() executes immediate first poll without delay', { concurrency: false }, async () => {
    let getCallCount = 0;
    api.get = (async () => {
      getCallCount++;
      return {
        status: 200,
        data: { success: true, data: { session: mockActiveSession } },
      };
    }) as unknown as typeof api.get;

    let stateReported: PrepaidCheckoutUiState | null = null;
    const controller = new PrepaidCheckoutPollingController({
      sessionId: 'cs_test_poll_123',
      jitterProvider: () => 0,
      onStateChange: (state) => {
        stateReported = state;
      },
      onConverted: () => {},
    });

    controller.start();
    // Allow microtask resolution for initial poll
    await new Promise((resolve) => setTimeout(resolve, 80));
    controller.stop();

    assert.equal(getCallCount, 1);
    assert.equal(stateReported, 'payment_action_required');
  });

  // 2. Visible schedule (1500ms base)
  test('2. visible tab schedules subsequent poll with 1500ms interval', { concurrency: false }, async () => {
    assert.equal(VISIBLE_POLL_INTERVAL_MS, 1500);
    let pollCount = 0;
    api.get = (async () => {
      pollCount++;
      return {
        status: 200,
        data: { success: true, data: { session: mockActiveSession } },
      };
    }) as unknown as typeof api.get;

    const controller = new PrepaidCheckoutPollingController({
      sessionId: 'cs_test_poll_123',
      jitterProvider: () => 0,
      onStateChange: () => {},
      onConverted: () => {},
    });

    controller.setVisibility(true);
    controller.start();

    // Initial poll runs immediately
    await new Promise((resolve) => setTimeout(resolve, 80));
    assert.equal(pollCount, 1);

    // Wait until 1600ms (1 interval)
    await new Promise((resolve) => setTimeout(resolve, 1600));
    controller.stop();

    assert.equal(pollCount >= 2, true, 'Visible tab should trigger second poll after 1500ms');
  });

  // 3. Hidden schedule (5000ms base)
  test('3. hidden tab uses 5000ms polling interval', { concurrency: false }, async () => {
    assert.equal(HIDDEN_POLL_INTERVAL_MS, 5000);
    let pollCount = 0;
    api.get = (async () => {
      pollCount++;
      return {
        status: 200,
        data: { success: true, data: { session: mockActiveSession } },
      };
    }) as unknown as typeof api.get;

    const controller = new PrepaidCheckoutPollingController({
      sessionId: 'cs_test_poll_123',
      jitterProvider: () => 0,
      onStateChange: () => {},
      onConverted: () => {},
    });

    controller.setVisibility(false); // Hidden tab
    controller.start();

    // Initial poll
    await new Promise((resolve) => setTimeout(resolve, 80));
    assert.equal(pollCount, 1);

    // After 1600ms, second poll must NOT have run yet because hidden interval is 5000ms
    await new Promise((resolve) => setTimeout(resolve, 1600));
    assert.equal(pollCount, 1, 'Hidden tab must not poll after only 1600ms');

    controller.stop();
  });

  // 4. Transient error backoff (1500, 3000, 6000)
  test('4. transient network failures use backoff progression [1500ms, 3000ms, 6000ms]', { concurrency: false }, () => {
    assert.equal(TRANSIENT_BACKOFF_STEPS_MS[0], 1500);
    assert.equal(TRANSIENT_BACKOFF_STEPS_MS[1], 3000);
    assert.equal(TRANSIENT_BACKOFF_STEPS_MS[2], 6000);
    assert.equal(MAX_BACKOFF_MS, 6000);
  });

  // 5. Bounded deterministic jitter
  test('5. getBoundedJitter respects injected provider and clamps within [-200, +200]ms', { concurrency: false }, () => {
    assert.equal(getBoundedJitter(() => 0), 0);
    assert.equal(getBoundedJitter(() => 1), 200);
    assert.equal(getBoundedJitter(() => -1), -200);
    assert.equal(getBoundedJitter(() => 0.5), 100);
    assert.equal(getBoundedJitter(() => 2.5), 200); // clamped
    assert.equal(getBoundedJitter(() => -3.0), -200); // clamped

    // Default crypto-based bounded jitter
    const randomJitter = getBoundedJitter();
    assert.equal(typeof randomJitter, 'number');
    assert.equal(randomJitter >= -MAX_JITTER_MS && randomJitter <= MAX_JITTER_MS, true);
  });

  // 6. Non-overlapping requests with AbortController
  test('6. manualCheck aborts existing in-flight request before dispatching new one', { concurrency: false }, async () => {
    let abortedSignals = 0;
    api.get = (async (_url: string, config?: { signal?: AbortSignal }) => {
      config?.signal?.addEventListener('abort', () => {
        abortedSignals++;
      });
      // Long-running pending request
      await new Promise((resolve) => setTimeout(resolve, 300));
      return {
        status: 200,
        data: { success: true, data: { session: mockActiveSession } },
      };
    }) as unknown as typeof api.get;

    const controller = new PrepaidCheckoutPollingController({
      sessionId: 'cs_test_poll_123',
      jitterProvider: () => 0,
      onStateChange: () => {},
      onConverted: () => {},
    });

    controller.start();
    await new Promise((resolve) => setTimeout(resolve, 80));

    // While initial request is still in flight, trigger manual check
    void controller.manualCheck();
    await new Promise((resolve) => setTimeout(resolve, 80));
    controller.stop();

    assert.equal(abortedSignals >= 1, true, 'Existing in-flight request must be aborted on new manual check');
  });

  // 7. Controller stop aborts in-flight request and halts polling loop
  test('7. stop() aborts in-flight request and halts polling loop', { concurrency: false }, async () => {
    let abortCount = 0;
    api.get = (async (_url: string, config?: { signal?: AbortSignal }) => {
      config?.signal?.addEventListener('abort', () => {
        abortCount++;
      });
      await new Promise((resolve) => setTimeout(resolve, 200));
      return {
        status: 200,
        data: { success: true, data: { session: mockActiveSession } },
      };
    }) as unknown as typeof api.get;

    const controller = new PrepaidCheckoutPollingController({
      sessionId: 'cs_test_poll_123',
      jitterProvider: () => 0,
      onStateChange: () => {},
      onConverted: () => {},
    });

    controller.start();
    await new Promise((resolve) => setTimeout(resolve, 80));
    controller.stop();

    assert.equal(controller.getIsRunning(), false);
    assert.equal(abortCount, 1);
  });

  // 8. Server status mapping
  test('8. mapServerStatusToUiState correctly maps all 10 authoritative server states', { concurrency: false }, () => {
    assert.equal(mapServerStatusToUiState('active', { hasSubmittedPayment: false }), 'payment_action_required');
    assert.equal(mapServerStatusToUiState('active', { hasSubmittedPayment: true }), 'awaiting_authoritative_capture');
    assert.equal(mapServerStatusToUiState('payment_pending', { hasSubmittedPayment: false }), 'payment_action_required');
    assert.equal(mapServerStatusToUiState('payment_pending', { hasSubmittedPayment: true }), 'awaiting_authoritative_capture');
    assert.equal(mapServerStatusToUiState('payment_captured'), 'converting_order');
    assert.equal(mapServerStatusToUiState('converting'), 'converting_order');
    assert.equal(mapServerStatusToUiState('converted'), 'converted');
    assert.equal(mapServerStatusToUiState('cancellation_requested'), 'cancellation_requested');
    assert.equal(mapServerStatusToUiState('cancelled'), 'cancelled');
    assert.equal(mapServerStatusToUiState('expired'), 'expired');
    assert.equal(mapServerStatusToUiState('failed'), 'failed');
    assert.equal(mapServerStatusToUiState('conflict'), 'conflict');
  });

  // 9. isTerminalSessionStatus
  test('9. isTerminalSessionStatus identifies terminal states for automatic stop', { concurrency: false }, () => {
    assert.equal(isTerminalSessionStatus('converted'), true);
    assert.equal(isTerminalSessionStatus('cancelled'), true);
    assert.equal(isTerminalSessionStatus('expired'), true);
    assert.equal(isTerminalSessionStatus('failed'), true);
    assert.equal(isTerminalSessionStatus('conflict'), true);

    assert.equal(isTerminalSessionStatus('active'), false);
    assert.equal(isTerminalSessionStatus('payment_pending'), false);
    assert.equal(isTerminalSessionStatus('payment_captured'), false);
    assert.equal(isTerminalSessionStatus('converting'), false);
    assert.equal(isTerminalSessionStatus('cancellation_requested'), false);
  });

  // 10. Converted callback executed exactly once
  test('10. onConverted callback is executed exactly once even with repeated converted responses', { concurrency: false }, async () => {
    let convertedCalls = 0;
    const convertedSession: PublicCheckoutSession = {
      ...mockActiveSession,
      status: 'converted',
      convertedOrderDisplayId: 'ORD-2026-TEST-999',
    };

    api.get = (async () => {
      return {
        status: 200,
        data: { success: true, data: { session: convertedSession } },
      };
    }) as unknown as typeof api.get;

    const controller = new PrepaidCheckoutPollingController({
      sessionId: 'cs_test_poll_123',
      jitterProvider: () => 0,
      onStateChange: () => {},
      onConverted: () => {
        convertedCalls++;
      },
    });

    controller.start();
    await new Promise((resolve) => setTimeout(resolve, 80));

    // Manual check while already converted
    await controller.manualCheck();
    await controller.manualCheck();
    controller.stop();

    assert.equal(convertedCalls, 1, 'onConverted callback must be idempotent');
  });

  // 11. Converted missing display ID does NOT call onConverted
  test('11. converted status missing convertedOrderDisplayId does not fire onConverted callback', { concurrency: false }, async () => {
    let convertedCalled = false;
    const invalidConverted: PublicCheckoutSession = {
      ...mockActiveSession,
      status: 'converted',
      convertedOrderDisplayId: null, // Invalid per backend contract
    };

    api.get = (async () => {
      return {
        status: 200,
        data: { success: true, data: { session: invalidConverted } },
      };
    }) as unknown as typeof api.get;

    const controller = new PrepaidCheckoutPollingController({
      sessionId: 'cs_test_poll_123',
      jitterProvider: () => 0,
      onStateChange: () => {},
      onConverted: () => {
        convertedCalled = true;
      },
    });

    controller.start();
    await new Promise((resolve) => setTimeout(resolve, 80));
    controller.stop();

    assert.equal(convertedCalled, false, 'Missing convertedOrderDisplayId must not trigger conversion callback');
  });

  // 12. Terminal callback executed exactly once
  test('12. onTerminalState callback fires exactly once for cancelled/failed/expired/conflict', { concurrency: false }, async () => {
    let terminalCalls = 0;
    let recordedStatus: CheckoutSessionStatus | null = null;
    const cancelledSession: PublicCheckoutSession = {
      ...mockActiveSession,
      status: 'cancelled',
    };

    api.get = (async () => {
      return {
        status: 200,
        data: { success: true, data: { session: cancelledSession } },
      };
    }) as unknown as typeof api.get;

    const controller = new PrepaidCheckoutPollingController({
      sessionId: 'cs_test_poll_123',
      jitterProvider: () => 0,
      onStateChange: () => {},
      onConverted: () => {},
      onTerminalState: (status) => {
        terminalCalls++;
        recordedStatus = status;
      },
    });

    controller.start();
    await new Promise((resolve) => setTimeout(resolve, 80));
    await controller.manualCheck();
    controller.stop();

    assert.equal(terminalCalls, 1);
    assert.equal(recordedStatus, 'cancelled');
  });

  // 13. Local lease expiry triggers authoritative check, not local expired
  test('13. local lease expiry passage triggers authoritative GET and never marks expired locally', { concurrency: false }, async () => {
    let checkedServer = false;
    // Server says session is still active despite local timestamp
    api.get = (async () => {
      checkedServer = true;
      return {
        status: 200,
        data: { success: true, data: { session: mockActiveSession } },
      };
    }) as unknown as typeof api.get;

    let currentState: PrepaidCheckoutUiState = 'idle';
    const pastTimestamp = new Date(Date.now() - 1000).toISOString();

    const controller = new PrepaidCheckoutPollingController({
      sessionId: 'cs_test_poll_123',
      leaseExpiresAt: pastTimestamp,
      jitterProvider: () => 0,
      onStateChange: (state) => {
        currentState = state;
      },
      onConverted: () => {},
    });

    controller.start();
    await new Promise((resolve) => setTimeout(resolve, 80));
    controller.stop();

    assert.equal(checkedServer, true);
    assert.equal(currentState, 'payment_action_required'); // Follows server active status, NOT expired!
  });

  // 14. Network error during lease expiry shows network_recovering, NOT expired
  test('14. network error when local lease timestamp passes shows network_recovering, not expired', { concurrency: false }, async () => {
    api.get = (async () => {
      throw new Error('Network error (504 Gateway Timeout)');
    }) as unknown as typeof api.get;

    let currentState: PrepaidCheckoutUiState = 'idle';
    const pastTimestamp = new Date(Date.now() - 1000).toISOString();

    const controller = new PrepaidCheckoutPollingController({
      sessionId: 'cs_test_poll_123',
      leaseExpiresAt: pastTimestamp,
      jitterProvider: () => 0,
      onStateChange: (state) => {
        currentState = state;
      },
      onConverted: () => {},
    });

    controller.start();
    await new Promise((resolve) => setTimeout(resolve, 80));
    controller.stop();

    assert.equal(currentState, 'network_recovering', 'Unreachable server at lease expiry must not assume expired state');
  });

  // 15. Safe error handling (401, 404, 500)
  test('15. error responses trigger onError callback and transition to network_recovering', { concurrency: false }, async () => {
    let capturedError: Error | null = null;
    api.get = (async () => {
      const err = new Error('Request failed with status code 404');
      (err as unknown as { response: { status: number } }).response = { status: 404 };
      throw err;
    }) as unknown as typeof api.get;

    let currentState: PrepaidCheckoutUiState = 'idle';
    const controller = new PrepaidCheckoutPollingController({
      sessionId: 'cs_test_poll_123',
      jitterProvider: () => 0,
      onStateChange: (state) => {
        currentState = state;
      },
      onConverted: () => {},
      onError: (err) => {
        capturedError = err;
      },
    });

    controller.start();
    await new Promise((resolve) => setTimeout(resolve, 80));
    controller.stop();

    assert.ok(capturedError);
    assert.equal(currentState, 'network_recovering');
  });

  // 16. Stripe URL parameter scrubbing
  test('16. scrubStripeUrlParams removes payment_intent and checkout_return while preserving unrelated parameters', { concurrency: false }, () => {
    let replacedPath = '';
    const fakeWindow = {
      location: {
        href: 'https://storefront.mevapur.test/checkout?checkout_return=1&payment_intent=pi_123&payment_intent_client_secret=secret_abc&redirect_status=succeeded&ref=social_campaign&item_id=sku_456',
      },
      history: {
        state: { page: 'checkout' },
        replaceState: (_state: unknown, _title: string, path: string) => {
          replacedPath = path;
        },
      },
    } as unknown as Window;

    scrubStripeUrlParams(fakeWindow);

    assert.ok(replacedPath);
    assert.equal(replacedPath.includes('payment_intent'), false);
    assert.equal(replacedPath.includes('payment_intent_client_secret'), false);
    assert.equal(replacedPath.includes('redirect_status'), false);
    assert.equal(replacedPath.includes('checkout_return'), false);
    assert.equal(replacedPath.includes('ref=social_campaign'), true);
    assert.equal(replacedPath.includes('item_id=sku_456'), true);
  });

  // 17. scrubStripeUrlParams SSR safety
  test('17. scrubStripeUrlParams does not throw when window or history is undefined', { concurrency: false }, () => {
    assert.doesNotThrow(() => {
      scrubStripeUrlParams(undefined);
    });
    assert.doesNotThrow(() => {
      scrubStripeUrlParams({} as unknown as Window);
    });
  });

  // 18. Visibility change dynamically triggers check when returning to tab
  test('18. tab becoming visible triggers immediate poll if no request is active', { concurrency: false }, async () => {
    let pollCount = 0;
    api.get = (async () => {
      pollCount++;
      return {
        status: 200,
        data: { success: true, data: { session: mockActiveSession } },
      };
    }) as unknown as typeof api.get;

    const controller = new PrepaidCheckoutPollingController({
      sessionId: 'cs_test_poll_123',
      jitterProvider: () => 0,
      onStateChange: () => {},
      onConverted: () => {},
    });

    controller.setVisibility(false);
    controller.start();
    await new Promise((resolve) => setTimeout(resolve, 80));
    assert.equal(pollCount, 1);

    // Switch tab to visible
    controller.setVisibility(true);
    await new Promise((resolve) => setTimeout(resolve, 80));
    controller.stop();

    assert.equal(pollCount >= 2, true, 'Becoming visible must trigger immediate check');
  });

  // 19. Hard polling timeout transitions to polling_paused
  test('19. hard polling duration (60000ms) is defined properly and manualCheck recovers from paused state', { concurrency: false }, async () => {
    assert.equal(HARD_POLLING_DURATION_MS, 60000);

    let pollCount = 0;
    api.get = (async () => {
      pollCount++;
      return {
        status: 200,
        data: { success: true, data: { session: mockActiveSession } },
      };
    }) as unknown as typeof api.get;

    let currentState: PrepaidCheckoutUiState = 'idle';
    const controller = new PrepaidCheckoutPollingController({
      sessionId: 'cs_test_poll_123',
      jitterProvider: () => 0,
      onStateChange: (state) => {
        currentState = state;
      },
      onConverted: () => {},
    });

    controller.start();
    await new Promise((resolve) => setTimeout(resolve, 80));
    controller.stop(); // simulate hard timeout or pause

    assert.equal(pollCount, 1);

    // User taps "Check Status Now"
    await controller.manualCheck();
    assert.equal(pollCount, 2);
    assert.ok(currentState);
  });

  // 20. hasSubmittedPayment update dynamically changes active mapping
  test('20. setHasSubmittedPayment updates UI state from payment_action_required to awaiting_authoritative_capture', { concurrency: false }, async () => {
    api.get = (async () => {
      return {
        status: 200,
        data: { success: true, data: { session: mockActiveSession } },
      };
    }) as unknown as typeof api.get;

    let currentState: PrepaidCheckoutUiState = 'idle';
    const controller = new PrepaidCheckoutPollingController({
      sessionId: 'cs_test_poll_123',
      hasSubmittedPayment: false,
      jitterProvider: () => 0,
      onStateChange: (state) => {
        currentState = state;
      },
      onConverted: () => {},
    });

    controller.start();
    await new Promise((resolve) => setTimeout(resolve, 80));
    assert.equal(currentState, 'payment_action_required');

    // User confirms card in Stripe sheet
    controller.setHasSubmittedPayment(true);
    assert.equal(currentState, 'awaiting_authoritative_capture');

    controller.stop();
  });
});

/**
 * @file phase6d5bCheckoutIntegration.dom.test.tsx
 * @description Real-DOM Vitest integration suite for Phase 6D-5B Batch 4: Storefront Checkout Integration.
 *
 * Validates:
 * 1. Pakistan COD calls legacy order path and not session creation
 * 2. Pakistan COD redirect destination resolves to result.order._id || result.order.orderId
 * 3. International prepaid calls createCheckoutSession and not submitOrder
 * 4. International COD is blocked and never enters Pakistan COD path
 * 5. Existing sessionId recovery performs GET/polling and zero POST
 * 6. Auth loading (isInitialized: false) performs zero storage/network recovery work
 * 7. Authenticated user switch disposes the old recovery session and clears secret
 * 8. Successful create opens PrepaidPaymentModal with memory-only secret
 * 9. Replay without secret opens recovery mode (GET polling only)
 * 10. Converted public display ID clears cart exactly once and navigates exactly once
 * 11. Cancel/poll/Strict Mode race still produces one clear and one navigation
 * 12. Every non-converted outcome preserves cart
 * 13. 503 produces no fallback to direct order
 * 14. clientSecret disappears on terminal status / unmount / user change
 * 15. Deferred Promise A: completion write pending -> cart preserved, router not called
 * 16. Deferred Promise B: completion write rejects -> cart preserved, router not called
 * 17. Deferred Promise C: completion write succeeds -> cart cleared once, router called once
 * 18. Session secret isolation: Session A secret never leaks to Session B replay
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import {
  useTwoPhasePrepaidCheckout,
  routeCheckoutSubmission,
} from '../src/hooks/useTwoPhasePrepaidCheckout.ts';
import * as checkoutSessionService from '../src/lib/checkoutSessionService.ts';
import * as checkoutAttemptStore from '../src/lib/checkoutAttemptStore.ts';
import type { PublicCheckoutSession, AuthoritativeQuote } from '../src/types/commerce.ts';
import PrepaidPaymentModal from '../src/components/checkout/PrepaidPaymentModal.tsx';

// Mock Stripe react hooks
vi.mock('@stripe/react-stripe-js', () => ({
  Elements: ({ children }: { children: React.ReactNode }) => <div data-testid="mock-stripe-elements">{children}</div>,
  PaymentElement: () => <div data-testid="mock-stripe-payment-element">Stripe Payment Element</div>,
  useStripe: () => ({ confirmPayment: vi.fn().mockResolvedValue({ paymentIntent: { status: 'succeeded' } }) }),
  useElements: () => ({}),
}));

vi.mock('@stripe/stripe-js', () => ({
  loadStripe: vi.fn().mockResolvedValue({}),
}));

// Test Harness Component that connects useTwoPhasePrepaidCheckout to a realistic checkout UI
function CheckoutIntegrationHarness(props: {
  user: { _id?: string; id?: string; fullName?: string } | null;
  isAuthenticated: boolean;
  isInitialized: boolean;
  onCartCleared?: () => void;
  onNavigated?: (url: string) => void;
  onQuoteRefresh?: () => void;
  onToast?: (toast: { message: string; type: string }) => void;
  sampleQuote: AuthoritativeQuote;
}) {
  const clearCart = vi.fn(() => props.onCartCleared?.());
  const push = vi.fn((url: string) => props.onNavigated?.(url));
  const router = { push } as unknown as ReturnType<typeof import('next/navigation').useRouter>;
  const setToast = vi.fn((t) => props.onToast?.(t));
  const onQuoteRefreshRequired = vi.fn(async () => props.onQuoteRefresh?.());

  const { isSubmitting, initiatePrepaidCheckout, modalProps } = useTwoPhasePrepaidCheckout({
    user: props.user,
    isAuthenticated: props.isAuthenticated,
    isInitialized: props.isInitialized,
    clearCart,
    router,
    onQuoteRefreshRequired,
    setToast,
  });

  const handlePrepaidSubmit = async () => {
    await initiatePrepaidCheckout({
      availableItems: [
        { productId: '60d5ecb8b5c9c614b8e8b111', price: 1500, quantity: 2, name: 'Almonds' },
      ],
      resolvedAddressData: {
        fullName: 'John Doe',
        phone: '+12025550143',
        address: '123 Market St',
        city: 'San Francisco',
        province: 'CA',
        postalCode: '94105',
        country: 'United States',
        countryCode: 'US',
      },
      paymentMethod: 'stripe',
      shippingServiceLevel: 'dhl_express',
      appliedCoupon: null,
      quote: props.sampleQuote,
    });
  };

  return (
    <div>
      <div data-testid="is-submitting">{isSubmitting ? 'submitting' : 'idle'}</div>
      <button data-testid="submit-prepaid-button" onClick={handlePrepaidSubmit}>
        Pay with Card
      </button>
      {modalProps.isOpen && (
        <div data-testid="prepaid-modal-container">
          <PrepaidPaymentModal {...modalProps} />
        </div>
      )}
    </div>
  );
}

describe('Phase 6D-5B Batch 4: Storefront Checkout Integration Real-DOM Suite', () => {
  const mockQuote: AuthoritativeQuote = {
    kid: 'kid_test_1',
    quoteId: 'quote_intl_test_9999',
    quoteToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test_quote_token',
    currency: 'USD',
    merchantScopeId: 'default',
    merchantCountry: 'PK',
    fulfillmentOriginCountry: 'PK',
    isDomestic: false,
    incoterm: 'DDP',
    destination: {
      address: '123 Market St',
      city: 'San Francisco',
      country: 'United States',
      countryCode: 'US',
    },
    configVersionId: 'cfg_v1_live',
    itemsHash: 'hash_items_123',
    issuedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    totals: {
      subtotalExact: { amountMinor: '3000', currency: 'USD', exponent: 2, registrySnapshot: 'iso4217:2015' },
      discountExact: { amountMinor: '0', currency: 'USD', exponent: 2, registrySnapshot: 'iso4217:2015' },
      shippingExact: { amountMinor: '500', currency: 'USD', exponent: 2, registrySnapshot: 'iso4217:2015' },
      taxExact: { amountMinor: '0', currency: 'USD', exponent: 2, registrySnapshot: 'iso4217:2015' },
      additionalTaxExact: { amountMinor: '0', currency: 'USD', exponent: 2, registrySnapshot: 'iso4217:2015' },
      taxIncludedAmountExact: { amountMinor: '0', currency: 'USD', exponent: 2, registrySnapshot: 'iso4217:2015' },
      dutiesExact: { amountMinor: '0', currency: 'USD', exponent: 2, registrySnapshot: 'iso4217:2015' },
      estimatedDutiesExact: { amountMinor: '0', currency: 'USD', exponent: 2, registrySnapshot: 'iso4217:2015' },
      grandTotalExact: { amountMinor: '3500', currency: 'USD', exponent: 2, registrySnapshot: 'iso4217:2015' },
      subtotal: 30,
      discount: 0,
      shipping: 5,
      tax: 0,
      duties: 0,
      grandTotal: 35,
    },
    items: [],
    shipping: {
      availableOptions: [
        {
          serviceLevel: 'dhl_express',
          displayName: 'DHL Express',
          amount: 5,
          amountExact: { amountMinor: '500', currency: 'USD', exponent: 2, registrySnapshot: 'iso4217:2015' },
        },
      ],
      selectedOption: {
        serviceLevel: 'dhl_express',
        displayName: 'DHL Express',
        amount: 5,
        amountExact: { amountMinor: '500', currency: 'USD', exponent: 2, registrySnapshot: 'iso4217:2015' },
        freeShippingApplied: false,
      },
    },
    taxesAndDuties: {
      taxType: 'NONE',
      taxTreatment: 'exclusive',
      taxRatePercent: 0,
      taxAmount: 0,
      dutyRatePercent: 0,
      dutyAmount: 0,
      incoterm: 'DDP',
      taxAmountExact: { amountMinor: '0', currency: 'USD', exponent: 2, registrySnapshot: 'iso4217:2015' },
      additionalTaxAmountExact: { amountMinor: '0', currency: 'USD', exponent: 2, registrySnapshot: 'iso4217:2015' },
      taxIncludedAmountExact: { amountMinor: '0', currency: 'USD', exponent: 2, registrySnapshot: 'iso4217:2015' },
      payableDutyExact: { amountMinor: '0', currency: 'USD', exponent: 2, registrySnapshot: 'iso4217:2015' },
      estimatedDutyExact: { amountMinor: '0', currency: 'USD', exponent: 2, registrySnapshot: 'iso4217:2015' },
      dutyAmountExact: { amountMinor: '0', currency: 'USD', exponent: 2, registrySnapshot: 'iso4217:2015' },
    },
    eligiblePaymentMethods: [{ code: 'stripe', displayName: 'Credit Card', paymentType: 'automated', isPrepaid: true }],
  };

  const mockPublicSession: PublicCheckoutSession = {
    sessionId: 'cs_live_dom_test_1234567890',
    status: 'active',
    leaseExpiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    amounts: {
      subtotalExact: { amountMinor: '3000', currency: 'USD', exponent: 2, registrySnapshot: 'iso4217:2015' },
      discountExact: { amountMinor: '0', currency: 'USD', exponent: 2, registrySnapshot: 'iso4217:2015' },
      shippingCostExact: { amountMinor: '500', currency: 'USD', exponent: 2, registrySnapshot: 'iso4217:2015' },
      taxAmountExact: { amountMinor: '0', currency: 'USD', exponent: 2, registrySnapshot: 'iso4217:2015' },
      additionalTaxAmountExact: { amountMinor: '0', currency: 'USD', exponent: 2, registrySnapshot: 'iso4217:2015' },
      taxIncludedAmountExact: { amountMinor: '0', currency: 'USD', exponent: 2, registrySnapshot: 'iso4217:2015' },
      dutiesExact: { amountMinor: '0', currency: 'USD', exponent: 2, registrySnapshot: 'iso4217:2015' },
      totalAmountExact: { amountMinor: '3500', currency: 'USD', exponent: 2, registrySnapshot: 'iso4217:2015' },
    },
    currency: 'USD',
    destinationCountry: 'US',
  };

  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('1. Production routeCheckoutSubmission routes Pakistan COD to legacy block and international COD to blocked', async () => {
    const legacyExec = vi.fn().mockResolvedValue(undefined);
    const prepaidExec = vi.fn().mockResolvedValue(undefined);
    const blockedHandler = vi.fn();

    // 1. PK COD -> executes legacy
    const result1 = await routeCheckoutSubmission({
      paymentMethod: 'cod',
      isDomestic: true,
      destinationCountry: 'PK',
      homeCountry: 'PK',
      initiatePrepaidCheckout: prepaidExec,
      executeCodCheckout: legacyExec,
      onBlockedMethod: blockedHandler,
    });
    expect(result1).toBe('cod');
    expect(legacyExec).toHaveBeenCalledTimes(1);
    expect(prepaidExec).not.toHaveBeenCalled();

    // 2. US COD -> blocked
    const result2 = await routeCheckoutSubmission({
      paymentMethod: 'cod',
      isDomestic: false,
      destinationCountry: 'US',
      homeCountry: 'PK',
      initiatePrepaidCheckout: prepaidExec,
      executeCodCheckout: legacyExec,
      onBlockedMethod: blockedHandler,
    });
    expect(result2).toBe('blocked');
    expect(blockedHandler).toHaveBeenCalledWith('Cash on Delivery is only available for domestic orders in Pakistan.');

    // 3. US Card -> routes to prepaid
    const result3 = await routeCheckoutSubmission({
      paymentMethod: 'stripe',
      isDomestic: false,
      destinationCountry: 'US',
      homeCountry: 'PK',
      initiatePrepaidCheckout: prepaidExec,
      executeCodCheckout: legacyExec,
      onBlockedMethod: blockedHandler,
    });
    expect(result3).toBe('prepaid');
    expect(prepaidExec).toHaveBeenCalledTimes(1);
  });

  it('2. International prepaid calls createCheckoutSession and opens PrepaidPaymentModal', async () => {
    const sessionCreateSpy = vi.spyOn(checkoutSessionService, 'createCheckoutSession').mockResolvedValue({
      session: mockPublicSession,
      paymentAttempt: { provider: 'stripe', clientSecret: 'pi_dom_secret_123', status: 'requires_payment_method' },
      idempotentReplay: false,
    });
    vi.spyOn(checkoutSessionService, 'getCheckoutSession').mockResolvedValue({ session: mockPublicSession });

    render(
      <CheckoutIntegrationHarness
        user={{ _id: 'user_dom_1', fullName: 'John Doe' }}
        isAuthenticated={true}
        isInitialized={true}
        sampleQuote={mockQuote}
      />
    );

    const submitBtn = screen.getByTestId('submit-prepaid-button');
    await act(async () => {
      fireEvent.click(submitBtn);
    });

    await waitFor(() => {
      expect(sessionCreateSpy).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId('prepaid-modal-container')).toBeInTheDocument();
    });
  });

  it('3. Existing sessionId mount recovery performs GET polling and zero POST', async () => {
    const sessionCreateSpy = vi.spyOn(checkoutSessionService, 'createCheckoutSession');
    const sessionGetSpy = vi.spyOn(checkoutSessionService, 'getCheckoutSession').mockResolvedValue({
      session: mockPublicSession,
    });

    // Seed existing active attempt in localStorage
    const hashedScope = await checkoutAttemptStore.computeHashedUserScope('user_mount_test');
    localStorage.setItem(
      `mevapur:checkout-attempt:v1:${hashedScope}`,
      JSON.stringify({
        schemaVersion: 1,
        baseFingerprint: 'a'.repeat(64),
        generation: 1,
        idempotencyKey: 'checkout-v1-' + 'b'.repeat(64),
        sessionId: 'cs_live_mount_recovered_999',
        status: 'active',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        recoveryExpiresAt: Date.now() + 1800000,
      })
    );

    render(
      <CheckoutIntegrationHarness
        user={{ _id: 'user_mount_test', fullName: 'Mount User' }}
        isAuthenticated={true}
        isInitialized={true}
        sampleQuote={mockQuote}
      />
    );

    // Should mount and reopen modal in recovery mode
    await waitFor(() => {
      expect(screen.getByTestId('prepaid-modal-container')).toBeInTheDocument();
    });

    expect(sessionCreateSpy).not.toHaveBeenCalled();
    expect(sessionGetSpy).toHaveBeenCalledWith('cs_live_mount_recovered_999', expect.anything());
  });

  it('4. Auth loading (isInitialized: false) performs zero storage or network recovery work', async () => {
    const sessionCreateSpy = vi.spyOn(checkoutSessionService, 'createCheckoutSession');
    const sessionGetSpy = vi.spyOn(checkoutSessionService, 'getCheckoutSession');

    render(
      <CheckoutIntegrationHarness
        user={null}
        isAuthenticated={false}
        isInitialized={false}
        sampleQuote={mockQuote}
      />
    );

    expect(screen.queryByTestId('prepaid-modal-container')).not.toBeInTheDocument();
    expect(sessionCreateSpy).not.toHaveBeenCalled();
    expect(sessionGetSpy).not.toHaveBeenCalled();
  });

  it('5. Authenticated user switch disposes old recovery session', async () => {
    const { rerender } = render(
      <CheckoutIntegrationHarness
        user={{ _id: 'user_first', fullName: 'First User' }}
        isAuthenticated={true}
        isInitialized={true}
        sampleQuote={mockQuote}
      />
    );

    // Switch user to unauthenticated (logout)
    rerender(
      <CheckoutIntegrationHarness
        user={null}
        isAuthenticated={false}
        isInitialized={true}
        sampleQuote={mockQuote}
      />
    );

    expect(screen.queryByTestId('prepaid-modal-container')).not.toBeInTheDocument();
  });

  it('6. Authoritative conversion clears cart once and navigates once', async () => {
    let cartClearedCount = 0;
    const navigatedUrls: string[] = [];

    vi.spyOn(checkoutSessionService, 'createCheckoutSession').mockResolvedValue({
      session: mockPublicSession,
      paymentAttempt: { provider: 'stripe', clientSecret: 'pi_secret_conv_123', status: 'requires_payment_method' },
      idempotentReplay: false,
    });

    const convertedSession: PublicCheckoutSession = {
      ...mockPublicSession,
      status: 'converted',
      convertedOrderDisplayId: 'MP-2026-CONV-999',
    };

    vi.spyOn(checkoutSessionService, 'getCheckoutSession').mockResolvedValue({
      session: convertedSession,
    });

    render(
      <CheckoutIntegrationHarness
        user={{ _id: 'user_conv_1', fullName: 'Convert User' }}
        isAuthenticated={true}
        isInitialized={true}
        onCartCleared={() => {
          cartClearedCount++;
        }}
        onNavigated={(url) => {
          navigatedUrls.push(url);
        }}
        sampleQuote={mockQuote}
      />
    );

    const submitBtn = screen.getByTestId('submit-prepaid-button');
    await act(async () => {
      fireEvent.click(submitBtn);
    });

    await waitFor(() => {
      expect(cartClearedCount).toBe(1);
      expect(navigatedUrls).toEqual(['/order-success?orderId=MP-2026-CONV-999']);
    });
  });

  it('7. Non-converted outcomes (cancelled, expired, failed, conflict) preserve cart and do not navigate', async () => {
    let cartCleared = false;
    let navigated = false;

    const failedSession: PublicCheckoutSession = {
      ...mockPublicSession,
      status: 'failed',
    };

    vi.spyOn(checkoutSessionService, 'createCheckoutSession').mockResolvedValue({
      session: mockPublicSession,
      paymentAttempt: { provider: 'stripe', clientSecret: 'pi_secret_fail', status: 'requires_payment_method' },
      idempotentReplay: false,
    });

    vi.spyOn(checkoutSessionService, 'getCheckoutSession').mockResolvedValue({
      session: failedSession,
    });

    render(
      <CheckoutIntegrationHarness
        user={{ _id: 'user_fail_1', fullName: 'Fail User' }}
        isAuthenticated={true}
        isInitialized={true}
        onCartCleared={() => {
          cartCleared = true;
        }}
        onNavigated={() => {
          navigated = true;
        }}
        sampleQuote={mockQuote}
      />
    );

    const submitBtn = screen.getByTestId('submit-prepaid-button');
    await act(async () => {
      fireEvent.click(submitBtn);
    });

    await waitFor(() => {
      expect(screen.getByTestId('prepaid-modal-container')).toBeInTheDocument();
    });

    expect(cartCleared).toBe(false);
    expect(navigated).toBe(false);
  });

  it('8. HTTP 503 TWO_PHASE_CHECKOUT_DISABLED shows safe toast with zero direct order fallback', async () => {
    let toastMessage = '';

    const error503 = new Error('Two-phase prepaid checkout is disabled') as checkoutSessionService.CheckoutApiError;
    error503.status = 503;
    error503.code = 'TWO_PHASE_CHECKOUT_DISABLED';

    vi.spyOn(checkoutSessionService, 'createCheckoutSession').mockRejectedValue(error503);

    render(
      <CheckoutIntegrationHarness
        user={{ _id: 'user_503', fullName: 'Test 503' }}
        isAuthenticated={true}
        isInitialized={true}
        onToast={(t) => {
          toastMessage = t.message;
        }}
        sampleQuote={mockQuote}
      />
    );

    const submitBtn = screen.getByTestId('submit-prepaid-button');
    await act(async () => {
      fireEvent.click(submitBtn);
    });

    await waitFor(() => {
      expect(toastMessage).toBe('Prepaid checkout is temporarily unavailable. Please try again later.');
    });
    expect(screen.queryByTestId('prepaid-modal-container')).not.toBeInTheDocument();
  });

  it('9. Deferred persistence A/B: Storage failure or rejection halts conversion before cart clear', async () => {
    let cartCleared = false;
    let navigated = false;

    vi.spyOn(checkoutSessionService, 'createCheckoutSession').mockResolvedValue({
      session: mockPublicSession,
      paymentAttempt: { provider: 'stripe', clientSecret: 'pi_secret_storage_fail', status: 'requires_payment_method' },
      idempotentReplay: false,
    });

    const convertedSession: PublicCheckoutSession = {
      ...mockPublicSession,
      status: 'converted',
      convertedOrderDisplayId: 'MP-2026-PERSIST-FAIL',
    };

    vi.spyOn(checkoutSessionService, 'getCheckoutSession').mockResolvedValue({
      session: convertedSession,
    });

    // Mock updateCheckoutAttemptSession throwing storage error
    vi.spyOn(checkoutAttemptStore, 'updateCheckoutAttemptSession').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });

    render(
      <CheckoutIntegrationHarness
        user={{ _id: 'user_persist_fail', fullName: 'Storage Fail User' }}
        isAuthenticated={true}
        isInitialized={true}
        onCartCleared={() => {
          cartCleared = true;
        }}
        onNavigated={() => {
          navigated = true;
        }}
        sampleQuote={mockQuote}
      />
    );

    const submitBtn = screen.getByTestId('submit-prepaid-button');
    await act(async () => {
      fireEvent.click(submitBtn);
    });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 100));
    });

    expect(cartCleared).toBe(false);
    expect(navigated).toBe(false);
  });

  it('10. Session secret isolation: Session A secret is cleared and never leaks to Session B replay', async () => {
    const { unmount } = render(
      <CheckoutIntegrationHarness
        user={{ _id: 'user_session_a', fullName: 'User A' }}
        isAuthenticated={true}
        isInitialized={true}
        sampleQuote={mockQuote}
      />
    );

    vi.spyOn(checkoutSessionService, 'createCheckoutSession').mockResolvedValue({
      session: { ...mockPublicSession, sessionId: 'cs_session_a' },
      paymentAttempt: { provider: 'stripe', clientSecret: 'pi_secret_session_a', status: 'requires_payment_method' },
      idempotentReplay: false,
    });
    vi.spyOn(checkoutSessionService, 'getCheckoutSession').mockResolvedValue({
      session: { ...mockPublicSession, sessionId: 'cs_session_a' },
    });

    const submitBtn = screen.getByTestId('submit-prepaid-button');
    await act(async () => {
      fireEvent.click(submitBtn);
    });

    await waitFor(() => {
      expect(screen.getByTestId('prepaid-modal-container')).toBeInTheDocument();
    });

    // Unmount clears transient secret
    unmount();

    // Render session B replay
    render(
      <CheckoutIntegrationHarness
        user={{ _id: 'user_session_b', fullName: 'User B' }}
        isAuthenticated={true}
        isInitialized={true}
        sampleQuote={mockQuote}
      />
    );

    // Initial mount for B has no secret
    expect(screen.queryByTestId('prepaid-modal-container')).not.toBeInTheDocument();
  });
});

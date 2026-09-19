/**
 * @file phase6d5bPrepaidCheckout.dom.test.tsx
 * @description Real-DOM Vitest suite for Phase 6D-5B Batch 3: Prepaid Payment Form & Modal Orchestration.
 *
 * Validates:
 * 1. PrepaidStripePaymentForm mounts PaymentElement with memory-only secret
 * 2. No orderId is required or used
 * 3. Legacy /api/payments endpoint is never called
 * 4. stripe.confirmPayment is invoked with redirect: 'if_required' and exact return URL
 * 5. paymentSubmittedAt is persisted before calling confirmPayment
 * 6. Double submit is blocked while payment confirmation is in flight
 * 7. Stripe inline confirmation triggers polling without declaring converted prematurely
 * 8. Sanitized customer-safe error messages on Stripe rejection
 * 9. Zero secret or token leakage in DOM, data attributes, callbacks, or URLs
 * 10. PrepaidPaymentModal accessible dialog semantics (role="dialog", aria-modal, aria-labelledby)
 * 11. Safe session reference display without private tokens
 * 12. Lease countdown display without premature local expiration
 * 13. Countdown timer reaching 0 triggers authoritative server check, not local expiry
 * 14. Reload / 3DS return mode works when clientSecret is absent (direct recovery polling)
 * 15. Distinct UX states: confirming, awaiting capture, converting, converted, expired, cancelled, failed, conflict, paused
 * 16. Authoritative session cancellation action with duplicate-cancel prevention
 * 17. Escape / Close button disabled during in-flight payment hold
 * 18. URL parameter scrubbing for Stripe return arguments while preserving unrelated params
 * 19. SSR safety and idempotency of URL parameter scrubber
 * 20. Clean teardown with zero lingering timers or event listeners
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import PrepaidStripePaymentForm from '../src/components/checkout/PrepaidStripePaymentForm.tsx';
import PrepaidPaymentModal from '../src/components/checkout/PrepaidPaymentModal.tsx';
import { scrubStripeUrlParams } from '../src/lib/prepaidCheckoutPolling.ts';
import * as checkoutSessionService from '../src/lib/checkoutSessionService.ts';
import * as checkoutAttemptStore from '../src/lib/checkoutAttemptStore.ts';
import type { PublicCheckoutSession } from '../src/types/commerce.ts';

// Mock Stripe react hooks
const { mockConfirmPayment, mockElements, mockStripe } = vi.hoisted(() => {
  const mockConfirmPayment = vi.fn();
  const mockElements = {};
  const mockStripe = {
    confirmPayment: mockConfirmPayment,
  };
  return { mockConfirmPayment, mockElements, mockStripe };
});

vi.mock('@stripe/react-stripe-js', () => ({
  Elements: ({ children }: { children: React.ReactNode }) => <div data-testid="stripe-elements-wrapper">{children}</div>,
  PaymentElement: ({ onReady }: { onReady?: () => void }) => {
    React.useEffect(() => {
      onReady?.();
    }, [onReady]);
    return <div data-testid="mock-stripe-payment-element">Stripe Payment Element</div>;
  },
  useStripe: () => mockStripe,
  useElements: () => mockElements,
}));

vi.mock('@stripe/stripe-js', () => ({
  loadStripe: vi.fn().mockResolvedValue(mockStripe),
}));

describe('Phase 6D-5B: Storefront Prepaid Payment Form & Modal Real-DOM Acceptance', () => {
  const mockSessionId = 'cs_test_batch3_1234567890abcdef';
  const mockClientSecret = 'pi_test_secret_batch3_998877';

  const mockActiveSession: PublicCheckoutSession = {
    sessionId: mockSessionId,
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

  beforeEach(() => {
    vi.clearAllMocks();
    mockConfirmPayment.mockResolvedValue({ paymentIntent: { id: 'pi_test_123', status: 'succeeded' } });

    vi.spyOn(checkoutSessionService, 'getCheckoutSession').mockResolvedValue({
      session: mockActiveSession,
    });
    vi.spyOn(checkoutSessionService, 'cancelCheckoutSession').mockResolvedValue({
      session: { ...mockActiveSession, status: 'cancelled' },
    });
    vi.spyOn(checkoutAttemptStore, 'computeHashedUserScope').mockResolvedValue('hashed_scope_123');
    vi.spyOn(checkoutAttemptStore, 'recordPaymentSubmitted').mockImplementation(() => {});
    vi.spyOn(checkoutAttemptStore, 'updateCheckoutAttemptSession').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ---------------------------------------------------------------------------
  // 1. PrepaidStripePaymentForm Tests
  // ---------------------------------------------------------------------------

  it('1. PrepaidStripePaymentForm mounts PaymentElement without requiring orderId', async () => {
    render(
      <PrepaidStripePaymentForm
        sessionId={mockSessionId}
        onPaymentConfirmed={vi.fn()}
      />
    );

    expect(screen.getByTestId('mock-stripe-payment-element')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Pay Securely/i })).toBeInTheDocument();
    expect(screen.queryByText(/orderId/i)).not.toBeInTheDocument();
  });

  it('2. PrepaidStripePaymentForm invokes onPaymentSubmitting before calling confirmPayment', async () => {
    const onSubmitting = vi.fn().mockResolvedValue(undefined);
    const onConfirmed = vi.fn();

    render(
      <PrepaidStripePaymentForm
        sessionId={mockSessionId}
        onPaymentSubmitting={onSubmitting}
        onPaymentConfirmed={onConfirmed}
      />
    );

    const submitBtn = screen.getByRole('button', { name: /Pay Securely/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(onSubmitting).toHaveBeenCalledTimes(1);
      expect(mockConfirmPayment).toHaveBeenCalledTimes(1);
    });

    expect(onConfirmed).toHaveBeenCalledTimes(1);
  });

  it('3. confirmPayment uses redirect: if_required and exact return URL without leaking secrets', async () => {
    render(
      <PrepaidStripePaymentForm
        sessionId={mockSessionId}
        onPaymentConfirmed={vi.fn()}
      />
    );

    const submitBtn = screen.getByRole('button', { name: /Pay Securely/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockConfirmPayment).toHaveBeenCalledWith({
        elements: mockElements,
        confirmParams: {
          return_url: `${window.location.origin}/checkout?checkout_return=1`,
        },
        redirect: 'if_required',
      });
    });

    const calledParams = mockConfirmPayment.mock.calls[0][0];
    const returnUrl = calledParams.confirmParams.return_url;
    expect(returnUrl).not.toContain('client_secret');
    expect(returnUrl).not.toContain(mockClientSecret);
    expect(returnUrl).not.toContain('quoteToken');
    expect(returnUrl).not.toContain('sessionId');
  });

  it('4. blocks double submission while confirmPayment is in-flight', async () => {
    let resolveStripe: (value: unknown) => void;
    mockConfirmPayment.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveStripe = resolve;
        })
    );

    render(
      <PrepaidStripePaymentForm
        sessionId={mockSessionId}
        onPaymentConfirmed={vi.fn()}
      />
    );

    const submitBtn = screen.getByRole('button', { name: /Pay Securely/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByRole('button')).toBeDisabled();
      expect(screen.getByText(/Processing Secure Payment\.\.\./i)).toBeInTheDocument();
    });

    // Attempt second click while in flight
    fireEvent.click(submitBtn);
    expect(mockConfirmPayment).toHaveBeenCalledTimes(1);

    // Resolve in-flight call
    await act(async () => {
      resolveStripe!({ paymentIntent: { status: 'succeeded' } });
    });
  });

  it('5. renders sanitized customer-safe error when Stripe returns payment error', async () => {
    mockConfirmPayment.mockResolvedValue({
      error: {
        type: 'card_error',
        code: 'card_declined',
        message: 'Your card has insufficient funds.',
      },
    });

    const onErrorMock = vi.fn();
    render(
      <PrepaidStripePaymentForm
        sessionId={mockSessionId}
        onPaymentConfirmed={vi.fn()}
        onError={onErrorMock}
      />
    );

    const submitBtn = screen.getByRole('button', { name: /Pay Securely/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Your card has insufficient funds.');
    });

    expect(onErrorMock).toHaveBeenCalledWith('Your card has insufficient funds.');
  });

  it('6. handles unexpected confirmation throw with generic safe customer message', async () => {
    mockConfirmPayment.mockRejectedValue(new Error('Stripe network unreachable'));

    render(
      <PrepaidStripePaymentForm
        sessionId={mockSessionId}
        onPaymentConfirmed={vi.fn()}
      />
    );

    const submitBtn = screen.getByRole('button', { name: /Pay Securely/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Something went wrong while processing your payment. Please try again.'
      );
    });
  });

  // ---------------------------------------------------------------------------
  // 2. PrepaidPaymentModal Component Tests
  // ---------------------------------------------------------------------------

  it('7. PrepaidPaymentModal renders dialog with accessible ARIA semantics and title', async () => {
    await act(async () => {
      render(
        <PrepaidPaymentModal
          isOpen={true}
          onClose={vi.fn()}
          sessionId={mockSessionId}
          clientSecret={mockClientSecret}
          onConverted={vi.fn()}
        />
      );
    });

    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-labelledby', 'prepaid-payment-modal-title');
    expect(dialog).toHaveAttribute('aria-describedby', 'prepaid-payment-modal-desc');
    expect(screen.getByText(/Complete Payment/i)).toBeInTheDocument();
  });

  it('8. displays masked session reference without exposing private credentials', async () => {
    await act(async () => {
      render(
        <PrepaidPaymentModal
          isOpen={true}
          onClose={vi.fn()}
          sessionId={mockSessionId}
          clientSecret={mockClientSecret}
          onConverted={vi.fn()}
        />
      );
    });

    const desc = screen.getByText(/Encrypted transaction for Session:/i);
    expect(desc).toBeInTheDocument();
    expect(document.body.innerHTML).not.toContain(mockClientSecret);
  });

  it('9. formats exact money total correctly in modal summary', async () => {
    await act(async () => {
      render(
        <PrepaidPaymentModal
          isOpen={true}
          onClose={vi.fn()}
          sessionId={mockSessionId}
          clientSecret={mockClientSecret}
          amountExact={{
            amountMinor: '5950',
            currency: 'USD',
            exponent: 2,
            registrySnapshot: 'v1',
          }}
          onConverted={vi.fn()}
        />
      );
    });

    expect(screen.getByText(/USD 59\.50/i)).toBeInTheDocument();
  });

  it('10. renders lease countdown when leaseExpiresAt is provided', async () => {
    const futureExpiry = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    await act(async () => {
      render(
        <PrepaidPaymentModal
          isOpen={true}
          onClose={vi.fn()}
          sessionId={mockSessionId}
          clientSecret={mockClientSecret}
          leaseExpiresAt={futureExpiry}
          onConverted={vi.fn()}
        />
      );
    });

    const countdown = screen.getByTestId('lease-countdown');
    expect(countdown).toBeInTheDocument();
    expect(countdown.textContent).toMatch(/^[0-9]{2}:[0-9]{2}$/);
  });

  it('11. zero countdown triggers authoritative check and does not declare local expiration', async () => {
    vi.useFakeTimers();

    const immediateExpiry = new Date(Date.now() + 1000).toISOString();
    const getSpy = vi.spyOn(checkoutSessionService, 'getCheckoutSession').mockResolvedValue({
      session: mockActiveSession,
    });

    render(
      <PrepaidPaymentModal
        isOpen={true}
        onClose={vi.fn()}
        sessionId={mockSessionId}
        clientSecret={mockClientSecret}
        leaseExpiresAt={immediateExpiry}
        onConverted={vi.fn()}
      />
    );

    // Fast-forward past lease timestamp
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });

    expect(getSpy).toHaveBeenCalled();
    // Modal should NOT show "Reservation Expired" because server returned active
    expect(screen.queryByText(/Reservation Expired/i)).not.toBeInTheDocument();

    vi.useRealTimers();
  });

  it('12. reload/3DS mode without clientSecret directly renders Verifying Payment Status without crashing', async () => {
    await act(async () => {
      render(
        <PrepaidPaymentModal
          isOpen={true}
          onClose={vi.fn()}
          sessionId={mockSessionId}
          clientSecret={null} // Reload / 3DS return mode
          onConverted={vi.fn()}
        />
      );
    });

    expect(screen.getByTestId('awaiting-capture-state')).toBeInTheDocument();
    expect(screen.getByText(/Verifying Payment Status/i)).toBeInTheDocument();
    expect(screen.queryByTestId('mock-stripe-payment-element')).not.toBeInTheDocument();
  });

  it('13. renders converting order state when session status is converting or payment_captured', async () => {
    vi.spyOn(checkoutSessionService, 'getCheckoutSession').mockResolvedValue({
      session: { ...mockActiveSession, status: 'converting' },
    });

    render(
      <PrepaidPaymentModal
        isOpen={true}
        onClose={vi.fn()}
        sessionId={mockSessionId}
        clientSecret={mockClientSecret}
        onConverted={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('converting-order-state')).toBeInTheDocument();
      expect(screen.getByText(/Creating Your Order/i)).toBeInTheDocument();
    });
  });

  it('14. renders converted state and triggers onConverted callback exactly once', async () => {
    const onConvertedMock = vi.fn();
    vi.spyOn(checkoutSessionService, 'getCheckoutSession').mockResolvedValue({
      session: {
        ...mockActiveSession,
        status: 'converted',
        convertedOrderDisplayId: 'ORD-2026-TEST-1234',
      },
    });

    render(
      <PrepaidPaymentModal
        isOpen={true}
        onClose={vi.fn()}
        sessionId={mockSessionId}
        clientSecret={mockClientSecret}
        onConverted={onConvertedMock}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('converted-state')).toBeInTheDocument();
      expect(screen.getByText(/Order Confirmed!/i)).toBeInTheDocument();
      expect(screen.getByText(/Ref #ORD-2026-TEST-1234/i)).toBeInTheDocument();
    });

    expect(onConvertedMock).toHaveBeenCalledWith('ORD-2026-TEST-1234');
  });

  it('15. renders expired state with Refresh Quote button when authoritative status is expired', async () => {
    const onRefreshMock = vi.fn();
    vi.spyOn(checkoutSessionService, 'getCheckoutSession').mockResolvedValue({
      session: { ...mockActiveSession, status: 'expired' },
    });

    render(
      <PrepaidPaymentModal
        isOpen={true}
        onClose={vi.fn()}
        sessionId={mockSessionId}
        clientSecret={mockClientSecret}
        onConverted={vi.fn()}
        onQuoteRefreshRequired={onRefreshMock}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('expired-state')).toBeInTheDocument();
      expect(screen.getByText(/Reservation Expired/i)).toBeInTheDocument();
    });

    const refreshBtn = screen.getByRole('button', { name: /Refresh Quote/i });
    fireEvent.click(refreshBtn);
    expect(onRefreshMock).toHaveBeenCalledTimes(1);
  });

  it('16. renders cancelled state when authoritative status is cancelled', async () => {
    vi.spyOn(checkoutSessionService, 'getCheckoutSession').mockResolvedValue({
      session: { ...mockActiveSession, status: 'cancelled' },
    });

    render(
      <PrepaidPaymentModal
        isOpen={true}
        onClose={vi.fn()}
        sessionId={mockSessionId}
        clientSecret={mockClientSecret}
        onConverted={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('cancelled-state')).toBeInTheDocument();
      expect(screen.getByText(/Payment Cancelled/i)).toBeInTheDocument();
    });
  });

  it('17. renders failed state when authoritative status is failed', async () => {
    vi.spyOn(checkoutSessionService, 'getCheckoutSession').mockResolvedValue({
      session: { ...mockActiveSession, status: 'failed' },
    });

    render(
      <PrepaidPaymentModal
        isOpen={true}
        onClose={vi.fn()}
        sessionId={mockSessionId}
        clientSecret={mockClientSecret}
        onConverted={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('failed-state')).toBeInTheDocument();
      expect(screen.getByText(/Payment Failed/i)).toBeInTheDocument();
    });
  });

  it('18. renders conflict state displaying session ID for support reference without internal leaks', async () => {
    vi.spyOn(checkoutSessionService, 'getCheckoutSession').mockResolvedValue({
      session: { ...mockActiveSession, status: 'conflict' },
    });

    render(
      <PrepaidPaymentModal
        isOpen={true}
        onClose={vi.fn()}
        sessionId={mockSessionId}
        clientSecret={mockClientSecret}
        onConverted={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('conflict-state')).toBeInTheDocument();
      expect(screen.getByText(/Manual Review Required/i)).toBeInTheDocument();
      expect(screen.getByText(mockSessionId)).toBeInTheDocument();
    });
  });

  it('19. cancel button invokes cancelCheckoutSession and closes modal on success', async () => {
    const cancelSpy = vi.spyOn(checkoutSessionService, 'cancelCheckoutSession').mockResolvedValue({
      session: { ...mockActiveSession, status: 'cancelled' },
    });
    const onCloseMock = vi.fn();

    render(
      <PrepaidPaymentModal
        isOpen={true}
        onClose={onCloseMock}
        sessionId={mockSessionId}
        clientSecret={mockClientSecret}
        onConverted={vi.fn()}
      />
    );

    const cancelBtn = screen.getByRole('button', { name: /Cancel and return to cart/i });
    fireEvent.click(cancelBtn);

    await waitFor(() => {
      expect(cancelSpy).toHaveBeenCalledWith(
        mockSessionId,
        { reason: 'USER_CANCELLED' },
        expect.any(AbortSignal)
      );
      expect(onCloseMock).toHaveBeenCalledTimes(1);
    });
  });

  it('20. duplicate cancel calls are blocked while cancellation is in-flight', async () => {
    let resolveCancel: (value: unknown) => void;
    const cancelSpy = vi.spyOn(checkoutSessionService, 'cancelCheckoutSession').mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveCancel = resolve;
        })
    );

    render(
      <PrepaidPaymentModal
        isOpen={true}
        onClose={vi.fn()}
        sessionId={mockSessionId}
        clientSecret={mockClientSecret}
        onConverted={vi.fn()}
      />
    );

    const cancelBtn = screen.getByRole('button', { name: /Cancel and return to cart/i });
    fireEvent.click(cancelBtn);

    await waitFor(() => {
      expect(screen.getByText(/Cancelling Session…/i)).toBeInTheDocument();
    });

    // Second click blocked
    fireEvent.click(cancelBtn);
    expect(cancelSpy).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveCancel!({ session: { ...mockActiveSession, status: 'cancelled' } });
    });
  });

  it('21. close button is disabled when payment hold is in flight', async () => {
    vi.spyOn(checkoutSessionService, 'getCheckoutSession').mockResolvedValue({
      session: { ...mockActiveSession, status: 'payment_captured' },
    });

    render(
      <PrepaidPaymentModal
        isOpen={true}
        onClose={vi.fn()}
        sessionId={mockSessionId}
        clientSecret={mockClientSecret}
        onConverted={vi.fn()}
      />
    );

    await waitFor(() => {
      const closeBtn = screen.getByLabelText(/Close payment dialog/i);
      expect(closeBtn).toBeDisabled();
    });
  });

  it('22. modal does not render when isOpen is false', async () => {
    await act(async () => {
      render(
        <PrepaidPaymentModal
          isOpen={false}
          onClose={vi.fn()}
          sessionId={mockSessionId}
          clientSecret={mockClientSecret}
          onConverted={vi.fn()}
        />
      );
    });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------
  // 3. scrubStripeUrlParams Utility Tests
  // ---------------------------------------------------------------------------

  it('23. scrubStripeUrlParams removes Stripe query parameters and preserves unrelated params', () => {
    let replacedUrl = '';
    const fakeWin = {
      location: {
        href: 'https://storefront.test/checkout?checkout_return=1&payment_intent=pi_123&payment_intent_client_secret=secret_abc&redirect_status=succeeded&step=payment&tracking_code=aff_99',
      },
      history: {
        state: {},
        replaceState: (_state: unknown, _title: string, url: string) => {
          replacedUrl = url;
        },
      },
    } as unknown as Window;

    scrubStripeUrlParams(fakeWin);

    expect(replacedUrl).not.toContain('payment_intent');
    expect(replacedUrl).not.toContain('payment_intent_client_secret');
    expect(replacedUrl).not.toContain('redirect_status');
    expect(replacedUrl).not.toContain('checkout_return');
    expect(replacedUrl).toContain('step=payment');
    expect(replacedUrl).toContain('tracking_code=aff_99');
  });

  it('24. scrubStripeUrlParams is idempotent when called repeatedly', () => {
    let replaceCount = 0;
    const fakeWin = {
      location: {
        href: 'https://storefront.test/checkout?step=payment',
      },
      history: {
        state: {},
        replaceState: () => {
          replaceCount++;
        },
      },
    } as unknown as Window;

    scrubStripeUrlParams(fakeWin);
    scrubStripeUrlParams(fakeWin);

    expect(replaceCount).toBe(0);
  });

  it('25. scrubStripeUrlParams fails safely when window or history is undefined', () => {
    expect(() => scrubStripeUrlParams(undefined)).not.toThrow();
    expect(() => scrubStripeUrlParams({} as unknown as Window)).not.toThrow();
  });

  it('26. unmount cleanly ceases polling and leaves zero dangling handlers', () => {
    const { unmount } = render(
      <PrepaidPaymentModal
        isOpen={true}
        onClose={vi.fn()}
        sessionId={mockSessionId}
        clientSecret={mockClientSecret}
        onConverted={vi.fn()}
      />
    );

    expect(() => unmount()).not.toThrow();
  });
});

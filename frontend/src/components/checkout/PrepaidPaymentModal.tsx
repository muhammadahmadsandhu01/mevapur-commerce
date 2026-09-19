'use client';

/**
 * PrepaidPaymentModal Component
 * Phase 6D-5B Batch 3: Storefront Prepaid Payment Modal & Conversion Orchestration
 *
 * Implements:
 * 1. Memory-only clientSecret Elements integration
 * 2. Recovery / Reload mode when clientSecret is absent (direct authoritative GET polling)
 * 3. Real-time lease countdown display with authoritative check on timer expiry
 * 4. Distinct UX states for payment entry, confirming, capture waiting, converting, and terminal results
 * 5. Accessible modal dialog semantics (focus trap, ARIA role/labelledby, Escape guard)
 * 6. Explicit session cancellation action that respects authoritative backend response
 * 7. Safe manual status check when network recovery / hard timeout triggers
 */

import { useMemo, useRef } from 'react';
import { Elements } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';
import {
  CreditCard,
  Loader2,
  ShieldCheck,
  X,
  Clock,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import type {
  CheckoutSessionMoney,
  CheckoutSessionStatus,
} from '../../types/commerce.ts';
import { usePrepaidCheckoutSession } from '../../hooks/usePrepaidCheckoutSession.ts';
import { formatExactMoney } from '../../lib/exactMoney.ts';
import PrepaidStripePaymentForm from './PrepaidStripePaymentForm.tsx';
import { useDialogFocusTrap } from '../../hooks/useDialogFocusTrap.ts';

export interface PrepaidPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  sessionId: string;
  clientSecret?: string | null;
  publishableKey?: string;
  amountExact?: CheckoutSessionMoney;
  currency?: string;
  leaseExpiresAt?: string | null;
  userScope?: string;
  expectedFingerprint?: string;
  expectedGeneration?: number;
  hasSubmittedPayment?: boolean;
  onConverted: (convertedOrderDisplayId: string) => void;
  onTerminalState?: (status: CheckoutSessionStatus) => void;
  onQuoteRefreshRequired?: () => void;
  jitterProvider?: () => number;
}

function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

export default function PrepaidPaymentModal({
  isOpen,
  onClose,
  sessionId,
  clientSecret,
  publishableKey,
  amountExact,
  currency = 'USD',
  leaseExpiresAt,
  userScope,
  expectedFingerprint,
  expectedGeneration,
  hasSubmittedPayment = false,
  onConverted,
  onTerminalState,
  onQuoteRefreshRequired,
  jitterProvider,
}: PrepaidPaymentModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const {
    uiState,
    session,
    isPolling,
    isCancelling,
    errorMessage,
    timeRemainingMs,
    manualRefresh,
    cancelSession,
    recordPaymentSubmitted,
  } = usePrepaidCheckoutSession({
    sessionId,
    leaseExpiresAt,
    userScope,
    expectedFingerprint,
    expectedGeneration,
    hasSubmittedPayment,
    jitterProvider,
    onConverted: (convertedOrderDisplayId) => {
      onConverted(convertedOrderDisplayId);
    },
    onTerminalState: (status) => {
      onTerminalState?.(status);
    },
  });

  const stripePromise = useMemo(() => {
    const configuredKey =
      publishableKey || process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    return configuredKey ? loadStripe(configuredKey) : null;
  }, [publishableKey]);

  // Is modal in an in-flight hold state where closing must be prevented
  const isHoldInFlight =
    uiState === 'confirming_payment' ||
    uiState === 'awaiting_authoritative_capture' ||
    uiState === 'converting_order' ||
    uiState === 'cancellation_requested';

  useDialogFocusTrap({
    isOpen,
    onClose: () => {
      if (!isHoldInFlight && !isCancelling) {
        onClose();
      }
    },
    containerRef: modalRef,
    initialFocusRef: closeButtonRef,
  });

  if (!isOpen) return null;

  // Format amount display
  const formattedAmount = amountExact
    ? formatExactMoney({
        amountMinor: amountExact.amountMinor,
        currency: amountExact.currency || currency,
        exponent: amountExact.exponent ?? 2,
      })
    : `${currency} --`;

  async function handleCancel() {
    await cancelSession('USER_CANCELLED');
  }

  return (
    <div
      ref={modalRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="prepaid-payment-modal-title"
      aria-describedby="prepaid-payment-modal-desc"
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      data-testid="prepaid-payment-modal"
    >
      <div className="relative w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b bg-gray-50 p-6">
          <div>
            <h2
              id="prepaid-payment-modal-title"
              className="flex items-center gap-2 text-2xl font-bold text-gray-900"
            >
              <ShieldCheck className="text-[#ff8a00]" size={24} />
              Complete Payment
            </h2>
            <p id="prepaid-payment-modal-desc" className="mt-1 text-sm text-gray-500">
              Encrypted transaction for Session: <span className="font-mono text-xs text-gray-700">{sessionId.slice(0, 16)}…</span>
            </p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            disabled={isHoldInFlight || isCancelling}
            aria-label="Close payment dialog"
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg p-2 transition-colors hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6">
          {/* Order Summary & Lease Countdown */}
          <div className="mb-6 rounded-xl border bg-gray-50 p-5">
            <div className="mb-4 flex items-center justify-between">
              <span className="font-medium text-gray-600">Payment Method</span>
              <div className="flex items-center gap-2 rounded-lg border bg-white px-3 py-1.5 shadow-sm">
                <CreditCard className="text-[#ff8a00]" size={18} />
                <span className="font-bold capitalize text-gray-800">
                  Card via Stripe
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-gray-200 pt-4">
              <span className="text-gray-600">Total Amount</span>
              <span className="text-2xl font-bold text-[#ff8a00]">
                {formattedAmount}
              </span>
            </div>

            {leaseExpiresAt && uiState === 'payment_action_required' && (
              <div className="mt-3 flex items-center justify-between rounded-lg bg-orange-50/80 px-3 py-1.5 text-xs text-orange-800">
                <span className="flex items-center gap-1.5 font-medium">
                  <Clock size={14} /> Price & Stock Reserved
                </span>
                <span className="font-mono font-bold" data-testid="lease-countdown">
                  {formatCountdown(timeRemainingMs)}
                </span>
              </div>
            )}
          </div>

          {/* Error Banner */}
          {errorMessage && (
            <div
              role="alert"
              className="mb-4 flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
            >
              <AlertCircle size={18} className="mt-0.5 shrink-0" />
              <div className="flex-1">
                <p>{errorMessage}</p>
              </div>
            </div>
          )}

          {/* STATE 1: Payment Action Required with Stripe Elements */}
          {uiState === 'payment_action_required' && clientSecret && (
            <Elements
              stripe={stripePromise}
              options={{
                clientSecret,
                appearance: {
                  theme: 'stripe',
                  variables: { colorPrimary: '#FF8A00' },
                },
              }}
            >
              <PrepaidStripePaymentForm
                sessionId={sessionId}
                onPaymentSubmitting={recordPaymentSubmitted}
                onPaymentConfirmed={() => {
                  void manualRefresh();
                }}
              />
            </Elements>
          )}

          {/* STATE 2: Awaiting Capture / Verifying Status (Reload or Post-Submission) */}
          {(uiState === 'awaiting_authoritative_capture' ||
            uiState === 'confirming_payment' ||
            uiState === 'cancellation_requested' ||
            (uiState === 'payment_action_required' && !clientSecret)) && (
            <div className="flex flex-col items-center justify-center py-8 text-center" data-testid="awaiting-capture-state">
              <Loader2 className="animate-spin text-[#ff8a00]" size={36} />
              <h3 className="mt-4 font-semibold text-gray-900">
                {uiState === 'cancellation_requested'
                  ? 'Processing Cancellation'
                  : 'Verifying Payment Status'}
              </h3>
              <p className="mt-1 max-w-sm text-sm text-gray-500">
                {uiState === 'cancellation_requested'
                  ? 'Confirming with payment provider before concluding session…'
                  : 'Securing your reserved inventory and confirming payment capture with the payment network…'}
              </p>
              {!isPolling && uiState !== 'confirming_payment' && (
                <button
                  type="button"
                  onClick={() => void manualRefresh()}
                  disabled={isPolling}
                  className="mt-4 flex items-center gap-2 rounded-xl bg-[#0b132b] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#1c2a4a] disabled:opacity-50"
                >
                  <RefreshCw size={16} />
                  Check Status Now
                </button>
              )}
            </div>
          )}

          {/* STATE 3: Converting Order */}
          {uiState === 'converting_order' && (
            <div className="flex flex-col items-center justify-center py-8 text-center" data-testid="converting-order-state">
              <Loader2 className="animate-spin text-[#ff8a00]" size={36} />
              <h3 className="mt-4 font-semibold text-gray-900">
                Creating Your Order
              </h3>
              <p className="mt-1 max-w-sm text-sm text-gray-500">
                Payment captured. Finalizing official order record and invoice…
              </p>
              {!isPolling && (
                <button
                  type="button"
                  onClick={() => void manualRefresh()}
                  disabled={isPolling}
                  className="mt-4 flex items-center gap-2 rounded-xl bg-[#0b132b] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#1c2a4a] disabled:opacity-50"
                >
                  <RefreshCw size={16} />
                  Check Status Now
                </button>
              )}
            </div>
          )}

          {/* STATE 4: Converted */}
          {uiState === 'converted' && (
            <div className="flex flex-col items-center justify-center py-8 text-center" data-testid="converted-state">
              <CheckCircle2 className="text-green-600" size={40} />
              <h3 className="mt-4 text-xl font-bold text-gray-900">
                Order Confirmed!
              </h3>
              {session?.convertedOrderDisplayId && (
                <p className="mt-1 font-mono text-sm font-semibold text-gray-700">
                  Ref #{session.convertedOrderDisplayId}
                </p>
              )}
              <p className="mt-2 text-sm text-gray-500">
                Your payment was processed successfully.
              </p>
            </div>
          )}

          {/* STATE 5: Expired */}
          {uiState === 'expired' && (
            <div className="flex flex-col items-center justify-center py-6 text-center" data-testid="expired-state">
              <Clock className="text-amber-600" size={36} />
              <h3 className="mt-3 text-lg font-bold text-gray-900">
                Reservation Expired
              </h3>
              <p className="mt-1 text-sm text-gray-500">
                The checkout hold window expired. Please refresh your quote to verify updated inventory and pricing.
              </p>
              {onQuoteRefreshRequired && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onQuoteRefreshRequired();
                  }}
                  className="mt-5 flex items-center gap-2 rounded-xl bg-[#0b132b] px-6 py-3 font-semibold text-white transition hover:bg-[#1c2a4a]"
                >
                  <RefreshCw size={16} /> Refresh Quote
                </button>
              )}
            </div>
          )}

          {/* STATE 6: Cancelled */}
          {uiState === 'cancelled' && (
            <div className="flex flex-col items-center justify-center py-6 text-center" data-testid="cancelled-state">
              <X className="text-gray-500" size={36} />
              <h3 className="mt-3 text-lg font-bold text-gray-900">
                Payment Cancelled
              </h3>
              <p className="mt-1 text-sm text-gray-500">
                The checkout session was cancelled. Items remain safe in your cart.
              </p>
              <button
                type="button"
                onClick={onClose}
                className="mt-5 rounded-xl border border-gray-300 px-6 py-2.5 font-semibold text-gray-700 hover:bg-gray-100"
              >
                Close
              </button>
            </div>
          )}

          {/* STATE 7: Failed */}
          {uiState === 'failed' && (
            <div className="flex flex-col items-center justify-center py-6 text-center" data-testid="failed-state">
              <AlertCircle className="text-red-600" size={36} />
              <h3 className="mt-3 text-lg font-bold text-gray-900">
                Payment Failed
              </h3>
              <p className="mt-1 text-sm text-gray-500">
                The payment could not be completed. Your cart has been preserved.
              </p>
              <button
                type="button"
                onClick={onClose}
                className="mt-5 rounded-xl bg-[#ff8a00] px-6 py-2.5 font-semibold text-[#0b132b] hover:bg-[#e67c00]"
              >
                Return to Checkout
              </button>
            </div>
          )}

          {/* STATE 8: Conflict / Manual Review */}
          {uiState === 'conflict' && (
            <div className="flex flex-col items-center justify-center py-6 text-center" data-testid="conflict-state">
              <AlertCircle className="text-orange-600" size={36} />
              <h3 className="mt-3 text-lg font-bold text-gray-900">
                Manual Review Required
              </h3>
              <p className="mt-1 text-sm text-gray-500">
                Your payment was submitted and is pending administrative verification. Please contact support quoting Session Reference:{' '}
                <span className="font-mono text-xs font-semibold text-gray-800">{sessionId}</span>.
              </p>
              <button
                type="button"
                onClick={onClose}
                className="mt-5 rounded-xl border border-gray-300 px-6 py-2.5 font-semibold text-gray-700 hover:bg-gray-100"
              >
                Close
              </button>
            </div>
          )}

          {/* STATE 8b: Verification Conflict (Persistent HTTP 409) */}
          {uiState === 'verification_conflict' && (
            <div className="flex flex-col items-center justify-center py-6 text-center" data-testid="verification-conflict-state">
              <AlertCircle className="text-amber-600" size={36} />
              <h3 className="mt-3 text-lg font-bold text-gray-900">
                Verification Conflict
              </h3>
              <p className="mt-1 text-sm text-gray-500">
                A temporary synchronization conflict occurred while verifying your session. Items remain safely in your cart.
              </p>
              <button
                type="button"
                onClick={() => void manualRefresh()}
                disabled={isPolling}
                className="mt-4 flex items-center gap-2 rounded-xl bg-[#0b132b] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#1c2a4a] disabled:opacity-50"
              >
                {isPolling ? <Loader2 className="animate-spin" size={16} /> : <RefreshCw size={16} />}
                Check Status Now
              </button>
            </div>
          )}

          {/* STATE 9: Authentication Required */}
          {uiState === 'authentication_required' && (
            <div className="flex flex-col items-center justify-center py-6 text-center" data-testid="authentication-required-state">
              <AlertCircle className="text-amber-600" size={36} />
              <h3 className="mt-3 text-lg font-bold text-gray-900">
                Authentication Required
              </h3>
              <p className="mt-1 text-sm text-gray-500">
                Your login session has expired. Please sign in to finalize your payment securely.
              </p>
              <button
                type="button"
                onClick={onClose}
                className="mt-5 rounded-xl bg-[#0b132b] px-6 py-2.5 font-semibold text-white hover:bg-[#1c2a4a]"
              >
                Sign In to Continue
              </button>
            </div>
          )}

          {/* STATE 10: Session Not Found */}
          {uiState === 'session_not_found' && (
            <div className="flex flex-col items-center justify-center py-6 text-center" data-testid="session-not-found-state">
              <AlertCircle className="text-red-600" size={36} />
              <h3 className="mt-3 text-lg font-bold text-gray-900">
                Session Not Found
              </h3>
              <p className="mt-1 text-sm text-gray-500">
                This checkout session is no longer active. Items remain safely preserved in your cart.
              </p>
              <button
                type="button"
                onClick={onClose}
                className="mt-5 rounded-xl bg-[#ff8a00] px-6 py-2.5 font-semibold text-[#0b132b] hover:bg-[#e67c00]"
              >
                Return to Cart
              </button>
            </div>
          )}

          {/* STATE 11: Invalid Response */}
          {uiState === 'invalid_response' && (
            <div className="flex flex-col items-center justify-center py-6 text-center" data-testid="invalid-response-state">
              <AlertCircle className="text-red-600" size={36} />
              <h3 className="mt-3 text-lg font-bold text-gray-900">
                Verification Error
              </h3>
              <p className="mt-1 text-sm text-gray-500">
                Received an invalid response from the payment server. Please verify your connection or tap below.
              </p>
              <button
                type="button"
                onClick={() => void manualRefresh()}
                disabled={isPolling}
                className="mt-4 flex items-center gap-2 rounded-xl bg-[#0b132b] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#1c2a4a] disabled:opacity-50"
              >
                {isPolling ? <Loader2 className="animate-spin" size={16} /> : <RefreshCw size={16} />}
                Check Status Now
              </button>
            </div>
          )}

          {/* STATE 12: Polling Paused / Network Recovering */}
          {(uiState === 'polling_paused' || uiState === 'network_recovering') && (
            <div className="flex flex-col items-center justify-center py-6 text-center" data-testid="polling-paused-state">
              <RefreshCw className="text-gray-600" size={32} />
              <h3 className="mt-3 text-base font-bold text-gray-900">
                Verification Paused
              </h3>
              <p className="mt-1 text-sm text-gray-500">
                Automatic status checks paused. Check your connection and tap below to refresh.
              </p>
              <button
                type="button"
                onClick={() => void manualRefresh()}
                disabled={isPolling}
                className="mt-4 flex items-center gap-2 rounded-xl bg-[#0b132b] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#1c2a4a] disabled:opacity-50"
              >
                {isPolling ? <Loader2 className="animate-spin" size={16} /> : <RefreshCw size={16} />}
                Check Status Now
              </button>
            </div>
          )}

          {/* Explicit Cancel Button in Payment Mode */}
          {uiState === 'payment_action_required' && (
            <div className="mt-4 border-t pt-4 text-center">
              <button
                type="button"
                onClick={handleCancel}
                disabled={isCancelling}
                className="text-xs font-medium text-gray-500 hover:text-gray-800 disabled:opacity-50"
              >
                {isCancelling ? 'Cancelling Session…' : 'Cancel and return to cart'}
              </button>
            </div>
          )}

          <p className="mt-6 flex items-center justify-center gap-1 text-center text-xs text-gray-400">
            <ShieldCheck size={12} /> Protected by 256-bit SSL encryption
          </p>
        </div>
      </div>
    </div>
  );
}

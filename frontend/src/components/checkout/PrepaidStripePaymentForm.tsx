'use client';

/**
 * PrepaidStripePaymentForm Component
 * Phase 6D-5B Batch 3: Storefront Prepaid Payment Sheet
 *
 * Implements:
 * 1. Stripe PaymentElement mounting within memory-only clientSecret Elements context
 * 2. Idempotent payment confirmation with confirmPayment and redirect: 'if_required'
 * 3. Safe return_url strictly bounded to `${window.location.origin}/checkout?checkout_return=1`
 * 4. Pre-confirmation paymentSubmittedAt persistence trigger
 * 5. Double-submit prevention and sanitized customer-safe error display
 */

import { useState, type FormEvent } from 'react';
import {
  PaymentElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js';

export interface PrepaidStripePaymentFormProps {
  sessionId: string;
  disabled?: boolean;
  onPaymentSubmitting?: () => Promise<void> | void;
  onPaymentConfirmed: () => void;
  onError?: (message: string) => void;
}

export default function PrepaidStripePaymentForm({
  sessionId,
  disabled = false,
  onPaymentSubmitting,
  onPaymentConfirmed,
  onError,
}: PrepaidStripePaymentFormProps) {
  const stripe = useStripe();
  const elements = useElements();

  const [isReady, setIsReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    if (!stripe || !elements || !isReady || loading || disabled) {
      return;
    }

    setLoading(true);
    setErrorMessage('');

    try {
      // 1. Persist paymentSubmittedAt record before calling confirmPayment
      if (onPaymentSubmitting) {
        await onPaymentSubmitting();
      }

      // 2. Exact approved return URL without exposing secrets or IDs in application query
      const returnUrl = `${window.location.origin}/checkout?checkout_return=1`;

      const result = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: returnUrl,
        },
        redirect: 'if_required',
      });

      if (result.error) {
        const msg = result.error.message || 'Payment authorization failed. Please check card details or try another payment method.';
        setErrorMessage(msg);
        onError?.(msg);
        return;
      }

      // Non-error confirmation: Immediately begin authoritative conversion polling
      onPaymentConfirmed();
    } catch {
      const msg = 'Something went wrong while processing your payment. Please try again.';
      setErrorMessage(msg);
      onError?.(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6" data-testid="prepaid-stripe-payment-form" data-session-id={sessionId}>
      <PaymentElement
        options={{ layout: 'tabs' }}
        onReady={() => setIsReady(true)}
      />

      {errorMessage && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600"
        >
          {errorMessage}
        </div>
      )}

      <button
        type="submit"
        disabled={!stripe || !isReady || loading || disabled}
        className="w-full rounded-xl bg-[#ff8a00] py-4 font-semibold text-[#0b132b] transition hover:bg-[#e67c00] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? 'Processing Secure Payment...' : 'Pay Securely'}
      </button>
    </form>
  );
}

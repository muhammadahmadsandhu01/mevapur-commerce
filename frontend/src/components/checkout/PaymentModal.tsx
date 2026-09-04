"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Elements } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { CreditCard, Loader2, ShieldCheck, X } from "lucide-react";
import { paymentService } from "@/services/payment.service";
import StripePaymentForm from "./StripePaymentForm";
import { useDialogFocusTrap } from "@/hooks/useDialogFocusTrap";

export interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  orderId: string;
  amount: number;
  publishableKey?: string;
  onSubmitted: (paymentId: string) => void;
}

export default function PaymentModal({
  isOpen,
  onClose,
  orderId,
  amount,
  publishableKey,
  onSubmitted,
}: PaymentModalProps) {
  const [loading, setLoading] = useState(false);
  const [clientSecret, setClientSecret] = useState("");
  const [paymentId, setPaymentId] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [retryGeneration, setRetryGeneration] = useState(0);
  const paymentAttemptRef = useRef<{ orderId: string; key: string } | null>(
    null
  );

  const modalRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useDialogFocusTrap({
    isOpen,
    onClose: () => {
      if (!loading) onClose();
    },
    containerRef: modalRef,
    initialFocusRef: closeButtonRef,
  });

  const stripePromise = useMemo(() => {
    const configuredKey = publishableKey
      || process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    return configuredKey ? loadStripe(configuredKey) : null;
  }, [publishableKey]);

  useEffect(() => {
    if (!isOpen) return;

    if (!orderId) return;
    if (paymentAttemptRef.current?.orderId !== orderId) {
      paymentAttemptRef.current = {
        orderId,
        key: `checkout-payment-${globalThis.crypto.randomUUID()}`,
      };
    }
    const paymentAttempt = paymentAttemptRef.current;
    if (!paymentAttempt) return;
    const abortController = new AbortController();

    async function initializePayment() {
      setLoading(true);
      setErrorMessage("");

      try {
        if (!stripePromise) {
          throw new Error("The Stripe publishable key is not configured.");
        }
        const response = await paymentService.createPaymentSession(
          {
            orderId,
            provider: "stripe",
          },
          paymentAttempt.key,
          abortController.signal
        );

        if (abortController.signal.aborted) return;

        setPaymentId(response.data.payment._id);
        setClientSecret(response.data.clientSecret || "");
        if (!response.data.clientSecret) {
          throw new Error("The payment gateway did not return a client secret.");
        }
      } catch {
        if (abortController.signal.aborted) return;
        setErrorMessage(
          "Unable to initialize the payment gateway. Please try again."
        );
      } finally {
        if (!abortController.signal.aborted) setLoading(false);
      }
    }

    void initializePayment();

    return () => {
      abortController.abort();
    };
  }, [isOpen, orderId, retryGeneration, stripePromise]);

  function retryPayment() {
    setErrorMessage("");
    setClientSecret("");
    setPaymentId("");
    setRetryGeneration((current) => current + 1);
  }

  if (!isOpen) return null;

  return (
    <div
      ref={modalRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="payment-modal-title"
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
    >
      <div className="relative w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b bg-gray-50 p-6">
          <div>
            <h2 id="payment-modal-title" className="flex items-center gap-2 text-2xl font-bold text-gray-900">
              <ShieldCheck className="text-[#ff8a00]" size={24} />
              Complete Payment
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              Secure encrypted transaction
            </p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            disabled={loading}
            aria-label="Close payment dialog"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg p-2 transition-colors hover:bg-gray-200 disabled:opacity-50"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6">
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
              <span className="text-3xl font-bold text-[#ff8a00]">
                Rs. {amount.toFixed(2)}
              </span>
            </div>
          </div>

          {loading && !errorMessage && (
            <div className="flex items-center justify-center gap-2 py-10 text-gray-600">
              <Loader2 className="animate-spin" size={20} />
              Initializing secure payment…
            </div>
          )}

          {errorMessage && (
            <div
              role="alert"
              className="space-y-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
            >
              <p>{errorMessage}</p>
              <button
                type="button"
                onClick={retryPayment}
                className="font-semibold underline"
              >
                Try again
              </button>
            </div>
          )}

          {!loading &&
            !errorMessage &&
            clientSecret &&
            paymentId && (
              <Elements
                stripe={stripePromise}
                options={{
                  clientSecret,
                  appearance: {
                    theme: "stripe",
                    variables: { colorPrimary: "#FF8A00" },
                  },
                }}
              >
                <StripePaymentForm
                  paymentId={paymentId}
                  orderId={orderId}
                  onSubmitted={onSubmitted}
                />
              </Elements>
            )}

          <p className="mt-6 flex items-center justify-center gap-1 text-center text-xs text-gray-400">
            <ShieldCheck size={12} /> Protected by 256-bit SSL encryption
          </p>
        </div>
      </div>
    </div>
  );
}

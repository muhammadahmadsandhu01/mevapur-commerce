"use client";

import { FormEvent, useState } from "react";
import {
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";

interface StripePaymentFormProps {
    paymentId: string;
    orderId: string;
    onSubmitted: (paymentId: string) => void;
}

export default function StripePaymentForm({
  paymentId,
  orderId,
  onSubmitted,
}: StripePaymentFormProps) {
  const stripe = useStripe();
  const elements = useElements();

  const [isReady, setIsReady] = useState(false);

  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    if (!stripe || !elements || !isReady) {
        return;
    }

    setLoading(true);
    setErrorMessage("");

    try {
        const { error } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}/payment-result?paymentId=${encodeURIComponent(paymentId)}&orderId=${encodeURIComponent(orderId)}`,
        },
        redirect: "if_required",
        });

        if (error) {
        setErrorMessage(error.message || "Payment failed.");
        return;
        }

        onSubmitted(paymentId);
    } catch {
        setErrorMessage("Something went wrong while processing payment.");
    } finally {
        setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">

        <PaymentElement
          options={{ layout: "tabs" }}
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
        disabled={!stripe || !isReady || loading}
        className="w-full rounded-xl bg-teal-700 py-4 font-semibold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
        {loading ? (
            "Processing Secure Payment..."
        ) : (
            "Pay Securely"
        )}
        </button>

    </form>
    );
}

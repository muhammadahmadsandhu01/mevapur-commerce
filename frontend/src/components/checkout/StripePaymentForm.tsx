"use client";

import { FormEvent, useState, useEffect } from "react";
import {
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";

interface StripePaymentFormProps {
    paymentIntentId: string;
    onSuccess: (paymentIntentId: string) => void;
}

export default function StripePaymentForm({
  paymentIntentId,
  onSuccess,
}: StripePaymentFormProps) {
  const stripe = useStripe();
  const elements = useElements();

  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (!elements) return;

    const paymentElement = elements.getElement("payment");

    if (paymentElement) {
        setIsReady(true);
    }
  }, [elements]);

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
        const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        redirect: "if_required",
        });

        if (error) {
        setErrorMessage(error.message || "Payment failed.");
        return;
        }

        if (!paymentIntent) {
        setErrorMessage("Unable to verify payment.");
        return;
        }

        switch (paymentIntent.status) {
        case "succeeded":
            onSuccess(paymentIntentId);
            break;

        case "processing":
            setErrorMessage(
            "Payment is processing. Please wait a few moments."
            );
            break;

        case "requires_payment_method":
            setErrorMessage(
            "Payment failed. Please use another payment method."
            );
            break;

        default:
            setErrorMessage("Unexpected payment status.");
        }
    } catch (err) {
        if (process.env.NODE_ENV === "development") {
            console.error(err);
        }

        setErrorMessage("Something went wrong while processing payment.");
    } finally {
        setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">

        <PaymentElement options={{layout: "tabs",}}/>

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
            `Pay Rs. ${Number(
                paymentIntentId ? 1 : 1
            ) && ""} Securely`
        )}
        </button>

    </form>
    );
}
"use client";

import { useState, useEffect, useMemo } from "react";
import api from "@/lib/api";
import { verifyStripePayment } from "@/lib/payments/stripe";
import { X, Loader2, CreditCard, Smartphone } from "lucide-react";
import { Elements } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import StripePaymentForm from "./StripePaymentForm";

export interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;

  paymentMethod: "COD" | "visa" | "mastercard" | "jazzcash";

  amount: number;

  onSuccess: (transactionId: string) => void;
}

export default function PaymentModal({

  isOpen,

  onClose,

  paymentMethod,

  amount,

  onSuccess

}: PaymentModalProps) {

  const [loading, setLoading] = useState(false);

  const [clientSecret, setClientSecret] = useState("");
  const [paymentIntentId, setPaymentIntentId] = useState("");
  const stripePromise = useMemo(() => {return loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);}, []);

  if (!isOpen) return null;

  useEffect(() => {
    if (!isOpen) return;

    if (
        paymentMethod === "visa" ||
        paymentMethod === "mastercard"
    ) {
        createStripeIntent();
    }
    }, [isOpen, paymentMethod]);

    async function createStripeIntent() {
    try {
        const { data } = await api.post(
        "/payments/create-payment-intent",
        {
            amount,
            currency: "pkr",
        }
        );

        setClientSecret(data.clientSecret);
        setPaymentIntentId(data.paymentIntentId);
    } catch (error) {
        console.error(error);
    }
  }

  async function handlePayment() {
    setLoading(true);

    try {
        // COD
        if (paymentMethod === "COD") {
        onSuccess(`COD-${Date.now()}`);
        return;
        }

        // JazzCash
        if (paymentMethod === "jazzcash") {
        onSuccess(`JAZZ-${Date.now()}`);
        return;
        }

        // Stripe
        if (
        paymentMethod === "visa" ||
        paymentMethod === "mastercard"
        ) {
        if (!clientSecret) {
            alert("Unable to initialize payment.");
            return;
        }

        /*
            Stripe PaymentElement
            will be mounted here
        */

        onSuccess(paymentIntentId);

        return;
        }
    } finally {
        setLoading(false);
    }
  }

  return (

    <div className="fixed inset-0 z-[9999] bg-black/60 flex items-center justify-center p-4">

      <div className="relative w-full max-w-lg rounded-2xl bg-white shadow-2xl">

        {/* Header */}

        <div className="flex items-center justify-between border-b p-6">

          <div>

            <h2 className="text-2xl font-bold">

              Complete Payment

            </h2>

            <p className="text-gray-500 mt-1">

              Secure encrypted payment

            </p>

          </div>

          <button
            onClick={onClose}
            className="rounded-lg p-2 hover:bg-gray-100"
          >
            <X />
          </button>

        </div>

        {/* Body */}

        <div className="p-6">

          <div className="rounded-xl border p-5 mb-6">

            <div className="flex items-center justify-between">

              <span className="text-gray-600">

                Payment Method

              </span>

              <div className="flex items-center gap-2">

                {paymentMethod === "jazzcash" ? (

                  <Smartphone className="text-purple-600"/>

                ) : (

                  <CreditCard className="text-teal-700"/>

                )}

                <span className="font-semibold capitalize">

                  {paymentMethod}

                </span>

              </div>

            </div>

            <div className="mt-4 flex items-center justify-between">

              <span className="text-gray-600">

                Amount

              </span>

              <span className="text-3xl font-bold text-teal-700">

                Rs. {amount.toFixed(2)}

              </span>

            </div>

          </div>

          {/* Stripe Placeholder */}

          {(paymentMethod === "visa" ||
            paymentMethod === "mastercard") &&
            clientSecret && (
                <Elements
                stripe={stripePromise}
                options={{
                    clientSecret,
                    appearance: {
                    theme: "stripe",
                    },
                }}
                >
                <StripePaymentForm
                    paymentIntentId={paymentIntentId}
                    onSuccess={async (transactionId) => {
                        try {
                            const response = await api.post("/payments/verify", {
                                paymentIntentId: transactionId,
                            });

                            if (
                                response.data.success &&
                                response.data.paymentIntent.status === "succeeded"
                            ) {
                                onSuccess(transactionId);
                            } else {
                                alert("Payment verification failed.");
                            }
                        } catch (err) {
                            console.error(err);
                            alert("Unable to verify payment.");
                        }
                    }}
                />
                </Elements>
            )}

          {/* JazzCash Placeholder */}

          {paymentMethod === "jazzcash" && (

            <div className="rounded-xl border-2 border-dashed border-purple-300 p-8 text-center">

              <Smartphone
                className="mx-auto mb-4 text-purple-700"
                size={40}
              />

              <h3 className="font-bold text-lg">

                JazzCash Checkout

              </h3>

              <p className="text-gray-500 mt-2">

                JazzCash SDK / Redirect screen will appear here.

              </p>

            </div>

          )}

          {(paymentMethod === "COD" ||
            paymentMethod === "jazzcash") && (
            <button
                onClick={handlePayment}
                disabled={loading}
                className="mt-8 w-full rounded-xl bg-teal-700 py-4 text-lg font-bold text-white hover:bg-teal-800 disabled:opacity-60"
            >
                {loading ? (
                <span className="flex justify-center">
                    <Loader2 className="animate-spin" />
                </span>
                ) : (
                "Continue Payment"
                )}
            </button>
          )}

          <p className="mt-4 text-center text-sm text-gray-500">

            Protected with industry-standard encryption.

          </p>

        </div>

      </div>

    </div>

  );

}
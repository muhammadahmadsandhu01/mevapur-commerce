"use client";

import { useState, useEffect, useMemo } from "react";
import api from "@/lib/api";
import { X, Loader2, CreditCard, Smartphone, ShieldCheck } from "lucide-react";
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
  onSuccess,
}: PaymentModalProps) {
  const [loading, setLoading] = useState(false);
  const [clientSecret, setClientSecret] = useState("");
  const [paymentIntentId, setPaymentIntentId] = useState("");

  // Memoize Stripe promise to avoid re-initialization
  const stripePromise = useMemo(
    () => loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!),
    []
  );

  if (!isOpen) return null;

  useEffect(() => {
    if (!isOpen) return;

    // Only initialize Stripe for card payments
    if (paymentMethod === "visa" || paymentMethod === "mastercard") {
      createStripeIntent();
    }
  }, [isOpen, paymentMethod]);

  async function createStripeIntent() {
    try {
      setLoading(true);
      const { data } = await api.post("/payments/create-payment-intent", {
        amount: Math.round(amount), // Ensure integer for Stripe
        currency: "pkr",
      });

      setClientSecret(data.clientSecret);
      setPaymentIntentId(data.paymentIntentId);
    } catch (error) {
      console.error("Stripe Intent Error:", error);
      alert("Unable to initialize payment gateway.");
      onClose();
    } finally {
      setLoading(false);
    }
  }

  async function handlePayment() {
    setLoading(true);

    try {
      // --- YOUR EXACT LOGIC PRESERVED ---
      
      // COD
      if (paymentMethod === "COD") {
        // Generating timestamp ID as per your requirement
        onSuccess(`COD-${Date.now()}`);
        return;
      }

      // JazzCash
      if (paymentMethod === "jazzcash") {
        // Generating timestamp ID as per your requirement
        onSuccess(`JAZZ-${Date.now()}`);
        return;
      }

      // Stripe (Visa/Mastercard)
      if (paymentMethod === "visa" || paymentMethod === "mastercard") {
        if (!clientSecret) {
          alert("Unable to initialize payment.");
          return;
        }
        // For Stripe, we wait for the StripePaymentForm to call onSuccess
        // This button is just a fallback or confirmation trigger if needed
        // But typically Stripe form handles the submission. 
        // If you want this button to just pass the ID immediately (risky without verification):
        // onSuccess(paymentIntentId); 
        // BUT best practice is letting StripePaymentForm handle it.
        // So for now, we leave this empty or show instructions if needed.
        return;
      }
    } catch (error) {
      console.error("Payment Error:", error);
      alert("Payment failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg rounded-2xl bg-white shadow-2xl overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b p-6 bg-gray-50">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <ShieldCheck className="text-teal-600" size={24} />
              Complete Payment
            </h2>
            <p className="text-gray-500 text-sm mt-1">
              Secure encrypted transaction
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={loading}
            className="rounded-lg p-2 hover:bg-gray-200 transition-colors disabled:opacity-50"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6">
          <div className="rounded-xl border bg-gray-50 p-5 mb-6">
            <div className="flex items-center justify-between mb-4">
              <span className="text-gray-600 font-medium">Payment Method</span>
              <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border shadow-sm">
                {paymentMethod === "jazzcash" ? (
                  <Smartphone className="text-purple-600" size={18} />
                ) : paymentMethod === "COD" ? (
                  <span className="text-xl">💵</span>
                ) : (
                  <CreditCard className="text-teal-700" size={18} />
                )}
                <span className="font-bold text-gray-800 capitalize">
                  {paymentMethod === "visa" || paymentMethod === "mastercard" ? "Card" : paymentMethod}
                </span>
              </div>
            </div>
            <div className="flex items-center justify-between pt-4 border-t border-gray-200">
              <span className="text-gray-600">Total Amount</span>
              <span className="text-3xl font-bold text-teal-700">
                Rs. {amount.toFixed(2)}
              </span>
            </div>
          </div>

          {/* Stripe Integration */}
          {(paymentMethod === "visa" || paymentMethod === "mastercard") && clientSecret ? (
            <Elements
              stripe={stripePromise}
              options={{
                clientSecret,
                appearance: { theme: "stripe", variables: { colorPrimary: "#0f766e" } },
              }}
            >
              <StripePaymentForm
                paymentIntentId={paymentIntentId}
                onSuccess={(transactionId) => {
                  // Verification happens inside StripePaymentForm, then this is called
                  onSuccess(transactionId);
                }}
              />
            </Elements>
          ) : (
            <div className="space-y-4">
              {/* JazzCash Placeholder */}
              {paymentMethod === "jazzcash" && (
                <div className="rounded-xl border-2 border-dashed border-purple-300 p-8 text-center bg-purple-50">
                  <Smartphone className="mx-auto mb-4 text-purple-700" size={40} />
                  <h3 className="font-bold text-lg text-purple-900">JazzCash Checkout</h3>
                  <p className="text-gray-600 mt-2 text-sm">
                    Redirecting to secure JazzCash gateway...
                  </p>
                </div>
              )}

              {/* Action Button for COD & JazzCash */}
              {(paymentMethod === "COD" || paymentMethod === "jazzcash") && (
                <button
                  onClick={handlePayment}
                  disabled={loading}
                  className="w-full rounded-xl bg-teal-700 py-4 text-lg font-bold text-white hover:bg-teal-800 disabled:opacity-60 disabled:cursor-not-allowed transition-all shadow-lg shadow-teal-700/20 flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <Loader2 className="animate-spin" size={20} /> Processing...
                    </>
                  ) : (
                    <>
                      {paymentMethod === "jazzcash" ? "Pay with JazzCash" : "Confirm COD Order"}
                    </>
                  )}
                </button>
              )}
            </div>
          )}

          <p className="mt-6 text-center text-xs text-gray-400 flex items-center justify-center gap-1">
            <ShieldCheck size={12} /> Protected by 256-bit SSL encryption
          </p>
        </div>
      </div>
    </div>
  );
}
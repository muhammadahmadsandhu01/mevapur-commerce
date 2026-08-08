"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  Loader2,
  RefreshCw,
} from "lucide-react";
import {
  paymentService,
  type PaymentSummary,
} from "@/services/payment.service";
import { secureOrderService } from "@/services/order.service";
import { useCartStore } from "@/store/cartStore";

const TERMINAL_STATUSES = new Set([
  "Completed",
  "Failed",
  "Cancelled",
  "PartiallyRefunded",
  "Refunded",
]);

function PaymentResultContent() {
  const searchParams = useSearchParams();
  const clearCart = useCartStore((state) => state.clearCart);
  const paymentId = searchParams.get("paymentId") || "";
  const orderId = searchParams.get("orderId") || "";
  const [payment, setPayment] = useState<PaymentSummary | null>(null);
  const [orderPaymentStatus, setOrderPaymentStatus] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [retryGeneration, setRetryGeneration] = useState(0);
  const invalidLinkMessage = !paymentId || !orderId
    ? "The payment result link is incomplete."
    : "";
  const displayedError = invalidLinkMessage || errorMessage;

  useEffect(() => {
    if (!paymentId || !orderId) {
      return;
    }

    const safeQuery = new URLSearchParams({ paymentId, orderId });
    window.history.replaceState(
      null,
      "",
      `/payment-result?${safeQuery.toString()}`
    );
    clearCart();

    const abortController = new AbortController();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;

    async function pollPayment() {
      try {
        const [current, order] = await Promise.all([
          paymentService.getPayment(paymentId, abortController.signal),
          secureOrderService.getOrder(orderId, abortController.signal),
        ]);
        if (abortController.signal.aborted) return;

        setPayment(current);
        setOrderPaymentStatus(order.paymentStatus);
        setErrorMessage("");
        attempts += 1;

        const reconciliationComplete = (
          current.status === "Completed" && order.paymentStatus === "Paid"
        ) || (
          TERMINAL_STATUSES.has(current.status)
          && current.status !== "Completed"
        );
        if (!reconciliationComplete && attempts < 30) {
          timeout = setTimeout(pollPayment, 2000);
        }
      } catch {
        if (abortController.signal.aborted) return;
        attempts += 1;
        if (attempts < 5) {
          timeout = setTimeout(pollPayment, 2000);
        } else {
          setErrorMessage(
            "We could not refresh the provider-confirmed payment status."
          );
        }
      }
    }

    void pollPayment();

    return () => {
      abortController.abort();
      if (timeout) clearTimeout(timeout);
    };
  }, [clearCart, orderId, paymentId, retryGeneration]);

  const isCompleted = (
    payment?.status === "Completed" && orderPaymentStatus === "Paid"
  )
    || payment?.status === "PartiallyRefunded"
    || payment?.status === "Refunded";
  const isFailed = payment?.status === "Failed"
    || payment?.status === "Cancelled";

  return (
    <main className="min-h-[80vh] bg-slate-50 px-4 py-16">
      <section className="mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        {!payment && !displayedError && (
          <>
            <Loader2
              aria-hidden="true"
              className="mx-auto mb-4 animate-spin text-teal-700"
              size={44}
            />
            <h1 className="text-2xl font-bold text-slate-900">
              Checking payment status
            </h1>
            <p className="mt-2 text-slate-600">
              We are waiting for secure provider confirmation.
            </p>
          </>
        )}

        {payment && !isCompleted && !isFailed && (
          <>
            <Clock3
              aria-hidden="true"
              className="mx-auto mb-4 text-amber-600"
              size={48}
            />
            <h1 className="text-2xl font-bold text-slate-900">
              Payment is processing
            </h1>
            <p className="mt-2 text-slate-600">
              Your order exists, but payment is not final until the backend
              receives verified provider confirmation.
            </p>
          </>
        )}

        {payment && isCompleted && (
          <>
            <CheckCircle2
              aria-hidden="true"
              className="mx-auto mb-4 text-teal-700"
              size={48}
            />
            <h1 className="text-2xl font-bold text-slate-900">
              Payment confirmed
            </h1>
            <p className="mt-2 text-slate-600">
              The verified provider event has been reconciled with your order.
            </p>
          </>
        )}

        {payment && isFailed && (
          <>
            <AlertCircle
              aria-hidden="true"
              className="mx-auto mb-4 text-red-600"
              size={48}
            />
            <h1 className="text-2xl font-bold text-slate-900">
              Payment was not completed
            </h1>
            <p className="mt-2 text-slate-600">
              Your order was not marked paid. You can return to your orders
              before trying again.
            </p>
          </>
        )}

        {payment && (
          <dl className="mt-6 grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-4 text-left text-sm">
            <dt className="text-slate-500">Status</dt>
            <dd className="text-right font-semibold text-slate-900">
              {payment.status}
            </dd>
            <dt className="text-slate-500">Amount</dt>
            <dd className="text-right font-semibold text-slate-900">
              Rs. {payment.amount.toFixed(2)}
            </dd>
            <dt className="text-slate-500">Provider</dt>
            <dd className="text-right font-semibold capitalize text-slate-900">
              {payment.provider}
            </dd>
            <dt className="text-slate-500">Order payment</dt>
            <dd className="text-right font-semibold text-slate-900">
              {orderPaymentStatus || "Pending"}
            </dd>
          </dl>
        )}

        {displayedError && (
          <div
            role="alert"
            className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
          >
            {displayedError}
          </div>
        )}

        <div className="mt-8 flex flex-wrap justify-center gap-3">
          {errorMessage && (
            <button
              type="button"
              onClick={() => {
                setErrorMessage("");
                setRetryGeneration((value) => value + 1);
              }}
              className="inline-flex items-center gap-2 rounded-lg bg-teal-700 px-5 py-3 font-semibold text-white hover:bg-teal-800"
            >
              <RefreshCw size={18} /> Check again
            </button>
          )}
          <Link
            href={`/orders/${encodeURIComponent(orderId)}`}
            className="rounded-lg border border-teal-700 px-5 py-3 font-semibold text-teal-700 hover:bg-teal-50"
          >
            View order
          </Link>
        </div>
      </section>
    </main>
  );
}

export default function PaymentResultPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[80vh] items-center justify-center">
          <Loader2 className="animate-spin text-teal-700" size={40} />
        </div>
      }
    >
      <PaymentResultContent />
    </Suspense>
  );
}

'use client';
export const dynamic = 'force-dynamic';

import { Suspense, useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  Loader2,
  RefreshCw,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react';
import { paymentService, type PaymentSummary } from '@/services/payment.service';
import { secureOrderService } from '@/services/order.service';
import { useCartStore } from '@/store/cartStore';
import { formatMoney } from '@/lib/money';

const TERMINAL_STATUSES = new Set([
  'Completed',
  'Failed',
  'Cancelled',
  'PartiallyRefunded',
  'Refunded',
]);

function PaymentResultContent() {
  const searchParams = useSearchParams();
  const clearCart = useCartStore((state) => state.clearCart);

  const rawPaymentId = searchParams.get('paymentId') || '';
  const rawOrderId = searchParams.get('orderId') || '';
  const paymentId = rawPaymentId ? decodeURIComponent(rawPaymentId) : '';
  const orderId = rawOrderId ? decodeURIComponent(rawOrderId) : '';

  const [payment, setPayment] = useState<PaymentSummary | null>(null);
  const [orderPaymentStatus, setOrderPaymentStatus] = useState('');
  const [pollingExpired, setPollingExpired] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [retryGeneration, setRetryGeneration] = useState(0);

  const cartClearedRef = useRef(false);

  useEffect(() => {
    if (!paymentId || !orderId) return;

    if (!cartClearedRef.current) {
      clearCart();
      cartClearedRef.current = true;
    }

    const abortController = new AbortController();
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;
    const maxAttempts = 30;

    async function pollPaymentStatus() {
      if (document.hidden) {
        // If tab is backgrounded, schedule retry without incrementing attempt count
        timeoutId = setTimeout(pollPaymentStatus, 3000);
        return;
      }

      try {
        const [currentPayment, currentOrder] = await Promise.all([
          paymentService.getPayment(paymentId, abortController.signal),
          secureOrderService.getOrder(orderId, abortController.signal),
        ]);

        if (abortController.signal.aborted) return;

        setPayment(currentPayment);
        setOrderPaymentStatus(currentOrder.paymentStatus);
        setErrorMessage('');
        attempts += 1;

        const isReconciled =
          (currentPayment.status === 'Completed' && currentOrder.paymentStatus === 'Paid') ||
          (TERMINAL_STATUSES.has(currentPayment.status) && currentPayment.status !== 'Completed');

        if (!isReconciled) {
          if (attempts < maxAttempts) {
            timeoutId = setTimeout(pollPaymentStatus, 2000);
          } else {
            setPollingExpired(true);
          }
        }
      } catch {
        if (abortController.signal.aborted) return;
        attempts += 1;
        if (attempts < maxAttempts) {
          timeoutId = setTimeout(pollPaymentStatus, 2500);
        } else {
          setPollingExpired(true);
        }
      }
    }

    const handleVisibilityChange = () => {
      if (!document.hidden && !pollingExpired) {
        if (timeoutId) clearTimeout(timeoutId);
        void pollPaymentStatus();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    void pollPaymentStatus();

    return () => {
      abortController.abort();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [clearCart, orderId, paymentId, retryGeneration, pollingExpired]);

  if (!paymentId || !orderId) {
    return (
      <main className="min-h-[70vh] max-w-lg mx-auto flex flex-col items-center justify-center p-6 text-center bg-slate-50">
        <AlertCircle size={40} className="text-amber-600 mb-4" />
        <h1 className="text-xl font-extrabold text-slate-900 mb-2">Incomplete Payment Link</h1>
        <p className="text-xs text-slate-600 mb-6">
          The payment verification URL is missing essential reference parameters.
        </p>
        <Link
          href="/orders"
          className="px-5 py-2.5 bg-[#0b132b] text-white font-bold text-xs rounded-xl hover:bg-slate-800 transition"
        >
          View Your Orders
        </Link>
      </main>
    );
  }

  const isCompleted =
    (payment?.status === 'Completed' && orderPaymentStatus === 'Paid') ||
    payment?.status === 'PartiallyRefunded' ||
    payment?.status === 'Refunded';

  const isFailed = payment?.status === 'Failed' || payment?.status === 'Cancelled';

  return (
    <main className="min-h-[80vh] bg-slate-50 px-4 py-16">
      <section className="mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-xs">
        {!payment && !errorMessage && (
          <div className="space-y-3">
            <Loader2 aria-hidden="true" className="mx-auto animate-spin text-[#ff8a00]" size={44} />
            <h1 className="text-xl font-extrabold text-slate-900">Verifying Payment Status</h1>
            <p className="text-xs text-slate-600">
              Synchronizing authoritative provider event with your order ledger...
            </p>
          </div>
        )}

        {payment && !isCompleted && !isFailed && !pollingExpired && (
          <div className="space-y-3">
            <Clock3 aria-hidden="true" className="mx-auto text-amber-600" size={48} />
            <h1 className="text-xl font-extrabold text-slate-900">Payment In Progress</h1>
            <p className="text-xs text-slate-600 max-w-md mx-auto leading-relaxed">
              Your order exists in our system. We are awaiting final provider confirmation before marking the payment confirmed.
            </p>
          </div>
        )}

        {payment && isCompleted && (
          <div className="space-y-3">
            <CheckCircle2 aria-hidden="true" className="mx-auto text-emerald-600" size={48} />
            <h1 className="text-2xl font-black text-slate-900">Payment Confirmed</h1>
            <p className="text-xs text-slate-600 max-w-md mx-auto leading-relaxed">
              Your payment transaction has been verified and matched with your order record.
            </p>
          </div>
        )}

        {payment && isFailed && (
          <div className="space-y-3">
            <AlertCircle aria-hidden="true" className="mx-auto text-rose-600" size={48} />
            <h1 className="text-2xl font-black text-slate-900">Payment Not Completed</h1>
            <p className="text-xs text-slate-600 max-w-md mx-auto leading-relaxed">
              The payment attempt was not completed by the provider. You can review your order or retry payment.
            </p>
          </div>
        )}

        {pollingExpired && !isCompleted && !isFailed && (
          <div className="space-y-3">
            <Clock3 aria-hidden="true" className="mx-auto text-amber-600" size={48} />
            <h1 className="text-xl font-extrabold text-slate-900">Verification in Progress</h1>
            <p className="text-xs text-slate-600 max-w-md mx-auto leading-relaxed">
              Payment verification is taking longer than expected. Your order remains safely recorded in your account.
            </p>
          </div>
        )}

        {/* Breakdown Card */}
        {payment && (
          <dl className="mt-6 grid grid-cols-2 gap-2.5 rounded-xl bg-slate-50 p-4 text-left text-xs border border-slate-200">
            <dt className="text-slate-500 font-semibold">Payment Status:</dt>
            <dd className="text-right font-extrabold text-slate-900">{payment.status}</dd>

            <dt className="text-slate-500 font-semibold">Charged Amount:</dt>
            <dd className="text-right font-black text-slate-900">
              {formatMoney(payment.amount, payment.currency)}
            </dd>

            <dt className="text-slate-500 font-semibold">Provider:</dt>
            <dd className="text-right font-extrabold capitalize text-slate-900">
              {payment.providerDisplayName || payment.provider}
            </dd>

            <dt className="text-slate-500 font-semibold">Order Payment Status:</dt>
            <dd className="text-right font-extrabold text-slate-900">
              {orderPaymentStatus || 'Pending'}
            </dd>
          </dl>
        )}

        {/* Actions */}
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          {(pollingExpired || errorMessage) && (
            <button
              type="button"
              onClick={() => {
                setPollingExpired(false);
                setErrorMessage('');
                setRetryGeneration((v) => v + 1);
              }}
              className="inline-flex items-center gap-2 rounded-xl bg-[#ff8a00] hover:bg-[#ffab45] px-5 py-2.5 text-xs font-bold text-[#0b132b] shadow-2xs transition"
            >
              <RefreshCw size={14} /> Check Status Again
            </button>
          )}

          <Link
            href={`/orders/${encodeURIComponent(orderId)}`}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 px-5 py-2.5 text-xs font-bold text-slate-800 shadow-2xs transition"
          >
            View Order Details <ArrowRight size={14} />
          </Link>
        </div>

        <div className="mt-6 pt-5 border-t border-slate-100 flex items-center justify-center gap-2 text-[11px] text-slate-500 font-semibold">
          <ShieldCheck size={14} className="text-emerald-700" />
          <span>Authoritative Backend Reconciled Record</span>
        </div>
      </section>
    </main>
  );
}

export default function PaymentResultPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[80vh] items-center justify-center bg-slate-50">
          <Loader2 className="animate-spin text-[#ff8a00]" size={40} />
        </div>
      }
    >
      <PaymentResultContent />
    </Suspense>
  );
}

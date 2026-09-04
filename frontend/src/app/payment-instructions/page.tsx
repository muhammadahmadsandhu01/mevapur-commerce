'use client';
export const dynamic = 'force-dynamic';

import { FormEvent, Suspense, useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  Loader2,
  ShieldCheck,
  Building2,
  PhoneCall,
  Copy,
  CheckCircle2,
  AlertCircle,
  ArrowLeft,
  Clock3,
  XCircle,
} from 'lucide-react';
import { paymentService, PaymentSummary } from '@/services/payment.service';
import { formatMoney } from '@/lib/money';
import BankTransferInstructions from '@/modules/payments/providers/bank-transfer/BankTransferInstructions';
import RaastInstructions from '@/modules/payments/providers/raast/RaastInstructions';
import Toast from '@/components/Toast';

function PaymentInstructionsContent() {
  const params = useSearchParams();
  const paymentIdParam = params.get('paymentId') || '';
  const orderIdParam = params.get('orderId') || '';

  const [payment, setPayment] = useState<PaymentSummary | null>(null);
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [errorMessage, setErrorMessage] = useState('');

  const loadPaymentData = useCallback(async () => {
    const controller = new AbortController();
    setLoading(true);
    setErrorMessage('');

    try {
      if (paymentIdParam) {
        const data = await paymentService.getPayment(paymentIdParam, controller.signal);
        setPayment(data);
      } else if (orderIdParam) {
        const data = await paymentService.getPaymentForOrder(orderIdParam, controller.signal);
        if (data) {
          setPayment(data);
        } else {
          setErrorMessage('Payment instructions could not be located for this order.');
        }
      } else {
        setErrorMessage('No payment or order reference provided.');
      }
    } catch {
      setErrorMessage('Payment instructions could not be loaded. Please ensure you are signed in.');
    } finally {
      setLoading(false);
    }
  }, [paymentIdParam, orderIdParam]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadPaymentData();
    }, 0);
    return () => clearTimeout(timer);
  }, [loadPaymentData]);

  const handleCopy = (text: string, fieldName: string) => {
    try {
      navigator.clipboard.writeText(text);
      setCopiedField(fieldName);
      setTimeout(() => setCopiedField(null), 2000);
    } catch {
      setToast({ message: 'Failed to copy to clipboard', type: 'info' });
    }
  };

  const handleSubmitReference = async (event: FormEvent) => {
    event.preventDefault();
    if (!payment || submitting) return;

    const trimmedRef = reference.trim();
    if (trimmedRef.length < 4) {
      setToast({ message: 'Transaction reference must be at least 4 characters.', type: 'error' });
      return;
    }

    setSubmitting(true);
    try {
      const updated = await paymentService.submitManualPayment(
        payment._id,
        trimmedRef,
        note.trim() || undefined
      );
      setPayment(updated);
      setToast({
        message: 'Transfer reference submitted successfully. It is now awaiting verification.',
        type: 'success',
      });
      setReference('');
      setNote('');
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'Failed to submit transaction reference. Please check and retry.';
      setToast({ message: msg, type: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center p-4 bg-slate-50">
        <Loader2 className="w-10 h-10 text-[#ff8a00] animate-spin mb-3" />
        <p className="text-xs font-semibold text-slate-700">Loading payment instructions...</p>
      </div>
    );
  }

  if (errorMessage || !payment || !payment.customerAction) {
    return (
      <div className="min-h-[70vh] max-w-lg mx-auto flex flex-col items-center justify-center p-6 text-center bg-slate-50">
        <AlertCircle size={40} className="text-amber-600 mb-4" />
        <h1 className="text-xl font-extrabold text-slate-900 mb-2">Instructions Unavailable</h1>
        <p className="text-xs text-slate-600 mb-6">
          {errorMessage || 'Manual payment details are not active or not applicable for this payment record.'}
        </p>
        <Link
          href={orderIdParam ? `/orders/${encodeURIComponent(orderIdParam)}` : '/orders'}
          className="px-5 py-2.5 bg-[#0b132b] text-white font-bold text-xs rounded-xl hover:bg-slate-800 transition"
        >
          View Order Details
        </Link>
      </div>
    );
  }

  const isAwaitingPayment = payment.status === 'AwaitingCustomerPayment';
  const isAwaitingVerification = payment.status === 'AwaitingVerification';
  const isCompleted = payment.status === 'Completed';
  const isRejected = payment.status === 'Rejected';

  return (
    <div className="min-h-screen bg-slate-50 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Breadcrumb Navigation */}
        <Link
          href={orderIdParam ? `/orders/${encodeURIComponent(orderIdParam)}` : '/orders'}
          className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-700 hover:text-[#9a3412] transition"
        >
          <ArrowLeft size={14} /> Back to Order
        </Link>

        {/* Card Header */}
        <article className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-xs space-y-6">
          <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
            <div className="w-10 h-10 rounded-xl bg-orange-100 text-[#0b132b] flex items-center justify-center shrink-0">
              {payment.provider === 'raast' ? <PhoneCall size={20} /> : <Building2 size={20} />}
            </div>
            <div>
              <h1 className="text-xl font-extrabold text-slate-900">
                {payment.providerDisplayName || (payment.provider === 'raast' ? 'Raast Instant Transfer' : 'Direct Bank Transfer')}
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Exact Payable Amount: <strong className="text-slate-900 font-black">{formatMoney(payment.amount, payment.currency)}</strong>
              </p>
            </div>
          </div>

          {/* Customer Instruction Text */}
          {payment.customerAction.message && (
            <p className="text-xs text-slate-700 bg-slate-50 p-3 rounded-xl border border-slate-200 leading-relaxed">
              {payment.customerAction.message}
            </p>
          )}

          {/* Bank / Raast Account Details Box */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-5 space-y-3">
            <h2 className="text-xs font-black uppercase tracking-wider text-slate-900 pb-2 border-b border-slate-200">
              Designated Merchant Account Details
            </h2>

            {payment.provider === 'bank_transfer' ? (
              <BankTransferInstructions action={payment.customerAction} />
            ) : (
              <RaastInstructions action={payment.customerAction} />
            )}

            {/* Accessible Copy Button for primary reference */}
            {payment.customerAction.accountReference && (
              <button
                type="button"
                onClick={() => handleCopy(payment.customerAction?.accountReference || '', 'accountRef')}
                className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-800 hover:bg-slate-100 transition shadow-2xs"
              >
                <Copy size={13} />
                {copiedField === 'accountRef' ? 'Account Number Copied!' : 'Copy Account Number / IBAN'}
              </button>
            )}

            {payment.customerAction.raastId && (
              <button
                type="button"
                onClick={() => handleCopy(payment.customerAction?.raastId || '', 'raastId')}
                className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-800 hover:bg-slate-100 transition shadow-2xs"
              >
                <Copy size={13} />
                {copiedField === 'raastId' ? 'Raast ID Copied!' : 'Copy Raast ID'}
              </button>
            )}
          </div>

          {/* Status-specific Panels */}
          {isCompleted && (
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start gap-3">
              <CheckCircle2 size={20} className="text-emerald-700 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-bold text-emerald-900">Payment Confirmed</p>
                <p className="text-[11px] text-emerald-800 mt-0.5">
                  Your manual payment was verified and authoritatively settled.
                </p>
              </div>
            </div>
          )}

          {isAwaitingVerification && (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl space-y-2">
              <div className="flex items-center gap-2 text-amber-950 font-extrabold text-xs">
                <Clock3 size={16} className="text-amber-700" />
                <span>Verification in Progress</span>
              </div>
              <p className="text-xs text-slate-700 leading-relaxed">
                Your transaction proof (<span className="font-mono font-bold text-slate-900">{payment.customerReferenceMasked}</span>) has been received. Our finance team is reviewing your transfer.
              </p>
              <div className="flex items-center gap-1.5 text-[11px] text-emerald-800 font-semibold pt-1">
                <ShieldCheck size={14} />
                <span>Submission logged on {payment.customerSubmittedAt ? new Date(payment.customerSubmittedAt).toLocaleString() : 'recently'}</span>
              </div>
            </div>
          )}

          {isRejected && (
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-3">
              <XCircle size={20} className="text-rose-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-bold text-rose-900">Submission Rejected</p>
                <p className="text-[11px] text-rose-800 mt-0.5">
                  The previous reference could not be matched. Please ensure the exact transfer amount was sent.
                </p>
              </div>
            </div>
          )}

          {/* Reference Submission Form (Active only when AwaitingCustomerPayment or Rejected) */}
          {(isAwaitingPayment || isRejected) && (
            <form onSubmit={handleSubmitReference} className="space-y-4 pt-2">
              <div className="border-t border-slate-100 pt-4">
                <h3 className="text-sm font-extrabold text-slate-900 mb-1">
                  Submit Your Payment Proof
                </h3>
                <p className="text-xs text-slate-600 mb-4">
                  Enter the transaction reference / STAN / RRN provided by your bank app or 1Link slip.
                </p>
              </div>

              <div>
                <label htmlFor="transactionReference" className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-1.5">
                  Transaction Reference / ID <span className="text-rose-600">*</span>
                </label>
                <input
                  type="text"
                  id="transactionReference"
                  required
                  minLength={4}
                  maxLength={100}
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="e.g. 202609041234567 or FT26247..."
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 focus:border-[#ff8a00] focus:ring-1 focus:ring-[#ff8a00] text-xs font-mono text-slate-900 outline-none bg-white font-semibold"
                />
              </div>

              <div>
                <label htmlFor="customerNote" className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-1.5">
                  Optional Note / Sender Bank Name
                </label>
                <textarea
                  id="customerNote"
                  rows={2}
                  maxLength={500}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="e.g. Sent via Meezan Bank App from Account 0102..."
                  className="w-full px-3.5 py-2 rounded-lg border border-slate-300 focus:border-[#ff8a00] focus:ring-1 focus:ring-[#ff8a00] text-xs text-slate-900 outline-none bg-white font-normal"
                />
              </div>

              <button
                type="submit"
                disabled={submitting || reference.trim().length < 4}
                className="w-full flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-[#0b132b] hover:bg-slate-800 text-white font-bold text-xs shadow-sm transition disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <Loader2 size={14} className="animate-spin" /> Submitting Reference...
                  </>
                ) : (
                  'Submit Reference for Verification'
                )}
              </button>
            </form>
          )}
        </article>
      </div>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}

export default function PaymentInstructionsPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[70vh] flex flex-col items-center justify-center p-4 bg-slate-50">
          <Loader2 className="w-10 h-10 text-[#ff8a00] animate-spin mb-3" />
          <p className="text-xs text-slate-600 font-semibold">Loading instructions...</p>
        </div>
      }
    >
      <PaymentInstructionsContent />
    </Suspense>
  );
}

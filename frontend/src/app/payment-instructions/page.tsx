'use client';

import { FormEvent, Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Loader2, ShieldCheck } from 'lucide-react';
import { paymentService, PaymentSummary } from '@/services/payment.service';
import BankTransferInstructions from '@/modules/payments/providers/bank-transfer/BankTransferInstructions';
import RaastInstructions from '@/modules/payments/providers/raast/RaastInstructions';

function PaymentInstructionsContent() {
  const params = useSearchParams();
  const paymentId = params.get('paymentId') || '';
  const orderId = params.get('orderId') || '';
  const [payment, setPayment] = useState<PaymentSummary | null>(null);
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(Boolean(paymentId));
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    if (!paymentId) {
      return controller.abort.bind(controller);
    }
    paymentService.getPayment(paymentId, controller.signal)
      .then(setPayment)
      .catch(() => setMessage('Payment instructions could not be loaded.'))
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [paymentId]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!paymentId || reference.trim().length < 4) return;
    setSubmitting(true);
    setMessage('');
    try {
      const updated = await paymentService.submitManualPayment(
        paymentId,
        reference,
        note
      );
      setPayment(updated);
      setMessage('Transfer submitted. It is now awaiting verification.');
    } catch {
      setMessage('The transfer reference could not be submitted.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <main className="grid min-h-[70vh] place-items-center"><Loader2 className="animate-spin" /></main>;
  }
  if (!payment?.customerAction) {
    return (
      <main className="mx-auto max-w-xl p-8">
        <h1 className="text-2xl font-bold">Payment instructions unavailable</h1>
        <Link href={orderId ? `/orders/${orderId}` : '/orders'} className="mt-4 inline-block text-teal-700 underline">
          View order
        </Link>
      </main>
    );
  }

  const submitted = payment.status === 'AwaitingVerification';
  return (
    <main className="mx-auto max-w-2xl p-6 py-12">
      <section className="rounded-2xl border bg-white p-7 shadow-sm">
        <h1 className="text-2xl font-bold">{payment.providerDisplayName}</h1>
        <p className="mt-2 text-gray-600">{payment.customerAction.message}</p>
        <div className="my-6 rounded-xl bg-gray-50 p-5">
          {payment.provider === 'bank_transfer'
            ? <BankTransferInstructions action={payment.customerAction} />
            : <RaastInstructions action={payment.customerAction} />}
          <p className="mt-4 font-bold">Amount: Rs. {payment.amount.toFixed(2)}</p>
        </div>

        {submitted ? (
          <div className="rounded-xl border border-teal-200 bg-teal-50 p-4 text-teal-900">
            <ShieldCheck className="mr-2 inline" size={18} />
            Awaiting verification ({payment.customerReferenceMasked})
          </div>
        ) : (
          <form onSubmit={submit} className="grid gap-4">
            <label className="grid gap-1 text-sm font-semibold">
              Transaction reference
              <input
                value={reference}
                onChange={(event) => setReference(event.target.value)}
                minLength={4}
                maxLength={100}
                required
                className="rounded-lg border p-3 font-normal"
              />
            </label>
            <label className="grid gap-1 text-sm font-semibold">
              Optional note
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                maxLength={300}
                className="rounded-lg border p-3 font-normal"
              />
            </label>
            <button disabled={submitting} className="rounded-lg bg-teal-700 p-3 font-semibold text-white disabled:opacity-50">
              {submitting ? 'Submitting…' : 'I have transferred'}
            </button>
          </form>
        )}
        {message && <p role="status" className="mt-4 text-sm">{message}</p>}
      </section>
    </main>
  );
}

export default function PaymentInstructionsPage() {
  return (
    <Suspense fallback={<main className="grid min-h-[70vh] place-items-center"><Loader2 className="animate-spin" /></main>}>
      <PaymentInstructionsContent />
    </Suspense>
  );
}

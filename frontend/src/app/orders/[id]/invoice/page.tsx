'use client';
export const dynamic = 'force-dynamic';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Printer, AlertCircle, Loader2, ShieldCheck } from 'lucide-react';
import BrandLogo from '@/components/brand/BrandLogo';
import { accountService } from '@/services/account.service';
import { branding } from '@/config/branding';
import { formatMoney } from '@/lib/money';
import { classifyInvoiceDocument } from '@/lib/invoiceClassification';

interface InvoiceData {
  orderNumber: string;
  date: string;
  customer: {
    fullName: string;
  };
  shippingAddress: {
    fullName: string;
    phone?: string;
    address: string;
    addressLine2?: string;
    city: string;
    province?: string;
    postalCode?: string;
    country: string;
  };
  items: Array<{
    name: string;
    sku?: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
  }>;
  subtotal: number;
  discount: number;
  shipping: number;
  tax: number;
  total: number;
  currency: string;
  paymentMethod: string;
  paymentStatus: string;
}

export default function InvoicePage() {
  const params = useParams<{ id: string }>();
  const [invoice, setInvoice] = useState<InvoiceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const rawId = params.id as string;
  const decodedId = rawId ? decodeURIComponent(rawId) : '';

  const handlePrint = () => {
    if (typeof window !== 'undefined') {
      window.print();
    }
  };

  const loadInvoice = useCallback(async () => {
    if (!decodedId) return;
    try {
      setLoading(true);
      setError('');
      const result = (await accountService.invoice(decodedId)) as { invoice: InvoiceData };
      setInvoice(result.invoice);
    } catch {
      setError('The requested invoice is unavailable or you do not have permission to view it.');
    } finally {
      setLoading(false);
    }
  }, [decodedId]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadInvoice();
    }, 0);
    return () => clearTimeout(timer);
  }, [loadInvoice]);

  if (loading) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center p-4 bg-slate-50">
        <Loader2 className="w-12 h-12 text-[#ff8a00] animate-spin mb-4" />
        <p className="text-sm font-semibold text-slate-700">Loading invoice document...</p>
      </div>
    );
  }

  if (error || !invoice) {
    return (
      <div className="min-h-[70vh] max-w-lg mx-auto flex flex-col items-center justify-center p-6 text-center bg-slate-50">
        <AlertCircle size={40} className="text-rose-600 mb-4" />
        <h1 className="text-2xl font-extrabold text-slate-900 mb-2">Invoice Unavailable</h1>
        <p className="text-sm text-slate-700 mb-6">{error || 'Unable to retrieve invoice record.'}</p>
        <Link
          href="/orders"
          className="px-6 py-2.5 bg-[#0b132b] text-white font-bold text-sm rounded-xl hover:bg-slate-800 transition"
        >
          Back to Orders
        </Link>
      </div>
    );
  }

  const classification = classifyInvoiceDocument(invoice.paymentStatus, invoice.paymentMethod);
  const formattedDate = new Date(invoice.date).toLocaleDateString('en-PK', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className="min-h-screen bg-slate-100 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Navigation / Print Bar */}
        <div className="print-hidden flex items-center justify-between bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <Link
            href={`/orders/${encodeURIComponent(decodedId)}`}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-700 hover:text-[#9a3412] transition"
          >
            <ArrowLeft size={14} /> Back to Order
          </Link>
          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex items-center gap-2 px-4 py-2 bg-[#0b132b] hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow-xs transition cursor-pointer"
          >
            <Printer size={15} /> Print Document / Save PDF
          </button>
        </div>

        {/* Invoice Printable Sheet */}
        <article className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-10 shadow-xs space-y-8">
          {/* Header Banner */}
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 pb-6 border-b border-slate-200">
            <div>
              <div className="mb-3">
                <BrandLogo theme="dark" href="/" height={32} />
              </div>
              <h1 className="text-xl sm:text-2xl font-black text-[#0b132b]">
                {classification.title}
              </h1>
              <p className="text-xs text-slate-500 mt-1">Order Reference: {invoice.orderNumber}</p>
              <p className="text-xs text-slate-500">Issued on {formattedDate}</p>
            </div>

            <div className="text-left sm:text-right">
              <span
                className={`inline-block text-xs font-extrabold px-3 py-1 rounded-full border ${
                  classification.isOfficialReceipt
                    ? 'bg-emerald-100 text-emerald-900 border-emerald-200'
                    : 'bg-amber-100 text-amber-950 border-amber-200'
                }`}
              >
                {classification.badgeLabel}
              </span>
              <p className="text-xs text-slate-600 font-semibold mt-2">
                Payment Method: <span className="uppercase">{invoice.paymentMethod}</span>
              </p>
            </div>
          </div>

          {/* Customer & Address Details */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 text-xs sm:text-sm">
            <div>
              <h2 className="font-bold text-slate-900 uppercase tracking-wider mb-2">Billed / Delivered To</h2>
              <p className="font-extrabold text-slate-900">{invoice.customer?.fullName || invoice.shippingAddress?.fullName}</p>
              <p className="text-slate-700">{invoice.shippingAddress?.phone}</p>
              <p className="text-slate-700">{invoice.shippingAddress?.address}</p>
              {invoice.shippingAddress?.addressLine2 && <p className="text-slate-700">{invoice.shippingAddress.addressLine2}</p>}
              <p className="text-slate-700">
                {[invoice.shippingAddress?.city, invoice.shippingAddress?.province, invoice.shippingAddress?.postalCode]
                  .filter(Boolean)
                  .join(', ')}
              </p>
              <p className="text-slate-700 font-bold">{invoice.shippingAddress?.country || 'Pakistan'}</p>
            </div>

            <div className="sm:text-right">
              <h2 className="font-bold text-slate-900 uppercase tracking-wider mb-2">Merchant Details</h2>
              <p className="font-bold text-slate-900">{branding.legalDisplayName || branding.siteName}</p>
              <p className="text-slate-600">{branding.supportEmail}</p>
              <p className="text-slate-600">Enterprise Verified Commerce Platform</p>
            </div>
          </div>

          {/* Line Items Table */}
          <div tabIndex={0} role="region" aria-label="Invoice line items table" className="overflow-x-auto focus:ring-1 focus:ring-[#ff8a00] rounded-lg">
            <table className="w-full text-left text-xs sm:text-sm min-w-[480px]">
              <thead>
                <tr className="border-b-2 border-slate-200 text-slate-800 font-extrabold">
                  <th scope="col" className="py-3 pr-4">Description</th>
                  <th scope="col" className="py-3 px-3 text-center">Qty</th>
                  <th scope="col" className="py-3 px-3 text-right">Unit Price</th>
                  <th scope="col" className="py-3 pl-4 text-right">Line Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {invoice.items.map((item, idx) => (
                  <tr key={idx}>
                    <td className="py-3 pr-4">
                      <p className="font-bold text-slate-900">{item.name}</p>
                      {item.sku && <p className="text-[11px] text-slate-500 font-mono">SKU: {item.sku}</p>}
                    </td>
                    <td className="py-3 px-3 text-center font-medium text-slate-800">{item.quantity}</td>
                    <td className="py-3 px-3 text-right text-slate-800">{formatMoney(item.unitPrice, invoice.currency)}</td>
                    <td className="py-3 pl-4 text-right font-extrabold text-slate-900">{formatMoney(item.lineTotal, invoice.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Breakdown & Totals */}
          <div className="pt-4 border-t border-slate-200 flex justify-end">
            <div className="w-full sm:w-72 space-y-2 text-xs sm:text-sm">
              <div className="flex justify-between text-slate-700">
                <span>Subtotal</span>
                <span className="font-bold text-slate-900">{formatMoney(invoice.subtotal, invoice.currency)}</span>
              </div>
              {Number(invoice.discount) > 0 && (
                <div className="flex justify-between text-emerald-700 font-semibold">
                  <span>Discount</span>
                  <span>-{formatMoney(invoice.discount, invoice.currency)}</span>
                </div>
              )}
              <div className="flex justify-between text-slate-700">
                <span>Shipping</span>
                <span className="font-bold text-slate-900">{formatMoney(invoice.shipping, invoice.currency)}</span>
              </div>
              {Number(invoice.tax) > 0 && (
                <div className="flex justify-between text-slate-700">
                  <span>Tax</span>
                  <span className="font-bold text-slate-900">{formatMoney(invoice.tax, invoice.currency)}</span>
                </div>
              )}
              <div className="pt-3 border-t-2 border-slate-300 flex justify-between items-baseline text-base font-black text-[#0b132b]">
                <span>Total</span>
                <span className="text-xl">{formatMoney(invoice.total, invoice.currency)}</span>
              </div>
            </div>
          </div>

          {/* Document Note & Assurance */}
          <div className="pt-6 border-t border-slate-100 text-[11px] text-slate-500 space-y-1">
            <p className="font-medium">{classification.notes}</p>
            <div className="flex items-center gap-1.5 text-slate-600 font-semibold pt-1">
              <ShieldCheck size={14} className="text-emerald-700" />
              <span>Cryptographically verified order ledger record</span>
            </div>
          </div>
        </article>
      </div>

      <style jsx global>{`
        @media print {
          .print-hidden {
            display: none !important;
          }
          body {
            background: white !important;
          }
        }
      `}</style>
    </div>
  );
}

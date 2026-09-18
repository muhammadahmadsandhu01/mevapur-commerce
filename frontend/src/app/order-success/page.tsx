'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import {
  CheckCircle2,
  Package,
  Truck,
  CreditCard,
  Copy,
  ArrowRight,
  AlertCircle,
  Loader2,
  PhoneCall,
  Building2,
  Clock,
} from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { getVerifiedOrder, type CreatedOrderResult } from '@/lib/checkoutService';
import { formatExactMoney } from '@/lib/exactMoney';
import { formatMoney } from '@/lib/money';
import { getSafeMediaUrl } from '@/lib/catalogAdapter';

interface PopulatedOrderItem {
  product?: {
    _id: string;
    name: string;
    primaryImage?: string;
    images?: string[];
  } | string;
  name: string;
  price: number;
  priceExact?: import('@/lib/exactMoney').MoneyExact;
  quantity: number;
  image?: string;
  variant?: string;
  variantId?: string;
  originCountry?: string;
  locationCode?: string;
  shipmentGroup?: string;
}

interface PopulatedOrder extends Omit<CreatedOrderResult, 'items'> {
  items: PopulatedOrderItem[];
}

function OrderSuccessContent() {
  const searchParams = useSearchParams();
  const { isAuthenticated } = useAuthStore();

  const [order, setOrder] = useState<PopulatedOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const orderIdParam = searchParams.get('orderId');

  useEffect(() => {
    const controller = new AbortController();

    async function loadOrder() {
      if (!orderIdParam) {
        setError('No order reference specified.');
        setLoading(false);
        return;
      }

      if (!isAuthenticated) {
        setError('Please sign in to view and verify your order confirmation.');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);
        const data = await getVerifiedOrder(orderIdParam, controller.signal);
        if (!controller.signal.aborted) {
          setOrder(data as PopulatedOrder);
          setLoading(false);
        }
      } catch (err: unknown) {
        if (!controller.signal.aborted) {
          const msg =
            (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
            (err instanceof Error ? err.message : 'Unable to verify order confirmation.');
          setError(msg);
          setLoading(false);
        }
      }
    }

    void loadOrder();

    return () => {
      controller.abort();
    };
  }, [orderIdParam, isAuthenticated]);

  const copyOrderId = () => {
    if (order) {
      const ref = order.orderId || order._id;
      navigator.clipboard.writeText(ref);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'Just now';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center p-4 bg-slate-50">
        <Loader2 className="w-12 h-12 text-[#ff8a00] animate-spin mb-4" />
        <h1 className="text-xl font-bold text-slate-900 mb-1">Verifying Order Confirmation</h1>
        <p className="text-sm text-slate-600">Retrieving authoritative receipt from server...</p>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="min-h-[70vh] max-w-lg mx-auto flex flex-col items-center justify-center p-6 text-center bg-slate-50">
        <div className="w-16 h-16 rounded-full bg-rose-100 flex items-center justify-center mb-4">
          <AlertCircle size={32} className="text-rose-600" />
        </div>
        <h1 className="text-2xl font-extrabold text-slate-900 mb-2">Order Lookup</h1>
        <p className="text-sm text-slate-700 mb-6">{error || 'Order could not be located.'}</p>
        <div className="flex flex-wrap gap-3 justify-center">
          <Link
            href="/orders"
            className="px-5 py-2.5 rounded-xl bg-[#0b132b] text-white text-sm font-bold hover:bg-slate-800 transition"
          >
            View Your Orders
          </Link>
          <Link
            href="/products"
            className="px-5 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-800 text-sm font-bold hover:bg-slate-50 transition"
          >
            Browse Products
          </Link>
        </div>
      </div>
    );
  }

  const isManualPayment = order.paymentMethod === 'bank_transfer' || order.paymentMethod === 'raast';
  const currency = order.currency || order.totalAmountExact?.currency || '';

  return (
    <div className="min-h-screen bg-slate-50 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Success Banner */}
        <div className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-xs text-center">
          <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-700 mx-auto flex items-center justify-center mb-4">
            <CheckCircle2 size={36} />
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900">
            Thank You for Your Order!
          </h1>
          <p className="text-sm text-slate-700 mt-2 max-w-md mx-auto">
            Your order has been confirmed and placed into our fulfillment queue. An electronic confirmation has been logged.
          </p>

          <div className="mt-6 inline-flex flex-wrap items-center justify-center gap-2 p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs sm:text-sm font-bold">
            <span className="text-slate-600">Order Reference:</span>
            <span className="font-mono text-slate-900">{order.orderId || order._id}</span>
            <button
              type="button"
              onClick={copyOrderId}
              className="p-1 hover:bg-slate-200 rounded text-slate-700 transition"
              aria-label="Copy order reference"
            >
              <Copy size={15} />
            </button>
            {copied && <span className="text-xs text-emerald-800 font-semibold ml-1">Copied!</span>}
          </div>
        </div>

        {/* Manual Payment Instructions Notice if applicable */}
        {isManualPayment && order.paymentStatus !== 'Paid' && (
          <div className="p-6 bg-amber-50 border border-amber-300 rounded-2xl text-slate-900" role="alert">
            <h2 className="text-base font-extrabold text-amber-950 mb-2 flex items-center gap-2">
              {order.paymentMethod === 'raast' ? <PhoneCall size={18} /> : <Building2 size={18} />}
              Manual Payment Instructions Required
            </h2>
            <p className="text-xs sm:text-sm text-slate-800 leading-relaxed mb-4">
              Your order is currently in <strong className="font-bold">Pending Payment</strong> status. Please complete the {order.paymentMethod === 'raast' ? 'Raast transfer' : 'Direct Bank IBFT transfer'} using your order reference as the transaction remark.
            </p>
            <Link
              href={`/payment-instructions?orderId=${encodeURIComponent(order._id || order.orderId)}`}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#0b132b] text-white text-xs font-bold rounded-lg hover:bg-slate-800 transition"
            >
              View Payment Account Details <ArrowRight size={14} />
            </Link>
          </div>
        )}

        {/* Order Details Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Shipping Details */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
            <h2 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider mb-4 flex items-center gap-2">
              <Truck size={17} className="text-[#ff8a00]" /> Delivery Address & Service
            </h2>
            <div className="text-xs sm:text-sm text-slate-800 space-y-1">
              <p className="font-bold text-slate-900">{order.shippingAddress?.fullName}</p>
              <p>{order.shippingAddress?.phone}</p>
              <p>{order.shippingAddress?.address}</p>
              {order.shippingAddress?.addressLine2 && <p>{order.shippingAddress.addressLine2}</p>}
              <p>
                {[order.shippingAddress?.city, order.shippingAddress?.province, order.shippingAddress?.postalCode]
                  .filter(Boolean)
                  .join(', ')}
              </p>
              <p className="font-bold">{order.shippingAddress?.country || 'Pakistan'}</p>
            </div>

            {order.shippingQuote && (
              <div className="mt-4 pt-4 border-t border-slate-100 text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-600">Governed Service:</span>
                  <span className="font-bold uppercase text-slate-900">{order.shippingQuote.serviceLevel}</span>
                </div>
                {order.shippingQuote.deliveryPromise?.promiseText && (
                  <div className="flex items-center gap-1 text-slate-600 mt-1">
                    <Clock size={12} className="text-[#ff8a00]" />
                    <span>{order.shippingQuote.deliveryPromise.promiseText}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Order Metadata */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
            <h2 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider mb-4 flex items-center gap-2">
              <CreditCard size={17} className="text-[#ff8a00]" /> Payment & Status
            </h2>
            <div className="text-xs sm:text-sm space-y-2.5">
              <div className="flex justify-between">
                <span className="text-slate-600">Placed Date:</span>
                <span className="font-semibold text-slate-900">{formatDate(order.createdAt)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Payment Method:</span>
                <span className="font-bold uppercase text-slate-900">{order.paymentMethod}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Order Status:</span>
                <span className="font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded text-xs">
                  {order.orderStatus}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Payment Status:</span>
                <span className={`font-bold px-2 py-0.5 rounded text-xs ${
                  order.paymentStatus === 'Paid' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'
                }`}>
                  {order.paymentStatus || 'Pending'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Split Shipment Groups if persisted */}
        {order.shippingQuote?.shipmentGroups && order.shippingQuote.shipmentGroups.length > 1 && (
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
            <h2 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider mb-4 flex items-center gap-2">
              <Package size={17} className="text-[#ff8a00]" /> Split Fulfillment ({order.shippingQuote.shipmentGroups.length} Packages)
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {order.shippingQuote.shipmentGroups.map((grp, idx) => (
                <div key={grp.groupId || idx} className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-1.5">
                  <div className="flex justify-between items-center font-bold text-slate-900">
                    <span>Package {idx + 1} ({grp.originCountry || grp.locationCode || 'Fulfillment Center'})</span>
                    <span>{grp.shippingAmountExact ? formatExactMoney(grp.shippingAmountExact) : formatMoney(grp.shippingAmount, currency)}</span>
                  </div>
                  <p className="text-slate-600">
                    Service: <span className="font-semibold text-slate-800">{grp.serviceLevel.toUpperCase()}</span>
                  </p>
                  {(grp.deliveryPromise?.promiseText || grp.deliveryEstimate) && (
                    <p className="text-slate-600 flex items-center gap-1">
                      <Clock size={11} className="text-slate-400" />
                      {grp.deliveryPromise?.promiseText || `${grp.deliveryEstimate?.minDays}–${grp.deliveryEstimate?.maxDays} business days`}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Ordered Items */}
        <div className="bg-white p-6 sm:p-7 rounded-2xl border border-slate-200 shadow-xs">
          <h2 className="text-base font-extrabold text-slate-900 mb-4 pb-3 border-b border-slate-100 flex items-center gap-2">
            <Package size={18} className="text-[#ff8a00]" /> Ordered Products
          </h2>

          <div className="divide-y divide-slate-100">
            {order.items?.map((item, idx) => {
              const itemImage =
                item.image ||
                (typeof item.product === 'object' ? item.product?.primaryImage || item.product?.images?.[0] : '') ||
                '/placeholder.png';

              return (
                <div key={idx} className="py-4 flex items-center gap-4">
                  <div className="relative w-14 h-14 rounded-xl bg-slate-100 overflow-hidden shrink-0 border border-slate-200">
                    <Image
                      src={getSafeMediaUrl(itemImage)}
                      alt={item.name}
                      fill
                      sizes="56px"
                      className="object-cover"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-900 truncate">{item.name}</p>
                    {item.variant && <p className="text-xs text-slate-600 truncate">{item.variant}</p>}
                    <p className="text-xs text-slate-600 mt-0.5">Quantity: {item.quantity}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-black text-[#0b132b]">
                      {item.priceExact
                        ? formatExactMoney(item.priceExact)
                        : formatMoney(Number(item.price) * item.quantity, currency)}
                    </p>
                    <p className="text-xs text-slate-500 font-medium">
                      {item.priceExact
                        ? formatExactMoney(item.priceExact)
                        : `${formatMoney(Number(item.price), currency)} each`}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Totals Breakdown */}
          <div className="mt-6 pt-5 border-t border-slate-200 space-y-2 text-xs sm:text-sm">
            {order.subtotalExact ? (
              <div className="flex justify-between text-slate-700">
                <span>Subtotal</span>
                <span className="font-semibold text-slate-900">{formatExactMoney(order.subtotalExact)}</span>
              </div>
            ) : order.subtotal !== undefined ? (
              <div className="flex justify-between text-slate-700">
                <span>Subtotal</span>
                <span className="font-semibold text-slate-900">{formatMoney(order.subtotal, currency)}</span>
              </div>
            ) : null}

            {order.discountExact ? (
              <div className="flex justify-between text-emerald-700 font-semibold">
                <span>Discount</span>
                <span>-{formatExactMoney(order.discountExact)}</span>
              </div>
            ) : order.discount !== undefined && order.discount > 0 ? (
              <div className="flex justify-between text-emerald-700 font-semibold">
                <span>Discount</span>
                <span>-{formatMoney(order.discount, currency)}</span>
              </div>
            ) : null}

            {order.shippingCostExact ? (
              <div className="flex justify-between text-slate-700">
                <span>Shipping</span>
                <span className="font-semibold text-slate-900">{formatExactMoney(order.shippingCostExact)}</span>
              </div>
            ) : order.shippingCost !== undefined ? (
              <div className="flex justify-between text-slate-700">
                <span>Shipping</span>
                <span className="font-semibold text-slate-900">{formatMoney(order.shippingCost, currency)}</span>
              </div>
            ) : null}

            {/* Tax Snapshot */}
            {order.taxesAndDuties ? (
              order.taxesAndDuties.taxTreatment === 'inclusive' || (order.taxesAndDuties.taxIncludedAmountExact && order.taxesAndDuties.taxIncludedAmountExact.amountMinor !== '0') ? (
                <div className="space-y-0.5">
                  <div className="flex justify-between text-slate-700">
                    <span>Taxes ({order.taxesAndDuties.taxType || 'Tax'} · Included)</span>
                    <span className="font-semibold text-slate-800">
                      {formatExactMoney(order.taxesAndDuties.taxIncludedAmountExact || order.taxesAndDuties.taxAmountExact || order.taxAmountExact)}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-500 font-medium">Included in items subtotal</p>
                </div>
              ) : (
                <div className="flex justify-between text-slate-700">
                  <span>Taxes ({order.taxesAndDuties.taxType || 'Tax'})</span>
                  <span className="font-semibold text-slate-900">
                    {formatExactMoney(order.taxesAndDuties.additionalTaxAmountExact || order.taxesAndDuties.taxAmountExact || order.taxAmountExact)}
                  </span>
                </div>
              )
            ) : order.taxAmountExact ? (
              <div className="flex justify-between text-slate-700">
                <span>Tax</span>
                <span className="font-semibold text-slate-900">{formatExactMoney(order.taxAmountExact)}</span>
              </div>
            ) : order.taxAmount !== undefined && order.taxAmount > 0 ? (
              <div className="flex justify-between text-slate-700">
                <span>Tax</span>
                <span className="font-semibold text-slate-900">{formatMoney(order.taxAmount, currency)}</span>
              </div>
            ) : null}

            {/* Customs Duties Snapshot */}
            {order.taxesAndDuties ? (
              order.taxesAndDuties.incoterm === 'DAP' ? (
                order.taxesAndDuties.estimatedDutyExact && order.taxesAndDuties.estimatedDutyExact.amountMinor !== '0' ? (
                  <div className="p-2.5 bg-amber-50/80 border border-amber-200 rounded-lg space-y-0.5 text-xs">
                    <div className="flex justify-between text-amber-950 font-bold">
                      <span>Estimated Customs Duty (DAP)</span>
                      <span>{formatExactMoney(order.taxesAndDuties.estimatedDutyExact)}</span>
                    </div>
                    <p className="text-[10px] text-amber-800">
                      Collected upon delivery by carrier · Excluded from order total
                    </p>
                  </div>
                ) : null
              ) : (order.taxesAndDuties.payableDutyExact && order.taxesAndDuties.payableDutyExact.amountMinor !== '0') || (order.dutiesExact && order.dutiesExact.amountMinor !== '0') ? (
                <div className="flex justify-between text-slate-700">
                  <span>Customs Duty ({order.taxesAndDuties.incoterm || 'DDP'} · Paid)</span>
                  <span className="font-semibold text-slate-900">
                    {formatExactMoney(order.taxesAndDuties.payableDutyExact || order.dutiesExact)}
                  </span>
                </div>
              ) : null
            ) : order.dutiesExact && order.dutiesExact.amountMinor !== '0' ? (
              <div className="flex justify-between text-slate-700">
                <span>Customs Duties</span>
                <span className="font-semibold text-slate-900">{formatExactMoney(order.dutiesExact)}</span>
              </div>
            ) : null}

            <div className="pt-3 border-t border-slate-200 flex justify-between items-baseline text-base font-black text-[#0b132b]">
              <span>Final Total</span>
              <span className="text-xl sm:text-2xl">
                {order.totalAmountExact
                  ? formatExactMoney(order.totalAmountExact)
                  : formatMoney(order.totalAmount, currency)}
              </span>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-4 justify-between items-center pt-4">
          <Link
            href="/orders"
            className="px-6 py-3 rounded-xl bg-[#0b132b] hover:bg-slate-800 text-white font-bold text-sm shadow-sm transition"
          >
            View All Your Orders
          </Link>
          <Link
            href="/products"
            className="px-6 py-3 rounded-xl border border-slate-300 hover:bg-slate-100 text-slate-800 font-bold text-sm bg-white transition"
          >
            Continue Shopping
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function OrderSuccessPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[70vh] flex flex-col items-center justify-center p-4 bg-slate-50">
          <Loader2 className="w-12 h-12 text-[#ff8a00] animate-spin mb-4" />
          <p className="text-slate-600 font-medium">Loading confirmation...</p>
        </div>
      }
    >
      <OrderSuccessContent />
    </Suspense>
  );
}

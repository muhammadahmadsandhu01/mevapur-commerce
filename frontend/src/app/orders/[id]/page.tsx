'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowLeft,
  Package,
  MapPin,
  Loader2,
  AlertCircle,
  XCircle,
  Truck,
  FileText,
  RotateCcw,
  Building2,
  PhoneCall,
  ArrowRight,
} from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import api from '@/lib/api';
import Toast from '@/components/Toast';
import { formatMoney } from '@/lib/money';
import { getSafeMediaUrl } from '@/lib/catalogAdapter';

interface OrderItem {
  product?: string | {
    _id: string;
    name?: string;
    primaryImage?: string;
    images?: string[];
  };
  variantId?: string | null;
  name: string;
  price: number | string;
  quantity: number;
  image?: string;
  sku?: string;
  variant?: string;
}

interface TimelineStep {
  status: string;
  timestamp: string;
  note?: string;
}

interface Order {
  _id: string;
  orderId: string;
  orderStatus: string;
  paymentMethod: string;
  paymentStatus: string;
  subtotal: number | string;
  shippingCost?: number | string;
  taxAmount?: number | string;
  discount?: number | string;
  totalAmount: number | string;
  createdAt: string;
  deliveredAt?: string | null;
  cancelledAt?: string | null;
  cancelReason?: string | null;
  items: OrderItem[];
  shippingAddress: {
    fullName: string;
    phone: string;
    address: string;
    addressLine2?: string;
    city: string;
    province?: string;
    postalCode?: string;
    country?: string;
  };
  statusTimeline?: TimelineStep[];
  timeline?: TimelineStep[];
  trackingNumber?: string;
  courierCompany?: string;
}

export default function OrderDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const { isAuthenticated, isInitialized, bootstrap } = useAuthStore();

  const rawOrderId = params.id as string;
  const orderId = rawOrderId ? decodeURIComponent(rawOrderId) : '';

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  // Cancellation Dialog State
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const cancelLockRef = useRef(false);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  const fetchOrder = useCallback(async () => {
    if (!orderId) return;

    try {
      setLoading(true);
      setError(null);
      const response = await api.get(`/orders/${encodeURIComponent(orderId)}`);

      if (response.data.success) {
        setOrder(response.data.data.order);
      }
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'Order could not be found or you do not have permission to view it.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  const [currentTime] = useState(() => Date.now());

  useEffect(() => {
    if (!isInitialized) return;

    if (!isAuthenticated) {
      router.push(`/login?redirect=/orders/${encodeURIComponent(orderId)}`);
      return;
    }

    const timer = setTimeout(() => {
      void fetchOrder();
    }, 0);
    return () => clearTimeout(timer);
  }, [isInitialized, isAuthenticated, orderId, router, fetchOrder]);

  // Handle Cancellation Submission
  const handleCancelOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cancelLockRef.current || cancelling || !order) return;

    cancelLockRef.current = true;
    setCancelling(true);

    try {
      const response = await api.post(
        `/orders/${encodeURIComponent(order.orderId || order._id)}/cancel`,
        {
          reason: cancelReason.trim() ? cancelReason.trim().slice(0, 500) : undefined,
        }
      );

      if (response.data.success) {
        setToast({ message: 'Order has been successfully cancelled.', type: 'success' });
        setShowCancelModal(false);
        setCancelReason('');
        await fetchOrder();
      }
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'Failed to cancel order. Please refresh and try again.';
      setToast({ message: msg, type: 'error' });
      await fetchOrder();
    } finally {
      cancelLockRef.current = false;
      setCancelling(false);
    }
  };

  // Helper to check 30-day return eligibility
  const isReturnEligible = (ord: Order): boolean => {
    if (ord.orderStatus !== 'Delivered' || !ord.deliveredAt) return false;
    const deliveryDate = new Date(ord.deliveredAt).getTime();
    if (Number.isNaN(deliveryDate)) return false;
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    return currentTime - deliveryDate <= thirtyDaysMs;
  };

  // Helper to build return URL
  const buildReturnUrl = (ord: Order, item: OrderItem): string => {
    const pId = typeof item.product === 'object' ? item.product._id : item.product || '';
    const queryParams = new URLSearchParams({
      tab: 'returns',
      order: ord.orderId || ord._id,
      product: String(pId),
    });
    if (item.variantId) {
      queryParams.set('variant', String(item.variantId));
    }
    return `/account?${queryParams.toString()}#returns`;
  };

  const isCancellable =
    order && (order.orderStatus === 'Pending' || order.orderStatus === 'Confirmed');

  const isManualPayment =
    order &&
    (order.paymentMethod === 'bank_transfer' || order.paymentMethod === 'raast') &&
    order.paymentStatus === 'Pending';

  if (!isInitialized || loading) {
    return (
      <main className="min-h-[70vh] flex flex-col items-center justify-center p-4 bg-slate-50">
        <Loader2 className="w-12 h-12 text-[#ff8a00] animate-spin mb-4" />
        <p className="text-sm font-semibold text-slate-700">Loading order details...</p>
      </main>
    );
  }

  if (error || !order) {
    return (
      <main className="min-h-[70vh] max-w-lg mx-auto flex flex-col items-center justify-center p-6 text-center bg-slate-50">
        <AlertCircle size={40} className="text-rose-600 mb-4" />
        <h1 className="text-2xl font-extrabold text-slate-900 mb-2">Order Lookup</h1>
        <p className="text-sm text-slate-700 mb-6">{error || 'Unable to retrieve order details.'}</p>
        <Link
          href="/orders"
          className="px-6 py-2.5 bg-[#0b132b] text-white font-bold text-sm rounded-xl hover:bg-slate-800 transition"
        >
          Back to Orders
        </Link>
      </main>
    );
  }

  const timelineSteps = order.statusTimeline || order.timeline || [];

  return (
    <main className="min-h-screen bg-slate-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <Link
              href="/orders"
              className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-700 hover:text-[#9a3412] mb-2 transition"
            >
              <ArrowLeft size={14} /> Back to My Orders
            </Link>
            <h1 className="text-2xl sm:text-3xl font-black text-[#0b132b]">
              Order #{order.orderId || order._id}
            </h1>
            <p className="text-xs text-slate-600 mt-1">
              Placed on {new Date(order.createdAt).toLocaleDateString('en-PK', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/orders/${encodeURIComponent(order.orderId || order._id)}/invoice`}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 border border-slate-300 rounded-xl text-xs font-bold text-slate-700 bg-white hover:bg-slate-50 transition shadow-2xs"
            >
              <FileText size={14} /> View Invoice
            </Link>

            {isCancellable && (
              <button
                type="button"
                onClick={() => setShowCancelModal(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 border border-rose-300 rounded-xl text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 transition shadow-2xs"
              >
                <XCircle size={14} /> Cancel Order
              </button>
            )}
          </div>
        </div>

        {/* Status Badges Row */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-wrap gap-4 items-center justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-500 font-bold">Fulfillment Status:</span>
            <span className="px-3 py-1 bg-slate-100 text-slate-900 font-bold text-xs rounded-full border border-slate-200">
              {order.orderStatus}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-500 font-bold">Payment Status:</span>
            <span
              className={`px-3 py-1 font-bold text-xs rounded-full border ${
                order.paymentStatus === 'Paid'
                  ? 'bg-emerald-100 text-emerald-900 border-emerald-200'
                  : order.paymentStatus === 'Refunded' || order.paymentStatus === 'PartiallyRefunded'
                  ? 'bg-cyan-100 text-cyan-900 border-cyan-200'
                  : 'bg-amber-100 text-amber-900 border-amber-200'
              }`}
            >
              {order.paymentStatus} ({order.paymentMethod})
            </span>
          </div>
        </div>

        {/* Manual Payment Alert */}
        {isManualPayment && (
          <div className="p-5 bg-amber-50 border border-amber-300 rounded-2xl text-slate-900" role="alert">
            <h2 className="text-sm font-extrabold text-amber-950 mb-1 flex items-center gap-2">
              {order.paymentMethod === 'raast' ? <PhoneCall size={17} /> : <Building2 size={17} />}
              Manual Payment Instructions Required
            </h2>
            <p className="text-xs text-slate-800 leading-relaxed mb-3">
              Your order is currently awaiting payment. Please complete the transfer and submit your transaction reference.
            </p>
            <Link
              href={`/payment-instructions?orderId=${encodeURIComponent(order.orderId || order._id)}`}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#0b132b] text-white text-xs font-bold rounded-lg hover:bg-slate-800 transition"
            >
              View Instructions & Submit Reference <ArrowRight size={14} />
            </Link>
          </div>
        )}

        {/* Cancelled Notice if applicable */}
        {order.orderStatus === 'Cancelled' && (
          <div className="p-5 bg-rose-50 border border-rose-200 rounded-2xl text-slate-900" role="alert">
            <h2 className="text-sm font-extrabold text-rose-950 mb-1 flex items-center gap-2">
              <XCircle size={17} className="text-rose-600" />
              Order Cancelled
            </h2>
            <p className="text-xs text-slate-800 leading-relaxed">
              This order was cancelled on{' '}
              {order.cancelledAt ? new Date(order.cancelledAt).toLocaleString() : 'N/A'}.
              {order.cancelReason && ` Reason: "${order.cancelReason}".`}
            </p>
          </div>
        )}

        {/* Products Section */}
        <section className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs" aria-label="Order items">
          <h2 className="text-base font-extrabold text-slate-900 mb-4 pb-3 border-b border-slate-100 flex items-center gap-2">
            <Package size={18} className="text-[#ff8a00]" /> Products in Order ({order.items.length})
          </h2>

          <div className="divide-y divide-slate-100">
            {order.items.map((item, index) => {
              const productName = typeof item.product === 'object' ? item.product.name : item.name;
              const rawImg =
                item.image ||
                (typeof item.product === 'object'
                  ? item.product.primaryImage || item.product.images?.[0]
                  : null) ||
                '/placeholder.png';

              const eligibleForReturn = isReturnEligible(order);

              return (
                <div key={index} className="py-4 flex items-center gap-4">
                  <div className="relative w-16 h-16 rounded-xl bg-slate-100 overflow-hidden shrink-0 border border-slate-200">
                    <Image
                      src={getSafeMediaUrl(rawImg)}
                      alt={productName || 'Product'}
                      fill
                      sizes="64px"
                      className="object-cover"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-900 truncate">{productName}</p>
                    {item.variant && (
                      <p className="text-xs text-slate-600 truncate mt-0.5">{item.variant}</p>
                    )}
                    <p className="text-xs text-slate-600 mt-0.5">Quantity: {item.quantity}</p>

                    {eligibleForReturn && (
                      <Link
                        href={buildReturnUrl(order, item)}
                        className="inline-flex items-center gap-1 text-xs font-bold text-[#0b132b] hover:text-[#9a3412] mt-1.5 transition"
                      >
                        <RotateCcw size={12} /> Request Return
                      </Link>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-black text-[#0b132b]">
                      {formatMoney(Number(item.price) * item.quantity)}
                    </p>
                    <p className="text-xs text-slate-500 font-medium">
                      {formatMoney(Number(item.price))} each
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Breakdown */}
          <div className="mt-6 pt-5 border-t border-slate-200 space-y-2 text-xs sm:text-sm">
            <div className="flex justify-between text-slate-700">
              <span>Subtotal</span>
              <span className="font-semibold text-slate-900">{formatMoney(order.subtotal)}</span>
            </div>
            {Number(order.discount) > 0 && (
              <div className="flex justify-between text-emerald-700 font-semibold">
                <span>Discount</span>
                <span>-{formatMoney(order.discount)}</span>
              </div>
            )}
            {order.shippingCost !== undefined && (
              <div className="flex justify-between text-slate-700">
                <span>Shipping</span>
                <span className="font-semibold text-slate-900">{formatMoney(order.shippingCost)}</span>
              </div>
            )}
            {Number(order.taxAmount) > 0 && (
              <div className="flex justify-between text-slate-700">
                <span>Tax</span>
                <span className="font-semibold text-slate-900">{formatMoney(order.taxAmount)}</span>
              </div>
            )}
            <div className="pt-3 border-t border-slate-200 flex justify-between items-baseline text-base font-black text-[#0b132b]">
              <span>Final Total Charged</span>
              <span className="text-xl sm:text-2xl">{formatMoney(order.totalAmount)}</span>
            </div>
          </div>
        </section>

        {/* Tracking & Fulfillment Timeline */}
        {(order.trackingNumber || order.courierCompany || timelineSteps.length > 0) && (
          <section className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs" aria-label="Tracking details">
            <h2 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider mb-4 flex items-center gap-2">
              <Truck size={17} className="text-[#ff8a00]" /> Courier & Delivery Tracking
            </h2>

            {order.trackingNumber && (
              <div className="mb-5 p-4 bg-slate-50 rounded-xl border border-slate-200 text-xs sm:text-sm space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-600">Courier Company:</span>
                  <span className="font-bold text-slate-900">{order.courierCompany || 'Designated Courier'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Tracking Number:</span>
                  <span className="font-mono font-bold text-slate-900">{order.trackingNumber}</span>
                </div>
              </div>
            )}

            {timelineSteps.length > 0 && (
              <div className="relative pl-6 space-y-4 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
                {timelineSteps.map((step, idx) => (
                  <div key={idx} className="relative">
                    <div className="absolute -left-6 top-1 w-3.5 h-3.5 rounded-full bg-[#ff8a00] border-2 border-white ring-2 ring-orange-100" />
                    <div>
                      <p className="text-xs font-extrabold text-slate-900">{step.status}</p>
                      <p className="text-[11px] text-slate-500">
                        {new Date(step.timestamp).toLocaleString()}
                      </p>
                      {step.note && <p className="text-xs text-slate-700 mt-0.5">{step.note}</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* Delivery Address Details */}
        <section className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs" aria-label="Shipping address">
          <h2 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider mb-3 flex items-center gap-2">
            <MapPin size={16} className="text-[#ff8a00]" /> Shipping Address
          </h2>
          <div className="text-xs sm:text-sm text-slate-800 space-y-1">
            <p className="font-bold text-slate-900">{order.shippingAddress.fullName}</p>
            <p>{order.shippingAddress.phone}</p>
            <p>{order.shippingAddress.address}</p>
            {order.shippingAddress.addressLine2 && <p>{order.shippingAddress.addressLine2}</p>}
            <p>
              {[order.shippingAddress.city, order.shippingAddress.province, order.shippingAddress.postalCode]
                .filter(Boolean)
                .join(', ')}
            </p>
            <p className="font-bold">{order.shippingAddress.country || 'Pakistan'}</p>
          </div>
        </section>
      </div>

      {/* Cancellation Modal */}
      {showCancelModal && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-2xs flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="cancel-dialog-title"
        >
          <div className="bg-white rounded-2xl border border-slate-200 p-6 max-w-md w-full shadow-xl animate-in fade-in zoom-in-95 duration-150">
            <h2 id="cancel-dialog-title" className="text-lg font-black text-slate-900 mb-2">
              Cancel Order #{order.orderId || order._id}
            </h2>
            <p className="text-xs text-slate-600 mb-4 leading-relaxed">
              Are you sure you want to cancel this order? Once cancelled, reserved items and coupons are restored, and fulfillment will stop.
            </p>

            <form onSubmit={handleCancelOrder} className="space-y-4">
              <div>
                <label htmlFor="cancelReasonInput" className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Reason for Cancellation (optional, max 500 chars)
                </label>
                <textarea
                  id="cancelReasonInput"
                  rows={3}
                  maxLength={500}
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="e.g. Changed my mind, ordered duplicate, etc."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs outline-none focus:border-[#ff8a00] focus:ring-1 focus:ring-[#ff8a00] bg-white text-slate-900 font-normal"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCancelModal(false)}
                  disabled={cancelling}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-bold text-slate-700 hover:bg-slate-50 transition disabled:opacity-50"
                >
                  Keep Order
                </button>
                <button
                  type="submit"
                  disabled={cancelling}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-lg transition disabled:opacity-50"
                >
                  {cancelling ? (
                    <>
                      <Loader2 size={14} className="animate-spin" /> Cancelling...
                    </>
                  ) : (
                    'Confirm Cancellation'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </main>
  );
}

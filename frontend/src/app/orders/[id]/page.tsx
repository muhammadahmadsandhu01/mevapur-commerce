'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import {
  ArrowLeft,
  Package,
  MapPin,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import Link from 'next/link';
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
  name: string;
  price: number | string;
  quantity: number;
  image?: string;
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
  shippingCost: number | string;
  discount: number | string;
  totalAmount: number | string;
  createdAt: string;
  items: OrderItem[];
  shippingAddress: {
    fullName: string;
    phone: string;
    address: string;
    city: string;
    postalCode?: string;
  };
  statusTimeline?: TimelineStep[];
  timeline?: TimelineStep[];
  trackingNumber?: string;
}

export default function OrderDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const { token, isAuthenticated } = useAuthStore();

  const orderId = params.id as string;

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login?redirect=/orders/' + orderId);
      return;
    }

    const fetchOrder = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await api.get(`/orders/${orderId}`);

        if (response.data.success) {
          setOrder(response.data.data.order);
        }
      } catch (err: unknown) {
        console.error('Error fetching order:', err);
        setError('Order could not be found or you do not have permission to view it.');
      } finally {
        setLoading(false);
      }
    };

    fetchOrder();
  }, [orderId, token, isAuthenticated, router]);

  if (loading) {
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
        <h1 className="text-2xl font-extrabold text-slate-900 mb-2">Order Not Found</h1>
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

  return (
    <main className="min-h-screen bg-slate-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <Link href="/orders" className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-700 hover:text-[#9a3412] mb-2 transition">
              <ArrowLeft size={14} /> Back to My Orders
            </Link>
            <h1 className="text-2xl font-black text-slate-900">
              Order #{order.orderId || order._id}
            </h1>
            <p className="text-xs text-slate-600 mt-1">
              Placed on {new Date(order.createdAt).toLocaleDateString()}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="px-3 py-1 bg-slate-100 text-slate-800 font-bold text-xs rounded-full border border-slate-200">
              Status: {order.orderStatus}
            </span>
            <span className={`px-3 py-1 font-bold text-xs rounded-full ${
              order.paymentStatus === 'Paid' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'
            }`}>
              {order.paymentStatus}
            </span>
          </div>
        </div>

        {/* Products Section */}
        <section className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
          <h2 className="text-base font-extrabold text-slate-900 mb-4 pb-3 border-b border-slate-100 flex items-center gap-2">
            <Package size={18} className="text-[#ff8a00]" /> Products ({order.items.length})
          </h2>

          <div className="divide-y divide-slate-100">
            {order.items.map((item, index) => {
              const productName = typeof item.product === 'object' ? item.product.name : item.name;
              const rawImg = item.image || (typeof item.product === 'object' ? item.product.primaryImage || item.product.images?.[0] : null) || '/placeholder.png';
              const returnProductId = typeof item.product === 'object' ? item.product._id : item.product;

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
                    <p className="text-xs text-slate-600 mt-0.5">Qty: {item.quantity}</p>
                    {order.orderStatus === 'Delivered' && (
                      <Link
                        href={`/account?order=${encodeURIComponent(order.orderId || order._id)}&product=${encodeURIComponent(String(returnProductId))}`}
                        className="text-xs font-semibold text-[#0b132b] hover:underline mt-1 inline-block"
                      >
                        Request return
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
            <div className="flex justify-between text-slate-700">
              <span>Shipping</span>
              <span className="font-semibold text-slate-900">{formatMoney(order.shippingCost)}</span>
            </div>
            <div className="pt-3 border-t border-slate-200 flex justify-between items-baseline text-base font-black text-[#0b132b]">
              <span>Total Amount</span>
              <span className="text-xl">{formatMoney(order.totalAmount)}</span>
            </div>
          </div>
        </section>

        {/* Shipping Address */}
        <section className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
          <h2 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider mb-3 flex items-center gap-2">
            <MapPin size={16} className="text-[#ff8a00]" /> Shipping Address
          </h2>
          <div className="text-xs sm:text-sm text-slate-800 space-y-1">
            <p className="font-bold text-slate-900">{order.shippingAddress.fullName}</p>
            <p>{order.shippingAddress.phone}</p>
            <p>{order.shippingAddress.address}</p>
            <p>{order.shippingAddress.city}, {order.shippingAddress.postalCode}</p>
          </div>
        </section>
      </div>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </main>
  );
}

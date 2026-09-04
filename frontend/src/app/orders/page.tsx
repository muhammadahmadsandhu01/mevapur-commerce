'use client';
export const dynamic = 'force-dynamic';

import { useState, useMemo, useEffect, useCallback } from 'react';
import { Search, Package, ArrowLeft, Loader2, AlertCircle, ChevronLeft, ChevronRight, Eye } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
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
  price: number;
  quantity: number;
  image?: string;
  sku?: string;
  variant?: string;
}

interface OrderSummary {
  _id: string;
  orderId: string;
  orderStatus: string;
  paymentMethod: string;
  paymentStatus: string;
  totalAmount: number;
  subtotal: number;
  shippingCost?: number;
  taxAmount?: number;
  discount?: number;
  createdAt: string;
  items: OrderItem[];
  shippingAddress: {
    fullName: string;
    phone: string;
    address: string;
    city: string;
    province?: string;
    postalCode?: string;
    country?: string;
  };
  trackingNumber?: string;
  courierCompany?: string;
}

interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

export default function OrdersPage() {
  const { isAuthenticated, isInitialized, bootstrap } = useAuthStore();
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta>({
    page: 1,
    limit: 10,
    total: 0,
    pages: 1,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  const fetchOrders = useCallback(async (pageToFetch = 1, statusToFilter = statusFilter) => {
    if (!isAuthenticated) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string | number> = { page: pageToFetch, limit: 10 };
      if (statusToFilter && statusToFilter !== 'all') {
        params.status = statusToFilter;
      }
      const response = await api.get('/orders/my-orders', { params });
      if (response.data.success) {
        setOrders(response.data.data.orders || []);
        if (response.data.data.pagination) {
          setPagination(response.data.data.pagination);
        }
      }
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'Failed to retrieve your order history.';
      setError(msg);
      setToast({ message: msg, type: 'error' });
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, statusFilter]);

  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;
    if (isInitialized && isAuthenticated) {
      timer = setTimeout(() => {
        void fetchOrders(1, statusFilter);
      }, 0);
    } else if (isInitialized && !isAuthenticated) {
      timer = setTimeout(() => {
        setLoading(false);
      }, 0);
    }
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [isInitialized, isAuthenticated, statusFilter, fetchOrders]);

  const filteredOrders = useMemo(() => {
    let list = [...orders];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (o) =>
          (o.orderId || '').toLowerCase().includes(q) ||
          (o._id || '').toLowerCase().includes(q) ||
          o.items?.some((item) => (item.name || '').toLowerCase().includes(q))
      );
    }

    return list;
  }, [orders, searchQuery]);

  const getOrderStatusBadgeClass = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'delivered':
        return 'bg-emerald-100 text-emerald-800 border-emerald-200';
      case 'shipped':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'processing':
        return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'confirmed':
        return 'bg-indigo-100 text-indigo-800 border-indigo-200';
      case 'cancelled':
        return 'bg-rose-100 text-rose-800 border-rose-200';
      case 'pending':
      default:
        return 'bg-amber-100 text-amber-900 border-amber-200';
    }
  };

  const getPaymentStatusBadgeClass = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'paid':
        return 'bg-emerald-100 text-emerald-800 border-emerald-200';
      case 'partiallyrefunded':
      case 'refunded':
        return 'bg-cyan-100 text-cyan-800 border-cyan-200';
      case 'failed':
        return 'bg-rose-100 text-rose-800 border-rose-200';
      case 'pending':
      default:
        return 'bg-slate-100 text-slate-800 border-slate-200';
    }
  };

  if (!isInitialized || (loading && orders.length === 0)) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center p-4 bg-slate-50">
        <Loader2 className="w-12 h-12 text-[#ff8a00] animate-spin mb-4" />
        <p className="text-sm font-semibold text-slate-700">Loading your order history...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-[70vh] max-w-lg mx-auto flex flex-col items-center justify-center p-6 text-center bg-slate-50">
        <div className="w-16 h-16 rounded-full bg-orange-100 text-[#0b132b] flex items-center justify-center mb-4">
          <Package size={32} className="text-[#ff8a00]" />
        </div>
        <h1 className="text-2xl font-black text-slate-900 mb-2">Sign in to view orders</h1>
        <p className="text-sm text-slate-600 mb-6">
          Access your verified order receipts, shipping progress, and return requests.
        </p>
        <Link
          href="/login?redirect=/orders"
          className="px-6 py-3 bg-[#0b132b] text-white font-bold text-sm rounded-xl hover:bg-slate-800 transition"
        >
          Sign In
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-700 hover:text-[#9a3412] mb-2 transition"
            >
              <ArrowLeft size={14} /> Back to Store
            </Link>
            <h1 className="text-2xl sm:text-3xl font-black text-[#0b132b]">My Orders</h1>
            <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
              Review placed orders, tracked fulfillments, and authoritative receipts.
            </p>
          </div>
        </div>

        {/* Filters & Search */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row gap-3 items-center justify-between">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Filter loaded orders on current page"
              placeholder="Filter loaded orders on page..."
              className="w-full pl-9 pr-3.5 py-2 text-xs border border-slate-300 rounded-xl outline-none focus:border-[#ff8a00] focus:ring-1 focus:ring-[#ff8a00] bg-white text-slate-900 font-medium"
            />
            {searchQuery.trim() && (
              <span className="text-[10px] text-slate-500 mt-1 block">
                Filtering page {pagination.page} ({filteredOrders.length} of {orders.length} items match)
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <label htmlFor="statusFilter" className="text-xs font-bold text-slate-700 shrink-0">
              Filter Status:
            </label>
            <select
              id="statusFilter"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full sm:w-auto px-3 py-2 border border-slate-300 rounded-xl text-xs font-semibold text-slate-800 bg-white outline-none cursor-pointer focus:border-[#ff8a00]"
            >
              <option value="all">All Orders</option>
              <option value="Pending">Pending</option>
              <option value="Confirmed">Confirmed</option>
              <option value="Processing">Processing</option>
              <option value="Shipped">Shipped</option>
              <option value="Delivered">Delivered</option>
              <option value="Cancelled">Cancelled</option>
            </select>
          </div>
        </div>

        {/* Orders List */}
        {error ? (
          <div className="p-8 bg-rose-50 border border-rose-200 rounded-2xl text-center text-rose-800">
            <AlertCircle size={32} className="mx-auto mb-2 text-rose-600" />
            <p className="font-bold">{error}</p>
            <button
              onClick={() => fetchOrders(pagination.page, statusFilter)}
              className="mt-4 px-4 py-2 bg-[#0b132b] text-white text-xs font-bold rounded-lg hover:bg-slate-800 transition"
            >
              Retry Loading Orders
            </button>
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="bg-white p-12 rounded-2xl border border-slate-200 shadow-xs text-center">
            <div className="w-16 h-16 rounded-full bg-slate-100 mx-auto flex items-center justify-center mb-4 text-slate-400">
              <Package size={28} />
            </div>
            {orders.length > 0 && searchQuery.trim() ? (
              <>
                <h2 className="text-lg font-extrabold text-slate-900 mb-1">
                  No matching orders on page {pagination.page}
                </h2>
                <p className="text-xs text-slate-600 max-w-sm mx-auto mb-6">
                  No loaded orders on this page match &quot;{searchQuery}&quot;. Try clearing your page filter or navigating to other pages.
                </p>
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="px-6 py-2.5 bg-[#0b132b] text-white font-bold text-xs rounded-xl hover:bg-slate-800 transition inline-block cursor-pointer"
                >
                  Clear Page Filter
                </button>
              </>
            ) : statusFilter !== 'all' ? (
              <>
                <h2 className="text-lg font-extrabold text-slate-900 mb-1">
                  No {statusFilter} orders found
                </h2>
                <p className="text-xs text-slate-600 max-w-sm mx-auto mb-6">
                  There are no orders matching status &quot;{statusFilter}&quot;.
                </p>
                <button
                  type="button"
                  onClick={() => setStatusFilter('all')}
                  className="px-6 py-2.5 bg-[#0b132b] text-white font-bold text-xs rounded-xl hover:bg-slate-800 transition inline-block cursor-pointer"
                >
                  Show All Orders
                </button>
              </>
            ) : (
              <>
                <h2 className="text-lg font-extrabold text-slate-900 mb-1">No orders placed yet</h2>
                <p className="text-xs text-slate-600 max-w-sm mx-auto mb-6">
                  Browse our natural dry fruits and organic pantry to place your first order.
                </p>
                <Link
                  href="/products"
                  className="px-6 py-2.5 bg-[#0b132b] text-white font-bold text-xs rounded-xl hover:bg-slate-800 transition inline-block"
                >
                  Browse Catalogue
                </Link>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {filteredOrders.map((order) => {
              const formattedDate = order.createdAt
                ? new Date(order.createdAt).toLocaleDateString('en-PK', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                  })
                : 'N/A';

              return (
                <article
                  key={order._id}
                  className="bg-white p-5 sm:p-6 rounded-2xl border border-slate-200 shadow-xs hover:border-slate-300 transition"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-slate-100">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-500">Order:</span>
                        <span className="text-sm font-black font-mono text-[#0b132b]">
                          {order.orderId || order._id}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">Placed on {formattedDate}</p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`text-xs font-bold px-2.5 py-1 rounded-full border ${getOrderStatusBadgeClass(
                          order.orderStatus
                        )}`}
                      >
                        {order.orderStatus}
                      </span>
                      <span
                        className={`text-xs font-bold px-2.5 py-1 rounded-full border ${getPaymentStatusBadgeClass(
                          order.paymentStatus
                        )}`}
                      >
                        Payment: {order.paymentStatus}
                      </span>
                    </div>
                  </div>

                  {/* Items Summary */}
                  <div className="py-4 divide-y divide-slate-50">
                    {order.items?.map((item, idx) => {
                      const itemImage =
                        item.image ||
                        (typeof item.product === 'object'
                          ? item.product?.primaryImage || item.product?.images?.[0]
                          : '') ||
                        '/placeholder.png';

                      return (
                        <div key={idx} className="py-2.5 flex items-center gap-3">
                          <div className="relative w-12 h-12 rounded-lg bg-slate-100 overflow-hidden shrink-0 border border-slate-200">
                            <Image
                              src={getSafeMediaUrl(itemImage)}
                              alt={item.name}
                              fill
                              sizes="48px"
                              className="object-cover"
                            />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold text-slate-900 truncate">{item.name}</p>
                            {item.variant && (
                              <p className="text-[11px] text-slate-500 truncate">{item.variant}</p>
                            )}
                            <p className="text-[11px] text-slate-500">Qty: {item.quantity}</p>
                          </div>
                          <div className="text-right text-xs font-extrabold text-slate-900 shrink-0">
                            {formatMoney(item.price * item.quantity)}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Footer & Actions */}
                  <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="flex items-baseline gap-2">
                      <span className="text-xs text-slate-600">Total Charged:</span>
                      <span className="text-base font-black text-[#0b132b]">
                        {formatMoney(order.totalAmount)}
                      </span>
                      <span className="text-[11px] text-slate-500 uppercase font-medium">
                        via {order.paymentMethod}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-auto">
                      <Link
                        href={`/orders/${encodeURIComponent(order.orderId || order._id)}/invoice`}
                        className="px-3.5 py-1.5 border border-slate-300 rounded-lg text-xs font-bold text-slate-700 bg-white hover:bg-slate-50 transition"
                      >
                        View Invoice
                      </Link>
                      <Link
                        href={`/orders/${encodeURIComponent(order.orderId || order._id)}`}
                        className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-[#0b132b] text-white text-xs font-bold rounded-lg hover:bg-slate-800 transition"
                      >
                        <Eye size={13} /> Order Details
                      </Link>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {/* Pagination Controls */}
        {pagination.pages > 1 && (
          <div className="flex items-center justify-between bg-white p-4 rounded-2xl border border-slate-200 text-xs font-bold">
            <button
              onClick={() => fetchOrders(pagination.page - 1)}
              disabled={pagination.page <= 1 || loading}
              className="inline-flex items-center gap-1 px-3 py-1.5 border border-slate-300 rounded-lg disabled:opacity-40 hover:bg-slate-50 transition"
            >
              <ChevronLeft size={14} /> Previous
            </button>
            <span className="text-slate-700">
              Page {pagination.page} of {pagination.pages} ({pagination.total} orders total)
            </span>
            <button
              onClick={() => fetchOrders(pagination.page + 1)}
              disabled={pagination.page >= pagination.pages || loading}
              className="inline-flex items-center gap-1 px-3 py-1.5 border border-slate-300 rounded-lg disabled:opacity-40 hover:bg-slate-50 transition"
            >
              Next <ChevronRight size={14} />
            </button>
          </div>
        )}
      </div>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}

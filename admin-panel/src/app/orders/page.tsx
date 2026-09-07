'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ShoppingCart, Search, Download, Eye,
  Truck, CheckCircle, Clock, XCircle,
  Calendar, DollarSign, Package,
  ChevronLeft, ChevronRight, X, Save, Loader, User, AlertCircle
} from 'lucide-react';
import api from '@/lib/api';
import { exportCsvFile } from '@/lib/csvExport';
import { PRODUCT_PLACEHOLDER } from '@/lib/placeholder';

interface Order {
  _id: string;
  orderId: string;
  user?: {
    _id: string;
    fullName: string;
    email: string;
  };
  items: {
    name: string;
    price: number;
    quantity: number;
    image?: string;
    variant?: string;
  }[];
  shippingAddress: {
    fullName: string;
    phone: string;
    address: string;
    city: string;
    postalCode?: string;
  };
  paymentMethod: string;
  paymentStatus: string;
  orderStatus: string;
  subtotal: number;
  shippingCost: number;
  discount: number;
  totalAmount: number;
  payment?: {
    provider?: string;
    paidAt?: string;
    transactionId?: string;
  };
  adminNotes?: {
    note: string;
    addedBy?: string;
    addedAt?: string;
  }[];
  statusTimeline?: {
    status: string;
    timestamp: string;
    note?: string;
  }[];
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

interface OrderStats {
  totalOrders: number;
  pendingOrders: number;
  processingOrders: number;
  shippedOrders: number;
  deliveredOrders: number;
  cancelledOrders: number;
  totalRevenue: number;
}

function OrdersListContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const customerFilter = searchParams.get('customer') || '';

  const [orders, setOrders] = useState<Order[]>([]);
  const [serverStats, setServerStats] = useState<OrderStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'Pending' | 'Confirmed' | 'Processing' | 'Shipped' | 'Delivered' | 'Cancelled'>('all');
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'week' | 'month'>('all');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'highest' | 'lowest'>('newest');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [updatingOrder, setUpdatingOrder] = useState<Order | null>(null);
  const [newStatus, setNewStatus] = useState('');
  const [adminNotes, setAdminNotes] = useState('');
  const [updating, setUpdating] = useState(false);
  const [codOrderToMark, setCodOrderToMark] = useState<Order | null>(null);
  const [codAdminNote, setCodAdminNote] = useState('');
  const [markingCod, setMarkingCod] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    fetchOrders();
    fetchStats();
  }, [page, statusFilter, dateFilter, sortBy, customerFilter]);

  async function fetchStats() {
    try {
      const response = await api.get('/orders/stats');
      if (response.data?.success && response.data?.data?.stats) {
        setServerStats(response.data.data.stats);
      }
    } catch (error) {
      console.error('Error fetching order stats:', error);
    }
  }

  async function fetchOrders() {
    setLoading(true);
    try {
      const params: Record<string, string | number> = { page, limit: 15 };

      if (customerFilter) params.customer = customerFilter;
      if (statusFilter !== 'all') params.status = statusFilter;
      if (dateFilter !== 'all') {
        const now = new Date();
        if (dateFilter === 'today') {
          params.startDate = now.toISOString().split('T')[0];
          params.endDate = now.toISOString().split('T')[0];
        } else if (dateFilter === 'week') {
          const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          params.startDate = weekAgo.toISOString().split('T')[0];
        } else if (dateFilter === 'month') {
          const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          params.startDate = monthAgo.toISOString().split('T')[0];
        }
      }

      if (sortBy === 'highest') params.sortBy = 'totalAmount-desc';
      else if (sortBy === 'lowest') params.sortBy = 'totalAmount-asc';
      else if (sortBy === 'oldest') params.sortBy = 'createdAt-asc';

      if (searchQuery) params.search = searchQuery;

      const response = await api.get('/orders', { params });
      if (response.data.success) {
        setOrders(response.data.data.orders);
        setTotalPages(response.data.data.pagination?.pages || 1);
      }
    } catch (error) {
      console.error('Error fetching orders:', error);
    } finally {
      setLoading(false);
    }
  }

  const handleStatusUpdate = async () => {
    if (!updatingOrder || !newStatus) return;

    setUpdating(true);
    try {
      await api.put(`/orders/${updatingOrder._id}/status`, {
        orderStatus: newStatus,
        adminNote: adminNotes
      });
      await Promise.all([fetchOrders(), fetchStats()]);
      setShowStatusModal(false);
      setUpdatingOrder(null);
      setNewStatus('');
      setAdminNotes('');
      setToast({ type: 'success', message: 'Order status updated successfully.' });
    } catch (error) {
      console.error('Error updating order status:', error);
      setToast({ type: 'error', message: 'Failed to update order status.' });
    } finally {
      setUpdating(false);
    }
  };

  const isCodEligible = (order: Order | null) => Boolean(
    order
    && String(order.paymentMethod).toLowerCase() === 'cod'
    && order.orderStatus === 'Delivered'
    && order.paymentStatus === 'Pending'
  );

  const handleConfirmCodPayment = async () => {
    if (!codOrderToMark || markingCod) return;
    setMarkingCod(true);
    try {
      const response = await api.patch(`/orders/${codOrderToMark._id}/payment-status`, {
        paymentStatus: 'Paid',
        adminNote: codAdminNote.trim()
      });
      if (response.data.success) {
        const updatedOrder = response.data.data.order;
        setOrders((prev) => prev.map((o) => (o._id === updatedOrder._id ? { ...o, ...updatedOrder } : o)));
        if (selectedOrder && selectedOrder._id === updatedOrder._id) {
          setSelectedOrder({ ...selectedOrder, ...updatedOrder });
        }
        await Promise.all([fetchOrders(), fetchStats()]);
        setCodOrderToMark(null);
        setCodAdminNote('');
        setToast({
          type: 'success',
          message: `COD payment marked as Paid for order ${updatedOrder.orderId || updatedOrder._id}.`
        });
      }
    } catch (err: unknown) {
      console.error('Error marking COD payment:', err);
      const errorMsg = (err as { response?: { data?: { message?: string; error?: { message?: string } } } })?.response?.data?.message
        || (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message
        || 'Failed to record COD payment';
      setToast({ type: 'error', message: errorMsg });
    } finally {
      setMarkingCod(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Delivered': return { bg: 'rgba(22, 163, 74, 0.12)', color: 'var(--success-text)', icon: CheckCircle };
      case 'Shipped': return { bg: 'var(--info-light)', color: 'var(--info-text)', icon: Truck };
      case 'Processing': return { bg: 'rgba(245, 158, 11, 0.12)', color: 'var(--warning-text)', icon: Package };
      case 'Confirmed': return { bg: 'var(--info-light)', color: 'var(--info-text)', icon: CheckCircle };
      case 'Pending': return { bg: 'var(--bg-primary)', color: 'var(--text-secondary)', icon: Clock };
      case 'Cancelled': return { bg: 'rgba(220, 38, 38, 0.1)', color: 'var(--danger-text)', icon: XCircle };
      default: return { bg: 'var(--bg-primary)', color: 'var(--text-secondary)', icon: Clock };
    }
  };

  const getPaymentStatusColor = (status: string) => {
    switch (status) {
      case 'Paid': return { bg: 'rgba(22, 163, 74, 0.12)', color: 'var(--success-text)' };
      case 'Pending': return { bg: 'rgba(245, 158, 11, 0.12)', color: 'var(--warning-text)' };
      case 'Failed': return { bg: 'rgba(220, 38, 38, 0.1)', color: 'var(--danger-text)' };
      default: return { bg: 'var(--bg-primary)', color: 'var(--text-secondary)' };
    }
  };

  const filteredOrders = orders.filter(order => {
    const matchesSearch = !searchQuery ||
      order.orderId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      order.shippingAddress.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      order.shippingAddress.phone.includes(searchQuery);
    return matchesSearch;
  });

  const stats = {
    total: serverStats ? serverStats.totalOrders : orders.length,
    pending: serverStats ? serverStats.pendingOrders : orders.filter(o => o.orderStatus === 'Pending').length,
    processing: serverStats ? serverStats.processingOrders : orders.filter(o => o.orderStatus === 'Processing').length,
    shipped: serverStats ? serverStats.shippedOrders : orders.filter(o => o.orderStatus === 'Shipped').length,
    delivered: serverStats ? serverStats.deliveredOrders : orders.filter(o => o.orderStatus === 'Delivered').length,
    totalRevenue: serverStats ? serverStats.totalRevenue : 0,
    averageOrderValue: (serverStats && serverStats.totalOrders > 0)
      ? serverStats.totalRevenue / serverStats.totalOrders
      : (orders.length > 0 ? (serverStats ? serverStats.totalRevenue : 0) / orders.length : 0)
  };

  const exportToCSV = () => {
    const headers = ['Order ID', 'Customer', 'Phone', 'City', 'Order Status', 'Payment Status', 'Total (PKR)', 'Date'];
    const rows = filteredOrders.map((o) => [
      o.orderId || o._id,
      o.shippingAddress?.fullName || 'N/A',
      o.shippingAddress?.phone || 'N/A',
      o.shippingAddress?.city || 'N/A',
      o.orderStatus || 'Pending',
      o.paymentStatus || 'Pending',
      o.totalAmount ?? 0,
      new Date(o.createdAt).toLocaleDateString()
    ]);
    exportCsvFile(`orders-${new Date().toISOString().split('T')[0]}.csv`, headers, rows);
  };

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
      {/* Toast Notification Banner */}
      {toast && (
        <div
          role="alert"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 18px',
            backgroundColor: toast.type === 'success' ? 'rgba(22, 163, 74, 0.12)' : 'rgba(220, 38, 38, 0.12)',
            color: toast.type === 'success' ? 'var(--success-text)' : 'var(--danger-text)',
            border: `1px solid ${toast.type === 'success' ? 'rgba(22, 163, 74, 0.3)' : 'rgba(220, 38, 38, 0.3)'}`,
            borderRadius: '12px',
            marginBottom: '24px',
            fontSize: '14px',
            fontWeight: '600'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {toast.type === 'success' ? <CheckCircle size={18} /> : <AlertCircle size={18} />}
            <span>{toast.message}</span>
          </div>
          <button
            onClick={() => setToast(null)}
            aria-label="Dismiss message"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'inherit',
              padding: '4px'
            }}
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '28px', fontWeight: '800', color: 'var(--text-primary)', marginBottom: '8px', letterSpacing: '-0.5px' }}>
            Orders
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '15px' }}>
            Manage customer orders, update status, and track shipments.
          </p>
        </div>
        <button
          onClick={exportToCSV}
          style={{
            padding: '12px 20px',
            backgroundColor: 'var(--card-bg)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border-color)',
            borderRadius: '10px',
            fontWeight: '700',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            transition: 'all 0.2s'
          }}
          onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'var(--hover-bg)'; }}
          onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'var(--card-bg)'; }}
        >
          <Download size={18} /> Export Current View ({filteredOrders.length})
        </button>
      </div>

      {/* Customer Filter Banner */}
      {customerFilter && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 18px',
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          border: '1px solid var(--border-color)',
          borderRadius: '12px',
          marginBottom: '24px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-primary)', fontSize: '14px', fontWeight: '600' }}>
            <User size={16} color="var(--primary)" />
            <span>Filtered by Customer ID: <strong style={{ color: 'var(--primary)' }}>{customerFilter}</strong></span>
          </div>
          <button
            onClick={() => {
              setPage(1);
              router.replace('/orders');
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              background: 'none',
              border: 'none',
              color: 'var(--danger-text)',
              cursor: 'pointer',
              fontWeight: '700',
              fontSize: '13px'
            }}
          >
            <X size={16} /> Clear Customer Filter
          </button>
        </div>
      )}

      {/* Stats Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '16px',
        marginBottom: '24px'
      }}>
        <div style={{ backgroundColor: 'var(--card-bg)', borderRadius: '12px', padding: '20px', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '10px', backgroundColor: 'var(--info-light)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ShoppingCart size={24} color="var(--info-text)" />
          </div>
          <div>
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: '500', marginBottom: '4px' }}>Total Orders</div>
            <div style={{ fontSize: '24px', fontWeight: '800', color: 'var(--text-primary)' }}>{stats.total}</div>
          </div>
        </div>

        <div style={{ backgroundColor: 'var(--card-bg)', borderRadius: '12px', padding: '20px', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '10px', backgroundColor: 'rgba(245, 158, 11, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Clock size={24} color="var(--warning-text)" />
          </div>
          <div>
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: '500', marginBottom: '4px' }}>Pending</div>
            <div style={{ fontSize: '24px', fontWeight: '800', color: 'var(--text-primary)' }}>{stats.pending}</div>
          </div>
        </div>

        <div style={{ backgroundColor: 'var(--card-bg)', borderRadius: '12px', padding: '20px', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '10px', backgroundColor: 'var(--info-light)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Truck size={24} color="var(--info-text)" />
          </div>
          <div>
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: '500', marginBottom: '4px' }}>Shipped</div>
            <div style={{ fontSize: '24px', fontWeight: '800', color: 'var(--text-primary)' }}>{stats.shipped}</div>
          </div>
        </div>

        <div style={{ backgroundColor: 'var(--card-bg)', borderRadius: '12px', padding: '20px', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '10px', backgroundColor: 'rgba(255, 138, 0, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <DollarSign size={24} color="var(--accent-text)" />
          </div>
          <div>
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: '500', marginBottom: '4px' }}>Revenue</div>
            <div style={{ fontSize: '24px', fontWeight: '800', color: 'var(--text-primary)' }}>
              Rs. {stats.totalRevenue >= 1000 ? `${(stats.totalRevenue / 1000).toFixed(1)}k` : stats.totalRevenue.toLocaleString()}
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div style={{
        backgroundColor: 'var(--card-bg)',
        borderRadius: '12px',
        padding: '16px 20px',
        border: '1px solid var(--border-color)',
        marginBottom: '24px',
        display: 'flex',
        gap: '12px',
        flexWrap: 'wrap',
        alignItems: 'center'
      }}>
        <div style={{ flex: 1, minWidth: '280px', position: 'relative' }}>
          <Search size={18} color="var(--text-secondary)" style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)' }} />
          <input
            type="text"
            placeholder="Search by Order ID, customer name, or phone..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 14px 10px 42px',
              borderRadius: '8px',
              border: '1px solid var(--border-color)',
              backgroundColor: 'var(--input-bg)',
              color: 'var(--text-primary)',
              fontSize: '14px',
              outline: 'none'
            }}
          />
        </div>

        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value as typeof statusFilter);
            setPage(1);
          }}
          style={{
            padding: '10px 32px 10px 14px',
            borderRadius: '8px',
            border: '1px solid var(--border-color)',
            backgroundColor: 'var(--input-bg)',
            color: 'var(--text-primary)',
            fontSize: '14px',
            fontWeight: '500',
            outline: 'none',
            cursor: 'pointer'
          }}
        >
          <option value="all">All Status</option>
              <option value="Pending">Pending</option>
              <option value="Confirmed">Confirmed</option>
              <option value="Processing">Processing</option>
          <option value="Shipped">Shipped</option>
          <option value="Delivered">Delivered</option>
          <option value="Cancelled">Cancelled</option>
        </select>

        <select
          value={dateFilter}
          onChange={(e) => {
            setDateFilter(e.target.value as typeof dateFilter);
            setPage(1);
          }}
          style={{
            padding: '10px 32px 10px 14px',
            borderRadius: '8px',
            border: '1px solid var(--border-color)',
            backgroundColor: 'var(--input-bg)',
            color: 'var(--text-primary)',
            fontSize: '14px',
            fontWeight: '500',
            outline: 'none',
            cursor: 'pointer'
          }}
        >
          <option value="all">All Time</option>
          <option value="today">Today</option>
          <option value="week">This Week</option>
          <option value="month">This Month</option>
        </select>

        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
          style={{
            padding: '10px 32px 10px 14px',
            borderRadius: '8px',
            border: '1px solid var(--border-color)',
            backgroundColor: 'var(--input-bg)',
            color: 'var(--text-primary)',
            fontSize: '14px',
            fontWeight: '500',
            outline: 'none',
            cursor: 'pointer'
          }}
        >
          <option value="newest">Newest First</option>
          <option value="oldest">Oldest First</option>
          <option value="highest">Highest Amount</option>
          <option value="lowest">Lowest Amount</option>
        </select>
      </div>

      {/* Orders Table */}
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {[...Array(6)].map((_, i) => (
            <div key={i} style={{
              backgroundColor: 'var(--card-bg)',
              borderRadius: '12px',
              height: '100px',
              animation: 'pulse 1.5s infinite',
              border: '1px solid var(--border-color)'
            }} />
          ))}
        </div>
      ) : filteredOrders.length === 0 ? (
        <div style={{
          backgroundColor: 'var(--card-bg)',
          borderRadius: '12px',
          padding: '80px 20px',
          textAlign: 'center',
          border: '1px solid var(--border-color)',
          borderStyle: 'dashed'
        }}>
          <ShoppingCart size={48} color="var(--text-secondary)" style={{ opacity: 0.3, marginBottom: '16px' }} />
          <h3 style={{ fontSize: '20px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '8px' }}>
            No orders found
          </h3>
          <p style={{ color: 'var(--text-secondary)' }}>Try adjusting your filters or search query</p>
        </div>
      ) : (
        <div style={{
          backgroundColor: 'var(--card-bg)',
          borderRadius: '12px',
          border: '1px solid var(--border-color)',
          overflow: 'hidden'
        }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '1000px' }}>
              <thead>
                <tr style={{ backgroundColor: 'var(--bg-primary)', borderBottom: '1px solid var(--border-color)' }}>
                  <th scope="col" style={{ padding: '16px 20px', textAlign: 'left', fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Order ID</th>
                  <th scope="col" style={{ padding: '16px 20px', textAlign: 'left', fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Customer</th>
                  <th scope="col" style={{ padding: '16px 20px', textAlign: 'left', fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Date</th>
                  <th scope="col" style={{ padding: '16px 20px', textAlign: 'left', fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Total</th>
                  <th scope="col" style={{ padding: '16px 20px', textAlign: 'left', fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Payment</th>
                  <th scope="col" style={{ padding: '16px 20px', textAlign: 'left', fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Status</th>
                  <th scope="col" style={{ padding: '16px 20px', textAlign: 'right', fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Actions</th>
                </tr>
              </thead>
              <tbody style={{ borderTop: '1px solid var(--border-color)' }}>
                {filteredOrders.map((order) => {
                  const statusColor = getStatusColor(order.orderStatus);
                  const StatusIcon = statusColor.icon;
                  const paymentColor = getPaymentStatusColor(order.paymentStatus);

                  return (
                    <tr
                      key={order._id}
                      style={{ borderBottom: '1px solid var(--border-color)', transition: 'background-color 0.2s', cursor: 'pointer' }}
                      onClick={() => { setSelectedOrder(order); setShowDetails(true); }}
                      onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--hover-bg)'}
                      onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                      <td style={{ padding: '16px 20px' }}>
                        <div style={{ fontWeight: '700', color: 'var(--accent-text)', fontSize: '14px', fontFamily: 'monospace' }}>
                          #{order.orderId || order._id.slice(-8).toUpperCase()}
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                          {order.items.length} item(s)
                        </div>
                      </td>
                      <td style={{ padding: '16px 20px' }}>
                        <div style={{ fontWeight: '600', color: 'var(--text-primary)', fontSize: '14px' }}>
                          {order.shippingAddress.fullName}
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                          {order.shippingAddress.city}
                        </div>
                      </td>
                      <td style={{ padding: '16px 20px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <Calendar size={14} />
                          {new Date(order.createdAt).toLocaleDateString()}
                        </div>
                      </td>
                      <td style={{ padding: '16px 20px' }}>
                        <div style={{ fontWeight: '800', color: 'var(--text-primary)', fontSize: '15px' }}>
                          Rs. {order.totalAmount.toLocaleString()}
                        </div>
                      </td>
                      <td style={{ padding: '16px 20px' }}>
                        <div style={{
                          display: 'inline-flex',
                          padding: '6px 12px',
                          backgroundColor: paymentColor.bg,
                          color: paymentColor.color,
                          borderRadius: '20px',
                          fontSize: '12px',
                          fontWeight: '700'
                        }}>
                          {order.paymentStatus}
                        </div>
                      </td>
                      <td style={{ padding: '16px 20px' }}>
                        <div style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '6px 12px',
                          backgroundColor: statusColor.bg,
                          color: statusColor.color,
                          borderRadius: '20px',
                          fontSize: '12px',
                          fontWeight: '700'
                        }}>
                          <StatusIcon size={14} />
                          {order.orderStatus}
                        </div>
                      </td>
                      <td style={{ padding: '16px 20px', textAlign: 'right' }}>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                          <button
                            onClick={(e) => { e.stopPropagation(); setSelectedOrder(order); setShowDetails(true); }}
                            style={{
                              padding: '8px 12px',
                              backgroundColor: 'var(--bg-primary)',
                              color: 'var(--text-primary)',
                              border: '1px solid var(--border-color)',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              fontSize: '12px',
                              fontWeight: '600',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}
                          >
                            <Eye size={14} /> View
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setUpdatingOrder(order);
                              setNewStatus(order.orderStatus);
                              setShowStatusModal(true);
                            }}
                            style={{
                              padding: '8px 12px',
                              backgroundColor: 'var(--info-light)',
                              color: 'var(--info-text)',
                              border: 'none',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              fontSize: '12px',
                              fontWeight: '600',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}
                          >
                            <Truck size={14} /> Update
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          gap: '8px',
          marginTop: '32px',
          padding: '20px',
          backgroundColor: 'var(--card-bg)',
          borderRadius: '12px',
          border: '1px solid var(--border-color)'
        }}>
          <button
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page === 1}
            style={{
              padding: '10px 16px',
              backgroundColor: page === 1 ? 'var(--bg-primary)' : 'var(--card-bg)',
              color: page === 1 ? 'var(--text-secondary)' : 'var(--text-primary)',
              border: '1px solid var(--border-color)',
              borderRadius: '8px',
              cursor: page === 1 ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '14px',
              fontWeight: '600'
            }}
          >
            <ChevronLeft size={16} /> Prev
          </button>

          <span style={{ padding: '10px 16px', color: 'var(--text-secondary)', fontSize: '14px', fontWeight: '600' }}>
            Page {page} of {totalPages}
          </span>

          <button
            onClick={() => setPage(Math.min(totalPages, page + 1))}
            disabled={page === totalPages}
            style={{
              padding: '10px 16px',
              backgroundColor: page === totalPages ? 'var(--bg-primary)' : 'var(--card-bg)',
              color: page === totalPages ? 'var(--text-secondary)' : 'var(--text-primary)',
              border: '1px solid var(--border-color)',
              borderRadius: '8px',
              cursor: page === totalPages ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '14px',
              fontWeight: '600'
            }}
          >
            Next <ChevronRight size={16} />
          </button>
        </div>
      )}

      {/* Order Details Modal */}
      {showDetails && selectedOrder && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '20px'
          }}
          onClick={() => setShowDetails(false)}
        >
          <div
            style={{
              backgroundColor: 'var(--card-bg)',
              borderRadius: '16px',
              padding: '32px',
              maxWidth: '900px',
              width: '100%',
              maxHeight: '90vh',
              overflowY: 'auto'
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
              <div>
                <h2 style={{ fontSize: '24px', fontWeight: '800', color: 'var(--text-primary)', marginBottom: '8px' }}>
                  Order #{selectedOrder.orderId || selectedOrder._id.slice(-8).toUpperCase()}
                </h2>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                  <span style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
                    {new Date(selectedOrder.createdAt).toLocaleString()}
                  </span>
                  <span style={{
                    padding: '4px 12px',
                    backgroundColor: getStatusColor(selectedOrder.orderStatus).bg,
                    color: getStatusColor(selectedOrder.orderStatus).color,
                    borderRadius: '12px',
                    fontSize: '12px',
                    fontWeight: '700'
                  }}>
                    {selectedOrder.orderStatus}
                  </span>
                </div>
              </div>
              <button onClick={() => setShowDetails(false)} style={{ padding: '8px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                <X size={24} />
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '24px' }}>
              {/* Customer Info */}
              <div style={{ backgroundColor: 'var(--bg-primary)', borderRadius: '12px', padding: '20px' }}>
                <h3 style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-secondary)', marginBottom: '16px', textTransform: 'uppercase' }}>
                  Customer Information
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Name</div>
                    <div style={{ fontWeight: '600', color: 'var(--text-primary)' }}>{selectedOrder.shippingAddress.fullName}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Phone</div>
                    <div style={{ fontWeight: '600', color: 'var(--text-primary)' }}>{selectedOrder.shippingAddress.phone}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Address</div>
                    <div style={{ fontWeight: '600', color: 'var(--text-primary)', fontSize: '13px' }}>
                      {selectedOrder.shippingAddress.address}, {selectedOrder.shippingAddress.city} {selectedOrder.shippingAddress.postalCode}
                    </div>
                  </div>
                </div>
              </div>

              {/* Payment Info */}
              <div style={{ backgroundColor: 'var(--bg-primary)', borderRadius: '12px', padding: '20px' }}>
                <h3 style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-secondary)', marginBottom: '16px', textTransform: 'uppercase' }}>
                  Payment Information
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Method</div>
                    <div style={{ fontWeight: '600', color: 'var(--text-primary)' }}>{selectedOrder.paymentMethod}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Status</div>
                    <span style={{
                      padding: '4px 12px',
                      backgroundColor: getPaymentStatusColor(selectedOrder.paymentStatus).bg,
                      color: getPaymentStatusColor(selectedOrder.paymentStatus).color,
                      borderRadius: '12px',
                      fontSize: '12px',
                      fontWeight: '700'
                    }}>
                      {selectedOrder.paymentStatus}
                    </span>
                  </div>
                  {selectedOrder.payment?.paidAt && (
                    <div>
                      <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Paid Date</div>
                      <div style={{ fontWeight: '600', color: 'var(--text-primary)', fontSize: '13px' }}>
                        {new Date(selectedOrder.payment.paidAt).toLocaleString()}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Order Items */}
            <div style={{ backgroundColor: 'var(--bg-primary)', borderRadius: '12px', padding: '20px', marginBottom: '24px' }}>
              <h3 style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-secondary)', marginBottom: '16px', textTransform: 'uppercase' }}>
                Order Items ({selectedOrder.items.length})
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {selectedOrder.items.map((item, index) => (
                  <div key={index} style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '16px',
                    padding: '12px',
                    backgroundColor: 'var(--card-bg)',
                    borderRadius: '8px',
                    border: '1px solid var(--border-color)'
                  }}>
                    <img
                      src={item.image || PRODUCT_PLACEHOLDER}
                      alt={item.name}
                      onError={(e) => { (e.currentTarget as HTMLImageElement).src = PRODUCT_PLACEHOLDER; }}
                      style={{ width: '60px', height: '60px', borderRadius: '8px', objectFit: 'cover' }}
                    />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: '600', color: 'var(--text-primary)', fontSize: '14px' }}>{item.name}</div>
                      {item.variant && (
                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>{item.variant}</div>
                      )}
                      <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>Qty: {item.quantity}</div>
                    </div>
                    <div style={{ fontWeight: '800', color: 'var(--text-primary)', fontSize: '15px' }}>
                      Rs. {(item.price * item.quantity).toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Order Summary */}
            <div style={{ backgroundColor: 'var(--bg-primary)', borderRadius: '12px', padding: '20px' }}>
              <h3 style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-secondary)', marginBottom: '16px', textTransform: 'uppercase' }}>
                Order Summary
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Subtotal</span>
                  <span style={{ fontWeight: '600', color: 'var(--text-primary)' }}>Rs. {selectedOrder.subtotal.toLocaleString()}</span>
                </div>
                {selectedOrder.discount > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', color: 'var(--accent-text)' }}>
                    <span>Discount</span>
                    <span style={{ fontWeight: '600' }}>-Rs. {selectedOrder.discount.toLocaleString()}</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Shipping</span>
                  <span style={{ fontWeight: '600', color: 'var(--text-primary)' }}>
                    {selectedOrder.shippingCost === 0 ? 'FREE' : `Rs. ${selectedOrder.shippingCost.toLocaleString()}`}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '18px', fontWeight: '800', color: 'var(--text-primary)', paddingTop: '12px', borderTop: '2px solid var(--border-color)' }}>
                  <span>Total</span>
                  <span>Rs. {selectedOrder.totalAmount.toLocaleString()}</span>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '24px' }}>
              <button
                onClick={() => setShowDetails(false)}
                style={{
                  padding: '12px 24px',
                  backgroundColor: 'var(--card-bg)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '10px',
                  fontWeight: '700',
                  cursor: 'pointer'
                }}
              >
                Close
              </button>
              {isCodEligible(selectedOrder) && (
                <button
                  onClick={() => {
                    setCodOrderToMark(selectedOrder);
                    setCodAdminNote('');
                  }}
                  style={{
                    padding: '12px 24px',
                    backgroundColor: 'var(--success-text)',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '10px',
                    fontWeight: '700',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}
                >
                  <CheckCircle size={18} /> Mark COD as Paid
                </button>
              )}
              <button
                onClick={() => {
                  setShowDetails(false);
                  setUpdatingOrder(selectedOrder);
                  setNewStatus(selectedOrder.orderStatus);
                  setShowStatusModal(true);
                }}
                style={{
                  padding: '12px 24px',
                  backgroundColor: 'var(--primary)',
                  color: '#0B132B',
                  border: 'none',
                  borderRadius: '10px',
                  fontWeight: '700',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                <Truck size={18} /> Update Status
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Status Update Modal */}
      {showStatusModal && updatingOrder && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '20px'
          }}
          onClick={() => setShowStatusModal(false)}
        >
          <div
            style={{
              backgroundColor: 'var(--card-bg)',
              borderRadius: '16px',
              padding: '32px',
              maxWidth: '500px',
              width: '100%'
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h2 style={{ fontSize: '24px', fontWeight: '800', color: 'var(--text-primary)' }}>
                Update Order Status
              </h2>
              <button onClick={() => setShowStatusModal(false)} style={{ padding: '8px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                <X size={24} />
              </button>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '8px' }}>Order</div>
              <div style={{ fontWeight: '700', color: 'var(--text-primary)', fontSize: '16px' }}>
                #{updatingOrder.orderId || updatingOrder._id.slice(-8).toUpperCase()}
              </div>
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                {updatingOrder.shippingAddress.fullName} - Rs. {updatingOrder.totalAmount.toLocaleString()}
              </div>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' }}>
                New Status
              </label>
              <select
                value={newStatus}
                onChange={(e) => setNewStatus(e.target.value)}
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  borderRadius: '8px',
                  border: '1px solid var(--border-color)',
                  backgroundColor: 'var(--input-bg)',
                  color: 'var(--text-primary)',
                  fontSize: '14px',
                  outline: 'none'
                }}
              >
              <option value="Pending">Pending</option>
              <option value="Confirmed">Confirmed</option>
              <option value="Processing">Processing</option>
                <option value="Shipped">Shipped</option>
                <option value="Delivered">Delivered</option>
                <option value="Cancelled">Cancelled</option>
              </select>
            </div>

            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' }}>
                Admin Notes (Optional)
              </label>
              <textarea
                value={adminNotes}
                onChange={(e) => setAdminNotes(e.target.value)}
                placeholder="Add notes about this status update..."
                rows={3}
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  borderRadius: '8px',
                  border: '1px solid var(--border-color)',
                  backgroundColor: 'var(--input-bg)',
                  color: 'var(--text-primary)',
                  fontSize: '14px',
                  outline: 'none',
                  resize: 'vertical'
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowStatusModal(false)}
                style={{
                  padding: '12px 24px',
                  backgroundColor: 'var(--card-bg)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '10px',
                  fontWeight: '700',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleStatusUpdate}
                disabled={updating || !newStatus}
                style={{
                  padding: '12px 24px',
                  backgroundColor: updating ? 'var(--text-secondary)' : 'var(--primary)',
                  color: updating ? '#FFFFFF' : '#0B132B',
                  border: 'none',
                  borderRadius: '10px',
                  fontWeight: '700',
                  cursor: updating ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                {updating ? <Loader size={18} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={18} />}
                {updating ? 'Updating...' : 'Update Status'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mark COD as Paid Confirmation Modal */}
      {codOrderToMark && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1100,
            padding: '20px'
          }}
          onClick={() => { if (!markingCod) setCodOrderToMark(null); }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="cod-modal-title"
            style={{
              backgroundColor: 'var(--card-bg)',
              borderRadius: '16px',
              padding: '28px',
              maxWidth: '520px',
              width: '100%',
              border: '1px solid var(--border-color)',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)'
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 id="cod-modal-title" style={{ fontSize: '20px', fontWeight: '800', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <CheckCircle size={22} color="var(--success-text)" /> Confirm COD Payment
              </h2>
              <button
                onClick={() => { if (!markingCod) setCodOrderToMark(null); }}
                disabled={markingCod}
                aria-label="Close modal"
                style={{ padding: '6px', background: 'none', border: 'none', cursor: markingCod ? 'not-allowed' : 'pointer', color: 'var(--text-secondary)' }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ backgroundColor: 'var(--bg-primary)', borderRadius: '12px', padding: '16px', marginBottom: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '14px' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Order Reference</span>
                <span style={{ fontWeight: '700', color: 'var(--text-primary)' }}>{codOrderToMark.orderId || codOrderToMark._id}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '14px' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Customer</span>
                <span style={{ fontWeight: '600', color: 'var(--text-primary)' }}>{codOrderToMark.shippingAddress?.fullName || 'Customer'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '16px', borderTop: '1px solid var(--border-color)', paddingTop: '10px' }}>
                <span style={{ color: 'var(--text-primary)', fontWeight: '700' }}>Amount to Collect</span>
                <span style={{ fontWeight: '800', color: 'var(--success-text)' }}>Rs. {codOrderToMark.totalAmount.toLocaleString()}</span>
              </div>
            </div>

            <div style={{ marginBottom: '24px' }}>
              <label
                htmlFor="cod-admin-note"
                style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' }}
              >
                Admin Note (Optional)
              </label>
              <textarea
                id="cod-admin-note"
                value={codAdminNote}
                onChange={(e) => setCodAdminNote(e.target.value)}
                maxLength={500}
                rows={3}
                placeholder="e.g. COD collected on delivery"
                disabled={markingCod}
                style={{
                  width: '100%',
                  padding: '12px',
                  backgroundColor: 'var(--input-bg)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                  color: 'var(--text-primary)',
                  fontSize: '14px',
                  resize: 'vertical',
                  outline: 'none'
                }}
              />
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', textAlign: 'right', marginTop: '4px' }}>
                {codAdminNote.length}/500
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setCodOrderToMark(null)}
                disabled={markingCod}
                style={{
                  padding: '10px 20px',
                  backgroundColor: 'var(--card-bg)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                  fontWeight: '600',
                  cursor: markingCod ? 'not-allowed' : 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmCodPayment}
                disabled={markingCod}
                style={{
                  padding: '10px 20px',
                  backgroundColor: 'var(--success-text)',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '8px',
                  fontWeight: '700',
                  cursor: markingCod ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                {markingCod ? (
                  <>
                    <Loader size={16} className="animate-spin" /> Confirming...
                  </>
                ) : (
                  'Confirm COD Payment'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

export default function OrdersPage() {
  return (
    <Suspense fallback={<div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-secondary)' }}>Loading orders...</div>}>
      <OrdersListContent />
    </Suspense>
  );
}

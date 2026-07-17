'use client';

import { useState, useEffect } from 'react';
import { 
  ShoppingCart, Search, Filter, Download, Eye, 
  Truck, CheckCircle, Clock, XCircle, AlertCircle,
  Calendar, DollarSign, Package, MoreVertical,
  ChevronLeft, ChevronRight, X, Save, Loader
} from 'lucide-react';
import api from '@/lib/api';

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
  statusTimeline?: {
    status: string;
    timestamp: string;
    note?: string;
  }[];
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'Pending' | 'Processing' | 'Shipped' | 'Delivered' | 'Cancelled'>('all');
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

  useEffect(() => {
    fetchOrders();
  }, [page, statusFilter, dateFilter, sortBy]);

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const params: any = { page, limit: 15 };
      
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
        setOrders(response.data.data);
        setTotalPages(response.data.pagination?.pages || 1);
      }
    } catch (error) {
      console.error('Error fetching orders:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleStatusUpdate = async () => {
    if (!updatingOrder || !newStatus) return;
    
    setUpdating(true);
    try {
      await api.put(`/orders/${updatingOrder._id}/status`, {
        orderStatus: newStatus,
        adminNotes
      });
      await fetchOrders();
      setShowStatusModal(false);
      setUpdatingOrder(null);
      setNewStatus('');
      setAdminNotes('');
      alert('Order status updated successfully!');
    } catch (error) {
      console.error('Error updating order status:', error);
      alert('Failed to update order status');
    } finally {
      setUpdating(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Delivered': return { bg: '#D1FAE5', color: '#0F766E', icon: CheckCircle };
      case 'Shipped': return { bg: '#DBEAFE', color: '#1E40AF', icon: Truck };
      case 'Processing': return { bg: '#FEF3C7', color: '#92400E', icon: Package };
      case 'Pending': return { bg: '#F3F4F6', color: '#6B7280', icon: Clock };
      case 'Cancelled': return { bg: '#FEE2E2', color: '#DC2626', icon: XCircle };
      default: return { bg: '#F3F4F6', color: '#6B7280', icon: Clock };
    }
  };

  const getPaymentStatusColor = (status: string) => {
    switch (status) {
      case 'Paid': return { bg: '#D1FAE5', color: '#0F766E' };
      case 'Pending': return { bg: '#FEF3C7', color: '#92400E' };
      case 'Failed': return { bg: '#FEE2E2', color: '#DC2626' };
      default: return { bg: '#F3F4F6', color: '#6B7280' };
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
    total: orders.length,
    pending: orders.filter(o => o.orderStatus === 'Pending').length,
    processing: orders.filter(o => o.orderStatus === 'Processing').length,
    shipped: orders.filter(o => o.orderStatus === 'Shipped').length,
    delivered: orders.filter(o => o.orderStatus === 'Delivered').length,
    totalRevenue: orders.reduce((acc, o) => acc + o.totalAmount, 0),
    averageOrderValue: orders.length > 0 ? orders.reduce((acc, o) => acc + o.totalAmount, 0) / orders.length : 0
  };

  const exportToCSV = () => {
    const csvContent = [
      ['Order ID', 'Customer', 'Phone', 'City', 'Status', 'Payment', 'Total', 'Date'].join(','),
      ...filteredOrders.map(o => [
        o.orderId,
        o.shippingAddress.fullName,
        o.shippingAddress.phone,
        o.shippingAddress.city,
        o.orderStatus,
        o.paymentStatus,
        o.totalAmount,
        new Date(o.createdAt).toLocaleDateString()
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `orders-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
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
          <Download size={18} /> Export CSV
        </button>
      </div>

      {/* Stats Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '16px',
        marginBottom: '24px'
      }}>
        <div style={{ backgroundColor: 'var(--card-bg)', borderRadius: '12px', padding: '20px', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '10px', backgroundColor: '#DBEAFE', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ShoppingCart size={24} color="#3B82F6" />
          </div>
          <div>
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: '500', marginBottom: '4px' }}>Total Orders</div>
            <div style={{ fontSize: '24px', fontWeight: '800', color: 'var(--text-primary)' }}>{stats.total}</div>
          </div>
        </div>

        <div style={{ backgroundColor: 'var(--card-bg)', borderRadius: '12px', padding: '20px', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '10px', backgroundColor: '#FEF3C7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Clock size={24} color="#F59E0B" />
          </div>
          <div>
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: '500', marginBottom: '4px' }}>Pending</div>
            <div style={{ fontSize: '24px', fontWeight: '800', color: 'var(--text-primary)' }}>{stats.pending}</div>
          </div>
        </div>

        <div style={{ backgroundColor: 'var(--card-bg)', borderRadius: '12px', padding: '20px', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '10px', backgroundColor: '#DBEAFE', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Truck size={24} color="#3B82F6" />
          </div>
          <div>
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: '500', marginBottom: '4px' }}>Shipped</div>
            <div style={{ fontSize: '24px', fontWeight: '800', color: 'var(--text-primary)' }}>{stats.shipped}</div>
          </div>
        </div>

        <div style={{ backgroundColor: 'var(--card-bg)', borderRadius: '12px', padding: '20px', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '10px', backgroundColor: '#FEF3C7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <DollarSign size={24} color="#F59E0B" />
          </div>
          <div>
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: '500', marginBottom: '4px' }}>Revenue</div>
            <div style={{ fontSize: '24px', fontWeight: '800', color: 'var(--text-primary)' }}>Rs. {(stats.totalRevenue / 1000).toFixed(1)}k</div>
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
          onChange={(e) => { setStatusFilter(e.target.value as any); setPage(1); }}
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
          <option value="Processing">Processing</option>
          <option value="Shipped">Shipped</option>
          <option value="Delivered">Delivered</option>
          <option value="Cancelled">Cancelled</option>
        </select>

        <select
          value={dateFilter}
          onChange={(e) => { setDateFilter(e.target.value as any); setPage(1); }}
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
          onChange={(e) => setSortBy(e.target.value as any)}
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
                  <th style={{ padding: '16px 20px', textAlign: 'left', fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Order ID</th>
                  <th style={{ padding: '16px 20px', textAlign: 'left', fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Customer</th>
                  <th style={{ padding: '16px 20px', textAlign: 'left', fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Date</th>
                  <th style={{ padding: '16px 20px', textAlign: 'left', fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Total</th>
                  <th style={{ padding: '16px 20px', textAlign: 'left', fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Payment</th>
                  <th style={{ padding: '16px 20px', textAlign: 'left', fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Status</th>
                  <th style={{ padding: '16px 20px', textAlign: 'right', fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Actions</th>
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
                        <div style={{ fontWeight: '700', color: 'var(--primary)', fontSize: '14px', fontFamily: 'monospace' }}>
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
                        <div style={{ fontWeight: '800', color: 'var(--primary)', fontSize: '15px' }}>
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
                              color: 'var(--primary)',
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
                              backgroundColor: '#DBEAFE',
                              color: '#1E40AF',
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
                      src={item.image || 'https://via.placeholder.com/60x60'} 
                      alt={item.name}
                      style={{ width: '60px', height: '60px', borderRadius: '8px', objectFit: 'cover' }}
                    />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: '600', color: 'var(--text-primary)', fontSize: '14px' }}>{item.name}</div>
                      {item.variant && (
                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>{item.variant}</div>
                      )}
                      <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>Qty: {item.quantity}</div>
                    </div>
                    <div style={{ fontWeight: '700', color: 'var(--primary)', fontSize: '15px' }}>
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
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', color: '#10B981' }}>
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
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '18px', fontWeight: '800', color: 'var(--primary)', paddingTop: '12px', borderTop: '2px solid var(--border-color)' }}>
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
                  color: 'white',
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
                  color: 'white',
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
'use client';

import { useEffect, useState } from 'react';
import { 
  ShoppingCart, 
  Eye, 
  Filter,
  Search,
  Download,
  Package,
  Clock,
  CheckCircle,
  XCircle,
  Truck
} from 'lucide-react';
import api from '@/lib/api';
import Link from 'next/link';

interface Order {
  _id: string;
  orderId: string;
  user: {
    fullName: string;
    email: string;
  };
  items: Array<{
    name: string;
    quantity: number;
    price: number;
  }>;
  shippingAddress: {
    fullName: string;
    phone: string;
    city: string;
  };
  paymentMethod: string;
  paymentStatus: string;
  orderStatus: string;
  subtotal: number;
  shippingCost: number;
  totalAmount: number;
  createdAt: string;
}

interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  pages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [pagination, setPagination] = useState<PaginationInfo | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [stats, setStats] = useState<any>(null);

  useEffect(() => {
    fetchOrders();
    fetchStats();
  }, [currentPage, search, statusFilter]);

  const fetchOrders = async () => {
    try {
      setLoading(true);
      const params: any = {
        page: currentPage,
        limit: 10
      };
      
      if (search) params.search = search;
      if (statusFilter) params.status = statusFilter;

      const response = await api.get('/orders', { params });
      
      if (response.data.success) {
        setOrders(response.data.data);
        setPagination(response.data.pagination);
      }
    } catch (error) {
      console.error('Error fetching orders:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await api.get('/orders/stats');
      if (response.data.success) {
        setStats(response.data.data);
      }
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Pending':
        return { bg: '#FEF3C7', color: '#92400E', icon: Clock };
      case 'Processing':
        return { bg: '#DBEAFE', color: '#1E40AF', icon: Package };
      case 'Shipped':
        return { bg: '#FEF3C7', color: '#92400E', icon: Truck };
      case 'Delivered':
        return { bg: '#D1FAE5', color: '#0F766E', icon: CheckCircle };
      case 'Cancelled':
        return { bg: '#FEE2E2', color: '#DC2626', icon: XCircle };
      default:
        return { bg: '#F3F4F6', color: '#6B7280', icon: Clock };
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-PK', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ 
          fontSize: '32px', 
          fontWeight: '800', 
          color: 'var(--text-primary)',
          marginBottom: '8px'
        }}>
          Orders Management
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '15px' }}>
          Manage and track customer orders
        </p>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
          gap: '16px',
          marginBottom: '24px'
        }}>
          <div style={{
            backgroundColor: 'var(--card-bg)',
            padding: '20px',
            borderRadius: '12px',
            border: '1px solid var(--border-color)',
            display: 'flex',
            alignItems: 'center',
            gap: '16px'
          }}>
            <div style={{
              width: '48px',
              height: '48px',
              borderRadius: '10px',
              backgroundColor: '#DBEAFE',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <ShoppingCart size={24} color="#3B82F6" />
            </div>
            <div>
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                Total Orders
              </div>
              <div style={{ fontSize: '24px', fontWeight: '800', color: 'var(--text-primary)' }}>
                {stats.totalOrders || 0}
              </div>
            </div>
          </div>

          <div style={{
            backgroundColor: 'var(--card-bg)',
            padding: '20px',
            borderRadius: '12px',
            border: '1px solid var(--border-color)',
            display: 'flex',
            alignItems: 'center',
            gap: '16px'
          }}>
            <div style={{
              width: '48px',
              height: '48px',
              borderRadius: '10px',
              backgroundColor: '#FEF3C7',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Clock size={24} color="#F59E0B" />
            </div>
            <div>
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                Pending
              </div>
              <div style={{ fontSize: '24px', fontWeight: '800', color: 'var(--text-primary)' }}>
                {stats.pendingOrders || 0}
              </div>
            </div>
          </div>

          <div style={{
            backgroundColor: 'var(--card-bg)',
            padding: '20px',
            borderRadius: '12px',
            border: '1px solid var(--border-color)',
            display: 'flex',
            alignItems: 'center',
            gap: '16px'
          }}>
            <div style={{
              width: '48px',
              height: '48px',
              borderRadius: '10px',
              backgroundColor: '#D1FAE5',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <CheckCircle size={24} color="#10B981" />
            </div>
            <div>
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                Delivered
              </div>
              <div style={{ fontSize: '24px', fontWeight: '800', color: 'var(--text-primary)' }}>
                {stats.deliveredOrders || 0}
              </div>
            </div>
          </div>

          <div style={{
            backgroundColor: 'var(--card-bg)',
            padding: '20px',
            borderRadius: '12px',
            border: '1px solid var(--border-color)',
            display: 'flex',
            alignItems: 'center',
            gap: '16px'
          }}>
            <div style={{
              width: '48px',
              height: '48px',
              borderRadius: '10px',
              backgroundColor: '#FEE2E2',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <XCircle size={24} color="#EF4444" />
            </div>
            <div>
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                Cancelled
              </div>
              <div style={{ fontSize: '24px', fontWeight: '800', color: 'var(--text-primary)' }}>
                {stats.cancelledOrders || 0}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div style={{
        backgroundColor: 'var(--card-bg)',
        padding: '20px',
        borderRadius: '12px',
        border: '1px solid var(--border-color)',
        marginBottom: '24px'
      }}>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Search */}
          <div style={{ 
            flex: 1, 
            minWidth: '300px',
            position: 'relative' 
          }}>
            <Search 
              size={18} 
              style={{
                position: 'absolute',
                left: '16px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-secondary)'
              }}
            />
            <input
              type="text"
              placeholder="Search by Order ID, customer name, or phone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: '100%',
                padding: '12px 16px 12px 48px',
                border: '1px solid var(--border-color)',
                borderRadius: '10px',
                fontSize: '14px',
                outline: 'none',
                backgroundColor: 'var(--input-bg)',
                color: 'var(--text-primary)'
              }}
            />
          </div>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{
              padding: '12px 16px',
              border: '1px solid var(--border-color)',
              borderRadius: '10px',
              fontSize: '14px',
              backgroundColor: 'var(--input-bg)',
              color: 'var(--text-primary)',
              cursor: 'pointer',
              outline: 'none'
            }}
          >
            <option value="">All Status</option>
            <option value="Pending">Pending</option>
            <option value="Processing">Processing</option>
            <option value="Shipped">Shipped</option>
            <option value="Delivered">Delivered</option>
            <option value="Cancelled">Cancelled</option>
          </select>
        </div>
      </div>

      {/* Orders Table */}
      <div style={{
        backgroundColor: 'var(--card-bg)',
        borderRadius: '12px',
        border: '1px solid var(--border-color)',
        overflow: 'hidden'
      }}>
        {loading ? (
          <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-secondary)' }}>
            <div style={{
              width: '40px',
              height: '40px',
              border: '4px solid var(--border-color)',
              borderTop: '4px solid var(--primary)',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
              margin: '0 auto 16px'
            }} />
            Loading orders...
          </div>
        ) : orders.length === 0 ? (
          <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-secondary)' }}>
            <ShoppingCart size={64} style={{ margin: '0 auto 16px', opacity: 0.3 }} />
            <p style={{ fontSize: '18px', fontWeight: '600', marginBottom: '8px' }}>No orders found</p>
            <p>Orders will appear here once customers start purchasing</p>
          </div>
        ) : (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead style={{ backgroundColor: 'var(--bg-primary)' }}>
                  <tr>
                    <th style={{ padding: '16px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: '600' }}>
                      Order ID
                    </th>
                    <th style={{ padding: '16px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: '600' }}>
                      Customer
                    </th>
                    <th style={{ padding: '16px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: '600' }}>
                      Items
                    </th>
                    <th style={{ padding: '16px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: '600' }}>
                      Total
                    </th>
                    <th style={{ padding: '16px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: '600' }}>
                      Status
                    </th>
                    <th style={{ padding: '16px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: '600' }}>
                      Date
                    </th>
                    <th style={{ padding: '16px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: '600' }}>
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order) => {
                    const statusConfig = getStatusColor(order.orderStatus);
                    const StatusIcon = statusConfig.icon;
                    
                    return (
                      <tr 
                        key={order._id} 
                        style={{ 
                          borderBottom: '1px solid var(--border-color)',
                          transition: 'all 0.2s'
                        }}
                        onMouseEnter={e => {
                          e.currentTarget.style.backgroundColor = 'var(--hover-bg)';
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.backgroundColor = 'transparent';
                        }}
                      >
                        <td style={{ padding: '16px', fontFamily: 'monospace', fontWeight: '600', color: 'var(--primary)' }}>
                          {order.orderId}
                        </td>
                        <td style={{ padding: '16px' }}>
                          <div>
                            <div style={{ fontWeight: '600', color: 'var(--text-primary)' }}>
                              {order.shippingAddress.fullName}
                            </div>
                            <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                              {order.shippingAddress.phone}
                            </div>
                          </div>
                        </td>
                        <td style={{ padding: '16px', color: 'var(--text-secondary)' }}>
                          {order.items.length} items
                        </td>
                        <td style={{ padding: '16px', fontWeight: '600', color: 'var(--text-primary)' }}>
                          Rs. {order.totalAmount.toLocaleString()}
                        </td>
                        <td style={{ padding: '16px' }}>
                          <span style={{
                            padding: '8px 16px',
                            backgroundColor: statusConfig.bg,
                            color: statusConfig.color,
                            borderRadius: '20px',
                            fontSize: '13px',
                            fontWeight: '600',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px'
                          }}>
                            <StatusIcon size={14} />
                            {order.orderStatus}
                          </span>
                        </td>
                        <td style={{ padding: '16px', color: 'var(--text-secondary)', fontSize: '14px' }}>
                          {formatDate(order.createdAt)}
                        </td>
                        <td style={{ padding: '16px' }}>
                          <Link
                            href={`/orders/${order._id}`}
                            style={{
                              padding: '8px 16px',
                              backgroundColor: 'var(--primary)',
                              color: 'white',
                              border: 'none',
                              borderRadius: '8px',
                              cursor: 'pointer',
                              textDecoration: 'none',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                              fontWeight: '600',
                              fontSize: '13px'
                            }}
                          >
                            <Eye size={16} />
                            View
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {pagination && pagination.pages > 1 && (
              <div style={{
                padding: '20px',
                borderTop: '1px solid var(--border-color)',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                gap: '8px'
              }}>
                <button
                  onClick={() => setCurrentPage(pagination.page - 1)}
                  disabled={!pagination.hasPrev}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: pagination.hasPrev ? 'var(--primary)' : '#9CA3AF',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: pagination.hasPrev ? 'pointer' : 'not-allowed',
                    fontWeight: '600'
                  }}
                >
                  Previous
                </button>
                
                <div style={{ display: 'flex', gap: '4px' }}>
                  {Array.from({ length: pagination.pages }, (_, i) => i + 1).map(page => (
                    <button
                      key={page}
                      onClick={() => setCurrentPage(page)}
                      style={{
                        padding: '8px 16px',
                        backgroundColor: page === pagination.page ? 'var(--primary)' : 'var(--card-bg)',
                        color: page === pagination.page ? 'white' : 'var(--text-primary)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        fontWeight: page === pagination.page ? '700' : '500'
                      }}
                    >
                      {page}
                    </button>
                  ))}
                </div>

                <button
                  onClick={() => setCurrentPage(pagination.page + 1)}
                  disabled={!pagination.hasNext}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: pagination.hasNext ? 'var(--primary)' : '#9CA3AF',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: pagination.hasNext ? 'pointer' : 'not-allowed',
                    fontWeight: '600'
                  }}
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </div>

      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
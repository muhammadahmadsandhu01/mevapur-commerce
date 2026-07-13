'use client';

import { useEffect, useState } from 'react';
import { 
  Users, 
  Search, 
  Eye, 
  Ban, 
  CheckCircle,
  ShoppingBag,
  DollarSign,
  UserPlus,
  AlertCircle,
  Loader
} from 'lucide-react';
import api from '@/lib/api';
import Link from 'next/link';

interface Customer {
  _id: string;
  fullName: string;
  email: string;
  phone: string;
  role: string;
  isBlocked: boolean;
  createdAt: string;
  orderCount: number;
  totalSpent: number;
}

interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  pages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [pagination, setPagination] = useState<PaginationInfo | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [stats, setStats] = useState<any>(null);

  useEffect(() => {
    fetchCustomers();
    fetchStats();
  }, [currentPage, search, statusFilter]);

  const fetchCustomers = async () => {
    try {
      setLoading(true);
      const params: any = { page: currentPage, limit: 10 };
      if (search) params.search = search;
      if (statusFilter) params.status = statusFilter;

      const response = await api.get('/customers', { params });
      if (response.data.success) {
        setCustomers(response.data.data);
        setPagination(response.data.pagination);
      }
    } catch (error) {
      console.error('Error fetching customers:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await api.get('/customers/stats');
      if (response.data.success) {
        setStats(response.data.data);
      }
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  const handleToggleBlock = async (customerId: string, isBlocked: boolean) => {
    const action = isBlocked ? 'unblock' : 'block';
    if (!confirm(`Are you sure you want to ${action} this customer?`)) return;

    try {
      const response = await api.put(`/customers/${customerId}/block`);
      if (response.data.success) {
        setCustomers(customers.map(c => 
          c._id === customerId ? { ...c, isBlocked: !c.isBlocked } : c
        ));
      }
    } catch (error) {
      console.error('Error toggling block:', error);
      alert('Failed to update customer status');
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-PK', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
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
          Customers Management
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '15px' }}>
          Manage your customer base and their activities
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
              <Users size={24} color="#3B82F6" />
            </div>
            <div>
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                Total Customers
              </div>
              <div style={{ fontSize: '24px', fontWeight: '800', color: 'var(--text-primary)' }}>
                {stats.totalCustomers || 0}
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
                Active
              </div>
              <div style={{ fontSize: '24px', fontWeight: '800', color: 'var(--text-primary)' }}>
                {stats.activeCustomers || 0}
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
              <Ban size={24} color="#EF4444" />
            </div>
            <div>
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                Blocked
              </div>
              <div style={{ fontSize: '24px', fontWeight: '800', color: 'var(--text-primary)' }}>
                {stats.blockedCustomers || 0}
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
              <UserPlus size={24} color="#F59E0B" />
            </div>
            <div>
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                New Today
              </div>
              <div style={{ fontSize: '24px', fontWeight: '800', color: 'var(--text-primary)' }}>
                {stats.newCustomers || 0}
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
          <div style={{ flex: 1, minWidth: '300px', position: 'relative' }}>
            <Search size={18} style={{
              position: 'absolute', left: '16px', top: '50%',
              transform: 'translateY(-50%)', color: 'var(--text-secondary)'
            }} />
            <input
              type="text"
              placeholder="Search by name, email, or phone..."
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
            <option value="">All Customers</option>
            <option value="active">Active</option>
            <option value="blocked">Blocked</option>
          </select>
        </div>
      </div>

      {/* Customers Table */}
      <div style={{
        backgroundColor: 'var(--card-bg)',
        borderRadius: '12px',
        border: '1px solid var(--border-color)',
        overflow: 'hidden'
      }}>
        {loading ? (
          <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-secondary)' }}>
            <Loader size={40} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />
            Loading customers...
          </div>
        ) : customers.length === 0 ? (
          <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-secondary)' }}>
            <Users size={64} style={{ margin: '0 auto 16px', opacity: 0.3 }} />
            <p style={{ fontSize: '18px', fontWeight: '600', marginBottom: '8px' }}>No customers found</p>
          </div>
        ) : (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead style={{ backgroundColor: 'var(--bg-primary)' }}>
                  <tr>
                    <th style={{ padding: '16px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: '600' }}>Customer</th>
                    <th style={{ padding: '16px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: '600' }}>Contact</th>
                    <th style={{ padding: '16px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: '600' }}>Orders</th>
                    <th style={{ padding: '16px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: '600' }}>Total Spent</th>
                    <th style={{ padding: '16px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: '600' }}>Joined</th>
                    <th style={{ padding: '16px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: '600' }}>Status</th>
                    <th style={{ padding: '16px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: '600' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {customers.map((customer) => (
                    <tr 
                      key={customer._id} 
                      style={{ borderBottom: '1px solid var(--border-color)' }}
                      onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--hover-bg)'}
                      onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                      <td style={{ padding: '16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <div style={{
                            width: '44px',
                            height: '44px',
                            borderRadius: '50%',
                            backgroundColor: 'var(--primary)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'white',
                            fontWeight: '700',
                            fontSize: '16px'
                          }}>
                            {customer.fullName?.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div style={{ fontWeight: '600', color: 'var(--text-primary)' }}>
                              {customer.fullName}
                            </div>
                            <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                              {customer.email}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '16px', color: 'var(--text-secondary)', fontSize: '14px' }}>
                         {customer.phone || 'N/A'}
                      </td>
                      <td style={{ padding: '16px' }}>
                        <span style={{
                          padding: '6px 12px',
                          backgroundColor: '#DBEAFE',
                          color: '#1E40AF',
                          borderRadius: '20px',
                          fontSize: '13px',
                          fontWeight: '600'
                        }}>
                          {customer.orderCount || 0} orders
                        </span>
                      </td>
                      <td style={{ padding: '16px', fontWeight: '700', color: 'var(--primary)' }}>
                        Rs. {(customer.totalSpent || 0).toLocaleString()}
                      </td>
                      <td style={{ padding: '16px', color: 'var(--text-secondary)', fontSize: '14px' }}>
                        {formatDate(customer.createdAt)}
                      </td>
                      <td style={{ padding: '16px' }}>
                        <span style={{
                          padding: '6px 12px',
                          backgroundColor: customer.isBlocked ? '#FEE2E2' : '#D1FAE5',
                          color: customer.isBlocked ? '#DC2626' : '#0F766E',
                          borderRadius: '20px',
                          fontSize: '13px',
                          fontWeight: '600'
                        }}>
                          {customer.isBlocked ? 'Blocked' : 'Active'}
                        </span>
                      </td>
                      <td style={{ padding: '16px' }}>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <Link
                            href={`/customers/${customer._id}`}
                            style={{
                              padding: '8px 12px',
                              backgroundColor: 'var(--primary)',
                              color: 'white',
                              border: 'none',
                              borderRadius: '8px',
                              textDecoration: 'none',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                              fontWeight: '600',
                              fontSize: '13px'
                            }}
                          >
                            <Eye size={16} />
                            View
                          </Link>
                          <button
                            onClick={() => handleToggleBlock(customer._id, customer.isBlocked)}
                            style={{
                              padding: '8px 12px',
                              backgroundColor: customer.isBlocked ? '#10B981' : '#EF4444',
                              color: 'white',
                              border: 'none',
                              borderRadius: '8px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                              fontWeight: '600',
                              fontSize: '13px'
                            }}
                          >
                            {customer.isBlocked ? <CheckCircle size={16} /> : <Ban size={16} />}
                            {customer.isBlocked ? 'Unblock' : 'Block'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
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
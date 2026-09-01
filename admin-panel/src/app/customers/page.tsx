'use client';

import { useState, useEffect, Suspense, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Users, Search, Download, Mail, Phone, MapPin,
  ShoppingCart, TrendingUp,
  Eye, Edit, CheckCircle, XCircle, AlertCircle, ChevronLeft, ChevronRight, X, ShieldAlert, Loader
} from 'lucide-react';
import api from '@/lib/api';

interface Customer {
  _id: string;
  id: string;
  fullName: string;
  email: string;
  phone?: string;
  avatar?: string;
  addresses?: Array<{
    fullName?: string;
    phone?: string;
    address?: string;
    city?: string;
    state?: string;
    country?: string;
    postalCode?: string;
    isDefault?: boolean;
  }>;
  primaryAddress?: {
    address?: string;
    city?: string;
    state?: string;
    country?: string;
    postalCode?: string;
  } | null;
  totalOrders: number;
  realizedOrders: number;
  totalSpent: number;
  averageOrderValue: number;
  firstOrderDate?: string | null;
  lastOrderDate?: string | null;
  createdAt: string;
  updatedAt: string;
  isBlocked: boolean;
  isActive: boolean;
}

interface CustomerSummary {
  global: {
    totalCustomers: number;
    activeCustomers: number;
    blockedCustomers: number;
    newCustomersToday: number;
    totalRealizedSpend: number;
    averageLifetimeValue: number;
  };
}

function CustomersListContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [summary, setSummary] = useState<CustomerSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState(searchParams.get('search') || '');
  const [filterType, setFilterType] = useState<'all' | 'active' | 'blocked'>('all');
  const [sortBy, setSortBy] = useState<'createdAt-desc' | 'createdAt-asc' | 'name-asc' | 'name-desc'>('createdAt-desc');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);

  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  const [showProfileModal, setShowProfileModal] = useState(false);
  const [editFullName, setEditFullName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  const [blockTarget, setBlockTarget] = useState<Customer | null>(null);
  const [blockReason, setBlockReason] = useState('');
  const [blockLoading, setBlockLoading] = useState(false);

  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const fetchCustomers = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = {
        page,
        limit: 15,
        sortBy
      };

      if (searchQuery.trim()) {
        params.search = searchQuery.trim();
      }
      if (filterType !== 'all') {
        params.status = filterType;
      }

      const response = await api.get('/customers', { params });
      if (response.data.success) {
        setCustomers(response.data.data);
        if (response.data.summary) {
          setSummary(response.data.summary);
        }
        if (response.data.pagination) {
          setTotalPages(response.data.pagination.pages || 1);
          setTotalRecords(response.data.pagination.total || 0);
        }
      }
    } catch (error) {
      console.error('Error fetching customers:', error);
    } finally {
      setLoading(false);
    }
  }, [page, searchQuery, filterType, sortBy]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void fetchCustomers();
    }, 0);
    return () => clearTimeout(timer);
  }, [fetchCustomers]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    void fetchCustomers();
  };

  const handleFilterChange = (type: 'all' | 'active' | 'blocked') => {
    setFilterType(type);
    setPage(1);
  };

  const handleSortChange = (sort: 'createdAt-desc' | 'createdAt-asc' | 'name-asc' | 'name-desc') => {
    setSortBy(sort);
    setPage(1);
  };

  const openProfileModal = (customer: Customer) => {
    setSelectedCustomer(customer);
    setEditFullName(customer.fullName || '');
    setEditPhone(customer.phone || '');
    setProfileError(null);
    setShowProfileModal(true);
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer) return;

    if (!editFullName.trim() || editFullName.trim().length < 3) {
      setProfileError('Full name must be at least 3 characters.');
      return;
    }

    setProfileSaving(true);
    setProfileError(null);

    try {
      const response = await api.patch(`/customers/${selectedCustomer._id}/profile`, {
        fullName: editFullName.trim(),
        phone: editPhone.trim()
      });

      if (response.data.success) {
        setShowProfileModal(false);
        if (selectedCustomer) {
          setSelectedCustomer({
            ...selectedCustomer,
            fullName: editFullName.trim(),
            phone: editPhone.trim()
          });
        }
        await fetchCustomers();
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Failed to update profile';
      setProfileError(msg);
    } finally {
      setProfileSaving(false);
    }
  };

  const openBlockDialog = (customer: Customer) => {
    setBlockTarget(customer);
    setBlockReason('');
  };

  const handleConfirmBlockToggle = async () => {
    if (!blockTarget) return;

    setBlockLoading(true);
    try {
      const targetState = !blockTarget.isBlocked;
      const response = await api.put(`/customers/${blockTarget._id}/block`, {
        isBlocked: targetState,
        reason: blockReason || (targetState ? 'Account blocked by admin' : 'Account unblocked by admin')
      });

      if (response.data.success) {
        setBlockTarget(null);
        if (selectedCustomer && selectedCustomer._id === blockTarget._id) {
          setSelectedCustomer({
            ...selectedCustomer,
            isBlocked: targetState,
            isActive: !targetState
          });
        }
        await fetchCustomers();
      }
    } catch (err) {
      console.error('Failed to toggle block status:', err);
    } finally {
      setBlockLoading(false);
    }
  };

  const handleExportCSV = async () => {
    setExporting(true);
    setExportError(null);
    try {
      const params: Record<string, string> = {};
      if (searchQuery.trim()) params.search = searchQuery.trim();
      if (filterType !== 'all') params.status = filterType;

      const response = await api.get('/customers/export', {
        params,
        responseType: 'blob'
      });

      const blob = new Blob([response.data], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `customers_export_${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Failed to export customer dataset';
      setExportError(msg);
    } finally {
      setExporting(false);
    }
  };

  const globalStats = summary?.global || {
    totalCustomers: totalRecords,
    activeCustomers: customers.filter((c) => c.isActive).length,
    blockedCustomers: customers.filter((c) => c.isBlocked).length,
    newCustomersToday: 0,
    totalRealizedSpend: 0,
    averageLifetimeValue: 0
  };

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto', paddingBottom: '40px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '28px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '28px', fontWeight: '800', color: 'var(--text-primary)', marginBottom: '6px', letterSpacing: '-0.5px' }}>
            Customers
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '15px' }}>
            Authoritative customer records, realized lifetime metrics, and access controls.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <button
            onClick={handleExportCSV}
            disabled={exporting}
            style={{
              padding: '12px 20px',
              backgroundColor: 'var(--card-bg)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-color)',
              borderRadius: '10px',
              fontWeight: '700',
              cursor: exporting ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              opacity: exporting ? 0.6 : 1
            }}
          >
            {exporting ? <Loader size={18} className="animate-spin" /> : <Download size={18} />}
            {exporting ? 'Exporting...' : `Export Full Dataset (${totalRecords})`}
          </button>
        </div>
      </div>

      {exportError && (
        <div style={{ padding: '12px 16px', backgroundColor: 'rgba(239, 68, 68, 0.1)', border: '1px solid var(--danger)', borderRadius: '10px', color: 'var(--danger-text)', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px' }}>
            <AlertCircle size={18} /> {exportError}
          </div>
          <button onClick={() => setExportError(null)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}><X size={16} /></button>
        </div>
      )}

      {/* Global Truthful KPI Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '20px', marginBottom: '32px' }}>
        <div style={{ backgroundColor: 'var(--card-bg)', padding: '24px', borderRadius: '16px', border: '1px solid var(--border-color)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <span style={{ color: 'var(--text-secondary)', fontSize: '13px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total Customers (Global)</span>
            <div style={{ width: '40px', height: '40px', borderRadius: '10px', backgroundColor: 'rgba(59, 130, 246, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Users size={20} color="var(--primary)" />
            </div>
          </div>
          <div style={{ fontSize: '30px', fontWeight: '800', color: 'var(--text-primary)' }}>{globalStats.totalCustomers.toLocaleString()}</div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>Complete verified customer base</div>
        </div>

        <div style={{ backgroundColor: 'var(--card-bg)', padding: '24px', borderRadius: '16px', border: '1px solid var(--border-color)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <span style={{ color: 'var(--text-secondary)', fontSize: '13px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Active Customers</span>
            <div style={{ width: '40px', height: '40px', borderRadius: '10px', backgroundColor: 'rgba(22, 163, 74, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <CheckCircle size={20} color="var(--success-text)" />
            </div>
          </div>
          <div style={{ fontSize: '30px', fontWeight: '800', color: 'var(--success-text)' }}>{globalStats.activeCustomers.toLocaleString()}</div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>Accounts in good standing</div>
        </div>

        <div style={{ backgroundColor: 'var(--card-bg)', padding: '24px', borderRadius: '16px', border: '1px solid var(--border-color)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <span style={{ color: 'var(--text-secondary)', fontSize: '13px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Blocked / Inactive</span>
            <div style={{ width: '40px', height: '40px', borderRadius: '10px', backgroundColor: 'rgba(239, 68, 68, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <XCircle size={20} color="var(--danger-text)" />
            </div>
          </div>
          <div style={{ fontSize: '30px', fontWeight: '800', color: 'var(--danger-text)' }}>{globalStats.blockedCustomers.toLocaleString()}</div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>Revoked or blocked accounts</div>
        </div>

        <div style={{ backgroundColor: 'var(--card-bg)', padding: '24px', borderRadius: '16px', border: '1px solid var(--border-color)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <span style={{ color: 'var(--text-secondary)', fontSize: '13px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Realized Net Spend</span>
            <div style={{ width: '40px', height: '40px', borderRadius: '10px', backgroundColor: 'rgba(255, 138, 0, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <TrendingUp size={20} color="var(--accent-text)" />
            </div>
          </div>
          <div style={{ fontSize: '28px', fontWeight: '800', color: 'var(--text-primary)' }}>Rs. {globalStats.totalRealizedSpend.toLocaleString()}</div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>Phase 1 canonical realized revenue</div>
        </div>
      </div>

      {/* Controls / Filter Bar */}
      <div style={{ backgroundColor: 'var(--card-bg)', padding: '20px', borderRadius: '16px', border: '1px solid var(--border-color)', marginBottom: '24px', display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
        <form onSubmit={handleSearchSubmit} style={{ display: 'flex', gap: '8px', flex: '1', minWidth: '280px', maxWidth: '460px' }}>
          <div style={{ position: 'relative', width: '100%' }}>
            <Search size={18} color="var(--text-secondary)" style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)' }} />
            <input
              type="text"
              placeholder="Search by name, email, or phone..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '12px 14px 12px 42px',
                borderRadius: '10px',
                border: '1px solid var(--border-color)',
                backgroundColor: 'var(--bg-primary)',
                color: 'var(--text-primary)',
                fontSize: '14px',
                outline: 'none'
              }}
            />
          </div>
          <button
            type="submit"
            style={{
              padding: '0 18px',
              backgroundColor: 'var(--primary)',
              color: '#0B132B',
              border: 'none',
              borderRadius: '10px',
              fontWeight: '700',
              fontSize: '14px',
              cursor: 'pointer'
            }}
          >
            Search
          </button>
        </form>

        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Status Filter */}
          <div style={{ display: 'flex', gap: '4px', backgroundColor: 'var(--bg-primary)', padding: '4px', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
            {(['all', 'active', 'blocked'] as const).map((st) => (
              <button
                key={st}
                onClick={() => handleFilterChange(st)}
                style={{
                  padding: '8px 14px',
                  borderRadius: '8px',
                  border: 'none',
                  backgroundColor: filterType === st ? 'var(--card-bg)' : 'transparent',
                  color: filterType === st ? 'var(--text-primary)' : 'var(--text-secondary)',
                  fontWeight: filterType === st ? '700' : '500',
                  fontSize: '13px',
                  cursor: 'pointer',
                  boxShadow: filterType === st ? '0 2px 4px rgba(0,0,0,0.05)' : 'none'
                }}
              >
                {st === 'all' ? 'All' : st === 'active' ? 'Active' : 'Blocked'}
              </button>
            ))}
          </div>

          {/* Sort Select */}
          <select
            value={sortBy}
            onChange={(e) => handleSortChange(e.target.value as 'createdAt-desc' | 'createdAt-asc' | 'name-asc' | 'name-desc')}
            style={{
              padding: '10px 14px',
              borderRadius: '10px',
              border: '1px solid var(--border-color)',
              backgroundColor: 'var(--bg-primary)',
              color: 'var(--text-primary)',
              fontSize: '13px',
              fontWeight: '600',
              outline: 'none',
              cursor: 'pointer'
            }}
          >
            <option value="createdAt-desc">Newest First</option>
            <option value="createdAt-asc">Oldest First</option>
            <option value="name-asc">Name (A-Z)</option>
            <option value="name-desc">Name (Z-A)</option>
          </select>
        </div>
      </div>

      {/* Customer Table */}
      <div style={{ backgroundColor: 'var(--card-bg)', borderRadius: '16px', border: '1px solid var(--border-color)', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-secondary)' }}>
            <Loader size={28} className="animate-spin" style={{ margin: '0 auto 12px' }} />
            <p>Loading customers...</p>
          </div>
        ) : customers.length === 0 ? (
          <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-secondary)' }}>
            <Users size={48} style={{ margin: '0 auto 16px', opacity: 0.4 }} />
            <h3 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '6px' }}>No Customers Found</h3>
            <p style={{ fontSize: '14px' }}>Try adjusting your search query or status filter.</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
              <thead>
                <tr style={{ backgroundColor: 'var(--bg-primary)', borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)', fontSize: '12px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  <th style={{ padding: '16px 20px' }}>Customer</th>
                  <th style={{ padding: '16px 20px' }}>Contact</th>
                  <th style={{ padding: '16px 20px' }}>Orders</th>
                  <th style={{ padding: '16px 20px' }}>Realized Spend</th>
                  <th style={{ padding: '16px 20px' }}>Status</th>
                  <th style={{ padding: '16px 20px' }}>Last Order</th>
                  <th style={{ padding: '16px 20px', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((c) => (
                  <tr key={c._id} style={{ borderBottom: '1px solid var(--border-color)', transition: 'background-color 0.15s' }}>
                    <td style={{ padding: '16px 20px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ width: '40px', height: '40px', borderRadius: '50%', backgroundColor: '#0B132B', color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '700', fontSize: '16px' }}>
                          {c.fullName ? c.fullName.charAt(0).toUpperCase() : 'C'}
                        </div>
                        <div>
                          <div style={{ fontWeight: '700', color: 'var(--text-primary)' }}>{c.fullName}</div>
                          <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Joined {new Date(c.createdAt).toLocaleDateString()}</div>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '16px 20px' }}>
                      <div style={{ color: 'var(--text-primary)' }}>{c.email}</div>
                      <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{c.phone || 'No phone'}</div>
                    </td>
                    <td style={{ padding: '16px 20px' }}>
                      <div style={{ fontWeight: '700', color: 'var(--text-primary)' }}>{c.totalOrders} total</div>
                      <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{c.realizedOrders} realized</div>
                    </td>
                    <td style={{ padding: '16px 20px' }}>
                      <div style={{ fontWeight: '700', color: 'var(--text-primary)' }}>Rs. {c.totalSpent.toLocaleString()}</div>
                      <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>AOV: Rs. {c.averageOrderValue.toFixed(0)}</div>
                    </td>
                    <td style={{ padding: '16px 20px' }}>
                      <span style={{
                        padding: '4px 10px',
                        borderRadius: '12px',
                        fontSize: '12px',
                        fontWeight: '700',
                        backgroundColor: c.isBlocked ? 'rgba(239, 68, 68, 0.12)' : 'rgba(22, 163, 74, 0.12)',
                        color: c.isBlocked ? 'var(--danger-text)' : 'var(--success-text)'
                      }}>
                        {c.isBlocked ? 'Blocked' : 'Active'}
                      </span>
                    </td>
                    <td style={{ padding: '16px 20px', color: 'var(--text-secondary)', fontSize: '13px' }}>
                      {c.lastOrderDate ? new Date(c.lastOrderDate).toLocaleDateString() : 'Never'}
                    </td>
                    <td style={{ padding: '16px 20px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                        <button
                          onClick={() => {
                            setSelectedCustomer(c);
                            setShowDetails(true);
                          }}
                          title="View Details"
                          style={{
                            padding: '8px',
                            backgroundColor: 'var(--bg-primary)',
                            border: '1px solid var(--border-color)',
                            borderRadius: '8px',
                            color: 'var(--text-primary)',
                            cursor: 'pointer'
                          }}
                        >
                          <Eye size={16} />
                        </button>
                        <button
                          onClick={() => openProfileModal(c)}
                          title="Edit Profile"
                          style={{
                            padding: '8px',
                            backgroundColor: 'var(--bg-primary)',
                            border: '1px solid var(--border-color)',
                            borderRadius: '8px',
                            color: 'var(--text-primary)',
                            cursor: 'pointer'
                          }}
                        >
                          <Edit size={16} />
                        </button>
                        <button
                          onClick={() => openBlockDialog(c)}
                          title={c.isBlocked ? 'Unblock Customer' : 'Block Customer'}
                          style={{
                            padding: '8px',
                            backgroundColor: c.isBlocked ? 'rgba(22, 163, 74, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                            border: '1px solid var(--border-color)',
                            borderRadius: '8px',
                            color: c.isBlocked ? 'var(--success-text)' : 'var(--danger-text)',
                            cursor: 'pointer'
                          }}
                        >
                          {c.isBlocked ? <CheckCircle size={16} /> : <XCircle size={16} />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer */}
        <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
            Showing {customers.length > 0 ? (page - 1) * 15 + 1 : 0} to {Math.min(page * 15, totalRecords)} of {totalRecords} filtered customers
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              style={{
                padding: '8px 14px',
                borderRadius: '8px',
                border: '1px solid var(--border-color)',
                backgroundColor: 'var(--bg-primary)',
                color: 'var(--text-primary)',
                cursor: page <= 1 ? 'not-allowed' : 'pointer',
                opacity: page <= 1 ? 0.5 : 1,
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '13px',
                fontWeight: '600'
              }}
            >
              <ChevronLeft size={16} /> Previous
            </button>
            <span style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)', padding: '0 8px' }}>
              Page {page} of {totalPages}
            </span>
            <button
              disabled={page >= totalPages || loading}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              style={{
                padding: '8px 14px',
                borderRadius: '8px',
                border: '1px solid var(--border-color)',
                backgroundColor: 'var(--bg-primary)',
                color: 'var(--text-primary)',
                cursor: page >= totalPages ? 'not-allowed' : 'pointer',
                opacity: page >= totalPages ? 0.5 : 1,
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '13px',
                fontWeight: '600'
              }}
            >
              Next <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Customer Details Modal */}
      {showDetails && selectedCustomer && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.6)',
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
              maxWidth: '800px',
              width: '100%',
              maxHeight: '90vh',
              overflowY: 'auto',
              boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
              border: '1px solid var(--border-color)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <div style={{ width: '64px', height: '64px', borderRadius: '50%', backgroundColor: '#0B132B', color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '800', fontSize: '24px' }}>
                  {selectedCustomer.fullName ? selectedCustomer.fullName.charAt(0).toUpperCase() : 'C'}
                </div>
                <div>
                  <h2 style={{ fontSize: '24px', fontWeight: '800', color: 'var(--text-primary)', marginBottom: '4px' }}>
                    {selectedCustomer.fullName}
                  </h2>
                  <span style={{
                    padding: '4px 12px',
                    borderRadius: '12px',
                    fontSize: '12px',
                    fontWeight: '700',
                    backgroundColor: selectedCustomer.isBlocked ? 'rgba(239, 68, 68, 0.12)' : 'rgba(22, 163, 74, 0.12)',
                    color: selectedCustomer.isBlocked ? 'var(--danger-text)' : 'var(--success-text)'
                  }}>
                    {selectedCustomer.isBlocked ? 'Blocked Customer' : 'Active Customer'}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setShowDetails(false)}
                style={{ padding: '8px', background: 'none', border: 'none', borderRadius: '8px', cursor: 'pointer', color: 'var(--text-secondary)' }}
              >
                <X size={24} />
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px', marginBottom: '24px' }}>
              <div style={{ backgroundColor: 'var(--bg-primary)', borderRadius: '12px', padding: '20px', border: '1px solid var(--border-color)' }}>
                <h3 style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-secondary)', marginBottom: '16px', textTransform: 'uppercase' }}>Contact & Address</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--text-primary)' }}>
                    <Mail size={16} color="var(--text-secondary)" /> {selectedCustomer.email}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--text-primary)' }}>
                    <Phone size={16} color="var(--text-secondary)" /> {selectedCustomer.phone || 'No phone on file'}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', color: 'var(--text-primary)' }}>
                    <MapPin size={16} color="var(--text-secondary)" style={{ marginTop: '2px' }} />
                    <div>
                      {selectedCustomer.primaryAddress ? (
                        <span>
                          {selectedCustomer.primaryAddress.address}, {selectedCustomer.primaryAddress.city}, {selectedCustomer.primaryAddress.country || 'Pakistan'} {selectedCustomer.primaryAddress.postalCode || ''}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-secondary)' }}>No default address recorded</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div style={{ backgroundColor: 'var(--bg-primary)', borderRadius: '12px', padding: '20px', border: '1px solid var(--border-color)' }}>
                <h3 style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-secondary)', marginBottom: '16px', textTransform: 'uppercase' }}>Commercial Lifetime Summary</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '2px' }}>Total Orders</div>
                    <div style={{ fontSize: '20px', fontWeight: '800', color: 'var(--text-primary)' }}>{selectedCustomer.totalOrders}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '2px' }}>Realized Orders</div>
                    <div style={{ fontSize: '20px', fontWeight: '800', color: 'var(--text-primary)' }}>{selectedCustomer.realizedOrders}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '2px' }}>Realized Net Spend</div>
                    <div style={{ fontSize: '20px', fontWeight: '800', color: 'var(--text-primary)' }}>Rs. {selectedCustomer.totalSpent.toLocaleString()}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '2px' }}>Avg Order Value</div>
                    <div style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text-primary)' }}>Rs. {selectedCustomer.averageOrderValue.toFixed(0)}</div>
                  </div>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <button
                onClick={() => {
                  setShowDetails(false);
                  openProfileModal(selectedCustomer);
                }}
                style={{
                  padding: '12px 20px',
                  backgroundColor: 'var(--bg-primary)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '10px',
                  fontWeight: '700',
                  cursor: 'pointer'
                }}
              >
                Edit Profile
              </button>
              <button
                onClick={() => {
                  setShowDetails(false);
                  router.push(`/orders?customer=${selectedCustomer._id}`);
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
                <ShoppingCart size={18} /> View Filtered Orders
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Profile Modal (Strict Allowlist: Name, Phone) */}
      {showProfileModal && selectedCustomer && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1050,
            padding: '20px'
          }}
          onClick={() => setShowProfileModal(false)}
        >
          <div
            style={{
              backgroundColor: 'var(--card-bg)',
              borderRadius: '16px',
              padding: '30px',
              maxWidth: '500px',
              width: '100%',
              border: '1px solid var(--border-color)',
              boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ fontSize: '20px', fontWeight: '800', color: 'var(--text-primary)' }}>Edit Customer Profile</h3>
              <button onClick={() => setShowProfileModal(false)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}><X size={20} /></button>
            </div>

            {profileError && (
              <div style={{ padding: '10px 14px', backgroundColor: 'rgba(239, 68, 68, 0.1)', border: '1px solid var(--danger)', borderRadius: '8px', color: 'var(--danger-text)', fontSize: '13px', marginBottom: '16px' }}>
                {profileError}
              </div>
            )}

            <form onSubmit={handleSaveProfile}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '700', color: 'var(--text-secondary)', marginBottom: '6px' }}>Full Name *</label>
                <input
                  type="text"
                  value={editFullName}
                  onChange={(e) => setEditFullName(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '12px 14px',
                    borderRadius: '10px',
                    border: '1px solid var(--border-color)',
                    backgroundColor: 'var(--bg-primary)',
                    color: 'var(--text-primary)',
                    fontSize: '14px',
                    outline: 'none'
                  }}
                  required
                />
              </div>

              <div style={{ marginBottom: '24px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '700', color: 'var(--text-secondary)', marginBottom: '6px' }}>Phone Number</label>
                <input
                  type="text"
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  placeholder="e.g. +92 300 1234567"
                  style={{
                    width: '100%',
                    padding: '12px 14px',
                    borderRadius: '10px',
                    border: '1px solid var(--border-color)',
                    backgroundColor: 'var(--bg-primary)',
                    color: 'var(--text-primary)',
                    fontSize: '14px',
                    outline: 'none'
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => setShowProfileModal(false)}
                  style={{
                    padding: '10px 18px',
                    backgroundColor: 'var(--bg-primary)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '8px',
                    fontWeight: '600',
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={profileSaving}
                  style={{
                    padding: '10px 22px',
                    backgroundColor: 'var(--primary)',
                    color: '#0B132B',
                    border: 'none',
                    borderRadius: '8px',
                    fontWeight: '700',
                    cursor: profileSaving ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}
                >
                  {profileSaving ? <Loader size={16} className="animate-spin" /> : null}
                  {profileSaving ? 'Saving...' : 'Save Profile'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Block / Unblock Confirmation Dialog */}
      {blockTarget && (
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
          onClick={() => setBlockTarget(null)}
        >
          <div
            style={{
              backgroundColor: 'var(--card-bg)',
              borderRadius: '16px',
              padding: '30px',
              maxWidth: '480px',
              width: '100%',
              border: '1px solid var(--border-color)',
              boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <div style={{ width: '42px', height: '42px', borderRadius: '10px', backgroundColor: blockTarget.isBlocked ? 'rgba(22, 163, 74, 0.1)' : 'rgba(239, 68, 68, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <ShieldAlert size={22} color={blockTarget.isBlocked ? 'var(--success-text)' : 'var(--danger-text)'} />
              </div>
              <div>
                <h3 style={{ fontSize: '18px', fontWeight: '800', color: 'var(--text-primary)' }}>
                  {blockTarget.isBlocked ? 'Unblock Customer Account' : 'Block Customer Account'}
                </h3>
              </div>
            </div>

            <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '16px', lineHeight: '1.5' }}>
              {blockTarget.isBlocked
                ? `Are you sure you want to unblock ${blockTarget.fullName}? They will regain access to log in.`
                : `Are you sure you want to block ${blockTarget.fullName}? Blocking immediately revokes all active customer sessions and prevents login.`}
            </p>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '700', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                Audit Reason (Optional)
              </label>
              <input
                type="text"
                placeholder={blockTarget.isBlocked ? 'Reason for unblocking...' : 'e.g. Fraud prevention, policy violation'}
                value={blockReason}
                onChange={(e) => setBlockReason(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: '8px',
                  border: '1px solid var(--border-color)',
                  backgroundColor: 'var(--bg-primary)',
                  color: 'var(--text-primary)',
                  fontSize: '14px',
                  outline: 'none'
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setBlockTarget(null)}
                style={{
                  padding: '10px 18px',
                  backgroundColor: 'var(--bg-primary)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                  fontWeight: '600',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={blockLoading}
                onClick={handleConfirmBlockToggle}
                style={{
                  padding: '10px 20px',
                  backgroundColor: blockTarget.isBlocked ? 'var(--success)' : 'var(--danger)',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: '8px',
                  fontWeight: '700',
                  cursor: blockLoading ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                {blockLoading ? <Loader size={16} className="animate-spin" /> : null}
                {blockTarget.isBlocked ? 'Confirm Unblock' : 'Confirm Block & Revoke Sessions'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CustomersPage() {
  return (
    <Suspense fallback={<div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-secondary)' }}>Loading customers...</div>}>
      <CustomersListContent />
    </Suspense>
  );
}

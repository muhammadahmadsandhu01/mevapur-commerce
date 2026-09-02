'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Tag, Plus, Edit, Trash2, Search, X, Save,
  CheckCircle, Copy, Calendar, Percent, DollarSign,
  TrendingUp, ChevronLeft, ChevronRight, Archive, Ban
} from 'lucide-react';
import api from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import { isCouponCreateRequested, removeCouponCreateQuery } from '@/lib/notificationUi';

interface Coupon {
  _id: string;
  code: string;
  type: 'percentage' | 'fixed';
  value: number;
  minOrderAmount?: number;
  maxDiscount?: number;
  usageLimit?: number;
  usedCount: number;
  perCustomerLimit?: number;
  startDate: string;
  endDate: string;
  status: 'draft' | 'active' | 'disabled' | 'archived';
  effectiveStatus?: 'draft' | 'active' | 'upcoming' | 'expired' | 'exhausted' | 'disabled' | 'archived';
  isActive: boolean;
  applicableCategories?: string[];
  applicableProducts?: string[];
  description?: string;
  createdAt: string;
  __v?: number;
}

interface CouponStats {
  total: number;
  active: number;
  upcoming: number;
  expired: number;
  disabled: number;
  archived: number;
  totalUsage: number;
}

function CouponsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const createRequested = isCouponCreateRequested(searchParams.get('create'));
  const { user } = useAuthStore();

  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'active' | 'upcoming' | 'expired' | 'disabled' | 'archived' | 'draft'>('all');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [showModal, setShowModal] = useState(false);
  const [editingCoupon, setEditingCoupon] = useState<Coupon | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [globalStats, setGlobalStats] = useState<CouponStats>({
    total: 0,
    active: 0,
    upcoming: 0,
    expired: 0,
    disabled: 0,
    archived: 0,
    totalUsage: 0
  });

  const [formData, setFormData] = useState({
    code: '',
    type: 'percentage' as 'percentage' | 'fixed',
    value: 0,
    minOrderAmount: 0,
    maxDiscount: 0,
    usageLimit: 0,
    perCustomerLimit: 0,
    startDate: '',
    endDate: '',
    status: 'active' as 'draft' | 'active' | 'disabled' | 'archived',
    description: '',
    __v: undefined as number | undefined
  });

  const canManage = ['manager', 'admin', 'super_admin'].includes(user?.role || '');
  const isSuperAdmin = user?.role === 'super_admin';

  const fetchStats = useCallback(async () => {
    try {
      const res = await api.get('/coupons/stats');
      if (res.data?.success && res.data?.data) {
        setGlobalStats(res.data.data);
      }
    } catch (err) {
      console.error('Failed to load coupon stats:', err);
    }
  }, []);

  const fetchCoupons = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = {
        page,
        limit: 12
      };
      if (filterType !== 'all') {
        params.status = filterType;
      }
      if (searchQuery.trim()) {
        params.search = searchQuery.trim();
      }

      const response = await api.get('/coupons', { params });
      if (response.data.success) {
        setCoupons(response.data.data || []);
        setTotalPages(response.data.pagination?.pages || 1);
      }
    } catch (error) {
      console.error('Error fetching coupons:', error);
      setCoupons([]);
    } finally {
      setLoading(false);
    }
  }, [page, filterType, searchQuery]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void fetchStats();
    }, 0);
    return () => clearTimeout(timer);
  }, [fetchStats]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void fetchCoupons();
    }, 0);
    return () => clearTimeout(timer);
  }, [fetchCoupons]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManage) return;

    try {
      if (editingCoupon) {
        await api.put(`/coupons/${editingCoupon._id}`, formData);
      } else {
        await api.post('/coupons', formData);
      }
      await Promise.all([fetchCoupons(), fetchStats()]);
      closeModal();
    } catch (error: unknown) {
      console.error('Error saving coupon:', error);
      const err = error as { response?: { data?: { message?: string } } };
      alert(err.response?.data?.message || 'Failed to save coupon');
    }
  };

  const handleDisable = async (id: string) => {
    if (!canManage) return;
    setActionLoading(id);
    try {
      await api.patch(`/coupons/${id}/disable`);
      await Promise.all([fetchCoupons(), fetchStats()]);
    } catch (error) {
      console.error('Error disabling coupon:', error);
      alert('Failed to disable coupon');
    } finally {
      setActionLoading(null);
    }
  };

  const handleArchive = async (id: string) => {
    if (!canManage) return;
    if (!confirm('Archive this coupon? It will no longer be available for customer checkout.')) return;
    setActionLoading(id);
    try {
      await api.patch(`/coupons/${id}/archive`);
      await Promise.all([fetchCoupons(), fetchStats()]);
    } catch (error) {
      console.error('Error archiving coupon:', error);
      alert('Failed to archive coupon');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async (id: string, code: string, usedCount: number) => {
    if (!isSuperAdmin) {
      alert('Deleting coupons is restricted to Super Administrators. You may disable or archive this coupon instead.');
      return;
    }
    if (usedCount > 0) {
      alert('Coupons with existing redemptions cannot be deleted to preserve order integrity. Please archive or disable instead.');
      return;
    }
    if (!confirm(`Are you sure you want to permanently delete unused draft coupon "${code}"?`)) return;

    setActionLoading(id);
    try {
      await api.delete(`/coupons/${id}/draft`);
      await Promise.all([fetchCoupons(), fetchStats()]);
    } catch (error: unknown) {
      console.error('Error deleting coupon:', error);
      const err = error as { response?: { data?: { message?: string } } };
      alert(err.response?.data?.message || 'Failed to delete coupon');
    } finally {
      setActionLoading(null);
    }
  };

  const handleCopy = (code: string, id: string) => {
    navigator.clipboard.writeText(code);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const openModal = useCallback((coupon?: Coupon) => {
    if (coupon) {
      setEditingCoupon(coupon);
      setFormData({
        code: coupon.code,
        type: coupon.type === 'fixed' ? 'fixed' : 'percentage',
        value: coupon.value,
        minOrderAmount: coupon.minOrderAmount || 0,
        maxDiscount: coupon.maxDiscount || 0,
        usageLimit: coupon.usageLimit || 0,
        perCustomerLimit: coupon.perCustomerLimit || 0,
        startDate: coupon.startDate ? new Date(coupon.startDate).toISOString().split('T')[0] : '',
        endDate: coupon.endDate ? new Date(coupon.endDate).toISOString().split('T')[0] : '',
        status: coupon.status || 'active',
        description: coupon.description || '',
        __v: coupon.__v
      });
    } else {
      setEditingCoupon(null);
      setFormData({
        code: '',
        type: 'percentage',
        value: 0,
        minOrderAmount: 0,
        maxDiscount: 0,
        usageLimit: 0,
        perCustomerLimit: 0,
        startDate: '',
        endDate: '',
        status: 'active',
        description: '',
        __v: undefined
      });
    }
    setShowModal(true);
  }, []);

  const closeModal = useCallback(() => {
    setShowModal(false);
    setEditingCoupon(null);
    if (createRequested) {
      router.replace(removeCouponCreateQuery(searchParams.toString()), { scroll: false });
    }
  }, [createRequested, router, searchParams]);

  useEffect(() => {
    if (!createRequested) return;
    const timeout = window.setTimeout(() => openModal(), 0);
    return () => window.clearTimeout(timeout);
  }, [createRequested, openModal]);

  const getCouponBadge = (coupon: Coupon) => {
    const status = coupon.effectiveStatus || coupon.status;
    switch (status) {
      case 'active':
        return { text: 'Active', color: 'var(--success-text)', bg: 'rgba(22, 163, 74, 0.12)' };
      case 'upcoming':
        return { text: 'Upcoming', color: 'var(--info-text)', bg: 'rgba(59, 130, 246, 0.12)' };
      case 'expired':
        return { text: 'Expired', color: 'var(--danger-text)', bg: 'rgba(220, 38, 38, 0.12)' };
      case 'exhausted':
        return { text: 'Exhausted', color: 'var(--warning-text)', bg: 'rgba(245, 158, 11, 0.12)' };
      case 'disabled':
        return { text: 'Disabled', color: 'var(--text-secondary)', bg: 'rgba(107, 114, 128, 0.15)' };
      case 'archived':
        return { text: 'Archived', color: 'var(--text-secondary)', bg: 'rgba(107, 114, 128, 0.12)' };
      case 'draft':
      default:
        return { text: 'Draft', color: 'var(--warning-text)', bg: 'rgba(245, 158, 11, 0.12)' };
    }
  };

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '28px', fontWeight: '800', color: 'var(--text-primary)', marginBottom: '8px', letterSpacing: '-0.5px' }}>
            Coupons & Discounts
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '15px' }}>
            Manage discount campaigns, monitor redemption ledgers, and enforce strict order bounds.
          </p>
        </div>
        {canManage && (
          <button
            onClick={() => openModal()}
            style={{
              padding: '12px 20px',
              backgroundColor: 'var(--primary)',
              color: '#0B132B',
              border: 'none',
              borderRadius: '10px',
              fontWeight: '700',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              boxShadow: '0 4px 12px rgba(255, 138, 0, 0.25)'
            }}
          >
            <Plus size={18} /> Create Coupon
          </button>
        )}
      </div>

      {/* Global Stats */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '16px',
        marginBottom: '24px'
      }}>
        <div style={{ backgroundColor: 'var(--card-bg)', borderRadius: '12px', padding: '20px', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '10px', backgroundColor: 'var(--info-light)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Tag size={24} color="var(--info-text)" />
          </div>
          <div>
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: '500', marginBottom: '4px' }}>Total Coupons</div>
            <div style={{ fontSize: '24px', fontWeight: '800', color: 'var(--text-primary)' }}>{globalStats.total}</div>
          </div>
        </div>
        <div style={{ backgroundColor: 'var(--card-bg)', borderRadius: '12px', padding: '20px', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '10px', backgroundColor: 'rgba(22, 163, 74, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <CheckCircle size={24} color="var(--success-text)" />
          </div>
          <div>
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: '500', marginBottom: '4px' }}>Active Now</div>
            <div style={{ fontSize: '24px', fontWeight: '800', color: 'var(--text-primary)' }}>{globalStats.active}</div>
          </div>
        </div>
        <div style={{ backgroundColor: 'var(--card-bg)', borderRadius: '12px', padding: '20px', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '10px', backgroundColor: 'rgba(59, 130, 246, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Calendar size={24} color="var(--info-text)" />
          </div>
          <div>
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: '500', marginBottom: '4px' }}>Upcoming</div>
            <div style={{ fontSize: '24px', fontWeight: '800', color: 'var(--text-primary)' }}>{globalStats.upcoming}</div>
          </div>
        </div>
        <div style={{ backgroundColor: 'var(--card-bg)', borderRadius: '12px', padding: '20px', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '10px', backgroundColor: 'rgba(255, 138, 0, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <TrendingUp size={24} color="var(--accent-text)" />
          </div>
          <div>
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: '500', marginBottom: '4px' }}>Total Usage</div>
            <div style={{ fontSize: '24px', fontWeight: '800', color: 'var(--text-primary)' }}>{globalStats.totalUsage}</div>
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
            placeholder="Search by coupon code or description..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setPage(1);
            }}
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
          value={filterType}
          onChange={(e) => {
            setFilterType(e.target.value as typeof filterType);
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
          <option value="all">All Coupons</option>
          <option value="active">Active</option>
          <option value="upcoming">Upcoming</option>
          <option value="expired">Expired</option>
          <option value="disabled">Disabled</option>
          <option value="archived">Archived</option>
          <option value="draft">Draft</option>
        </select>
      </div>

      {/* Coupons Grid */}
      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '20px' }}>
          {[...Array(6)].map((_, i) => (
            <div key={i} style={{
              backgroundColor: 'var(--card-bg)',
              borderRadius: '12px',
              height: '220px',
              animation: 'pulse 1.5s infinite',
              border: '1px solid var(--border-color)'
            }} />
          ))}
        </div>
      ) : coupons.length === 0 ? (
        <div style={{
          backgroundColor: 'var(--card-bg)',
          borderRadius: '12px',
          padding: '80px 20px',
          textAlign: 'center',
          border: '1px solid var(--border-color)',
          borderStyle: 'dashed'
        }}>
          <Tag size={48} color="var(--text-secondary)" style={{ opacity: 0.3, marginBottom: '16px' }} />
          <h3 style={{ fontSize: '20px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '8px' }}>
            No coupons found
          </h3>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '24px' }}>Create your first coupon or adjust search filters</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '20px' }}>
          {coupons.map((coupon) => {
            const status = getCouponBadge(coupon);
            return (
              <div
                key={coupon._id}
                style={{
                  backgroundColor: 'var(--card-bg)',
                  borderRadius: '12px',
                  border: '1px solid var(--border-color)',
                  padding: '24px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '16px'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{
                      padding: '6px 12px',
                      backgroundColor: 'var(--bg-primary)',
                      borderRadius: '8px',
                      fontFamily: 'monospace',
                      fontWeight: '800',
                      fontSize: '16px',
                      letterSpacing: '1px',
                      color: 'var(--text-primary)',
                      border: '1px dashed var(--border-color)'
                    }}>
                      {coupon.code}
                    </div>
                    <button
                      onClick={() => handleCopy(coupon.code, coupon._id)}
                      title="Copy code"
                      style={{
                        padding: '6px',
                        backgroundColor: 'transparent',
                        border: 'none',
                        color: copiedId === coupon._id ? 'var(--success-text)' : 'var(--text-secondary)',
                        cursor: 'pointer'
                      }}
                    >
                      {copiedId === coupon._id ? <CheckCircle size={16} /> : <Copy size={16} />}
                    </button>
                  </div>

                  <span style={{
                    padding: '4px 10px',
                    borderRadius: '12px',
                    fontSize: '11px',
                    fontWeight: '700',
                    backgroundColor: status.bg,
                    color: status.color
                  }}>
                    {status.text}
                  </span>
                </div>

                <div>
                  <div style={{ fontSize: '24px', fontWeight: '800', color: 'var(--text-primary)', marginBottom: '4px' }}>
                    {coupon.type === 'percentage' ? `${coupon.value}% OFF` : `Rs. ${coupon.value} OFF`}
                  </div>
                  {coupon.description && (
                    <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                      {coupon.description}
                    </div>
                  )}
                </div>

                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '8px',
                  padding: '12px',
                  backgroundColor: 'var(--bg-primary)',
                  borderRadius: '8px',
                  fontSize: '12px'
                }}>
                  <div>
                    <span style={{ color: 'var(--text-secondary)' }}>Min Order: </span>
                    <strong style={{ color: 'var(--text-primary)' }}>Rs. {coupon.minOrderAmount || 0}</strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-secondary)' }}>Usage: </span>
                    <strong style={{ color: 'var(--text-primary)' }}>
                      {coupon.usedCount} {coupon.usageLimit ? `/ ${coupon.usageLimit}` : 'times'}
                    </strong>
                  </div>
                  <div style={{ gridColumn: 'span 2' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Valid: </span>
                    <strong style={{ color: 'var(--text-primary)' }}>
                      {new Date(coupon.startDate).toLocaleDateString()} - {new Date(coupon.endDate).toLocaleDateString()}
                    </strong>
                  </div>
                </div>

                {canManage && (
                  <div style={{ display: 'flex', gap: '8px', marginTop: 'auto', paddingTop: '12px', borderTop: '1px solid var(--border-color)', flexWrap: 'wrap' }}>
                    <button
                      onClick={() => openModal(coupon)}
                      style={{
                        padding: '8px 12px',
                        backgroundColor: 'var(--bg-primary)',
                        color: 'var(--text-primary)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: '600',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                    >
                      <Edit size={14} /> Edit
                    </button>

                    {coupon.status === 'active' && (
                      <button
                        onClick={() => handleDisable(coupon._id)}
                        disabled={actionLoading === coupon._id}
                        style={{
                          padding: '8px 12px',
                          backgroundColor: 'rgba(245, 158, 11, 0.12)',
                          color: 'var(--warning-text)',
                          border: 'none',
                          borderRadius: '6px',
                          fontSize: '12px',
                          fontWeight: '600',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}
                      >
                        <Ban size={14} /> Disable
                      </button>
                    )}

                    {coupon.status !== 'archived' && (
                      <button
                        onClick={() => handleArchive(coupon._id)}
                        disabled={actionLoading === coupon._id}
                        style={{
                          padding: '8px 12px',
                          backgroundColor: 'rgba(107, 114, 128, 0.12)',
                          color: 'var(--text-secondary)',
                          border: 'none',
                          borderRadius: '6px',
                          fontSize: '12px',
                          fontWeight: '600',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}
                      >
                        <Archive size={14} /> Archive
                      </button>
                    )}

                    {isSuperAdmin && coupon.usedCount === 0 && (
                      <button
                        onClick={() => handleDelete(coupon._id, coupon.code, coupon.usedCount)}
                        disabled={actionLoading === coupon._id}
                        style={{
                          padding: '8px 12px',
                          backgroundColor: 'rgba(220, 38, 38, 0.12)',
                          color: 'var(--danger-text)',
                          border: 'none',
                          borderRadius: '6px',
                          fontSize: '12px',
                          fontWeight: '600',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          marginLeft: 'auto'
                        }}
                      >
                        <Trash2 size={14} /> Delete
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && !loading && coupons.length > 0 && (
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
            onClick={() => setPage((p) => Math.max(1, p - 1))}
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
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
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

      {/* Modal */}
      {showModal && (
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
          onClick={closeModal}
        >
          <div
            style={{
              backgroundColor: 'var(--card-bg)',
              borderRadius: '16px',
              padding: '32px',
              maxWidth: '600px',
              width: '100%',
              maxHeight: '90vh',
              overflowY: 'auto'
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h2 style={{ fontSize: '20px', fontWeight: '800', color: 'var(--text-primary)' }}>
                {editingCoupon ? 'Edit Coupon' : 'Create New Coupon'}
              </h2>
              <button onClick={closeModal} style={{ padding: '8px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' }}>
                  Coupon Code *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g., SUMMER25"
                  value={formData.code}
                  disabled={Boolean(editingCoupon && editingCoupon.usedCount > 0)}
                  onChange={e => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                  style={{
                    width: '100%',
                    padding: '12px',
                    borderRadius: '8px',
                    border: '1px solid var(--border-color)',
                    backgroundColor: 'var(--input-bg)',
                    color: 'var(--text-primary)',
                    fontFamily: 'monospace',
                    fontWeight: '700',
                    textTransform: 'uppercase'
                  }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' }}>
                    Discount Type *
                  </label>
                  <select
                    value={formData.type}
                    disabled={Boolean(editingCoupon && editingCoupon.usedCount > 0)}
                    onChange={e => setFormData({ ...formData, type: e.target.value as 'percentage' | 'fixed' })}
                    style={{
                      width: '100%',
                      padding: '12px',
                      borderRadius: '8px',
                      border: '1px solid var(--border-color)',
                      backgroundColor: 'var(--input-bg)',
                      color: 'var(--text-primary)',
                      fontWeight: '600'
                    }}
                  >
                    <option value="percentage">Percentage (%)</option>
                    <option value="fixed">Fixed Amount (Rs.)</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' }}>
                    Discount Value *
                  </label>
                  <input
                    type="number"
                    required
                    min={1}
                    value={formData.value || ''}
                    onChange={e => setFormData({ ...formData, value: Number(e.target.value) })}
                    style={{
                      width: '100%',
                      padding: '12px',
                      borderRadius: '8px',
                      border: '1px solid var(--border-color)',
                      backgroundColor: 'var(--input-bg)',
                      color: 'var(--text-primary)'
                    }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' }}>
                    Min. Order Amount (Rs.)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={formData.minOrderAmount || ''}
                    onChange={e => setFormData({ ...formData, minOrderAmount: Number(e.target.value) })}
                    style={{
                      width: '100%',
                      padding: '12px',
                      borderRadius: '8px',
                      border: '1px solid var(--border-color)',
                      backgroundColor: 'var(--input-bg)',
                      color: 'var(--text-primary)'
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' }}>
                    Max. Discount Cap (Rs.)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={formData.maxDiscount || ''}
                    onChange={e => setFormData({ ...formData, maxDiscount: Number(e.target.value) })}
                    style={{
                      width: '100%',
                      padding: '12px',
                      borderRadius: '8px',
                      border: '1px solid var(--border-color)',
                      backgroundColor: 'var(--input-bg)',
                      color: 'var(--text-primary)'
                    }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' }}>
                    Total Usage Limit (0 = Unlimited)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={formData.usageLimit || ''}
                    onChange={e => setFormData({ ...formData, usageLimit: Number(e.target.value) })}
                    style={{
                      width: '100%',
                      padding: '12px',
                      borderRadius: '8px',
                      border: '1px solid var(--border-color)',
                      backgroundColor: 'var(--input-bg)',
                      color: 'var(--text-primary)'
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' }}>
                    Per-Customer Limit (0 = Unlimited)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={formData.perCustomerLimit || ''}
                    onChange={e => setFormData({ ...formData, perCustomerLimit: Number(e.target.value) })}
                    style={{
                      width: '100%',
                      padding: '12px',
                      borderRadius: '8px',
                      border: '1px solid var(--border-color)',
                      backgroundColor: 'var(--input-bg)',
                      color: 'var(--text-primary)'
                    }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' }}>
                    Start Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={formData.startDate}
                    onChange={e => setFormData({ ...formData, startDate: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '12px',
                      borderRadius: '8px',
                      border: '1px solid var(--border-color)',
                      backgroundColor: 'var(--input-bg)',
                      color: 'var(--text-primary)'
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' }}>
                    End Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={formData.endDate}
                    onChange={e => setFormData({ ...formData, endDate: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '12px',
                      borderRadius: '8px',
                      border: '1px solid var(--border-color)',
                      backgroundColor: 'var(--input-bg)',
                      color: 'var(--text-primary)'
                    }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' }}>
                  Campaign Description
                </label>
                <textarea
                  rows={3}
                  placeholder="Optional internal note or customer banner text..."
                  value={formData.description}
                  onChange={e => setFormData({ ...formData, description: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '12px',
                    borderRadius: '8px',
                    border: '1px solid var(--border-color)',
                    backgroundColor: 'var(--input-bg)',
                    color: 'var(--text-primary)',
                    resize: 'vertical'
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '12px' }}>
                <button
                  type="button"
                  onClick={closeModal}
                  style={{
                    padding: '12px 24px',
                    backgroundColor: 'var(--card-bg)',
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
                  style={{
                    padding: '12px 24px',
                    backgroundColor: 'var(--primary)',
                    color: '#0B132B',
                    border: 'none',
                    borderRadius: '8px',
                    fontWeight: '700',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}
                >
                  <Save size={18} /> {editingCoupon ? 'Update Coupon' : 'Create Coupon'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}

export default function CouponsPage() {
  return (
    <Suspense fallback={
      <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
        Loading coupons...
      </div>
    }>
      <CouponsPageContent />
    </Suspense>
  );
}

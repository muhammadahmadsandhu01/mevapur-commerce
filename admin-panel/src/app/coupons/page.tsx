'use client';

import { useEffect, useState } from 'react';
import { 
  Percent, 
  Plus, 
  Edit, 
  Trash2, 
  Search, 
  Tag,
  Calendar,
  CheckCircle,
  XCircle,
  AlertCircle,
  Loader,
  X,
  Copy,
  Check
} from 'lucide-react';
import api from '@/lib/api';

interface Coupon {
  _id: string;
  code: string;
  type: 'percentage' | 'fixed' | 'freeshipping';
  value: number;
  minPurchase: number;
  maxDiscount: number;
  usageLimit: number;
  usedCount: number;
  startDate: string;
  endDate: string;
  isActive: boolean;
  description: string;
  createdAt: string;
}

export default function CouponsPage() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingCoupon, setEditingCoupon] = useState<Coupon | null>(null);
  const [stats, setStats] = useState<any>(null);
  const [error, setError] = useState('');
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  
  const [formData, setFormData] = useState({
    code: '',
    type: 'percentage',
    value: '',
    minPurchase: '',
    maxDiscount: '',
    usageLimit: '',
    startDate: '',
    endDate: '',
    isActive: true,
    description: ''
  });

  useEffect(() => {
    fetchCoupons();
    fetchStats();
  }, [search, statusFilter]);

  const fetchCoupons = async () => {
    try {
      setLoading(true);
      const params: any = {};
      if (search) params.search = search;
      if (statusFilter) params.status = statusFilter;

      const response = await api.get('/coupons', { params });
      if (response.data.success) {
        setCoupons(response.data.data);
      }
    } catch (error) {
      console.error('Error fetching coupons:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await api.get('/coupons/stats');
      if (response.data.success) {
        setStats(response.data.data);
      }
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  const handleAddCoupon = async () => {
    if (!formData.code || !formData.value || !formData.startDate || !formData.endDate) {
      setError('Please fill all required fields');
      return;
    }

    try {
      const couponData = {
        ...formData,
        value: parseFloat(formData.value),
        minPurchase: parseFloat(formData.minPurchase) || 0,
        maxDiscount: parseFloat(formData.maxDiscount) || 0,
        usageLimit: parseInt(formData.usageLimit) || 0
      };

      const response = await api.post('/coupons', couponData);
      
      if (response.data.success) {
        setShowAddModal(false);
        resetForm();
        await fetchCoupons();
        await fetchStats();
      }
    } catch (error: any) {
      setError(error.response?.data?.message || 'Failed to create coupon');
    }
  };

  const handleEditCoupon = async () => {
    if (!editingCoupon || !formData.code || !formData.value) {
      setError('Please fill all required fields');
      return;
    }

    try {
      const couponData = {
        ...formData,
        value: parseFloat(formData.value),
        minPurchase: parseFloat(formData.minPurchase) || 0,
        maxDiscount: parseFloat(formData.maxDiscount) || 0,
        usageLimit: parseInt(formData.usageLimit) || 0
      };

      const response = await api.put(`/coupons/${editingCoupon._id}`, couponData);
      
      if (response.data.success) {
        setShowEditModal(false);
        setEditingCoupon(null);
        resetForm();
        await fetchCoupons();
      }
    } catch (error: any) {
      setError(error.response?.data?.message || 'Failed to update coupon');
    }
  };

  const handleDeleteCoupon = async (id: string) => {
    if (!confirm('Are you sure you want to delete this coupon?')) return;

    try {
      const response = await api.delete(`/coupons/${id}`);
      
      if (response.data.success) {
        await fetchCoupons();
        await fetchStats();
      }
    } catch (error: any) {
      alert(error.response?.data?.message || 'Failed to delete coupon');
    }
  };

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const resetForm = () => {
    setFormData({
      code: '',
      type: 'percentage',
      value: '',
      minPurchase: '',
      maxDiscount: '',
      usageLimit: '',
      startDate: '',
      endDate: '',
      isActive: true,
      description: ''
    });
    setError('');
  };

  const openEditModal = (coupon: Coupon) => {
    setEditingCoupon(coupon);
    setFormData({
      code: coupon.code,
      type: coupon.type,
      value: coupon.value.toString(),
      minPurchase: coupon.minPurchase.toString(),
      maxDiscount: coupon.maxDiscount.toString(),
      usageLimit: coupon.usageLimit.toString(),
      startDate: coupon.startDate.split('T')[0],
      endDate: coupon.endDate.split('T')[0],
      isActive: coupon.isActive,
      description: coupon.description || ''
    });
    setShowEditModal(true);
  };

  const getCouponStatus = (coupon: Coupon) => {
    const now = new Date();
    const endDate = new Date(coupon.endDate);
    
    if (!coupon.isActive) return { label: 'Inactive', color: '#6B7280', bg: '#F3F4F6' };
    if (endDate < now) return { label: 'Expired', color: '#DC2626', bg: '#FEE2E2' };
    return { label: 'Active', color: '#0F766E', bg: '#D1FAE5' };
  };

  const getDiscountDisplay = (coupon: Coupon) => {
    if (coupon.type === 'percentage') return `${coupon.value}% OFF`;
    if (coupon.type === 'fixed') return `Rs. ${coupon.value} OFF`;
    return 'Free Shipping';
  };

  const filteredCoupons = coupons.filter(coupon => {
    const matchesSearch = coupon.code.toLowerCase().includes(search.toLowerCase());
    return matchesSearch;
  });

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: '32px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div>
            <h1 style={{ 
              fontSize: '32px', 
              fontWeight: '800', 
              color: 'var(--text-primary)',
              marginBottom: '8px'
            }}>
              Coupons Management
            </h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '15px' }}>
              Create and manage discount codes for your store
            </p>
          </div>
          
          <button
            onClick={() => {
              resetForm();
              setShowAddModal(true);
            }}
            style={{
              backgroundColor: 'var(--primary)',
              color: 'white',
              padding: '12px 24px',
              borderRadius: '10px',
              border: 'none',
              cursor: 'pointer',
              fontWeight: '600',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '15px'
            }}
          >
            <Plus size={20} />
            Add Coupon
          </button>
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
                <Tag size={24} color="#3B82F6" />
              </div>
              <div>
                <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                  Total Coupons
                </div>
                <div style={{ fontSize: '24px', fontWeight: '800', color: 'var(--text-primary)' }}>
                  {stats.totalCoupons || 0}
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
                  {stats.activeCoupons || 0}
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
                  Expired
                </div>
                <div style={{ fontSize: '24px', fontWeight: '800', color: 'var(--text-primary)' }}>
                  {stats.expiredCoupons || 0}
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
                <Percent size={24} color="#F59E0B" />
              </div>
              <div>
                <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                  Total Usage
                </div>
                <div style={{ fontSize: '24px', fontWeight: '800', color: 'var(--text-primary)' }}>
                  {stats.totalUsage || 0}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Search & Filter */}
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
              placeholder="Search by coupon code..."
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
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="expired">Expired</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      </div>

      {/* Coupons Grid */}
      {loading ? (
        <div style={{
          backgroundColor: 'var(--card-bg)',
          padding: '60px',
          borderRadius: '12px',
          border: '1px solid var(--border-color)',
          textAlign: 'center'
        }}>
          <Loader size={40} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} color="var(--primary)" />
          <p style={{ color: 'var(--text-secondary)' }}>Loading coupons...</p>
        </div>
      ) : filteredCoupons.length === 0 ? (
        <div style={{
          backgroundColor: 'var(--card-bg)',
          padding: '60px',
          borderRadius: '12px',
          border: '1px solid var(--border-color)',
          textAlign: 'center'
        }}>
          <Tag size={64} style={{ margin: '0 auto 16px', opacity: 0.3 }} color="var(--text-secondary)" />
          <p style={{ fontSize: '18px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '8px' }}>
            No coupons found
          </p>
          <p style={{ color: 'var(--text-secondary)' }}>
            Create your first coupon to start offering discounts
          </p>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))',
          gap: '24px'
        }}>
          {filteredCoupons.map((coupon) => {
            const status = getCouponStatus(coupon);
            return (
              <div
                key={coupon._id}
                style={{
                  backgroundColor: 'var(--card-bg)',
                  borderRadius: '12px',
                  border: '1px solid var(--border-color)',
                  padding: '24px',
                  transition: 'all 0.2s',
                  borderLeft: `4px solid ${status.color}`
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.transform = 'translateY(-4px)';
                  e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.08)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                      <span style={{
                        fontFamily: 'monospace',
                        fontSize: '20px',
                        fontWeight: '800',
                        color: 'var(--primary)',
                        letterSpacing: '1px'
                      }}>
                        {coupon.code}
                      </span>
                      <button
                        onClick={() => handleCopyCode(coupon.code)}
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          color: 'var(--text-secondary)',
                          padding: '4px'
                        }}
                      >
                        {copiedCode === coupon.code ? <Check size={16} color="#10B981" /> : <Copy size={16} />}
                      </button>
                    </div>
                    <span style={{
                      padding: '6px 12px',
                      backgroundColor: status.bg,
                      color: status.color,
                      borderRadius: '20px',
                      fontSize: '12px',
                      fontWeight: '600'
                    }}>
                      {status.label}
                    </span>
                  </div>
                  
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      onClick={() => openEditModal(coupon)}
                      style={{
                        padding: '8px 12px',
                        backgroundColor: '#F59E0B',
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
                      <Edit size={16} />
                    </button>
                    <button
                      onClick={() => handleDeleteCoupon(coupon._id)}
                      style={{
                        padding: '8px 12px',
                        backgroundColor: '#EF4444',
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
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>

                <div style={{
                  padding: '16px',
                  backgroundColor: 'var(--bg-primary)',
                  borderRadius: '10px',
                  marginBottom: '16px',
                  textAlign: 'center'
                }}>
                  <div style={{ fontSize: '28px', fontWeight: '800', color: 'var(--primary)' }}>
                    {getDiscountDisplay(coupon)}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                    {coupon.type === 'percentage' ? 'Percentage Discount' : 
                     coupon.type === 'fixed' ? 'Fixed Amount Discount' : 'Free Shipping'}
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px', fontSize: '13px' }}>
                  {coupon.minPurchase > 0 && (
                    <div style={{ color: 'var(--text-secondary)' }}>
                      Min Purchase: <strong style={{ color: 'var(--text-primary)' }}>Rs. {coupon.minPurchase}</strong>
                    </div>
                  )}
                  {coupon.maxDiscount > 0 && coupon.type === 'percentage' && (
                    <div style={{ color: 'var(--text-secondary)' }}>
                      Max Discount: <strong style={{ color: 'var(--text-primary)' }}>Rs. {coupon.maxDiscount}</strong>
                    </div>
                  )}
                  <div style={{ color: 'var(--text-secondary)' }}>
                    <Calendar size={14} style={{ display: 'inline', marginRight: '6px' }} />
                    {new Date(coupon.startDate).toLocaleDateString()} - {new Date(coupon.endDate).toLocaleDateString()}
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '16px', borderTop: '1px solid var(--border-color)' }}>
                  <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                    Usage: <strong style={{ color: 'var(--text-primary)' }}>{coupon.usedCount}</strong>
                    {coupon.usageLimit > 0 && <span> / {coupon.usageLimit}</span>}
                  </div>
                  <div style={{ 
                    fontSize: '12px', 
                    color: coupon.usageLimit > 0 && coupon.usedCount >= coupon.usageLimit ? '#EF4444' : 'var(--text-secondary)',
                    fontWeight: '600'
                  }}>
                    {coupon.usageLimit > 0 && coupon.usedCount >= coupon.usageLimit ? 'Limit Reached' : 'Available'}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add/Edit Modal */}
      {(showAddModal || showEditModal) && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '20px'
        }} onClick={() => {
          setShowAddModal(false);
          setShowEditModal(false);
          setEditingCoupon(null);
          resetForm();
        }}>
          <div 
            style={{
              backgroundColor: 'var(--card-bg)',
              borderRadius: '16px',
              padding: '32px',
              width: '100%',
              maxWidth: '600px',
              maxHeight: '90vh',
              overflow: 'auto',
              border: '1px solid var(--border-color)'
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h2 style={{ fontSize: '24px', fontWeight: '700', color: 'var(--text-primary)' }}>
                {showAddModal ? 'Add Coupon' : 'Edit Coupon'}
              </h2>
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setShowEditModal(false);
                  setEditingCoupon(null);
                  resetForm();
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--text-secondary)',
                  padding: '8px'
                }}
              >
                <X size={24} />
              </button>
            </div>

            {error && (
              <div style={{
                padding: '12px',
                backgroundColor: '#FEE2E2',
                border: '1px solid #EF4444',
                borderRadius: '8px',
                marginBottom: '20px',
                color: '#DC2626',
                fontSize: '14px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <AlertCircle size={18} />
                {error}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' }}>
                  Coupon Code *
                </label>
                <input
                  type="text"
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                  placeholder="SUMMER20"
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    border: '1px solid var(--border-color)',
                    borderRadius: '10px',
                    fontSize: '16px',
                    fontFamily: 'monospace',
                    fontWeight: '700',
                    letterSpacing: '2px',
                    outline: 'none',
                    backgroundColor: 'var(--input-bg)',
                    color: 'var(--text-primary)'
                  }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' }}>
                    Discount Type *
                  </label>
                  <select
                    value={formData.type}
                    onChange={(e) => setFormData({ ...formData, type: e.target.value as any })}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      border: '1px solid var(--border-color)',
                      borderRadius: '10px',
                      fontSize: '14px',
                      backgroundColor: 'var(--input-bg)',
                      color: 'var(--text-primary)',
                      outline: 'none'
                    }}
                  >
                    <option value="percentage">Percentage (%)</option>
                    <option value="fixed">Fixed Amount (Rs.)</option>
                    <option value="freeshipping">Free Shipping</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' }}>
                    Discount Value *
                  </label>
                  <input
                    type="number"
                    value={formData.value}
                    onChange={(e) => setFormData({ ...formData, value: e.target.value })}
                    placeholder={formData.type === 'percentage' ? '20' : '500'}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      border: '1px solid var(--border-color)',
                      borderRadius: '10px',
                      fontSize: '14px',
                      outline: 'none',
                      backgroundColor: 'var(--input-bg)',
                      color: 'var(--text-primary)'
                    }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' }}>
                    Min Purchase (Rs.)
                  </label>
                  <input
                    type="number"
                    value={formData.minPurchase}
                    onChange={(e) => setFormData({ ...formData, minPurchase: e.target.value })}
                    placeholder="0"
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      border: '1px solid var(--border-color)',
                      borderRadius: '10px',
                      fontSize: '14px',
                      outline: 'none',
                      backgroundColor: 'var(--input-bg)',
                      color: 'var(--text-primary)'
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' }}>
                    Max Discount (Rs.)
                  </label>
                  <input
                    type="number"
                    value={formData.maxDiscount}
                    onChange={(e) => setFormData({ ...formData, maxDiscount: e.target.value })}
                    placeholder="0"
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      border: '1px solid var(--border-color)',
                      borderRadius: '10px',
                      fontSize: '14px',
                      outline: 'none',
                      backgroundColor: 'var(--input-bg)',
                      color: 'var(--text-primary)'
                    }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' }}>
                    Start Date *
                  </label>
                  <input
                    type="date"
                    value={formData.startDate}
                    onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      border: '1px solid var(--border-color)',
                      borderRadius: '10px',
                      fontSize: '14px',
                      outline: 'none',
                      backgroundColor: 'var(--input-bg)',
                      color: 'var(--text-primary)'
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' }}>
                    End Date *
                  </label>
                  <input
                    type="date"
                    value={formData.endDate}
                    onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      border: '1px solid var(--border-color)',
                      borderRadius: '10px',
                      fontSize: '14px',
                      outline: 'none',
                      backgroundColor: 'var(--input-bg)',
                      color: 'var(--text-primary)'
                    }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' }}>
                  Usage Limit (0 = Unlimited)
                </label>
                <input
                  type="number"
                  value={formData.usageLimit}
                  onChange={(e) => setFormData({ ...formData, usageLimit: e.target.value })}
                  placeholder="0"
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    border: '1px solid var(--border-color)',
                    borderRadius: '10px',
                    fontSize: '14px',
                    outline: 'none',
                    backgroundColor: 'var(--input-bg)',
                    color: 'var(--text-primary)'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' }}>
                  Description
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Coupon description..."
                  rows={3}
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    border: '1px solid var(--border-color)',
                    borderRadius: '10px',
                    fontSize: '14px',
                    outline: 'none',
                    backgroundColor: 'var(--input-bg)',
                    color: 'var(--text-primary)',
                    resize: 'vertical'
                  }}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <label style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)' }}>
                  Active
                </label>
                <label style={{ position: 'relative', display: 'inline-block', width: '50px', height: '26px' }}>
                  <input
                    type="checkbox"
                    checked={formData.isActive}
                    onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                    style={{ opacity: 0, width: 0, height: 0 }}
                  />
                  <span style={{
                    position: 'absolute',
                    cursor: 'pointer',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: formData.isActive ? 'var(--primary)' : '#ccc',
                    transition: '.4s',
                    borderRadius: '34px'
                  }}>
                    <span style={{
                      position: 'absolute',
                      content: '""',
                      height: '20px',
                      width: '20px',
                      left: '3px',
                      bottom: '3px',
                      backgroundColor: 'white',
                      transition: '.4s',
                      borderRadius: '50%',
                      transform: formData.isActive ? 'translateX(24px)' : 'translateX(0)'
                    }} />
                  </span>
                </label>
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
                <button
                  onClick={() => {
                    setShowAddModal(false);
                    setShowEditModal(false);
                    setEditingCoupon(null);
                    resetForm();
                  }}
                  style={{
                    flex: 1,
                    padding: '14px',
                    backgroundColor: 'var(--card-bg)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '10px',
                    cursor: 'pointer',
                    fontWeight: '600',
                    fontSize: '15px'
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={showAddModal ? handleAddCoupon : handleEditCoupon}
                  style={{
                    flex: 1,
                    padding: '14px',
                    backgroundColor: 'var(--primary)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '10px',
                    cursor: 'pointer',
                    fontWeight: '600',
                    fontSize: '15px'
                  }}
                >
                  {showAddModal ? 'Add Coupon' : 'Update Coupon'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
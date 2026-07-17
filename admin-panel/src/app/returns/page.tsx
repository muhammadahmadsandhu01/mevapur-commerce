'use client';

import { useState, useEffect } from 'react';
import { RotateCcw, Search, Eye, CheckCircle, XCircle, Clock, AlertCircle, Download, X, Loader } from 'lucide-react';
import api from '@/lib/api';

export default function ReturnsPage() {
  const [returns, setReturns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'received' | 'inspected' | 'refunded' | 'rejected' | 'cancelled'>('all');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [selectedReturn, setSelectedReturn] = useState<any>(null);
  const [showModal, setShowModal] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    const fetchReturns = async () => {
      setLoading(true);
      try {
        const params: any = { page, limit: 15 };
        if (searchQuery) params.search = searchQuery;
        if (statusFilter !== 'all') params.status = statusFilter;

        const response = await api.get('/returns', { params });
        if (response.data.success) {
          setReturns(response.data.data);
          setTotalPages(response.data.pagination?.pages || 1);
        }
      } catch (error) {
        console.error('Error fetching returns:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchReturns();
  }, [page, searchQuery, statusFilter]);

  const handleStatusUpdate = async (id: string, newStatus: string) => {
    setActionLoading(true);
    try {
      await api.put(`/returns/${id}/status`, { status: newStatus });
      setShowModal(false);
      const params: any = { page, limit: 15 };
      if (searchQuery) params.search = searchQuery;
      if (statusFilter !== 'all') params.status = statusFilter;
      const response = await api.get('/returns', { params });
      if (response.data.success) setReturns(response.data.data);
    } catch (error) {
      console.error('Error updating return:', error);
      alert('Failed to update return status');
    } finally {
      setActionLoading(false);
    }
  };

  const stats = {
    total: returns.length,
    pending: returns.filter(r => r.status === 'pending').length,
    approved: returns.filter(r => r.status === 'approved').length,
    rejected: returns.filter(r => r.status === 'rejected').length,
  };

  const getStatusBadge = (status: string) => {
    const s = status.toLowerCase();
    switch (s) {
      case 'pending': return { bg: '#FEF3C7', color: '#92400E', icon: Clock };
      case 'approved': case 'received': case 'inspected': return { bg: '#DBEAFE', color: '#1E40AF', icon: CheckCircle };
      case 'refunded': return { bg: '#D1FAE5', color: '#0F766E', icon: CheckCircle };
      case 'rejected': case 'cancelled': return { bg: '#FEE2E2', color: '#DC2626', icon: XCircle };
      default: return { bg: '#F3F4F6', color: '#6B7280', icon: AlertCircle };
    }
  };

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '28px', fontWeight: '800', color: 'var(--text-primary)', marginBottom: '8px', letterSpacing: '-0.5px' }}>Returns Management</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '15px' }}>Process and manage customer return requests efficiently.</p>
        </div>
        <button style={{ padding: '12px 20px', backgroundColor: 'var(--card-bg)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '10px', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Download size={18} /> Export Report
        </button>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        {[
          { label: 'Total Returns', value: stats.total, color: '#3B82F6', bg: '#DBEAFE', icon: RotateCcw },
          { label: 'Pending', value: stats.pending, color: '#F59E0B', bg: '#FEF3C7', icon: Clock },
          { label: 'Approved', value: stats.approved, color: '#1E40AF', bg: '#DBEAFE', icon: CheckCircle },
          { label: 'Rejected', value: stats.rejected, color: '#EF4444', bg: '#FEE2E2', icon: XCircle },
        ].map((stat, idx) => (
          <div key={idx} style={{ backgroundColor: 'var(--card-bg)', borderRadius: '12px', padding: '20px', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ width: '48px', height: '48px', borderRadius: '10px', backgroundColor: stat.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <stat.icon size={24} color={stat.color} />
            </div>
            <div>
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: '500', marginBottom: '4px' }}>{stat.label}</div>
              <div style={{ fontSize: '24px', fontWeight: '800', color: 'var(--text-primary)' }}>{stat.value}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ backgroundColor: 'var(--card-bg)', borderRadius: '12px', padding: '16px 20px', border: '1px solid var(--border-color)', marginBottom: '24px', display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ flex: 1, minWidth: '280px', position: 'relative' }}>
          <Search size={18} color="var(--text-secondary)" style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)' }} />
          <input type="text" placeholder="Search by Return #, Order # or Customer..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
            style={{ width: '100%', padding: '10px 14px 10px 42px', borderRadius: '8px', border: '1px solid var(--border-color)', backgroundColor: 'var(--input-bg)', color: 'var(--text-primary)', fontSize: '14px', outline: 'none' }} />
        </div>
        <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value as any); setPage(1); }}
          style={{ padding: '10px 32px 10px 14px', borderRadius: '8px', border: '1px solid var(--border-color)', backgroundColor: 'var(--input-bg)', color: 'var(--text-primary)', fontSize: '14px', fontWeight: '500', outline: 'none', cursor: 'pointer' }}>
          <option value="all">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="refunded">Refunded</option>
          <option value="rejected">Rejected</option>
        </select>
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {[...Array(5)].map((_, i) => (<div key={i} style={{ backgroundColor: 'var(--card-bg)', borderRadius: '12px', height: '80px', animation: 'pulse 1.5s infinite', border: '1px solid var(--border-color)' }} />))}
        </div>
      ) : returns.length === 0 ? (
        <div style={{ backgroundColor: 'var(--card-bg)', borderRadius: '12px', padding: '80px 20px', textAlign: 'center', border: '1px solid var(--border-color)', borderStyle: 'dashed' }}>
          <RotateCcw size={48} color="var(--text-secondary)" style={{ opacity: 0.3, marginBottom: '16px' }} />
          <h3 style={{ fontSize: '20px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '8px' }}>No returns found</h3>
        </div>
      ) : (
        <div style={{ backgroundColor: 'var(--card-bg)', borderRadius: '12px', border: '1px solid var(--border-color)', overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '900px' }}>
              <thead>
                <tr style={{ backgroundColor: 'var(--bg-primary)', borderBottom: '1px solid var(--border-color)' }}>
                  {['Return #', 'Order #', 'Customer', 'Product', 'Reason', 'Amount', 'Status', 'Actions'].map(h => (
                    <th key={h} style={{ padding: '16px 20px', textAlign: 'left', fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody style={{ borderTop: '1px solid var(--border-color)' }}>
                {returns.map((ret) => {
                  const badge = getStatusBadge(ret.status);
                  const BadgeIcon = badge.icon;
                  const productName = ret.items?.[0]?.product?.name || (ret.items?.length > 1 ? `${ret.items.length} Items` : 'Unknown');
                  const reason = ret.items?.[0]?.reason || 'N/A';
                  
                  return (
                    <tr key={ret._id} style={{ borderBottom: '1px solid var(--border-color)', transition: 'background-color 0.2s', cursor: 'pointer' }}
                      onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--hover-bg)'}
                      onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                      onClick={() => { setSelectedReturn(ret); setShowModal(true); }}>
                      <td style={{ padding: '16px 20px', fontWeight: '700', color: 'var(--primary)', fontFamily: 'monospace' }}>{ret.returnNumber}</td>
                      <td style={{ padding: '16px 20px', color: 'var(--text-secondary)' }}>{ret.order?.orderId || 'N/A'}</td>
                      <td style={{ padding: '16px 20px', fontWeight: '600', color: 'var(--text-primary)' }}>{ret.customer?.fullName || 'N/A'}</td>
                      <td style={{ padding: '16px 20px', color: 'var(--text-secondary)' }}>{productName}</td>
                      <td style={{ padding: '16px 20px', color: 'var(--text-secondary)', maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{reason}</td>
                      <td style={{ padding: '16px 20px', fontWeight: '600', color: 'var(--text-primary)' }}>Rs. {(ret.refundAmount || 0).toLocaleString()}</td>
                      <td style={{ padding: '16px 20px' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '6px 12px', backgroundColor: badge.bg, color: badge.color, borderRadius: '20px', fontSize: '12px', fontWeight: '700', textTransform: 'capitalize' }}>
                          <BadgeIcon size={14} /> {ret.status}
                        </div>
                      </td>
                      <td style={{ padding: '16px 20px', textAlign: 'right' }}>
                        <button style={{ padding: '8px 12px', backgroundColor: 'var(--bg-primary)', color: 'var(--primary)', border: '1px solid var(--border-color)', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '600', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <Eye size={14} /> View
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {showModal && selectedReturn && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }} onClick={() => setShowModal(false)}>
          <div style={{ backgroundColor: 'var(--card-bg)', borderRadius: '16px', padding: '32px', maxWidth: '600px', width: '100%' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h2 style={{ fontSize: '24px', fontWeight: '800', color: 'var(--text-primary)' }}>Return Details</h2>
              <button onClick={() => setShowModal(false)} style={{ padding: '8px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}><X size={24} /></button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
              <div><div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Return #</div><div style={{ fontWeight: '700', color: 'var(--text-primary)' }}>{selectedReturn.returnNumber}</div></div>
              <div><div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Order #</div><div style={{ fontWeight: '700', color: 'var(--text-primary)' }}>{selectedReturn.order?.orderId || 'N/A'}</div></div>
              <div><div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Customer</div><div style={{ fontWeight: '700', color: 'var(--text-primary)' }}>{selectedReturn.customer?.fullName || 'N/A'}</div></div>
              <div><div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Refund Amount</div><div style={{ fontWeight: '700', color: 'var(--primary)' }}>Rs. {(selectedReturn.refundAmount || 0).toLocaleString()}</div></div>
            </div>
            <div style={{ padding: '16px', backgroundColor: 'var(--bg-primary)', borderRadius: '10px', marginBottom: '24px' }}>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: '600', textTransform: 'uppercase' }}>Reason for Return</div>
              <p style={{ color: 'var(--text-primary)', fontSize: '14px', lineHeight: '1.6' }}>{selectedReturn.items?.[0]?.reasonDetails || selectedReturn.items?.[0]?.reason || 'No details provided'}</p>
            </div>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowModal(false)} style={{ padding: '12px 24px', backgroundColor: 'var(--card-bg)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '10px', fontWeight: '700', cursor: 'pointer' }}>Close</button>
              {selectedReturn.status === 'pending' && (
                <>
                  <button onClick={() => handleStatusUpdate(selectedReturn._id, 'rejected')} disabled={actionLoading} style={{ padding: '12px 24px', backgroundColor: '#FEE2E2', color: '#DC2626', border: 'none', borderRadius: '10px', fontWeight: '700', cursor: actionLoading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {actionLoading ? <Loader size={16} className="animate-spin" /> : <XCircle size={16} />} Reject
                  </button>
                  <button onClick={() => handleStatusUpdate(selectedReturn._id, 'approved')} disabled={actionLoading} style={{ padding: '12px 24px', backgroundColor: '#D1FAE5', color: '#0F766E', border: 'none', borderRadius: '10px', fontWeight: '700', cursor: actionLoading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {actionLoading ? <Loader size={16} className="animate-spin" /> : <CheckCircle size={16} />} Approve
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
      <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }`}</style>
    </div>
  );
}
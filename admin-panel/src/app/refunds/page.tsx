'use client';

import { useState, useEffect } from 'react';
import { ArrowLeftCircle, Search, Eye, CheckCircle, XCircle, Clock, AlertCircle, Download, Loader } from 'lucide-react';
import api from '@/lib/api';

export default function RefundsPage() {
  const [refunds, setRefunds] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'processed' | 'failed'>('all');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    const fetchRefunds = async () => {
      setLoading(true);
      try {
        const params: any = { page, limit: 15 };
        if (searchQuery) params.search = searchQuery;
        if (statusFilter !== 'all') params.status = statusFilter;

        const response = await api.get('/refunds', { params });
        if (response.data.success) {
          setRefunds(response.data.data);
          setTotalPages(response.data.pagination?.pages || 1);
        }
      } catch (error) {
        console.error('Error fetching refunds:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchRefunds();
  }, [page, searchQuery, statusFilter]);

  const stats = {
    totalAmount: refunds.reduce((acc, curr) => acc + (curr.amount || 0), 0),
    pending: refunds.filter(r => r.status === 'pending').length,
    processed: refunds.filter(r => r.status === 'processed').length,
  };

  const getStatusBadge = (status: string) => {
    const s = status.toLowerCase();
    switch (s) {
      case 'pending': return { bg: '#FEF3C7', color: '#92400E', icon: Clock };
      case 'processed': return { bg: '#D1FAE5', color: '#0F766E', icon: CheckCircle };
      case 'failed': return { bg: '#FEE2E2', color: '#DC2626', icon: XCircle };
      default: return { bg: '#F3F4F6', color: '#6B7280', icon: AlertCircle };
    }
  };

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '28px', fontWeight: '800', color: 'var(--text-primary)', marginBottom: '8px', letterSpacing: '-0.5px' }}>Refunds Management</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '15px' }}>Track and process financial refunds for returned or cancelled orders.</p>
        </div>
        <button style={{ padding: '12px 20px', backgroundColor: 'var(--card-bg)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '10px', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Download size={18} /> Export CSV
        </button>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        {[
          { label: 'Total Refunded', value: `Rs. ${stats.totalAmount.toLocaleString()}`, color: '#A855F7', bg: '#FDF4FF', icon: ArrowLeftCircle },
          { label: 'Pending', value: stats.pending, color: '#F59E0B', bg: '#FEF3C7', icon: Clock },
          { label: 'Processed', value: stats.processed, color: '#10B981', bg: '#D1FAE5', icon: CheckCircle },
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
          <input type="text" placeholder="Search by Refund # or Customer..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
            style={{ width: '100%', padding: '10px 14px 10px 42px', borderRadius: '8px', border: '1px solid var(--border-color)', backgroundColor: 'var(--input-bg)', color: 'var(--text-primary)', fontSize: '14px', outline: 'none' }} />
        </div>
        <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value as any); setPage(1); }}
          style={{ padding: '10px 32px 10px 14px', borderRadius: '8px', border: '1px solid var(--border-color)', backgroundColor: 'var(--input-bg)', color: 'var(--text-primary)', fontSize: '14px', fontWeight: '500', outline: 'none', cursor: 'pointer' }}>
          <option value="all">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="processed">Processed</option>
          <option value="failed">Failed</option>
        </select>
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {[...Array(5)].map((_, i) => (<div key={i} style={{ backgroundColor: 'var(--card-bg)', borderRadius: '12px', height: '80px', animation: 'pulse 1.5s infinite', border: '1px solid var(--border-color)' }} />))}
        </div>
      ) : refunds.length === 0 ? (
        <div style={{ backgroundColor: 'var(--card-bg)', borderRadius: '12px', padding: '80px 20px', textAlign: 'center', border: '1px solid var(--border-color)', borderStyle: 'dashed' }}>
          <ArrowLeftCircle size={48} color="var(--text-secondary)" style={{ opacity: 0.3, marginBottom: '16px' }} />
          <h3 style={{ fontSize: '20px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '8px' }}>No refunds found</h3>
        </div>
      ) : (
        <div style={{ backgroundColor: 'var(--card-bg)', borderRadius: '12px', border: '1px solid var(--border-color)', overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '900px' }}>
              <thead>
                <tr style={{ backgroundColor: 'var(--bg-primary)', borderBottom: '1px solid var(--border-color)' }}>
                  {['Refund #', 'Customer', 'Amount', 'Method', 'Status', 'Date', 'Actions'].map(h => (
                    <th key={h} style={{ padding: '16px 20px', textAlign: 'left', fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody style={{ borderTop: '1px solid var(--border-color)' }}>
                {refunds.map((ref) => {
                  const badge = getStatusBadge(ref.status);
                  const BadgeIcon = badge.icon;
                  return (
                    <tr key={ref._id} style={{ borderBottom: '1px solid var(--border-color)', transition: 'background-color 0.2s' }}
                      onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--hover-bg)'}
                      onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
                      <td style={{ padding: '16px 20px', fontWeight: '700', color: 'var(--primary)', fontFamily: 'monospace' }}>{ref.refundNumber}</td>
                      <td style={{ padding: '16px 20px', fontWeight: '600', color: 'var(--text-primary)' }}>{ref.customer?.fullName || 'N/A'}</td>
                      <td style={{ padding: '16px 20px', fontWeight: '700', color: 'var(--text-primary)' }}>Rs. {(ref.amount || 0).toLocaleString()}</td>
                      <td style={{ padding: '16px 20px', color: 'var(--text-secondary)', textTransform: 'capitalize' }}>{ref.method?.replace('_', ' ') || 'N/A'}</td>
                      <td style={{ padding: '16px 20px' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '6px 12px', backgroundColor: badge.bg, color: badge.color, borderRadius: '20px', fontSize: '12px', fontWeight: '700', textTransform: 'capitalize' }}>
                          <BadgeIcon size={14} /> {ref.status}
                        </div>
                      </td>
                      <td style={{ padding: '16px 20px', color: 'var(--text-secondary)', fontSize: '13px' }}>{ref.createdAt ? new Date(ref.createdAt).toLocaleDateString() : '-'}</td>
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
      <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }`}</style>
    </div>
  );
}
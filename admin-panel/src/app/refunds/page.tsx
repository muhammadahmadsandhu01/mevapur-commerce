'use client';

import { useEffect, useState } from 'react';
import { 
  DollarSign, 
  CheckCircle, 
  Clock,
  Search,
  Filter,
  Loader,
  Download,
  CreditCard,
  Wallet,
  Banknote,
  TrendingDown
} from 'lucide-react';
import api from '@/lib/api';

interface Refund {
  _id: string;
  returnNumber: string;
  order: {
    orderId: string;
  };
  customer: {
    fullName: string;
    email: string;
  };
  refundAmount: number;
  refundMethod: string;
  status: string;
  refundedAt: string;
  reason: string;
}

export default function RefundsPage() {
  const [refunds, setRefunds] = useState<Refund[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [methodFilter, setMethodFilter] = useState('');
  const [stats, setStats] = useState<any>(null);

  useEffect(() => {
    fetchRefunds();
    fetchStats();
  }, [search, methodFilter]);

  const fetchRefunds = async () => {
    try {
      setLoading(true);
      const params: any = {};
      if (search) params.search = search;
      if (methodFilter) params.refundMethod = methodFilter;

      // Get all refunded returns
      const response = await api.get('/returns', { 
        params: { ...params, status: 'refunded' } 
      });
      if (response.data.success) {
        setRefunds(response.data.data);
      }
    } catch (error) {
      console.error('Error fetching refunds:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await api.get('/returns/stats');
      if (response.data.success) {
        setStats(response.data.data);
      }
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  const handleExport = () => {
    // CSV export functionality
    const csv = refunds.map(r => ({
      'Return Number': r.returnNumber,
      'Order ID': r.order?.orderId,
      'Customer': r.customer?.fullName,
      'Email': r.customer?.email,
      'Refund Amount': r.refundAmount,
      'Method': r.refundMethod,
      'Date': new Date(r.refundedAt).toLocaleDateString()
    }));
    
    // Download CSV
    const headers = ['Return Number', 'Order ID', 'Customer', 'Email', 'Refund Amount', 'Method', 'Date'];
    const csvContent = [
      headers.join(','),
      ...csv.map(row => headers.map(h => `"${row[h as keyof typeof row]}"`).join(','))
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `refunds_${Date.now()}.csv`;
    a.click();
  };

  const getMethodIcon = (method: string) => {
    switch (method) {
      case 'original_payment': return CreditCard;
      case 'store_credit': return Wallet;
      case 'bank_transfer': return Banknote;
      default: return DollarSign;
    }
  };

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: '32px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div>
            <h1 style={{ fontSize: '32px', fontWeight: '800', color: 'var(--text-primary)', marginBottom: '8px' }}>
              Refunds History
            </h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '15px' }}>
              View and manage processed refunds
            </p>
          </div>
          
          <button
            onClick={handleExport}
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
            <Download size={20} />
            Export CSV
          </button>
        </div>

        {/* Stats Cards */}
        {stats && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '24px' }}>
            <div style={{ backgroundColor: 'var(--card-bg)', padding: '20px', borderRadius: '12px', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{ width: '48px', height: '48px', borderRadius: '10px', backgroundColor: '#D1FAE5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <CheckCircle size={24} color="#10B981" />
              </div>
              <div>
                <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Total Refunded</div>
                <div style={{ fontSize: '24px', fontWeight: '800', color: 'var(--text-primary)' }}>Rs. {stats.totalRefundAmount?.toLocaleString() || 0}</div>
              </div>
            </div>

            <div style={{ backgroundColor: 'var(--card-bg)', padding: '20px', borderRadius: '12px', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{ width: '48px', height: '48px', borderRadius: '10px', backgroundColor: '#DBEAFE', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <DollarSign size={24} color="#3B82F6" />
              </div>
              <div>
                <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Refund Count</div>
                <div style={{ fontSize: '24px', fontWeight: '800', color: 'var(--text-primary)' }}>{stats.refundedReturns || 0}</div>
              </div>
            </div>

            <div style={{ backgroundColor: 'var(--card-bg)', padding: '20px', borderRadius: '12px', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{ width: '48px', height: '48px', borderRadius: '10px', backgroundColor: '#FEF3C7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <TrendingDown size={24} color="#F59E0B" />
              </div>
              <div>
                <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Return Rate</div>
                <div style={{ fontSize: '24px', fontWeight: '800', color: 'var(--text-primary)' }}>{stats.returnRate || '0%'}</div>
              </div>
            </div>

            <div style={{ backgroundColor: 'var(--card-bg)', padding: '20px', borderRadius: '12px', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{ width: '48px', height: '48px', borderRadius: '10px', backgroundColor: '#EDE9FE', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Clock size={24} color="#8B5CF6" />
              </div>
              <div>
                <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Avg Refund Time</div>
                <div style={{ fontSize: '24px', fontWeight: '800', color: 'var(--text-primary)' }}>3.2 days</div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Filters */}
      <div style={{ backgroundColor: 'var(--card-bg)', padding: '20px', borderRadius: '12px', border: '1px solid var(--border-color)', marginBottom: '24px' }}>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ flex: 1, minWidth: '300px', position: 'relative' }}>
            <Search size={18} style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
            <input
              type="text"
              placeholder="Search by return number or customer..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ width: '100%', padding: '12px 16px 12px 48px', border: '1px solid var(--border-color)', borderRadius: '10px', fontSize: '14px', outline: 'none', backgroundColor: 'var(--input-bg)', color: 'var(--text-primary)' }}
            />
          </div>

          <select
            value={methodFilter}
            onChange={(e) => setMethodFilter(e.target.value)}
            style={{ padding: '12px 16px', border: '1px solid var(--border-color)', borderRadius: '10px', fontSize: '14px', backgroundColor: 'var(--input-bg)', color: 'var(--text-primary)', cursor: 'pointer', outline: 'none' }}
          >
            <option value="">All Methods</option>
            <option value="original_payment">Original Payment</option>
            <option value="store_credit">Store Credit</option>
            <option value="bank_transfer">Bank Transfer</option>
          </select>
        </div>
      </div>

      {/* Refunds List */}
      {loading ? (
        <div style={{ backgroundColor: 'var(--card-bg)', padding: '60px', borderRadius: '12px', border: '1px solid var(--border-color)', textAlign: 'center' }}>
          <Loader size={40} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} color="var(--primary)" />
          <p style={{ color: 'var(--text-secondary)' }}>Loading refunds...</p>
        </div>
      ) : refunds.length === 0 ? (
        <div style={{ backgroundColor: 'var(--card-bg)', padding: '60px', borderRadius: '12px', border: '1px solid var(--border-color)', textAlign: 'center' }}>
          <DollarSign size={64} style={{ margin: '0 auto 16px', opacity: 0.3 }} color="var(--text-secondary)" />
          <p style={{ fontSize: '18px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '8px' }}>No refunds yet</p>
          <p style={{ color: 'var(--text-secondary)' }}>Processed refunds will appear here</p>
        </div>
      ) : (
        <div style={{ backgroundColor: 'var(--card-bg)', borderRadius: '12px', border: '1px solid var(--border-color)', overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ backgroundColor: 'var(--bg-primary)' }}>
                <tr>
                  <th style={{ padding: '16px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: '600' }}>Return #</th>
                  <th style={{ padding: '16px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: '600' }}>Order</th>
                  <th style={{ padding: '16px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: '600' }}>Customer</th>
                  <th style={{ padding: '16px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: '600' }}>Method</th>
                  <th style={{ padding: '16px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: '600' }}>Amount</th>
                  <th style={{ padding: '16px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: '600' }}>Date</th>
                </tr>
              </thead>
              <tbody>
                {refunds.map((refund) => {
                  const MethodIcon = getMethodIcon(refund.refundMethod);
                  return (
                    <tr key={refund._id} style={{ borderBottom: '1px solid var(--border-color)' }}
                      onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--hover-bg)'}
                      onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
                      <td style={{ padding: '16px', fontFamily: 'monospace', fontWeight: '700', color: 'var(--primary)' }}>
                        {refund.returnNumber}
                      </td>
                      <td style={{ padding: '16px', color: 'var(--text-secondary)', fontSize: '14px' }}>
                        {refund.order?.orderId}
                      </td>
                      <td style={{ padding: '16px' }}>
                        <div style={{ fontWeight: '600', color: 'var(--text-primary)' }}>{refund.customer?.fullName}</div>
                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{refund.customer?.email}</div>
                      </td>
                      <td style={{ padding: '16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <MethodIcon size={16} color="var(--text-secondary)" />
                          <span style={{ fontSize: '13px', color: 'var(--text-secondary)', textTransform: 'capitalize' }}>
                            {refund.refundMethod.replace('_', ' ')}
                          </span>
                        </div>
                      </td>
                      <td style={{ padding: '16px', fontWeight: '700', color: '#10B981' }}>
                        Rs. {refund.refundAmount?.toLocaleString()}
                      </td>
                      <td style={{ padding: '16px', color: 'var(--text-secondary)', fontSize: '13px' }}>
                        {new Date(refund.refundedAt).toLocaleDateString('en-PK', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
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
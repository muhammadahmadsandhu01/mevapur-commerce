'use client';

import { useEffect, useState } from 'react';
import { 
  RotateCcw, 
  CheckCircle, 
  XCircle, 
  Clock, 
  Truck, 
  DollarSign,
  Search,
  Filter,
  Loader,
  Eye,
  AlertCircle,
  MessageSquare,
  Package,
  TrendingDown,
  BarChart3
} from 'lucide-react';
import api from '@/lib/api';

interface ReturnItem {
  _id: string;
  returnNumber: string;
  order: {
    _id: string;
    orderId: string;
    totalAmount: number;
  };
  customer: {
    fullName: string;
    email: string;
    phone: string;
  };
  items: Array<{
    product: { _id: string; name: string; images: string[] };
    name: string;
    quantity: number;
    price: number;
    reason: string;
    reasonDetails: string;
    condition: string;
  }>;
  status: 'pending' | 'approved' | 'received' | 'inspected' | 'refunded' | 'rejected' | 'cancelled';
  refundMethod: string;
  refundAmount: number;
  customerNotes: string;
  adminNotes: Array<{
    note: string;
    addedBy: { fullName: string };
    addedAt: string;
  }>;
  createdAt: string;
}

export default function ReturnsPage() {
  const [returns, setReturns] = useState<ReturnItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [pagination, setPagination] = useState<any>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [stats, setStats] = useState<any>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedReturn, setSelectedReturn] = useState<ReturnItem | null>(null);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [newStatus, setNewStatus] = useState('');
  const [adminNote, setAdminNote] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    fetchReturns();
    fetchStats();
  }, [currentPage, search, statusFilter]);

  const fetchReturns = async () => {
    try {
      setLoading(true);
      const params: any = { page: currentPage, limit: 10 };
      if (search) params.search = search;
      if (statusFilter) params.status = statusFilter;

      const response = await api.get('/returns', { params });
      if (response.data.success) {
        setReturns(response.data.data);
        setPagination(response.data.pagination);
      }
    } catch (error) {
      console.error('Error fetching returns:', error);
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

  const handleStatusUpdate = async () => {
    if (!selectedReturn || !newStatus) return;

    setActionLoading(true);
    try {
      const response = await api.put(`/returns/${selectedReturn._id}/status`, {
        status: newStatus,
        adminNotes: adminNote
      });
      if (response.data.success) {
        setShowStatusModal(false);
        setSelectedReturn(null);
        setNewStatus('');
        setAdminNote('');
        await fetchReturns();
        await fetchStats();
      }
    } catch (error: any) {
      alert(error.response?.data?.message || 'Failed to update status');
    } finally {
      setActionLoading(false);
    }
  };

  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'pending': return { label: 'Pending', color: '#F59E0B', bg: '#FEF3C7', icon: Clock };
      case 'approved': return { label: 'Approved', color: '#3B82F6', bg: '#DBEAFE', icon: CheckCircle };
      case 'received': return { label: 'Received', color: '#8B5CF6', bg: '#EDE9FE', icon: Package };
      case 'inspected': return { label: 'Inspected', color: '#06B6D4', bg: '#CFFAFE', icon: Eye };
      case 'refunded': return { label: 'Refunded', color: '#10B981', bg: '#D1FAE5', icon: DollarSign };
      case 'rejected': return { label: 'Rejected', color: '#EF4444', bg: '#FEE2E2', icon: XCircle };
      case 'cancelled': return { label: 'Cancelled', color: '#6B7280', bg: '#F3F4F6', icon: XCircle };
      default: return { label: status, color: '#6B7280', bg: '#F3F4F6', icon: Clock };
    }
  };

  const getReasonLabel = (reason: string) => {
    const labels: any = {
      damaged: 'Damaged Product',
      wrong_item: 'Wrong Item Received',
      not_as_described: 'Not As Described',
      not_satisfied: 'Not Satisfied',
      duplicate: 'Duplicate Order',
      other: 'Other'
    };
    return labels[reason] || reason;
  };

  const inputStyle = {
    width: '100%',
    padding: '12px 16px',
    border: '1px solid var(--border-color)',
    borderRadius: '10px',
    fontSize: '14px',
    outline: 'none',
    backgroundColor: 'var(--input-bg)',
    color: 'var(--text-primary)'
  };

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ fontSize: '32px', fontWeight: '800', color: 'var(--text-primary)', marginBottom: '8px' }}>
          Returns & Refunds
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '15px' }}>
          Manage customer return requests and process refunds
        </p>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
          <div style={{ backgroundColor: 'var(--card-bg)', padding: '20px', borderRadius: '12px', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ width: '48px', height: '48px', borderRadius: '10px', backgroundColor: '#FEF3C7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Clock size={24} color="#F59E0B" />
            </div>
            <div>
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Pending</div>
              <div style={{ fontSize: '24px', fontWeight: '800', color: 'var(--text-primary)' }}>{stats.pendingReturns}</div>
            </div>
          </div>

          <div style={{ backgroundColor: 'var(--card-bg)', padding: '20px', borderRadius: '12px', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ width: '48px', height: '48px', borderRadius: '10px', backgroundColor: '#D1FAE5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <DollarSign size={24} color="#10B981" />
            </div>
            <div>
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Refunded</div>
              <div style={{ fontSize: '24px', fontWeight: '800', color: 'var(--text-primary)' }}>{stats.refundedReturns}</div>
            </div>
          </div>

          <div style={{ backgroundColor: 'var(--card-bg)', padding: '20px', borderRadius: '12px', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ width: '48px', height: '48px', borderRadius: '10px', backgroundColor: '#FEE2E2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <TrendingDown size={24} color="#EF4444" />
            </div>
            <div>
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Total Refunded</div>
              <div style={{ fontSize: '24px', fontWeight: '800', color: '#EF4444' }}>Rs. {stats.totalRefundAmount?.toLocaleString() || 0}</div>
            </div>
          </div>

          <div style={{ backgroundColor: 'var(--card-bg)', padding: '20px', borderRadius: '12px', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ width: '48px', height: '48px', borderRadius: '10px', backgroundColor: '#DBEAFE', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <BarChart3 size={24} color="#3B82F6" />
            </div>
            <div>
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Return Rate</div>
              <div style={{ fontSize: '24px', fontWeight: '800', color: 'var(--text-primary)' }}>{stats.returnRate}</div>
            </div>
          </div>
        </div>
      )}

      {/* Reason Breakdown */}
      {stats?.reasonBreakdown && stats.reasonBreakdown.length > 0 && (
        <div style={{ backgroundColor: 'var(--card-bg)', padding: '24px', borderRadius: '12px', border: '1px solid var(--border-color)', marginBottom: '24px' }}>
          <h3 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '16px', color: 'var(--text-primary)' }}>
            Return Reasons Breakdown
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
            {stats.reasonBreakdown.map((reason: any, index: number) => (
              <div key={index} style={{ padding: '16px', backgroundColor: 'var(--bg-primary)', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '8px', textTransform: 'capitalize' }}>
                  {reason._id.replace('_', ' ')}
                </div>
                <div style={{ fontSize: '24px', fontWeight: '800', color: 'var(--primary)' }}>
                  {reason.count}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

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
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{ padding: '12px 16px', border: '1px solid var(--border-color)', borderRadius: '10px', fontSize: '14px', backgroundColor: 'var(--input-bg)', color: 'var(--text-primary)', cursor: 'pointer', outline: 'none' }}
          >
            <option value="">All Status</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="received">Received</option>
            <option value="inspected">Inspected</option>
            <option value="refunded">Refunded</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
      </div>

      {/* Returns List */}
      {loading ? (
        <div style={{ backgroundColor: 'var(--card-bg)', padding: '60px', borderRadius: '12px', border: '1px solid var(--border-color)', textAlign: 'center' }}>
          <Loader size={40} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} color="var(--primary)" />
          <p style={{ color: 'var(--text-secondary)' }}>Loading returns...</p>
        </div>
      ) : returns.length === 0 ? (
        <div style={{ backgroundColor: 'var(--card-bg)', padding: '60px', borderRadius: '12px', border: '1px solid var(--border-color)', textAlign: 'center' }}>
          <RotateCcw size={64} style={{ margin: '0 auto 16px', opacity: 0.3 }} color="var(--text-secondary)" />
          <p style={{ fontSize: '18px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '8px' }}>No returns found</p>
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
                  <th style={{ padding: '16px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: '600' }}>Items</th>
                  <th style={{ padding: '16px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: '600' }}>Refund</th>
                  <th style={{ padding: '16px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: '600' }}>Status</th>
                  <th style={{ padding: '16px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: '600' }}>Date</th>
                  <th style={{ padding: '16px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: '600' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {returns.map((ret) => {
                  const statusConfig = getStatusConfig(ret.status);
                  const StatusIcon = statusConfig.icon;
                  return (
                    <tr key={ret._id} style={{ borderBottom: '1px solid var(--border-color)' }}
                      onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--hover-bg)'}
                      onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
                      <td style={{ padding: '16px', fontFamily: 'monospace', fontWeight: '700', color: 'var(--primary)' }}>
                        {ret.returnNumber}
                      </td>
                      <td style={{ padding: '16px', color: 'var(--text-secondary)', fontSize: '14px' }}>
                        {ret.order?.orderId || 'N/A'}
                      </td>
                      <td style={{ padding: '16px' }}>
                        <div style={{ fontWeight: '600', color: 'var(--text-primary)' }}>{ret.customer?.fullName}</div>
                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{ret.customer?.email}</div>
                      </td>
                      <td style={{ padding: '16px', color: 'var(--text-secondary)' }}>
                        {ret.items.length} item(s)
                      </td>
                      <td style={{ padding: '16px', fontWeight: '700', color: 'var(--text-primary)' }}>
                        Rs. {ret.refundAmount?.toLocaleString() || 0}
                      </td>
                      <td style={{ padding: '16px' }}>
                        <span style={{
                          padding: '6px 12px',
                          backgroundColor: statusConfig.bg,
                          color: statusConfig.color,
                          borderRadius: '20px',
                          fontSize: '12px',
                          fontWeight: '600',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px'
                        }}>
                          <StatusIcon size={14} />
                          {statusConfig.label}
                        </span>
                      </td>
                      <td style={{ padding: '16px', color: 'var(--text-secondary)', fontSize: '13px' }}>
                        {new Date(ret.createdAt).toLocaleDateString('en-PK', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </td>
                      <td style={{ padding: '16px' }}>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button
                            onClick={() => {
                              setSelectedReturn(ret);
                              setShowDetailModal(true);
                            }}
                            style={{
                              padding: '8px 12px',
                              backgroundColor: 'var(--primary)',
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
                            <Eye size={16} />
                            View
                          </button>
                          {ret.status !== 'refunded' && ret.status !== 'rejected' && ret.status !== 'cancelled' && (
                            <button
                              onClick={() => {
                                setSelectedReturn(ret);
                                setNewStatus('');
                                setAdminNote('');
                                setShowStatusModal(true);
                              }}
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
                              Update
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {pagination && pagination.pages > 1 && (
            <div style={{ padding: '20px', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'center', gap: '8px' }}>
              <button
                onClick={() => setCurrentPage(pagination.page - 1)}
                disabled={!pagination.hasPrev}
                style={{ padding: '8px 16px', backgroundColor: pagination.hasPrev ? 'var(--primary)' : '#9CA3AF', color: 'white', border: 'none', borderRadius: '8px', cursor: pagination.hasPrev ? 'pointer' : 'not-allowed', fontWeight: '600' }}
              >
                Previous
              </button>
              <button
                onClick={() => setCurrentPage(pagination.page + 1)}
                disabled={!pagination.hasNext}
                style={{ padding: '8px 16px', backgroundColor: pagination.hasNext ? 'var(--primary)' : '#9CA3AF', color: 'white', border: 'none', borderRadius: '8px', cursor: pagination.hasNext ? 'pointer' : 'not-allowed', fontWeight: '600' }}
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}

      {/* Detail Modal */}
      {showDetailModal && selectedReturn && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }} onClick={() => setShowDetailModal(false)}>
          <div style={{ backgroundColor: 'var(--card-bg)', borderRadius: '16px', padding: '32px', width: '100%', maxWidth: '700px', maxHeight: '90vh', overflow: 'auto', border: '1px solid var(--border-color)' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <div>
                <h2 style={{ fontSize: '24px', fontWeight: '700', color: 'var(--text-primary)' }}>
                  Return {selectedReturn.returnNumber}
                </h2>
                <p style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
                  Order: {selectedReturn.order?.orderId} • Created: {new Date(selectedReturn.createdAt).toLocaleString()}
                </p>
              </div>
              <button onClick={() => setShowDetailModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '8px' }}>
                <XCircle size={24} />
              </button>
            </div>

            {/* Customer Info */}
            <div style={{ padding: '16px', backgroundColor: 'var(--bg-primary)', borderRadius: '10px', marginBottom: '20px', border: '1px solid var(--border-color)' }}>
              <h4 style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '8px' }}>Customer</h4>
              <div style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
                <div><strong>{selectedReturn.customer?.fullName}</strong></div>
                <div>{selectedReturn.customer?.email}</div>
                <div>{selectedReturn.customer?.phone}</div>
              </div>
            </div>

            {/* Items */}
            <h4 style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '12px' }}>Returned Items</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
              {selectedReturn.items.map((item, index) => (
                <div key={index} style={{ padding: '16px', backgroundColor: 'var(--bg-primary)', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                    <div>
                      <div style={{ fontWeight: '700', color: 'var(--text-primary)' }}>{item.name}</div>
                      <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Qty: {item.quantity} × Rs. {item.price}</div>
                    </div>
                    <div style={{ fontWeight: '700', color: 'var(--primary)' }}>Rs. {(item.quantity * item.price).toLocaleString()}</div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '8px' }}>
                    <span style={{ padding: '4px 10px', backgroundColor: '#FEF3C7', color: '#92400E', borderRadius: '20px', fontSize: '11px', fontWeight: '600' }}>
                      Reason: {getReasonLabel(item.reason)}
                    </span>
                    <span style={{ padding: '4px 10px', backgroundColor: '#DBEAFE', color: '#1E40AF', borderRadius: '20px', fontSize: '11px', fontWeight: '600' }}>
                      Condition: {item.condition}
                    </span>
                  </div>
                  {item.reasonDetails && (
                    <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '8px', fontStyle: 'italic' }}>
                      "{item.reasonDetails}"
                    </p>
                  )}
                </div>
              ))}
            </div>

            {/* Summary */}
            <div style={{ padding: '16px', backgroundColor: '#EFF6FF', borderRadius: '10px', border: '1px solid #3B82F6', marginBottom: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Refund Method:</span>
                <span style={{ fontWeight: '600', color: 'var(--text-primary)', textTransform: 'capitalize' }}>{selectedReturn.refundMethod.replace('_', ' ')}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '18px', fontWeight: '800' }}>
                <span style={{ color: 'var(--text-primary)' }}>Total Refund:</span>
                <span style={{ color: 'var(--primary)' }}>Rs. {selectedReturn.refundAmount?.toLocaleString()}</span>
              </div>
            </div>

            {/* Customer Notes */}
            {selectedReturn.customerNotes && (
              <div style={{ padding: '16px', backgroundColor: 'var(--bg-primary)', borderRadius: '10px', marginBottom: '20px', border: '1px solid var(--border-color)' }}>
                <h4 style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <MessageSquare size={16} />
                  Customer Notes
                </h4>
                <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: 0 }}>{selectedReturn.customerNotes}</p>
              </div>
            )}

            {/* Admin Notes */}
            {selectedReturn.adminNotes && selectedReturn.adminNotes.length > 0 && (
              <div style={{ padding: '16px', backgroundColor: 'var(--bg-primary)', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                <h4 style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '12px' }}>Admin Notes</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {selectedReturn.adminNotes.map((note, index) => (
                    <div key={index} style={{ padding: '12px', backgroundColor: 'white', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                      <div style={{ fontSize: '13px', color: 'var(--text-primary)', marginBottom: '4px' }}>{note.note}</div>
                      <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                        by {note.addedBy?.fullName || 'Admin'} • {new Date(note.addedAt).toLocaleString()}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Status Update Modal */}
      {showStatusModal && selectedReturn && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }} onClick={() => setShowStatusModal(false)}>
          <div style={{ backgroundColor: 'var(--card-bg)', borderRadius: '16px', padding: '32px', width: '100%', maxWidth: '500px', border: '1px solid var(--border-color)' }} onClick={e => e.stopPropagation()}>
            <h2 style={{ fontSize: '24px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '8px' }}>
              Update Return Status
            </h2>
            <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '24px' }}>
              Return: {selectedReturn.returnNumber}
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' }}>New Status *</label>
                <select
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value)}
                  style={inputStyle}
                >
                  <option value="">Select status</option>
                  <option value="approved">Approve Return</option>
                  <option value="received">Mark as Received</option>
                  <option value="inspected">Mark as Inspected</option>
                  <option value="refunded">Process Refund</option>
                  <option value="rejected">Reject Return</option>
                  <option value="cancelled">Cancel Return</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' }}>Admin Note (Optional)</label>
                <textarea
                  value={adminNote}
                  onChange={(e) => setAdminNote(e.target.value)}
                  placeholder="Add a note about this status change..."
                  rows={3}
                  style={{ ...inputStyle, resize: 'vertical' }}
                />
              </div>

              {newStatus === 'rejected' && (
                <div style={{ padding: '12px', backgroundColor: '#FEE2E2', border: '1px solid #EF4444', borderRadius: '8px', fontSize: '13px', color: '#991B1B' }}>
                  <AlertCircle size={16} style={{ display: 'inline', marginRight: '8px' }} />
                  Please provide a reason for rejection in the admin note.
                </div>
              )}

              <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                <button onClick={() => setShowStatusModal(false)} style={{ flex: 1, padding: '14px', backgroundColor: 'var(--card-bg)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '10px', cursor: 'pointer', fontWeight: '600' }}>
                  Cancel
                </button>
                <button
                  onClick={handleStatusUpdate}
                  disabled={!newStatus || actionLoading}
                  style={{ flex: 1, padding: '14px', backgroundColor: !newStatus || actionLoading ? '#9CA3AF' : 'var(--primary)', color: 'white', border: 'none', borderRadius: '10px', cursor: !newStatus || actionLoading ? 'not-allowed' : 'pointer', fontWeight: '600', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                >
                  {actionLoading ? <Loader size={20} style={{ animation: 'spin 1s linear infinite' }} /> : <CheckCircle size={20} />}
                  {actionLoading ? 'Updating...' : 'Update Status'}
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
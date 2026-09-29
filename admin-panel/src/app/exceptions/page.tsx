'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle,
  Download,
  Eye,
  Loader2,
  RefreshCw,
  Search,
  ShieldAlert,
  X
} from 'lucide-react';
import api from '@/lib/api';

interface ExceptionItem {
  _id: string;
  exceptionNumber: string;
  type: string;
  domainType: string;
  domainId: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  status: 'OPEN' | 'ACKNOWLEDGED' | 'IN_PROGRESS' | 'RETRY_SCHEDULED' | 'ESCALATED' | 'RESOLVED' | 'DISMISSED_AS_DUPLICATE';
  errorCode?: string;
  sanitizedSummary: string;
  safeDetails?: Record<string, unknown>;
  retryEligible?: boolean;
  attemptCount?: number;
  slaDueAt?: string;
  createdAt: string;
  customer?: { fullName?: string; email?: string };
  order?: { orderId?: string; totalAmount?: number; paymentMethod?: string };
  assignedTo?: { fullName?: string; email?: string };
}

interface Metrics {
  openCount: number;
  acknowledgedCount: number;
  inProgressCount: number;
  criticalCount: number;
  escalatedCount: number;
  totalOpen: number;
}

const formatDate = (val?: string | Date | null) => {
  if (!val) return '—';
  const d = new Date(val);
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' });
};

const formatTime = (val?: string | Date | null) => {
  if (!val) return '—';
  const d = new Date(val);
  return isNaN(d.getTime()) ? '—' : d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
};

export default function ExceptionsPage() {
  const [exceptions, setExceptions] = useState<ExceptionItem[]>([]);
  const [metrics, setMetrics] = useState<Metrics>({
    openCount: 0,
    acknowledgedCount: 0,
    inProgressCount: 0,
    criticalCount: 0,
    escalatedCount: 0,
    totalOpen: 0
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [severityFilter, setSeverityFilter] = useState('');

  // Selected for Details / Modal
  const [selectedException, setSelectedException] = useState<ExceptionItem | null>(null);
  const [resolving, setResolving] = useState(false);
  const [resolutionReason, setResolutionReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const mountedRef = useRef(false);

  const fetchExceptions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string> = {};
      if (search.trim()) params.search = search.trim();
      if (statusFilter) params.status = statusFilter;
      if (typeFilter) params.type = typeFilter;
      if (severityFilter) params.severity = severityFilter;

      const response = await api.get('/admin/exceptions', { params });
      if (response.data.success) {
        setExceptions(response.data.data || []);
        if (response.data.metrics) setMetrics(response.data.metrics);
      }
    } catch {
      setError('Failed to load operations exception queue.');
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, typeFilter, severityFilter]);

  useEffect(() => {
    mountedRef.current = true;
    void (async () => {
      await fetchExceptions();
    })();
    return () => {
      mountedRef.current = false;
    };
  }, [fetchExceptions]);

  const handleAcknowledge = async (id: string) => {
    setActionLoading(true);
    try {
      await api.post(`/admin/exceptions/${id}/acknowledge`);
      await fetchExceptions();
      if (selectedException?._id === id) {
        setSelectedException((prev) => prev ? { ...prev, status: 'ACKNOWLEDGED' } : null);
      }
    } catch {
      alert('Failed to acknowledge exception.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleEscalate = async (id: string) => {
    setActionLoading(true);
    try {
      await api.post(`/admin/exceptions/${id}/escalate`, {
        escalatedTo: 'Operations Lead',
        reason: 'Escalated from admin dashboard'
      });
      await fetchExceptions();
      if (selectedException?._id === id) {
        setSelectedException((prev) => prev ? { ...prev, status: 'ESCALATED', severity: 'CRITICAL' } : null);
      }
    } catch {
      alert('Failed to escalate exception.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRetry = async (id: string) => {
    setActionLoading(true);
    try {
      await api.post(`/admin/exceptions/${id}/retry`);
      await fetchExceptions();
      alert('Retry triggered successfully.');
    } catch {
      alert('Failed to trigger retry for exception.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleResolve = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedException || !resolutionReason.trim()) return;
    setActionLoading(true);
    try {
      await api.post(`/admin/exceptions/${selectedException._id}/resolve`, {
        resolutionReason: resolutionReason.trim(),
        resolutionCode: 'RESOLVED_MANUAL'
      });
      setResolving(false);
      setResolutionReason('');
      setSelectedException(null);
      await fetchExceptions();
    } catch {
      alert('Failed to resolve exception.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleExportCsv = () => {
    const params = new URLSearchParams();
    if (statusFilter) params.set('status', statusFilter);
    if (typeFilter) params.set('type', typeFilter);
    if (severityFilter) params.set('severity', severityFilter);
    window.open(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'}/api/admin/exceptions/export?${params.toString()}`, '_blank');
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2">
            <ShieldAlert className="text-rose-600" /> Customer & Operations Exceptions
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Authoritative exception queues for failed payments, webhooks, shipping anomalies, and refunds.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={fetchExceptions}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 border border-slate-300 rounded-xl text-xs font-bold bg-white text-slate-700 hover:bg-slate-50 transition"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
          <button
            type="button"
            onClick={handleExportCsv}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#0f172a] text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition"
          >
            <Download size={14} /> Export CSV
          </button>
        </div>
      </div>

      {/* 5-Column Responsive Metric KPI Cards Grid */}
      <div
        className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 my-6"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '16px',
          margin: '24px 0'
        }}
      >
        <div
          className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs border-l-4 border-l-slate-800"
          style={{
            backgroundColor: '#ffffff',
            borderRadius: '16px',
            border: '1px solid #e2e8f0',
            borderLeft: '4px solid #1e293b',
            padding: '16px',
            boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
          }}
        >
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block" style={{ fontSize: '11px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Open</span>
          <p className="text-2xl font-bold text-slate-900 mt-2" style={{ fontSize: '24px', fontWeight: '800', color: '#0f172a', margin: '8px 0 4px' }}>{metrics.totalOpen}</p>
          <p className="text-xs text-slate-500 mt-1" style={{ fontSize: '12px', color: '#64748b', margin: 0 }}>Active anomaly queue</p>
        </div>

        <div
          className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs border-l-4 border-l-blue-500"
          style={{
            backgroundColor: '#ffffff',
            borderRadius: '16px',
            border: '1px solid #e2e8f0',
            borderLeft: '4px solid #3b82f6',
            padding: '16px',
            boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
          }}
        >
          <span className="text-xs font-semibold text-blue-700 uppercase tracking-wider block" style={{ fontSize: '11px', fontWeight: '600', color: '#1d4ed8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Open</span>
          <p className="text-2xl font-bold text-blue-950 mt-2" style={{ fontSize: '24px', fontWeight: '800', color: '#172554', margin: '8px 0 4px' }}>{metrics.openCount}</p>
          <p className="text-xs text-slate-500 mt-1" style={{ fontSize: '12px', color: '#64748b', margin: 0 }}>Requires triage</p>
        </div>

        <div
          className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs border-l-4 border-l-purple-500"
          style={{
            backgroundColor: '#ffffff',
            borderRadius: '16px',
            border: '1px solid #e2e8f0',
            borderLeft: '4px solid #a855f7',
            padding: '16px',
            boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
          }}
        >
          <span className="text-xs font-semibold text-purple-700 uppercase tracking-wider block" style={{ fontSize: '11px', fontWeight: '600', color: '#7e22ce', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Acknowledged</span>
          <p className="text-2xl font-bold text-purple-950 mt-2" style={{ fontSize: '24px', fontWeight: '800', color: '#3b0764', margin: '8px 0 4px' }}>{metrics.acknowledgedCount}</p>
          <p className="text-xs text-slate-500 mt-1" style={{ fontSize: '12px', color: '#64748b', margin: 0 }}>Owner assigned</p>
        </div>

        <div
          className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs border-l-4 border-l-amber-500"
          style={{
            backgroundColor: '#ffffff',
            borderRadius: '16px',
            border: '1px solid #e2e8f0',
            borderLeft: '4px solid #f59e0b',
            padding: '16px',
            boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
          }}
        >
          <span className="text-xs font-semibold text-amber-700 uppercase tracking-wider block" style={{ fontSize: '11px', fontWeight: '600', color: '#b45309', textTransform: 'uppercase', letterSpacing: '0.05em' }}>In Progress</span>
          <p className="text-2xl font-bold text-amber-950 mt-2" style={{ fontSize: '24px', fontWeight: '800', color: '#451a03', margin: '8px 0 4px' }}>{metrics.inProgressCount}</p>
          <p className="text-xs text-slate-500 mt-1" style={{ fontSize: '12px', color: '#64748b', margin: 0 }}>Remediation underway</p>
        </div>

        <div
          className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs border-l-4 border-l-red-500 col-span-2 sm:col-span-1"
          style={{
            backgroundColor: '#ffffff',
            borderRadius: '16px',
            border: '1px solid #e2e8f0',
            borderLeft: '4px solid #ef4444',
            padding: '16px',
            boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
          }}
        >
          <span className="text-xs font-semibold text-rose-700 uppercase tracking-wider flex items-center gap-1" style={{ fontSize: '11px', fontWeight: '600', color: '#be123c', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <AlertTriangle size={13} className="text-red-500" /> Critical / Escalated
          </span>
          <p className="text-2xl font-bold text-rose-700 mt-2" style={{ fontSize: '24px', fontWeight: '800', color: '#be123c', margin: '8px 0 4px' }}>{metrics.criticalCount + metrics.escalatedCount}</p>
          <p className="text-xs text-slate-500 mt-1" style={{ fontSize: '12px', color: '#64748b', margin: 0 }}>Breached or near SLA</p>
        </div>
      </div>

      {/* Filter Bar */}
      <div
        className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-4"
        style={{
          backgroundColor: '#ffffff',
          padding: '16px',
          borderRadius: '16px',
          border: '1px solid #e2e8f0',
          boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '16px'
        }}
      >
        <div
          className="flex flex-1 min-w-[240px] items-center gap-2 border border-slate-300 rounded-xl px-3 py-2 bg-white"
          style={{
            display: 'flex',
            flex: '1',
            minWidth: '240px',
            alignItems: 'center',
            gap: '8px',
            border: '1px solid #cbd5e1',
            borderRadius: '12px',
            padding: '8px 12px',
            backgroundColor: '#ffffff'
          }}
        >
          <Search size={15} className="text-slate-400" />
          <input
            type="text"
            placeholder="Search by exception #, summary, or error code..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-transparent text-xs font-medium focus:outline-hidden text-slate-800 placeholder-slate-400"
            style={{ width: '100%', background: 'transparent', fontSize: '12px', border: 'none', outline: 'none', color: '#1e293b' }}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' }}>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-xs font-semibold border border-slate-300 rounded-xl px-3 py-2 bg-white text-slate-700 outline-none"
            style={{ fontSize: '12px', fontWeight: '600', border: '1px solid #cbd5e1', borderRadius: '12px', padding: '8px 12px', backgroundColor: '#ffffff', color: '#334155', outline: 'none' }}
          >
            <option value="">All Statuses</option>
            <option value="OPEN">Open</option>
            <option value="ACKNOWLEDGED">Acknowledged</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="ESCALATED">Escalated</option>
            <option value="RESOLVED">Resolved</option>
          </select>

          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="text-xs font-semibold border border-slate-300 rounded-xl px-3 py-2 bg-white text-slate-700 outline-none"
            style={{ fontSize: '12px', fontWeight: '600', border: '1px solid #cbd5e1', borderRadius: '12px', padding: '8px 12px', backgroundColor: '#ffffff', color: '#334155', outline: 'none' }}
          >
            <option value="">All Types</option>
            <option value="PAYMENT_FAILED">Payment Failed</option>
            <option value="WEBHOOK_DEAD_LETTERED">Webhook Dead Lettered</option>
            <option value="SHIPMENT_DELAYED">Shipment Delayed</option>
            <option value="REFUND_FAILED">Refund Failed</option>
            <option value="NOTIFICATION_DELIVERY_FAILED">Notification Failed</option>
          </select>

          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            className="text-xs font-semibold border border-slate-300 rounded-xl px-3 py-2 bg-white text-slate-700 outline-none"
            style={{ fontSize: '12px', fontWeight: '600', border: '1px solid #cbd5e1', borderRadius: '12px', padding: '8px 12px', backgroundColor: '#ffffff', color: '#334155', outline: 'none' }}
          >
            <option value="">All Severities</option>
            <option value="CRITICAL">Critical</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </select>
        </div>
      </div>

      {/* Main Content Table */}
      <div
        className="rounded-2xl border border-slate-200/80 overflow-hidden bg-white shadow-xs mt-4"
        style={{
          borderRadius: '16px',
          border: '1px solid rgba(226, 232, 240, 0.8)',
          overflow: 'hidden',
          backgroundColor: '#ffffff',
          boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
          marginTop: '16px'
        }}
      >
        {loading ? (
          <div className="p-12 text-center text-slate-500 flex flex-col items-center" style={{ padding: '48px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <Loader2 className="animate-spin mb-2 text-[#0f172a]" />
            <p className="text-xs font-semibold">Loading exceptions...</p>
          </div>
        ) : error ? (
          <div className="p-8 text-center text-rose-600" style={{ padding: '32px', textAlign: 'center', color: '#e11d48' }}>
            <AlertTriangle className="mx-auto mb-2" size={24} />
            <p className="text-xs font-bold">{error}</p>
          </div>
        ) : exceptions.length === 0 ? (
          <div className="p-12 text-center text-slate-400" style={{ padding: '48px', textAlign: 'center' }}>
            <CheckCircle className="mx-auto mb-2 text-emerald-500" size={28} />
            <p className="text-sm font-bold text-slate-700">No active exceptions matching criteria.</p>
            <p className="text-xs text-slate-400 mt-1">All queues operating within normal boundaries.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12px' }}>
              <thead
                className="bg-slate-50 border-b border-slate-200 text-slate-600 text-xs font-semibold uppercase tracking-wider py-3.5 px-4"
                style={{
                  backgroundColor: '#f8fafc',
                  borderBottom: '1px solid #e2e8f0',
                  color: '#475569',
                  fontSize: '11px',
                  fontWeight: '600',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em'
                }}
              >
                <tr>
                  <th className="py-3.5 px-4" style={{ padding: '14px 16px' }}>Exception #</th>
                  <th className="py-3.5 px-4" style={{ padding: '14px 16px' }}>Type & Domain</th>
                  <th className="py-3.5 px-4" style={{ padding: '14px 16px' }}>Severity</th>
                  <th className="py-3.5 px-4" style={{ padding: '14px 16px' }}>Status</th>
                  <th className="py-3.5 px-4" style={{ padding: '14px 16px' }}>Summary</th>
                  <th className="py-3.5 px-4" style={{ padding: '14px 16px' }}>Created / SLA</th>
                  <th className="py-3.5 px-4 text-right" style={{ padding: '14px 16px', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {exceptions.map((ex) => (
                  <tr key={ex._id} className="hover:bg-slate-50/80 transition" style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td className="py-3.5 px-4 font-mono font-bold text-slate-900" style={{ padding: '14px 16px', fontFamily: 'monospace', fontWeight: '700', color: '#0f172a' }}>{ex.exceptionNumber}</td>
                    <td className="py-3.5 px-4" style={{ padding: '14px 16px' }}>
                      <div className="font-bold text-slate-800" style={{ fontWeight: '700', color: '#1e293b' }}>{ex.type}</div>
                      <div className="text-[11px] text-slate-500 uppercase" style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase' }}>{ex.domainType} #{ex.domainId}</div>
                    </td>
                    <td className="py-3.5 px-4" style={{ padding: '14px 16px' }}>
                      <span
                        className={`font-semibold px-2.5 py-0.5 rounded-full text-[11px] ${
                          ex.severity === 'CRITICAL' || ex.severity === 'HIGH'
                            ? 'bg-red-50 text-red-700 border border-red-200'
                            : ex.severity === 'MEDIUM'
                            ? 'bg-amber-50 text-amber-700 border border-amber-200'
                            : 'bg-blue-50 text-blue-700 border border-blue-200'
                        }`}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          padding: '2px 10px',
                          borderRadius: '9999px',
                          fontSize: '11px',
                          fontWeight: '600',
                          backgroundColor:
                            ex.severity === 'CRITICAL' || ex.severity === 'HIGH'
                              ? '#fef2f2'
                              : ex.severity === 'MEDIUM'
                              ? '#fffbeb'
                              : '#eff6ff',
                          color:
                            ex.severity === 'CRITICAL' || ex.severity === 'HIGH'
                              ? '#b91c1c'
                              : ex.severity === 'MEDIUM'
                              ? '#b45309'
                              : '#1d4ed8',
                          border: `1px solid ${
                            ex.severity === 'CRITICAL' || ex.severity === 'HIGH'
                              ? '#fecaca'
                              : ex.severity === 'MEDIUM'
                              ? '#fde68a'
                              : '#bfdbfe'
                          }`
                        }}
                      >
                        {ex.severity}
                      </span>
                    </td>
                    <td className="py-3.5 px-4" style={{ padding: '14px 16px' }}>
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full font-semibold text-[11px] border ${
                          ex.status === 'OPEN'
                            ? 'bg-amber-50 text-amber-700 border-amber-200'
                            : ex.status === 'ACKNOWLEDGED'
                            ? 'bg-blue-50 text-blue-700 border-blue-200'
                            : ex.status === 'IN_PROGRESS'
                            ? 'bg-purple-50 text-purple-700 border-purple-200'
                            : ex.status === 'ESCALATED'
                            ? 'bg-red-50 text-red-700 border-red-200'
                            : ex.status === 'RESOLVED'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-slate-100 text-slate-700 border-slate-200'
                        }`}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          padding: '2px 10px',
                          borderRadius: '9999px',
                          fontSize: '11px',
                          fontWeight: '600'
                        }}
                      >
                        {ex.status}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 max-w-xs truncate text-slate-700 font-medium" title={ex.sanitizedSummary} style={{ padding: '14px 16px', color: '#334155' }}>
                      {ex.sanitizedSummary}
                    </td>
                    <td className="py-3.5 px-4 text-xs text-slate-500" style={{ padding: '14px 16px', color: '#64748b' }}>
                      <div className="font-medium text-slate-700" style={{ fontWeight: '500', color: '#334155' }}>{formatDate(ex.createdAt)}</div>
                      {ex.slaDueAt && (
                        <div className="text-[11px] text-slate-400 mt-0.5" style={{ fontSize: '11px', color: '#94a3b8' }}>
                          Due: {formatTime(ex.slaDueAt)}
                        </div>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right" style={{ padding: '14px 16px', textAlign: 'right' }}>
                      <button
                        type="button"
                        onClick={() => setSelectedException(ex)}
                        className="px-3 py-1 text-xs font-semibold rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 transition"
                        style={{
                          padding: '4px 12px',
                          fontSize: '12px',
                          fontWeight: '600',
                          borderRadius: '8px',
                          border: '1px solid #e2e8f0',
                          backgroundColor: '#ffffff',
                          color: '#334155',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px'
                        }}
                      >
                        <Eye size={13} /> View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Exception Detail Drawer / Modal */}
      {selectedException && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <span className="text-xs font-mono font-bold text-slate-400">{selectedException.exceptionNumber}</span>
                <h2 className="text-lg font-black text-slate-900 mt-0.5">{selectedException.type}</h2>
              </div>
              <button
                type="button"
                onClick={() => setSelectedException(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
              >
                <X size={18} />
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-xs">
              <div className="bg-slate-50 p-3 rounded-xl">
                <span className="text-slate-400 font-bold block mb-1">Status</span>
                <span className="font-extrabold text-slate-900">{selectedException.status}</span>
              </div>
              <div className="bg-slate-50 p-3 rounded-xl">
                <span className="text-slate-400 font-bold block mb-1">Severity</span>
                <span className="font-extrabold text-slate-900">{selectedException.severity}</span>
              </div>
              <div className="bg-slate-50 p-3 rounded-xl">
                <span className="text-slate-400 font-bold block mb-1">Domain Ref</span>
                <span className="font-mono font-extrabold text-slate-900">{selectedException.domainType} #{selectedException.domainId}</span>
              </div>
            </div>

            <div>
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Summary</h3>
              <p className="text-xs text-slate-800 bg-slate-50 p-3 rounded-xl leading-relaxed">
                {selectedException.sanitizedSummary}
              </p>
            </div>

            {selectedException.errorCode && (
              <div>
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Error Code</h3>
                <code className="text-xs font-mono bg-rose-50 text-rose-900 px-2.5 py-1 rounded-md border border-rose-200 inline-block">
                  {selectedException.errorCode}
                </code>
              </div>
            )}

            {/* Actions Bar */}
            <div className="border-t border-slate-100 pt-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                {selectedException.status === 'OPEN' && (
                  <button
                    type="button"
                    onClick={() => handleAcknowledge(selectedException._id)}
                    disabled={actionLoading}
                    className="px-3.5 py-2 bg-blue-50 text-blue-800 font-bold text-xs rounded-xl hover:bg-blue-100 transition"
                  >
                    Acknowledge
                  </button>
                )}

                {selectedException.status !== 'ESCALATED' && selectedException.status !== 'RESOLVED' && (
                  <button
                    type="button"
                    onClick={() => handleEscalate(selectedException._id)}
                    disabled={actionLoading}
                    className="px-3.5 py-2 bg-amber-50 text-amber-900 font-bold text-xs rounded-xl hover:bg-amber-100 transition"
                  >
                    Escalate
                  </button>
                )}

                {selectedException.retryEligible && selectedException.status !== 'RESOLVED' && (
                  <button
                    type="button"
                    onClick={() => handleRetry(selectedException._id)}
                    disabled={actionLoading}
                    className="px-3.5 py-2 bg-purple-50 text-purple-900 font-bold text-xs rounded-xl hover:bg-purple-100 transition"
                  >
                    Trigger Retry
                  </button>
                )}
              </div>

              {selectedException.status !== 'RESOLVED' && (
                <div>
                  {resolving ? (
                    <form onSubmit={handleResolve} className="flex items-center gap-2">
                      <input
                        type="text"
                        placeholder="Resolution reason..."
                        value={resolutionReason}
                        onChange={(e) => setResolutionReason(e.target.value)}
                        className="text-xs border border-slate-300 rounded-lg px-2.5 py-1.5 w-48"
                        required
                      />
                      <button
                        type="submit"
                        disabled={actionLoading}
                        className="px-3 py-1.5 bg-emerald-600 text-white font-bold text-xs rounded-lg hover:bg-emerald-700 transition"
                      >
                        Confirm
                      </button>
                      <button
                        type="button"
                        onClick={() => setResolving(false)}
                        className="p-1.5 text-slate-400 hover:text-slate-600"
                      >
                        <X size={14} />
                      </button>
                    </form>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setResolving(true)}
                      className="px-4 py-2 bg-emerald-600 text-white font-bold text-xs rounded-xl hover:bg-emerald-700 transition"
                    >
                      Resolve Exception
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { 
  History, Search, Calendar, Monitor, AlertCircle, Loader, 
  Download, Trash2, ChevronLeft, ChevronRight, CheckCircle, 
  XCircle, Activity, User
} from 'lucide-react';
import api from '@/lib/api';

interface ActivityLog {
  _id: string;
  user: {
    _id: string;
    fullName: string;
    email: string;
    role: string;
  } | null;
  action: string;
  description: string;
  details: any;
  ipAddress: string;
  userAgent: string;
  browser: string;
  os: string;
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

export default function ActivityLogsPage() {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [pagination, setPagination] = useState<PaginationInfo | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [stats, setStats] = useState<any>(null);
  const [cleaning, setCleaning] = useState(false);

  useEffect(() => {
    fetchLogs();
    fetchStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, search, actionFilter, dateFrom, dateTo]);

  const fetchLogs = async () => {
    try {
      setLoading(true);
      const params: any = { page: currentPage, limit: 20 };
      if (search) params.search = search;
      if (actionFilter) params.action = actionFilter;
      if (dateFrom) params.startDate = dateFrom;
      if (dateTo) params.endDate = dateTo;

      const response = await api.get('/activity-logs', { params });
      if (response.data.success) {
        setLogs(response.data.data);
        setPagination(response.data.pagination);
      }
    } catch (error) {
      console.error('Error fetching logs:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await api.get('/activity-logs/stats');
      if (response.data.success) {
        setStats(response.data.data);
      }
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  const handleCleanup = async () => {
    if (!confirm('Are you sure you want to delete logs older than 90 days? This action cannot be undone.')) return;

    setCleaning(true);
    try {
      const response = await api.delete('/activity-logs/cleanup', { data: { days: 90 } });
      if (response.data.success) {
        alert(`Successfully deleted ${response.data.data.deletedCount} old logs.`);
        await fetchLogs();
        await fetchStats();
      }
    } catch (error) {
      console.error('Error cleaning up logs:', error);
      alert('Failed to cleanup logs.');
    } finally {
      setCleaning(false);
    }
  };

  const handleExport = async () => {
    try {
      const params: any = { limit: 10000 }; // Export up to 10k records
      if (search) params.search = search;
      if (actionFilter) params.action = actionFilter;
      
      const response = await api.get('/activity-logs/export', { params, responseType: 'blob' });
      const blob = new Blob([response.data], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `activity-logs-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error exporting logs:', error);
      alert('Failed to export logs.');
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('en-PK', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getActionColor = (action: string) => {
    if (action.includes('CREATE') || action.includes('APPROVE')) return { bg: '#D1FAE5', color: '#0F766E', icon: CheckCircle };
    if (action.includes('UPDATE')) return { bg: '#DBEAFE', color: '#1E40AF', icon: Activity };
    if (action.includes('DELETE') || action.includes('REJECT')) return { bg: '#FEE2E2', color: '#DC2626', icon: XCircle };
    if (action.includes('LOGIN') || action.includes('LOGOUT')) return { bg: '#FEF3C7', color: '#92400E', icon: User };
    return { bg: '#F3F4F6', color: '#6B7280', icon: History };
  };

  const getActionIcon = (action: string) => {
    if (action.includes('LOGIN')) return '🔐';
    if (action.includes('LOGOUT')) return '🚪';
    if (action.includes('PRODUCT')) return '📦';
    if (action.includes('ORDER')) return '🛒';
    if (action.includes('CUSTOMER')) return '👤';
    if (action.includes('CATEGORY')) return '📂';
    if (action.includes('BRAND')) return '🏷️';
    if (action.includes('REVIEW')) return '⭐';
    if (action.includes('COUPON')) return '🎟️';
    if (action.includes('SETTINGS')) return '⚙️';
    return '📝';
  };

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '32px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <h1 style={{ fontSize: '32px', fontWeight: '800', color: 'var(--text-primary)', marginBottom: '8px', letterSpacing: '-0.5px' }}>
              Activity Logs
            </h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '15px' }}>
              Track all admin actions, system events, and security activities.
            </p>
          </div>
          
          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              onClick={handleExport}
              style={{
                backgroundColor: 'var(--card-bg)',
                color: 'var(--text-primary)',
                padding: '12px 20px',
                borderRadius: '10px',
                border: '1px solid var(--border-color)',
                cursor: 'pointer',
                fontWeight: '600',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '14px',
                transition: 'all 0.2s'
              }}
              onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--hover-bg)'}
              onMouseLeave={e => e.currentTarget.style.backgroundColor = 'var(--card-bg)'}
            >
              <Download size={18} /> Export CSV
            </button>
            <button
              onClick={handleCleanup}
              disabled={cleaning}
              style={{
                backgroundColor: cleaning ? '#9CA3AF' : '#EF4444',
                color: 'white',
                padding: '12px 20px',
                borderRadius: '10px',
                border: 'none',
                cursor: cleaning ? 'not-allowed' : 'pointer',
                fontWeight: '600',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '14px',
                transition: 'all 0.2s'
              }}
            >
              {cleaning ? <Loader size={18} className="animate-spin" /> : <Trash2 size={18} />}
              Cleanup Old Logs
            </button>
          </div>
        </div>

        {/* Stats Cards */}
        {stats && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginTop: '24px' }}>
            <div style={{ backgroundColor: 'var(--card-bg)', padding: '20px', borderRadius: '12px', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{ width: '48px', height: '48px', borderRadius: '10px', backgroundColor: '#DBEAFE', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <History size={24} color="#3B82F6" />
              </div>
              <div>
                <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Total Logs</div>
                <div style={{ fontSize: '24px', fontWeight: '800', color: 'var(--text-primary)' }}>{stats.totalLogs || 0}</div>
              </div>
            </div>

            <div style={{ backgroundColor: 'var(--card-bg)', padding: '20px', borderRadius: '12px', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{ width: '48px', height: '48px', borderRadius: '10px', backgroundColor: '#D1FAE5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Calendar size={24} color="#10B981" />
              </div>
              <div>
                <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Today</div>
                <div style={{ fontSize: '24px', fontWeight: '800', color: 'var(--text-primary)' }}>{stats.todayLogs || 0}</div>
              </div>
            </div>

            <div style={{ backgroundColor: 'var(--card-bg)', padding: '20px', borderRadius: '12px', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{ width: '48px', height: '48px', borderRadius: '10px', backgroundColor: '#FEF3C7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Calendar size={24} color="#F59E0B" />
              </div>
              <div>
                <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '4px' }}>This Week</div>
                <div style={{ fontSize: '24px', fontWeight: '800', color: 'var(--text-primary)' }}>{stats.weekLogs || 0}</div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Filters */}
      <div style={{ backgroundColor: 'var(--card-bg)', padding: '20px', borderRadius: '12px', border: '1px solid var(--border-color)', marginBottom: '24px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', alignItems: 'end' }}>
          <div style={{ position: 'relative' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '6px', textTransform: 'uppercase' }}>Search</label>
            <Search size={16} style={{ position: 'absolute', left: '14px', top: '38px', color: 'var(--text-secondary)' }} />
            <input
              type="text"
              placeholder="Search activities..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
              style={{ width: '100%', padding: '10px 14px 10px 40px', border: '1px solid var(--border-color)', borderRadius: '8px', fontSize: '14px', outline: 'none', backgroundColor: 'var(--input-bg)', color: 'var(--text-primary)' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '6px', textTransform: 'uppercase' }}>Action Type</label>
            <select
              value={actionFilter}
              onChange={(e) => { setActionFilter(e.target.value); setCurrentPage(1); }}
              style={{ width: '100%', padding: '10px 14px', border: '1px solid var(--border-color)', borderRadius: '8px', fontSize: '14px', backgroundColor: 'var(--input-bg)', color: 'var(--text-primary)', cursor: 'pointer', outline: 'none' }}
            >
              <option value="">All Actions</option>
              <option value="LOGIN">Login</option>
              <option value="LOGOUT">Logout</option>
              <option value="PRODUCT_CREATE">Product Created</option>
              <option value="PRODUCT_UPDATE">Product Updated</option>
              <option value="PRODUCT_DELETE">Product Deleted</option>
              <option value="ORDER_STATUS_UPDATE">Order Status Updated</option>
              <option value="CUSTOMER_BLOCK">Customer Blocked</option>
              <option value="SETTINGS_UPDATE">Settings Updated</option>
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '6px', textTransform: 'uppercase' }}>From Date</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => { setDateFrom(e.target.value); setCurrentPage(1); }}
              style={{ width: '100%', padding: '10px 14px', border: '1px solid var(--border-color)', borderRadius: '8px', fontSize: '14px', backgroundColor: 'var(--input-bg)', color: 'var(--text-primary)', outline: 'none' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '6px', textTransform: 'uppercase' }}>To Date</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => { setDateTo(e.target.value); setCurrentPage(1); }}
              style={{ width: '100%', padding: '10px 14px', border: '1px solid var(--border-color)', borderRadius: '8px', fontSize: '14px', backgroundColor: 'var(--input-bg)', color: 'var(--text-primary)', outline: 'none' }}
            />
          </div>
          
          <div>
             <button
              onClick={() => { setSearch(''); setActionFilter(''); setDateFrom(''); setDateTo(''); setCurrentPage(1); }}
              style={{ width: '100%', padding: '10px 14px', backgroundColor: 'var(--bg-primary)', color: 'var(--text-secondary)', border: '1px solid var(--border-color)', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}
            >
              Clear Filters
            </button>
          </div>
        </div>
      </div>

      {/* Logs Table */}
      {loading ? (
        <div style={{ backgroundColor: 'var(--card-bg)', padding: '60px', borderRadius: '12px', border: '1px solid var(--border-color)', textAlign: 'center' }}>
          <Loader size={40} className="animate-spin text-teal-700" style={{ animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />
          <p style={{ color: 'var(--text-secondary)' }}>Loading activity logs...</p>
        </div>
      ) : logs.length === 0 ? (
        <div style={{ backgroundColor: 'var(--card-bg)', padding: '80px 60px', borderRadius: '12px', border: '1px solid var(--border-color)', borderStyle: 'dashed', textAlign: 'center' }}>
          <History size={64} style={{ margin: '0 auto 16px', opacity: 0.3 }} color="var(--text-secondary)" />
          <p style={{ fontSize: '18px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' }}>No activity logs found</p>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>Try adjusting your filters or date range.</p>
        </div>
      ) : (
        <div style={{ backgroundColor: 'var(--card-bg)', borderRadius: '12px', border: '1px solid var(--border-color)', overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '1000px' }}>
              <thead style={{ backgroundColor: 'var(--bg-primary)', borderBottom: '1px solid var(--border-color)' }}>
                <tr>
                  {['Action', 'User', 'Description', 'IP Address', 'Device', 'Date & Time'].map(h => (
                    <th key={h} style={{ padding: '16px 20px', textAlign: 'left', fontSize: '12px', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => {
                  const actionColor = getActionColor(log.action);
                  const ActionIcon = actionColor.icon;
                  return (
                    <tr 
                      key={log._id} 
                      style={{ borderBottom: '1px solid var(--border-color)', transition: 'background-color 0.2s' }}
                      onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--hover-bg)'}
                      onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                      <td style={{ padding: '16px 20px' }}>
                        <span style={{
                          padding: '6px 12px',
                          backgroundColor: actionColor.bg,
                          color: actionColor.color,
                          borderRadius: '20px',
                          fontSize: '12px',
                          fontWeight: '700',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          textTransform: 'capitalize'
                        }}>
                          <ActionIcon size={14} /> {log.action.replace(/_/g, ' ').toLowerCase()}
                        </span>
                      </td>
                      <td style={{ padding: '16px 20px' }}>
                        <div>
                          <div style={{ fontWeight: '600', color: 'var(--text-primary)', fontSize: '14px' }}>
                            {log.user?.fullName || 'System'}
                          </div>
                          <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                            {log.user?.role || 'Unknown Role'}
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '16px 20px', color: 'var(--text-secondary)', fontSize: '14px', maxWidth: '300px' }}>
                        {log.description}
                      </td>
                      <td style={{ padding: '16px 20px', fontFamily: 'monospace', color: 'var(--text-secondary)', fontSize: '13px' }}>
                        {log.ipAddress || 'N/A'}
                      </td>
                      <td style={{ padding: '16px 20px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <Monitor size={14} color="var(--text-secondary)" />
                          <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                            {log.browser || 'Unknown'} / {log.os || 'Unknown'}
                          </span>
                        </div>
                      </td>
                      <td style={{ padding: '16px 20px', color: 'var(--text-secondary)', fontSize: '13px', whiteSpace: 'nowrap' }}>
                        {formatDate(log.createdAt)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {pagination && pagination.pages > 1 && (
            <div style={{ padding: '20px', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}>
              <button
                onClick={() => setCurrentPage(pagination.page - 1)}
                disabled={!pagination.hasPrev}
                style={{
                  padding: '8px 16px',
                  backgroundColor: pagination.hasPrev ? 'var(--card-bg)' : 'var(--bg-primary)',
                  color: pagination.hasPrev ? 'var(--text-primary)' : 'var(--text-secondary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                  cursor: pagination.hasPrev ? 'pointer' : 'not-allowed',
                  fontWeight: '600',
                  fontSize: '14px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <ChevronLeft size={16} /> Previous
              </button>
              <span style={{ padding: '8px 16px', color: 'var(--text-secondary)', fontSize: '14px', fontWeight: '600' }}>
                Page {pagination.page} of {pagination.pages}
              </span>
              <button
                onClick={() => setCurrentPage(pagination.page + 1)}
                disabled={!pagination.hasNext}
                style={{
                  padding: '8px 16px',
                  backgroundColor: pagination.hasNext ? 'var(--card-bg)' : 'var(--bg-primary)',
                  color: pagination.hasNext ? 'var(--text-primary)' : 'var(--text-secondary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                  cursor: pagination.hasNext ? 'pointer' : 'not-allowed',
                  fontWeight: '600',
                  fontSize: '14px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                Next <ChevronRight size={16} />
              </button>
            </div>
          )}
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
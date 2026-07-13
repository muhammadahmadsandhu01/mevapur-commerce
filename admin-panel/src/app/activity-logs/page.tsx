'use client';

import { useEffect, useState } from 'react';
import { 
  History, 
  Search, 
  Filter,
  User,
  Calendar,
  Globe,
  Monitor,
  AlertCircle,
  Loader,
  Download,
  Trash2
} from 'lucide-react';
import api from '@/lib/api';

interface ActivityLog {
  _id: string;
  user: {
    _id: string;
    fullName: string;
    email: string;
    role: string;
  };
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
  const [userFilter, setUserFilter] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [pagination, setPagination] = useState<PaginationInfo | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [stats, setStats] = useState<any>(null);

  useEffect(() => {
    fetchLogs();
    fetchStats();
  }, [currentPage, search, userFilter, actionFilter]);

  const fetchLogs = async () => {
    try {
      setLoading(true);
      const params: any = { page: currentPage, limit: 20 };
      if (search) params.search = search;
      if (userFilter) params.userId = userFilter;
      if (actionFilter) params.action = actionFilter;

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
    if (!confirm('Are you sure you want to delete logs older than 90 days?')) return;

    try {
      const response = await api.delete('/activity-logs/cleanup', { data: { days: 90 } });
      if (response.data.success) {
        alert(`Deleted ${response.data.data.deletedCount} old logs`);
        await fetchLogs();
        await fetchStats();
      }
    } catch (error) {
      console.error('Error cleaning up logs:', error);
      alert('Failed to cleanup logs');
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
    if (action.includes('CREATE')) return { bg: '#D1FAE5', color: '#0F766E' };
    if (action.includes('UPDATE')) return { bg: '#DBEAFE', color: '#1E40AF' };
    if (action.includes('DELETE')) return { bg: '#FEE2E2', color: '#DC2626' };
    if (action.includes('LOGIN') || action.includes('LOGOUT')) return { bg: '#FEF3C7', color: '#92400E' };
    return { bg: '#F3F4F6', color: '#6B7280' };
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
              Activity Logs
            </h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '15px' }}>
              Track all admin actions and system activities
            </p>
          </div>
          
          <button
            onClick={handleCleanup}
            style={{
              backgroundColor: '#EF4444',
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
            <Trash2 size={20} />
            Cleanup Old Logs
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
                <History size={24} color="#3B82F6" />
              </div>
              <div>
                <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                  Total Logs
                </div>
                <div style={{ fontSize: '24px', fontWeight: '800', color: 'var(--text-primary)' }}>
                  {stats.totalLogs || 0}
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
                <Calendar size={24} color="#10B981" />
              </div>
              <div>
                <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                  Today
                </div>
                <div style={{ fontSize: '24px', fontWeight: '800', color: 'var(--text-primary)' }}>
                  {stats.todayLogs || 0}
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
                <Calendar size={24} color="#F59E0B" />
              </div>
              <div>
                <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                  This Week
                </div>
                <div style={{ fontSize: '24px', fontWeight: '800', color: 'var(--text-primary)' }}>
                  {stats.weekLogs || 0}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

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
              placeholder="Search activities..."
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
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
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
            <option value="">All Actions</option>
            <option value="LOGIN">Login</option>
            <option value="LOGOUT">Logout</option>
            <option value="PRODUCT_CREATE">Product Created</option>
            <option value="PRODUCT_UPDATE">Product Updated</option>
            <option value="PRODUCT_DELETE">Product Deleted</option>
            <option value="ORDER_STATUS_UPDATE">Order Status Updated</option>
            <option value="CUSTOMER_BLOCK">Customer Blocked</option>
            <option value="CUSTOMER_UNBLOCK">Customer Unblocked</option>
          </select>
        </div>
      </div>

      {/* Logs Table */}
      {loading ? (
        <div style={{
          backgroundColor: 'var(--card-bg)',
          padding: '60px',
          borderRadius: '12px',
          border: '1px solid var(--border-color)',
          textAlign: 'center'
        }}>
          <Loader size={40} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} color="var(--primary)" />
          <p style={{ color: 'var(--text-secondary)' }}>Loading activity logs...</p>
        </div>
      ) : logs.length === 0 ? (
        <div style={{
          backgroundColor: 'var(--card-bg)',
          padding: '60px',
          borderRadius: '12px',
          border: '1px solid var(--border-color)',
          textAlign: 'center'
        }}>
          <History size={64} style={{ margin: '0 auto 16px', opacity: 0.3 }} color="var(--text-secondary)" />
          <p style={{ fontSize: '18px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '8px' }}>
            No activity logs found
          </p>
        </div>
      ) : (
        <div style={{
          backgroundColor: 'var(--card-bg)',
          borderRadius: '12px',
          border: '1px solid var(--border-color)',
          overflow: 'hidden'
        }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ backgroundColor: 'var(--bg-primary)' }}>
                <tr>
                  <th style={{ padding: '16px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: '600' }}>Action</th>
                  <th style={{ padding: '16px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: '600' }}>User</th>
                  <th style={{ padding: '16px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: '600' }}>Description</th>
                  <th style={{ padding: '16px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: '600' }}>IP Address</th>
                  <th style={{ padding: '16px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: '600' }}>Browser</th>
                  <th style={{ padding: '16px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: '600' }}>Date & Time</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => {
                  const actionColor = getActionColor(log.action);
                  return (
                    <tr 
                      key={log._id} 
                      style={{ borderBottom: '1px solid var(--border-color)' }}
                      onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--hover-bg)'}
                      onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                      <td style={{ padding: '16px' }}>
                        <span style={{
                          padding: '6px 12px',
                          backgroundColor: actionColor.bg,
                          color: actionColor.color,
                          borderRadius: '20px',
                          fontSize: '12px',
                          fontWeight: '600',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px'
                        }}>
                          {getActionIcon(log.action)} {log.action.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td style={{ padding: '16px' }}>
                        <div>
                          <div style={{ fontWeight: '600', color: 'var(--text-primary)' }}>
                            {log.user?.fullName || 'Unknown'}
                          </div>
                          <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                            {log.user?.email}
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '16px', color: 'var(--text-secondary)', fontSize: '14px' }}>
                        {log.description}
                      </td>
                      <td style={{ padding: '16px', fontFamily: 'monospace', color: 'var(--text-secondary)', fontSize: '13px' }}>
                        {log.ipAddress || 'N/A'}
                      </td>
                      <td style={{ padding: '16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <Globe size={14} color="var(--text-secondary)" />
                          <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                            {log.browser} / {log.os}
                          </span>
                        </div>
                      </td>
                      <td style={{ padding: '16px', color: 'var(--text-secondary)', fontSize: '13px' }}>
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
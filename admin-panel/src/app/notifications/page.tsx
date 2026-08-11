'use client';

import { useEffect, useState } from 'react';
import { 
  Bell, 
  CheckCircle, 
  Trash2, 
  Search,
  Filter,
  Loader,
  Package,
  AlertTriangle,
  Star,
  User,
  Settings,
  CreditCard,
  CheckCheck,
  Eye,
  EyeOff
} from 'lucide-react';
import api from '@/lib/api';

interface Notification {
  _id: string;
  type: 'order' | 'stock' | 'review' | 'customer' | 'system' | 'payment';
  title: string;
  message: string;
  isRead: boolean;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  actionUrl: string;
  createdAt: string;
}

interface NotificationStats {
  totalNotifications: number;
  unreadCount: number;
  readCount: number;
}

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [stats, setStats] = useState<NotificationStats | null>(null);

  useEffect(() => {
    fetchNotifications();
    fetchStats();
  }, [filter]);

  async function fetchNotifications() {
    try {
      setLoading(true);
      const params: Record<string, string> = {};
      if (filter !== 'all') {
        if (filter === 'unread') params.isRead = 'false';
        else params.type = filter;
      }

      const response = await api.get('/notifications', { params });
      if (response.data.success) {
        setNotifications(response.data.data);
      }
    } catch (error) {
      console.error('Error fetching notifications:', error);
    } finally {
      setLoading(false);
    }
  }

  async function fetchStats() {
    try {
      const response = await api.get('/notifications/stats');
      if (response.data.success) {
        setStats(response.data.data);
      }
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  }

  const handleMarkAsRead = async (id: string) => {
    try {
      await api.put(`/notifications/${id}/read`);
      await fetchNotifications();
      await fetchStats();
    } catch (error) {
      console.error('Error marking as read:', error);
    }
  };

  const handleMarkAllAsRead = async () => {
    if (!confirm('Mark all notifications as read?')) return;
    try {
      await api.put('/notifications/mark-all-read');
      await fetchNotifications();
      await fetchStats();
    } catch (error) {
      console.error('Error marking all as read:', error);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this notification?')) return;
    try {
      await api.delete(`/notifications/${id}`);
      await fetchNotifications();
      await fetchStats();
    } catch (error) {
      console.error('Error deleting notification:', error);
    }
  };

  const handleDeleteAll = async () => {
    if (!confirm('Delete ALL notifications? This cannot be undone.')) return;
    try {
      await api.delete('/notifications/delete-all');
      await fetchNotifications();
      await fetchStats();
    } catch (error) {
      console.error('Error deleting all notifications:', error);
    }
  };

  const getTypeConfig = (type: string) => {
    switch (type) {
      case 'order': return { label: 'Order', color: 'var(--info-text)', bg: 'var(--info-light)', icon: Package };
      case 'stock': return { label: 'Stock Alert', color: 'var(--warning-text)', bg: 'rgba(245, 158, 11, 0.12)', icon: AlertTriangle };
      case 'review': return { label: 'Review', color: 'var(--accent-text)', bg: 'rgba(255, 138, 0, 0.12)', icon: Star };
      case 'customer': return { label: 'Customer', color: 'var(--success-text)', bg: 'rgba(22, 163, 74, 0.12)', icon: User };
      case 'payment': return { label: 'Payment', color: 'var(--info-text)', bg: 'var(--info-light)', icon: CreditCard };
      case 'system': return { label: 'System', color: 'var(--text-secondary)', bg: 'var(--bg-primary)', icon: Settings };
      default: return { label: type, color: 'var(--text-secondary)', bg: 'var(--bg-primary)', icon: Bell };
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent': return '#DC2626';
      case 'high': return '#F59E0B';
      case 'medium': return '#0B132B';
      case 'low': return '#16A34A';
      default: return '#6B7280';
    }
  };

  const filteredNotifications = notifications.filter(n => 
    n.title.toLowerCase().includes(search.toLowerCase()) ||
    n.message.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: '32px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div>
            <h1 style={{ fontSize: '32px', fontWeight: '800', color: 'var(--text-primary)', marginBottom: '8px' }}>
              Notifications
            </h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '15px' }}>
              Stay updated with your store activities
            </p>
          </div>
          
          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              onClick={handleMarkAllAsRead}
              style={{
                padding: '12px 20px',
                backgroundColor: 'var(--card-bg)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-color)',
                borderRadius: '10px',
                cursor: 'pointer',
                fontWeight: '600',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '14px'
              }}
            >
              <CheckCheck size={18} />
              Mark All Read
            </button>
            <button
              onClick={handleDeleteAll}
              style={{
                padding: '12px 20px',
                backgroundColor: '#DC2626',
                color: 'white',
                border: 'none',
                borderRadius: '10px',
                cursor: 'pointer',
                fontWeight: '600',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '14px'
              }}
            >
              <Trash2 size={18} />
              Delete All
            </button>
          </div>
        </div>

        {/* Stats Cards */}
        {stats && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
            <div style={{
              backgroundColor: 'var(--card-bg)',
              padding: '20px',
              borderRadius: '12px',
              border: '1px solid var(--border-color)',
              display: 'flex',
              alignItems: 'center',
              gap: '16px'
            }}>
              <div style={{ width: '48px', height: '48px', borderRadius: '10px', backgroundColor: 'var(--info-light)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Bell size={24} color="var(--info-text)" />
              </div>
              <div>
                <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Total</div>
                <div style={{ fontSize: '24px', fontWeight: '800', color: 'var(--text-primary)' }}>{stats.totalNotifications}</div>
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
              <div style={{ width: '48px', height: '48px', borderRadius: '10px', backgroundColor: 'rgba(255, 138, 0, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Eye size={24} color="var(--accent-text)" />
              </div>
              <div>
                <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Unread</div>
                <div style={{ fontSize: '24px', fontWeight: '800', color: 'var(--text-primary)' }}>{stats.unreadCount}</div>
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
              <div style={{ width: '48px', height: '48px', borderRadius: '10px', backgroundColor: 'rgba(22, 163, 74, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <CheckCircle size={24} color="var(--success-text)" />
              </div>
              <div>
                <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Read</div>
                <div style={{ fontSize: '24px', fontWeight: '800', color: 'var(--text-primary)' }}>{stats.readCount}</div>
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
              placeholder="Search notifications..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ width: '100%', padding: '12px 16px 12px 48px', border: '1px solid var(--border-color)', borderRadius: '10px', fontSize: '14px', outline: 'none', backgroundColor: 'var(--input-bg)', color: 'var(--text-primary)' }}
            />
          </div>

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {['all', 'unread', 'order', 'stock', 'review', 'customer', 'payment', 'system'].map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                style={{
                  padding: '8px 16px',
                  backgroundColor: filter === f ? 'var(--primary)' : 'var(--card-bg)',
                  color: filter === f ? '#0B132B' : 'var(--text-secondary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontWeight: filter === f ? '700' : '500',
                  fontSize: '13px',
                  textTransform: 'capitalize'
                }}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Notifications List */}
      {loading ? (
        <div style={{ backgroundColor: 'var(--card-bg)', padding: '60px', borderRadius: '12px', border: '1px solid var(--border-color)', textAlign: 'center' }}>
          <Loader size={40} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} color="#FF8A00" />
          <p style={{ color: 'var(--text-secondary)' }}>Loading notifications...</p>
        </div>
      ) : filteredNotifications.length === 0 ? (
        <div style={{ backgroundColor: 'var(--card-bg)', padding: '60px', borderRadius: '12px', border: '1px solid var(--border-color)', textAlign: 'center' }}>
          <Bell size={64} style={{ margin: '0 auto 16px', opacity: 0.3 }} color="var(--text-secondary)" />
          <p style={{ fontSize: '18px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '8px' }}>No notifications</p>
          <p style={{ color: 'var(--text-secondary)' }}>You&apos;re all caught up!</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {filteredNotifications.map((notification) => {
            const typeConfig = getTypeConfig(notification.type);
            const TypeIcon = typeConfig.icon;
            return (
              <div
                key={notification._id}
                style={{
                  backgroundColor: notification.isRead ? 'var(--card-bg)' : 'rgba(255, 138, 0, 0.06)',
                  borderRadius: '12px',
                  border: notification.isRead ? '1px solid var(--border-color)' : '2px solid #FF8A00',
                  padding: '20px',
                  display: 'flex',
                  gap: '16px',
                  alignItems: 'flex-start',
                  transition: 'all 0.2s'
                }}
              >
                <div style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '10px',
                  backgroundColor: typeConfig.bg,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}>
                  <TypeIcon size={24} color={typeConfig.color} />
                </div>

                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                        <h3 style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)', margin: 0 }}>
                          {notification.title}
                        </h3>
                        <span style={{
                          width: '8px',
                          height: '8px',
                          borderRadius: '50%',
                          backgroundColor: getPriorityColor(notification.priority)
                        }} />
                      </div>
                      <span style={{
                        padding: '2px 8px',
                        backgroundColor: typeConfig.bg,
                        color: typeConfig.color,
                        borderRadius: '12px',
                        fontSize: '11px',
                        fontWeight: '600'
                      }}>
                        {typeConfig.label}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      {!notification.isRead && (
                        <button
                          onClick={() => handleMarkAsRead(notification._id)}
                          style={{
                            padding: '6px 12px',
                            backgroundColor: '#16A34A',
                            color: 'white',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            fontSize: '12px',
                            fontWeight: '600'
                          }}
                        >
                          <CheckCircle size={14} />
                          Mark Read
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(notification._id)}
                        style={{
                          padding: '6px 12px',
                          backgroundColor: '#DC2626',
                          color: 'white',
                          border: 'none',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          fontSize: '12px',
                          fontWeight: '600'
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                  <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: '0 0 8px 0', lineHeight: '1.5' }}>
                    {notification.message}
                  </p>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                    {new Date(notification.createdAt).toLocaleString('en-PK', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </div>
                </div>
              </div>
            );
          })}
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

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Bell,
  CheckCheck,
  CheckCircle,
  CreditCard,
  Eye,
  Loader,
  Package,
  Search,
  Settings,
  Star,
  Trash2,
  User
} from 'lucide-react';
import api from '@/lib/api';
import {
  ADMIN_NOTIFICATION_CHANGE_EVENT,
  announceAdminNotificationChange,
  formatNotificationTime,
  isSuccessfulMutationEnvelope,
  validateNotificationListEnvelope,
  validateNotificationStatsEnvelope,
  type AdminNotification,
  type AdminNotificationStats
} from '@/lib/notificationUi';

type NotificationPageState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'success'; notifications: AdminNotification[]; stats: AdminNotificationStats };

type NotificationFilter = 'all' | 'unread' | AdminNotification['type'];

const filters: NotificationFilter[] = [
  'all',
  'unread',
  'order',
  'stock',
  'review',
  'customer',
  'payment',
  'system'
];

export default function NotificationsPage() {
  const [pageState, setPageState] = useState<NotificationPageState>({ status: 'loading' });
  const [filter, setFilter] = useState<NotificationFilter>('all');
  const [search, setSearch] = useState('');
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [operationError, setOperationError] = useState<string | null>(null);
  const mountedRef = useRef(false);
  const requestIdRef = useRef(0);
  const requestAbortRef = useRef<AbortController | null>(null);

  const loadNotifications = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    requestAbortRef.current?.abort();
    const controller = new AbortController();
    requestAbortRef.current = controller;
    setPageState({ status: 'loading' });
    setOperationError(null);

    const params: Record<string, string> = {};
    if (filter === 'unread') params.isRead = 'false';
    else if (filter !== 'all') params.type = filter;

    try {
      const [listResponse, statsResponse] = await Promise.all([
        api.get('/notifications', { params, signal: controller.signal }),
        api.get('/notifications/stats', { signal: controller.signal })
      ]);
      const notifications = validateNotificationListEnvelope(listResponse.data);
      const stats = validateNotificationStatsEnvelope(statsResponse.data);
      if (notifications === null || stats === null) throw new Error('INVALID_NOTIFICATION_RESPONSE');
      if (!mountedRef.current || controller.signal.aborted || requestId !== requestIdRef.current) return;
      setPageState({ status: 'success', notifications, stats });
    } catch {
      if (!mountedRef.current || controller.signal.aborted || requestId !== requestIdRef.current) return;
      setPageState({ status: 'error' });
    }
  }, [filter]);

  useEffect(() => {
    mountedRef.current = true;
    const initialLoad = window.setTimeout(() => void loadNotifications(), 0);

    const handleNotificationChange = () => void loadNotifications();
    window.addEventListener(ADMIN_NOTIFICATION_CHANGE_EVENT, handleNotificationChange);

    return () => {
      mountedRef.current = false;
      window.clearTimeout(initialLoad);
      requestAbortRef.current?.abort();
      requestAbortRef.current = null;
      window.removeEventListener(ADMIN_NOTIFICATION_CHANGE_EVENT, handleNotificationChange);
    };
  }, [loadNotifications]);

  const performMutation = async (
    action: string,
    request: () => Promise<{ data: unknown }>,
    failureMessage: string
  ) => {
    if (pendingAction) return;
    setPendingAction(action);
    setOperationError(null);
    try {
      const response = await request();
      if (!isSuccessfulMutationEnvelope(response.data)) throw new Error('NOTIFICATION_MUTATION_FAILED');
      announceAdminNotificationChange();
    } catch {
      if (mountedRef.current) setOperationError(failureMessage);
    } finally {
      if (mountedRef.current) setPendingAction(null);
    }
  };

  const handleMarkAsRead = (id: string) => {
    void performMutation(
      `read:${id}`,
      () => api.put(`/notifications/${id}/read`),
      'This notification could not be marked as read. Please try again.'
    );
  };

  const handleMarkAllAsRead = () => {
    if (!window.confirm('Mark all notifications as read?')) return;
    void performMutation(
      'read-all',
      () => api.put('/notifications/mark-all-read'),
      'Notifications could not be marked as read. Please try again.'
    );
  };

  const handleDelete = (id: string) => {
    if (!window.confirm('Delete this notification?')) return;
    void performMutation(
      `delete:${id}`,
      () => api.delete(`/notifications/${id}`),
      'This notification could not be deleted. Please try again.'
    );
  };

  const handleDeleteAll = () => {
    if (!window.confirm('Delete ALL notifications? This cannot be undone.')) return;
    void performMutation(
      'delete-all',
      () => api.delete('/notifications/delete-all'),
      'Notifications could not be deleted. Please try again.'
    );
  };

  const getTypeConfig = (type: AdminNotification['type']) => {
    switch (type) {
      case 'order': return { label: 'Order', color: 'var(--info-text)', bg: 'var(--info-light)', icon: Package };
      case 'stock': return { label: 'Stock Alert', color: 'var(--warning-text)', bg: 'rgba(245, 158, 11, 0.12)', icon: AlertTriangle };
      case 'review': return { label: 'Review', color: 'var(--accent-text)', bg: 'rgba(255, 138, 0, 0.12)', icon: Star };
      case 'customer': return { label: 'Customer', color: 'var(--success-text)', bg: 'rgba(22, 163, 74, 0.12)', icon: User };
      case 'payment': return { label: 'Payment', color: 'var(--info-text)', bg: 'var(--info-light)', icon: CreditCard };
      case 'system': return { label: 'System', color: 'var(--text-secondary)', bg: 'var(--bg-primary)', icon: Settings };
    }
  };

  const getPriorityColor = (priority: AdminNotification['priority']) => {
    switch (priority) {
      case 'urgent': return '#DC2626';
      case 'high': return '#F59E0B';
      case 'medium': return '#0B132B';
      case 'low': return '#16A34A';
    }
  };

  const notifications = pageState.status === 'success' ? pageState.notifications : [];
  const stats = pageState.status === 'success' ? pageState.stats : null;
  const normalizedSearch = search.trim().toLowerCase();
  const filteredNotifications = notifications.filter((notification) => (
    notification.title.toLowerCase().includes(normalizedSearch)
    || notification.message.toLowerCase().includes(normalizedSearch)
  ));
  const anyMutationPending = pendingAction !== null;

  return (
    <div>
      <div style={{ marginBottom: '32px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', flexWrap: 'wrap', marginBottom: '16px' }}>
          <div>
            <h1 style={{ fontSize: '32px', fontWeight: '800', color: 'var(--text-primary)', marginBottom: '8px' }}>
              Notifications
            </h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '15px' }}>
              Stay updated with your store activities
            </p>
          </div>

          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={handleMarkAllAsRead}
              disabled={!stats || stats.unreadCount === 0 || anyMutationPending}
              style={{
                padding: '12px 20px', backgroundColor: 'var(--card-bg)', color: 'var(--text-primary)',
                border: '1px solid var(--border-color)', borderRadius: '10px', cursor: !stats || stats.unreadCount === 0 || anyMutationPending ? 'not-allowed' : 'pointer',
                fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px',
                opacity: !stats || stats.unreadCount === 0 || anyMutationPending ? 0.55 : 1
              }}
            >
              <CheckCheck size={18} />
              {pendingAction === 'read-all' ? 'Marking...' : 'Mark All Read'}
            </button>
            <button
              type="button"
              onClick={handleDeleteAll}
              disabled={!stats || stats.totalNotifications === 0 || anyMutationPending}
              style={{
                padding: '12px 20px', backgroundColor: '#DC2626', color: 'white', border: 'none', borderRadius: '10px',
                cursor: !stats || stats.totalNotifications === 0 || anyMutationPending ? 'not-allowed' : 'pointer', fontWeight: '600',
                display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px',
                opacity: !stats || stats.totalNotifications === 0 || anyMutationPending ? 0.55 : 1
              }}
            >
              <Trash2 size={18} />
              {pendingAction === 'delete-all' ? 'Deleting...' : 'Delete All'}
            </button>
          </div>
        </div>

        {operationError && (
          <div role="alert" style={{ padding: '12px 16px', borderRadius: '10px', backgroundColor: 'var(--danger-light)', color: 'var(--danger-text)', marginBottom: '16px' }}>
            {operationError}
          </div>
        )}

        {stats && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
            {[
              { label: 'Total', value: stats.totalNotifications, icon: Bell, bg: 'var(--info-light)', color: 'var(--info-text)' },
              { label: 'Unread', value: stats.unreadCount, icon: Eye, bg: 'rgba(255, 138, 0, 0.12)', color: 'var(--accent-text)' },
              { label: 'Read', value: stats.readCount, icon: CheckCircle, bg: 'rgba(22, 163, 74, 0.12)', color: 'var(--success-text)' }
            ].map((item) => (
              <div key={item.label} style={{
                backgroundColor: 'var(--card-bg)', padding: '20px', borderRadius: '12px',
                border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '16px'
              }}>
                <div style={{ width: '48px', height: '48px', borderRadius: '10px', backgroundColor: item.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <item.icon size={24} color={item.color} />
                </div>
                <div>
                  <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '4px' }}>{item.label}</div>
                  <div style={{ fontSize: '24px', fontWeight: '800', color: 'var(--text-primary)' }}>{item.value}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ backgroundColor: 'var(--card-bg)', padding: '20px', borderRadius: '12px', border: '1px solid var(--border-color)', marginBottom: '24px' }}>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ flex: 1, minWidth: '280px', position: 'relative' }}>
            <Search size={18} style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
            <input
              type="search"
              aria-label="Search notifications"
              placeholder="Search notifications..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              style={{ width: '100%', padding: '12px 16px 12px 48px', border: '1px solid var(--border-color)', borderRadius: '10px', fontSize: '14px', outline: 'none', backgroundColor: 'var(--input-bg)', color: 'var(--text-primary)' }}
            />
          </div>

          <div role="group" aria-label="Notification type filters" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {filters.map((item) => (
              <button
                key={item}
                type="button"
                aria-pressed={filter === item}
                onClick={() => setFilter(item)}
                style={{
                  padding: '8px 16px', backgroundColor: filter === item ? 'var(--primary)' : 'var(--card-bg)',
                  color: filter === item ? '#0B132B' : 'var(--text-secondary)', border: '1px solid var(--border-color)',
                  borderRadius: '8px', cursor: 'pointer', fontWeight: filter === item ? '700' : '500', fontSize: '13px',
                  textTransform: 'capitalize'
                }}
              >
                {item}
              </button>
            ))}
          </div>
        </div>
      </div>

      {pageState.status === 'loading' && (
        <div role="status" style={{ backgroundColor: 'var(--card-bg)', padding: '60px', borderRadius: '12px', border: '1px solid var(--border-color)', textAlign: 'center' }}>
          <Loader size={40} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} color="#FF8A00" />
          <p style={{ color: 'var(--text-secondary)' }}>Loading notifications...</p>
        </div>
      )}

      {pageState.status === 'error' && (
        <div role="alert" style={{ backgroundColor: 'var(--card-bg)', padding: '60px 20px', borderRadius: '12px', border: '1px solid var(--border-color)', textAlign: 'center' }}>
          <AlertTriangle size={48} style={{ margin: '0 auto 16px' }} color="var(--danger-text)" />
          <p style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '8px' }}>Notifications could not be loaded</p>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '18px' }}>Confirm your Admin session and try again.</p>
          <button
            type="button"
            onClick={() => void loadNotifications()}
            style={{ padding: '10px 18px', backgroundColor: 'var(--primary)', color: '#0B132B', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '700' }}
          >
            Retry
          </button>
        </div>
      )}

      {pageState.status === 'success' && filteredNotifications.length === 0 && (
        <div style={{ backgroundColor: 'var(--card-bg)', padding: '60px 20px', borderRadius: '12px', border: '1px solid var(--border-color)', textAlign: 'center' }}>
          <Bell size={64} style={{ margin: '0 auto 16px', opacity: 0.3 }} color="var(--text-secondary)" />
          <p style={{ fontSize: '18px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '8px' }}>
            {stats?.totalNotifications === 0 ? 'No notifications' : 'No matching notifications'}
          </p>
          <p style={{ color: 'var(--text-secondary)' }}>
            {stats?.totalNotifications === 0
              ? 'There are no notifications for this account yet.'
              : 'Try a different search or notification filter.'}
          </p>
        </div>
      )}

      {pageState.status === 'success' && filteredNotifications.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {filteredNotifications.map((notification) => {
            const typeConfig = getTypeConfig(notification.type);
            const TypeIcon = typeConfig.icon;
            const rowPending = pendingAction === `read:${notification._id}` || pendingAction === `delete:${notification._id}`;
            return (
              <article
                key={notification._id}
                style={{
                  backgroundColor: notification.isRead ? 'var(--card-bg)' : 'rgba(255, 138, 0, 0.06)', borderRadius: '12px',
                  border: notification.isRead ? '1px solid var(--border-color)' : '2px solid #FF8A00', padding: '20px',
                  display: 'flex', gap: '16px', alignItems: 'flex-start', transition: 'all 0.2s', opacity: rowPending ? 0.7 : 1
                }}
              >
                <div style={{
                  width: '48px', height: '48px', borderRadius: '10px', backgroundColor: typeConfig.bg,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                }}>
                  <TypeIcon size={24} color={typeConfig.color} />
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '8px', flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                        <h2 style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)', margin: 0 }}>
                          {notification.title}
                        </h2>
                        <span aria-label={`${notification.priority} priority`} style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: getPriorityColor(notification.priority) }} />
                      </div>
                      <span style={{ padding: '2px 8px', backgroundColor: typeConfig.bg, color: typeConfig.color, borderRadius: '12px', fontSize: '11px', fontWeight: '600' }}>
                        {typeConfig.label}
                      </span>
                    </div>

                    <div style={{ display: 'flex', gap: '8px' }}>
                      {!notification.isRead && (
                        <button
                          type="button"
                          disabled={anyMutationPending}
                          onClick={() => handleMarkAsRead(notification._id)}
                          style={{
                            padding: '6px 12px', backgroundColor: '#16A34A', color: 'white', border: 'none', borderRadius: '6px',
                            cursor: anyMutationPending ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '4px',
                            fontSize: '12px', fontWeight: '600', opacity: anyMutationPending ? 0.6 : 1
                          }}
                        >
                          <CheckCircle size={14} />
                          {pendingAction === `read:${notification._id}` ? 'Marking...' : 'Mark Read'}
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={anyMutationPending}
                        aria-label={`Delete ${notification.title}`}
                        onClick={() => handleDelete(notification._id)}
                        style={{
                          padding: '6px 12px', backgroundColor: '#DC2626', color: 'white', border: 'none', borderRadius: '6px',
                          cursor: anyMutationPending ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '4px',
                          fontSize: '12px', fontWeight: '600', opacity: anyMutationPending ? 0.6 : 1
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                  <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: '0 0 8px 0', lineHeight: '1.5' }}>
                    {notification.message}
                  </p>
                  <time dateTime={notification.createdAt} style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                    {formatNotificationTime(notification.createdAt)}
                  </time>
                </div>
              </article>
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

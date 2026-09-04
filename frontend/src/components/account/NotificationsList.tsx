'use client';

import { useState, useEffect, useCallback } from 'react';
import { Bell, CheckCheck, Check, Clock, AlertCircle, Loader2 } from 'lucide-react';
import { accountService, getAccountApiErrorMessage } from '@/services/account.service';
import { getSessionGeneration, isCurrentSessionGeneration } from '@/lib/authSession';

export interface AccountNotification {
  _id?: string;
  id?: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  actionUrl?: string;
  createdAt: string;
}

export default function NotificationsList() {
  const [notifications, setNotifications] = useState<AccountNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [markingAll, setMarkingAll] = useState(false);

  const loadNotifications = useCallback(async () => {
    const gen = getSessionGeneration();
    setLoading(true);
    setError(null);
    try {
      const res = await accountService.notifications() as { notifications: AccountNotification[]; unreadCount: number };
      if (isCurrentSessionGeneration(gen)) {
        setNotifications(res.notifications || []);
        setUnreadCount(res.unreadCount || 0);
      }
    } catch {
      if (isCurrentSessionGeneration(gen)) {
        setError('Could not load notifications.');
      }
    } finally {
      if (isCurrentSessionGeneration(gen)) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadNotifications();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadNotifications]);

  const handleMarkSingleRead = async (notif: AccountNotification) => {
    const notifId = notif.id || notif._id;
    if (!notifId || notif.isRead) return;

    // Optimistic update
    const previous = [...notifications];
    const previousUnread = unreadCount;
    setNotifications((prev) =>
      prev.map((n) => ((n.id || n._id) === notifId ? { ...n, isRead: true } : n))
    );
    setUnreadCount((c) => Math.max(0, c - 1));

    try {
      await accountService.markNotificationRead(notifId);
    } catch (err) {
      // Rollback on failure
      setNotifications(previous);
      setUnreadCount(previousUnread);
      setError(getAccountApiErrorMessage(err, 'Failed to mark notification as read.'));
    }
  };

  const handleMarkAllRead = async () => {
    if (unreadCount === 0 || markingAll) return;

    // Optimistic update
    const previous = [...notifications];
    const previousUnread = unreadCount;
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    setUnreadCount(0);
    setMarkingAll(true);
    setError(null);

    try {
      await accountService.markAllNotificationsRead();
    } catch (err) {
      // Rollback on failure
      setNotifications(previous);
      setUnreadCount(previousUnread);
      setError(getAccountApiErrorMessage(err, 'Failed to mark all notifications as read.'));
    } finally {
      setMarkingAll(false);
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col justify-between gap-4 border-b border-slate-100 pb-4 sm:flex-row sm:items-center">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
            <Bell className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-[#0b132b]">Notifications</h2>
              {unreadCount > 0 && (
                <span className="rounded-full bg-indigo-600 px-2 py-0.5 text-[10px] font-bold text-white">
                  {unreadCount} new
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500">
              Updates on your orders, deliveries, returns, and account activity.
            </p>
          </div>
        </div>

        {unreadCount > 0 && (
          <button
            type="button"
            onClick={handleMarkAllRead}
            disabled={markingAll}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {markingAll ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCheck className="h-3.5 w-3.5 text-indigo-600" />}
            Mark All as Read
          </button>
        )}
      </div>

      {error && (
        <div role="alert" className="mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="mt-6 space-y-3">
        {loading ? (
          [1, 2, 3].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl bg-slate-100" />
          ))
        ) : notifications.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center">
            <p className="text-sm font-medium text-slate-600">No notifications at this time.</p>
            <p className="mt-1 text-xs text-slate-600">
              When there are updates on your orders or account, they will appear here.
            </p>
          </div>
        ) : (
          notifications.map((notif) => {
            const id = notif.id || notif._id || '';
            return (
              <div
                key={id}
                onClick={() => handleMarkSingleRead(notif)}
                className={`group flex cursor-pointer items-start justify-between gap-4 rounded-xl border p-4 transition ${
                  notif.isRead ? 'border-slate-100 bg-white' : 'border-indigo-100 bg-indigo-50/20'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                      notif.isRead ? 'bg-slate-100 text-slate-500' : 'bg-indigo-100 text-indigo-700'
                    }`}
                  >
                    <Bell className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className={`text-sm ${notif.isRead ? 'font-medium text-slate-800' : 'font-bold text-[#0b132b]'}`}>
                        {notif.title}
                      </h4>
                      {!notif.isRead && (
                        <span className="h-2 w-2 rounded-full bg-indigo-600" />
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-slate-600">{notif.message}</p>
                    <div className="mt-1 flex items-center gap-1 text-[11px] text-slate-600">
                      <Clock className="h-3 w-3" />
                      <span>{new Date(notif.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  </div>
                </div>

                {!notif.isRead && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      void handleMarkSingleRead(notif);
                    }}
                    title="Mark as read"
                    className="rounded p-1 text-slate-400 hover:text-indigo-600"
                  >
                    <Check className="h-4 w-4" />
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

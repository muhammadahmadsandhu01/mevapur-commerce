'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Laptop, Smartphone, Globe, ShieldAlert, LogOut, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { authService, type ActiveSession, getSessionGeneration, isCurrentSessionGeneration } from '@/lib/authSession';
import { useAuthStore } from '@/store/authStore';

export default function SessionManager() {
  const router = useRouter();
  const logout = useAuthStore((state) => state.logout);

  const [sessions, setSessions] = useState<ActiveSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [revokingAll, setRevokingAll] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadSessions = useCallback(async () => {
    const gen = getSessionGeneration();
    setLoading(true);
    setError(null);
    try {
      const list = await authService.getSessions();
      if (isCurrentSessionGeneration(gen)) {
        setSessions(list);
      }
    } catch {
      if (isCurrentSessionGeneration(gen)) {
        setError('Unable to load active sessions.');
      }
    } finally {
      if (isCurrentSessionGeneration(gen)) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadSessions();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadSessions]);

  const handleRevokeSingle = async (session: ActiveSession) => {
    if (!window.confirm(`Are you sure you want to sign out this session (${session.deviceInfo?.browser || 'Browser'} on ${session.deviceInfo?.os || 'Device'})?`)) {
      return;
    }

    setRevokingId(session.id);
    setError(null);
    setSuccess(null);
    try {
      const result = await authService.revokeSession(session.id);
      if (session.isCurrent || result?.revokedCurrent) {
        await logout();
        router.push('/login?message=Session+revoked.+Please+sign+in+again.');
        return;
      }
      setSuccess('Session signed out successfully.');
      await loadSessions();
    } catch {
      setError('Failed to revoke session. Please try again.');
    } finally {
      setRevokingId(null);
    }
  };

  const handleLogoutAll = async () => {
    if (!window.confirm('Are you sure you want to sign out all active sessions? You will need to sign in again.')) {
      return;
    }

    setRevokingAll(true);
    setError(null);
    setSuccess(null);
    try {
      await authService.logoutAll();
      await logout();
      router.push('/login?message=All+sessions+revoked.+Please+sign+in+again.');
    } catch {
      setError('Failed to revoke all sessions.');
      setRevokingAll(false);
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col justify-between gap-4 border-b border-slate-100 pb-4 sm:flex-row sm:items-center">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
            <Globe className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-[#0b132b]">Active Sessions</h2>
            <p className="text-xs text-slate-500">
              Manage devices and browsers currently signed in to your account.
            </p>
          </div>
        </div>

        {sessions.length > 1 && (
          <button
            type="button"
            onClick={handleLogoutAll}
            disabled={revokingAll || loading}
            className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"
          >
            {revokingAll ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LogOut className="h-3.5 w-3.5" />}
            Sign Out All Sessions
          </button>
        )}
      </div>

      {error && (
        <div role="alert" className="mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div role="status" className="mt-4 flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      <div className="mt-6 space-y-3">
        {loading ? (
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div key={i} className="h-20 animate-pulse rounded-lg bg-slate-100" />
            ))}
          </div>
        ) : sessions.length === 0 ? (
          <p className="text-sm text-slate-500">No active session details found.</p>
        ) : (
          sessions.map((session) => {
            const isMobile = session.deviceInfo?.device === 'mobile' || (session.userAgent && /mobile|android|iphone/i.test(session.userAgent));
            return (
              <div
                key={session.id}
                className={`flex flex-col justify-between gap-4 rounded-xl border p-4 sm:flex-row sm:items-center ${
                  session.isCurrent ? 'border-blue-200 bg-blue-50/30' : 'border-slate-200 bg-white'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className={`mt-0.5 flex h-9 w-9 items-center justify-center rounded-lg ${session.isCurrent ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>
                    {isMobile ? <Smartphone className="h-4 w-4" /> : <Laptop className="h-4 w-4" />}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-900 text-sm">
                        {session.deviceInfo?.browser || 'Browser'} on {session.deviceInfo?.os || 'Unknown Device'}
                      </span>
                      {session.isCurrent && (
                        <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-700 uppercase tracking-wider">
                          Current Device
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500">
                      IP: {session.ipAddress || 'Private'} · Signed in: {new Date(session.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>

                {!session.isCurrent && (
                  <button
                    type="button"
                    onClick={() => handleRevokeSingle(session)}
                    disabled={revokingId === session.id}
                    className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:border-red-300 hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
                  >
                    {revokingId === session.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldAlert className="h-3.5 w-3.5 text-red-500" />}
                    Revoke Access
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

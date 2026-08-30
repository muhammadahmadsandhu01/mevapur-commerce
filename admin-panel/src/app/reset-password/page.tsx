'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  Eye,
  EyeOff,
  CheckCircle,
  AlertCircle,
  Loader,
  ShieldCheck,
  KeyRound,
  ArrowLeft
} from 'lucide-react';
import BrandLogo from '@/components/brand/BrandLogo';
import { authHttp } from '@/lib/authSession';

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const hasLength = newPassword.length >= 12;
  const hasUpper = /[A-Z]/.test(newPassword);
  const hasLower = /[a-z]/.test(newPassword);
  const hasNumber = /\d/.test(newPassword);
  const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(newPassword);
  const isMatch = newPassword.length > 0 && newPassword === confirmPassword;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!token) {
      setError('Password reset token is missing or invalid. Please request a new link.');
      return;
    }

    if (!hasLength || !hasUpper || !hasLower || !hasNumber || !hasSpecial) {
      setError('New password must satisfy all policy requirements.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      await authHttp.post('/auth/reset-password', {
        resetToken: token,
        newPassword
      });
      setSuccess(true);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string; error?: { message?: string } } } };
      const msg = axiosErr.response?.data?.error?.message || axiosErr.response?.data?.message || 'Password reset failed. The token may be expired or invalid.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  if (!token && !success) {
    return (
      <div style={{ textAlign: 'center', padding: '16px 0' }}>
        <div style={{
          width: '64px',
          height: '64px',
          borderRadius: '50%',
          backgroundColor: 'rgba(220, 38, 38, 0.1)',
          color: '#DC2626',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 16px'
        }}>
          <AlertCircle size={36} />
        </div>
        <h2 style={{ fontSize: '20px', fontWeight: '800', color: '#0B132B', marginBottom: '8px' }}>
          Invalid or Missing Token
        </h2>
        <p style={{ fontSize: '14px', color: '#6B7280', lineHeight: '1.5', marginBottom: '24px' }}>
          No password reset token was provided in the URL. Please request a fresh recovery link.
        </p>
        <Link
          href="/forgot-password"
          style={{
            display: 'block',
            width: '100%',
            padding: '14px',
            backgroundColor: '#FF8A00',
            color: '#0B132B',
            borderRadius: '10px',
            fontSize: '15px',
            fontWeight: '700',
            textDecoration: 'none',
            textAlign: 'center'
          }}
        >
          Request Recovery Link
        </Link>
      </div>
    );
  }

  if (success) {
    return (
      <div style={{ textAlign: 'center', padding: '16px 0' }}>
        <div style={{
          width: '64px',
          height: '64px',
          borderRadius: '50%',
          backgroundColor: 'rgba(22, 163, 74, 0.12)',
          color: '#16A34A',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 16px'
        }}>
          <CheckCircle size={36} />
        </div>
        <h2 style={{ fontSize: '20px', fontWeight: '800', color: '#0B132B', marginBottom: '8px' }}>
          Password Reset Complete
        </h2>
        <p style={{ fontSize: '14px', color: '#6B7280', lineHeight: '1.6', marginBottom: '28px' }}>
          Your administrator password has been updated. You can now log in using your new credentials.
        </p>
        <button
          type="button"
          onClick={() => router.push('/login')}
          style={{
            width: '100%',
            padding: '14px',
            backgroundColor: '#FF8A00',
            color: '#0B132B',
            border: 'none',
            borderRadius: '10px',
            fontSize: '15px',
            fontWeight: '700',
            cursor: 'pointer'
          }}
        >
          Proceed to Login
        </button>
      </div>
    );
  }

  return (
    <div>
      <div style={{ textAlign: 'center', marginBottom: '28px' }}>
        <div style={{
          width: '64px',
          height: '64px',
          borderRadius: '50%',
          backgroundColor: 'rgba(255, 138, 0, 0.12)',
          color: '#FF8A00',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 16px'
        }}>
          <KeyRound size={28} />
        </div>
        <h1 style={{ fontSize: '22px', fontWeight: '800', color: '#0B132B', margin: '0 0 6px' }}>
          Reset Admin Password
        </h1>
        <p style={{ color: '#6B7280', fontSize: '13.5px', margin: 0 }}>
          Create a new strong password for your administrator account.
        </p>
      </div>

      {error && (
        <div
          role="alert"
          style={{
            backgroundColor: '#FEF2F2',
            color: '#DC2626',
            padding: '12px 14px',
            borderRadius: '10px',
            marginBottom: '20px',
            fontSize: '13px',
            fontWeight: '600',
            border: '1px solid #FECACA',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div>
          <label
            htmlFor="admin-reset-new-password"
            style={{ display: 'block', fontSize: '13.5px', fontWeight: '600', color: '#111827', marginBottom: '8px' }}
          >
            New Password
          </label>
          <div style={{ position: 'relative' }}>
            <input
              id="admin-reset-new-password"
              type={showNew ? 'text' : 'password'}
              required
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Minimum 12 characters"
              style={{
                width: '100%',
                padding: '13px 44px 13px 14px',
                border: '1.5px solid #E5E7EB',
                borderRadius: '10px',
                fontSize: '14px',
                outline: 'none',
                backgroundColor: '#FFFFFF',
                color: '#111827',
                boxSizing: 'border-box'
              }}
            />
            <button
              type="button"
              onClick={() => setShowNew(!showNew)}
              aria-label={showNew ? 'Hide new password' : 'Show new password'}
              style={{
                position: 'absolute',
                right: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: '#9CA3AF',
                padding: '4px'
              }}
            >
              {showNew ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>

        <div>
          <label
            htmlFor="admin-reset-confirm-password"
            style={{ display: 'block', fontSize: '13.5px', fontWeight: '600', color: '#111827', marginBottom: '8px' }}
          >
            Confirm New Password
          </label>
          <div style={{ position: 'relative' }}>
            <input
              id="admin-reset-confirm-password"
              type={showConfirm ? 'text' : 'password'}
              required
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter new password"
              style={{
                width: '100%',
                padding: '13px 44px 13px 14px',
                border: '1.5px solid #E5E7EB',
                borderRadius: '10px',
                fontSize: '14px',
                outline: 'none',
                backgroundColor: '#FFFFFF',
                color: '#111827',
                boxSizing: 'border-box'
              }}
            />
            <button
              type="button"
              onClick={() => setShowConfirm(!showConfirm)}
              aria-label={showConfirm ? 'Hide confirm password' : 'Show confirm password'}
              style={{
                position: 'absolute',
                right: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: '#9CA3AF',
                padding: '4px'
              }}
            >
              {showConfirm ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>

        {/* Requirements */}
        <div style={{
          padding: '14px',
          backgroundColor: '#F8FAFC',
          borderRadius: '10px',
          border: '1px solid #E2E8F0'
        }}>
          <div style={{ fontSize: '11.5px', fontWeight: '700', color: '#0F172A', marginBottom: '8px', textTransform: 'uppercase' }}>
            Password Policy
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', fontSize: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: hasLength ? '#16A34A' : '#64748B' }}>
              <ShieldCheck size={13} color={hasLength ? '#16A34A' : '#94A3B8'} />
              12+ chars
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: hasUpper ? '#16A34A' : '#64748B' }}>
              <ShieldCheck size={13} color={hasUpper ? '#16A34A' : '#94A3B8'} />
              Uppercase
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: hasLower ? '#16A34A' : '#64748B' }}>
              <ShieldCheck size={13} color={hasLower ? '#16A34A' : '#94A3B8'} />
              Lowercase
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: hasNumber ? '#16A34A' : '#64748B' }}>
              <ShieldCheck size={13} color={hasNumber ? '#16A34A' : '#94A3B8'} />
              Number
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: hasSpecial ? '#16A34A' : '#64748B' }}>
              <ShieldCheck size={13} color={hasSpecial ? '#16A34A' : '#94A3B8'} />
              Symbol
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: isMatch ? '#16A34A' : '#64748B' }}>
              <ShieldCheck size={13} color={isMatch ? '#16A34A' : '#94A3B8'} />
              Match
            </div>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          style={{
            width: '100%',
            padding: '14px',
            backgroundColor: loading ? '#9CA3AF' : '#FF8A00',
            color: '#0B132B',
            border: 'none',
            borderRadius: '12px',
            fontSize: '15px',
            fontWeight: '700',
            cursor: loading ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            boxShadow: loading ? 'none' : '0 4px 14px rgba(255, 138, 0, 0.35)',
            transition: 'all 0.2s'
          }}
        >
          {loading ? (
            <>
              <Loader size={18} style={{ animation: 'spin 1s linear infinite' }} />
              Resetting Password...
            </>
          ) : (
            'Set New Password'
          )}
        </button>
      </form>
    </div>
  );
}

export default function AdminResetPasswordPage() {
  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#F7F7F5',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px',
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    }}>
      {/* Background accent */}
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        height: '240px',
        background: 'linear-gradient(135deg, #0B132B 0%, #060A16 100%)',
        zIndex: 0
      }} />

      <Link
        href="/login"
        style={{
          position: 'fixed',
          top: '20px',
          left: '20px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          color: '#FFFFFF',
          textDecoration: 'none',
          fontWeight: '600',
          fontSize: '14px',
          padding: '10px 16px',
          backgroundColor: 'rgba(255, 255, 255, 0.1)',
          backdropFilter: 'blur(10px)',
          borderRadius: '10px',
          zIndex: 10,
          transition: 'all 0.2s'
        }}
      >
        <ArrowLeft size={16} /> Back to Login
      </Link>

      <div style={{
        backgroundColor: 'white',
        borderRadius: '20px',
        padding: '48px 40px',
        maxWidth: '460px',
        width: '100%',
        boxShadow: '0 24px 64px rgba(11, 19, 43, 0.15), 0 4px 16px rgba(0,0,0,0.06)',
        position: 'relative',
        zIndex: 1,
        border: '1px solid #E5E7EB'
      }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '24px' }}>
          <BrandLogo theme="dark" href="" height={32} />
        </div>

        <Suspense fallback={
          <div style={{ textAlign: 'center', padding: '32px 0' }}>
            <Loader size={32} style={{ animation: 'spin 1s linear infinite', color: '#FF8A00' }} />
          </div>
        }>
          <ResetPasswordForm />
        </Suspense>
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

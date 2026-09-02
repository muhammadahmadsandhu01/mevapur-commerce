'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Lock, Mail, CheckCircle, ShieldCheck, KeyRound, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useAuthStore } from '@/store/authStore';

import BrandLogo from '@/components/brand/BrandLogo';
import { branding } from '@/config/branding';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const message = searchParams.get('message');
  const successMessage = message === 'changed' ? 'Password changed. Sign in again.' : null;
  const { login, verifyMfa } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [formData, setFormData] = useState({
    email: '',
    password: ''
  });

  const [mfaState, setMfaState] = useState({
    required: false,
    token: '',
    code: '',
    useRecoveryCode: false,
    recoveryCode: ''
  });

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const result = await login(formData.email, formData.password);

    if (result.success) {
      if (result.mfaRequired && result.mfaToken) {
        setMfaState({
          required: true,
          token: result.mfaToken,
          code: '',
          useRecoveryCode: false,
          recoveryCode: ''
        });
      } else {
        router.push('/');
      }
    } else {
      setError(result.message);
    }

    setLoading(false);
  };

  const handleMfaSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const result = await verifyMfa(
      mfaState.token,
      mfaState.useRecoveryCode ? undefined : mfaState.code,
      mfaState.useRecoveryCode ? mfaState.recoveryCode : undefined
    );

    if (result.success) {
      router.push('/');
    } else {
      setError(result.message);
    }

    setLoading(false);
  };

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

      <div style={{
        backgroundColor: 'white',
        borderRadius: '20px',
        padding: '48px',
        maxWidth: '420px',
        width: '100%',
        boxShadow: '0 24px 64px rgba(11, 19, 43, 0.15), 0 4px 16px rgba(0,0,0,0.06)',
        position: 'relative',
        zIndex: 1,
        border: '1px solid #E5E7EB'
      }}>
        {/* Logo — centered */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '24px' }}>
          <BrandLogo theme="dark" href="" height={32} />
        </div>

        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <h1 style={{
            fontSize: '24px',
            fontWeight: '800',
            color: '#0B132B',
            marginBottom: '6px',
            letterSpacing: '-0.02em',
            margin: '0 0 6px'
          }}>
            {mfaState.required ? 'Two-Factor Challenge' : 'Admin Login'}
          </h1>
          <p style={{ color: '#6B7280', fontSize: '14px', margin: 0 }}>
            {mfaState.required
              ? 'Enter the 6-digit code from your authenticator app'
              : `${branding.siteName} Administration Panel`}
          </p>
        </div>

        {successMessage && !mfaState.required && (
          <div
            role="status"
            style={{
              backgroundColor: '#ECFDF5',
              color: '#047857',
              padding: '12px 16px',
              borderRadius: '8px',
              fontSize: '13.5px',
              marginBottom: '20px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            <CheckCircle size={16} />
            {successMessage}
          </div>
        )}

        {error && (
          <div
            role="alert"
            style={{
              backgroundColor: '#FEF2F2',
              color: '#B91C1C',
              padding: '12px 16px',
              borderRadius: '8px',
              fontSize: '13.5px',
              marginBottom: '20px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            {error}
          </div>
        )}

        {!mfaState.required ? (
          <form onSubmit={handlePasswordSubmit}>
            <div style={{ marginBottom: '20px' }}>
              <label
                htmlFor="admin-login-email"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: '13.5px',
                  fontWeight: '600',
                  color: '#111827',
                  marginBottom: '8px'
                }}
              >
                <Mail size={15} color="#6B7280" />
                Email Address
              </label>
              <input
                id="admin-login-email"
                type="email"
                required
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="admin@mevapur.com"
                style={{
                  width: '100%',
                  padding: '13px 14px',
                  border: '1.5px solid #E5E7EB',
                  borderRadius: '10px',
                  fontSize: '14px',
                  outline: 'none',
                  backgroundColor: '#FFFFFF',
                  color: '#111827',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            <div style={{ marginBottom: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <label
                  htmlFor="admin-login-password"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '13.5px',
                    fontWeight: '600',
                    color: '#111827'
                  }}
                >
                  <Lock size={15} color="#6B7280" />
                  Password
                </label>
                <Link
                  href="/forgot-password"
                  style={{
                    fontSize: '12.5px',
                    color: '#B45309',
                    textDecoration: 'none',
                    fontWeight: '600'
                  }}
                >
                  Forgot Password?
                </Link>
              </div>
              <input
                id="admin-login-password"
                type="password"
                required
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                placeholder="••••••••"
                style={{
                  width: '100%',
                  padding: '13px 14px',
                  border: '1.5px solid #E5E7EB',
                  borderRadius: '10px',
                  fontSize: '14px',
                  outline: 'none',
                  backgroundColor: '#FFFFFF',
                  color: '#111827',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%',
                padding: '14px',
                backgroundColor: '#FF8A00',
                color: '#0B132B',
                border: 'none',
                borderRadius: '10px',
                fontSize: '15px',
                fontWeight: '700',
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.8 : 1,
                boxShadow: '0 4px 12px rgba(255, 138, 0, 0.25)'
              }}
            >
              {loading ? 'Authenticating...' : 'Sign In to Admin'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleMfaSubmit}>
            {!mfaState.useRecoveryCode ? (
              <div style={{ marginBottom: '24px' }}>
                <label
                  htmlFor="mfa-totp-code"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '13.5px',
                    fontWeight: '600',
                    color: '#111827',
                    marginBottom: '8px'
                  }}
                >
                  <ShieldCheck size={16} color="#FF8A00" />
                  Authenticator Code
                </label>
                <input
                  id="mfa-totp-code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]*"
                  maxLength={6}
                  required
                  autoFocus
                  value={mfaState.code}
                  onChange={(e) => setMfaState({ ...mfaState, code: e.target.value.replace(/\D/g, '') })}
                  placeholder="000000"
                  style={{
                    width: '100%',
                    padding: '14px',
                    border: '1.5px solid #E5E7EB',
                    borderRadius: '10px',
                    fontSize: '24px',
                    letterSpacing: '8px',
                    textAlign: 'center',
                    outline: 'none',
                    backgroundColor: '#FFFFFF',
                    color: '#111827',
                    boxSizing: 'border-box'
                  }}
                />
              </div>
            ) : (
              <div style={{ marginBottom: '24px' }}>
                <label
                  htmlFor="mfa-recovery-code"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '13.5px',
                    fontWeight: '600',
                    color: '#111827',
                    marginBottom: '8px'
                  }}
                >
                  <KeyRound size={16} color="#FF8A00" />
                  Backup Recovery Code
                </label>
                <input
                  id="mfa-recovery-code"
                  type="text"
                  required
                  autoFocus
                  value={mfaState.recoveryCode}
                  onChange={(e) => setMfaState({ ...mfaState, recoveryCode: e.target.value.toUpperCase() })}
                  placeholder="XXXXX-XXXXX"
                  style={{
                    width: '100%',
                    padding: '14px',
                    border: '1.5px solid #E5E7EB',
                    borderRadius: '10px',
                    fontSize: '16px',
                    letterSpacing: '2px',
                    textAlign: 'center',
                    outline: 'none',
                    backgroundColor: '#FFFFFF',
                    color: '#111827',
                    boxSizing: 'border-box'
                  }}
                />
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%',
                padding: '14px',
                backgroundColor: '#FF8A00',
                color: '#0B132B',
                border: 'none',
                borderRadius: '10px',
                fontSize: '15px',
                fontWeight: '700',
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.8 : 1,
                boxShadow: '0 4px 12px rgba(255, 138, 0, 0.25)',
                marginBottom: '16px'
              }}
            >
              {loading ? 'Verifying...' : 'Verify & Continue'}
            </button>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button
                type="button"
                onClick={() => setMfaState({ ...mfaState, required: false, token: '' })}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#6B7280',
                  fontSize: '13px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                <ArrowLeft size={14} /> Back
              </button>

              <button
                type="button"
                onClick={() => setMfaState({ ...mfaState, useRecoveryCode: !mfaState.useRecoveryCode })}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#B45309',
                  fontSize: '13px',
                  fontWeight: '600',
                  cursor: 'pointer'
                }}
              >
                {mfaState.useRecoveryCode ? 'Use Authenticator App' : 'Use Recovery Code'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#F7F7F5' }}>
        Loading...
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}

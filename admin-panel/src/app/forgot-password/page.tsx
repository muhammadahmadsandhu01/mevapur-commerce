'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Mail, ArrowLeft, CheckCircle, Loader, AlertCircle, ArrowRight, ShieldAlert, Terminal } from 'lucide-react';
import BrandLogo from '@/components/brand/BrandLogo';
import { branding } from '@/config/branding';
import { authHttp } from '@/lib/authSession';

export default function AdminForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [showCliInfo, setShowCliInfo] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const trimmed = email.trim().toLowerCase();
    if (!trimmed) {
      setError('Admin email address is required');
      return;
    }

    if (!/\S+@\S+\.\S+/.test(trimmed)) {
      setError('Please enter a valid email address');
      return;
    }

    setLoading(true);
    try {
      await authHttp.post('/auth/forgot-password', { email: trimmed });
      setSuccess(true);
    } catch {
      // Security best practice: do not reveal whether account exists
      setSuccess(true);
    } finally {
      setLoading(false);
    }
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

      {/* Back to Login */}
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

        {!success ? (
          <>
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
                <Mail size={28} />
              </div>
              <h1 style={{ fontSize: '22px', fontWeight: '800', color: '#0B132B', margin: '0 0 6px' }}>
                Recover Admin Account
              </h1>
              <p style={{ color: '#6B7280', fontSize: '13.5px', margin: 0, lineHeight: '1.5' }}>
                Enter your registered administrator email to receive password reset instructions.
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
                  htmlFor="admin-recovery-email"
                  style={{ display: 'block', fontSize: '13.5px', fontWeight: '600', color: '#111827', marginBottom: '8px' }}
                >
                  Administrator Email
                </label>
                <input
                  id="admin-recovery-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (error) setError('');
                  }}
                  placeholder="admin@harzaar.com"
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
                    Sending Instructions...
                  </>
                ) : (
                  <>
                    Send Reset Instructions
                    <ArrowRight size={18} />
                  </>
                )}
              </button>
            </form>

            <div style={{ marginTop: '24px', paddingTop: '20px', borderTop: '1px solid #F3F4F6' }}>
              <button
                type="button"
                onClick={() => setShowCliInfo(!showCliInfo)}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: '600',
                  color: '#4B5563',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <Terminal size={15} />
                {showCliInfo ? 'Hide emergency CLI runbook' : 'Emergency Super Admin recovery?'}
              </button>

              {showCliInfo && (
                <div style={{
                  marginTop: '12px',
                  padding: '14px',
                  backgroundColor: '#F8FAFC',
                  borderRadius: '10px',
                  border: '1px solid #E2E8F0',
                  fontSize: '12.5px',
                  color: '#334155',
                  lineHeight: '1.55'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: '700', color: '#0F172A', marginBottom: '6px' }}>
                    <ShieldAlert size={14} color="#D97706" />
                    Production CLI Recovery Procedure
                  </div>
                  <p style={{ margin: '0 0 6px' }}>
                    If email delivery is unavailable or all Super Admin credentials are lost, execute the authenticated recovery script directly from the approved backend production environment:
                  </p>
                  <code style={{ display: 'block', backgroundColor: '#0B132B', color: '#38BDF8', padding: '8px 10px', borderRadius: '6px', fontSize: '11.5px', fontFamily: 'monospace' }}>
                    npm run recover:initial-admin-password
                  </code>
                </div>
              )}
            </div>
          </>
        ) : (
          <div style={{ textAlign: 'center', padding: '12px 0' }}>
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
              Check Your Inbox
            </h2>
            <p style={{ fontSize: '14px', color: '#6B7280', lineHeight: '1.6', marginBottom: '24px' }}>
              If an administrator account exists for <strong style={{ color: '#111827' }}>{email}</strong>, a secure password reset link has been dispatched.
            </p>

            <div style={{
              padding: '14px',
              backgroundColor: '#FEF3C7',
              borderRadius: '10px',
              border: '1px solid #F59E0B',
              fontSize: '12.5px',
              color: '#78350F',
              textAlign: 'left',
              marginBottom: '24px'
            }}>
              <strong>Security Notice:</strong> The reset link expires in 1 hour. Follow the link to establish a new password compliant with enterprise security standards.
            </div>

            <Link
              href="/login"
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
                textAlign: 'center',
                boxShadow: '0 4px 12px rgba(255,138,0,0.3)'
              }}
            >
              Return to Login
            </Link>
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

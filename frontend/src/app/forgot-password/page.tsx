'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Mail, ArrowLeft, CheckCircle, Loader, AlertCircle, ArrowRight } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import Toast from '@/components/Toast';

export default function ForgotPasswordPage() {
  const router = useRouter();
  const { forgotPassword } = useAuthStore();

  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email.trim()) {
      setError('Email is required');
      return;
    }

    if (!/\S+@\S+\.\S+/.test(email)) {
      setError('Please enter a valid email');
      return;
    }

    setLoading(true);

    try {
      const result = await forgotPassword(email);

      if (result.success) {
        setSuccess(true);
        setToast({ message: '✅ ' + result.message, type: 'success' });
      } else {
        setError(result.message);
        setToast({ message: '❌ ' + result.message, type: 'error' });
      }
    } catch (error) {
      setToast({ message: '❌ Something went wrong', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#F8FAFC', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      
      {/* Back Button */}
      <Link href="/login" style={{ 
        position: 'fixed', top: '20px', left: '20px',
        display: 'flex', alignItems: 'center', gap: '8px',
        color: '#0F766E', textDecoration: 'none', fontWeight: '600',
        fontSize: '14px', padding: '10px 16px',
        backgroundColor: 'white', borderRadius: '10px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
        transition: 'all 0.2s'
      }}
        onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#F0FDFA'; e.currentTarget.style.transform = 'translateX(-4px)'; }}
        onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'white'; e.currentTarget.style.transform = 'translateX(0)'; }}
      >
        <ArrowLeft size={16} /> Back to Login
      </Link>

      <div style={{ 
        width: '100%', maxWidth: '480px',
        backgroundColor: 'white', borderRadius: '24px',
        boxShadow: '0 20px 60px rgba(0,0,0,0.1)',
        padding: '48px 40px',
        textAlign: 'center'
      }}>
        
        {!success ? (
          <>
            {/* Icon */}
            <div style={{ 
              width: '80px', height: '80px', borderRadius: '50%',
              backgroundColor: '#FEF3C7', margin: '0 auto 24px',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <Mail size={36} color="#F59E0B" />
            </div>

            <h1 style={{ fontSize: '28px', fontWeight: '800', color: '#111827', marginBottom: '12px' }}>
              Forgot Password?
            </h1>
            <p style={{ fontSize: '15px', color: '#6B7280', marginBottom: '32px', lineHeight: '1.6' }}>
              No worries! Enter your email address and we'll send you a link to reset your password.
            </p>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '8px', textAlign: 'left' }}>
                  Email Address
                </label>
                <div style={{ position: 'relative' }}>
                  <Mail size={18} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: error ? '#EF4444' : '#9CA3AF' }} />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (error) setError('');
                    }}
                    placeholder="you@example.com"
                    style={{
                      width: '100%', padding: '14px 14px 14px 44px',
                      borderRadius: '10px',
                      border: `2px solid ${error ? '#EF4444' : '#E5E7EB'}`,
                      fontSize: '14px', outline: 'none',
                      backgroundColor: '#F8FAFC'
                    }}
                  />
                </div>
                {error && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '6px', fontSize: '12px', color: '#EF4444', fontWeight: '500' }}>
                    <AlertCircle size={12} /> {error}
                  </div>
                )}
              </div>

              <button
                type="submit"
                disabled={loading}
                style={{
                  width: '100%', padding: '14px',
                  backgroundColor: loading ? '#9CA3AF' : '#0F766E',
                  color: 'white', border: 'none',
                  borderRadius: '10px', fontSize: '15px', fontWeight: '700',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
                  boxShadow: loading ? 'none' : '0 4px 12px rgba(15,118,110,0.3)',
                  transition: 'all 0.3s'
                }}
              >
                {loading ? (
                  <>
                    <Loader size={18} style={{ animation: 'spin 1s linear infinite' }} />
                    Sending...
                  </>
                ) : (
                  <>
                    Send Reset Link
                    <ArrowRight size={18} />
                  </>
                )}
              </button>

              <div style={{ fontSize: '14px', color: '#6B7280' }}>
                Remember your password?{' '}
                <Link href="/login" style={{ color: '#0F766E', textDecoration: 'none', fontWeight: '700' }}>
                  Sign In
                </Link>
              </div>
            </form>
          </>
        ) : (
          <>
            {/* Success State */}
            <div style={{ 
              width: '80px', height: '80px', borderRadius: '50%',
              backgroundColor: '#D1FAE5', margin: '0 auto 24px',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <CheckCircle size={40} color="#0F766E" />
            </div>

            <h1 style={{ fontSize: '28px', fontWeight: '800', color: '#111827', marginBottom: '12px' }}>
              Check Your Email
            </h1>
            <p style={{ fontSize: '15px', color: '#6B7280', marginBottom: '32px', lineHeight: '1.6' }}>
              We've sent a password reset link to{' '}
              <strong style={{ color: '#0F766E' }}>{email}</strong>.
              <br /><br />
              Please check your inbox and follow the instructions.
            </p>

            <div style={{ 
              padding: '16px', backgroundColor: '#FEF3C7', borderRadius: '10px',
              border: '1px solid #F59E0B', marginBottom: '24px',
              fontSize: '13px', color: '#78350F', textAlign: 'left'
            }}>
              <strong>💡 Tip:</strong> If you don't see the email, check your spam folder or click below to resend.
            </div>

            <button
              onClick={() => { setSuccess(false); setEmail(''); }}
              style={{
                width: '100%', padding: '14px',
                backgroundColor: 'white', color: '#0F766E',
                border: '2px solid #0F766E', borderRadius: '10px',
                fontSize: '15px', fontWeight: '700', cursor: 'pointer',
                marginBottom: '12px',
                transition: 'all 0.3s'
              }}
              onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#F0FDFA'; }}
              onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'white'; }}
            >
              Resend Email
            </button>

            <Link href="/login" style={{
              display: 'block', width: '100%', padding: '14px',
              backgroundColor: '#0F766E', color: 'white',
              borderRadius: '10px', fontSize: '15px', fontWeight: '700',
              textDecoration: 'none', textAlign: 'center',
              boxShadow: '0 4px 12px rgba(15,118,110,0.3)',
              transition: 'all 0.3s'
            }}
              onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#115E59'; }}
              onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#0F766E'; }}
            >
              Back to Login
            </Link>
          </>
        )}
      </div>

      {/* Toast */}
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
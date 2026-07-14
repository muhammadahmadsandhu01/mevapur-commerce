'use client';
export const dynamic = 'force-dynamic';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Mail, Lock, Eye, EyeOff, ArrowLeft, CheckCircle, Loader, AlertCircle } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import Toast from '@/components/Toast';

// ✅ Inner component with useSearchParams() - wrapped in Suspense
function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirect') || '/';
  const { login } = useAuthStore();

  const [formData, setFormData] = useState({
    email: '',
    password: '',
    rememberMe: false
  });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  const validate = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = 'Please enter a valid email';
    }

    if (!formData.password) {
      newErrors.password = 'Password is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validate()) return;

    setLoading(true);
    setErrors({});

    try {
      const result = await login(formData.email, formData.password, formData.rememberMe);

      if (result.success) {
        setToast({ message: '✅ ' + result.message, type: 'success' });
        setTimeout(() => router.push(redirectTo), 1500);
      } else {
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
      <Link href="/" style={{ 
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
        <ArrowLeft size={16} /> Back to Home
      </Link>

      <div style={{ 
        width: '100%', maxWidth: '1000px',
        backgroundColor: 'white', borderRadius: '24px',
        boxShadow: '0 20px 60px rgba(0,0,0,0.1)',
        overflow: 'hidden',
        display: 'grid', gridTemplateColumns: '1fr 1fr',
        minHeight: '600px'
      }}>
        
        {/* Left Side - Branding */}
        <div style={{ 
          background: 'linear-gradient(135deg, #0F766E 0%, #115E59 100%)',
          padding: '60px 40px',
          color: 'white',
          display: 'flex', flexDirection: 'column', justifyContent: 'center',
          position: 'relative', overflow: 'hidden'
        }}>
          {/* Decorative circles */}
          <div style={{ position: 'absolute', top: '-50px', right: '-50px', width: '200px', height: '200px', borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.05)' }} />
          <div style={{ position: 'absolute', bottom: '-80px', left: '-80px', width: '300px', height: '300px', borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.05)' }} />

          <div style={{ position: 'relative', zIndex: 1 }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>🌰</div>
            <h1 style={{ fontSize: '36px', fontWeight: '800', marginBottom: '16px', lineHeight: '1.2' }}>
              Welcome Back!
            </h1>
            <p style={{ fontSize: '16px', opacity: '0.9', marginBottom: '40px', lineHeight: '1.6' }}>
              Sign in to access your orders, wishlist, and exclusive member benefits.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {[
                { icon: '🚚', title: 'Fast Delivery', desc: 'Track your orders in real-time' },
                { icon: '', title: 'Wishlist', desc: 'Save your favorite products' },
                { icon: '🎁', title: 'Exclusive Offers', desc: 'Members-only discounts' }
              ].map((feature, idx) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <div style={{ 
                    width: '48px', height: '48px', borderRadius: '12px',
                    backgroundColor: 'rgba(255,255,255,0.15)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '24px', flexShrink: 0
                  }}>
                    {feature.icon}
                  </div>
                  <div>
                    <div style={{ fontWeight: '700', fontSize: '15px', marginBottom: '2px' }}>{feature.title}</div>
                    <div style={{ fontSize: '13px', opacity: '0.85' }}>{feature.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Side - Form */}
        <div style={{ padding: '60px 40px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ marginBottom: '32px' }}>
            <h2 style={{ fontSize: '28px', fontWeight: '800', color: '#111827', marginBottom: '8px' }}>
              Sign In
            </h2>
            <p style={{ fontSize: '14px', color: '#6B7280' }}>
              Enter your credentials to access your account
            </p>
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            
            {/* Email Field */}
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '8px' }}>
                Email Address
              </label>
              <div style={{ position: 'relative' }}>
                <Mail size={18} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: errors.email ? '#EF4444' : '#9CA3AF' }} />
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => {
                    setFormData({ ...formData, email: e.target.value });
                    if (errors.email) setErrors({ ...errors, email: '' });
                  }}
                  placeholder="you@example.com"
                  style={{
                    width: '100%', padding: '14px 14px 14px 44px',
                    borderRadius: '10px',
                    border: `2px solid ${errors.email ? '#EF4444' : '#E5E7EB'}`,
                    fontSize: '14px', outline: 'none',
                    transition: 'all 0.2s',
                    backgroundColor: '#F8FAFC'
                  }}
                  onFocus={e => { if (!errors.email) e.currentTarget.style.borderColor = '#0F766E'; }}
                  onBlur={e => { if (!errors.email) e.currentTarget.style.borderColor = '#E5E7EB'; }}
                />
              </div>
              {errors.email && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '6px', fontSize: '12px', color: '#EF4444', fontWeight: '500' }}>
                  <AlertCircle size={12} /> {errors.email}
                </div>
              )}
            </div>

            {/* Password Field */}
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '8px' }}>
                Password
              </label>
              <div style={{ position: 'relative' }}>
                <Lock size={18} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: errors.password ? '#EF4444' : '#9CA3AF' }} />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={formData.password}
                  onChange={(e) => {
                    setFormData({ ...formData, password: e.target.value });
                    if (errors.password) setErrors({ ...errors, password: '' });
                  }}
                  placeholder="Enter your password"
                  style={{
                    width: '100%', padding: '14px 44px 14px 44px',
                    borderRadius: '10px',
                    border: `2px solid ${errors.password ? '#EF4444' : '#E5E7EB'}`,
                    fontSize: '14px', outline: 'none',
                    transition: 'all 0.2s',
                    backgroundColor: '#F8FAFC'
                  }}
                  onFocus={e => { if (!errors.password) e.currentTarget.style.borderColor = '#0F766E'; }}
                  onBlur={e => { if (!errors.password) e.currentTarget.style.borderColor = '#E5E7EB'; }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: '#6B7280', display: 'flex', alignItems: 'center'
                  }}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              {errors.password && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '6px', fontSize: '12px', color: '#EF4444', fontWeight: '500' }}>
                  <AlertCircle size={12} /> {errors.password}
                </div>
              )}
            </div>

            {/* Remember Me & Forgot Password */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '14px', color: '#374151' }}>
                <input
                  type="checkbox"
                  checked={formData.rememberMe}
                  onChange={(e) => setFormData({ ...formData, rememberMe: e.target.checked })}
                  style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: '#0F766E' }}
                />
                Remember me
              </label>
              <Link href="/forgot-password" style={{ fontSize: '14px', color: '#0F766E', textDecoration: 'none', fontWeight: '600' }}>
                Forgot password?
              </Link>
            </div>

            {/* Submit Button */}
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
              onMouseEnter={e => { if (!loading) { e.currentTarget.style.backgroundColor = '#115E59'; e.currentTarget.style.transform = 'translateY(-2px)'; } }}
              onMouseLeave={e => { if (!loading) { e.currentTarget.style.backgroundColor = '#0F766E'; e.currentTarget.style.transform = 'translateY(0)'; } }}
            >
              {loading ? (
                <>
                  <Loader size={18} style={{ animation: 'spin 1s linear infinite' }} />
                  Signing In...
                </>
              ) : (
                <>
                  <Lock size={18} />
                  Sign In Securely
                </>
              )}
            </button>

            {/* Divider */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: '8px 0' }}>
              <div style={{ flex: 1, height: '1px', backgroundColor: '#E5E7EB' }} />
              <span style={{ fontSize: '12px', color: '#9CA3AF' }}>OR</span>
              <div style={{ flex: 1, height: '1px', backgroundColor: '#E5E7EB' }} />
            </div>

            {/* Social Login Buttons */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <button type="button" style={{
                padding: '12px', backgroundColor: 'white', color: '#374151',
                border: '2px solid #E5E7EB', borderRadius: '10px',
                cursor: 'pointer', fontSize: '14px', fontWeight: '600',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                transition: 'all 0.2s'
              }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = '#0F766E'; e.currentTarget.style.backgroundColor = '#F0FDFA'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = '#E5E7EB'; e.currentTarget.style.backgroundColor = 'white'; }}
              >
                🔵 Google
              </button>
              <button type="button" style={{
                padding: '12px', backgroundColor: 'white', color: '#374151',
                border: '2px solid #E5E7EB', borderRadius: '10px',
                cursor: 'pointer', fontSize: '14px', fontWeight: '600',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                transition: 'all 0.2s'
              }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = '#0F766E'; e.currentTarget.style.backgroundColor = '#F0FDFA'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = '#E5E7EB'; e.currentTarget.style.backgroundColor = 'white'; }}
              >
                 Facebook
              </button>
            </div>

            {/* Register Link */}
            <div style={{ textAlign: 'center', marginTop: '8px', fontSize: '14px', color: '#6B7280' }}>
              Don't have an account?{' '}
              <Link href="/register" style={{ color: '#0F766E', textDecoration: 'none', fontWeight: '700' }}>
                Create Account
              </Link>
            </div>

            {/* Demo Credentials */}
            <div style={{ 
              marginTop: '16px', padding: '16px',
              backgroundColor: '#FEF3C7', borderRadius: '10px',
              border: '1px solid #F59E0B'
            }}>
              <div style={{ fontSize: '12px', fontWeight: '700', color: '#92400E', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <CheckCircle size={14} /> Demo Credentials
              </div>
              <div style={{ fontSize: '12px', color: '#78350F', lineHeight: '1.6' }}>
                <strong>Email:</strong> ahmed@mevapur.com<br />
                <strong>Password:</strong> Ahmed123!
              </div>
            </div>

          </form>
        </div>
      </div>

      {/* Toast */}
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @media (max-width: 768px) {
          div[style*="grid-template-columns: 1fr 1fr"] {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}

// ✅ Main default export with Suspense boundary
export default function LoginPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', backgroundColor: '#F8FAFC', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: '60px',
            height: '60px',
            border: '5px solid #0F766E',
            borderTop: '5px solid transparent',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            margin: '0 auto 20px'
          }}></div>
          <p style={{ color: '#6B7280' }}>Loading...</p>
        </div>
      </div>
    }>
      <LoginContent />
    </Suspense>
  );
}
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Mail, Lock, Eye, EyeOff, ArrowLeft, CheckCircle, Loader, AlertCircle } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import Toast from '@/components/Toast';

export default function LoginPage() {
  const router = useRouter();
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
        setTimeout(() => router.push('/'), 1500);
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
      <Link href="/" style={{ position: 'fixed', top: '20px', left: '20px', display: 'flex', alignItems: 'center', gap: '8px', color: '#0F766E', textDecoration: 'none', fontWeight: '600', fontSize: '14px', padding: '10px 16px', backgroundColor: 'white', borderRadius: '10px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
        <ArrowLeft size={16} /> Back to Home
      </Link>

      <div style={{ width: '100%', maxWidth: '1000px', backgroundColor: 'white', borderRadius: '24px', boxShadow: '0 20px 60px rgba(0,0,0,0.1)', overflow: 'hidden', display: 'grid', gridTemplateColumns: '1fr 1fr', minHeight: '600px' }}>
        
        <div style={{ background: 'linear-gradient(135deg, #0F766E 0%, #115E59 100%)', padding: '60px 40px', color: 'white', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>🌰</div>
          <h1 style={{ fontSize: '36px', fontWeight: '800', marginBottom: '16px' }}>Welcome Back!</h1>
          <p style={{ fontSize: '16px', opacity: '0.9', marginBottom: '40px' }}>Sign in to access your account</p>
        </div>

        <div style={{ padding: '60px 40px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <h2 style={{ fontSize: '28px', fontWeight: '800', color: '#111827', marginBottom: '8px' }}>Sign In</h2>
          
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '8px' }}>Email</label>
              <input type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} placeholder="ahmed@mevapur.com" style={{ width: '100%', padding: '14px', borderRadius: '10px', border: '2px solid #E5E7EB' }} />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '8px' }}>Password</label>
              <input type={showPassword ? 'text' : 'password'} value={formData.password} onChange={(e) => setFormData({ ...formData, password: e.target.value })} placeholder="Enter password" style={{ width: '100%', padding: '14px', borderRadius: '10px', border: '2px solid #E5E7EB' }} />
            </div>

            <button type="submit" disabled={loading} style={{ width: '100%', padding: '14px', backgroundColor: loading ? '#9CA3AF' : '#0F766E', color: 'white', border: 'none', borderRadius: '10px', fontWeight: '700', cursor: loading ? 'not-allowed' : 'pointer' }}>
              {loading ? 'Signing In...' : 'Sign In'}
            </button>
          </form>

          <div style={{ marginTop: '16px', padding: '16px', backgroundColor: '#FEF3C7', borderRadius: '10px', border: '1px solid #F59E0B' }}>
            <div style={{ fontSize: '12px', fontWeight: '700', color: '#92400E' }}>Demo:</div>
            <div style={{ fontSize: '12px', color: '#78350F' }}>ahmed@mevapur.com / Ahmed123!</div>
          </div>
        </div>
      </div>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
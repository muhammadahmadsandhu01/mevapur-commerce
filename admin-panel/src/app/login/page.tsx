'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { Lock, Mail } from 'lucide-react';
import BrandLogo from '@/components/brand/BrandLogo';
import { branding } from '@/config/branding';

export default function AdminLogin() {
  const router = useRouter();
  const { login } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  const [formData, setFormData] = useState({
    email: '',
    password: ''
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const result = await login(formData.email, formData.password);

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
            Admin Login
          </h1>
          <p style={{ color: '#6B7280', fontSize: '14px', margin: 0 }}>
            {branding.siteName} Administration Panel
          </p>
        </div>

        {error && (
          <div style={{
            backgroundColor: '#FEF2F2',
            color: '#DC2626',
            padding: '12px 14px',
            borderRadius: '10px',
            marginBottom: '20px',
            fontSize: '13.5px',
            fontWeight: '600',
            border: '1px solid #FECACA',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '20px' }}>
            <label style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '13.5px',
              fontWeight: '600',
              color: '#111827',
              marginBottom: '8px'
            }}>
              <Mail size={15} color="#6B7280" />
              Email Address
            </label>
            <input
              type="email"
              required
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder="admin@harzaar.com"
              style={{
                width: '100%',
                padding: '13px 14px',
                border: '1.5px solid #E5E7EB',
                borderRadius: '10px',
                fontSize: '14px',
                outline: 'none',
                transition: 'border-color 0.15s, box-shadow 0.15s',
                backgroundColor: '#FFFFFF',
                color: '#111827',
                boxSizing: 'border-box'
              }}
              onFocus={e => {
                e.currentTarget.style.borderColor = '#FF8A00';
                e.currentTarget.style.boxShadow = '0 0 0 3px rgba(255, 138, 0, 0.12)';
                e.currentTarget.style.backgroundColor = '#FFFFFF';
              }}
              onBlur={e => {
                e.currentTarget.style.borderColor = '#E5E7EB';
                e.currentTarget.style.boxShadow = 'none';
                e.currentTarget.style.backgroundColor = '#FFFFFF';
              }}
            />
          </div>

          <div style={{ marginBottom: '28px' }}>
            <label style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '13.5px',
              fontWeight: '600',
              color: '#111827',
              marginBottom: '8px'
            }}>
              <Lock size={15} color="#6B7280" />
              Password
            </label>
            <input
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
                transition: 'border-color 0.15s, box-shadow 0.15s',
                backgroundColor: '#FFFFFF',
                color: '#111827',
                boxSizing: 'border-box'
              }}
              onFocus={e => {
                e.currentTarget.style.borderColor = '#FF8A00';
                e.currentTarget.style.boxShadow = '0 0 0 3px rgba(255, 138, 0, 0.12)';
                e.currentTarget.style.backgroundColor = '#FFFFFF';
              }}
              onBlur={e => {
                e.currentTarget.style.borderColor = '#E5E7EB';
                e.currentTarget.style.boxShadow = 'none';
                e.currentTarget.style.backgroundColor = '#FFFFFF';
              }}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '15px',
              backgroundColor: loading ? '#9CA3AF' : '#FF8A00',
              color: loading ? 'white' : '#0B132B',
              border: 'none',
              borderRadius: '12px',
              fontSize: '15px',
              fontWeight: '700',
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s ease',
              letterSpacing: '0.01em',
              boxShadow: loading ? 'none' : '0 4px 14px rgba(255, 138, 0, 0.35)'
            }}
            onMouseEnter={e => {
              if (!loading) {
                e.currentTarget.style.backgroundColor = '#e67d00';
                e.currentTarget.style.transform = 'translateY(-1px)';
                e.currentTarget.style.boxShadow = '0 6px 20px rgba(255, 138, 0, 0.45)';
              }
            }}
            onMouseLeave={e => {
              if (!loading) {
                e.currentTarget.style.backgroundColor = '#FF8A00';
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 4px 14px rgba(255, 138, 0, 0.35)';
              }
            }}
          >
            {loading ? 'Logging in…' : 'Login to Admin Panel'}
          </button>
        </form>
      </div>
    </div>
  );
}

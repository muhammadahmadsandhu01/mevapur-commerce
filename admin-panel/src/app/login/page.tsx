'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { Lock, Mail } from 'lucide-react';

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
      backgroundColor: '#F3F4F6',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px'
    }}>
      <div style={{
        backgroundColor: 'white',
        borderRadius: '20px',
        padding: '48px',
        maxWidth: '440px',
        width: '100%',
        boxShadow: '0 20px 60px rgba(0,0,0,0.1)'
      }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}></div>
          <h1 style={{ fontSize: '28px', fontWeight: '800', color: '#111827', marginBottom: '8px' }}>
            Admin Login
          </h1>
          <p style={{ color: '#6B7280', fontSize: '14px' }}>
            MevaPur Administration Panel
          </p>
        </div>

        {error && (
          <div style={{
            backgroundColor: '#FEE2E2',
            color: '#DC2626',
            padding: '12px',
            borderRadius: '8px',
            marginBottom: '20px',
            fontSize: '14px',
            fontWeight: '600'
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
              fontSize: '14px',
              fontWeight: '600',
              color: '#111827',
              marginBottom: '8px'
            }}>
              <Mail size={16} />
              Email Address
            </label>
            <input
              type="email"
              required
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder="admin@mevapur.com"
              style={{
                width: '100%',
                padding: '14px',
                border: '2px solid #E5E7EB',
                borderRadius: '10px',
                fontSize: '15px',
                outline: 'none'
              }}
              onFocus={e => e.currentTarget.style.borderColor = '#0F766E'}
              onBlur={e => e.currentTarget.style.borderColor = '#E5E7EB'}
            />
          </div>

          <div style={{ marginBottom: '24px' }}>
            <label style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '14px',
              fontWeight: '600',
              color: '#111827',
              marginBottom: '8px'
            }}>
              <Lock size={16} />
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
                padding: '14px',
                border: '2px solid #E5E7EB',
                borderRadius: '10px',
                fontSize: '15px',
                outline: 'none'
              }}
              onFocus={e => e.currentTarget.style.borderColor = '#0F766E'}
              onBlur={e => e.currentTarget.style.borderColor = '#E5E7EB'}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '16px',
              backgroundColor: loading ? '#9CA3AF' : '#0F766E',
              color: 'white',
              border: 'none',
              borderRadius: '12px',
              fontSize: '16px',
              fontWeight: '700',
              cursor: loading ? 'not-allowed' : 'pointer'
            }}
          >
            {loading ? 'Logging in...' : 'Login to Admin Panel'}
          </button>
        </form>

        <div style={{
          marginTop: '24px',
          padding: '16px',
          backgroundColor: '#F0FDFA',
          borderRadius: '10px',
          border: '1px solid #0F766E'
        }}>
          <p style={{ fontSize: '13px', color: '#0F766E', fontWeight: '600', marginBottom: '8px' }}>
            Demo Credentials:
          </p>
          <p style={{ fontSize: '12px', color: '#6B7280' }}>
            Email: admin@mevapur.com<br />
            Password: Admin123!
          </p>
        </div>
      </div>
    </div>
  );
}
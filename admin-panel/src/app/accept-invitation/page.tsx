'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Lock, User, Phone, CheckCircle, ShieldCheck } from 'lucide-react';
import api from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import { acceptAuthentication, type AuthPayload } from '@/lib/authSession';
import { User as UserType } from '@/types';
import BrandLogo from '@/components/brand/BrandLogo';
import { branding } from '@/config/branding';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';

function AcceptInvitationForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';

  const [formData, setFormData] = useState({
    fullName: '',
    phone: '',
    password: '',
    confirmPassword: ''
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(token ? '' : 'No invitation token found in URL.');

  const passwordValidation = {
    length: formData.password.length >= 8,
    upper: /[A-Z]/.test(formData.password),
    lower: /[a-z]/.test(formData.password),
    number: /[0-9]/.test(formData.password),
    special: /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(formData.password)
  };

  const isPasswordValid = Object.values(passwordValidation).every(Boolean);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) {
      setError('Invalid or missing invitation token.');
      return;
    }

    if (!isPasswordValid) {
      setError('Password does not meet the security requirements.');
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await api.post('/auth/accept-invitation', {
        token,
        fullName: formData.fullName,
        phone: formData.phone,
        password: formData.password
      });

      if (response.data?.success && response.data?.data) {
        const payload = acceptAuthentication(response.data.data as AuthPayload<UserType>);
        useAuthStore.setState({
          user: payload.user,
          token: payload.accessToken,
          isAuthenticated: true,
          isInitialized: true
        });
        router.push('/');
      } else {
        setError(response.data?.message || 'Failed to accept invitation');
      }
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      setError(axiosErr.response?.data?.message || 'Failed to accept invitation. The link may have expired.');
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
        padding: '44px 40px',
        maxWidth: '460px',
        width: '100%',
        boxShadow: '0 24px 64px rgba(11, 19, 43, 0.15), 0 4px 16px rgba(0,0,0,0.06)',
        position: 'relative',
        zIndex: 1,
        border: '1px solid #E5E7EB'
      }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '20px' }}>
          <BrandLogo theme="dark" href="" height={32} />
        </div>

        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <h1 style={{
            fontSize: '22px',
            fontWeight: '800',
            color: '#0B132B',
            marginBottom: '6px',
            letterSpacing: '-0.02em',
            margin: '0 0 6px'
          }}>
            Accept Staff Invitation
          </h1>
          <p style={{ color: '#6B7280', fontSize: '13.5px', margin: 0 }}>
            Set up your name and secure password to join {branding.siteName}
          </p>
        </div>

        {error && (
          <div style={{ marginBottom: '20px' }}>
            <Alert type="error">
              {error}
            </Alert>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '16px' }}>
            <label
              htmlFor="staff-full-name"
              style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: '600', color: '#111827', marginBottom: '6px' }}
            >
              <User size={14} color="#6B7280" /> Full Name
            </label>
            <input
              id="staff-full-name"
              type="text"
              required
              value={formData.fullName}
              onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
              placeholder="Your full legal name"
              style={{
                width: '100%',
                padding: '11px 13px',
                border: '1.5px solid #E5E7EB',
                borderRadius: '8px',
                fontSize: '13.5px',
                outline: 'none',
                boxSizing: 'border-box'
              }}
            />
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label
              htmlFor="staff-phone"
              style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: '600', color: '#111827', marginBottom: '6px' }}
            >
              <Phone size={14} color="#6B7280" /> Phone Number (Optional)
            </label>
            <input
              id="staff-phone"
              type="tel"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              placeholder="+92 300 1234567"
              style={{
                width: '100%',
                padding: '11px 13px',
                border: '1.5px solid #E5E7EB',
                borderRadius: '8px',
                fontSize: '13.5px',
                outline: 'none',
                boxSizing: 'border-box'
              }}
            />
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label
              htmlFor="staff-password"
              style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: '600', color: '#111827', marginBottom: '6px' }}
            >
              <Lock size={14} color="#6B7280" /> New Password
            </label>
            <input
              id="staff-password"
              type="password"
              required
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              placeholder="••••••••"
              style={{
                width: '100%',
                padding: '11px 13px',
                border: '1.5px solid #E5E7EB',
                borderRadius: '8px',
                fontSize: '13.5px',
                outline: 'none',
                boxSizing: 'border-box'
              }}
            />

            {/* Password strength checklist */}
            <div style={{ marginTop: '8px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px', fontSize: '11.5px' }}>
              <span style={{ color: passwordValidation.length ? '#059669' : '#9CA3AF', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <CheckCircle size={12} /> 8+ Characters
              </span>
              <span style={{ color: passwordValidation.upper ? '#059669' : '#9CA3AF', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <CheckCircle size={12} /> Uppercase letter
              </span>
              <span style={{ color: passwordValidation.lower ? '#059669' : '#9CA3AF', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <CheckCircle size={12} /> Lowercase letter
              </span>
              <span style={{ color: passwordValidation.number ? '#059669' : '#9CA3AF', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <CheckCircle size={12} /> Number (0-9)
              </span>
              <span style={{ color: passwordValidation.special ? '#059669' : '#9CA3AF', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <CheckCircle size={12} /> Special character
              </span>
            </div>
          </div>

          <div style={{ marginBottom: '24px' }}>
            <label
              htmlFor="staff-confirm-password"
              style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: '600', color: '#111827', marginBottom: '6px' }}
            >
              <ShieldCheck size={14} color="#6B7280" /> Confirm Password
            </label>
            <input
              id="staff-confirm-password"
              type="password"
              required
              value={formData.confirmPassword}
              onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
              placeholder="••••••••"
              style={{
                width: '100%',
                padding: '11px 13px',
                border: '1.5px solid #E5E7EB',
                borderRadius: '8px',
                fontSize: '13.5px',
                outline: 'none',
                boxSizing: 'border-box'
              }}
            />
          </div>

          <Button
            type="submit"
            variant="primary"
            size="lg"
            style={{ width: '100%', boxShadow: '0 4px 12px rgba(255, 138, 0, 0.25)' }}
            disabled={loading || !token}
            isLoading={loading}
          >
            {loading ? 'Activating Account...' : 'Complete Account Setup'}
          </Button>
        </form>
      </div>
    </div>
  );
}

export default function AcceptInvitationPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>Loading...</div>}>
      <AcceptInvitationForm />
    </Suspense>
  );
}

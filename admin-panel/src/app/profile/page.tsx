'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  User as UserIcon,
  Mail,
  Phone,
  Shield,
  Calendar,
  Save,
  CheckCircle,
  AlertCircle,
  Loader,
  Lock,
  Image as ImageIcon
} from 'lucide-react';
import api from '@/lib/api';
import { useAuthStore } from '@/store/authStore';

interface ProfileData {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  avatar: string;
  isVerified: boolean;
  createdAt: string;
}

export default function ProfilePage() {
  const { user } = useAuthStore();
  const [profile, setProfile] = useState<ProfileData>({
    id: '',
    fullName: '',
    email: '',
    phone: '',
    avatar: '',
    isVerified: true,
    createdAt: ''
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [phoneError, setPhoneError] = useState('');

  useEffect(() => {
    let mounted = true;
    async function loadProfile() {
      setLoading(true);
      try {
        const response = await api.get('/account/profile');
        if (response.data.success && mounted) {
          const p = response.data.data.profile;
          setProfile({
            id: p.id || user?.id || '',
            fullName: p.fullName || user?.fullName || '',
            email: p.email || user?.email || '',
            phone: p.phone || '',
            avatar: p.avatar || user?.avatar || '',
            isVerified: p.isVerified ?? true,
            createdAt: p.createdAt || ''
          });
        }
      } catch {
        if (mounted && user) {
          setProfile({
            id: user.id || '',
            fullName: user.fullName || '',
            email: user.email || '',
            phone: '',
            avatar: user.avatar || '',
            isVerified: true,
            createdAt: ''
          });
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }

    void loadProfile();
    return () => {
      mounted = false;
    };
  }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPhoneError('');
    setMessage(null);

    if (profile.phone && !/^03\d{9}$/.test(profile.phone)) {
      setPhoneError('Please enter a valid 11-digit Pakistani phone number (e.g. 03001234567)');
      return;
    }

    setSaving(true);
    try {
      const patchData: Record<string, string> = {
        fullName: profile.fullName.trim(),
        phone: profile.phone ? profile.phone.trim() : ''
      };
      if (profile.avatar && profile.avatar.trim()) {
        patchData.avatar = profile.avatar.trim();
      }

      const response = await api.patch('/account/profile', patchData);

      if (response.data.success) {
        const updated = response.data.data.profile;
        setProfile((prev) => ({
          ...prev,
          fullName: updated.fullName,
          phone: updated.phone || '',
          avatar: updated.avatar || ''
        }));

        useAuthStore.setState((state) => (state.user ? {
          user: {
            ...state.user,
            fullName: updated.fullName,
            avatar: updated.avatar || state.user.avatar
          }
        } : state));

        setMessage({ type: 'success', text: 'Profile updated successfully!' });
        setTimeout(() => setMessage(null), 4000);
      }
    } catch {
      setMessage({ type: 'error', text: 'Failed to update profile. Please try again.' });
      setTimeout(() => setMessage(null), 5000);
    } finally {
      setSaving(false);
    }
  };

  const initial = profile.fullName ? profile.fullName.charAt(0).toUpperCase() : 'A';
  const formattedDate = profile.createdAt
    ? new Date(profile.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
    : 'Active';

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto' }}>
      {/* Page Header */}
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ fontSize: '32px', fontWeight: '800', color: 'var(--text-primary)', marginBottom: '8px', letterSpacing: '-0.5px' }}>
          Admin Profile
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '15px' }}>
          Manage your personal account details and administrator preferences.
        </p>
      </div>

      {/* Toast Feedback Message */}
      {message && (
        <div
          role="alert"
          style={{
            padding: '16px',
            backgroundColor: message.type === 'success' ? 'rgba(22, 163, 74, 0.12)' : 'rgba(220, 38, 38, 0.1)',
            border: `1px solid ${message.type === 'success' ? '#16A34A' : '#DC2626'}`,
            borderRadius: '12px',
            marginBottom: '24px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            color: message.type === 'success' ? 'var(--success-text)' : 'var(--danger-text)'
          }}
        >
          {message.type === 'success' ? <CheckCircle size={20} /> : <AlertCircle size={20} />}
          <span style={{ fontWeight: '600', fontSize: '14px' }}>{message.text}</span>
        </div>
      )}

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}>
          <Loader size={40} style={{ animation: 'spin 1s linear infinite', color: '#FF8A00' }} />
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '24px' }}>
          {/* Identity Card */}
          <div style={{
            backgroundColor: 'var(--card-bg)',
            borderRadius: '16px',
            padding: '32px',
            border: '1px solid var(--border-color)',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center'
          }}>
            <div style={{
              width: '96px',
              height: '96px',
              borderRadius: '50%',
              backgroundColor: 'var(--primary)',
              color: '#0B132B',
              fontSize: '36px',
              fontWeight: '800',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '16px',
              boxShadow: '0 4px 14px rgba(255, 138, 0, 0.35)'
            }}>
              {initial}
            </div>

            <h2 style={{ fontSize: '20px', fontWeight: '800', color: 'var(--text-primary)', margin: '0 0 4px' }}>
              {profile.fullName || 'Admin User'}
            </h2>
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 12px',
              borderRadius: '20px',
              backgroundColor: 'rgba(255, 138, 0, 0.12)',
              color: '#B45309',
              fontSize: '12px',
              fontWeight: '700',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              marginBottom: '20px'
            }}>
              <Shield size={14} />
              {user?.role ? user.role.replace('_', ' ') : 'Administrator'}
            </div>

            <div style={{ width: '100%', borderTop: '1px solid var(--border-color)', paddingTop: '20px', display: 'flex', flexDirection: 'column', gap: '12px', textAlign: 'left' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                <Mail size={16} />
                <span style={{ color: 'var(--text-primary)', fontWeight: '500' }}>{profile.email}</span>
              </div>
              {profile.phone && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                  <Phone size={16} />
                  <span style={{ color: 'var(--text-primary)', fontWeight: '500' }}>{profile.phone}</span>
                </div>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                <Calendar size={16} />
                <span>Joined {formattedDate}</span>
              </div>
            </div>

            <div style={{ width: '100%', marginTop: '24px', paddingTop: '16px', borderTop: '1px solid var(--border-color)' }}>
              <Link
                href="/change-password"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  width: '100%',
                  padding: '12px',
                  borderRadius: '10px',
                  border: '1px solid var(--border-color)',
                  backgroundColor: 'var(--bg-primary)',
                  color: 'var(--text-primary)',
                  textDecoration: 'none',
                  fontSize: '14px',
                  fontWeight: '600',
                  transition: 'all 0.2s'
                }}
              >
                <Lock size={16} />
                Change Password
              </Link>
            </div>
          </div>

          {/* Edit Form */}
          <form
            onSubmit={handleSubmit}
            style={{
              backgroundColor: 'var(--card-bg)',
              borderRadius: '16px',
              padding: '32px',
              border: '1px solid var(--border-color)',
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
              display: 'flex',
              flexDirection: 'column',
              gap: '20px'
            }}
          >
            <h2 style={{ fontSize: '18px', fontWeight: '800', color: 'var(--text-primary)', margin: 0 }}>
              Edit Details
            </h2>

            <div>
              <label
                htmlFor="profile-fullName"
                style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' }}
              >
                <UserIcon size={16} />
                Full Name
              </label>
              <input
                id="profile-fullName"
                type="text"
                required
                minLength={3}
                maxLength={100}
                value={profile.fullName}
                onChange={(e) => setProfile({ ...profile, fullName: e.target.value })}
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  border: '1px solid var(--border-color)',
                  borderRadius: '10px',
                  fontSize: '14px',
                  outline: 'none',
                  backgroundColor: 'var(--input-bg)',
                  color: 'var(--text-primary)'
                }}
              />
            </div>

            <div>
              <label
                htmlFor="profile-email"
                style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' }}
              >
                <Mail size={16} />
                Email Address
              </label>
              <input
                id="profile-email"
                type="email"
                disabled
                value={profile.email}
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  border: '1px solid var(--border-color)',
                  borderRadius: '10px',
                  fontSize: '14px',
                  outline: 'none',
                  backgroundColor: 'var(--bg-primary)',
                  color: 'var(--text-secondary)',
                  cursor: 'not-allowed'
                }}
              />
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px', margin: '4px 0 0' }}>
                Primary login email cannot be edited from profile.
              </p>
            </div>

            <div>
              <label
                htmlFor="profile-phone"
                style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' }}
              >
                <Phone size={16} />
                Phone Number
              </label>
              <input
                id="profile-phone"
                type="tel"
                placeholder="03001234567"
                value={profile.phone}
                onChange={(e) => {
                  setProfile({ ...profile, phone: e.target.value });
                  if (phoneError) setPhoneError('');
                }}
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  border: phoneError ? '1px solid #DC2626' : '1px solid var(--border-color)',
                  borderRadius: '10px',
                  fontSize: '14px',
                  outline: 'none',
                  backgroundColor: 'var(--input-bg)',
                  color: 'var(--text-primary)'
                }}
              />
              {phoneError && (
                <p style={{ fontSize: '12px', color: 'var(--danger-text)', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <AlertCircle size={12} /> {phoneError}
                </p>
              )}
            </div>

            <div>
              <label
                htmlFor="profile-avatar"
                style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' }}
              >
                <ImageIcon size={16} />
                Avatar URL (Optional)
              </label>
              <input
                id="profile-avatar"
                type="url"
                placeholder="https://example.com/avatar.jpg"
                value={profile.avatar}
                onChange={(e) => setProfile({ ...profile, avatar: e.target.value })}
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  border: '1px solid var(--border-color)',
                  borderRadius: '10px',
                  fontSize: '14px',
                  outline: 'none',
                  backgroundColor: 'var(--input-bg)',
                  color: 'var(--text-primary)'
                }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '16px', borderTop: '1px solid var(--border-color)' }}>
              <button
                type="submit"
                disabled={saving}
                style={{
                  padding: '12px 24px',
                  backgroundColor: saving ? '#9CA3AF' : 'var(--primary)',
                  color: saving ? '#FFFFFF' : '#0B132B',
                  border: 'none',
                  borderRadius: '10px',
                  cursor: saving ? 'not-allowed' : 'pointer',
                  fontWeight: '700',
                  fontSize: '14px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  transition: 'all 0.2s'
                }}
              >
                {saving ? <Loader size={18} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={18} />}
                {saving ? 'Saving...' : 'Save Profile'}
              </button>
            </div>
          </form>
        </div>
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

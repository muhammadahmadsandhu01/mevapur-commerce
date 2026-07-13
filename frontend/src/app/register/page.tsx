'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Mail, Lock, Eye, EyeOff, ArrowLeft, User, Phone, CheckCircle, XCircle, Loader, AlertCircle, Shield } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import Toast from '@/components/Toast';

export default function RegisterPage() {
  const router = useRouter();
  const { register } = useAuthStore();

  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
    acceptTerms: false
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  // Password requirements check
  const passwordChecks = useMemo(() => ({
    length: formData.password.length >= 8,
    uppercase: /[A-Z]/.test(formData.password),
    lowercase: /[a-z]/.test(formData.password),
    number: /[0-9]/.test(formData.password),
    special: /[!@#$%^&*(),.?":{}|<>]/.test(formData.password)
  }), [formData.password]);

  // Password strength
  const passwordStrength = useMemo(() => {
    const score = Object.values(passwordChecks).filter(Boolean).length;
    if (score === 0) return { level: 'none', color: '#E5E7EB', label: '' };
    if (score <= 2) return { level: 'weak', color: '#EF4444', label: 'Weak' };
    if (score <= 3) return { level: 'medium', color: '#F59E0B', label: 'Medium' };
    if (score <= 4) return { level: 'strong', color: '#10B981', label: 'Strong' };
    return { level: 'very-strong', color: '#0F766E', label: 'Very Strong' };
  }, [passwordChecks]);

  const validate = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.fullName.trim()) {
      newErrors.fullName = 'Full name is required';
    } else if (formData.fullName.trim().length < 3) {
      newErrors.fullName = 'Name must be at least 3 characters';
    }

    if (!formData.email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = 'Please enter a valid email';
    }

    if (formData.phone && !/^03\d{9}$/.test(formData.phone.replace(/\s/g, ''))) {
      newErrors.phone = 'Enter valid Pakistani number (03XX-XXXXXXX)';
    }

    if (!formData.password) {
      newErrors.password = 'Password is required';
    } else if (Object.values(passwordChecks).filter(Boolean).length < 5) {
      newErrors.password = 'Password does not meet all requirements';
    }

    if (!formData.confirmPassword) {
      newErrors.confirmPassword = 'Please confirm your password';
    } else if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
    }

    if (!formData.acceptTerms) {
      newErrors.acceptTerms = 'You must accept the terms and conditions';
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
      const result = await register({
        fullName: formData.fullName,
        email: formData.email,
        phone: formData.phone,
        password: formData.password
      });

      if (result.success) {
        setToast({ message: '✅ ' + result.message, type: 'success' });
        setTimeout(() => router.push('/login'), 2000);
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
        width: '100%', maxWidth: '1100px',
        backgroundColor: 'white', borderRadius: '24px',
        boxShadow: '0 20px 60px rgba(0,0,0,0.1)',
        overflow: 'hidden',
        display: 'grid', gridTemplateColumns: '1fr 1fr',
        minHeight: '700px'
      }}>
        
        {/* Left Side - Branding */}
        <div style={{ 
          background: 'linear-gradient(135deg, #0F766E 0%, #115E59 100%)',
          padding: '60px 40px',
          color: 'white',
          display: 'flex', flexDirection: 'column', justifyContent: 'center',
          position: 'relative', overflow: 'hidden'
        }}>
          <div style={{ position: 'absolute', top: '-50px', right: '-50px', width: '200px', height: '200px', borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.05)' }} />
          <div style={{ position: 'absolute', bottom: '-80px', left: '-80px', width: '300px', height: '300px', borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.05)' }} />

          <div style={{ position: 'relative', zIndex: 1 }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>🌰</div>
            <h1 style={{ fontSize: '36px', fontWeight: '800', marginBottom: '16px', lineHeight: '1.2' }}>
              Join MevaPur
            </h1>
            <p style={{ fontSize: '16px', opacity: '0.9', marginBottom: '40px', lineHeight: '1.6' }}>
              Create your account and start shopping premium dry fruits with exclusive member benefits.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {[
                { icon: '🎁', title: 'Welcome Bonus', desc: 'Get 15% off on your first order' },
                { icon: '🚚', title: 'Free Shipping', desc: 'On orders over Rs. 1500' },
                { icon: '💎', title: 'VIP Access', desc: 'Early access to sales & new products' },
                { icon: '🎂', title: 'Birthday Rewards', desc: 'Special gifts on your birthday' }
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
        <div style={{ padding: '40px', display: 'flex', flexDirection: 'column', justifyContent: 'center', overflowY: 'auto' }}>
          <div style={{ marginBottom: '24px' }}>
            <h2 style={{ fontSize: '28px', fontWeight: '800', color: '#111827', marginBottom: '8px' }}>
              Create Account
            </h2>
            <p style={{ fontSize: '14px', color: '#6B7280' }}>
              Fill in your details to get started
            </p>
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            
            {/* Full Name */}
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '8px' }}>
                Full Name <span style={{ color: '#EF4444' }}>*</span>
              </label>
              <div style={{ position: 'relative' }}>
                <User size={18} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: errors.fullName ? '#EF4444' : '#9CA3AF' }} />
                <input
                  type="text"
                  value={formData.fullName}
                  onChange={(e) => {
                    setFormData({ ...formData, fullName: e.target.value });
                    if (errors.fullName) setErrors({ ...errors, fullName: '' });
                  }}
                  placeholder="Ahmed Khan"
                  style={{
                    width: '100%', padding: '12px 14px 12px 44px',
                    borderRadius: '10px',
                    border: `2px solid ${errors.fullName ? '#EF4444' : '#E5E7EB'}`,
                    fontSize: '14px', outline: 'none',
                    backgroundColor: '#F8FAFC'
                  }}
                />
              </div>
              {errors.fullName && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '6px', fontSize: '12px', color: '#EF4444', fontWeight: '500' }}>
                  <AlertCircle size={12} /> {errors.fullName}
                </div>
              )}
            </div>

            {/* Email */}
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '8px' }}>
                Email Address <span style={{ color: '#EF4444' }}>*</span>
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
                    width: '100%', padding: '12px 14px 12px 44px',
                    borderRadius: '10px',
                    border: `2px solid ${errors.email ? '#EF4444' : '#E5E7EB'}`,
                    fontSize: '14px', outline: 'none',
                    backgroundColor: '#F8FAFC'
                  }}
                />
              </div>
              {errors.email && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '6px', fontSize: '12px', color: '#EF4444', fontWeight: '500' }}>
                  <AlertCircle size={12} /> {errors.email}
                </div>
              )}
            </div>

            {/* Phone */}
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '8px' }}>
                Phone Number <span style={{ color: '#9CA3AF', fontWeight: '400' }}>(Optional)</span>
              </label>
              <div style={{ position: 'relative' }}>
                <Phone size={18} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: errors.phone ? '#EF4444' : '#9CA3AF' }} />
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => {
                    setFormData({ ...formData, phone: e.target.value });
                    if (errors.phone) setErrors({ ...errors, phone: '' });
                  }}
                  placeholder="03XX XXXXXXX"
                  style={{
                    width: '100%', padding: '12px 14px 12px 44px',
                    borderRadius: '10px',
                    border: `2px solid ${errors.phone ? '#EF4444' : '#E5E7EB'}`,
                    fontSize: '14px', outline: 'none',
                    backgroundColor: '#F8FAFC'
                  }}
                />
              </div>
              {errors.phone && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '6px', fontSize: '12px', color: '#EF4444', fontWeight: '500' }}>
                  <AlertCircle size={12} /> {errors.phone}
                </div>
              )}
            </div>

            {/* Password */}
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '8px' }}>
                Password <span style={{ color: '#EF4444' }}>*</span>
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
                  placeholder="Create a strong password"
                  style={{
                    width: '100%', padding: '12px 44px 12px 44px',
                    borderRadius: '10px',
                    border: `2px solid ${errors.password ? '#EF4444' : '#E5E7EB'}`,
                    fontSize: '14px', outline: 'none',
                    backgroundColor: '#F8FAFC'
                  }}
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

              {/* Password Strength Meter */}
              {formData.password && (
                <div style={{ marginTop: '10px' }}>
                  <div style={{ display: 'flex', gap: '4px', marginBottom: '8px' }}>
                    {[...Array(4)].map((_, i) => (
                      <div key={i} style={{
                        flex: 1, height: '4px', borderRadius: '2px',
                        backgroundColor: i < (['weak', 'medium', 'strong', 'very-strong'].indexOf(passwordStrength.level) + 1)
                          ? passwordStrength.color : '#E5E7EB',
                        transition: 'all 0.3s'
                      }} />
                    ))}
                  </div>
                  {passwordStrength.label && (
                    <div style={{ fontSize: '12px', fontWeight: '600', color: passwordStrength.color, marginBottom: '8px' }}>
                      {passwordStrength.label}
                    </div>
                  )}

                  {/* Password Requirements */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', padding: '10px', backgroundColor: '#F8FAFC', borderRadius: '8px' }}>
                    {[
                      { check: passwordChecks.length, text: 'At least 8 characters' },
                      { check: passwordChecks.uppercase, text: 'One uppercase letter' },
                      { check: passwordChecks.lowercase, text: 'One lowercase letter' },
                      { check: passwordChecks.number, text: 'One number' },
                      { check: passwordChecks.special, text: 'One special character' }
                    ].map((req, idx) => (
                      <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: req.check ? '#0F766E' : '#6B7280' }}>
                        {req.check ? <CheckCircle size={12} color="#0F766E" /> : <XCircle size={12} color="#9CA3AF" />}
                        {req.text}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {errors.password && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '6px', fontSize: '12px', color: '#EF4444', fontWeight: '500' }}>
                  <AlertCircle size={12} /> {errors.password}
                </div>
              )}
            </div>

            {/* Confirm Password */}
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '8px' }}>
                Confirm Password <span style={{ color: '#EF4444' }}>*</span>
              </label>
              <div style={{ position: 'relative' }}>
                <Shield size={18} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: errors.confirmPassword ? '#EF4444' : '#9CA3AF' }} />
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={formData.confirmPassword}
                  onChange={(e) => {
                    setFormData({ ...formData, confirmPassword: e.target.value });
                    if (errors.confirmPassword) setErrors({ ...errors, confirmPassword: '' });
                  }}
                  placeholder="Confirm your password"
                  style={{
                    width: '100%', padding: '12px 44px 12px 44px',
                    borderRadius: '10px',
                    border: `2px solid ${errors.confirmPassword ? '#EF4444' : '#E5E7EB'}`,
                    fontSize: '14px', outline: 'none',
                    backgroundColor: '#F8FAFC'
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  style={{
                    position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: '#6B7280', display: 'flex', alignItems: 'center'
                  }}
                >
                  {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              {formData.confirmPassword && formData.password === formData.confirmPassword && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '6px', fontSize: '12px', color: '#0F766E', fontWeight: '500' }}>
                  <CheckCircle size={12} /> Passwords match
                </div>
              )}
              {errors.confirmPassword && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '6px', fontSize: '12px', color: '#EF4444', fontWeight: '500' }}>
                  <AlertCircle size={12} /> {errors.confirmPassword}
                </div>
              )}
            </div>

            {/* Terms & Conditions */}
            <div>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer', fontSize: '13px', color: '#374151', lineHeight: '1.5' }}>
                <input
                  type="checkbox"
                  checked={formData.acceptTerms}
                  onChange={(e) => {
                    setFormData({ ...formData, acceptTerms: e.target.checked });
                    if (errors.acceptTerms) setErrors({ ...errors, acceptTerms: '' });
                  }}
                  style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: '#0F766E', marginTop: '2px' }}
                />
                <span>
                  I agree to the{' '}
                  <a href="#" style={{ color: '#0F766E', textDecoration: 'none', fontWeight: '600' }}>Terms & Conditions</a>
                  {' '}and{' '}
                  <a href="#" style={{ color: '#0F766E', textDecoration: 'none', fontWeight: '600' }}>Privacy Policy</a>
                </span>
              </label>
              {errors.acceptTerms && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '6px', fontSize: '12px', color: '#EF4444', fontWeight: '500' }}>
                  <AlertCircle size={12} /> {errors.acceptTerms}
                </div>
              )}
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
                transition: 'all 0.3s', marginTop: '8px'
              }}
              onMouseEnter={e => { if (!loading) { e.currentTarget.style.backgroundColor = '#115E59'; e.currentTarget.style.transform = 'translateY(-2px)'; } }}
              onMouseLeave={e => { if (!loading) { e.currentTarget.style.backgroundColor = '#0F766E'; e.currentTarget.style.transform = 'translateY(0)'; } }}
            >
              {loading ? (
                <>
                  <Loader size={18} style={{ animation: 'spin 1s linear infinite' }} />
                  Creating Account...
                </>
              ) : (
                <>
                  <User size={18} />
                  Create Account
                </>
              )}
            </button>

            {/* Login Link */}
            <div style={{ textAlign: 'center', fontSize: '14px', color: '#6B7280' }}>
              Already have an account?{' '}
              <Link href="/login" style={{ color: '#0F766E', textDecoration: 'none', fontWeight: '700' }}>
                Sign In
              </Link>
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
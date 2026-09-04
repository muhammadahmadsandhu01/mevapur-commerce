'use client';
export const dynamic = 'force-dynamic';

import { useState, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Mail, Lock, Eye, EyeOff, ArrowLeft, User, Phone, CheckCircle, XCircle, Loader, AlertCircle, Shield } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import Toast from '@/components/Toast';
import BrandLogo from '@/components/brand/BrandLogo';
import { branding } from '@/config/branding';

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

  const fullNameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmPasswordRef = useRef<HTMLInputElement>(null);
  const termsRef = useRef<HTMLInputElement>(null);

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
    if (score <= 4) return { level: 'strong', color: '#16A34A', label: 'Strong' };
    return { level: 'very-strong', color: '#166534', label: 'Very Strong' };
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

    if (newErrors.fullName) fullNameRef.current?.focus();
    else if (newErrors.email) emailRef.current?.focus();
    else if (newErrors.phone) phoneRef.current?.focus();
    else if (newErrors.password) passwordRef.current?.focus();
    else if (newErrors.confirmPassword) confirmPasswordRef.current?.focus();
    else if (newErrors.acceptTerms) termsRef.current?.focus();

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
    } catch {
      setToast({ message: '❌ Something went wrong', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4 sm:p-6 lg:p-8 relative">
      <div className="w-full max-w-5xl mb-4 flex justify-start">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-[#0b132b] hover:text-[#ff8a00] font-semibold text-sm px-4 py-2 bg-white rounded-xl shadow-xs border border-slate-200 transition"
        >
          <ArrowLeft size={16} /> Back to Home
        </Link>
      </div>

      <div className="w-full max-w-5xl bg-white rounded-3xl shadow-xl overflow-hidden grid grid-cols-1 lg:grid-cols-2 border border-slate-100">
        {/* Left Branding Side */}
        <div className="bg-gradient-to-br from-[#0b132b] to-[#1a2744] p-8 sm:p-12 text-white flex flex-col justify-between relative overflow-hidden">
          <div className="relative z-10">
            <div className="mb-6">
              <BrandLogo theme="light" height={38} />
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold mb-3 leading-tight">
              Join {branding.siteName}
            </h1>
            <p className="text-sm sm:text-base text-slate-300 mb-8 leading-relaxed">
              Create your account to explore available products across our store.
            </p>

            <div className="space-y-4 hidden sm:block">
              {[
                { icon: '🎁', title: 'Welcome Bonus', desc: 'Get 15% off on your first order' },
                { icon: '🚚', title: 'Free Shipping', desc: 'On orders over Rs. 1500' },
                { icon: '💎', title: 'VIP Access', desc: 'Early access to sales & new products' },
                { icon: '🎂', title: 'Birthday Rewards', desc: 'Special gifts on your birthday' }
              ].map((feature, idx) => (
                <div key={idx} className="flex items-center gap-4">
                  <div className="w-11 h-11 rounded-xl bg-white/10 flex items-center justify-center text-xl shrink-0">
                    {feature.icon}
                  </div>
                  <div>
                    <div className="font-bold text-sm text-white">{feature.title}</div>
                    <div className="text-xs text-slate-300">{feature.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Form Side */}
        <div className="p-6 sm:p-10 lg:p-12 flex flex-col justify-center overflow-y-auto">
          <div className="mb-6">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 mb-2">
              Create Account
            </h2>
            <p className="text-sm text-slate-500">
              Fill in your details to get started
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            {/* Full Name */}
            <div>
              <label htmlFor="reg-fullname" className="block text-xs font-semibold text-slate-700 mb-1.5">
                Full Name <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <User size={18} className={`absolute left-3.5 top-1/2 -translate-y-1/2 ${errors.fullName ? 'text-red-500' : 'text-slate-400'}`} />
                <input
                  ref={fullNameRef}
                  id="reg-fullname"
                  type="text"
                  value={formData.fullName}
                  onChange={(e) => {
                    setFormData({ ...formData, fullName: e.target.value });
                    if (errors.fullName) setErrors({ ...errors, fullName: '' });
                  }}
                  placeholder="Ahmed Khan"
                  aria-invalid={!!errors.fullName}
                  aria-describedby={errors.fullName ? 'reg-fullname-error' : undefined}
                  className={`w-full pl-10 pr-4 py-2.5 rounded-xl border text-sm outline-none transition bg-slate-50 text-slate-900 ${
                    errors.fullName ? 'border-red-500 focus:ring-2 focus:ring-red-100' : 'border-slate-300 focus:border-[#ff8a00] focus:ring-2 focus:ring-orange-100'
                  }`}
                />
              </div>
              {errors.fullName && (
                <div id="reg-fullname-error" role="alert" className="flex items-center gap-1 mt-1 text-xs text-red-600 font-medium">
                  <AlertCircle size={12} /> {errors.fullName}
                </div>
              )}
            </div>

            {/* Email */}
            <div>
              <label htmlFor="reg-email" className="block text-xs font-semibold text-slate-700 mb-1.5">
                Email Address <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Mail size={18} className={`absolute left-3.5 top-1/2 -translate-y-1/2 ${errors.email ? 'text-red-500' : 'text-slate-400'}`} />
                <input
                  ref={emailRef}
                  id="reg-email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => {
                    setFormData({ ...formData, email: e.target.value });
                    if (errors.email) setErrors({ ...errors, email: '' });
                  }}
                  placeholder="you@example.com"
                  aria-invalid={!!errors.email}
                  aria-describedby={errors.email ? 'reg-email-error' : undefined}
                  className={`w-full pl-10 pr-4 py-2.5 rounded-xl border text-sm outline-none transition bg-slate-50 text-slate-900 ${
                    errors.email ? 'border-red-500 focus:ring-2 focus:ring-red-100' : 'border-slate-300 focus:border-[#ff8a00] focus:ring-2 focus:ring-orange-100'
                  }`}
                />
              </div>
              {errors.email && (
                <div id="reg-email-error" role="alert" className="flex items-center gap-1 mt-1 text-xs text-red-600 font-medium">
                  <AlertCircle size={12} /> {errors.email}
                </div>
              )}
            </div>

            {/* Phone */}
            <div>
              <label htmlFor="reg-phone" className="block text-xs font-semibold text-slate-700 mb-1.5">
                Phone Number <span className="text-slate-600 font-normal">(Optional)</span>
              </label>
              <div className="relative">
                <Phone size={18} className={`absolute left-3.5 top-1/2 -translate-y-1/2 ${errors.phone ? 'text-red-500' : 'text-slate-400'}`} />
                <input
                  ref={phoneRef}
                  id="reg-phone"
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => {
                    setFormData({ ...formData, phone: e.target.value });
                    if (errors.phone) setErrors({ ...errors, phone: '' });
                  }}
                  placeholder="03XX XXXXXXX"
                  aria-invalid={!!errors.phone}
                  aria-describedby={errors.phone ? 'reg-phone-error' : undefined}
                  className={`w-full pl-10 pr-4 py-2.5 rounded-xl border text-sm outline-none transition bg-slate-50 text-slate-900 ${
                    errors.phone ? 'border-red-500 focus:ring-2 focus:ring-red-100' : 'border-slate-300 focus:border-[#ff8a00] focus:ring-2 focus:ring-orange-100'
                  }`}
                />
              </div>
              {errors.phone && (
                <div id="reg-phone-error" role="alert" className="flex items-center gap-1 mt-1 text-xs text-red-600 font-medium">
                  <AlertCircle size={12} /> {errors.phone}
                </div>
              )}
            </div>

            {/* Password */}
            <div>
              <label htmlFor="reg-password" className="block text-xs font-semibold text-slate-700 mb-1.5">
                Password <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Lock size={18} className={`absolute left-3.5 top-1/2 -translate-y-1/2 ${errors.password ? 'text-red-500' : 'text-slate-400'}`} />
                <input
                  ref={passwordRef}
                  id="reg-password"
                  type={showPassword ? 'text' : 'password'}
                  value={formData.password}
                  onChange={(e) => {
                    setFormData({ ...formData, password: e.target.value });
                    if (errors.password) setErrors({ ...errors, password: '' });
                  }}
                  placeholder="Create a strong password"
                  aria-invalid={!!errors.password}
                  aria-describedby={errors.password ? 'reg-password-error' : 'reg-password-policy'}
                  className={`w-full pl-10 pr-12 py-2.5 rounded-xl border text-sm outline-none transition bg-slate-50 text-slate-900 ${
                    errors.password ? 'border-red-500 focus:ring-2 focus:ring-red-100' : 'border-slate-300 focus:border-[#ff8a00] focus:ring-2 focus:ring-orange-100'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="min-h-[44px] min-w-[44px] flex items-center justify-center absolute right-1 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>

              {/* Password Strength & Checklist */}
              {formData.password && (
                <div id="reg-password-policy" className="mt-2 space-y-2">
                  <div className="flex gap-1">
                    {[...Array(4)].map((_, i) => (
                      <div
                        key={i}
                        className={`flex-1 h-1 rounded-full transition-all duration-300 ${
                          i < (['weak', 'medium', 'strong', 'very-strong'].indexOf(passwordStrength.level) + 1)
                            ? passwordStrength.level === 'weak' ? 'bg-red-500' : passwordStrength.level === 'medium' ? 'bg-amber-500' : 'bg-emerald-600'
                            : 'bg-slate-200'
                        }`}
                      />
                    ))}
                  </div>
                  {passwordStrength.label && (
                    <div className={`text-xs font-bold ${
                      passwordStrength.level === 'weak' ? 'text-red-600' : passwordStrength.level === 'medium' ? 'text-amber-600' : 'text-emerald-700'
                    }`}>
                      {passwordStrength.label}
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 p-2.5 bg-slate-50 rounded-xl border border-slate-200 text-xs">
                    {[
                      { check: passwordChecks.length, text: '8+ characters' },
                      { check: passwordChecks.uppercase, text: 'Uppercase letter' },
                      { check: passwordChecks.lowercase, text: 'Lowercase letter' },
                      { check: passwordChecks.number, text: 'One number' },
                      { check: passwordChecks.special, text: 'Special character' }
                    ].map((req, idx) => (
                      <div key={idx} className={`flex items-center gap-1.5 ${req.check ? 'text-emerald-700' : 'text-slate-500'}`}>
                        {req.check ? <CheckCircle size={12} className="text-emerald-600" /> : <XCircle size={12} className="text-slate-400" />}
                        <span>{req.text}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {errors.password && (
                <div id="reg-password-error" role="alert" className="flex items-center gap-1 mt-1 text-xs text-red-600 font-medium">
                  <AlertCircle size={12} /> {errors.password}
                </div>
              )}
            </div>

            {/* Confirm Password */}
            <div>
              <label htmlFor="reg-confirm-password" className="block text-xs font-semibold text-slate-700 mb-1.5">
                Confirm Password <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Shield size={18} className={`absolute left-3.5 top-1/2 -translate-y-1/2 ${errors.confirmPassword ? 'text-red-500' : 'text-slate-400'}`} />
                <input
                  ref={confirmPasswordRef}
                  id="reg-confirm-password"
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={formData.confirmPassword}
                  onChange={(e) => {
                    setFormData({ ...formData, confirmPassword: e.target.value });
                    if (errors.confirmPassword) setErrors({ ...errors, confirmPassword: '' });
                  }}
                  placeholder="Confirm your password"
                  aria-invalid={!!errors.confirmPassword}
                  aria-describedby={errors.confirmPassword ? 'reg-confirm-password-error' : undefined}
                  className={`w-full pl-10 pr-12 py-2.5 rounded-xl border text-sm outline-none transition bg-slate-50 text-slate-900 ${
                    errors.confirmPassword ? 'border-red-500 focus:ring-2 focus:ring-red-100' : 'border-slate-300 focus:border-[#ff8a00] focus:ring-2 focus:ring-orange-100'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                  className="min-h-[44px] min-w-[44px] flex items-center justify-center absolute right-1 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700"
                >
                  {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              {formData.confirmPassword && formData.password === formData.confirmPassword && (
                <div className="flex items-center gap-1 mt-1 text-xs text-emerald-700 font-medium">
                  <CheckCircle size={12} className="text-emerald-600" /> Passwords match
                </div>
              )}
              {errors.confirmPassword && (
                <div id="reg-confirm-password-error" role="alert" className="flex items-center gap-1 mt-1 text-xs text-red-600 font-medium">
                  <AlertCircle size={12} /> {errors.confirmPassword}
                </div>
              )}
            </div>

            {/* Terms & Conditions */}
            <div>
              <label htmlFor="reg-terms" className="flex items-start gap-2.5 cursor-pointer text-xs text-slate-700 leading-relaxed">
                <input
                  ref={termsRef}
                  id="reg-terms"
                  type="checkbox"
                  checked={formData.acceptTerms}
                  onChange={(e) => {
                    setFormData({ ...formData, acceptTerms: e.target.checked });
                    if (errors.acceptTerms) setErrors({ ...errors, acceptTerms: '' });
                  }}
                  aria-invalid={!!errors.acceptTerms}
                  aria-describedby={errors.acceptTerms ? 'reg-terms-error' : undefined}
                  className="w-4 h-4 mt-0.5 rounded text-[#ff8a00] border-slate-300 focus:ring-[#ff8a00]"
                />
                <span>
                  I agree to the{' '}
                  <span className="text-[#0b132b] font-semibold">Terms & Conditions</span>
                  {' '}and{' '}
                  <span className="text-[#0b132b] font-semibold">Privacy Policy</span>
                </span>
              </label>
              {errors.acceptTerms && (
                <div id="reg-terms-error" role="alert" className="flex items-center gap-1 mt-1 text-xs text-red-600 font-medium">
                  <AlertCircle size={12} /> {errors.acceptTerms}
                </div>
              )}
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 px-4 bg-[#ff8a00] hover:bg-[#e67c00] text-[#0b132b] font-bold text-sm rounded-xl transition shadow-xs flex items-center justify-center gap-2 disabled:opacity-50 mt-2"
            >
              {loading ? (
                <>
                  <Loader size={18} className="animate-spin" />
                  <span>Creating Account...</span>
                </>
              ) : (
                <>
                  <User size={18} />
                  <span>Create Account</span>
                </>
              )}
            </button>

            {/* Login Link */}
            <div className="text-center pt-2 text-xs text-slate-500">
              Already have an account?{' '}
              <Link href="/login" className="text-[#0b132b] font-bold hover:text-[#ff8a00]">
                Sign In
              </Link>
            </div>
          </form>
        </div>
      </div>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}

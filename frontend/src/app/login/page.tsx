'use client';
export const dynamic = 'force-dynamic';

import { useState, Suspense, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  ArrowLeft,
  Loader,
  AlertCircle,
  SendHorizontal
} from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import Toast from '@/components/Toast';
import BrandLogo from '@/components/brand/BrandLogo';
import { branding } from '@/config/branding';
import { isSafeLocalRedirect } from '@/lib/routeClassification';

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawRedirect = searchParams.get('redirect');
  const safeRedirect = isSafeLocalRedirect(rawRedirect, '/');
  const { login, resendVerification } = useAuthStore();

  const [formData, setFormData] = useState({
    email: '',
    password: '',
    rememberMe: false
  });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendStatus, setResendStatus] = useState<string | null>(null);
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  const emailInputRef = useRef<HTMLInputElement>(null);
  const passwordInputRef = useRef<HTMLInputElement>(null);

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

    if (newErrors.email) {
      emailInputRef.current?.focus();
    } else if (newErrors.password) {
      passwordInputRef.current?.focus();
    }

    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) return;

    setLoading(true);
    setErrors({});
    setUnverifiedEmail(null);
    setResendStatus(null);

    try {
      const result = await login(formData.email, formData.password, formData.rememberMe);

      if (result.success) {
        setToast({ message: '✅ ' + result.message, type: 'success' });
        setTimeout(() => router.push(safeRedirect), 1000);
      } else {
        if (result.code === 'AUTH_EMAIL_NOT_VERIFIED' || result.message.toLowerCase().includes('not been verified')) {
          setUnverifiedEmail(formData.email);
        }
        setToast({ message: '❌ ' + result.message, type: 'error' });
      }
    } catch {
      setToast({ message: '❌ Something went wrong', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    const targetEmail = unverifiedEmail || formData.email;
    if (!targetEmail) return;

    setResending(true);
    setResendStatus(null);
    try {
      const result = await resendVerification(
        targetEmail,
        safeRedirect !== '/' ? safeRedirect : undefined
      );
      setResendStatus(result.message);
      setToast({ message: result.message, type: 'info' });
    } catch {
      setResendStatus('Failed to resend verification email. Please try again later.');
    } finally {
      setResending(false);
    }
  };

  const registerUrl = safeRedirect !== '/'
    ? `/register?redirect=${encodeURIComponent(safeRedirect)}`
    : '/register';

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
              Welcome to {branding.siteName}
            </h1>
            <p className="text-sm sm:text-base text-slate-300 mb-8 leading-relaxed">
              {branding.tagline} Sign in to access your orders, wishlist, and account.
            </p>

            <div className="space-y-4 hidden sm:block">
              {[
                { icon: '🚚', title: 'Fast Delivery', desc: 'Track your orders in real-time' },
                { icon: '💝', title: 'Wishlist', desc: 'Save your favorite products' },
                { icon: '🎁', title: 'Exclusive Offers', desc: 'Members-only discounts' }
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
        <div className="p-8 sm:p-12 flex flex-col justify-center">
          <div className="mb-6">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 mb-2">
              Sign In
            </h2>
            <p className="text-sm text-slate-500">
              Enter your credentials to access your account
            </p>
          </div>

          {unverifiedEmail && (
            <div role="alert" className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-5 text-xs text-amber-900">
              <div className="flex items-start gap-2.5 mb-3">
                <AlertCircle size={18} className="shrink-0 text-amber-600 mt-0.5" />
                <div>
                  <div className="font-bold text-amber-900 mb-0.5">Email Not Verified</div>
                  <div>Your email address ({unverifiedEmail}) must be verified before you can log in.</div>
                </div>
              </div>

              {resendStatus && (
                <div role="status" className="bg-white/80 p-2.5 rounded-xl mb-3 text-xs text-slate-700 border border-amber-200">
                  {resendStatus}
                </div>
              )}

              <button
                type="button"
                onClick={handleResend}
                disabled={resending}
                className="w-full py-2.5 px-3 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-xl transition flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                {resending ? (
                  <>
                    <Loader size={14} className="animate-spin" />
                    <span>Sending Verification Email...</span>
                  </>
                ) : (
                  <>
                    <SendHorizontal size={14} />
                    <span>Resend Verification Email</span>
                  </>
                )}
              </button>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div>
              <label htmlFor="login-email" className="block text-xs font-semibold text-slate-700 mb-1.5">
                Email Address
              </label>
              <div className="relative">
                <Mail size={18} className={`absolute left-3.5 top-1/2 -translate-y-1/2 ${errors.email ? 'text-red-500' : 'text-slate-400'}`} />
                <input
                  ref={emailInputRef}
                  id="login-email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => {
                    setFormData({ ...formData, email: e.target.value });
                    if (errors.email) setErrors({ ...errors, email: '' });
                  }}
                  placeholder="you@example.com"
                  aria-invalid={!!errors.email}
                  aria-describedby={errors.email ? 'login-email-error' : undefined}
                  className={`w-full pl-10 pr-4 py-3 rounded-xl border text-sm outline-none transition bg-slate-50 text-slate-900 ${
                    errors.email ? 'border-red-500 focus:ring-2 focus:ring-red-100' : 'border-slate-300 focus:border-[#ff8a00] focus:ring-2 focus:ring-orange-100'
                  }`}
                />
              </div>
              {errors.email && (
                <div id="login-email-error" role="alert" className="flex items-center gap-1 mt-1.5 text-xs text-red-600 font-medium">
                  <AlertCircle size={13} /> {errors.email}
                </div>
              )}
            </div>

            <div>
              <label htmlFor="login-password" className="block text-xs font-semibold text-slate-700 mb-1.5">
                Password
              </label>
              <div className="relative">
                <Lock size={18} className={`absolute left-3.5 top-1/2 -translate-y-1/2 ${errors.password ? 'text-red-500' : 'text-slate-400'}`} />
                <input
                  ref={passwordInputRef}
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  value={formData.password}
                  onChange={(e) => {
                    setFormData({ ...formData, password: e.target.value });
                    if (errors.password) setErrors({ ...errors, password: '' });
                  }}
                  placeholder="Enter your password"
                  aria-invalid={!!errors.password}
                  aria-describedby={errors.password ? 'login-password-error' : undefined}
                  className={`w-full pl-10 pr-12 py-3 rounded-xl border text-sm outline-none transition bg-slate-50 text-slate-900 ${
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
              {errors.password && (
                <div id="login-password-error" role="alert" className="flex items-center gap-1 mt-1.5 text-xs text-red-600 font-medium">
                  <AlertCircle size={13} /> {errors.password}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-slate-700">
                <input
                  type="checkbox"
                  checked={formData.rememberMe}
                  onChange={(e) => setFormData({ ...formData, rememberMe: e.target.checked })}
                  className="w-4 h-4 rounded text-[#ff8a00] border-slate-300 focus:ring-[#ff8a00]"
                />
                <span>Remember me</span>
              </label>
              <Link href="/forgot-password" className="text-xs font-semibold text-[#0b132b] hover:text-[#ff8a00]">
                Forgot password?
              </Link>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 px-4 bg-[#ff8a00] hover:bg-[#e67c00] text-[#0b132b] font-bold text-sm rounded-xl transition shadow-xs flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader size={18} className="animate-spin" />
                  <span>Signing In...</span>
                </>
              ) : (
                <>
                  <Lock size={18} />
                  <span>Sign In Securely</span>
                </>
              )}
            </button>

            <div className="text-center pt-2 text-xs text-slate-500">
              Don&apos;t have an account?{' '}
              <Link href={registerUrl} className="text-[#0b132b] font-bold hover:text-[#ff8a00]">
                Create Account
              </Link>
            </div>
          </form>
        </div>
      </div>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-[#ff8a00] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm text-slate-500">Loading...</p>
        </div>
      </div>
    }>
      <LoginContent />
    </Suspense>
  );
}

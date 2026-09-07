'use client';
export const dynamic = 'force-dynamic';

import { useState, useMemo, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  ArrowLeft,
  User,
  Phone,
  CheckCircle,
  XCircle,
  Loader,
  AlertCircle,
  Shield,
  ShieldCheck,
  SendHorizontal
} from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import Toast from '@/components/Toast';
import BrandLogo from '@/components/brand/BrandLogo';
import { branding } from '@/config/branding';
import { validatePasswordPolicy } from '@/lib/passwordPolicy';
import { isSafeLocalRedirect } from '@/lib/routeClassification';

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawRedirect = searchParams.get('redirect');
  const safeRedirect = isSafeLocalRedirect(rawRedirect, '/');
  const { register, resendVerification } = useAuthStore();

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
  const [resending, setResending] = useState(false);
  const [resendStatus, setResendStatus] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [pendingVerificationEmail, setPendingVerificationEmail] = useState<string | null>(null);
  const [emailDeliveryIssue, setEmailDeliveryIssue] = useState(false);

  const fullNameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmPasswordRef = useRef<HTMLInputElement>(null);
  const termsRef = useRef<HTMLInputElement>(null);

  // Canonical Enterprise Password Policy Checks (12+ characters, upper, lower, number, special, no repeat, no sequence)
  const passwordPolicy = useMemo(() => validatePasswordPolicy(formData.password), [formData.password]);
  const { hasLength, hasUpper, hasLower, hasNumber, hasSpecial, hasNoRepeat, hasNoSequential, isValid: isPasswordValid } = passwordPolicy;
  const isPasswordMatch = formData.password.length > 0 && formData.password === formData.confirmPassword;

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
      newErrors.email = 'Please enter a valid email address';
    }

    if (formData.phone && !/^03\d{9}$/.test(formData.phone.replace(/\s/g, ''))) {
      newErrors.phone = 'Enter a valid Pakistani phone number (e.g., 03001234567)';
    }

    if (!formData.password) {
      newErrors.password = 'Password is required';
    } else if (!isPasswordValid) {
      newErrors.password = passwordPolicy.errors[0] || 'Password does not meet enterprise policy requirements';
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
        password: formData.password,
        redirect: safeRedirect !== '/' ? safeRedirect : undefined
      });

      if (result.success) {
        if (result.requiresEmailVerification) {
          setPendingVerificationEmail(formData.email);
          setEmailDeliveryIssue(Boolean(result.emailDeliveryFailed));
          setToast({ message: result.message, type: 'info' });
        } else {
          setToast({ message: '✅ ' + result.message, type: 'success' });
          const loginTarget = safeRedirect !== '/'
            ? `/login?redirect=${encodeURIComponent(safeRedirect)}`
            : '/login';
          setTimeout(() => router.push(loginTarget), 1500);
        }
      } else {
        setToast({ message: '❌ ' + result.message, type: 'error' });
      }
    } catch {
      setToast({ message: '❌ An unexpected error occurred. Please try again.', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (!pendingVerificationEmail) return;
    setResending(true);
    setResendStatus(null);
    try {
      const result = await resendVerification(
        pendingVerificationEmail,
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

  const loginUrl = safeRedirect !== '/'
    ? `/login?redirect=${encodeURIComponent(safeRedirect)}`
    : '/login';

  // Check your email screen after pending registration
  if (pendingVerificationEmail) {
    return (
      <div className="w-full max-w-xl bg-white rounded-3xl shadow-xl p-8 sm:p-12 border border-slate-100 text-center">
        <div className="w-16 h-16 rounded-full bg-orange-100 text-[#ff8a00] flex items-center justify-center mx-auto mb-5">
          <Mail size={32} />
        </div>
        <h2 className="text-2xl font-extrabold text-slate-900 mb-2">
          Check Your Email
        </h2>
        <p className="text-sm text-slate-600 mb-4 leading-relaxed">
          We&apos;ve sent a verification link to <strong className="text-slate-900 font-semibold">{pendingVerificationEmail}</strong>.
          Please click the link in the email to activate your account.
        </p>

        {emailDeliveryIssue && (
          <div role="alert" className="bg-amber-50 text-amber-800 p-3.5 rounded-xl mb-5 text-xs border border-amber-200 text-left flex items-start gap-2">
            <AlertCircle size={16} className="shrink-0 mt-0.5 text-amber-600" />
            <span>
              The initial verification email could not be sent immediately. Click below to request a new verification link.
            </span>
          </div>
        )}

        {resendStatus && (
          <div role="status" className="bg-blue-50 text-blue-800 p-3.5 rounded-xl mb-5 text-xs border border-blue-200">
            {resendStatus}
          </div>
        )}

        <div className="space-y-3 pt-2">
          <button
            type="button"
            onClick={handleResend}
            disabled={resending}
            className="w-full py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-sm rounded-xl transition flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {resending ? (
              <>
                <Loader size={16} className="animate-spin" />
                <span>Resending Link...</span>
              </>
            ) : (
              <>
                <SendHorizontal size={16} />
                <span>Resend Verification Email</span>
              </>
            )}
          </button>

          <Link
            href={loginUrl}
            className="w-full py-3.5 px-4 bg-[#ff8a00] hover:bg-[#e67c00] text-[#0b132b] font-bold text-sm rounded-xl transition shadow-xs flex items-center justify-center"
          >
            Proceed to Login
          </Link>
        </div>
      </div>
    );
  }

  return (
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
                placeholder="Minimum 12 characters"
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

            {/* Password Policy Checklist */}
            <div id="reg-password-policy" className="mt-2 space-y-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 p-2.5 bg-slate-50 rounded-xl border border-slate-200 text-xs">
                {[
                  { check: hasLength, text: '12+ characters' },
                  { check: hasUpper, text: 'Uppercase letter' },
                  { check: hasLower, text: 'Lowercase letter' },
                  { check: hasNumber, text: 'One number' },
                  { check: hasSpecial, text: 'Special symbol (!@#$%...)' },
                  { check: hasNoRepeat && hasNoSequential, text: 'No repeated/sequential characters' }
                ].map((req, idx) => (
                  <div key={idx} className={`flex items-center gap-1.5 ${req.check ? 'text-emerald-700 font-medium' : 'text-slate-500'}`}>
                    {req.check ? <CheckCircle size={12} className="text-emerald-600" /> : <XCircle size={12} className="text-slate-400" />}
                    <span>{req.text}</span>
                  </div>
                ))}
              </div>
            </div>

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
            {formData.confirmPassword && isPasswordMatch && (
              <div className="flex items-center gap-1 mt-1 text-xs text-emerald-700 font-medium">
                <ShieldCheck size={12} className="text-emerald-600" /> Passwords match
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
            <Link href={loginUrl} className="text-[#0b132b] font-bold hover:text-[#ff8a00]">
              Sign In
            </Link>
          </div>
        </form>
      </div>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}

export default function RegisterPage() {
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

      <Suspense
        fallback={
          <div className="text-center py-12">
            <Loader size={36} className="animate-spin text-[#ff8a00] mx-auto mb-3" />
            <p className="text-sm text-slate-500 font-medium">Loading registration form...</p>
          </div>
        }
      >
        <RegisterForm />
      </Suspense>
    </div>
  );
}

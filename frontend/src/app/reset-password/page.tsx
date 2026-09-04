'use client';

import { useState, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  Eye,
  EyeOff,
  CheckCircle,
  AlertCircle,
  Loader,
  ShieldCheck,
  KeyRound,
  ArrowLeft,
} from 'lucide-react';
import BrandLogo from '@/components/brand/BrandLogo';
import { authHttp } from '@/lib/authSession';
import { validatePasswordPolicy } from '@/lib/passwordPolicy';

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const newPasswordRef = useRef<HTMLInputElement>(null);
  const confirmPasswordRef = useRef<HTMLInputElement>(null);

  // Canonical Enterprise Password Policy Checks
  const policy = validatePasswordPolicy(newPassword);
  const { hasLength, hasUpper, hasLower, hasNumber, hasSpecial, hasNoRepeat, hasNoSequential } = policy;
  const isMatch = newPassword.length > 0 && newPassword === confirmPassword;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!token) {
      setError('Password reset token is missing or invalid. Please request a new recovery link.');
      return;
    }

    if (!hasLength || !hasUpper || !hasLower || !hasNumber || !hasSpecial || !hasNoRepeat || !hasNoSequential) {
      setError('New password must satisfy all policy requirements.');
      newPasswordRef.current?.focus();
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      confirmPasswordRef.current?.focus();
      return;
    }

    setLoading(true);
    try {
      await authHttp.post('/auth/reset-password', {
        resetToken: token,
        newPassword,
      });
      setSuccess(true);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string; error?: { message?: string } } } };
      const msg =
        axiosErr.response?.data?.error?.message ||
        axiosErr.response?.data?.message ||
        'Password reset failed. The token may be expired or invalid.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  if (!token && !success) {
    return (
      <div className="text-center py-4">
        <div className="w-16 h-16 rounded-full bg-red-50 text-red-600 flex items-center justify-center mx-auto mb-4">
          <AlertCircle size={36} />
        </div>
        <h2 className="text-xl font-extrabold text-[#0b132b] mb-2">
          Invalid or Missing Token
        </h2>
        <p className="text-sm text-slate-500 leading-relaxed mb-6">
          No password reset token was provided in the link. Please request a fresh recovery link.
        </p>
        <Link
          href="/forgot-password"
          className="inline-flex w-full items-center justify-center py-3.5 px-4 bg-[#ff8a00] hover:bg-[#e67c00] text-[#0b132b] font-bold text-sm rounded-xl transition shadow-xs"
        >
          Request Recovery Link
        </Link>
      </div>
    );
  }

  if (success) {
    return (
      <div className="text-center py-4">
        <div className="w-16 h-16 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-4">
          <CheckCircle size={36} />
        </div>
        <h2 className="text-xl font-extrabold text-[#0b132b] mb-2">
          Password Reset Complete
        </h2>
        <p className="text-sm text-slate-500 leading-relaxed mb-6">
          Your password has been updated successfully. You can now log in using your new credentials.
        </p>
        <button
          type="button"
          onClick={() => router.replace('/login')}
          className="w-full py-3.5 px-4 bg-[#ff8a00] hover:bg-[#e67c00] text-[#0b132b] font-bold text-sm rounded-xl transition shadow-xs"
        >
          Proceed to Login
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="text-center mb-6">
        <div className="w-16 h-16 rounded-full bg-orange-50 text-[#ff8a00] flex items-center justify-center mx-auto mb-4">
          <KeyRound size={28} />
        </div>
        <h1 className="text-2xl font-extrabold text-[#0b132b] mb-1.5">
          Reset Your Password
        </h1>
        <p className="text-sm text-slate-500">
          Create a new strong password for your account.
        </p>
      </div>

      {error && (
        <div
          role="alert"
          className="bg-red-50 text-red-600 p-3 rounded-xl mb-5 text-xs font-semibold border border-red-200 flex items-center gap-2"
        >
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <div>
          <label
            htmlFor="reset-new-password"
            className="block text-xs font-semibold text-slate-700 mb-1.5"
          >
            New Password
          </label>
          <div className="relative">
            <input
              ref={newPasswordRef}
              id="reset-new-password"
              type={showNew ? 'text' : 'password'}
              required
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Minimum 12 characters"
              aria-invalid={!hasLength && newPassword.length > 0}
              aria-describedby="password-policy-checklist"
              className="w-full pl-3.5 pr-12 py-3 rounded-xl border border-slate-300 text-sm outline-none transition bg-slate-50 text-slate-900 focus:border-[#ff8a00] focus:ring-2 focus:ring-orange-100"
            />
            <button
              type="button"
              onClick={() => setShowNew(!showNew)}
              aria-label={showNew ? 'Hide new password' : 'Show new password'}
              className="min-h-[44px] min-w-[44px] flex items-center justify-center absolute right-1 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              {showNew ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>

        <div>
          <label
            htmlFor="reset-confirm-password"
            className="block text-xs font-semibold text-slate-700 mb-1.5"
          >
            Confirm New Password
          </label>
          <div className="relative">
            <input
              ref={confirmPasswordRef}
              id="reset-confirm-password"
              type={showConfirm ? 'text' : 'password'}
              required
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter new password"
              aria-invalid={confirmPassword.length > 0 && !isMatch}
              className="w-full pl-3.5 pr-12 py-3 rounded-xl border border-slate-300 text-sm outline-none transition bg-slate-50 text-slate-900 focus:border-[#ff8a00] focus:ring-2 focus:ring-orange-100"
            />
            <button
              type="button"
              onClick={() => setShowConfirm(!showConfirm)}
              aria-label={showConfirm ? 'Hide confirm password' : 'Show confirm password'}
              className="min-h-[44px] min-w-[44px] flex items-center justify-center absolute right-1 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              {showConfirm ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>

        {/* Requirements Checklist */}
        <div
          id="password-policy-checklist"
          className="p-3.5 bg-slate-50 rounded-xl border border-slate-200"
        >
          <div className="text-[11px] font-bold text-slate-800 mb-2 uppercase tracking-wide">
            Password Policy Requirements
          </div>
          <div className="grid grid-cols-2 gap-1.5 text-xs">
            <div className={`flex items-center gap-1.5 ${hasLength ? 'text-emerald-700' : 'text-slate-500'}`}>
              <ShieldCheck size={13} className={hasLength ? 'text-emerald-600' : 'text-slate-400'} />
              <span>12+ characters</span>
            </div>
            <div className={`flex items-center gap-1.5 ${hasUpper ? 'text-emerald-700' : 'text-slate-500'}`}>
              <ShieldCheck size={13} className={hasUpper ? 'text-emerald-600' : 'text-slate-400'} />
              <span>Uppercase letter</span>
            </div>
            <div className={`flex items-center gap-1.5 ${hasLower ? 'text-emerald-700' : 'text-slate-500'}`}>
              <ShieldCheck size={13} className={hasLower ? 'text-emerald-600' : 'text-slate-400'} />
              <span>Lowercase letter</span>
            </div>
            <div className={`flex items-center gap-1.5 ${hasNumber ? 'text-emerald-700' : 'text-slate-500'}`}>
              <ShieldCheck size={13} className={hasNumber ? 'text-emerald-600' : 'text-slate-400'} />
              <span>Number</span>
            </div>
            <div className={`flex items-center gap-1.5 ${hasSpecial ? 'text-emerald-700' : 'text-slate-500'}`}>
              <ShieldCheck size={13} className={hasSpecial ? 'text-emerald-600' : 'text-slate-400'} />
              <span>Special symbol</span>
            </div>
            <div className={`flex items-center gap-1.5 ${isMatch ? 'text-emerald-700' : 'text-slate-500'}`}>
              <ShieldCheck size={13} className={isMatch ? 'text-emerald-600' : 'text-slate-400'} />
              <span>Passwords match</span>
            </div>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3.5 px-4 bg-[#ff8a00] hover:bg-[#e67c00] text-[#0b132b] font-bold text-sm rounded-xl transition shadow-xs flex items-center justify-center gap-2 disabled:opacity-50 mt-2"
        >
          {loading ? (
            <>
              <Loader size={18} className="animate-spin" />
              <span>Resetting Password...</span>
            </>
          ) : (
            <span>Set New Password</span>
          )}
        </button>
      </form>
    </div>
  );
}

export default function StorefrontResetPasswordPage() {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4 sm:p-6 relative">
      <div className="w-full max-w-md mb-4 flex justify-start">
        <Link
          href="/login"
          className="inline-flex items-center gap-2 text-[#0b132b] hover:text-[#ff8a00] font-semibold text-sm px-4 py-2 bg-white rounded-xl shadow-xs border border-slate-200 transition"
        >
          <ArrowLeft size={16} /> Back to Login
        </Link>
      </div>

      <div className="bg-white rounded-3xl p-6 sm:p-10 max-w-md w-full shadow-xl border border-slate-100 relative">
        <div className="flex justify-center mb-6">
          <BrandLogo theme="dark" href="/" height={34} />
        </div>

        <Suspense
          fallback={
            <div className="text-center py-8">
              <Loader size={32} className="animate-spin text-[#ff8a00] mx-auto" />
            </div>
          }
        >
          <ResetPasswordForm />
        </Suspense>
      </div>
    </div>
  );
}

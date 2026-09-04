'use client';

import { useState, type FormEvent, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Lock, Eye, EyeOff, Check, X, ShieldCheck, AlertCircle } from 'lucide-react';
import { validatePasswordPolicy } from '@/lib/passwordPolicy';
import { authService } from '@/lib/authSession';
import { useAuthStore } from '@/store/authStore';

export default function ChangePasswordForm() {
  const router = useRouter();
  const logout = useAuthStore((state) => state.logout);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const newPasswordRef = useRef<HTMLInputElement>(null);
  const confirmPasswordRef = useRef<HTMLInputElement>(null);

  const policy = validatePasswordPolicy(newPassword);
  const isMatch = newPassword.length > 0 && newPassword === confirmPassword;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!currentPassword) {
      setError('Please provide your current password.');
      return;
    }

    if (!policy.isValid) {
      setError('New password does not meet the security policy requirements.');
      newPasswordRef.current?.focus();
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('New passwords do not match.');
      confirmPasswordRef.current?.focus();
      return;
    }

    if (currentPassword === newPassword) {
      setError('New password must be different from your current password.');
      newPasswordRef.current?.focus();
      return;
    }

    setLoading(true);
    try {
      await authService.changePassword({ currentPassword, newPassword });
      setSuccess('Password changed successfully! All sessions have been logged out for security. Redirecting to login...');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      
      // Complete cleanup & redirect to login
      setTimeout(async () => {
        await logout();
        router.push('/login?message=Password+updated.+Please+sign+in+with+your+new+password.');
      }, 1500);
    } catch (err: unknown) {
      const axiosError = err as { response?: { data?: { error?: { message?: string }; message?: string } } };
      const msg = axiosError.response?.data?.error?.message
        || axiosError.response?.data?.message
        || 'Failed to update password. Please verify your current password.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
          <ShieldCheck className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-[#0b132b]">Change Password</h2>
          <p className="text-xs text-slate-500">
            Ensure your account is protected with a strong, enterprise-grade password.
          </p>
        </div>
      </div>

      {error && (
        <div role="alert" className="mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div role="status" className="mt-4 flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
          <Check className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div>
          <label htmlFor="current-password" className="block text-xs font-semibold uppercase tracking-wider text-slate-700">
            Current Password
          </label>
          <div className="relative mt-1">
            <input
              id="current-password"
              type={showCurrent ? 'text' : 'password'}
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-[#0b132b] focus:outline-none focus:ring-1 focus:ring-[#0b132b]"
              placeholder="Enter current password"
            />
            <button
              type="button"
              onClick={() => setShowCurrent(!showCurrent)}
              aria-label={showCurrent ? 'Hide current password' : 'Show current password'}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <div>
          <label htmlFor="new-password" className="block text-xs font-semibold uppercase tracking-wider text-slate-700">
            New Password
          </label>
          <div className="relative mt-1">
            <input
              id="new-password"
              ref={newPasswordRef}
              type={showNew ? 'text' : 'password'}
              required
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-[#0b132b] focus:outline-none focus:ring-1 focus:ring-[#0b132b]"
              placeholder="At least 12 characters"
            />
            <button
              type="button"
              onClick={() => setShowNew(!showNew)}
              aria-label={showNew ? 'Hide new password' : 'Show new password'}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>

          {/* Policy Checklist */}
          <div className="mt-3 rounded-lg border border-slate-100 bg-slate-50 p-3">
            <div className="mb-2 flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-600">Password Policy Strength</span>
              <span className={`font-bold ${policy.isValid ? 'text-emerald-600' : 'text-amber-600'}`}>
                {policy.score} / 7 requirements met
              </span>
            </div>
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 text-xs">
              <div className={`flex items-center gap-1.5 ${policy.hasLength ? 'text-emerald-700' : 'text-slate-500'}`}>
                {policy.hasLength ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <X className="h-3.5 w-3.5 text-slate-400" />}
                <span>At least 12 characters</span>
              </div>
              <div className={`flex items-center gap-1.5 ${policy.hasUpper ? 'text-emerald-700' : 'text-slate-500'}`}>
                {policy.hasUpper ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <X className="h-3.5 w-3.5 text-slate-400" />}
                <span>Uppercase letter (A-Z)</span>
              </div>
              <div className={`flex items-center gap-1.5 ${policy.hasLower ? 'text-emerald-700' : 'text-slate-500'}`}>
                {policy.hasLower ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <X className="h-3.5 w-3.5 text-slate-400" />}
                <span>Lowercase letter (a-z)</span>
              </div>
              <div className={`flex items-center gap-1.5 ${policy.hasNumber ? 'text-emerald-700' : 'text-slate-500'}`}>
                {policy.hasNumber ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <X className="h-3.5 w-3.5 text-slate-400" />}
                <span>Number (0-9)</span>
              </div>
              <div className={`flex items-center gap-1.5 ${policy.hasSpecial ? 'text-emerald-700' : 'text-slate-500'}`}>
                {policy.hasSpecial ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <X className="h-3.5 w-3.5 text-slate-400" />}
                <span>Special character (!@#$...)</span>
              </div>
              <div className={`flex items-center gap-1.5 ${policy.hasNoRepeat ? 'text-emerald-700' : 'text-slate-500'}`}>
                {policy.hasNoRepeat ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <X className="h-3.5 w-3.5 text-slate-400" />}
                <span>No repeated characters (aaa)</span>
              </div>
              <div className={`flex items-center gap-1.5 ${policy.hasNoSequential ? 'text-emerald-700' : 'text-slate-500'}`}>
                {policy.hasNoSequential ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <X className="h-3.5 w-3.5 text-slate-400" />}
                <span>No sequential characters (abc)</span>
              </div>
            </div>
          </div>
        </div>

        <div>
          <label htmlFor="confirm-password" className="block text-xs font-semibold uppercase tracking-wider text-slate-700">
            Confirm New Password
          </label>
          <div className="relative mt-1">
            <input
              id="confirm-password"
              ref={confirmPasswordRef}
              type={showConfirm ? 'text' : 'password'}
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-[#0b132b] focus:outline-none focus:ring-1 focus:ring-[#0b132b]"
              placeholder="Re-enter new password"
            />
            <button
              type="button"
              onClick={() => setShowConfirm(!showConfirm)}
              aria-label={showConfirm ? 'Hide confirm password' : 'Show confirm password'}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {confirmPassword.length > 0 && (
            <p className={`mt-1 text-xs font-medium ${isMatch ? 'text-emerald-600' : 'text-red-600'}`}>
              {isMatch ? '✓ Passwords match' : '✗ Passwords do not match'}
            </p>
          )}
        </div>

        <div className="pt-2">
          <button
            type="submit"
            disabled={loading || !policy.isValid || !isMatch}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#0b132b] py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1c2a4f] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Lock className="h-4 w-4" />
            {loading ? 'Updating Password...' : 'Update Password'}
          </button>
        </div>
      </form>
    </div>
  );
}

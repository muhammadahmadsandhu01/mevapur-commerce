'use client';
export const dynamic = 'force-dynamic';

import { useState, useRef } from 'react';
import Link from 'next/link';
import { Mail, ArrowLeft, CheckCircle, Loader, AlertCircle, ArrowRight } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import Toast from '@/components/Toast';
import BrandLogo from '@/components/brand/BrandLogo';

export default function ForgotPasswordPage() {
  const { forgotPassword } = useAuthStore();

  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  const emailInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email.trim()) {
      setError('Email is required');
      emailInputRef.current?.focus();
      return;
    }

    if (!/\S+@\S+\.\S+/.test(email)) {
      setError('Please enter a valid email');
      emailInputRef.current?.focus();
      return;
    }

    setLoading(true);

    try {
      const result = await forgotPassword(email);

      if (result.success) {
        setSuccess(true);
        setToast({ message: '✅ ' + result.message, type: 'success' });
      } else {
        setError(result.message);
        setToast({ message: '❌ ' + result.message, type: 'error' });
        emailInputRef.current?.focus();
      }
    } catch {
      setToast({ message: '❌ Something went wrong', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

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

      <div className="w-full max-w-md bg-white rounded-3xl shadow-xl p-6 sm:p-10 text-center border border-slate-100">
        <div className="flex justify-center mb-6">
          <BrandLogo theme="dark" href="/" height={34} />
        </div>

        {!success ? (
          <>
            <div className="w-16 h-16 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center mx-auto mb-5">
              <Mail size={32} />
            </div>

            <h1 className="text-2xl font-extrabold text-slate-900 mb-2">
              Forgot Password?
            </h1>
            <p className="text-sm text-slate-500 mb-6 leading-relaxed">
              No worries! Enter your email address and we&apos;ll send you a link to reset your password.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              <div>
                <label htmlFor="forgot-email" className="block text-xs font-semibold text-slate-700 mb-1.5 text-left">
                  Email Address
                </label>
                <div className="relative">
                  <Mail size={18} className={`absolute left-3.5 top-1/2 -translate-y-1/2 ${error ? 'text-red-500' : 'text-slate-400'}`} />
                  <input
                    ref={emailInputRef}
                    id="forgot-email"
                    type="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (error) setError('');
                    }}
                    placeholder="you@example.com"
                    aria-invalid={!!error}
                    aria-describedby={error ? 'forgot-email-error' : undefined}
                    className={`w-full pl-10 pr-4 py-3 rounded-xl border text-sm outline-none transition bg-slate-50 text-slate-900 ${
                      error ? 'border-red-500 focus:ring-2 focus:ring-red-100' : 'border-slate-300 focus:border-[#ff8a00] focus:ring-2 focus:ring-orange-100'
                    }`}
                  />
                </div>
                {error && (
                  <div id="forgot-email-error" role="alert" className="flex items-center gap-1 mt-1.5 text-xs text-red-600 font-medium text-left">
                    <AlertCircle size={12} /> {error}
                  </div>
                )}
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 px-4 bg-[#ff8a00] hover:bg-[#e67c00] text-[#0b132b] font-bold text-sm rounded-xl transition shadow-xs flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <Loader size={18} className="animate-spin" />
                    <span>Sending...</span>
                  </>
                ) : (
                  <>
                    <span>Send Reset Link</span>
                    <ArrowRight size={18} />
                  </>
                )}
              </button>

              <div className="text-center pt-2 text-xs text-slate-500">
                Remember your password?{' '}
                <Link href="/login" className="text-[#0b132b] font-bold hover:text-[#ff8a00]">
                  Sign In
                </Link>
              </div>
            </form>
          </>
        ) : (
          <>
            <div className="w-16 h-16 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-5">
              <CheckCircle size={36} />
            </div>

            <h1 className="text-2xl font-extrabold text-slate-900 mb-2">
              Check Your Email
            </h1>
            <p className="text-sm text-slate-600 mb-6 leading-relaxed">
              We&apos;ve sent a password reset link to{' '}
              <strong className="text-slate-900">{email}</strong>.
              <br /><br />
              Please check your inbox and follow the instructions.
            </p>

            <div className="p-4 bg-amber-50 rounded-xl border border-amber-200 mb-6 text-xs text-amber-800 text-left">
              <strong>💡 Tip:</strong> If you don&apos;t see the email, check your spam folder or click below to resend.
            </div>

            <button
              type="button"
              onClick={() => { setSuccess(false); setEmail(''); }}
              className="w-full py-3 px-4 bg-white border-2 border-[#ff8a00] text-[#0b132b] font-bold text-sm rounded-xl hover:bg-slate-50 transition mb-3"
            >
              Resend Email
            </button>

            <Link
              href="/login"
              className="inline-flex w-full items-center justify-center py-3.5 px-4 bg-[#ff8a00] hover:bg-[#e67c00] text-[#0b132b] font-bold text-sm rounded-xl transition shadow-xs"
            >
              Back to Login
            </Link>
          </>
        )}
      </div>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}

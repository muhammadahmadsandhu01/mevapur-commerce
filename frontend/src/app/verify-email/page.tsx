'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  CheckCircle,
  AlertCircle,
  Loader,
  Mail,
  ArrowLeft,
  SendHorizontal,
  LogIn
} from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import BrandLogo from '@/components/brand/BrandLogo';
import Toast from '@/components/Toast';
import { isSafeLocalRedirect } from '@/lib/routeClassification';

type VerificationState = 'verifying' | 'success' | 'error' | 'no_token';

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token')?.trim() || '';
  const rawRedirect = searchParams.get('redirect');
  const safeRedirect = isSafeLocalRedirect(rawRedirect, '/');

  const { verifyEmail, resendVerification } = useAuthStore();

  const [state, setState] = useState<VerificationState>(token ? 'verifying' : 'no_token');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [resendEmail, setResendEmail] = useState('');
  const [resending, setResending] = useState(false);
  const [resendStatus, setResendStatus] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  const verificationAttempted = useRef(false);

  useEffect(() => {
    if (!token || verificationAttempted.current) return;
    verificationAttempted.current = true;

    let isMounted = true;

    (async () => {
      try {
        const result = await verifyEmail(token);
        if (!isMounted) return;

        if (result.success) {
          setState('success');
          setToast({ message: 'Email verified successfully!', type: 'success' });
        } else {
          setState('error');
          setErrorMessage(result.message || 'Verification token is invalid, expired, or has already been used.');
        }
      } catch {
        if (!isMounted) return;
        setState('error');
        setErrorMessage('Verification failed. The link may have expired or already been used.');
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [token, verifyEmail]);

  const handleResend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resendEmail.trim() || !/\S+@\S+\.\S+/.test(resendEmail)) {
      setToast({ message: 'Please enter a valid email address', type: 'error' });
      return;
    }

    setResending(true);
    setResendStatus(null);

    try {
      const result = await resendVerification(
        resendEmail.trim(),
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

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4 sm:p-6 relative">
      <div className="w-full max-w-md mb-4 flex justify-start">
        <Link
          href={loginUrl}
          className="inline-flex items-center gap-2 text-[#0b132b] hover:text-[#ff8a00] font-semibold text-sm px-4 py-2 bg-white rounded-xl shadow-xs border border-slate-200 transition"
        >
          <ArrowLeft size={16} /> Back to Login
        </Link>
      </div>

      <div className="bg-white rounded-3xl p-6 sm:p-10 max-w-md w-full shadow-xl border border-slate-100 relative text-center">
        <div className="flex justify-center mb-6">
          <BrandLogo theme="dark" href="/" height={34} />
        </div>

        {/* State: Verifying */}
        {state === 'verifying' && (
          <div className="py-6">
            <div className="w-16 h-16 rounded-full bg-orange-50 text-[#ff8a00] flex items-center justify-center mx-auto mb-4">
              <Loader size={32} className="animate-spin" />
            </div>
            <h1 className="text-xl font-extrabold text-[#0b132b] mb-2">
              Verifying Your Email
            </h1>
            <p className="text-sm text-slate-500 leading-relaxed">
              Please wait while we confirm your email verification token...
            </p>
          </div>
        )}

        {/* State: Success */}
        {state === 'success' && (
          <div className="py-4">
            <div className="w-16 h-16 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-4">
              <CheckCircle size={36} />
            </div>
            <h1 className="text-xl font-extrabold text-[#0b132b] mb-2">
              Email Verified Successfully!
            </h1>
            <p className="text-sm text-slate-500 leading-relaxed mb-6">
              Your email address has been verified. You may now log in to access your account.
            </p>
            <Link
              href={loginUrl}
              className="w-full py-3.5 px-4 bg-[#ff8a00] hover:bg-[#e67c00] text-[#0b132b] font-bold text-sm rounded-xl transition shadow-xs flex items-center justify-center gap-2"
            >
              <LogIn size={18} />
              <span>Log In to Continue</span>
            </Link>
          </div>
        )}

        {/* State: Error (Invalid / Expired / Reused) */}
        {state === 'error' && (
          <div className="py-2">
            <div className="w-16 h-16 rounded-full bg-red-50 text-red-600 flex items-center justify-center mx-auto mb-4">
              <AlertCircle size={36} />
            </div>
            <h1 className="text-xl font-extrabold text-[#0b132b] mb-2">
              Verification Link Invalid or Expired
            </h1>
            <p className="text-sm text-slate-500 leading-relaxed mb-5">
              {errorMessage || 'This verification link is invalid, has expired, or has already been used. Please request a new verification email below.'}
            </p>

            <form onSubmit={handleResend} className="space-y-3.5 text-left mb-4" noValidate>
              <div>
                <label htmlFor="resend-email" className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Your Email Address
                </label>
                <div className="relative">
                  <Mail size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    id="resend-email"
                    type="email"
                    value={resendEmail}
                    onChange={(e) => setResendEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-300 text-sm outline-none transition bg-slate-50 text-slate-900 focus:border-[#ff8a00] focus:ring-2 focus:ring-orange-100"
                  />
                </div>
              </div>

              {resendStatus && (
                <div role="status" className="bg-blue-50 text-blue-800 p-3 rounded-xl text-xs border border-blue-200">
                  {resendStatus}
                </div>
              )}

              <button
                type="submit"
                disabled={resending}
                className="w-full py-3 px-4 bg-[#0b132b] hover:bg-[#1a2744] text-white font-bold text-sm rounded-xl transition flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {resending ? (
                  <>
                    <Loader size={16} className="animate-spin" />
                    <span>Sending New Link...</span>
                  </>
                ) : (
                  <>
                    <SendHorizontal size={16} />
                    <span>Resend Verification Email</span>
                  </>
                )}
              </button>
            </form>

            <div className="pt-2 border-t border-slate-100">
              <Link
                href={loginUrl}
                className="text-xs font-bold text-[#0b132b] hover:text-[#ff8a00] transition"
              >
                Return to Login
              </Link>
            </div>
          </div>
        )}

        {/* State: No Token Provided */}
        {state === 'no_token' && (
          <div className="py-2">
            <div className="w-16 h-16 rounded-full bg-orange-50 text-[#ff8a00] flex items-center justify-center mx-auto mb-4">
              <Mail size={32} />
            </div>
            <h1 className="text-xl font-extrabold text-[#0b132b] mb-2">
              Resend Verification Email
            </h1>
            <p className="text-sm text-slate-500 leading-relaxed mb-5">
              Enter your email address below and we will send you a fresh verification link.
            </p>

            <form onSubmit={handleResend} className="space-y-3.5 text-left mb-4" noValidate>
              <div>
                <label htmlFor="resend-email-direct" className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Your Email Address
                </label>
                <div className="relative">
                  <Mail size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    id="resend-email-direct"
                    type="email"
                    value={resendEmail}
                    onChange={(e) => setResendEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-300 text-sm outline-none transition bg-slate-50 text-slate-900 focus:border-[#ff8a00] focus:ring-2 focus:ring-orange-100"
                  />
                </div>
              </div>

              {resendStatus && (
                <div role="status" className="bg-blue-50 text-blue-800 p-3 rounded-xl text-xs border border-blue-200">
                  {resendStatus}
                </div>
              )}

              <button
                type="submit"
                disabled={resending}
                className="w-full py-3.5 px-4 bg-[#ff8a00] hover:bg-[#e67c00] text-[#0b132b] font-bold text-sm rounded-xl transition shadow-xs flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {resending ? (
                  <>
                    <Loader size={16} className="animate-spin" />
                    <span>Sending Link...</span>
                  </>
                ) : (
                  <>
                    <SendHorizontal size={16} />
                    <span>Send Verification Link</span>
                  </>
                )}
              </button>
            </form>

            <div className="pt-2 border-t border-slate-100">
              <Link
                href={loginUrl}
                className="text-xs font-bold text-[#0b132b] hover:text-[#ff8a00] transition"
              >
                Back to Login
              </Link>
            </div>
          </div>
        )}
      </div>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-50 flex items-center justify-center">
          <div className="text-center">
            <Loader size={36} className="animate-spin text-[#ff8a00] mx-auto mb-3" />
            <p className="text-sm text-slate-500 font-medium">Loading verification...</p>
          </div>
        </div>
      }
    >
      <VerifyEmailContent />
    </Suspense>
  );
}

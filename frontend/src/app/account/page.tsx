'use client';
export const dynamic = 'force-dynamic';

import { type FormEvent, useCallback, useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import {
  User,
  MapPin,
  RotateCcw,
  Bell,
  Loader2,
  ShieldCheck,
  MessageSquare
} from 'lucide-react';
import ReturnRequestForm from '@/components/account/ReturnRequestForm';
import AddressBook from '@/components/account/AddressBook';
import MyReviewsList from '@/components/account/MyReviewsList';
import ChangePasswordForm from '@/components/account/ChangePasswordForm';
import SessionManager from '@/components/account/SessionManager';
import NotificationsList from '@/components/account/NotificationsList';
import {
  accountService,
  type AccountProfile,
  type AccountRefundSummary,
  type AccountReturnSummary,
  getAccountApiErrorMessage
} from '@/services/account.service';
import { useAuthStore } from '@/store/authStore';
import { formatMoney } from '@/lib/money';
import { getSessionGeneration, isCurrentSessionGeneration } from '@/lib/authSession';
import Toast from '@/components/Toast';

type AccountTab = 'profile' | 'addresses' | 'orders' | 'reviews' | 'security' | 'notifications';

function AccountPageContent() {
  const { isAuthenticated, isInitialized, updateUser, bootstrap } = useAuthStore();
  const searchParams = useSearchParams();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<AccountTab>('profile');
  const [profile, setProfile] = useState<AccountProfile | null>(null);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [avatar, setAvatar] = useState('');
  const [returns, setReturns] = useState<AccountReturnSummary[]>([]);
  const [refunds, setRefunds] = useState<AccountRefundSummary[]>([]);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  // Sync tab with search params if present
  useEffect(() => {
    const timer = setTimeout(() => {
      const tabParam = searchParams.get('tab') as AccountTab;
      if (tabParam && ['profile', 'addresses', 'orders', 'reviews', 'security', 'notifications'].includes(tabParam)) {
        setActiveTab(tabParam);
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [searchParams]);

  const loadData = useCallback(async () => {
    const gen = getSessionGeneration();
    if (!isAuthenticated) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const [profileResult, returnResult, refundResult] = await Promise.all([
        accountService.profile(),
        accountService.returns().catch(() => ({ returns: [] })),
        accountService.refunds().catch(() => ({ refunds: [] }))
      ]);

      if (isCurrentSessionGeneration(gen)) {
        setProfile(profileResult.profile);
        setFullName(profileResult.profile.fullName || '');
        setPhone(profileResult.profile.phone || '');
        setAvatar(profileResult.profile.avatar || '');
        setReturns(returnResult.returns || []);
        setRefunds(refundResult.refunds || []);
      }
    } catch {
      if (isCurrentSessionGeneration(gen)) {
        setToast({ message: 'Your account details could not be loaded.', type: 'error' });
      }
    } finally {
      if (isCurrentSessionGeneration(gen)) {
        setLoading(false);
      }
    }
  }, [isAuthenticated]);

  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;
    if (isInitialized && isAuthenticated) {
      timer = setTimeout(() => {
        void loadData();
      }, 0);
    } else if (isInitialized && !isAuthenticated) {
      timer = setTimeout(() => {
        setLoading(false);
      }, 0);
    }
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [isInitialized, isAuthenticated, loadData]);

  const handleSaveProfile = async (e: FormEvent) => {
    e.preventDefault();
    if (savingProfile) return;

    setSavingProfile(true);
    try {
      const payload: Partial<Pick<AccountProfile, 'fullName' | 'phone' | 'avatar'>> = {
        fullName: fullName.trim(),
        phone: phone.trim(),
        ...(avatar.trim() ? { avatar: avatar.trim() } : { avatar: '' })
      };
      const result = await accountService.updateProfile(payload);
      setProfile(result.profile);
      updateUser(result.profile);
      setToast({ message: 'Profile updated successfully.', type: 'success' });
    } catch (err) {
      setToast({ message: getAccountApiErrorMessage(err, 'Failed to update profile.'), type: 'error' });
    } finally {
      setSavingProfile(false);
    }
  };

  const selectTab = (tab: AccountTab) => {
    setActiveTab(tab);
    router.replace(`/account?tab=${tab}`);
  };

  if (!isInitialized || loading) {
    return (
      <main className="min-h-[70vh] flex flex-col items-center justify-center p-4 bg-slate-50">
        <Loader2 className="w-10 h-10 text-[#ff8a00] animate-spin mb-4" />
        <p className="text-sm font-semibold text-slate-700">Loading your account...</p>
      </main>
    );
  }

  if (!isAuthenticated) {
    return (
      <main className="min-h-[70vh] max-w-lg mx-auto flex flex-col items-center justify-center p-6 text-center bg-slate-50">
        <div className="w-16 h-16 rounded-full bg-orange-100 text-[#0b132b] flex items-center justify-center mb-4">
          <User size={32} className="text-[#ff8a00]" />
        </div>
        <h1 className="text-2xl font-black text-slate-900 mb-2">Sign In to Your Account</h1>
        <p className="text-sm text-slate-600 mb-6">
          Access your personal profile, addresses, orders, reviews, security settings, and notifications.
        </p>
        <Link
          href="/login?redirect=/account"
          className="px-6 py-3 bg-[#0b132b] text-white font-bold text-sm rounded-xl hover:bg-slate-800 transition"
        >
          Sign In
        </Link>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header Banner */}
        <div className="flex flex-col justify-between gap-4 rounded-2xl bg-white p-6 border border-slate-200 shadow-xs sm:flex-row sm:items-center">
          <div className="flex items-center gap-4">
            <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-full border border-slate-200 bg-slate-100 flex items-center justify-center text-slate-500 font-bold text-xl">
              {profile?.avatar ? (
                <Image src={profile.avatar} alt={profile.fullName || 'User'} fill sizes="56px" className="object-cover" />
              ) : (
                (profile?.fullName?.[0] || 'U').toUpperCase()
              )}
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-[#0b132b]">{profile?.fullName || 'Customer Account'}</h1>
              <p className="text-xs text-slate-500">{profile?.email}</p>
            </div>
          </div>
          <Link
            href="/products"
            className="inline-flex items-center justify-center rounded-xl bg-[#0b132b] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1c2a4f] shadow-xs"
          >
            Continue Shopping
          </Link>
        </div>

        {/* Dashboard Navigation Tabs */}
        <div className="flex overflow-x-auto border-b border-slate-200 bg-white rounded-xl p-1.5 shadow-xs gap-1" role="tablist">
          <button
            role="tab"
            aria-selected={activeTab === 'profile'}
            onClick={() => selectTab('profile')}
            className={`flex shrink-0 items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-bold transition ${
              activeTab === 'profile' ? 'bg-[#0b132b] text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <User className="h-4 w-4" /> Personal Profile
          </button>
          <button
            role="tab"
            aria-selected={activeTab === 'addresses'}
            onClick={() => selectTab('addresses')}
            className={`flex shrink-0 items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-bold transition ${
              activeTab === 'addresses' ? 'bg-[#0b132b] text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <MapPin className="h-4 w-4" /> Address Book
          </button>
          <button
            role="tab"
            aria-selected={activeTab === 'orders'}
            onClick={() => selectTab('orders')}
            className={`flex shrink-0 items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-bold transition ${
              activeTab === 'orders' ? 'bg-[#0b132b] text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <RotateCcw className="h-4 w-4" /> Orders & Returns
          </button>
          <button
            role="tab"
            aria-selected={activeTab === 'reviews'}
            onClick={() => selectTab('reviews')}
            className={`flex shrink-0 items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-bold transition ${
              activeTab === 'reviews' ? 'bg-[#0b132b] text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <MessageSquare className="h-4 w-4" /> My Reviews
          </button>
          <button
            role="tab"
            aria-selected={activeTab === 'security'}
            onClick={() => selectTab('security')}
            className={`flex shrink-0 items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-bold transition ${
              activeTab === 'security' ? 'bg-[#0b132b] text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <ShieldCheck className="h-4 w-4" /> Security & Sessions
          </button>
          <button
            role="tab"
            aria-selected={activeTab === 'notifications'}
            onClick={() => selectTab('notifications')}
            className={`flex shrink-0 items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-bold transition ${
              activeTab === 'notifications' ? 'bg-[#0b132b] text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Bell className="h-4 w-4" /> Notifications
          </button>
        </div>

        {/* Tab 1: Profile Form */}
        {activeTab === 'profile' && (
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-50 text-orange-600">
                <User className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-[#0b132b]">Personal Details</h2>
                <p className="text-xs text-slate-500">
                  Update your contact information and public account details.
                </p>
              </div>
            </div>

            <form onSubmit={handleSaveProfile} className="mt-6 max-w-xl space-y-4">
              <div>
                <label htmlFor="prof-name" className="block text-xs font-semibold text-slate-700">Full Name *</label>
                <input
                  id="prof-name"
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-[#0b132b] focus:outline-none"
                  placeholder="Enter full name"
                />
              </div>

              <div>
                <label htmlFor="prof-email" className="block text-xs font-semibold text-slate-700">
                  Email Address <span className="text-slate-600 font-normal">(Read-only)</span>
                </label>
                <input
                  id="prof-email"
                  type="email"
                  disabled
                  value={profile?.email || ''}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-600 cursor-not-allowed"
                />
                <p className="mt-1 text-[11px] text-slate-600">
                  Email address is permanently associated with your login account and cannot be modified directly.
                </p>
              </div>

              <div>
                <label htmlFor="prof-phone" className="block text-xs font-semibold text-slate-700">Phone Number</label>
                <input
                  id="prof-phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-[#0b132b] focus:outline-none"
                  placeholder="03001234567"
                />
              </div>

              <div>
                <label htmlFor="prof-avatar" className="block text-xs font-semibold text-slate-700">Avatar Image URL (Optional)</label>
                <input
                  id="prof-avatar"
                  type="url"
                  value={avatar}
                  onChange={(e) => setAvatar(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-[#0b132b] focus:outline-none"
                  placeholder="https://example.com/avatar.jpg"
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={savingProfile || !fullName.trim()}
                  className="inline-flex items-center gap-2 rounded-lg bg-[#0b132b] px-5 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-[#1c2a4f] disabled:opacity-50"
                >
                  {savingProfile && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Save Profile Changes
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Tab 2: Address Book */}
        {activeTab === 'addresses' && <AddressBook />}

        {/* Tab 3: Orders & Returns */}
        {activeTab === 'orders' && (
          <div className="space-y-6">
            <ReturnRequestForm onSubmitted={loadData} />

            {/* Past Returns List */}
            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="text-base font-bold text-[#0b132b] mb-4">Past Return Requests</h3>
              {returns.length === 0 ? (
                <p className="text-xs text-slate-500">No return requests filed.</p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {returns.map((ret) => (
                    <div key={ret.id} className="py-3 flex items-center justify-between">
                      <div>
                        <p className="text-xs font-bold text-slate-900">Return #{ret.returnNumber}</p>
                        <p className="text-[11px] text-slate-500">Status: <span className="capitalize font-semibold">{ret.status}</span></p>
                      </div>
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700 capitalize">
                        {ret.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Refunds List */}
            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="text-base font-bold text-[#0b132b] mb-4">Refund History</h3>
              {refunds.length === 0 ? (
                <p className="text-xs text-slate-500">No refunds recorded.</p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {refunds.map((ref) => (
                    <div key={ref.id} className="py-3 flex items-center justify-between">
                      <div>
                        <p className="text-xs font-bold text-slate-900">Refund #{ref.refundNumber}</p>
                        <p className="text-[11px] text-slate-500">Amount: {formatMoney(ref.amount, ref.currency)}</p>
                      </div>
                      <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-semibold text-emerald-800 capitalize">
                        {ref.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 4: My Reviews */}
        {activeTab === 'reviews' && <MyReviewsList />}

        {/* Tab 5: Security & Active Sessions */}
        {activeTab === 'security' && (
          <div className="space-y-6">
            <ChangePasswordForm />
            <SessionManager />
          </div>
        )}

        {/* Tab 6: Notifications */}
        {activeTab === 'notifications' && <NotificationsList />}
      </div>

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </main>
  );
}

export default function AccountPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[70vh] flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-[#0b132b]" />
        </div>
      }
    >
      <AccountPageContent />
    </Suspense>
  );
}

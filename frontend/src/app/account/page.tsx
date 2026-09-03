'use client';
export const dynamic = 'force-dynamic';

import { type FormEvent, useCallback, useEffect, useState, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  User,
  MapPin,
  RotateCcw,
  Bell,
  Loader2,
  Plus,
  Edit2,
  Trash2,
} from 'lucide-react';
import ReturnRequestForm from '@/components/account/ReturnRequestForm';
import {
  accountService,
  type AccountProfile,
  type AccountRefundSummary,
  type AccountReturnSummary,
  type Address,
} from '@/services/account.service';
import { useAuthStore } from '@/store/authStore';
import { formatMoney } from '@/lib/money';
import Toast from '@/components/Toast';

interface AccountNotification {
  id: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

const blankAddress = (): Omit<Address, 'id'> => ({
  fullName: '',
  phone: '',
  address: '',
  addressLine2: '',
  city: '',
  province: 'Punjab',
  postalCode: '',
  country: 'PK',
  isDefault: false,
});

function AccountPageContent() {
  const { isAuthenticated, isInitialized, updateUser, bootstrap } = useAuthStore();
  const searchParams = useSearchParams();

  const [profile, setProfile] = useState<AccountProfile | null>(null);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [address, setAddress] = useState<Omit<Address, 'id'>>(blankAddress());
  const [editingAddressId, setEditingAddressId] = useState<string | null>(null);
  const [showAddressForm, setShowAddressForm] = useState(false);
  const [returns, setReturns] = useState<AccountReturnSummary[]>([]);
  const [refunds, setRefunds] = useState<AccountRefundSummary[]>([]);
  const [notifications, setNotifications] = useState<AccountNotification[]>([]);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const returnsSectionRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  const loadData = useCallback(async () => {
    if (!isAuthenticated) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const [profileResult, addressResult, returnResult, refundResult, notificationResult] =
        await Promise.all([
          accountService.profile(),
          accountService.addresses(),
          accountService.returns(),
          accountService.refunds(),
          accountService.notifications(),
        ]);

      setProfile(profileResult.profile);
      setAddresses(addressResult.addresses);
      setReturns(returnResult.returns);
      setRefunds(refundResult.refunds);
      setNotifications(
        (notificationResult as { notifications: AccountNotification[] }).notifications || []
      );
    } catch {
      setToast({ message: 'Your account data could not be fully loaded.', type: 'error' });
    } finally {
      setLoading(false);
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

  // Handle deep-link to returns section
  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab === 'returns' && returnsSectionRef.current) {
      returnsSectionRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [searchParams, loading]);

  const saveProfile = async (event: FormEvent) => {
    event.preventDefault();
    if (!profile || saving) return;

    setSaving(true);
    try {
      const result = await accountService.updateProfile({
        fullName: profile.fullName,
        phone: profile.phone,
      });
      setProfile(result.profile);
      updateUser(result.profile);
      setToast({ message: 'Profile updated successfully.', type: 'success' });
    } catch {
      setToast({ message: 'Profile could not be saved. Please check details.', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const saveAddress = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;

    setSaving(true);
    try {
      if (editingAddressId) {
        await accountService.updateAddress(editingAddressId, address);
        setToast({ message: 'Address updated.', type: 'success' });
      } else {
        await accountService.addAddress(address);
        setToast({ message: 'New address added.', type: 'success' });
      }
      setShowAddressForm(false);
      setEditingAddressId(null);
      setAddress(blankAddress());
      await loadData();
    } catch {
      setToast({ message: 'Address could not be saved.', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const deleteAddress = async (id: string) => {
    if (!confirm('Are you sure you want to delete this address?')) return;
    try {
      await accountService.removeAddress(id);
      setToast({ message: 'Address removed.', type: 'success' });
      await loadData();
    } catch {
      setToast({ message: 'Failed to delete address.', type: 'error' });
    }
  };

  const getReturnStatusBadge = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'refunded':
        return 'bg-emerald-100 text-emerald-800 border-emerald-200';
      case 'approved':
      case 'received':
      case 'inspected':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'rejected':
      case 'cancelled':
        return 'bg-rose-100 text-rose-800 border-rose-200';
      case 'pending':
      default:
        return 'bg-amber-100 text-amber-900 border-amber-200';
    }
  };

  if (!isInitialized || loading) {
    return (
      <main className="min-h-[70vh] flex flex-col items-center justify-center p-4 bg-slate-50">
        <Loader2 className="w-12 h-12 text-[#ff8a00] animate-spin mb-4" />
        <p className="text-sm font-semibold text-slate-700">Loading your account profile...</p>
      </main>
    );
  }

  if (!isAuthenticated) {
    return (
      <main className="min-h-[70vh] max-w-lg mx-auto flex flex-col items-center justify-center p-6 text-center bg-slate-50">
        <div className="w-16 h-16 rounded-full bg-orange-100 text-[#0b132b] flex items-center justify-center mb-4">
          <User size={32} className="text-[#ff8a00]" />
        </div>
        <h1 className="text-2xl font-black text-slate-900 mb-2">Sign in to view account</h1>
        <p className="text-sm text-slate-600 mb-6">
          Access your personal profile, addresses, returns, and notifications.
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
    <main className="min-h-screen bg-slate-50 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto space-y-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-[#0b132b]">My Account</h1>
          <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
            Manage your customer profile, delivery address book, and return requests.
          </p>
        </div>

        {/* Profile Settings */}
        <section className="bg-white p-6 sm:p-7 rounded-2xl border border-slate-200 shadow-xs">
          <h2 className="text-base font-extrabold text-slate-900 mb-4 pb-3 border-b border-slate-100 flex items-center gap-2">
            <User size={18} className="text-[#ff8a00]" /> Personal Profile
          </h2>

          <form onSubmit={saveProfile} className="space-y-4 max-w-lg">
            <div>
              <label htmlFor="accountFullName" className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-1.5">
                Full Name
              </label>
              <input
                id="accountFullName"
                type="text"
                required
                value={profile?.fullName || ''}
                onChange={(e) => setProfile(profile ? { ...profile, fullName: e.target.value } : null)}
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-xs font-semibold text-slate-900 outline-none focus:border-[#ff8a00] focus:ring-1 focus:ring-[#ff8a00] bg-white"
              />
            </div>

            <div>
              <label htmlFor="accountEmail" className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-1.5">
                Email Address
              </label>
              <input
                id="accountEmail"
                type="email"
                disabled
                value={profile?.email || ''}
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 bg-slate-100 text-xs font-semibold text-slate-500 outline-none cursor-not-allowed"
              />
            </div>

            <div>
              <label htmlFor="accountPhone" className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-1.5">
                Phone Number
              </label>
              <input
                id="accountPhone"
                type="tel"
                value={profile?.phone || ''}
                onChange={(e) => setProfile(profile ? { ...profile, phone: e.target.value } : null)}
                placeholder="03001234567"
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-xs font-semibold text-slate-900 outline-none focus:border-[#ff8a00] focus:ring-1 focus:ring-[#ff8a00] bg-white"
              />
            </div>

            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2.5 bg-[#0b132b] hover:bg-slate-800 text-white font-bold text-xs rounded-xl transition shadow-2xs disabled:opacity-50"
            >
              {saving ? 'Saving Profile...' : 'Save Profile'}
            </button>
          </form>
        </section>

        {/* Address Book */}
        <section className="bg-white p-6 sm:p-7 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100">
            <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
              <MapPin size={18} className="text-[#ff8a00]" /> Saved Delivery Addresses
            </h2>
            {!showAddressForm && (
              <button
                type="button"
                onClick={() => {
                  setEditingAddressId(null);
                  setAddress(blankAddress());
                  setShowAddressForm(true);
                }}
                className="inline-flex items-center gap-1 px-3 py-1.5 bg-[#ff8a00] hover:bg-[#ffab45] text-[#0b132b] font-bold text-xs rounded-lg transition shadow-2xs"
              >
                <Plus size={14} /> Add Address
              </button>
            )}
          </div>

          {showAddressForm && (
            <form onSubmit={saveAddress} className="mb-6 p-5 bg-slate-50 border border-slate-200 rounded-xl space-y-4">
              <h3 className="text-xs font-black uppercase text-slate-900">
                {editingAddressId ? 'Edit Address' : 'Add New Delivery Address'}
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">Full Name</label>
                  <input
                    type="text"
                    required
                    value={address.fullName}
                    onChange={(e) => setAddress({ ...address, fullName: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg text-xs bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Phone</label>
                  <input
                    type="tel"
                    required
                    value={address.phone}
                    onChange={(e) => setAddress({ ...address, phone: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg text-xs bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">City</label>
                  <input
                    type="text"
                    required
                    value={address.city}
                    onChange={(e) => setAddress({ ...address, city: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg text-xs bg-white"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">Address</label>
                  <input
                    type="text"
                    required
                    value={address.address}
                    onChange={(e) => setAddress({ ...address, address: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg text-xs bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Province</label>
                  <select
                    value={address.province}
                    onChange={(e) => setAddress({ ...address, province: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg text-xs bg-white"
                  >
                    <option value="Punjab">Punjab</option>
                    <option value="Sindh">Sindh</option>
                    <option value="Khyber Pakhtunkhwa">Khyber Pakhtunkhwa</option>
                    <option value="Balochistan">Balochistan</option>
                    <option value="Islamabad Capital Territory">Islamabad Capital Territory</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Postal Code</label>
                  <input
                    type="text"
                    value={address.postalCode || ''}
                    onChange={(e) => setAddress({ ...address, postalCode: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg text-xs bg-white"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={address.isDefault}
                    onChange={(e) => setAddress({ ...address, isDefault: e.target.checked })}
                    className="rounded text-[#ff8a00]"
                  />
                  Set as default shipping address
                </label>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowAddressForm(false)}
                    className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-bold text-slate-700 hover:bg-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-4 py-1.5 bg-[#0b132b] text-white rounded-lg text-xs font-bold hover:bg-slate-800 disabled:opacity-50"
                  >
                    {saving ? 'Saving...' : 'Save Address'}
                  </button>
                </div>
              </div>
            </form>
          )}

          {addresses.length === 0 ? (
            <p className="text-xs text-slate-500 italic">No saved addresses yet.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {addresses.map((addr) => (
                <div
                  key={addr.id}
                  className="p-4 rounded-xl border border-slate-200 bg-white hover:border-slate-300 transition text-xs space-y-1 relative"
                >
                  {addr.isDefault && (
                    <span className="inline-block px-2 py-0.5 bg-emerald-100 text-emerald-800 font-extrabold text-[10px] rounded mb-1">
                      Default Shipping Address
                    </span>
                  )}
                  <p className="font-extrabold text-slate-900">{addr.fullName}</p>
                  <p className="text-slate-600">{addr.phone}</p>
                  <p className="text-slate-700">{addr.address}</p>
                  <p className="text-slate-700">
                    {[addr.city, addr.province, addr.postalCode].filter(Boolean).join(', ')}
                  </p>

                  <div className="flex items-center gap-2 pt-2 border-t border-slate-100 mt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingAddressId(addr.id);
                        setAddress({
                          fullName: addr.fullName,
                          phone: addr.phone,
                          address: addr.address,
                          addressLine2: addr.addressLine2,
                          city: addr.city,
                          province: addr.province,
                          postalCode: addr.postalCode,
                          country: addr.country || 'PK',
                          isDefault: addr.isDefault,
                        });
                        setShowAddressForm(true);
                      }}
                      className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-700 hover:text-slate-900"
                    >
                      <Edit2 size={12} /> Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteAddress(addr.id)}
                      className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-600 hover:text-rose-800 ml-2"
                    >
                      <Trash2 size={12} /> Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Returns & Refunds Section */}
        <section
          id="returns"
          ref={returnsSectionRef}
          className="bg-white p-6 sm:p-7 rounded-2xl border border-slate-200 shadow-xs space-y-6"
        >
          <div className="pb-3 border-b border-slate-100">
            <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
              <RotateCcw size={18} className="text-[#ff8a00]" /> Returns & Refunds Management
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Submit return requests for delivered orders within our authoritative 30-day window.
            </p>
          </div>

          {/* Return Request Form Component */}
          <ReturnRequestForm
            initialOrderId={searchParams.get('order') || ''}
            initialProductId={searchParams.get('product') || ''}
            initialVariantId={searchParams.get('variant') || ''}
            onSubmitted={loadData}
          />

          {/* Submitted Returns List */}
          {returns.length > 0 && (
            <div className="pt-4 border-t border-slate-100 space-y-3">
              <h3 className="text-xs font-black uppercase text-slate-900">Your Submitted Return Requests</h3>
              <div className="divide-y divide-slate-100">
                {returns.map((entry) => (
                  <div key={entry.id} className="py-2.5 flex items-center justify-between text-xs">
                    <div>
                      <span className="font-mono font-bold text-slate-900">Return #{entry.returnNumber}</span>
                      <span className="text-slate-500 ml-2">({entry.status})</span>
                    </div>
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${getReturnStatusBadge(entry.status)}`}>
                      {entry.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Refunds List */}
          {refunds.length > 0 && (
            <div className="pt-4 border-t border-slate-100 space-y-3">
              <h3 className="text-xs font-black uppercase text-slate-900">Recorded Refunds</h3>
              <div className="divide-y divide-slate-100">
                {refunds.map((entry) => (
                  <div key={entry.id} className="py-2.5 flex items-center justify-between text-xs">
                    <div>
                      <span className="font-mono font-bold text-slate-900">Refund #{entry.refundNumber}</span>
                      <span className="text-slate-500 ml-2">Status: {entry.status}</span>
                    </div>
                    <span className="font-black text-slate-900">
                      {formatMoney(entry.amount, entry.currency)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Notifications Section */}
        <section className="bg-white p-6 sm:p-7 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100">
            <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
              <Bell size={18} className="text-[#ff8a00]" /> Account Notifications
            </h2>
            {notifications.some((n) => !n.isRead) && (
              <button
                type="button"
                onClick={async () => {
                  await accountService.markAllNotificationsRead();
                  await loadData();
                }}
                className="text-xs font-bold text-[#0b132b] hover:underline"
              >
                Mark all read
              </button>
            )}
          </div>

          {notifications.length === 0 ? (
            <p className="text-xs text-slate-500 italic">No account notifications.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {notifications.map((entry) => (
                <div key={entry.id} className="py-3 flex items-start justify-between gap-4 text-xs">
                  <div className="flex-1">
                    <p className={`font-bold ${entry.isRead ? 'text-slate-700' : 'text-slate-900 font-extrabold'}`}>
                      {!entry.isRead && <span className="inline-block w-2 h-2 rounded-full bg-[#ff8a00] mr-2" />}
                      {entry.title}
                    </p>
                    <p className="text-slate-600 mt-0.5">{entry.message}</p>
                    <p className="text-[10px] text-slate-400 mt-1">
                      {new Date(entry.createdAt).toLocaleString()}
                    </p>
                  </div>
                  {!entry.isRead && (
                    <button
                      type="button"
                      onClick={async () => {
                        await accountService.markNotificationRead(entry.id);
                        await loadData();
                      }}
                      className="text-[11px] font-bold text-slate-500 hover:text-slate-900 shrink-0"
                    >
                      Mark read
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </main>
  );
}

export default function AccountPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[70vh] flex flex-col items-center justify-center p-4 bg-slate-50">
          <Loader2 className="w-12 h-12 text-[#ff8a00] animate-spin mb-4" />
          <p className="text-slate-600 font-medium">Loading account...</p>
        </div>
      }
    >
      <AccountPageContent />
    </Suspense>
  );
}

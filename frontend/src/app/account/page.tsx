'use client';

import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import ReturnRequestForm from '@/components/account/ReturnRequestForm';
import {
  accountService,
  type AccountProfile,
  type AccountRefundSummary,
  type AccountReturnSummary,
  type Address
} from '@/services/account.service';
import { useAuthStore } from '@/store/authStore';

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
  province: '',
  postalCode: '',
  country: 'PK',
  isDefault: false
});

export default function AccountPage() {
  const { isAuthenticated, updateUser } = useAuthStore();
  const searchParams = useSearchParams();
  const [profile, setProfile] = useState<AccountProfile | null>(null);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [address, setAddress] = useState<Omit<Address, 'id'>>(blankAddress());
  const [editingAddressId, setEditingAddressId] = useState<string | null>(null);
  const [returns, setReturns] = useState<AccountReturnSummary[]>([]);
  const [refunds, setRefunds] = useState<AccountRefundSummary[]>([]);
  const [notifications, setNotifications] = useState<AccountNotification[]>([]);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const [
        profileResult,
        addressResult,
        returnResult,
        refundResult,
        notificationResult
      ] = await Promise.all([
        accountService.profile(),
        accountService.addresses(),
        accountService.returns(),
        accountService.refunds(),
        accountService.notifications()
      ]);
      setProfile(profileResult.profile);
      setAddresses(addressResult.addresses);
      setReturns(returnResult.returns);
      setRefunds(refundResult.refunds);
      setNotifications(
        (notificationResult as { notifications: AccountNotification[] }).notifications
      );
    } catch {
      setMessage('Your account data could not be loaded.');
    }
  }, [isAuthenticated]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const saveProfile = async (event: FormEvent) => {
    event.preventDefault();
    if (!profile) return;
    setSaving(true);
    try {
      const result = await accountService.updateProfile({
        fullName: profile.fullName,
        phone: profile.phone
      });
      setProfile(result.profile);
      updateUser(result.profile);
      setMessage('Profile saved.');
    } catch {
      setMessage('Profile was not saved.');
    } finally {
      setSaving(false);
    }
  };

  const saveAddress = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      if (editingAddressId) {
        await accountService.updateAddress(editingAddressId, address);
      } else {
        await accountService.addAddress(address);
      }
      setAddress(blankAddress());
      setEditingAddressId(null);
      await load();
      setMessage('Address saved.');
    } catch {
      setMessage('Address was not saved. Use an enabled market country.');
    } finally {
      setSaving(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <main style={{ padding: 32 }}>
        <h1>Account</h1>
        <p>Please <Link href="/login">sign in</Link> to manage your account.</p>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 1000, margin: '0 auto', padding: 24 }}>
      <h1>My Account</h1>
      <nav
        aria-label="Account navigation"
        style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}
      >
        <Link href="/orders">Orders & tracking</Link>
        <Link href="/wishlist">Wishlist</Link>
        <a href="#addresses">Addresses</a>
        <a href="#returns">Returns & refunds</a>
        <a href="#notifications">Notifications</a>
      </nav>
      {message && <p role="status">{message}</p>}

      <section>
        <h2>Profile</h2>
        {profile && (
          <form onSubmit={saveProfile} style={{ display: 'grid', gap: 8 }}>
            <label>
              Name
              <input
                value={profile.fullName}
                onChange={(event) => setProfile({
                  ...profile,
                  fullName: event.target.value
                })}
              />
            </label>
            <label>
              Phone
              <input
                value={profile.phone || ''}
                onChange={(event) => setProfile({
                  ...profile,
                  phone: event.target.value
                })}
              />
            </label>
            <p>Email: {profile.email}</p>
            <button disabled={saving}>Save profile</button>
          </form>
        )}
      </section>

      <section id="addresses">
        <h2>Saved addresses</h2>
        {addresses.map((entry) => (
          <article key={entry.id}>
            <strong>
              {entry.fullName}{entry.isDefault ? ' (default)' : ''}
            </strong>
            {' — '}{entry.address}, {entry.city}, {entry.country}{' '}
            <button onClick={() => {
              const { id, ...editable } = entry;
              setAddress(editable);
              setEditingAddressId(id);
            }}>
              Edit
            </button>{' '}
            <button onClick={() => {
              void accountService.removeAddress(entry.id).then(() => load());
            }}>
              Remove
            </button>
          </article>
        ))}
        <form
          onSubmit={saveAddress}
          style={{ display: 'grid', gap: 8, marginTop: 12 }}
        >
          <h3>{editingAddressId ? 'Edit address' : 'Add address'}</h3>
          {([
            'fullName',
            'phone',
            'address',
            'city',
            'province',
            'postalCode',
            'country'
          ] as const).map((field) => (
            <label key={field}>
              {field}
              <input
                required={field !== 'postalCode'}
                value={address[field] || ''}
                onChange={(event) => setAddress({
                  ...address,
                  [field]: field === 'country'
                    ? event.target.value.toUpperCase()
                    : event.target.value
                })}
              />
            </label>
          ))}
          <label>
            <input
              type="checkbox"
              checked={address.isDefault}
              onChange={(event) => setAddress({
                ...address,
                isDefault: event.target.checked
              })}
            />{' '}
            Default shipping address
          </label>
          <button disabled={saving}>
            {editingAddressId ? 'Save address' : 'Add address'}
          </button>
        </form>
      </section>

      <section id="returns">
        <h2>Returns & refunds</h2>
        {returns.map((entry) => (
          <p key={entry.id}>{entry.returnNumber} — {entry.status}</p>
        ))}
        {refunds.map((entry) => (
          <p key={entry.id}>
            {entry.refundNumber} — {entry.status} — {entry.amount} {entry.currency}
          </p>
        ))}
        <ReturnRequestForm
          initialOrderId={searchParams.get('order') || ''}
          initialProductId={searchParams.get('product') || ''}
          initialVariantId={searchParams.get('variant') || ''}
          onSubmitted={load}
        />
      </section>

      <section id="notifications">
        <h2>Notifications</h2>
        <button onClick={() => {
          void accountService.markAllNotificationsRead().then(() => load());
        }}>
          Mark all read
        </button>
        {notifications.map((entry) => (
          <article key={entry.id}>
            <strong>{entry.isRead ? '' : 'New: '}{entry.title}</strong>
            <p>{entry.message}</p>
            {!entry.isRead && (
              <button onClick={() => {
                void accountService.markNotificationRead(entry.id).then(() => load());
              }}>
                Mark read
              </button>
            )}
          </article>
        ))}
      </section>
    </main>
  );
}

'use client';

import { useState, useEffect, useCallback, type FormEvent } from 'react';
import { MapPin, Plus, Edit2, Trash2, CheckCircle, AlertCircle, Loader2, Star } from 'lucide-react';
import {
  accountService,
  type Address,
  type MarketCapability,
  getAccountApiErrorMessage
} from '@/services/account.service';
import { getSessionGeneration, isCurrentSessionGeneration } from '@/lib/authSession';

const blankAddress = (defaultCountry = 'PK'): Omit<Address, 'id'> => ({
  fullName: '',
  phone: '',
  address: '',
  addressLine2: '',
  city: '',
  province: 'Punjab',
  postalCode: '',
  country: defaultCountry,
  isDefault: false,
});

export default function AddressBook() {
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [market, setMarket] = useState<MarketCapability | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formState, setFormState] = useState<Omit<Address, 'id'>>(blankAddress());
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    const gen = getSessionGeneration();
    setLoading(true);
    setError(null);
    try {
      const [addressRes, marketRes] = await Promise.all([
        accountService.addresses(),
        accountService.market()
      ]);
      if (isCurrentSessionGeneration(gen)) {
        setAddresses(addressRes.addresses);
        setMarket(marketRes);
      }
    } catch {
      if (isCurrentSessionGeneration(gen)) {
        setError('Could not load address book.');
      }
    } finally {
      if (isCurrentSessionGeneration(gen)) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadData();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadData]);

  const handleStartAdd = () => {
    setEditingId(null);
    setFormState(blankAddress(market?.homeCountry || 'PK'));
    setShowForm(true);
    setError(null);
    setSuccess(null);
  };

  const handleStartEdit = (addr: Address) => {
    setEditingId(addr.id);
    setFormState({
      fullName: addr.fullName,
      phone: addr.phone,
      address: addr.address,
      addressLine2: addr.addressLine2 || '',
      city: addr.city,
      province: addr.province,
      postalCode: addr.postalCode || '',
      country: addr.country,
      isDefault: addr.isDefault,
    });
    setShowForm(true);
    setError(null);
    setSuccess(null);
  };

  const handleCancelForm = () => {
    setShowForm(false);
    setEditingId(null);
    setFormState(blankAddress(market?.homeCountry || 'PK'));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);

    // Validate country against authoritative market configuration
    const enabled = market?.enabledCountries || ['PK'];
    if (!enabled.includes(formState.country)) {
      setError(`Delivery is currently only supported to: ${enabled.join(', ')}`);
      setSaving(false);
      return;
    }

    try {
      if (editingId) {
        await accountService.updateAddress(editingId, formState);
        setSuccess('Address updated successfully.');
      } else {
        await accountService.addAddress(formState);
        setSuccess('Address added successfully.');
      }
      setShowForm(false);
      setEditingId(null);
      await loadData();
    } catch (err: unknown) {
      setError(getAccountApiErrorMessage(err, 'Failed to save address. Please check all required fields.'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this address?')) return;
    setDeletingId(id);
    setError(null);
    setSuccess(null);
    try {
      await accountService.removeAddress(id);
      setSuccess('Address deleted successfully.');
      await loadData();
    } catch (err: unknown) {
      setError(getAccountApiErrorMessage(err, 'Failed to delete address.'));
    } finally {
      setDeletingId(null);
    }
  };

  const handleSetDefault = async (addr: Address) => {
    if (addr.isDefault) return;
    setSaving(true);
    setError(null);
    try {
      await accountService.updateAddress(addr.id, { isDefault: true });
      setSuccess('Default address updated.');
      await loadData();
    } catch (err: unknown) {
      setError(getAccountApiErrorMessage(err, 'Failed to update default address.'));
    } finally {
      setSaving(false);
    }
  };

  const enabledCountries = market?.enabledCountries || ['PK'];

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col justify-between gap-4 border-b border-slate-100 pb-4 sm:flex-row sm:items-center">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-50 text-orange-600">
            <MapPin className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-[#0b132b]">Address Book</h2>
            <p className="text-xs text-slate-500">
              Manage your delivery addresses and set your default shipping destination.
            </p>
          </div>
        </div>

        {!showForm && (
          <button
            type="button"
            onClick={handleStartAdd}
            className="inline-flex items-center gap-2 rounded-lg bg-[#0b132b] px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-[#1c2a4f]"
          >
            <Plus className="h-4 w-4" />
            Add New Address
          </button>
        )}
      </div>

      {error && (
        <div role="alert" className="mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div role="status" className="mt-4 flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
          <CheckCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} className="mt-6 rounded-xl border border-slate-200 bg-slate-50/50 p-5 space-y-4">
          <h3 className="font-bold text-sm text-[#0b132b]">
            {editingId ? 'Edit Address' : 'Add New Address'}
          </h3>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="addr-fullName" className="block text-xs font-semibold text-slate-700">Full Name *</label>
              <input
                id="addr-fullName"
                type="text"
                required
                value={formState.fullName}
                onChange={(e) => setFormState({ ...formState, fullName: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#0b132b] focus:outline-none"
                placeholder="Recipient name"
              />
            </div>

            <div>
              <label htmlFor="addr-phone" className="block text-xs font-semibold text-slate-700">Phone Number *</label>
              <input
                id="addr-phone"
                type="tel"
                required
                value={formState.phone}
                onChange={(e) => setFormState({ ...formState, phone: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#0b132b] focus:outline-none"
                placeholder="03001234567"
              />
            </div>
          </div>

          <div>
            <label htmlFor="addr-street" className="block text-xs font-semibold text-slate-700">Street Address *</label>
            <input
              id="addr-street"
              type="text"
              required
              value={formState.address}
              onChange={(e) => setFormState({ ...formState, address: e.target.value })}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#0b132b] focus:outline-none"
              placeholder="House #, Street name, Area"
            />
          </div>

          <div>
            <label htmlFor="addr-street2" className="block text-xs font-semibold text-slate-700">Address Line 2 (Optional)</label>
            <input
              id="addr-street2"
              type="text"
              value={formState.addressLine2 || ''}
              onChange={(e) => setFormState({ ...formState, addressLine2: e.target.value })}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#0b132b] focus:outline-none"
              placeholder="Apartment, suite, unit, building, floor"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label htmlFor="addr-city" className="block text-xs font-semibold text-slate-700">City *</label>
              <input
                id="addr-city"
                type="text"
                required
                value={formState.city}
                onChange={(e) => setFormState({ ...formState, city: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#0b132b] focus:outline-none"
                placeholder="Lahore"
              />
            </div>

            <div>
              <label htmlFor="addr-province" className="block text-xs font-semibold text-slate-700">Province / State *</label>
              <input
                id="addr-province"
                type="text"
                required
                value={formState.province}
                onChange={(e) => setFormState({ ...formState, province: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#0b132b] focus:outline-none"
                placeholder="Punjab"
              />
            </div>

            <div>
              <label htmlFor="addr-country" className="block text-xs font-semibold text-slate-700">Country *</label>
              <select
                id="addr-country"
                value={formState.country}
                onChange={(e) => setFormState({ ...formState, country: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#0b132b] focus:outline-none"
              >
                {enabledCountries.map((c) => (
                  <option key={c} value={c}>
                    {c === 'PK' ? 'Pakistan (PK)' : c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <input
              id="addr-default"
              type="checkbox"
              checked={formState.isDefault}
              onChange={(e) => setFormState({ ...formState, isDefault: e.target.checked })}
              className="h-4 w-4 rounded border-slate-300 text-[#0b132b] focus:ring-[#0b132b]"
            />
            <label htmlFor="addr-default" className="text-xs font-medium text-slate-700">
              Set as default shipping address
            </label>
          </div>

          <div className="flex items-center justify-end gap-3 pt-3">
            <button
              type="button"
              onClick={handleCancelForm}
              disabled={saving}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-[#0b132b] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1c2a4f] disabled:opacity-50"
            >
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {editingId ? 'Save Changes' : 'Create Address'}
            </button>
          </div>
        </form>
      )}

      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
        {loading ? (
          [1, 2].map((i) => (
            <div key={i} className="h-36 animate-pulse rounded-xl bg-slate-100" />
          ))
        ) : addresses.length === 0 ? (
          <div className="col-span-full rounded-xl border border-dashed border-slate-200 p-8 text-center">
            <p className="text-sm font-medium text-slate-600">No addresses saved yet.</p>
            <p className="mt-1 text-xs text-slate-600">Add an address to speed up checkout.</p>
          </div>
        ) : (
          addresses.map((addr) => (
            <div
              key={addr.id}
              className={`relative flex flex-col justify-between rounded-xl border p-4 transition ${
                addr.isDefault ? 'border-orange-300 bg-orange-50/20 shadow-sm' : 'border-slate-200 bg-white'
              }`}
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-[#0b132b]">{addr.fullName}</span>
                    {addr.isDefault && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-bold text-orange-800">
                        <Star className="h-3 w-3 fill-orange-500 text-orange-500" /> Default
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleStartEdit(addr)}
                      aria-label={`Edit address for ${addr.fullName}`}
                      className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(addr.id)}
                      disabled={deletingId === addr.id}
                      aria-label={`Delete address for ${addr.fullName}`}
                      className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                    >
                      {deletingId === addr.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                </div>

                <div className="mt-2 text-xs leading-relaxed text-slate-600">
                  <p>{addr.address}</p>
                  {addr.addressLine2 && <p>{addr.addressLine2}</p>}
                  <p>{addr.city}, {addr.province} {addr.postalCode}</p>
                  <p className="font-medium text-slate-800">{addr.country === 'PK' ? 'Pakistan' : addr.country} · {addr.phone}</p>
                </div>
              </div>

              {!addr.isDefault && (
                <div className="mt-4 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => handleSetDefault(addr)}
                    disabled={saving}
                    className="text-xs font-semibold text-[#0b132b] hover:underline"
                  >
                    Make Default Address
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

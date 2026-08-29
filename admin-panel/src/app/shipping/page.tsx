'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Edit3,
  Loader,
  MapPin,
  Plus,
  RefreshCw,
  Trash2,
  Truck,
  X
} from 'lucide-react';
import api from '@/lib/api';

interface ShippingZone {
  _id: string;
  name: string;
  enabled: boolean;
  countries: string[];
  regions: string[];
  cities: string[];
  normalRate: number;
  freeShippingThreshold: number;
  remoteRate: number | null;
  remoteCities: string[];
  deliveryMinDays: number;
  deliveryMaxDays: number;
  remoteDeliveryMinDays: number | null;
  remoteDeliveryMaxDays: number | null;
  priority: number;
}

interface ZonePayload {
  name: string;
  enabled: boolean;
  countries: string[];
  regions: string[];
  cities: string[];
  normalRate: number;
  freeShippingThreshold: number;
  remoteRate: number | null;
  remoteCities: string[];
  deliveryMinDays: number;
  deliveryMaxDays: number;
  remoteDeliveryMinDays: number | null;
  remoteDeliveryMaxDays: number | null;
  priority: number;
}

interface ZoneForm {
  name: string;
  enabled: boolean;
  countries: string;
  regions: string;
  cities: string;
  normalRate: string;
  freeShippingThreshold: string;
  remoteRate: string;
  remoteCities: string;
  deliveryMinDays: string;
  deliveryMaxDays: string;
  remoteDeliveryMinDays: string;
  remoteDeliveryMaxDays: string;
  priority: string;
}

interface NumericResult {
  value: number | null;
  error?: string;
}

interface FieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  placeholder?: string;
  type?: 'text' | 'number';
  required?: boolean;
}

const emptyForm: ZoneForm = {
  name: '',
  enabled: true,
  countries: '',
  regions: '',
  cities: '',
  normalRate: '',
  freeShippingThreshold: '',
  remoteRate: '',
  remoteCities: '',
  deliveryMinDays: '',
  deliveryMaxDays: '',
  remoteDeliveryMinDays: '',
  remoteDeliveryMaxDays: '',
  priority: '100'
};

const moneyFormatter = new Intl.NumberFormat('en-PK', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2
});

const parseList = (value: string) => (
  value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item, index, items) => items.indexOf(item) === index)
);

const parseNumber = (
  rawValue: string,
  label: string,
  options: { required?: boolean; integer?: boolean; max: number }
): NumericResult => {
  const value = rawValue.trim();
  if (!value) {
    return options.required === false
      ? { value: null }
      : { value: null, error: `${label} is required.` };
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return { value: null, error: `${label} must be a finite non-negative number.` };
  }
  if (options.integer && !Number.isInteger(parsed)) {
    return { value: null, error: `${label} must be a whole number.` };
  }
  if (parsed > options.max) {
    return { value: null, error: `${label} must not exceed ${options.max}.` };
  }
  return { value: parsed };
};

const zoneToForm = (zone: ShippingZone): ZoneForm => ({
  name: zone.name,
  enabled: zone.enabled,
  countries: zone.countries.join(', '),
  regions: zone.regions.join(', '),
  cities: zone.cities.join(', '),
  normalRate: String(zone.normalRate),
  freeShippingThreshold: String(zone.freeShippingThreshold),
  remoteRate: zone.remoteRate == null ? '' : String(zone.remoteRate),
  remoteCities: zone.remoteCities.join(', '),
  deliveryMinDays: String(zone.deliveryMinDays),
  deliveryMaxDays: String(zone.deliveryMaxDays),
  remoteDeliveryMinDays: zone.remoteDeliveryMinDays == null ? '' : String(zone.remoteDeliveryMinDays),
  remoteDeliveryMaxDays: zone.remoteDeliveryMaxDays == null ? '' : String(zone.remoteDeliveryMaxDays),
  priority: String(zone.priority)
});

const sortZones = (zones: ShippingZone[]) => (
  [...zones].sort((left, right) => (
    left.priority - right.priority || left.name.localeCompare(right.name)
  ))
);

const validateForm = (form: ZoneForm): {
  errors: Record<string, string>;
  payload?: ZonePayload;
} => {
  const errors: Record<string, string> = {};
  const name = form.name.trim();
  const countries = parseList(form.countries)
    .map((country) => country.toUpperCase())
    .filter((country, index, items) => items.indexOf(country) === index);
  const regions = parseList(form.regions);
  const cities = parseList(form.cities);
  const remoteCities = parseList(form.remoteCities);

  if (!name) errors.name = 'Zone name is required.';
  else if (name.length > 100) errors.name = 'Zone name must not exceed 100 characters.';

  if (countries.length === 0) {
    errors.countries = 'At least one country code is required.';
  } else if (countries.some((country) => !/^[A-Z]{2}$/.test(country))) {
    errors.countries = 'Use comma-separated ISO-style two-letter country codes.';
  } else if (countries.length > 250) {
    errors.countries = 'No more than 250 country codes are allowed.';
  }

  const listFields = [
    { key: 'regions', label: 'Regions', values: regions, maxItems: 100 },
    { key: 'cities', label: 'Cities', values: cities, maxItems: 500 },
    { key: 'remoteCities', label: 'Remote cities', values: remoteCities, maxItems: 500 }
  ];
  listFields.forEach(({ key, label, values, maxItems }) => {
    if (values.length > maxItems) errors[key] = `${label} cannot contain more than ${maxItems} entries.`;
    else if (values.some((value) => value.length > 100)) errors[key] = `${label} entries must not exceed 100 characters.`;
  });

  const normalRate = parseNumber(form.normalRate, 'Normal rate', { max: 100000000 });
  const freeShippingThreshold = parseNumber(form.freeShippingThreshold, 'Free-shipping threshold', { max: 100000000 });
  const remoteRate = parseNumber(form.remoteRate, 'Remote rate', { required: false, max: 100000000 });
  const deliveryMinDays = parseNumber(form.deliveryMinDays, 'Delivery minimum', { integer: true, max: 60 });
  const deliveryMaxDays = parseNumber(form.deliveryMaxDays, 'Delivery maximum', { integer: true, max: 60 });
  const remoteDeliveryMinDays = parseNumber(form.remoteDeliveryMinDays, 'Remote delivery minimum', { required: false, integer: true, max: 60 });
  const remoteDeliveryMaxDays = parseNumber(form.remoteDeliveryMaxDays, 'Remote delivery maximum', { required: false, integer: true, max: 60 });
  const priority = parseNumber(form.priority, 'Priority', { integer: true, max: 10000 });

  const numericFields: Array<{ key: string; result: NumericResult }> = [
    { key: 'normalRate', result: normalRate },
    { key: 'freeShippingThreshold', result: freeShippingThreshold },
    { key: 'remoteRate', result: remoteRate },
    { key: 'deliveryMinDays', result: deliveryMinDays },
    { key: 'deliveryMaxDays', result: deliveryMaxDays },
    { key: 'remoteDeliveryMinDays', result: remoteDeliveryMinDays },
    { key: 'remoteDeliveryMaxDays', result: remoteDeliveryMaxDays },
    { key: 'priority', result: priority }
  ];
  numericFields.forEach(({ key, result }) => {
    if (result.error) errors[key] = result.error;
  });

  if (
    deliveryMinDays.value != null
    && deliveryMaxDays.value != null
    && deliveryMaxDays.value < deliveryMinDays.value
  ) {
    errors.deliveryMaxDays = 'Delivery maximum must not be lower than the minimum.';
  }

  const hasRemoteMinimum = remoteDeliveryMinDays.value != null;
  const hasRemoteMaximum = remoteDeliveryMaxDays.value != null;
  if (hasRemoteMinimum !== hasRemoteMaximum) {
    errors.remoteDeliveryMinDays = 'Provide both remote delivery range values or leave both blank.';
    errors.remoteDeliveryMaxDays = 'Provide both remote delivery range values or leave both blank.';
  } else if (
    remoteDeliveryMinDays.value != null
    && remoteDeliveryMaxDays.value != null
    && remoteDeliveryMaxDays.value < remoteDeliveryMinDays.value
  ) {
    errors.remoteDeliveryMaxDays = 'Remote delivery maximum must not be lower than the minimum.';
  }

  if (Object.keys(errors).length > 0) return { errors };

  return {
    errors,
    payload: {
      name,
      enabled: form.enabled,
      countries,
      regions,
      cities,
      normalRate: normalRate.value as number,
      freeShippingThreshold: freeShippingThreshold.value as number,
      remoteRate: remoteRate.value,
      remoteCities,
      deliveryMinDays: deliveryMinDays.value as number,
      deliveryMaxDays: deliveryMaxDays.value as number,
      remoteDeliveryMinDays: remoteDeliveryMinDays.value,
      remoteDeliveryMaxDays: remoteDeliveryMaxDays.value,
      priority: priority.value as number
    }
  };
};

function Field({
  label,
  value,
  onChange,
  error,
  placeholder,
  type = 'text',
  required = false
}: FieldProps) {
  return (
    <label style={{ display: 'grid', gap: '6px', minWidth: 0 }}>
      <span style={{ color: 'var(--text-primary)', fontSize: '12px', fontWeight: '700' }}>
        {label}{required ? ' *' : ''}
      </span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        min={type === 'number' ? 0 : undefined}
        step={type === 'number' ? 'any' : undefined}
        aria-invalid={Boolean(error)}
        style={{
          width: '100%',
          padding: '10px 11px',
          borderRadius: '8px',
          border: `1px solid ${error ? 'var(--danger-text)' : 'var(--border-color)'}`,
          background: 'var(--input-bg)',
          color: 'var(--text-primary)',
          fontSize: '13px',
          outline: 'none'
        }}
      />
      {error && <span style={{ color: 'var(--danger-text)', fontSize: '11px' }}>{error}</span>}
    </label>
  );
}

export default function ShippingPage() {
  const [zones, setZones] = useState<ShippingZone[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingZone, setEditingZone] = useState<ShippingZone | null>(null);
  const [form, setForm] = useState<ZoneForm>(emptyForm);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState('');
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState('');

  const loadZones = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const response = await api.get('/commerce/shipping/zones');
      const records = response.data?.data?.zones;
      if (response.data?.success !== true || !Array.isArray(records)) {
        throw new Error('Unexpected shipping zone response');
      }
      setZones(sortZones(records));
    } catch {
      setLoadError('Shipping zones could not be loaded. Confirm your Admin session and try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadZones();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadZones]);

  const updateFormField = <Key extends keyof ZoneForm,>(key: Key, value: ZoneForm[Key]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setFormErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
    setSubmitError('');
  };

  const openCreateForm = () => {
    setEditingZone(null);
    setForm(emptyForm);
    setFormErrors({});
    setSubmitError('');
    setFeedback(null);
    setShowForm(true);
  };

  const openEditForm = (zone: ShippingZone) => {
    setEditingZone(zone);
    setForm(zoneToForm(zone));
    setFormErrors({});
    setSubmitError('');
    setFeedback(null);
    setShowForm(true);
  };

  const closeForm = () => {
    if (saving) return;
    setShowForm(false);
    setEditingZone(null);
    setFormErrors({});
    setSubmitError('');
  };

  const submitZone = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;

    const validated = validateForm(form);
    setFormErrors(validated.errors);
    if (!validated.payload) return;

    setSaving(true);
    setSubmitError('');
    try {
      const response = editingZone
        ? await api.put(`/commerce/shipping/zones/${editingZone._id}`, validated.payload)
        : await api.post('/commerce/shipping/zones', validated.payload);
      const savedZone = response.data?.data?.zone as ShippingZone | undefined;
      if (response.data?.success !== true || !savedZone?._id) {
        throw new Error('Unexpected shipping zone mutation response');
      }

      setZones((current) => sortZones(
        editingZone
          ? current.map((zone) => zone._id === savedZone._id ? savedZone : zone)
          : [...current, savedZone]
      ));
      setFeedback({
        kind: 'success',
        text: editingZone ? 'Shipping zone updated successfully.' : 'Shipping zone created successfully.'
      });
      setShowForm(false);
      setEditingZone(null);
      setFormErrors({});
    } catch {
      setSubmitError('The backend rejected the shipping zone. Review the fields and try again.');
    } finally {
      setSaving(false);
    }
  };

  const deleteZone = async (zone: ShippingZone) => {
    if (!window.confirm(`Delete shipping zone "${zone.name}"? This cannot be undone.`)) return;

    setDeletingId(zone._id);
    setFeedback(null);
    try {
      const response = await api.delete(`/commerce/shipping/zones/${zone._id}`);
      if (response.data?.success !== true || response.data?.data?.deleted !== true) {
        throw new Error('Unexpected shipping zone deletion response');
      }
      setZones((current) => current.filter((item) => item._id !== zone._id));
      setFeedback({ kind: 'success', text: 'Shipping zone deleted successfully.' });
    } catch {
      setFeedback({ kind: 'error', text: 'The shipping zone could not be deleted.' });
    } finally {
      setDeletingId('');
    }
  };

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
      <header style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: '16px',
        flexWrap: 'wrap',
        marginBottom: '28px'
      }}>
        <div>
          <h1 style={{ fontSize: '28px', fontWeight: '800', color: 'var(--text-primary)', marginBottom: '8px', letterSpacing: '-0.5px' }}>
            Shipping Zones
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '15px', maxWidth: '720px' }}>
            Manage address coverage, rates and delivery windows used by the live shipping quote service.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreateForm}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '11px 17px',
            border: 0,
            borderRadius: '9px',
            background: 'var(--primary)',
            color: '#0B132B',
            fontWeight: '800',
            cursor: 'pointer'
          }}
        >
          <Plus size={18} /> Create zone
        </button>
      </header>

      {feedback && (
        <div
          role={feedback.kind === 'error' ? 'alert' : 'status'}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '9px',
            padding: '12px 14px',
            marginBottom: '18px',
            borderRadius: '9px',
            background: feedback.kind === 'success' ? 'var(--success-light)' : 'var(--danger-light)',
            color: feedback.kind === 'success' ? 'var(--success-text)' : 'var(--danger-text)',
            fontSize: '13px',
            fontWeight: '700'
          }}
        >
          {feedback.kind === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
          {feedback.text}
        </div>
      )}

      {loading ? (
        <div style={{
          minHeight: '320px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: '1px solid var(--border-color)',
          borderRadius: '12px',
          background: 'var(--card-bg)'
        }}>
          <Loader className="animate-spin" size={30} color="var(--accent-text)" aria-label="Loading shipping zones" />
        </div>
      ) : loadError ? (
        <div role="alert" style={{
          padding: '44px 22px',
          textAlign: 'center',
          border: '1px solid var(--danger-text)',
          borderRadius: '12px',
          background: 'var(--card-bg)'
        }}>
          <AlertCircle size={40} color="var(--danger-text)" style={{ margin: '0 auto 14px' }} />
          <h2 style={{ fontSize: '18px', fontWeight: '800', color: 'var(--text-primary)', marginBottom: '8px' }}>
            Shipping zones unavailable
          </h2>
          <p style={{ color: 'var(--danger-text)', fontSize: '14px', marginBottom: '18px' }}>{loadError}</p>
          <button
            type="button"
            onClick={() => void loadZones()}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 16px',
              border: 0,
              borderRadius: '8px',
              background: 'var(--primary)',
              color: '#0B132B',
              fontWeight: '800',
              cursor: 'pointer'
            }}
          >
            <RefreshCw size={16} /> Retry
          </button>
        </div>
      ) : zones.length === 0 ? (
        <div style={{
          padding: '58px 22px',
          textAlign: 'center',
          border: '1px dashed var(--border-color)',
          borderRadius: '12px',
          background: 'var(--card-bg)'
        }}>
          <Truck size={44} color="var(--text-secondary)" style={{ opacity: 0.5, margin: '0 auto 14px' }} />
          <h2 style={{ fontSize: '19px', fontWeight: '800', color: 'var(--text-primary)', marginBottom: '8px' }}>
            No shipping zones configured
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '18px' }}>
            Create a zone to define real address coverage and shipping rates.
          </p>
          <button
            type="button"
            onClick={openCreateForm}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 16px',
              border: 0,
              borderRadius: '8px',
              background: 'var(--primary)',
              color: '#0B132B',
              fontWeight: '800',
              cursor: 'pointer'
            }}
          >
            <Plus size={16} /> Create zone
          </button>
        </div>
      ) : (
        <section style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: '16px'
        }}>
          {zones.map((zone) => (
            <article key={zone._id} style={{
              display: 'flex',
              flexDirection: 'column',
              minWidth: 0,
              padding: '20px',
              border: '1px solid var(--border-color)',
              borderRadius: '12px',
              background: 'var(--card-bg)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '16px' }}>
                <div style={{ minWidth: 0 }}>
                  <h2 style={{ color: 'var(--text-primary)', fontSize: '17px', fontWeight: '800', marginBottom: '7px', overflowWrap: 'anywhere' }}>
                    {zone.name}
                  </h2>
                  <span style={{
                    display: 'inline-flex',
                    padding: '5px 9px',
                    borderRadius: '999px',
                    background: zone.enabled ? 'var(--success-light)' : 'var(--bg-primary)',
                    color: zone.enabled ? 'var(--success-text)' : 'var(--text-secondary)',
                    fontSize: '11px',
                    fontWeight: '800'
                  }}>
                    {zone.enabled ? 'Enabled' : 'Disabled'}
                  </span>
                </div>
                <span style={{ color: 'var(--text-secondary)', fontSize: '12px', fontWeight: '700', whiteSpace: 'nowrap' }}>
                  Priority {zone.priority}
                </span>
              </div>

              <div style={{ display: 'grid', gap: '12px', marginBottom: '18px', flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '9px' }}>
                  <MapPin size={17} color="var(--accent-text)" style={{ marginTop: '1px', flexShrink: 0 }} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ color: 'var(--text-primary)', fontSize: '13px', fontWeight: '700', overflowWrap: 'anywhere' }}>
                      {zone.countries.join(', ')}
                    </div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '11px', marginTop: '3px', overflowWrap: 'anywhere' }}>
                      Regions: {zone.regions.length > 0 ? zone.regions.join(', ') : 'All'} · Cities: {zone.cities.length > 0 ? zone.cities.join(', ') : 'All'}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '10px' }}>
                  <div style={{ padding: '11px', borderRadius: '8px', background: 'var(--bg-primary)' }}>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '10px', fontWeight: '700', marginBottom: '4px' }}>Normal rate</div>
                    <div style={{ color: 'var(--text-primary)', fontSize: '14px', fontWeight: '800' }}>Rs. {moneyFormatter.format(zone.normalRate)}</div>
                  </div>
                  <div style={{ padding: '11px', borderRadius: '8px', background: 'var(--bg-primary)' }}>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '10px', fontWeight: '700', marginBottom: '4px' }}>Free shipping from</div>
                    <div style={{ color: 'var(--text-primary)', fontSize: '14px', fontWeight: '800' }}>Rs. {moneyFormatter.format(zone.freeShippingThreshold)}</div>
                  </div>
                </div>

                <div style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>
                  Delivery range: <strong style={{ color: 'var(--text-primary)' }}>{zone.deliveryMinDays}–{zone.deliveryMaxDays} days</strong>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '9px', paddingTop: '14px', borderTop: '1px solid var(--border-color)' }}>
                <button
                  type="button"
                  onClick={() => openEditForm(zone)}
                  disabled={deletingId === zone._id}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '7px',
                    flex: 1,
                    padding: '9px 12px',
                    border: '1px solid var(--border-color)',
                    borderRadius: '8px',
                    background: 'var(--card-bg)',
                    color: 'var(--text-primary)',
                    fontWeight: '700',
                    cursor: deletingId === zone._id ? 'not-allowed' : 'pointer'
                  }}
                >
                  <Edit3 size={15} /> Edit
                </button>
                <button
                  type="button"
                  onClick={() => void deleteZone(zone)}
                  disabled={deletingId === zone._id}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '7px',
                    flex: 1,
                    padding: '9px 12px',
                    border: 0,
                    borderRadius: '8px',
                    background: 'var(--danger-light)',
                    color: 'var(--danger-text)',
                    fontWeight: '700',
                    cursor: deletingId === zone._id ? 'wait' : 'pointer'
                  }}
                >
                  {deletingId === zone._id ? <Loader className="animate-spin" size={15} /> : <Trash2 size={15} />}
                  Delete
                </button>
              </div>
            </article>
          ))}
        </section>
      )}

      {showForm && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="shipping-zone-form-title"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeForm();
          }}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 2000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '18px',
            background: 'rgba(11, 19, 43, 0.72)',
            backdropFilter: 'blur(3px)'
          }}
        >
          <form
            onSubmit={submitZone}
            style={{
              width: 'min(920px, 100%)',
              maxHeight: '92vh',
              overflowY: 'auto',
              border: '1px solid var(--border-color)',
              borderRadius: '14px',
              background: 'var(--card-bg)',
              boxShadow: '0 24px 80px rgba(0, 0, 0, 0.32)'
            }}
          >
            <div style={{
              position: 'sticky',
              top: 0,
              zIndex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              padding: '17px 20px',
              borderBottom: '1px solid var(--border-color)',
              background: 'var(--card-bg)'
            }}>
              <div>
                <h2 id="shipping-zone-form-title" style={{ color: 'var(--text-primary)', fontSize: '18px', fontWeight: '800', marginBottom: '3px' }}>
                  {editingZone ? 'Edit shipping zone' : 'Create shipping zone'}
                </h2>
                <p style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>Fields are validated against the live ShippingZone contract.</p>
              </div>
              <button
                type="button"
                onClick={closeForm}
                disabled={saving}
                aria-label="Close shipping zone form"
                style={{
                  display: 'inline-flex',
                  padding: '7px',
                  border: 0,
                  borderRadius: '7px',
                  background: 'var(--bg-primary)',
                  color: 'var(--text-secondary)',
                  cursor: saving ? 'not-allowed' : 'pointer'
                }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ display: 'grid', gap: '22px', padding: '20px' }}>
              {submitError && (
                <div role="alert" style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '11px 12px',
                  borderRadius: '8px',
                  background: 'var(--danger-light)',
                  color: 'var(--danger-text)',
                  fontSize: '12px',
                  fontWeight: '700'
                }}>
                  <AlertCircle size={17} /> {submitError}
                </div>
              )}

              <section>
                <h3 style={{ color: 'var(--text-primary)', fontSize: '14px', fontWeight: '800', marginBottom: '12px' }}>Zone identity</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
                  <Field label="Name" value={form.name} onChange={(value) => updateFormField('name', value)} error={formErrors.name} placeholder="Pakistan major cities" required />
                  <Field label="Priority" type="number" value={form.priority} onChange={(value) => updateFormField('priority', value)} error={formErrors.priority} required />
                  <label style={{ display: 'flex', alignItems: 'center', gap: '10px', alignSelf: 'end', minHeight: '39px', color: 'var(--text-primary)', fontSize: '13px', fontWeight: '700' }}>
                    <input type="checkbox" checked={form.enabled} onChange={(event) => updateFormField('enabled', event.target.checked)} />
                    Enabled for quotes
                  </label>
                </div>
              </section>

              <section>
                <h3 style={{ color: 'var(--text-primary)', fontSize: '14px', fontWeight: '800', marginBottom: '12px' }}>Coverage</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '14px' }}>
                  <Field label="Countries" value={form.countries} onChange={(value) => updateFormField('countries', value)} error={formErrors.countries} placeholder="PK, AE" required />
                  <Field label="Regions" value={form.regions} onChange={(value) => updateFormField('regions', value)} error={formErrors.regions} placeholder="Punjab, Sindh" />
                  <Field label="Cities" value={form.cities} onChange={(value) => updateFormField('cities', value)} error={formErrors.cities} placeholder="Lahore, Karachi" />
                  <Field label="Remote cities" value={form.remoteCities} onChange={(value) => updateFormField('remoteCities', value)} error={formErrors.remoteCities} placeholder="RemoteTown" />
                </div>
                <p style={{ color: 'var(--text-secondary)', fontSize: '11px', marginTop: '9px' }}>Use comma-separated values. Country codes are normalized to uppercase.</p>
              </section>

              <section>
                <h3 style={{ color: 'var(--text-primary)', fontSize: '14px', fontWeight: '800', marginBottom: '12px' }}>Rates</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
                  <Field label="Normal rate" type="number" value={form.normalRate} onChange={(value) => updateFormField('normalRate', value)} error={formErrors.normalRate} required />
                  <Field label="Free-shipping threshold" type="number" value={form.freeShippingThreshold} onChange={(value) => updateFormField('freeShippingThreshold', value)} error={formErrors.freeShippingThreshold} required />
                  <Field label="Remote rate" type="number" value={form.remoteRate} onChange={(value) => updateFormField('remoteRate', value)} error={formErrors.remoteRate} placeholder="Optional" />
                </div>
              </section>

              <section>
                <h3 style={{ color: 'var(--text-primary)', fontSize: '14px', fontWeight: '800', marginBottom: '12px' }}>Delivery windows</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '14px' }}>
                  <Field label="Delivery minimum days" type="number" value={form.deliveryMinDays} onChange={(value) => updateFormField('deliveryMinDays', value)} error={formErrors.deliveryMinDays} required />
                  <Field label="Delivery maximum days" type="number" value={form.deliveryMaxDays} onChange={(value) => updateFormField('deliveryMaxDays', value)} error={formErrors.deliveryMaxDays} required />
                  <Field label="Remote minimum days" type="number" value={form.remoteDeliveryMinDays} onChange={(value) => updateFormField('remoteDeliveryMinDays', value)} error={formErrors.remoteDeliveryMinDays} placeholder="Optional" />
                  <Field label="Remote maximum days" type="number" value={form.remoteDeliveryMaxDays} onChange={(value) => updateFormField('remoteDeliveryMaxDays', value)} error={formErrors.remoteDeliveryMaxDays} placeholder="Optional" />
                </div>
              </section>
            </div>

            <div style={{
              position: 'sticky',
              bottom: 0,
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '10px',
              padding: '15px 20px',
              borderTop: '1px solid var(--border-color)',
              background: 'var(--card-bg)'
            }}>
              <button
                type="button"
                onClick={closeForm}
                disabled={saving}
                style={{
                  padding: '10px 15px',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                  background: 'var(--card-bg)',
                  color: 'var(--text-primary)',
                  fontWeight: '700',
                  cursor: saving ? 'not-allowed' : 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '10px 16px',
                  border: 0,
                  borderRadius: '8px',
                  background: saving ? 'var(--text-secondary)' : 'var(--primary)',
                  color: saving ? '#FFFFFF' : '#0B132B',
                  fontWeight: '800',
                  cursor: saving ? 'wait' : 'pointer'
                }}
              >
                {saving && <Loader className="animate-spin" size={16} />}
                {saving ? 'Saving…' : editingZone ? 'Save changes' : 'Create zone'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

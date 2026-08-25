'use client';

import { useEffect, useState } from 'react';
import {
  Store, Truck, Percent, CreditCard, Save, CheckCircle,
  AlertCircle, Loader, Globe, Share2, Link as LinkIcon,
  MessageCircle, AtSign, ExternalLink, AlertTriangle, Shield
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import api from '@/lib/api';

// --- Reusable UI Components for Clean Code ---

interface InputGroupProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  icon?: LucideIcon;
  error?: string;
}

interface ToggleFieldProps {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  activeColor?: string;
}

interface PaymentSettings {
  cod_enabled: boolean;
  jazzcash_enabled: boolean;
  jazzcash_merchant_id: string;
  visa_enabled: boolean;
  visa_merchant_id: string;
  mastercard_enabled: boolean;
  mastercard_merchant_id: string;
}

interface ProviderCredentialStatus {
  management: 'environment';
  stripe: {
    configured: boolean;
    serverCredentialConfigured: boolean;
    publishableKeyConfigured: boolean;
    webhookConfigured: boolean;
  };
  jazzcash: { configured: boolean };
  easypaisa: { configured: boolean };
}

const InputGroup = ({ label, value, onChange, type = 'text', placeholder = '', icon: Icon, error }: InputGroupProps) => (
  <div>
    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' }}>
      {Icon && <Icon size={16} />}
      {label}
    </label>
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        width: '100%',
        padding: '12px 16px',
        border: error ? '1px solid #DC2626' : '1px solid var(--border-color)',
        borderRadius: '10px',
        fontSize: '14px',
        outline: 'none',
        backgroundColor: 'var(--input-bg)',
        color: 'var(--text-primary)',
        transition: 'all 0.2s'
      }}
      onFocus={(e) => !error && (e.currentTarget.style.borderColor = 'var(--primary)')}
      onBlur={(e) => !error && (e.currentTarget.style.borderColor = 'var(--border-color)')}
    />
    {error && <p style={{ fontSize: '12px', color: 'var(--danger-text)', marginTop: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}><AlertCircle size={12} /> {error}</p>}
  </div>
);

const ToggleField = ({ label, description, checked, onChange, activeColor = 'var(--primary)' }: ToggleFieldProps) => (
  <div style={{ 
    display: 'flex', 
    alignItems: 'center', 
    justifyContent: 'space-between', 
    padding: '16px', 
    backgroundColor: 'var(--bg-primary)', 
    borderRadius: '10px', 
    border: '1px solid var(--border-color)' 
  }}>
    <div>
      <div style={{ fontWeight: '600', color: 'var(--text-primary)', marginBottom: '4px' }}>{label}</div>
      {description && <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{description}</div>}
    </div>
    <button 
      onClick={() => onChange(!checked)} 
      style={{ 
        width: '48px', 
        height: '26px', 
        backgroundColor: checked ? activeColor : '#D1D5DB', 
        borderRadius: '13px', 
        cursor: 'pointer', 
        position: 'relative', 
        transition: 'all 0.2s',
        border: 'none'
      }}
    >
      <div style={{ 
        width: '20px', 
        height: '20px', 
        backgroundColor: 'white', 
        borderRadius: '50%', 
        position: 'absolute', 
        top: '3px', 
        left: checked ? '25px' : '3px', 
        transition: 'all 0.2s',
        boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
      }} />
    </button>
  </div>
);

const ProviderStatus = ({
  label,
  configured,
  detail
}: {
  label: string;
  configured: boolean | null;
  detail: string;
}) => {
  const available = configured === true;
  const status = configured === null
    ? 'Status unavailable'
    : available
      ? 'Configured'
      : 'Not configured';

  return (
    <div style={{
      padding: '16px',
      backgroundColor: 'var(--bg-primary)',
      border: `1px solid ${available ? '#16A34A' : 'var(--border-color)'}`,
      borderRadius: '10px',
      color: 'var(--text-primary)',
      display: 'flex',
      alignItems: 'flex-start',
      gap: '10px'
    }}>
      {available
        ? <CheckCircle size={18} color="#16A34A" style={{ marginTop: '1px' }} />
        : <AlertTriangle size={18} color="#FF8A00" style={{ marginTop: '1px' }} />}
      <div>
        <div style={{ fontSize: '14px', fontWeight: '700', marginBottom: '3px' }}>
          {label}: {status}
        </div>
        <div style={{
          fontSize: '12px',
          color: 'var(--text-secondary)',
          lineHeight: '1.45'
        }}>
          {detail}
        </div>
      </div>
    </div>
  );
};

const DEFAULT_PAYMENT_SETTINGS: PaymentSettings = {
  cod_enabled: true,
  jazzcash_enabled: false,
  jazzcash_merchant_id: '',
  visa_enabled: false,
  visa_merchant_id: '',
  mastercard_enabled: false,
  mastercard_merchant_id: ''
};

const asRecord = (value: unknown): Record<string, unknown> => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
);

const booleanOrDefault = (value: unknown, fallback: boolean) => (
  typeof value === 'boolean' ? value : fallback
);

const stringOrEmpty = (value: unknown) => (
  typeof value === 'string' ? value : ''
);

const normalizePaymentSettings = (value: unknown): PaymentSettings => {
  const payment = asRecord(value);
  return {
    cod_enabled: booleanOrDefault(
      payment.cod_enabled,
      DEFAULT_PAYMENT_SETTINGS.cod_enabled
    ),
    jazzcash_enabled: booleanOrDefault(
      payment.jazzcash_enabled,
      DEFAULT_PAYMENT_SETTINGS.jazzcash_enabled
    ),
    jazzcash_merchant_id: stringOrEmpty(payment.jazzcash_merchant_id),
    visa_enabled: booleanOrDefault(
      payment.visa_enabled,
      DEFAULT_PAYMENT_SETTINGS.visa_enabled
    ),
    visa_merchant_id: stringOrEmpty(payment.visa_merchant_id),
    mastercard_enabled: booleanOrDefault(
      payment.mastercard_enabled,
      DEFAULT_PAYMENT_SETTINGS.mastercard_enabled
    ),
    mastercard_merchant_id: stringOrEmpty(payment.mastercard_merchant_id)
  };
};

const buildPaymentSettingsPayload = (
  payment: PaymentSettings
): PaymentSettings => ({
  cod_enabled: payment.cod_enabled,
  jazzcash_enabled: payment.jazzcash_enabled,
  jazzcash_merchant_id: payment.jazzcash_merchant_id,
  visa_enabled: payment.visa_enabled,
  visa_merchant_id: payment.visa_merchant_id,
  mastercard_enabled: payment.mastercard_enabled,
  mastercard_merchant_id: payment.mastercard_merchant_id
});

const normalizeProviderCredentialStatus = (
  value: unknown
): ProviderCredentialStatus | null => {
  const status = asRecord(value);
  const stripe = asRecord(status.stripe);
  const jazzcash = asRecord(status.jazzcash);
  const easypaisa = asRecord(status.easypaisa);
  const requiredBooleans = [
    stripe.configured,
    stripe.serverCredentialConfigured,
    stripe.publishableKeyConfigured,
    stripe.webhookConfigured,
    jazzcash.configured,
    easypaisa.configured
  ];

  if (
    status.management !== 'environment'
    || requiredBooleans.some((entry) => typeof entry !== 'boolean')
  ) {
    return null;
  }

  return {
    management: 'environment',
    stripe: {
      configured: stripe.configured as boolean,
      serverCredentialConfigured: stripe.serverCredentialConfigured as boolean,
      publishableKeyConfigured: stripe.publishableKeyConfigured as boolean,
      webhookConfigured: stripe.webhookConfigured as boolean
    },
    jazzcash: { configured: jazzcash.configured as boolean },
    easypaisa: { configured: easypaisa.configured as boolean }
  };
};

// --- Main Page Component ---

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState('store');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  const [storeData, setStoreData] = useState({
    store_name: '', store_email: '', store_phone: '', store_address: '', currency: 'PKR'
  });

  const [shippingData, setShippingData] = useState({
    shipping_flat_rate: '', free_shipping_min: '', delivery_days: ''
  });

  const [taxData, setTaxData] = useState({
    tax_enabled: false, tax_rate: ''
  });

  const [paymentData, setPaymentData] = useState<PaymentSettings>(
    DEFAULT_PAYMENT_SETTINGS
  );
  const [providerCredentials, setProviderCredentials] =
    useState<ProviderCredentialStatus | null>(null);

  const [socialData, setSocialData] = useState({
    facebook: '', instagram: '', twitter: '', youtube: '', linkedin: '', website: ''
  });

  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  async function fetchSettings() {
    setLoading(true);
    try {
      const response = await api.get('/settings');
      if (response.data.success) {
        const data = response.data.data;
        if (data.store) setStoreData({ ...storeData, ...data.store });
        if (data.shipping) setShippingData({ ...shippingData, ...data.shipping });
        if (data.tax) setTaxData({ ...taxData, ...data.tax });
        if (data.payment) {
          setPaymentData(normalizePaymentSettings(data.payment));
        }
        setProviderCredentials(
          normalizeProviderCredentialStatus(data.providerCredentials)
        );
        if (data.social) setSocialData({ ...socialData, ...data.social });
      }
    } catch {
      setProviderCredentials(null);
      setMessage({ type: 'error', text: 'Settings are currently unavailable. Please try again.' });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchSettings();
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  // ✅ ENTERPRISE-LEVEL VALIDATION (Fixed logical errors from previous version)
  const validatePaymentData = () => {
    const errors: Record<string, string> = {};

    if (paymentData.jazzcash_enabled) {
      if (!paymentData.jazzcash_merchant_id) errors.jazzcash_merchant_id = 'Merchant ID is required';
      else if (!/^[A-Z0-9-]+$/i.test(paymentData.jazzcash_merchant_id)) errors.jazzcash_merchant_id = 'Use alphanumeric characters only';
    }

    if (paymentData.visa_enabled) {
      if (!paymentData.visa_merchant_id) errors.visa_merchant_id = 'Merchant ID is required';
    }

    if (paymentData.mastercard_enabled) {
      if (!paymentData.mastercard_merchant_id) errors.mastercard_merchant_id = 'Merchant ID is required';
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSave = async (group: string, data: object) => {
    if (group === 'payment' && !validatePaymentData()) {
      setMessage({ type: 'error', text: 'Please fix the validation errors in the payment fields.' });
      setTimeout(() => setMessage(null), 5000);
      return;
    }

    setSaving(true);
    setMessage(null);
    try {
      const response = await api.put('/settings', { [group]: data });
      if (response.data.success) {
        if (group === 'payment' && response.data.data?.payment) {
          setPaymentData(normalizePaymentSettings(response.data.data.payment));
          setProviderCredentials(
            normalizeProviderCredentialStatus(
              response.data.data.providerCredentials
            )
          );
        }
        setMessage({ type: 'success', text: `${group.charAt(0).toUpperCase() + group.slice(1)} settings saved successfully!` });
        setTimeout(() => setMessage(null), 3000);
      }
    } catch {
      setMessage({ type: 'error', text: 'Failed to save settings. Please try again.' });
      setTimeout(() => setMessage(null), 3000);
    } finally {
      setSaving(false);
    }
  };

  const tabs = [
    { id: 'store', label: 'Store Info', icon: Store },
    { id: 'shipping', label: 'Shipping', icon: Truck },
    { id: 'tax', label: 'Tax Rules', icon: Percent },
    { id: 'payment', label: 'Payments', icon: CreditCard },
    { id: 'social', label: 'Social Media', icon: Globe }
  ];

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ fontSize: '32px', fontWeight: '800', color: 'var(--text-primary)', marginBottom: '8px', letterSpacing: '-0.5px' }}>
          Settings & Configuration
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '15px' }}>
          Manage your store preferences, payment gateways, and global configurations.
        </p>
      </div>

      {/* Toast Message */}
      {message && (
        <div style={{
          padding: '16px',
          backgroundColor: message.type === 'success' ? 'rgba(22, 163, 74, 0.12)' : 'rgba(220, 38, 38, 0.1)',
          border: `1px solid ${message.type === 'success' ? '#16A34A' : '#DC2626'}`,
          borderRadius: '12px',
          marginBottom: '24px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          color: message.type === 'success' ? 'var(--success-text)' : 'var(--danger-text)',
          animation: 'slideDown 0.3s ease-out'
        }}>
          {message.type === 'success' ? <CheckCircle size={20} /> : <AlertCircle size={20} />}
          <span style={{ fontWeight: '600', fontSize: '14px' }}>{message.text}</span>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '32px', borderBottom: '2px solid var(--border-color)', paddingBottom: '8px', flexWrap: 'wrap' }}>
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '12px 20px',
                backgroundColor: isActive ? 'var(--primary)' : 'transparent',
                color: isActive ? '#0B132B' : 'var(--text-secondary)',
                border: 'none',
                borderRadius: '8px 8px 0 0',
                cursor: 'pointer',
                fontWeight: isActive ? '700' : '500',
                fontSize: '15px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                transition: 'all 0.2s'
              }}
            >
              <Icon size={18} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Content Area */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}>
          <Loader size={40} style={{ animation: 'spin 1s linear infinite', color: '#FF8A00' }} />
        </div>
      ) : (
        <div style={{
          backgroundColor: 'var(--card-bg)',
          borderRadius: '16px',
          padding: '32px',
          border: '1px solid var(--border-color)',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)'
        }}>
          
          {/* Store Info Tab */}
          {activeTab === 'store' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <InputGroup label="Store Name" value={storeData.store_name} onChange={(v: string) => setStoreData({ ...storeData, store_name: v })} icon={Store} />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '24px' }}>
                <InputGroup label="Store Email" type="email" value={storeData.store_email} onChange={(v: string) => setStoreData({ ...storeData, store_email: v })} icon={AtSign} />
                <InputGroup label="Store Phone" type="tel" value={storeData.store_phone} onChange={(v: string) => setStoreData({ ...storeData, store_phone: v })} icon={Shield} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' }}>Store Address</label>
                <textarea
                  rows={3}
                  value={storeData.store_address}
                  onChange={(e) => setStoreData({ ...storeData, store_address: e.target.value })}
                  style={{ width: '100%', padding: '12px 16px', border: '1px solid var(--border-color)', borderRadius: '10px', fontSize: '14px', outline: 'none', backgroundColor: 'var(--input-bg)', color: 'var(--text-primary)', resize: 'vertical' }}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '16px', borderTop: '1px solid var(--border-color)' }}>
                <button onClick={() => handleSave('store', storeData)} disabled={saving} style={{ padding: '12px 24px', backgroundColor: saving ? '#9CA3AF' : 'var(--primary)', color: saving ? '#FFFFFF' : '#0B132B', border: 'none', borderRadius: '10px', cursor: saving ? 'not-allowed' : 'pointer', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {saving ? <Loader size={18} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={18} />}
                  Save Store Info
                </button>
              </div>
            </div>
          )}

          {/* Shipping Tab */}
          {activeTab === 'shipping' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '24px' }}>
                <InputGroup label="Flat Shipping Rate (Rs.)" type="number" value={shippingData.shipping_flat_rate} onChange={(v: string) => setShippingData({ ...shippingData, shipping_flat_rate: v })} icon={Truck} />
                <InputGroup label="Free Shipping Minimum (Rs.)" type="number" value={shippingData.free_shipping_min} onChange={(v: string) => setShippingData({ ...shippingData, free_shipping_min: v })} icon={CheckCircle} />
              </div>
              <InputGroup label="Estimated Delivery Days" type="number" value={shippingData.delivery_days} onChange={(v: string) => setShippingData({ ...shippingData, delivery_days: v })} icon={Shield} />
              <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '16px', borderTop: '1px solid var(--border-color)' }}>
                <button onClick={() => handleSave('shipping', shippingData)} disabled={saving} style={{ padding: '12px 24px', backgroundColor: saving ? '#9CA3AF' : 'var(--primary)', color: saving ? '#FFFFFF' : '#0B132B', border: 'none', borderRadius: '10px', cursor: saving ? 'not-allowed' : 'pointer', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {saving ? <Loader size={18} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={18} />}
                  Save Shipping Settings
                </button>
              </div>
            </div>
          )}

          {/* Tax Tab */}
          {activeTab === 'tax' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <ToggleField 
                label="Enable Tax" 
                description="Apply tax to all customer orders"
                checked={taxData.tax_enabled} 
                onChange={(v: boolean) => setTaxData({ ...taxData, tax_enabled: v })} 
              />
              {taxData.tax_enabled && (
                <div style={{ maxWidth: '400px' }}>
                  <InputGroup label="Tax Rate (%)" type="number" value={taxData.tax_rate} onChange={(v: string) => setTaxData({ ...taxData, tax_rate: v })} icon={Percent} />
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '16px', borderTop: '1px solid var(--border-color)' }}>
                <button onClick={() => handleSave('tax', taxData)} disabled={saving} style={{ padding: '12px 24px', backgroundColor: saving ? '#9CA3AF' : 'var(--primary)', color: saving ? '#FFFFFF' : '#0B132B', border: 'none', borderRadius: '10px', cursor: saving ? 'not-allowed' : 'pointer', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {saving ? <Loader size={18} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={18} />}
                  Save Tax Settings
                </button>
              </div>
            </div>
          )}

          {/* Payment Tab */}
          {activeTab === 'payment' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <div style={{
                padding: '18px',
                borderRadius: '12px',
                border: '1px solid #FF8A00',
                backgroundColor: 'rgba(255, 138, 0, 0.08)',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '12px'
              }}>
                <Shield size={22} color="#FF8A00" style={{ marginTop: '1px' }} />
                <div>
                  <div style={{ fontWeight: '700', color: 'var(--text-primary)', marginBottom: '4px' }}>
                    Provider credentials are deployment-managed
                  </div>
                  <div style={{ fontSize: '13px', lineHeight: '1.55', color: 'var(--text-secondary)' }}>
                    Secrets cannot be viewed or changed here. Update approved secure deployment configuration, then verify the live status below.
                  </div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
                <ProviderStatus
                  label="Stripe payments"
                  configured={providerCredentials?.stripe.configured ?? null}
                  detail="Requires valid server and publishable credentials in the backend environment."
                />
                <ProviderStatus
                  label="Stripe webhook"
                  configured={providerCredentials?.stripe.webhookConfigured ?? null}
                  detail="Webhook verification uses only the backend deployment secret."
                />
                <ProviderStatus
                  label="JazzCash"
                  configured={providerCredentials?.jazzcash.configured ?? null}
                  detail="Unavailable until an approved provider contract and integration exist."
                />
                <ProviderStatus
                  label="Easypaisa"
                  configured={providerCredentials?.easypaisa.configured ?? null}
                  detail="Unavailable until an approved provider contract and integration exist."
                />
              </div>

              <ToggleField label="Cash on Delivery (COD)" description="Customer pays cash when order is delivered" checked={paymentData.cod_enabled} onChange={(v: boolean) => setPaymentData({ ...paymentData, cod_enabled: v })} activeColor="#16A34A" />

              {/* JazzCash */}
              <div style={{ padding: '24px', backgroundColor: 'var(--bg-primary)', borderRadius: '12px', border: `2px solid ${paymentData.jazzcash_enabled ? '#FF0080' : 'var(--border-color)'}` }}>
                <ToggleField label="JazzCash Mobile Account" description="Non-secret store preference; runtime availability remains deployment-controlled" checked={paymentData.jazzcash_enabled} onChange={(v: boolean) => setPaymentData({ ...paymentData, jazzcash_enabled: v })} activeColor="#FF0080" />
                {paymentData.jazzcash_enabled && (
                  <div style={{ marginTop: '20px', paddingTop: '20px', borderTop: '1px solid var(--border-color)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px' }}>
                    <InputGroup label="Merchant ID" value={paymentData.jazzcash_merchant_id} onChange={(v: string) => setPaymentData({ ...paymentData, jazzcash_merchant_id: v })} error={validationErrors.jazzcash_merchant_id} placeholder="e.g., MC-12345" />
                  </div>
                )}
              </div>

              {/* Visa */}
              <div style={{ padding: '24px', backgroundColor: 'var(--bg-primary)', borderRadius: '12px', border: `2px solid ${paymentData.visa_enabled ? '#1A1F71' : 'var(--border-color)'}` }}>
                <ToggleField label="Visa Card" description="Non-secret card preference; live processing uses deployment-managed Stripe configuration" checked={paymentData.visa_enabled} onChange={(v: boolean) => setPaymentData({ ...paymentData, visa_enabled: v })} activeColor="#1A1F71" />
                {paymentData.visa_enabled && (
                  <div style={{ marginTop: '20px', paddingTop: '20px', borderTop: '1px solid var(--border-color)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px' }}>
                    <InputGroup label="Merchant ID" value={paymentData.visa_merchant_id} onChange={(v: string) => setPaymentData({ ...paymentData, visa_merchant_id: v })} error={validationErrors.visa_merchant_id} placeholder="e.g., VISA-12345" />
                  </div>
                )}
              </div>

              {/* Mastercard */}
              <div style={{ padding: '24px', backgroundColor: 'var(--bg-primary)', borderRadius: '12px', border: `2px solid ${paymentData.mastercard_enabled ? '#FF5F00' : 'var(--border-color)'}` }}>
                <ToggleField label="Mastercard" description="Non-secret card preference; live processing uses deployment-managed Stripe configuration" checked={paymentData.mastercard_enabled} onChange={(v: boolean) => setPaymentData({ ...paymentData, mastercard_enabled: v })} activeColor="#FF5F00" />
                {paymentData.mastercard_enabled && (
                  <div style={{ marginTop: '20px', paddingTop: '20px', borderTop: '1px solid var(--border-color)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px' }}>
                    <InputGroup label="Merchant ID" value={paymentData.mastercard_merchant_id} onChange={(v: string) => setPaymentData({ ...paymentData, mastercard_merchant_id: v })} error={validationErrors.mastercard_merchant_id} placeholder="e.g., MC-12345" />
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '16px', borderTop: '1px solid var(--border-color)' }}>
                <button onClick={() => handleSave('payment', buildPaymentSettingsPayload(paymentData))} disabled={saving} style={{ padding: '12px 24px', backgroundColor: saving ? '#9CA3AF' : 'var(--primary)', color: saving ? '#FFFFFF' : '#0B132B', border: 'none', borderRadius: '10px', cursor: saving ? 'not-allowed' : 'pointer', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {saving ? <Loader size={18} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={18} />}
                  Save Payment Settings
                </button>
              </div>
            </div>
          )}

          {/* Social Media Tab */}
          {activeTab === 'social' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px' }}>
                <InputGroup label="Facebook URL" type="url" value={socialData.facebook} onChange={(v: string) => setSocialData({ ...socialData, facebook: v })} icon={Share2} placeholder="https://facebook.com/yourstore" />
                <InputGroup label="Instagram URL" type="url" value={socialData.instagram} onChange={(v: string) => setSocialData({ ...socialData, instagram: v })} icon={AtSign} placeholder="https://instagram.com/yourstore" />
                <InputGroup label="Twitter / X URL" type="url" value={socialData.twitter} onChange={(v: string) => setSocialData({ ...socialData, twitter: v })} icon={MessageCircle} placeholder="https://twitter.com/yourstore" />
                <InputGroup label="YouTube URL" type="url" value={socialData.youtube} onChange={(v: string) => setSocialData({ ...socialData, youtube: v })} icon={ExternalLink} placeholder="https://youtube.com/yourstore" />
                <InputGroup label="LinkedIn URL" type="url" value={socialData.linkedin} onChange={(v: string) => setSocialData({ ...socialData, linkedin: v })} icon={LinkIcon} placeholder="https://linkedin.com/company/yourstore" />
                <InputGroup label="Website URL" type="url" value={socialData.website} onChange={(v: string) => setSocialData({ ...socialData, website: v })} icon={Globe} placeholder="https://yourstore.com" />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '16px', borderTop: '1px solid var(--border-color)' }}>
                <button onClick={() => handleSave('social', socialData)} disabled={saving} style={{ padding: '12px 24px', backgroundColor: saving ? '#9CA3AF' : 'var(--primary)', color: saving ? '#FFFFFF' : '#0B132B', border: 'none', borderRadius: '10px', cursor: saving ? 'not-allowed' : 'pointer', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {saving ? <Loader size={18} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={18} />}
                  Save Social Media
                </button>
              </div>
            </div>
          )}

        </div>
      )}
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes slideDown { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
}

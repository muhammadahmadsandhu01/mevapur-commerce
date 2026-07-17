'use client';

import { useEffect, useState } from 'react';
import { 
  Store, Truck, Percent, CreditCard, Save, CheckCircle,
  AlertCircle, Loader, Globe, Share2, Link as LinkIcon,
  MessageCircle, AtSign, ExternalLink, AlertTriangle, Shield
} from 'lucide-react';
import api from '@/lib/api';

// --- Reusable UI Components for Clean Code ---

const InputGroup = ({ label, value, onChange, type = 'text', placeholder = '', icon: Icon, error }: any) => (
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
        border: error ? '1px solid #EF4444' : '1px solid var(--border-color)',
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
    {error && <p style={{ fontSize: '12px', color: '#EF4444', marginTop: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}><AlertCircle size={12} /> {error}</p>}
  </div>
);

const ToggleField = ({ label, description, checked, onChange, activeColor = 'var(--primary)' }: any) => (
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

const ValidationMessage = ({ valid, message }: any) => {
  if (!message) return null;
  return (
    <div style={{
      marginTop: '8px',
      padding: '10px 14px',
      backgroundColor: valid ? '#D1FAE5' : '#FEE2E2',
      border: `1px solid ${valid ? '#10B981' : '#EF4444'}`,
      borderRadius: '8px',
      fontSize: '13px',
      color: valid ? '#065F46' : '#991B1B',
      display: 'flex',
      alignItems: 'center',
      gap: '8px'
    }}>
      {valid ? <CheckCircle size={16} /> : <AlertTriangle size={16} />}
      {message}
    </div>
  );
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

  const [paymentData, setPaymentData] = useState({
    cod_enabled: true,
    jazzcash_enabled: false, jazzcash_merchant_id: '', jazzcash_password: '',
    visa_enabled: false, visa_merchant_id: '', visa_api_key: '', visa_secret_key: '',
    mastercard_enabled: false, mastercard_merchant_id: '', mastercard_api_key: '', mastercard_secret_key: ''
  });

  const [socialData, setSocialData] = useState({
    facebook: '', instagram: '', twitter: '', youtube: '', linkedin: '', website: ''
  });

  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const response = await api.get('/settings');
      if (response.data.success) {
        const data = response.data.data;
        if (data.store) setStoreData({ ...storeData, ...data.store });
        if (data.shipping) setShippingData({ ...shippingData, ...data.shipping });
        if (data.tax) setTaxData({ ...taxData, ...data.tax });
        if (data.payment) setPaymentData({ ...paymentData, ...data.payment });
        if (data.social) setSocialData({ ...socialData, ...data.social });
      }
    } catch (error) {
      console.error('Error fetching settings:', error);
    } finally {
      setLoading(false);
    }
  };

  // ✅ ENTERPRISE-LEVEL VALIDATION (Fixed logical errors from previous version)
  const validatePaymentData = () => {
    const errors: Record<string, string> = {};

    if (paymentData.jazzcash_enabled) {
      if (!paymentData.jazzcash_merchant_id) errors.jazzcash_merchant_id = 'Merchant ID is required';
      else if (!/^[A-Z0-9-]+$/i.test(paymentData.jazzcash_merchant_id)) errors.jazzcash_merchant_id = 'Use alphanumeric characters only';
      if (!paymentData.jazzcash_password) errors.jazzcash_password = 'Password/Integrity Salt is required';
    }

    if (paymentData.visa_enabled) {
      if (!paymentData.visa_merchant_id) errors.visa_merchant_id = 'Merchant ID is required';
      if (!paymentData.visa_api_key || paymentData.visa_api_key.length < 10) errors.visa_api_key = 'API Key must be at least 10 characters';
      if (!paymentData.visa_secret_key || paymentData.visa_secret_key.length < 10) errors.visa_secret_key = 'Secret Key must be at least 10 characters';
    }

    if (paymentData.mastercard_enabled) {
      if (!paymentData.mastercard_merchant_id) errors.mastercard_merchant_id = 'Merchant ID is required';
      if (!paymentData.mastercard_api_key || paymentData.mastercard_api_key.length < 10) errors.mastercard_api_key = 'API Key must be at least 10 characters';
      if (!paymentData.mastercard_secret_key || paymentData.mastercard_secret_key.length < 10) errors.mastercard_secret_key = 'Secret Key must be at least 10 characters';
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSave = async (group: string, data: any) => {
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
        setMessage({ type: 'success', text: `${group.charAt(0).toUpperCase() + group.slice(1)} settings saved successfully!` });
        setTimeout(() => setMessage(null), 3000);
      }
    } catch (error) {
      console.error('Error saving settings:', error);
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
          backgroundColor: message.type === 'success' ? '#D1FAE5' : '#FEE2E2',
          border: `1px solid ${message.type === 'success' ? '#10B981' : '#EF4444'}`,
          borderRadius: '12px',
          marginBottom: '24px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          color: message.type === 'success' ? '#065F46' : '#991B1B',
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
                color: isActive ? 'white' : 'var(--text-secondary)',
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
          <Loader size={40} className="animate-spin text-teal-700" style={{ animation: 'spin 1s linear infinite' }} />
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
                <button onClick={() => handleSave('store', storeData)} disabled={saving} style={{ padding: '12px 24px', backgroundColor: saving ? '#9CA3AF' : 'var(--primary)', color: 'white', border: 'none', borderRadius: '10px', cursor: saving ? 'not-allowed' : 'pointer', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px' }}>
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
                <button onClick={() => handleSave('shipping', shippingData)} disabled={saving} style={{ padding: '12px 24px', backgroundColor: saving ? '#9CA3AF' : 'var(--primary)', color: 'white', border: 'none', borderRadius: '10px', cursor: saving ? 'not-allowed' : 'pointer', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px' }}>
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
                <button onClick={() => handleSave('tax', taxData)} disabled={saving} style={{ padding: '12px 24px', backgroundColor: saving ? '#9CA3AF' : 'var(--primary)', color: 'white', border: 'none', borderRadius: '10px', cursor: saving ? 'not-allowed' : 'pointer', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {saving ? <Loader size={18} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={18} />}
                  Save Tax Settings
                </button>
              </div>
            </div>
          )}

          {/* Payment Tab */}
          {activeTab === 'payment' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              
              <ToggleField label="Cash on Delivery (COD)" description="Customer pays cash when order is delivered" checked={paymentData.cod_enabled} onChange={(v: boolean) => setPaymentData({ ...paymentData, cod_enabled: v })} activeColor="#10B981" />

              {/* JazzCash */}
              <div style={{ padding: '24px', backgroundColor: 'var(--bg-primary)', borderRadius: '12px', border: `2px solid ${paymentData.jazzcash_enabled ? '#FF0080' : 'var(--border-color)'}` }}>
                <ToggleField label="JazzCash Mobile Account" description="Accept payments via JazzCash wallet" checked={paymentData.jazzcash_enabled} onChange={(v: boolean) => setPaymentData({ ...paymentData, jazzcash_enabled: v })} activeColor="#FF0080" />
                {paymentData.jazzcash_enabled && (
                  <div style={{ marginTop: '20px', paddingTop: '20px', borderTop: '1px solid var(--border-color)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px' }}>
                    <InputGroup label="Merchant ID" value={paymentData.jazzcash_merchant_id} onChange={(v: string) => setPaymentData({ ...paymentData, jazzcash_merchant_id: v })} error={validationErrors.jazzcash_merchant_id} placeholder="e.g., MC-12345" />
                    <InputGroup label="Password / Integrity Salt" type="password" value={paymentData.jazzcash_password} onChange={(v: string) => setPaymentData({ ...paymentData, jazzcash_password: v })} error={validationErrors.jazzcash_password} placeholder="••••••••••••" />
                  </div>
                )}
              </div>

              {/* Visa */}
              <div style={{ padding: '24px', backgroundColor: 'var(--bg-primary)', borderRadius: '12px', border: `2px solid ${paymentData.visa_enabled ? '#1A1F71' : 'var(--border-color)'}` }}>
                <ToggleField label="Visa Card" description="Accept Visa card payments via gateway" checked={paymentData.visa_enabled} onChange={(v: boolean) => setPaymentData({ ...paymentData, visa_enabled: v })} activeColor="#1A1F71" />
                {paymentData.visa_enabled && (
                  <div style={{ marginTop: '20px', paddingTop: '20px', borderTop: '1px solid var(--border-color)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px' }}>
                    <InputGroup label="Merchant ID" value={paymentData.visa_merchant_id} onChange={(v: string) => setPaymentData({ ...paymentData, visa_merchant_id: v })} error={validationErrors.visa_merchant_id} placeholder="e.g., VISA-12345" />
                    <InputGroup label="API Key" value={paymentData.visa_api_key} onChange={(v: string) => setPaymentData({ ...paymentData, visa_api_key: v })} error={validationErrors.visa_api_key} placeholder="visa_api_xxxxxxxxxxxx" />
                    <div style={{ gridColumn: '1 / -1' }}>
                      <InputGroup label="Secret Key" type="password" value={paymentData.visa_secret_key} onChange={(v: string) => setPaymentData({ ...paymentData, visa_secret_key: v })} error={validationErrors.visa_secret_key} placeholder="••••••••••••" />
                    </div>
                  </div>
                )}
              </div>

              {/* Mastercard */}
              <div style={{ padding: '24px', backgroundColor: 'var(--bg-primary)', borderRadius: '12px', border: `2px solid ${paymentData.mastercard_enabled ? '#FF5F00' : 'var(--border-color)'}` }}>
                <ToggleField label="Mastercard" description="Accept Mastercard payments via gateway" checked={paymentData.mastercard_enabled} onChange={(v: boolean) => setPaymentData({ ...paymentData, mastercard_enabled: v })} activeColor="#FF5F00" />
                {paymentData.mastercard_enabled && (
                  <div style={{ marginTop: '20px', paddingTop: '20px', borderTop: '1px solid var(--border-color)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px' }}>
                    <InputGroup label="Merchant ID" value={paymentData.mastercard_merchant_id} onChange={(v: string) => setPaymentData({ ...paymentData, mastercard_merchant_id: v })} error={validationErrors.mastercard_merchant_id} placeholder="e.g., MC-12345" />
                    <InputGroup label="API Key" value={paymentData.mastercard_api_key} onChange={(v: string) => setPaymentData({ ...paymentData, mastercard_api_key: v })} error={validationErrors.mastercard_api_key} placeholder="mc_api_xxxxxxxxxxxx" />
                    <div style={{ gridColumn: '1 / -1' }}>
                      <InputGroup label="Secret Key" type="password" value={paymentData.mastercard_secret_key} onChange={(v: string) => setPaymentData({ ...paymentData, mastercard_secret_key: v })} error={validationErrors.mastercard_secret_key} placeholder="••••••••••••" />
                    </div>
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '16px', borderTop: '1px solid var(--border-color)' }}>
                <button onClick={() => handleSave('payment', paymentData)} disabled={saving} style={{ padding: '12px 24px', backgroundColor: saving ? '#9CA3AF' : 'var(--primary)', color: 'white', border: 'none', borderRadius: '10px', cursor: saving ? 'not-allowed' : 'pointer', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px' }}>
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
                <button onClick={() => handleSave('social', socialData)} disabled={saving} style={{ padding: '12px 24px', backgroundColor: saving ? '#9CA3AF' : 'var(--primary)', color: 'white', border: 'none', borderRadius: '10px', cursor: saving ? 'not-allowed' : 'pointer', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px' }}>
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
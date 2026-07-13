'use client';

import { useEffect, useState } from 'react';
import { 
  Store, 
  Truck, 
  Percent, 
  CreditCard, 
  Save, 
  CheckCircle,
  AlertCircle,
  Loader,
  Globe,
  Share2,
  Link as LinkIcon,
  MessageCircle,
  AtSign,
  ExternalLink,
  Smartphone,
  Banknote,
  AlertTriangle
} from 'lucide-react';
import api from '@/lib/api';

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState('store');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  const [storeData, setStoreData] = useState({
    store_name: '',
    store_email: '',
    store_phone: '',
    store_address: '',
    currency: 'PKR'
  });

  const [shippingData, setShippingData] = useState({
    shipping_flat_rate: '',
    free_shipping_min: '',
    delivery_days: ''
  });

  const [taxData, setTaxData] = useState({
    tax_enabled: false,
    tax_rate: ''
  });

  // ✅ UPDATED: Payment state with 4 methods
  const [paymentData, setPaymentData] = useState({
    // COD
    cod_enabled: true,
    
    // JazzCash
    jazzcash_enabled: false,
    jazzcash_merchant_id: '',
    jazzcash_password: '',
    
    // Visa Card
    visa_enabled: false,
    visa_merchant_id: '',
    visa_api_key: '',
    visa_secret_key: '',
    
    // Mastercard
    mastercard_enabled: false,
    mastercard_merchant_id: '',
    mastercard_api_key: '',
    mastercard_secret_key: ''
  });

  const [socialData, setSocialData] = useState({
    facebook: '',
    instagram: '',
    twitter: '',
    youtube: '',
    linkedin: '',
    website: ''
  });

  // ✅ Smart Validation States
  const [cardValidation, setCardValidation] = useState<{
    visa: { valid: boolean; message: string } | null;
    mastercard: { valid: boolean; message: string } | null;
    jazzcash: { valid: boolean; message: string } | null;
  }>({
    visa: null,
    mastercard: null,
    jazzcash: null
  });

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const response = await api.get('/settings');
      if (response.data.success) {
        const data = response.data.data;
        
        if (data.store) {
          setStoreData({ ...storeData, ...data.store });
        }
        if (data.shipping) {
          setShippingData({ ...shippingData, ...data.shipping });
        }
        if (data.tax) {
          setTaxData({ ...taxData, ...data.tax });
        }
        if (data.payment) {
          setPaymentData({ ...paymentData, ...data.payment });
        }
        if (data.social) {
          setSocialData({ ...socialData, ...data.social });
        }
      }
    } catch (error) {
      console.error('Error fetching settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (group: string, data: any) => {
    // ✅ Validate before saving
    if (group === 'payment') {
      const validation = validatePaymentData(data);
      if (!validation.valid) {
        setMessage({ type: 'error', text: validation.message });
        setTimeout(() => setMessage(null), 5000);
        return;
      }
    }

    setSaving(true);
    setMessage(null);
    try {
      const response = await api.put('/settings', data);
      if (response.data.success) {
        setMessage({ type: 'success', text: 'Settings saved successfully!' });
        setTimeout(() => setMessage(null), 3000);
      }
    } catch (error) {
      console.error('Error saving settings:', error);
      setMessage({ type: 'error', text: 'Failed to save settings' });
      setTimeout(() => setMessage(null), 3000);
    } finally {
      setSaving(false);
    }
  };

  // ✅ Smart Validation Function
  const validatePaymentData = (data: any) => {
    // JazzCash Validation
    if (data.jazzcash_enabled) {
      if (!data.jazzcash_merchant_id || !data.jazzcash_password) {
        return { valid: false, message: 'JazzCash credentials are required when enabled' };
      }
      
      // Check if JazzCash merchant ID format is correct
      const jazzcashIdPattern = /^[A-Z0-9-]+$/;
      if (!jazzcashIdPattern.test(data.jazzcash_merchant_id)) {
        return { 
          valid: false, 
          message: 'Invalid JazzCash Merchant ID format. Use alphanumeric characters only.' 
        };
      }
    }

    // Visa Validation
    if (data.visa_enabled) {
      if (!data.visa_merchant_id || !data.visa_api_key || !data.visa_secret_key) {
        return { valid: false, message: 'Visa Card credentials are required when enabled' };
      }
      
      // Check if credentials look like Visa format
      if (!data.visa_merchant_id.startsWith('VISA-')) {
        return { 
          valid: false, 
          message: 'Invalid Visa Merchant ID. Must start with "VISA-"' 
        };
      }
    }

    // Mastercard Validation
    if (data.mastercard_enabled) {
      if (!data.mastercard_merchant_id || !data.mastercard_api_key || !data.mastercard_secret_key) {
        return { valid: false, message: 'Mastercard credentials are required when enabled' };
      }
      
      // Check if credentials look like Mastercard format
      if (!data.mastercard_merchant_id.startsWith('MC-')) {
        return { 
          valid: false, 
          message: 'Invalid Mastercard Merchant ID. Must start with "MC-"' 
        };
      }
    }

    // ✅ Cross-validation: Check if wrong credentials are entered
    if (data.visa_enabled && data.mastercard_enabled) {
      // If both are enabled, check if credentials are mixed up
      if (data.visa_merchant_id.startsWith('MC-') || data.mastercard_merchant_id.startsWith('VISA-')) {
        return { 
          valid: false, 
          message: '⚠️ Warning: Visa and Mastercard credentials appear to be swapped! Please check your credentials.' 
        };
      }
    }

    return { valid: true, message: '' };
  };

  // ✅ Real-time Card Validation
  const validateCardNumber = (cardNumber: string, type: 'visa' | 'mastercard') => {
    const cleanNumber = cardNumber.replace(/\s/g, '');
    
    if (cleanNumber.length === 0) {
      setCardValidation(prev => ({ ...prev, [type]: null }));
      return;
    }

    if (type === 'visa') {
      // Visa starts with 4
      if (!cleanNumber.startsWith('4')) {
        setCardValidation(prev => ({ 
          ...prev, 
          visa: { 
            valid: false, 
            message: '⚠️ This is not a Visa card number. Visa cards start with 4.' 
          } 
        }));
      } else if (cleanNumber.length >= 13 && cleanNumber.length <= 19) {
        setCardValidation(prev => ({ 
          ...prev, 
          visa: { valid: true, message: '✓ Valid Visa card format' } 
        }));
      } else {
        setCardValidation(prev => ({ 
          ...prev, 
          visa: { 
            valid: false, 
            message: '⚠️ Visa card number must be 13-19 digits' 
          } 
        }));
      }
    } else if (type === 'mastercard') {
      // Mastercard starts with 5 (51-55) or 2 (2221-2720)
      const firstTwo = parseInt(cleanNumber.substring(0, 2));
      const firstFour = parseInt(cleanNumber.substring(0, 4));
      
      const isValidMastercard = 
        (firstTwo >= 51 && firstTwo <= 55) ||
        (firstFour >= 2221 && firstFour <= 2720);
      
      if (!isValidMastercard && cleanNumber.length >= 2) {
        setCardValidation(prev => ({ 
          ...prev, 
          mastercard: { 
            valid: false, 
            message: '⚠️ This is not a Mastercard number. Mastercard starts with 51-55 or 2221-2720.' 
          } 
        }));
      } else if (cleanNumber.length === 16) {
        setCardValidation(prev => ({ 
          ...prev, 
          mastercard: { valid: true, message: '✓ Valid Mastercard format' } 
        }));
      } else if (cleanNumber.length > 0) {
        setCardValidation(prev => ({ 
          ...prev, 
          mastercard: { 
            valid: false, 
            message: '⚠️ Mastercard number must be 16 digits' 
          } 
        }));
      }
    }
  };

  // ✅ JazzCash Validation
  const validateJazzCashNumber = (phone: string) => {
    const cleanPhone = phone.replace(/\s/g, '');
    
    if (cleanPhone.length === 0) {
      setCardValidation(prev => ({ ...prev, jazzcash: null }));
      return;
    }

    // Pakistani mobile format: 03XX-XXXXXXX
    const jazzcashPattern = /^03[0-9]{2}[0-9]{7}$/;
    
    if (!jazzcashPattern.test(cleanPhone)) {
      setCardValidation(prev => ({ 
        ...prev, 
        jazzcash: { 
          valid: false, 
          message: '⚠️ Invalid JazzCash number. Format: 03XX-XXXXXXX' 
        } 
      }));
    } else {
      setCardValidation(prev => ({ 
        ...prev, 
        jazzcash: { valid: true, message: '✓ Valid JazzCash number' } 
      }));
    }
  };

  const tabs = [
    { id: 'store', label: 'Store Info', icon: Store },
    { id: 'shipping', label: 'Shipping', icon: Truck },
    { id: 'tax', label: 'Tax Rules', icon: Percent },
    { id: 'payment', label: 'Payments', icon: CreditCard },
    { id: 'social', label: 'Social Media', icon: Globe }
  ];

  const inputStyle = {
    width: '100%',
    padding: '12px 16px',
    border: '1px solid var(--border-color)',
    borderRadius: '10px',
    fontSize: '14px',
    outline: 'none',
    backgroundColor: 'var(--input-bg)',
    color: 'var(--text-primary)'
  };

  const buttonStyle = (saving: boolean) => ({
    padding: '12px 24px',
    backgroundColor: saving ? '#9CA3AF' : 'var(--primary)',
    color: 'white',
    border: 'none',
    borderRadius: '10px',
    cursor: saving ? 'not-allowed' : 'pointer',
    fontWeight: '600',
    display: 'flex',
    alignItems: 'center',
    gap: '8px'
  });

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ 
          fontSize: '32px', 
          fontWeight: '800', 
          color: 'var(--text-primary)',
          marginBottom: '8px'
        }}>
          Settings & Configuration
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '15px' }}>
          Manage your store preferences and configurations
        </p>
      </div>

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
          color: message.type === 'success' ? '#065F46' : '#991B1B'
        }}>
          {message.type === 'success' ? <CheckCircle size={24} /> : <AlertCircle size={24} />}
          <span style={{ fontWeight: '600' }}>{message.text}</span>
        </div>
      )}

      {/* Tabs */}
      <div style={{ 
        display: 'flex', 
        gap: '8px', 
        marginBottom: '32px', 
        borderBottom: '2px solid var(--border-color)', 
        paddingBottom: '8px',
        flexWrap: 'wrap'
      }}>
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '12px 24px',
                backgroundColor: isActive ? 'var(--primary)' : 'transparent',
                color: isActive ? 'white' : 'var(--text-secondary)',
                border: isActive ? 'none' : '1px solid transparent',
                borderRadius: '8px',
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

      {/* Tab Content */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
          <Loader size={40} style={{ animation: 'spin 1s linear infinite' }} color="var(--primary)" />
        </div>
      ) : (
        <div style={{
          backgroundColor: 'var(--card-bg)',
          borderRadius: '16px',
          padding: '32px',
          border: '1px solid var(--border-color)',
          maxWidth: '800px'
        }}>
          
          {/* Store Info */}
          {activeTab === 'store' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' }}>
                  Store Name
                </label>
                <input
                  type="text"
                  value={storeData.store_name}
                  onChange={(e) => setStoreData({ ...storeData, store_name: e.target.value })}
                  style={inputStyle}
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' }}>
                    Store Email
                  </label>
                  <input
                    type="email"
                    value={storeData.store_email}
                    onChange={(e) => setStoreData({ ...storeData, store_email: e.target.value })}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' }}>
                    Store Phone
                  </label>
                  <input
                    type="text"
                    value={storeData.store_phone}
                    onChange={(e) => setStoreData({ ...storeData, store_phone: e.target.value })}
                    style={inputStyle}
                  />
                </div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' }}>
                  Store Address
                </label>
                <textarea
                  rows={3}
                  value={storeData.store_address}
                  onChange={(e) => setStoreData({ ...storeData, store_address: e.target.value })}
                  style={{ ...inputStyle, resize: 'vertical' }}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  onClick={() => handleSave('store', storeData)}
                  disabled={saving}
                  style={buttonStyle(saving)}
                >
                  {saving ? <Loader size={20} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={20} />}
                  Save Store Info
                </button>
              </div>
            </div>
          )}

          {/* Shipping */}
          {activeTab === 'shipping' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' }}>
                  Flat Shipping Rate (Rs.)
                </label>
                <input
                  type="number"
                  value={shippingData.shipping_flat_rate}
                  onChange={(e) => setShippingData({ ...shippingData, shipping_flat_rate: e.target.value })}
                  style={inputStyle}
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' }}>
                    Free Shipping Minimum (Rs.)
                  </label>
                  <input
                    type="number"
                    value={shippingData.free_shipping_min}
                    onChange={(e) => setShippingData({ ...shippingData, free_shipping_min: e.target.value })}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' }}>
                    Estimated Delivery Days
                  </label>
                  <input
                    type="number"
                    value={shippingData.delivery_days}
                    onChange={(e) => setShippingData({ ...shippingData, delivery_days: e.target.value })}
                    style={inputStyle}
                  />
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  onClick={() => handleSave('shipping', shippingData)}
                  disabled={saving}
                  style={buttonStyle(saving)}
                >
                  {saving ? <Loader size={20} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={20} />}
                  Save Shipping Settings
                </button>
              </div>
            </div>
          )}

          {/* Tax */}
          {activeTab === 'tax' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <label style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)' }}>
                  Enable Tax
                </label>
                <label style={{ position: 'relative', display: 'inline-block', width: '50px', height: '26px' }}>
                  <input
                    type="checkbox"
                    checked={taxData.tax_enabled}
                    onChange={(e) => setTaxData({ ...taxData, tax_enabled: e.target.checked })}
                    style={{ opacity: 0, width: 0, height: 0 }}
                  />
                  <span style={{
                    position: 'absolute', cursor: 'pointer', inset: 0,
                    backgroundColor: taxData.tax_enabled ? 'var(--primary)' : '#ccc',
                    transition: '.4s', borderRadius: '34px'
                  }}>
                    <span style={{
                      position: 'absolute', content: '""', height: '20px', width: '20px',
                      left: '3px', bottom: '3px', backgroundColor: 'white', transition: '.4s', borderRadius: '50%',
                      transform: taxData.tax_enabled ? 'translateX(24px)' : 'translateX(0)'
                    }} />
                  </span>
                </label>
              </div>
              {taxData.tax_enabled && (
                <div>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' }}>
                    Tax Rate (%)
                  </label>
                  <input
                    type="number"
                    value={taxData.tax_rate}
                    onChange={(e) => setTaxData({ ...taxData, tax_rate: e.target.value })}
                    style={inputStyle}
                  />
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  onClick={() => handleSave('tax', taxData)}
                  disabled={saving}
                  style={buttonStyle(saving)}
                >
                  {saving ? <Loader size={20} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={20} />}
                  Save Tax Settings
                </button>
              </div>
            </div>
          )}

          {/* ✅ UPDATED: Payment Tab with 4 Methods */}
          {activeTab === 'payment' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              
              {/* 1. Cash on Delivery */}
              <div style={{ 
                padding: '24px', 
                backgroundColor: 'var(--bg-primary)', 
                borderRadius: '12px', 
                border: '2px solid var(--border-color)' 
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <div>
                    <h3 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '4px' }}>
                      💵 Cash on Delivery (COD)
                    </h3>
                    <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                      Customer pays cash when order is delivered
                    </p>
                  </div>
                  <label style={{ position: 'relative', display: 'inline-block', width: '50px', height: '26px' }}>
                    <input
                      type="checkbox"
                      checked={paymentData.cod_enabled}
                      onChange={(e) => setPaymentData({ ...paymentData, cod_enabled: e.target.checked })}
                      style={{ opacity: 0, width: 0, height: 0 }}
                    />
                    <span style={{
                      position: 'absolute', cursor: 'pointer', inset: 0,
                      backgroundColor: paymentData.cod_enabled ? 'var(--primary)' : '#ccc',
                      transition: '.4s', borderRadius: '34px'
                    }}>
                      <span style={{
                        position: 'absolute', content: '""', height: '20px', width: '20px',
                        left: '3px', bottom: '3px', backgroundColor: 'white', transition: '.4s', borderRadius: '50%',
                        transform: paymentData.cod_enabled ? 'translateX(24px)' : 'translateX(0)'
                      }} />
                    </span>
                  </label>
                </div>
              </div>

              {/* 2. JazzCash */}
              <div style={{ 
                padding: '24px', 
                backgroundColor: 'var(--bg-primary)', 
                borderRadius: '12px', 
                border: paymentData.jazzcash_enabled ? '2px solid #FF0080' : '2px solid var(--border-color)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <div>
                    <h3 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '4px' }}>
                      📱 JazzCash Mobile Account
                    </h3>
                    <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                      Accept payments via JazzCash wallet
                    </p>
                  </div>
                  <label style={{ position: 'relative', display: 'inline-block', width: '50px', height: '26px' }}>
                    <input
                      type="checkbox"
                      checked={paymentData.jazzcash_enabled}
                      onChange={(e) => setPaymentData({ ...paymentData, jazzcash_enabled: e.target.checked })}
                      style={{ opacity: 0, width: 0, height: 0 }}
                    />
                    <span style={{
                      position: 'absolute', cursor: 'pointer', inset: 0,
                      backgroundColor: paymentData.jazzcash_enabled ? '#FF0080' : '#ccc',
                      transition: '.4s', borderRadius: '34px'
                    }}>
                      <span style={{
                        position: 'absolute', content: '""', height: '20px', width: '20px',
                        left: '3px', bottom: '3px', backgroundColor: 'white', transition: '.4s', borderRadius: '50%',
                        transform: paymentData.jazzcash_enabled ? 'translateX(24px)' : 'translateX(0)'
                      }} />
                    </span>
                  </label>
                </div>
                
                {paymentData.jazzcash_enabled && (
                  <div style={{ marginTop: '20px', paddingTop: '20px', borderTop: '1px solid var(--border-color)' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                      <div style={{ gridColumn: '1 / -1' }}>
                        <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' }}>
                          Merchant ID
                        </label>
                        <input
                          type="text"
                          value={paymentData.jazzcash_merchant_id}
                          onChange={(e) => {
                            setPaymentData({ ...paymentData, jazzcash_merchant_id: e.target.value });
                            validateJazzCashNumber(e.target.value);
                          }}
                          placeholder="MC-XXXXX"
                          style={inputStyle}
                        />
                      </div>
                      <div style={{ gridColumn: '1 / -1' }}>
                        <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' }}>
                          Password / Integrity Salt
                        </label>
                        <input
                          type="password"
                          value={paymentData.jazzcash_password}
                          onChange={(e) => setPaymentData({ ...paymentData, jazzcash_password: e.target.value })}
                          placeholder="••••••••••••"
                          style={inputStyle}
                        />
                      </div>
                    </div>
                    
                    {/* JazzCash Validation Message */}
                    {cardValidation.jazzcash && (
                      <div style={{
                        marginTop: '12px',
                        padding: '10px 14px',
                        backgroundColor: cardValidation.jazzcash.valid ? '#D1FAE5' : '#FEE2E2',
                        border: `1px solid ${cardValidation.jazzcash.valid ? '#10B981' : '#EF4444'}`,
                        borderRadius: '8px',
                        fontSize: '13px',
                        color: cardValidation.jazzcash.valid ? '#065F46' : '#991B1B',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                      }}>
                        {cardValidation.jazzcash.valid ? <CheckCircle size={16} /> : <AlertTriangle size={16} />}
                        {cardValidation.jazzcash.message}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* 3. Visa Card */}
              <div style={{ 
                padding: '24px', 
                backgroundColor: 'var(--bg-primary)', 
                borderRadius: '12px', 
                border: paymentData.visa_enabled ? '2px solid #1A1F71' : '2px solid var(--border-color)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <div>
                    <h3 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '4px' }}>
                      💳 Visa Card
                    </h3>
                    <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                      Accept Visa card payments
                    </p>
                  </div>
                  <label style={{ position: 'relative', display: 'inline-block', width: '50px', height: '26px' }}>
                    <input
                      type="checkbox"
                      checked={paymentData.visa_enabled}
                      onChange={(e) => setPaymentData({ ...paymentData, visa_enabled: e.target.checked })}
                      style={{ opacity: 0, width: 0, height: 0 }}
                    />
                    <span style={{
                      position: 'absolute', cursor: 'pointer', inset: 0,
                      backgroundColor: paymentData.visa_enabled ? '#1A1F71' : '#ccc',
                      transition: '.4s', borderRadius: '34px'
                    }}>
                      <span style={{
                        position: 'absolute', content: '""', height: '20px', width: '20px',
                        left: '3px', bottom: '3px', backgroundColor: 'white', transition: '.4s', borderRadius: '50%',
                        transform: paymentData.visa_enabled ? 'translateX(24px)' : 'translateX(0)'
                      }} />
                    </span>
                  </label>
                </div>
                
                {paymentData.visa_enabled && (
                  <div style={{ marginTop: '20px', paddingTop: '20px', borderTop: '1px solid var(--border-color)' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                      <div style={{ gridColumn: '1 / -1' }}>
                        <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' }}>
                          Merchant ID
                        </label>
                        <input
                          type="text"
                          value={paymentData.visa_merchant_id}
                          onChange={(e) => setPaymentData({ ...paymentData, visa_merchant_id: e.target.value })}
                          placeholder="VISA-XXXXX"
                          style={inputStyle}
                        />
                      </div>
                      <div style={{ gridColumn: '1 / -1' }}>
                        <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' }}>
                          API Key
                        </label>
                        <input
                          type="text"
                          value={paymentData.visa_api_key}
                          onChange={(e) => {
                            setPaymentData({ ...paymentData, visa_api_key: e.target.value });
                            validateCardNumber(e.target.value, 'visa');
                          }}
                          placeholder="visa_api_xxxxxxxxxxxx"
                          style={inputStyle}
                        />
                      </div>
                      <div style={{ gridColumn: '1 / -1' }}>
                        <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' }}>
                          Secret Key
                        </label>
                        <input
                          type="password"
                          value={paymentData.visa_secret_key}
                          onChange={(e) => setPaymentData({ ...paymentData, visa_secret_key: e.target.value })}
                          placeholder="••••••••••••"
                          style={inputStyle}
                        />
                      </div>
                    </div>
                    
                    {/* Visa Validation Message */}
                    {cardValidation.visa && (
                      <div style={{
                        marginTop: '12px',
                        padding: '10px 14px',
                        backgroundColor: cardValidation.visa.valid ? '#D1FAE5' : '#FEE2E2',
                        border: `1px solid ${cardValidation.visa.valid ? '#10B981' : '#EF4444'}`,
                        borderRadius: '8px',
                        fontSize: '13px',
                        color: cardValidation.visa.valid ? '#065F46' : '#991B1B',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                      }}>
                        {cardValidation.visa.valid ? <CheckCircle size={16} /> : <AlertTriangle size={16} />}
                        {cardValidation.visa.message}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* 4. Mastercard */}
              <div style={{ 
                padding: '24px', 
                backgroundColor: 'var(--bg-primary)', 
                borderRadius: '12px', 
                border: paymentData.mastercard_enabled ? '2px solid #FF5F00' : '2px solid var(--border-color)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <div>
                    <h3 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '4px' }}>
                      💳 Mastercard
                    </h3>
                    <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                      Accept Mastercard payments
                    </p>
                  </div>
                  <label style={{ position: 'relative', display: 'inline-block', width: '50px', height: '26px' }}>
                    <input
                      type="checkbox"
                      checked={paymentData.mastercard_enabled}
                      onChange={(e) => setPaymentData({ ...paymentData, mastercard_enabled: e.target.checked })}
                      style={{ opacity: 0, width: 0, height: 0 }}
                    />
                    <span style={{
                      position: 'absolute', cursor: 'pointer', inset: 0,
                      backgroundColor: paymentData.mastercard_enabled ? '#FF5F00' : '#ccc',
                      transition: '.4s', borderRadius: '34px'
                    }}>
                      <span style={{
                        position: 'absolute', content: '""', height: '20px', width: '20px',
                        left: '3px', bottom: '3px', backgroundColor: 'white', transition: '.4s', borderRadius: '50%',
                        transform: paymentData.mastercard_enabled ? 'translateX(24px)' : 'translateX(0)'
                      }} />
                    </span>
                  </label>
                </div>
                
                {paymentData.mastercard_enabled && (
                  <div style={{ marginTop: '20px', paddingTop: '20px', borderTop: '1px solid var(--border-color)' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                      <div style={{ gridColumn: '1 / -1' }}>
                        <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' }}>
                          Merchant ID
                        </label>
                        <input
                          type="text"
                          value={paymentData.mastercard_merchant_id}
                          onChange={(e) => setPaymentData({ ...paymentData, mastercard_merchant_id: e.target.value })}
                          placeholder="MC-XXXXX"
                          style={inputStyle}
                        />
                      </div>
                      <div style={{ gridColumn: '1 / -1' }}>
                        <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' }}>
                          API Key
                        </label>
                        <input
                          type="text"
                          value={paymentData.mastercard_api_key}
                          onChange={(e) => {
                            setPaymentData({ ...paymentData, mastercard_api_key: e.target.value });
                            validateCardNumber(e.target.value, 'mastercard');
                          }}
                          placeholder="mc_api_xxxxxxxxxxxx"
                          style={inputStyle}
                        />
                      </div>
                      <div style={{ gridColumn: '1 / -1' }}>
                        <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' }}>
                          Secret Key
                        </label>
                        <input
                          type="password"
                          value={paymentData.mastercard_secret_key}
                          onChange={(e) => setPaymentData({ ...paymentData, mastercard_secret_key: e.target.value })}
                          placeholder="••••••••••••"
                          style={inputStyle}
                        />
                      </div>
                    </div>
                    
                    {/* Mastercard Validation Message */}
                    {cardValidation.mastercard && (
                      <div style={{
                        marginTop: '12px',
                        padding: '10px 14px',
                        backgroundColor: cardValidation.mastercard.valid ? '#D1FAE5' : '#FEE2E2',
                        border: `1px solid ${cardValidation.mastercard.valid ? '#10B981' : '#EF4444'}`,
                        borderRadius: '8px',
                        fontSize: '13px',
                        color: cardValidation.mastercard.valid ? '#065F46' : '#991B1B',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                      }}>
                        {cardValidation.mastercard.valid ? <CheckCircle size={16} /> : <AlertTriangle size={16} />}
                        {cardValidation.mastercard.message}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  onClick={() => handleSave('payment', paymentData)}
                  disabled={saving}
                  style={buttonStyle(saving)}
                >
                  {saving ? <Loader size={20} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={20} />}
                  Save Payment Settings
                </button>
              </div>
            </div>
          )}

          {/* Social Media Tab */}
          {activeTab === 'social' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' }}>
                  <Share2 size={18} color="#1877F2" />
                  Facebook URL
                </label>
                <input
                  type="url"
                  value={socialData.facebook || ''}
                  onChange={(e) => setSocialData({ ...socialData, facebook: e.target.value })}
                  placeholder="https://facebook.com/yourstore"
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' }}>
                  <AtSign size={18} color="#E4405F" />
                  Instagram URL
                </label>
                <input
                  type="url"
                  value={socialData.instagram || ''}
                  onChange={(e) => setSocialData({ ...socialData, instagram: e.target.value })}
                  placeholder="https://instagram.com/yourstore"
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' }}>
                  <MessageCircle size={18} color="#1DA1F2" />
                  Twitter URL
                </label>
                <input
                  type="url"
                  value={socialData.twitter || ''}
                  onChange={(e) => setSocialData({ ...socialData, twitter: e.target.value })}
                  placeholder="https://twitter.com/yourstore"
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' }}>
                  <ExternalLink size={18} color="#FF0000" />
                  YouTube URL
                </label>
                <input
                  type="url"
                  value={socialData.youtube || ''}
                  onChange={(e) => setSocialData({ ...socialData, youtube: e.target.value })}
                  placeholder="https://youtube.com/yourstore"
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' }}>
                  <LinkIcon size={18} color="#0A66C2" />
                  LinkedIn URL
                </label>
                <input
                  type="url"
                  value={socialData.linkedin || ''}
                  onChange={(e) => setSocialData({ ...socialData, linkedin: e.target.value })}
                  placeholder="https://linkedin.com/company/yourstore"
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' }}>
                  <Globe size={18} color="var(--primary)" />
                  Website URL
                </label>
                <input
                  type="url"
                  value={socialData.website || ''}
                  onChange={(e) => setSocialData({ ...socialData, website: e.target.value })}
                  placeholder="https://yourstore.com"
                  style={inputStyle}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  onClick={() => handleSave('social', socialData)}
                  disabled={saving}
                  style={buttonStyle(saving)}
                >
                  {saving ? <Loader size={20} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={20} />}
                  Save Social Media
                </button>
              </div>
            </div>
          )}

        </div>
      )}

      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
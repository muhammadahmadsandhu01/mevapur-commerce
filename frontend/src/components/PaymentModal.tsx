'use client';

import { useState } from 'react';
import { X, Lock, Shield, CreditCard, Smartphone, Loader, CheckCircle } from 'lucide-react';

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  paymentMethod: string;
  amount: number;
  onSuccess: () => void;
}

export default function PaymentModal({ isOpen, onClose, paymentMethod, amount, onSuccess }: PaymentModalProps) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    cardNumber: '', cardHolder: '', expiry: '', cvv: '',
    accountNumber: '', accountTitle: '', pin: ''
  });

  if (!isOpen) return null;

  const isCard = paymentMethod === 'visa' || paymentMethod === 'mastercard';
  const isJazzCash = paymentMethod === 'jazzcash';

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  // Format Card Number (1234 5678...)
  const formatCardNumber = (value: string) => {
    return value.replace(/\s/g, '').replace(/(.{4})/g, '$1 ').trim();
  };

  const handlePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    // Simulate Payment Gateway Processing (2 seconds)
    await new Promise(resolve => setTimeout(resolve, 2000));

    setLoading(false);
    onSuccess(); // Redirect to success page
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 9999,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px',
      backdropFilter: 'blur(4px)'
    }} onClick={onClose}>
      
      <div style={{
        backgroundColor: 'white', borderRadius: '20px', maxWidth: '480px', width: '100%',
        boxShadow: '0 25px 60px rgba(0,0,0,0.3)', overflow: 'hidden', animation: 'slideUp 0.3s ease'
      }} onClick={e => e.stopPropagation()}>
        
        {/* Header */}
        <div style={{
          background: 'linear-gradient(135deg, #0F766E 0%, #115E59 100%)',
          padding: '24px', color: 'white', position: 'relative'
        }}>
          <button onClick={onClose} style={{
            position: 'absolute', top: '16px', right: '16px', background: 'rgba(255,255,255,0.2)',
            border: 'none', borderRadius: '50%', width: '32px', height: '32px',
            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'white'
          }}>
            <X size={18} />
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
            {isCard ? <CreditCard size={28} /> : <Smartphone size={28} />}
            <h2 style={{ fontSize: '20px', fontWeight: '800', margin: 0 }}>
              {isCard ? `${paymentMethod.toUpperCase()} Payment` : 'JazzCash Payment'}
            </h2>
          </div>
          <p style={{ fontSize: '14px', opacity: 0.9, margin: 0 }}>
            Securely pay Rs. {amount.toFixed(2)}
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handlePayment} style={{ padding: '28px' }}>
          
          {isJazzCash && (
            <>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '6px' }}> Account Number</label>
                <input name="accountNumber" value={formData.accountNumber} onChange={handleInputChange} placeholder="03XX-XXXXXXX" required
                  style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '2px solid #E5E7EB', fontSize: '15px', outline: 'none' }}
                  onFocus={e => e.currentTarget.style.borderColor = '#0F766E'} onBlur={e => e.currentTarget.style.borderColor = '#E5E7EB'} />
              </div>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '6px' }}>👤 Account Title</label>
                <input name="accountTitle" value={formData.accountTitle} onChange={handleInputChange} placeholder="e.g. Ahmed Khan" required
                  style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '2px solid #E5E7EB', fontSize: '15px', outline: 'none' }}
                  onFocus={e => e.currentTarget.style.borderColor = '#0F766E'} onBlur={e => e.currentTarget.style.borderColor = '#E5E7EB'} />
              </div>
              <div style={{ marginBottom: '24px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '6px' }}>🔐 Payment PIN / OTP</label>
                <input name="pin" type="password" value={formData.pin} onChange={handleInputChange} placeholder="Enter 4-digit PIN" maxLength={4} required
                  style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '2px solid #E5E7EB', fontSize: '15px', outline: 'none', letterSpacing: '4px' }}
                  onFocus={e => e.currentTarget.style.borderColor = '#0F766E'} onBlur={e => e.currentTarget.style.borderColor = '#E5E7EB'} />
              </div>
            </>
          )}

          {isCard && (
            <>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '6px' }}>💳 Card Number</label>
                <input name="cardNumber" value={formData.cardNumber} 
                  onChange={e => setFormData({...formData, cardNumber: formatCardNumber(e.target.value)})} 
                  placeholder="1234 5678 9012 3456" maxLength={19} required
                  style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '2px solid #E5E7EB', fontSize: '15px', outline: 'none', fontFamily: 'monospace' }}
                  onFocus={e => e.currentTarget.style.borderColor = '#0F766E'} onBlur={e => e.currentTarget.style.borderColor = '#E5E7EB'} />
              </div>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '6px' }}>👤 Card Holder Name</label>
                <input name="cardHolder" value={formData.cardHolder} onChange={handleInputChange} placeholder="AHMED KHAN" required
                  style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '2px solid #E5E7EB', fontSize: '15px', outline: 'none', textTransform: 'uppercase' }}
                  onFocus={e => e.currentTarget.style.borderColor = '#0F766E'} onBlur={e => e.currentTarget.style.borderColor = '#E5E7EB'} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '6px' }}> Expiry</label>
                  <input name="expiry" value={formData.expiry} onChange={handleInputChange} placeholder="MM/YY" maxLength={5} required
                    style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '2px solid #E5E7EB', fontSize: '15px', outline: 'none' }}
                    onFocus={e => e.currentTarget.style.borderColor = '#0F766E'} onBlur={e => e.currentTarget.style.borderColor = '#E5E7EB'} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '6px' }}>🔒 CVV</label>
                  <input name="cvv" type="password" value={formData.cvv} onChange={handleInputChange} placeholder="123" maxLength={4} required
                    style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '2px solid #E5E7EB', fontSize: '15px', outline: 'none' }}
                    onFocus={e => e.currentTarget.style.borderColor = '#0F766E'} onBlur={e => e.currentTarget.style.borderColor = '#E5E7EB'} />
                </div>
              </div>
            </>
          )}

          {/* Security Badge */}
          <div style={{
            backgroundColor: '#F0FDFA', borderRadius: '10px', padding: '12px',
            display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '24px', border: '1px solid #0F766E'
          }}>
            <Shield size={18} color="#0F766E" />
            <div>
              <p style={{ fontSize: '12px', fontWeight: '700', color: '#0F766E', margin: 0 }}>256-bit SSL Encrypted</p>
              <p style={{ fontSize: '11px', color: '#6B7280', margin: 0 }}>Your data is safe and secure</p>
            </div>
          </div>

          {/* Buttons */}
          <div style={{ display: 'flex', gap: '12px' }}>
            <button type="button" onClick={onClose} disabled={loading} style={{
              flex: 1, padding: '14px', borderRadius: '10px', border: '2px solid #E5E7EB',
              backgroundColor: 'white', color: '#374151', fontWeight: '700', fontSize: '15px',
              cursor: loading ? 'not-allowed' : 'pointer', transition: 'all 0.2s'
            }}
              onMouseEnter={e => e.currentTarget.style.backgroundColor = '#F3F4F6'}
              onMouseLeave={e => e.currentTarget.style.backgroundColor = 'white'}
            >
              Cancel
            </button>
            <button type="submit" disabled={loading} style={{
              flex: 2, padding: '14px', borderRadius: '10px', border: 'none',
              backgroundColor: loading ? '#9CA3AF' : '#0F766E', color: 'white',
              fontWeight: '700', fontSize: '15px', cursor: loading ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
              boxShadow: '0 4px 12px rgba(15,118,110,0.3)', transition: 'all 0.3s'
            }}
              onMouseEnter={e => { if(!loading) { e.currentTarget.style.backgroundColor = '#115E59'; e.currentTarget.style.transform = 'translateY(-2px)'; } }}
              onMouseLeave={e => { if(!loading) { e.currentTarget.style.backgroundColor = '#0F766E'; e.currentTarget.style.transform = 'translateY(0)'; } }}
            >
              {loading ? (
                <>
                  <Loader size={18} style={{ animation: 'spin 1s linear infinite' }} /> Processing...
                </>
              ) : (
                <>
                  <Lock size={16} /> Pay Rs. {amount.toFixed(2)}
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      <style>{`
        @keyframes slideUp {
          from { transform: translateY(20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
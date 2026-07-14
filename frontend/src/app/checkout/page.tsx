'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { useCartStore } from '@/store/cartStore';
import { useAuthStore } from '@/store/authStore';
import { useRouter } from 'next/navigation';
import PaymentModal from '@/components/PaymentModal';
import Link from 'next/link';
import axios from 'axios';
import Toast from '@/components/Toast';
import { 
  MapPin, CreditCard, Mail, CheckCircle, Loader, ArrowLeft, Shield, 
  Truck, RotateCcw, Headphones, Tag, Package, Phone, Globe, 
  Building2, Lock
} from 'lucide-react';

export default function CheckoutPage() {
  const { items, totalPrice, clearCart, updateQuantity, removeFromCart } = useCartStore();
  const { isAuthenticated, token } = useAuthStore();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [couponCode, setCouponCode] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<string | null>(null);
  const [discount, setDiscount] = useState(0);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    phone: '',
    address: '',
    province: 'Punjab',
    city: 'Lahore',
    country: 'Pakistan',
    postalCode: '',
    paymentMethod: 'COD',
    notes: ''
  });

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login?redirect=checkout');
    }
  }, [isAuthenticated, router]);

  if (items.length === 0) {
    return (
      <div style={{ minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Loader size={40} style={{ animation: 'spin 1s linear infinite', color: '#0F766E' }} />
      </div>
    );
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
    if (errors[name]) {
      setErrors({ ...errors, [name]: '' });
    }
  };

  const handleFieldBlur = (fieldName: string) => (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setTouched({ ...touched, [fieldName]: true });
    validateField(fieldName);
    
    if (!errors[fieldName]) {
      e.currentTarget.style.borderColor = '#E5E7EB';
      e.currentTarget.style.boxShadow = 'none';
    }
  };

  const validateField = (fieldName: string) => {
    const value = formData[fieldName as keyof typeof formData];
    const newErrors = { ...errors };

    switch(fieldName) {
      case 'fullName':
        if (!value.trim()) newErrors.fullName = 'Full name is required';
        else if (value.trim().length < 3) newErrors.fullName = 'Name must be at least 3 characters';
        else delete newErrors.fullName;
        break;
      case 'email':
        if (!value.trim()) newErrors.email = 'Email is required';
        else if (!/\S+@\S+\.\S+/.test(value)) newErrors.email = 'Please enter a valid email';
        else delete newErrors.email;
        break;
      case 'phone':
        if (!value.trim()) newErrors.phone = 'Phone number is required';
        else if (!/^03\d{9}$/.test(value.replace(/\s/g, ''))) newErrors.phone = 'Enter valid Pakistani number (03XX-XXXXXXX)';
        else delete newErrors.phone;
        break;
      case 'address':
        if (!value.trim()) newErrors.address = 'Address is required';
        else if (value.trim().length < 10) newErrors.address = 'Please enter complete address';
        else delete newErrors.address;
        break;
      case 'postalCode':
        if (!value.trim()) newErrors.postalCode = 'Postal code is required';
        else if (!/^\d{5}$/.test(value)) newErrors.postalCode = 'Enter 5-digit postal code';
        else delete newErrors.postalCode;
        break;
    }
    
    setErrors(newErrors);
    return !newErrors[fieldName];
  };

  const validate = () => {
    let isValid = true;
    ['fullName', 'email', 'phone', 'address', 'postalCode'].forEach(field => {
      if (!validateField(field)) isValid = false;
      setTouched(prev => ({ ...prev, [field]: true }));
    });
    return isValid;
  };

  const COUPONS: Record<string, number> = {
    'MEVA20': 20,
    'FIRSTORDER': 15,
    'RAMADAN': 25,
    'WELCOME': 10
  };

  const applyCoupon = () => {
    const upperCode = couponCode.toUpperCase();
    if (COUPONS[upperCode]) {
      setDiscount(COUPONS[upperCode]);
      setAppliedCoupon(upperCode);
    } else {
      setToast({ message: 'Invalid coupon. Try: MEVA20, FIRSTORDER, RAMADAN', type: 'error' });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validate()) {
      setToast({ message: 'Please fill all required fields correctly', type: 'error' });
      return;
    }

    if (!isAuthenticated || !token) {
      router.push('/login?redirect=checkout');
      return;
    }

    setLoading(true);

    try {
      const orderData = {
        items: items.map(item => ({
          product: item.id,
          name: item.name,
          price: parseFloat(item.price),
          quantity: item.quantity,
          image: item.image
        })),
        shippingAddress: {
          fullName: formData.fullName,
          phone: formData.phone,
          address: formData.address,
          city: formData.city,
          postalCode: formData.postalCode
        },
        paymentMethod: formData.paymentMethod,
        subtotal: subtotal,
        shippingCost,
        discount: discountAmount,
        totalAmount: grandTotal,
        notes: formData.notes
      };

      const response = await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/orders`,
        orderData,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (response.data.success) {
        clearCart();
        router.push(`/order-success?orderId=${response.data.data._id}`);
      }
    } catch (error: any) {
      console.error('Order error:', error);
      const message = error.response?.data?.message || 'Failed to place order. Please try again.';
      setToast({ message, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handlePaymentSuccess = () => {
    setShowPaymentModal(false);
    handleSubmit(new Event('submit') as any);
  };

  const subtotal = totalPrice();
  const discountAmount = (subtotal * discount) / 100;
  const afterDiscount = subtotal - discountAmount;
  const shippingCost = afterDiscount >= 1500 ? 0 : 150;
  const tax = 0;
  const grandTotal = afterDiscount + shippingCost + tax;
  const totalSavings = discountAmount + (shippingCost === 0 ? 150 : 0);

  const steps = [
    { id: 1, name: 'Cart', status: 'completed' },
    { id: 2, name: 'Checkout', status: 'current' },
    { id: 3, name: 'Payment', status: 'upcoming' },
    { id: 4, name: 'Confirmation', status: 'upcoming' }
  ];

  const PROVINCES = ['Punjab', 'Sindh', 'KPK', 'Balochistan', 'Gilgit-Baltistan', 'Azad Kashmir'];
  const CITIES: Record<string, string[]> = {
    'Punjab': ['Lahore', 'Faisalabad', 'Multan', 'Rawalpindi', 'Gujranwala', 'Sialkot'],
    'Sindh': ['Karachi', 'Hyderabad', 'Sukkur', 'Larkana', 'Mirpur Khas'],
    'KPK': ['Peshawar', 'Mardan', 'Swabi', 'Kohat', 'Abbottabad'],
    'Balochistan': ['Quetta', 'Turbat', 'Khuzdar', 'Gwadar'],
    'Gilgit-Baltistan': ['Gilgit', 'Skardu', 'Hunza'],
    'Azad Kashmir': ['Muzaffarabad', 'Mirpur', 'Kotli']
  };

  const getPhoneBorderColor = () => {
    if (errors.phone && touched.phone) return '#EF4444';
    if (touched.phone) return '#0F766E';
    return '#E5E7EB';
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#F7F8FA', paddingBottom: '60px', fontFamily: 'Outfit, Manrope, system-ui, sans-serif' }}>
      
      {/* Progress Indicator */}
      <div style={{ backgroundColor: 'white', borderBottom: '1px solid #E5E7EB', padding: '20px 0' }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '0 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative' }}>
            <div style={{ position: 'absolute', top: '20px', left: '60px', right: '60px', height: '3px', backgroundColor: '#E5E7EB' }}>
              <div style={{ width: '33%', height: '100%', backgroundColor: '#0F766E', transition: 'width 0.3s ease' }} />
            </div>
            
            {steps.map((step) => (
              <div key={step.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', position: 'relative', zIndex: 1 }}>
                <div style={{ 
                  width: '40px', height: '40px', borderRadius: '50%', 
                  backgroundColor: step.status === 'completed' ? '#0F766E' : step.status === 'current' ? '#0F766E' : '#E5E7EB',
                  color: step.status !== 'upcoming' ? 'white' : '#6B7280',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: '700', fontSize: '14px',
                  border: step.status === 'current' ? '3px solid #F59E0B' : 'none',
                  transition: 'all 0.3s'
                }}>
                  {step.status === 'completed' ? <CheckCircle size={20} /> : step.id}
                </div>
                <span style={{ fontSize: '12px', fontWeight: '600', color: step.status === 'current' ? '#0F766E' : '#6B7280' }}>
                  {step.name}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Header */}
      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '32px 20px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
          <Link href="/cart" style={{ color: '#6B7280', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px', transition: 'color 0.2s', fontSize: '14px' }}
            onMouseEnter={e => e.currentTarget.style.color = '#0F766E'}
            onMouseLeave={e => e.currentTarget.style.color = '#6B7280'}
          >
            <ArrowLeft size={18} /> Back to Cart
          </Link>
        </div>
        <h1 style={{ fontSize: '40px', fontWeight: '800', color: '#111827', marginBottom: '8px', lineHeight: '1.2' }}>
          Secure Checkout
        </h1>
        <p style={{ fontSize: '18px', color: '#6B7280', marginBottom: '32px' }}>
          Complete your purchase securely. All data is encrypted.
        </p>
      </div>

      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '0 20px' }}>
        <form onSubmit={handleSubmit} style={{ display: 'grid', gridTemplateColumns: '1fr 440px', gap: '40px', alignItems: 'start' }}>
          
          {/* LEFT: FORMS */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            
            {/* Contact Info */}
            <div style={{ backgroundColor: 'white', borderRadius: '20px', padding: '32px', boxShadow: '0 10px 25px rgba(0,0,0,0.06)', border: '1px solid #E5E7EB' }}>
              <h3 style={{ fontSize: '20px', fontWeight: '700', color: '#111827', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Mail size={22} color="#0F766E" /> Contact Information
              </h3>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                <div style={{ position: 'relative' }}>
                  <label style={{ 
                    position: 'absolute', left: '16px', top: formData.fullName ? '-10px' : '14px',
                    fontSize: formData.fullName ? '11px' : '14px', fontWeight: '600',
                    color: formData.fullName ? '#0F766E' : '#6B7280',
                    backgroundColor: 'white', padding: '0 4px',
                    transition: 'all 0.2s', pointerEvents: 'none'
                  }}>
                     Full Name *
                  </label>
                  <input name="fullName" value={formData.fullName} onChange={handleChange} onBlur={handleFieldBlur('fullName')}
                    style={{ 
                      width: '100%', padding: '16px', paddingTop: formData.fullName ? '24px' : '16px',
                      borderRadius: '12px', border: `2px solid ${errors.fullName && touched.fullName ? '#EF4444' : touched.fullName ? '#0F766E' : '#E5E7EB'}`,
                      fontSize: '15px', outline: 'none', transition: 'all 0.2s', backgroundColor: '#F8FAFC'
                    }}
                    onFocus={e => { e.currentTarget.style.borderColor = '#0F766E'; e.currentTarget.style.boxShadow = '0 0 0 4px rgba(15,118,110,0.1)'; }}
                    placeholder=" "
                  />
                  {errors.fullName && touched.fullName && <span style={{ color: '#EF4444', fontSize: '12px', marginTop: '6px', display: 'block', fontWeight: '500' }}> {errors.fullName}</span>}
                </div>

                <div style={{ position: 'relative' }}>
                  <label style={{ 
                    position: 'absolute', left: '16px', top: formData.email ? '-10px' : '14px',
                    fontSize: formData.email ? '11px' : '14px', fontWeight: '600',
                    color: formData.email ? '#0F766E' : '#6B7280',
                    backgroundColor: 'white', padding: '0 4px',
                    transition: 'all 0.2s', pointerEvents: 'none'
                  }}>
                    📧 Email *
                  </label>
                  <input name="email" type="email" value={formData.email} onChange={handleChange} onBlur={handleFieldBlur('email')}
                    style={{ 
                      width: '100%', padding: '16px', paddingTop: formData.email ? '24px' : '16px',
                      borderRadius: '12px', border: `2px solid ${errors.email && touched.email ? '#EF4444' : touched.email ? '#0F766E' : '#E5E7EB'}`,
                      fontSize: '15px', outline: 'none', transition: 'all 0.2s', backgroundColor: '#F8FAFC'
                    }}
                    onFocus={e => { e.currentTarget.style.borderColor = '#0F766E'; e.currentTarget.style.boxShadow = '0 0 0 4px rgba(15,118,110,0.1)'; }}
                    placeholder=" "
                  />
                  {errors.email && touched.email && <span style={{ color: '#EF4444', fontSize: '12px', marginTop: '6px', display: 'block', fontWeight: '500' }}>❌ {errors.email}</span>}
                </div>
              </div>

              <div style={{ marginTop: '20px', position: 'relative' }}>
                <label style={{ 
                  position: 'absolute', left: '16px', top: formData.phone ? '-10px' : '14px',
                  fontSize: formData.phone ? '11px' : '14px', fontWeight: '600',
                  color: formData.phone ? '#0F766E' : '#6B7280',
                  backgroundColor: 'white', padding: '0 4px',
                  transition: 'all 0.2s', pointerEvents: 'none'
                }}>
                  📱 Phone Number *
                </label>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <div style={{ 
                    backgroundColor: '#F8FAFC', padding: '16px', borderRadius: '12px 0 0 12px',
                    borderTop: `2px solid ${getPhoneBorderColor()}`,
                    borderRight: 'none',
                    borderBottom: `2px solid ${getPhoneBorderColor()}`,
                    borderLeft: `2px solid ${getPhoneBorderColor()}`,
                    fontSize: '14px', fontWeight: '600', color: '#374151'
                  }}>
                    🇵🇰 +92
                  </div>
                  <input name="phone" value={formData.phone} onChange={handleChange} onBlur={handleFieldBlur('phone')}
                    style={{ 
                      flex: 1, padding: '16px', paddingTop: formData.phone ? '24px' : '16px',
                      borderRadius: '0 12px 12px 0',
                      borderTop: `2px solid ${getPhoneBorderColor()}`,
                      borderRight: `2px solid ${getPhoneBorderColor()}`,
                      borderBottom: `2px solid ${getPhoneBorderColor()}`,
                      borderLeft: 'none',
                      fontSize: '15px', outline: 'none', transition: 'all 0.2s', backgroundColor: '#F8FAFC'
                    }}
                    onFocus={e => { e.currentTarget.style.borderColor = '#0F766E'; e.currentTarget.style.boxShadow = '0 0 0 4px rgba(15,118,110,0.1)'; }}
                    placeholder="03XX XXXXXXX"
                  />
                </div>
                {errors.phone && touched.phone && <span style={{ color: '#EF4444', fontSize: '12px', marginTop: '6px', display: 'block', fontWeight: '500' }}>❌ {errors.phone}</span>}
              </div>
            </div>

            {/* Shipping Address */}
            <div style={{ backgroundColor: 'white', borderRadius: '20px', padding: '32px', boxShadow: '0 10px 25px rgba(0,0,0,0.06)', border: '1px solid #E5E7EB' }}>
              <h3 style={{ fontSize: '20px', fontWeight: '700', color: '#111827', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <MapPin size={22} color="#0F766E" /> Shipping Address
              </h3>
              
              <div style={{ marginBottom: '20px', position: 'relative' }}>
                <label style={{ 
                  position: 'absolute', left: '16px', top: formData.address ? '-10px' : '14px',
                  fontSize: formData.address ? '11px' : '14px', fontWeight: '600',
                  color: formData.address ? '#0F766E' : '#6B7280',
                  backgroundColor: 'white', padding: '0 4px',
                  transition: 'all 0.2s', pointerEvents: 'none'
                }}>
                  🏠 Street Address *
                </label>
                <textarea name="address" value={formData.address} onChange={handleChange} onBlur={handleFieldBlur('address')} rows={3}
                  style={{ 
                    width: '100%', padding: '16px', paddingTop: formData.address ? '24px' : '16px',
                    borderRadius: '12px', border: `2px solid ${errors.address && touched.address ? '#EF4444' : touched.address ? '#0F766E' : '#E5E7EB'}`,
                    fontSize: '15px', outline: 'none', transition: 'all 0.2s', backgroundColor: '#F8FAFC', resize: 'none'
                  }}
                  onFocus={e => { e.currentTarget.style.borderColor = '#0F766E'; e.currentTarget.style.boxShadow = '0 0 0 4px rgba(15,118,110,0.1)'; }}
                  placeholder="House #, Street, Area, Landmark"
                />
                {errors.address && touched.address && <span style={{ color: '#EF4444', fontSize: '12px', marginTop: '6px', display: 'block', fontWeight: '500' }}>❌ {errors.address}</span>}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', marginBottom: '20px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '8px' }}>
                    <Building2 size={14} style={{ verticalAlign: 'middle', marginRight: '4px' }}/> Province
                  </label>
                  <select name="province" value={formData.province} onChange={(e) => {
                    setFormData({ ...formData, province: e.target.value, city: CITIES[e.target.value][0] });
                  }}
                    style={{ width: '100%', padding: '14px', borderRadius: '10px', border: '2px solid #E5E7EB', fontSize: '14px', outline: 'none', backgroundColor: 'white', cursor: 'pointer' }}
                  >
                    {PROVINCES.map(prov => <option key={prov} value={prov}>{prov}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '8px' }}>
                    <MapPin size={14} style={{ verticalAlign: 'middle', marginRight: '4px' }}/> City
                  </label>
                  <select name="city" value={formData.city} onChange={handleChange}
                    style={{ width: '100%', padding: '14px', borderRadius: '10px', border: '2px solid #E5E7EB', fontSize: '14px', outline: 'none', backgroundColor: 'white', cursor: 'pointer' }}
                  >
                    {CITIES[formData.province]?.map(city => <option key={city} value={city}>{city}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '8px' }}>
                    <Globe size={14} style={{ verticalAlign: 'middle', marginRight: '4px' }}/> Country
                  </label>
                  <input name="country" value={formData.country} readOnly
                    style={{ width: '100%', padding: '14px', borderRadius: '10px', border: '2px solid #E5E7EB', fontSize: '14px', backgroundColor: '#F8FAFC', color: '#374151' }}
                  />
                </div>
              </div>

              <div style={{ position: 'relative' }}>
                <label style={{ 
                  position: 'absolute', left: '16px', top: formData.postalCode ? '-10px' : '14px',
                  fontSize: formData.postalCode ? '11px' : '14px', fontWeight: '600',
                  color: formData.postalCode ? '#0F766E' : '#6B7280',
                  backgroundColor: 'white', padding: '0 4px',
                  transition: 'all 0.2s', pointerEvents: 'none'
                }}>
                  📮 Postal Code *
                </label>
                <input name="postalCode" value={formData.postalCode} onChange={handleChange} onBlur={handleFieldBlur('postalCode')}
                  style={{ 
                    width: '100%', padding: '16px', paddingTop: formData.postalCode ? '24px' : '16px',
                    borderRadius: '12px', border: `2px solid ${errors.postalCode && touched.postalCode ? '#EF4444' : touched.postalCode ? '#0F766E' : '#E5E7EB'}`,
                    fontSize: '15px', outline: 'none', transition: 'all 0.2s', backgroundColor: '#F8FAFC'
                  }}
                  onFocus={e => { e.currentTarget.style.borderColor = '#0F766E'; e.currentTarget.style.boxShadow = '0 0 0 4px rgba(15,118,110,0.1)'; }}
                  placeholder="54000"
                />
                {errors.postalCode && touched.postalCode && <span style={{ color: '#EF4444', fontSize: '12px', marginTop: '6px', display: 'block', fontWeight: '500' }}>❌ {errors.postalCode}</span>}
              </div>

              <div style={{ marginTop: '24px', padding: '16px', backgroundColor: '#F0FDFA', borderRadius: '12px', border: '1px solid #0F766E' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                  <Truck size={20} color="#0F766E" />
                  <span style={{ fontWeight: '700', color: '#0F766E', fontSize: '14px' }}>Estimated Delivery</span>
                </div>
                <p style={{ fontSize: '14px', color: '#374151', marginBottom: '8px' }}>📦 2-4 Business Days to {formData.city}</p>
                <p style={{ fontSize: '13px', color: '#0F766E', fontWeight: '600' }}>
                  <RotateCcw size={14} style={{ verticalAlign: 'middle', marginRight: '4px' }}/> Free Returns within 7 days
                </p>
              </div>
            </div>

            {/* Payment Method */}
            <div style={{ backgroundColor: 'white', borderRadius: '20px', padding: '32px', boxShadow: '0 10px 25px rgba(0,0,0,0.06)', border: '1px solid #E5E7EB' }}>
              <h3 style={{ fontSize: '20px', fontWeight: '700', color: '#111827', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <CreditCard size={22} color="#0F766E" /> Payment Method
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                {[
                  { id: 'COD', label: 'Cash on Delivery', icon: '', color: '#0F766E' },
                  { id: 'jazzcash', label: 'JazzCash', icon: '', color: '#7C3AED' },
                  { id: 'visa', label: 'Visa Card', icon: '💳', color: '#1E40AF' },
                  { id: 'mastercard', label: 'MasterCard', icon: '💳', color: '#DC2626' }
                ].map(method => (
                  <label key={method.id} style={{ 
                    display: 'flex', alignItems: 'center', gap: '12px', padding: '18px', borderRadius: '14px', 
                    border: `2px solid ${formData.paymentMethod === method.id ? method.color : '#E5E7EB'}`, 
                    backgroundColor: formData.paymentMethod === method.id ? `${method.color}10` : 'white', 
                    cursor: 'pointer', transition: 'all 0.2s' 
                  }}
                  onMouseEnter={e => { if (formData.paymentMethod !== method.id) { e.currentTarget.style.borderColor = method.color; e.currentTarget.style.transform = 'translateY(-2px)'; } }}
                  onMouseLeave={e => { if (formData.paymentMethod !== method.id) { e.currentTarget.style.borderColor = '#E5E7EB'; e.currentTarget.style.transform = 'translateY(0)'; } }}
                  >
                    <input type="radio" name="paymentMethod" value={method.id} checked={formData.paymentMethod === method.id} onChange={handleChange} style={{ display: 'none' }} />
                    <div style={{ width: '24px', height: '24px', borderRadius: '6px', border: `2px solid ${formData.paymentMethod === method.id ? method.color : '#D1D5DB'}`, backgroundColor: formData.paymentMethod === method.id ? method.color : 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}>
                      {formData.paymentMethod === method.id && <CheckCircle size={14} color="white" />}
                    </div>
                    <span style={{ fontSize: '14px', fontWeight: '600', color: '#111827' }}>{method.icon} {method.label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          {/* RIGHT: STICKY ORDER SUMMARY */}
          <div style={{ position: 'sticky', top: '100px' }}>
            <div style={{ backgroundColor: 'white', borderRadius: '20px', padding: '32px', boxShadow: '0 10px 40px rgba(0,0,0,0.08)', border: '1px solid #E5E7EB' }}>
              <h3 style={{ fontSize: '20px', fontWeight: '800', color: '#111827', marginBottom: '24px', paddingBottom: '20px', borderBottom: '2px solid #F3F4F6', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Package size={22} color="#0F766E" /> Order Summary
              </h3>
              
              <div style={{ marginBottom: '24px', maxHeight: '220px', overflowY: 'auto', paddingRight: '8px' }}>
                {items.map(item => (
                  <div key={item.id} style={{ display: 'flex', gap: '16px', marginBottom: '16px', paddingBottom: '16px', borderBottom: '1px solid #F3F4F6', transition: 'all 0.2s' }}>
                    <img src={item.image} alt={item.name} style={{ width: '80px', height: '80px', borderRadius: '12px', objectFit: 'cover', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '14px', fontWeight: '700', color: '#111827', lineHeight: '1.3', marginBottom: '4px' }}>{item.name}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                        <button type="button" onClick={() => updateQuantity(item.id, Math.max(1, item.quantity - 1))} style={{ width: '24px', height: '24px', borderRadius: '6px', border: '1px solid #E5E7EB', backgroundColor: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: '700' }}>−</button>
                        <span style={{ fontWeight: '700', minWidth: '24px', textAlign: 'center', fontSize: '14px' }}>{item.quantity}</span>
                        <button type="button" onClick={() => updateQuantity(item.id, item.quantity + 1)} style={{ width: '24px', height: '24px', borderRadius: '6px', border: '1px solid #E5E7EB', backgroundColor: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: '700' }}>+</button>
                      </div>
                      <div style={{ fontSize: '15px', fontWeight: '800', color: '#0F766E' }}>
                        Rs. {(parseFloat(item.price) * item.quantity).toFixed(0)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {!appliedCoupon ? (
                <div style={{ marginBottom: '20px' }}>
                  <label style={{ fontSize: '13px', fontWeight: '700', color: '#111827', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Tag size={16} color="#0F766E" /> Have a Coupon?
                  </label>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <input type="text" placeholder="MEVA20" value={couponCode} onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                      style={{ flex: 1, padding: '12px 16px', borderRadius: '10px', border: '2px solid #E5E7EB', fontSize: '14px', outline: 'none', fontWeight: '600' }}
                    />
                    <button type="button" onClick={applyCoupon} style={{ backgroundColor: '#F59E0B', color: 'white', border: 'none', padding: '12px 20px', borderRadius: '10px', fontWeight: '700', cursor: 'pointer', fontSize: '14px' }}>
                      Apply
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ backgroundColor: '#D1FAE5', borderRadius: '12px', padding: '14px', marginBottom: '20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: '2px solid #0F766E' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Tag size={18} color="#0F766E" />
                    <span style={{ fontWeight: '700', color: '#0F766E', fontSize: '14px' }}>{appliedCoupon} applied ({discount}% OFF)</span>
                  </div>
                </div>
              )}

              <div style={{ marginBottom: '24px', backgroundColor: '#F8FAFC', borderRadius: '12px', padding: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', fontSize: '14px' }}>
                  <span style={{ color: '#6B7280' }}>Subtotal ({items.reduce((a,b) => a + b.quantity, 0)} items)</span>
                  <span style={{ fontWeight: '700', color: '#111827' }}>Rs. {subtotal.toFixed(2)}</span>
                </div>
                {discount > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', fontSize: '14px', color: '#0F766E' }}>
                    <span>Discount ({discount}%)</span>
                    <span style={{ fontWeight: '700' }}>-Rs. {discountAmount.toFixed(2)}</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', fontSize: '14px' }}>
                  <span style={{ color: '#6B7280' }}>Shipping</span>
                  <span style={{ fontWeight: '700', color: shippingCost === 0 ? '#0F766E' : '#111827' }}>
                    {shippingCost === 0 ? 'FREE ✓' : `Rs. ${shippingCost}`}
                  </span>
                </div>
                {totalSavings > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', fontSize: '14px', color: '#10B981', fontWeight: '700' }}>
                    <span> You Saved</span>
                    <span>Rs. {totalSavings.toFixed(2)}</span>
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '28px', fontSize: '24px', fontWeight: '800', color: '#0F766E', paddingTop: '20px', borderTop: '3px solid #E5E7EB' }}>
                <span>Grand Total</span>
                <span>Rs. {grandTotal.toFixed(2)}</span>
              </div>

              <button type="submit" disabled={loading} style={{ 
                width: '100%', backgroundColor: loading ? '#9CA3AF' : '#0F766E', color: 'white', border: 'none', padding: '20px', borderRadius: '14px', 
                fontSize: '17px', fontWeight: '800', cursor: loading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px'
              }}>
                {loading ? (
                  <>
                    <Loader size={22} style={{ animation: 'spin 1s linear infinite' }} /> Processing...
                  </>
                ) : (
                  <>
                    <Lock size={20} /> 🔒 Secure Checkout
                  </>
                )}
              </button>

              <div style={{ marginTop: '20px', display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
                {[
                  { icon: <Shield size={16} color="#0F766E" />, text: '256-bit SSL Secure' },
                  { icon: <RotateCcw size={16} color="#0F766E" />, text: 'Easy Returns' },
                  { icon: <Headphones size={16} color="#0F766E" />, text: '24/7 Support' },
                  { icon: <Truck size={16} color="#0F766E" />, text: 'Fast Delivery' }
                ].map((badge, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#6B7280', padding: '10px', backgroundColor: '#F8FAFC', borderRadius: '10px' }}>
                    {badge.icon}
                    <span>{badge.text}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

        </form>
      </div>

      <PaymentModal 
        isOpen={showPaymentModal} 
        onClose={() => setShowPaymentModal(false)} 
        paymentMethod={formData.paymentMethod} 
        amount={grandTotal} 
        onSuccess={handlePaymentSuccess}
      />

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        * { box-sizing: border-box; }
        input, textarea, select { font-family: inherit; }
      `}</style>
    </div>
  );
}
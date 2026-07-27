'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect, useMemo } from 'react';
import { useCartStore } from '@/store/cartStore';
import { useAuthStore } from '@/store/authStore';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { 
  MapPin, CreditCard, Mail, CheckCircle, Loader, ArrowLeft, Shield, 
  Truck, RotateCcw, Headphones, Tag, Package, Building2, Lock, AlertCircle, Globe // ✅ FIX: Globe added
} from 'lucide-react';

// --- Enterprise Services & Utils ---
import { calculatePricing } from "@/lib/checkout/pricing";
import { secureValidation } from "@/lib/checkout/secure-validation"; // ✅ File created in Step 1
import { secureOrderService } from "@/services/order.service"; // ✅ File created in Step 1
// import { paymentService } from "@/services/payment.service"; // Optional for now

// --- Components ---
import PaymentModal from '@/components/checkout/PaymentModal';
import Toast from '@/components/Toast';
import ContactForm from '@/components/checkout/ContactForm';

// --- Types ---
type PaymentMethod = 'COD' | 'visa' | 'mastercard' | 'jazzcash';

interface FormData {
  fullName: string;
  email: string;
  phone: string;
  address: string;
  province: string;
  city: string;
  country: string;
  postalCode: string;
  paymentMethod: PaymentMethod;
  notes: string;
}

export default function CheckoutPage() {
  // --- State Management ---
  const { items, clearCart, updateQuantity, removeFromCart } = useCartStore();
  const { isAuthenticated, token } = useAuthStore();
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [agreeTerms, setAgreeTerms] = useState(false);
  
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const [couponCode, setCouponCode] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<string | null>(null);
  const [displayDiscount, setDisplayDiscount] = useState(0); 

  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  const [formData, setFormData] = useState<FormData>({
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
      router.push('/login?redirect=/checkout');
    }
  }, [isAuthenticated, router]);

  if (items.length === 0 && !loading) {
    return (
      <div className="min-h-[80vh] flex flex-col items-center justify-center p-4">
        <Package size={64} className="text-gray-300 mb-4" />
        <h2 className="text-2xl font-bold text-gray-700 mb-2">Your Cart is Empty</h2>
        <Link href="/products" className="text-teal-600 font-semibold hover:underline">
          Continue Shopping →
        </Link>
      </div>
    );
  }

  const cartSubtotal = useMemo(() => 
    items.reduce((sum, item) => sum + Number(item.price) * item.quantity, 0), 
  [items]);

  const pricing = useMemo(() => 
    calculatePricing(cartSubtotal, displayDiscount), 
  [cartSubtotal, displayDiscount]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: '' }));
  };

  const handleFieldBlur = (fieldName: string) => () => {
    setTouched(prev => ({ ...prev, [fieldName]: true }));
    const error = secureValidation.validateField(fieldName, formData[fieldName as keyof FormData]);
    setErrors(prev => ({ ...prev, [fieldName]: error || '' }));
  };

  const validateForm = () => {
    const result = secureValidation.validateCheckout(formData, appliedCoupon || undefined);
    setErrors(result.errors);
    setTouched({ fullName: true, email: true, phone: true, address: true, postalCode: true });
    
    if (!agreeTerms) {
      setToast({ message: 'Please agree to Terms & Conditions', type: 'error' });
      return false;
    }
    return result.isValid;
  };

  const handleApplyCoupon = () => {
    if (!couponCode.trim()) {
      setToast({ message: 'Enter a coupon code', type: 'info' });
      return;
    }
    const validCoupons: Record<string, number> = {
      'MEVA20': 20, 'FIRSTORDER': 15, 'RAMADAN': 25, 'WELCOME': 10
    };
    const upperCode = couponCode.toUpperCase();
    if (validCoupons[upperCode]) {
      setDisplayDiscount(validCoupons[upperCode]);
      setAppliedCoupon(upperCode);
      setToast({ message: `Coupon ${upperCode} applied successfully!`, type: 'success' });
    } else {
      setToast({ message: 'Invalid coupon code.', type: 'error' });
    }
  };

  const processOrder = async (transactionId?: string) => {
    if (!token) throw new Error('Authentication required');
    try {
      setLoading(true);
      const response = await secureOrderService.createSecureOrder(
        items,
        {
          fullName: formData.fullName,
          phone: formData.phone,
          address: formData.address,
          city: formData.city,
          postalCode: formData.postalCode
        },
        formData.paymentMethod,
        appliedCoupon || undefined,
        formData.notes
      );

      if (response.success && response.data) {
        clearCart();
        router.push(`/order-success?orderId=${response.data._id}`);
      }
    } catch (error: any) {
      console.error('Order failed:', error);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) {
      setToast({ message: 'Please fix the errors in the form', type: 'error' });
      return;
    }

    try {
      if (formData.paymentMethod === 'COD') {
        await processOrder(`COD-${Date.now()}`);
      } else {
        setShowPaymentModal(true);
      }
    } catch (error: any) {
      setToast({ message: error.response?.data?.message || 'Failed to place order', type: 'error' });
    }
  };

  // ✅ FIX: Function signature matches PaymentModal props
  const handlePaymentSuccess = async (transactionId: string) => {
    try {
      await processOrder(transactionId);
      setShowPaymentModal(false);
    } catch (error: any) {
      setToast({ message: error.message || 'Payment successful but order creation failed.', type: 'error' });
    }
  };

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
            
            <ContactForm 
              formData={formData}
              errors={errors}
              touched={touched}
              handleChange={handleChange}
              handleFieldBlur={handleFieldBlur}
            />

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
                    {id: "COD", label: "Cash on Delivery", icon: "💵", color: "#0F766E"},
                    {id: "jazzcash", label: "JazzCash", icon: "📱", color: "#7C3AED"},
                    {id: "visa", label: "Visa / MasterCard", icon: "💳", color: "#2563EB"}                
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
                  <div key={item._id || item.id} style={{ display: 'flex', gap: '16px', marginBottom: '16px', paddingBottom: '16px', borderBottom: '1px solid #F3F4F6', transition: 'all 0.2s' }}>
                    <img src={item.image} alt={item.name} style={{ width: '80px', height: '80px', borderRadius: '12px', objectFit: 'cover', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '14px', fontWeight: '700', color: '#111827', lineHeight: '1.3', marginBottom: '4px' }}>{item.name}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                        <button type="button" onClick={() => updateQuantity(item._id || item.id, Math.max(1, item.quantity - 1))} style={{ width: '24px', height: '24px', borderRadius: '6px', border: '1px solid #E5E7EB', backgroundColor: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: '700' }}>−</button>
                        <span style={{ fontWeight: '700', minWidth: '24px', textAlign: 'center', fontSize: '14px' }}>{item.quantity}</span>
                        <button type="button" onClick={() => updateQuantity(item._id || item.id, item.quantity + 1)} style={{ width: '24px', height: '24px', borderRadius: '6px', border: '1px solid #E5E7EB', backgroundColor: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: '700' }}>+</button>
                      </div>
                      <div style={{ fontSize: '15px', fontWeight: '800', color: '#0F766E' }}>
                        Rs. {(parseFloat(String(item.price)) * item.quantity).toFixed(0)}
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
                    <button type="button" onClick={handleApplyCoupon} style={{ backgroundColor: '#F59E0B', color: 'white', border: 'none', padding: '12px 20px', borderRadius: '10px', fontWeight: '700', cursor: 'pointer', fontSize: '14px' }}>
                      Apply
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ backgroundColor: '#D1FAE5', borderRadius: '12px', padding: '14px', marginBottom: '20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: '2px solid #0F766E' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Tag size={18} color="#0F766E" />
                    <span style={{ fontWeight: '700', color: '#0F766E', fontSize: '14px' }}>{appliedCoupon} applied ({displayDiscount}% OFF)</span>
                  </div>
                  <button onClick={() => { setAppliedCoupon(null); setDisplayDiscount(0); }} className="text-xs text-red-600 font-bold hover:underline">Remove</button>
                </div>
              )}

              <div style={{ marginBottom: '24px', backgroundColor: '#F8FAFC', borderRadius: '12px', padding: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', fontSize: '14px' }}>
                  <span style={{ color: '#6B7280' }}>Subtotal ({items.reduce((a,b) => a + b.quantity, 0)} items)</span>
                  <span style={{ fontWeight: '700', color: '#111827' }}>Rs. {cartSubtotal.toFixed(2)}</span>
                </div>
                {displayDiscount > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', fontSize: '14px', color: '#0F766E' }}>
                    <span>Discount ({displayDiscount}%)</span>
                    <span style={{ fontWeight: '700' }}>-Rs. {pricing.discountAmount.toFixed(2)}</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', fontSize: '14px' }}>
                  <span style={{ color: '#6B7280' }}>Shipping</span>
                  <span style={{ fontWeight: '700', color: pricing.shippingCost === 0 ? '#0F766E' : '#111827' }}>
                    {pricing.shippingCost === 0 ? 'FREE ✓' : `Rs. ${pricing.shippingCost}`}
                  </span>
                </div>
                {pricing.totalSavings > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', fontSize: '14px', color: '#10B981', fontWeight: '700' }}>
                    <span>You Saved</span>
                    <span>Rs. {pricing.totalSavings.toFixed(2)}</span>
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '28px', fontSize: '24px', fontWeight: '800', color: '#0F766E', paddingTop: '20px', borderTop: '3px solid #E5E7EB' }}>
                 <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <label
                    style={{display: "flex", alignItems: "center", gap: "10px", fontSize: "14px", color: "#374151", cursor: "pointer",}}
                  >
                    <input type="checkbox" checked={agreeTerms} onChange={(e) => setAgreeTerms(e.target.checked)} className="w-4 h-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500"/>
                    <span>I agree to Terms & Privacy Policy</span>
                  </label>
                  {!agreeTerms && <span className="text-xs text-red-500 flex items-center gap-1"><AlertCircle size={12}/> Required</span>}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '14px', color: '#6B7280', fontWeight: '500' }}>Grand Total</div>
                  <div>Rs. {pricing.grandTotal.toFixed(2)}</div>
                </div>
              </div>

              <button type="submit" disabled={loading || !agreeTerms} style={{ 
                width: '100%', backgroundColor: loading || !agreeTerms ? '#9CA3AF' : '#0F766E', color: 'white', border: 'none', padding: '20px', borderRadius: '14px', 
                fontSize: '17px', fontWeight: '800', cursor: loading || !agreeTerms ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px',
                opacity: loading || !agreeTerms ? 0.7 : 1, transition: 'all 0.2s'
              }}>
                {loading ? (
                  <>
                    <Loader size={22} style={{ animation: 'spin 1s linear infinite' }} /> Processing...
                  </>
                ) : (
                  <>
                    <Lock size={20} /> Complete Order
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
        amount={pricing.grandTotal} 
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
'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect, useRef } from 'react';
import { isAxiosError } from 'axios';
import { useCartStore } from '@/store/cartStore';
import { useAuthStore } from '@/store/authStore';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { 
  MapPin, CreditCard, CheckCircle, Loader, ArrowLeft, Shield,
  Truck, RotateCcw, Tag, Package, Building2, Lock, AlertCircle, Globe // ✅ FIX: Globe added
} from 'lucide-react';

// --- Enterprise Services & Utils ---
import { calculatePricing } from "@/lib/checkout/pricing";
import { commerceService, type ShippingQuote } from '@/services/commerce.service';
import { secureValidation } from "@/lib/checkout/secure-validation"; // ✅ File created in Step 1
import {
  secureOrderService,
  OrderPaymentMethod
} from "@/services/order.service";
import {
  AvailablePaymentMethod,
  paymentService
} from "@/services/payment.service";
import PaymentMethodSelector from '@/modules/payments/core/PaymentMethodSelector';
import { accountService, type Address } from '@/services/account.service';
import api from '@/lib/api';

// --- Components ---
import PaymentModal from '@/components/checkout/PaymentModal';
import Toast from '@/components/Toast';
import ContactForm from '@/components/checkout/ContactForm';

// --- Types ---
interface FormData {
  [key: string]: string;
  fullName: string;
  email: string;
  phone: string;
  address: string;
  province: string;
  city: string;
  country: string;
  postalCode: string;
  paymentMethod: OrderPaymentMethod;
  notes: string;
}

export default function CheckoutPage() {
  // --- State Management ---
  const { items, clearCart, updateQuantity } = useCartStore();
  const { isAuthenticated, token } = useAuthStore();
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [agreeTerms, setAgreeTerms] = useState(false);
  
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const [couponCode, setCouponCode] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<string | null>(null);
  const [displayDiscount, setDisplayDiscount] = useState(0);
  const [couponPending, setCouponPending] = useState(false);

  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentOrder, setPaymentOrder] = useState<{
    id: string;
    amount: number;
    method: 'stripe';
    publishableKey?: string;
  } | null>(null);
  const [availableMethods, setAvailableMethods] = useState<AvailablePaymentMethod[]>([]);
  const [currency, setCurrency] = useState('PKR');
  const [shippingQuote, setShippingQuote] = useState<ShippingQuote | null>(null);
  const [savedAddresses, setSavedAddresses] = useState<Address[]>([]);
  const [methodsLoading, setMethodsLoading] = useState(true);
  const submissionRef = useRef<{ fingerprint: string; key: string } | null>(null);
  const submittingRef = useRef(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  const [formData, setFormData] = useState<FormData>({
    fullName: '',
    email: '',
    phone: '',
    address: '',
    province: 'Punjab',
    city: 'Lahore',
    country: 'PK',
    postalCode: '',
    paymentMethod: 'cod',
    notes: ''
  });
  const cartSubtotal = items.reduce(
    (sum, item) => sum + Number(item.price) * item.quantity,
    0
  );

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login?redirect=/checkout');
    }
  }, [isAuthenticated, router]);

  useEffect(() => {
    if (!isAuthenticated) return;
    const timer = window.setTimeout(() => {
      void accountService.addresses().then((result) => setSavedAddresses(result.addresses)).catch(() => undefined);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [isAuthenticated]);

  useEffect(() => {
    const controller = new AbortController();
    commerceService.getMarket(controller.signal).then((configuredMarket) => {
      setCurrency(configuredMarket.defaultCurrency);
      setFormData((current) => ({ ...current, country: configuredMarket.homeCountry }));
    }).catch(() => undefined);
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    paymentService.getAvailableMethods(
      formData.country,
      currency,
      shippingQuote ? cartSubtotal + shippingQuote.shippingAmount : cartSubtotal,
      controller.signal
    ).then((methods) => {
      setAvailableMethods(methods);
      setFormData((current) => {
        if (methods.some((method) => method.code === current.paymentMethod)) {
          return current;
        }
        return methods[0]
          ? { ...current, paymentMethod: methods[0].code }
          : current;
      });
    }).catch(() => {
      setAvailableMethods([]);
    }).finally(() => {
      if (!controller.signal.aborted) setMethodsLoading(false);
    });
    return () => controller.abort();
  }, [formData.country, currency, shippingQuote, cartSubtotal]);

  useEffect(() => {
    const controller = new AbortController();
    commerceService.quoteShipping({
      country: formData.country,
      currency,
      subtotal: cartSubtotal,
      city: formData.city,
      region: formData.province,
      postalCode: formData.postalCode || undefined
    }, controller.signal).then(setShippingQuote).catch(() => setShippingQuote(null));
    return () => controller.abort();
  }, [formData.country, currency, formData.city, formData.province, formData.postalCode, cartSubtotal]);

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

  const localPricing = calculatePricing(cartSubtotal, 0);
  const pricing = {
    ...localPricing,
    shippingCost: shippingQuote?.shippingAmount ?? 0,
    grandTotal: Number((cartSubtotal - localPricing.discountAmount + (shippingQuote?.shippingAmount ?? 0)).toFixed(2))
  };
  const submissionFingerprint = JSON.stringify({
    items: items.map(item => ({
      productId: item._id || item.id,
      variantId: item.variantId || null,
      quantity: item.quantity
    })),
    shippingAddress: {
      fullName: formData.fullName,
      phone: formData.phone,
      address: formData.address,
      province: formData.province,
      city: formData.city,
      country: formData.country,
      postalCode: formData.postalCode
    },
    paymentMethod: formData.paymentMethod,
    currency,
    couponCode: appliedCoupon,
    customerNote: formData.notes
  });

  const getIdempotencyKey = () => {
    if (
      !submissionRef.current
      || submissionRef.current.fingerprint !== submissionFingerprint
    ) {
      submissionRef.current = {
        fingerprint: submissionFingerprint,
        key: globalThis.crypto.randomUUID()
      };
    }
    return submissionRef.current.key;
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: '' }));
  };

  const handleFieldBlur = (fieldName: string) => () => {
    setTouched(prev => ({ ...prev, [fieldName]: true }));
    const error = secureValidation.validateFieldSecure(fieldName, formData[fieldName as keyof FormData]);
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

  const handleApplyCoupon = async () => {
    if (!couponCode.trim()) {
      setToast({ message: 'Enter a coupon code', type: 'info' });
      return;
    }
    setCouponPending(true);
    try {
      const response = await api.post('/coupons/validate', { code: couponCode.toUpperCase(), subtotal: cartSubtotal });
      const preview = response.data.data;
      setAppliedCoupon(preview.code); setDisplayDiscount(Number(preview.discountAmount) || 0);
      setToast({ message: `Coupon accepted for preview. Final discount is confirmed by the server when you place the order.`, type: 'success' });
    } catch (error) {
      const message = isAxiosError(error) ? error.response?.data?.message : 'Coupon could not be validated';
      setAppliedCoupon(null); setDisplayDiscount(0); setToast({ message: message || 'Coupon could not be validated', type: 'error' });
    } finally { setCouponPending(false); }
  };

  const createOrder = async () => {
    if (!token) throw new Error('Authentication required');

    const response = await secureOrderService.createSecureOrder(
      items,
      {
        fullName: formData.fullName,
        phone: formData.phone,
        address: formData.address,
        addressLine2: undefined,
        city: formData.city,
        province: formData.province,
        postalCode: formData.postalCode || undefined,
        country: formData.country
      },
      formData.paymentMethod,
      getIdempotencyKey(),
      currency,
      appliedCoupon || undefined,
      formData.notes
    );

    if (!response.success || !response.data?.order) {
      throw new Error('Failed to place order');
    }

    return response.data.order;
  };

  const finishCheckout = (orderId: string) => {
    clearCart();
    router.push(`/order-success?orderId=${orderId}`);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading || submittingRef.current) return;
    if (!validateForm()) {
      setToast({ message: 'Please fix the errors in the form', type: 'error' });
      return;
    }

    try {
      if (formData.paymentMethod === 'stripe' && paymentOrder) {
        setShowPaymentModal(true);
        return;
      }

      submittingRef.current = true;
      setLoading(true);
      const order = await createOrder();

      if (formData.paymentMethod === 'stripe') {
        const stripeMethod = availableMethods.find(
          (method) => method.code === 'stripe'
        );
        setPaymentOrder({
          id: order._id,
          amount: Number(order.totalAmount),
          method: 'stripe',
          publishableKey: stripeMethod?.metadata.publishableKey
        });
        setShowPaymentModal(true);
      } else {
        const paymentResponse = await paymentService.createPaymentSession(
          {
            orderId: order._id,
            provider: formData.paymentMethod
          },
          `checkout-payment-${getIdempotencyKey()}`
        );
        const payment = paymentResponse.data.payment;
        if (payment.paymentType === 'manual') {
          clearCart();
          router.push(
            `/payment-instructions?paymentId=${encodeURIComponent(payment._id)}&orderId=${encodeURIComponent(order._id)}`
          );
        } else {
          finishCheckout(order._id);
        }
      }
    } catch (error: unknown) {
      const apiError = error as {
        response?: {
          data?: {
            error?: { message?: string };
            message?: string;
          };
        };
      };
      setToast({
        message: apiError.response?.data?.error?.message ||
          apiError.response?.data?.message ||
          (error instanceof Error ? error.message : 'Failed to place order'),
        type: 'error'
      });
    } finally {
      submittingRef.current = false;
      setLoading(false);
    }
  };

  // Stripe submission opens a backend-authoritative result page.
  const handlePaymentSubmitted = (paymentId: string) => {
    if (!paymentOrder || !paymentId) {
      setToast({ message: 'Payment was submitted, but its status page could not be opened.', type: 'error' });
      return;
    }

    setShowPaymentModal(false);
    clearCart();
    router.push(
      `/payment-result?paymentId=${encodeURIComponent(paymentId)}&orderId=${encodeURIComponent(paymentOrder.id)}`
    );
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
              {savedAddresses.length > 0 && <label style={{ display: 'grid', gap: 8, marginBottom: 20, fontWeight: 600 }}>Use a saved address
                <select defaultValue="" onChange={(event) => { const selected = savedAddresses.find((entry) => entry.id === event.target.value); if (selected) setFormData((current) => ({ ...current, fullName: selected.fullName, phone: selected.phone, address: selected.address, province: selected.province, city: selected.city, postalCode: selected.postalCode || '', country: selected.country })); }}><option value="">Use a one-time address</option>{savedAddresses.map((entry) => <option key={entry.id} value={entry.id}>{entry.fullName} — {entry.city}</option>)}</select>
              </label>}
              
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
                <p style={{ fontSize: '14px', color: '#374151', marginBottom: '8px' }}>{shippingQuote ? `${shippingQuote.deliveryMinDays}-${shippingQuote.deliveryMaxDays} business days to ${formData.city}` : 'Enter your address to calculate shipping and delivery.'}</p>
                <p style={{ fontSize: '13px', color: '#0F766E', fontWeight: '600' }}>Return eligibility is confirmed against your delivered order.</p>
              </div>
            </div>

            {/* Payment Method */}
            <div style={{ backgroundColor: 'white', borderRadius: '20px', padding: '32px', boxShadow: '0 10px 25px rgba(0,0,0,0.06)', border: '1px solid #E5E7EB' }}>
              <h3 style={{ fontSize: '20px', fontWeight: '700', color: '#111827', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <CreditCard size={22} color="#0F766E" /> Payment Method
              </h3>
              <PaymentMethodSelector
                methods={availableMethods}
                value={formData.paymentMethod}
                loading={methodsLoading}
                onChange={(paymentMethod) => setFormData((current) => ({
                  ...current,
                  paymentMethod
                }))}
              />
              {false && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                {[
                    {id: "cod", label: "Cash on Delivery", icon: "💵", color: "#0F766E"},
                    {id: "stripe", label: "Credit / Debit Card (Stripe)", icon: "💳", color: "#2563EB"}
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
                <div
                  aria-disabled="true"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '18px',
                    borderRadius: '14px',
                    border: '2px dashed #D1D5DB',
                    backgroundColor: '#F9FAFB',
                    color: '#6B7280',
                    cursor: 'not-allowed'
                  }}
                >
                  <span aria-hidden="true">📱</span>
                  <span style={{ fontSize: '14px', fontWeight: '600' }}>
                    JazzCash — temporarily unavailable
                  </span>
                </div>
              </div>
              )}
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
                        <button type="button" onClick={() => updateQuantity(item._id || item.id, Math.max(1, item.quantity - 1), item.variantId || item.variant)} style={{ width: '24px', height: '24px', borderRadius: '6px', border: '1px solid #E5E7EB', backgroundColor: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: '700' }}>−</button>
                        <span style={{ fontWeight: '700', minWidth: '24px', textAlign: 'center', fontSize: '14px' }}>{item.quantity}</span>
                        <button type="button" onClick={() => updateQuantity(item._id || item.id, item.quantity + 1, item.variantId || item.variant)} style={{ width: '24px', height: '24px', borderRadius: '6px', border: '1px solid #E5E7EB', backgroundColor: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: '700' }}>+</button>
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
                    <button type="button" disabled={couponPending} onClick={() => void handleApplyCoupon()} style={{ backgroundColor: '#F59E0B', color: 'white', border: 'none', padding: '12px 20px', borderRadius: '10px', fontWeight: '700', cursor: 'pointer', fontSize: '14px' }}>
                      {couponPending ? 'Checking…' : 'Apply'}
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ backgroundColor: '#D1FAE5', borderRadius: '12px', padding: '14px', marginBottom: '20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: '2px solid #0F766E' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Tag size={18} color="#0F766E" />
                    <span style={{ fontWeight: '700', color: '#0F766E', fontSize: '14px' }}>{appliedCoupon} applied (preview discount PKR {displayDiscount.toFixed(2)})</span>
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
                    <span>Coupon preview (final order is server-authoritative)</span>
                    <span style={{ fontWeight: '700' }}>-PKR {displayDiscount.toFixed(2)}</span>
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
                  { icon: <Shield size={16} color="#0F766E" />, text: 'Secure payment flow' },
                  { icon: <RotateCcw size={16} color="#0F766E" />, text: 'Order-based return eligibility' },
                  { icon: <Truck size={16} color="#0F766E" />, text: 'Configured shipping quote' }
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
        isOpen={showPaymentModal && Boolean(paymentOrder)}
        onClose={() => setShowPaymentModal(false)} 
        orderId={paymentOrder?.id || ''}
        amount={paymentOrder?.amount || pricing.grandTotal}
        publishableKey={paymentOrder?.publishableKey}
        onSubmitted={handlePaymentSubmitted}
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

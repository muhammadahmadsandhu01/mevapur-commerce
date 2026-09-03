'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import {
  Shield,
  CreditCard,
  Building2,
  Truck,
  AlertCircle,
  Loader2,
  Tag,
  ArrowRight,
  ArrowLeft,
  X,
  PhoneCall,
} from 'lucide-react';
import { useCartStore } from '@/store/cartStore';
import { useAuthStore } from '@/store/authStore';
import {
  validateCouponPreview,
  generateIdempotencyKey,
  computeCheckoutFingerprint,
  serializeCheckoutPayload,
  submitOrder,
  type CouponPreviewResult,
  type ShippingAddressInput,
} from '@/lib/checkoutService';
import { formatMoney, calculateSubtotal, roundMoney } from '@/lib/money';
import { getSafeMediaUrl } from '@/lib/catalogAdapter';
import Toast from '@/components/Toast';
import { paymentService } from '@/services/payment.service';

type SupportedPaymentMethod = 'cod' | 'bank_transfer' | 'raast' | 'stripe';

interface FormState {
  fullName: string;
  phone: string;
  address: string;
  addressLine2: string;
  city: string;
  province: string;
  postalCode: string;
  country: string;
  customerNote: string;
}

export default function CheckoutPage() {
  const router = useRouter();
  const { items, clearCart } = useCartStore();
  const { isAuthenticated, isInitialized, user, bootstrap } = useAuthStore();

  const [loading, setLoading] = useState(false);
  const [agreeTerms, setAgreeTerms] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  // Form State
  const [formData, setFormData] = useState<FormState>({
    fullName: user?.fullName || '',
    phone: '',
    address: '',
    addressLine2: '',
    city: 'Lahore',
    province: 'Punjab',
    postalCode: '',
    country: 'PK',
    customerNote: '',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  // Payment Selection
  const [availableMethods, setAvailableMethods] = useState<SupportedPaymentMethod[]>([
    'cod',
    'bank_transfer',
    'raast',
    'stripe',
  ]);
  const [paymentMethod, setPaymentMethod] = useState<SupportedPaymentMethod>('cod');

  // Coupon State
  const [couponInput, setCouponInput] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<CouponPreviewResult | null>(null);
  const [couponLoading, setCouponLoading] = useState(false);

  // Idempotency State
  const idempotencyRef = useRef<{ fingerprint: string; key: string } | null>(null);
  const submittingRef = useRef(false);

  // Bootstrap Auth
  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  // Auth Guard: Only redirect when auth is initialized and user is not authenticated
  useEffect(() => {
    if (isInitialized && !isAuthenticated) {
      router.push('/login?redirect=/checkout');
    }
  }, [isInitialized, isAuthenticated, router]);

  // Cart subtotal
  const availableItems = items.filter((i) => !i.isUnavailable);
  const subtotal = calculateSubtotal(availableItems);

  // Coupon Discount
  const estimatedDiscount = appliedCoupon
    ? Math.min(appliedCoupon.discountAmount, subtotal)
    : 0;

  const estimatedPayable = roundMoney(Math.max(0, subtotal - estimatedDiscount));

  // Query and filter available payment methods dynamically from Backend
  useEffect(() => {
    const controller = new AbortController();
    async function loadAvailableMethods() {
      try {
        const methods = await paymentService.getAvailableMethods(
          formData.country || 'PK',
          'PKR',
          estimatedPayable,
          controller.signal
        );
        if (!controller.signal.aborted && Array.isArray(methods)) {
          const validCodes: SupportedPaymentMethod[] = [];
          for (const m of methods) {
            if (m.code === 'cod') validCodes.push('cod');
            else if (m.code === 'bank_transfer') validCodes.push('bank_transfer');
            else if (m.code === 'raast') validCodes.push('raast');
            else if (
              m.code === 'stripe' &&
              (m.metadata?.publishableKey || process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)
            ) {
              validCodes.push('stripe');
            }
          }
          if (validCodes.length > 0) {
            setAvailableMethods(validCodes);
            setPaymentMethod((current) =>
              validCodes.includes(current) ? current : validCodes[0]
            );
          }
        }
      } catch {
        // Fall back safely without breaking checkout form
      }
    }
    void loadAvailableMethods();
    return () => {
      controller.abort();
    };
  }, [formData.country, estimatedPayable]);

  // Compute or retain Idempotency Key
  const getIdempotencyKey = () => {
    const currentFingerprint = computeCheckoutFingerprint(
      availableItems,
      formData,
      paymentMethod,
      appliedCoupon?.code
    );

    if (
      !idempotencyRef.current ||
      idempotencyRef.current.fingerprint !== currentFingerprint
    ) {
      idempotencyRef.current = {
        fingerprint: currentFingerprint,
        key: generateIdempotencyKey(),
      };
    }

    return idempotencyRef.current.key;
  };

  const couponCodeToRevalidate = appliedCoupon?.code;
  const itemsCountForCoupon = availableItems.length;

  // Invalidate coupon if cart items change
  useEffect(() => {
    if (!couponCodeToRevalidate || itemsCountForCoupon === 0) return;

    const controller = new AbortController();

    async function revalidateExistingCoupon() {
      try {
        const updatedPreview = await validateCouponPreview(
          couponCodeToRevalidate!,
          availableItems,
          controller.signal
        );
        if (!controller.signal.aborted) {
          setAppliedCoupon(updatedPreview);
        }
      } catch {
        if (!controller.signal.aborted) {
          setAppliedCoupon(null);
          setToast({
            message: 'Coupon was removed because cart items changed.',
            type: 'info',
          });
        }
      }
    }

    void revalidateExistingCoupon();

    return () => {
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [couponCodeToRevalidate, itemsCountForCoupon]);

  const handleFieldChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: '' }));
    }
  };

  const handleBlur = (field: keyof FormState) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
    validateSingleField(field, formData[field]);
  };

  const validateSingleField = (field: keyof FormState, val: string): string => {
    let err = '';
    const v = val.trim();

    if (field === 'fullName') {
      if (v.length < 2) err = 'Full name must be at least 2 characters';
      else if (v.length > 100) err = 'Full name must be under 100 characters';
    } else if (field === 'phone') {
      if (!v) err = 'Phone number is required';
      else if (!/^\+?[0-9][0-9 -]{6,19}$/.test(v)) err = 'Please enter a valid contact phone number';
    } else if (field === 'address') {
      if (v.length < 10) err = 'Street address must be at least 10 characters';
      else if (v.length > 300) err = 'Street address must be under 300 characters';
    } else if (field === 'city') {
      if (v.length < 2) err = 'City is required';
    } else if (field === 'province') {
      if (v.length < 2) err = 'Province/Region is required';
    } else if (field === 'postalCode') {
      if (v && !/^[A-Za-z0-9 -]{3,20}$/.test(v)) {
        err = 'Postal code contains invalid characters';
      }
    }

    setErrors((prev) => ({ ...prev, [field]: err }));
    return err;
  };

  const validateAllFields = (): boolean => {
    const newErrors: Record<string, string> = {};

    const nameToValidate = formData.fullName.trim() || user?.fullName || '';
    if (nameToValidate.length < 2) newErrors.fullName = 'Full name is required (min 2 chars)';
    if (!/^\+?[0-9][0-9 -]{6,19}$/.test(formData.phone.trim())) newErrors.phone = 'Valid phone number is required';
    if (formData.address.trim().length < 10) newErrors.address = 'Street address must be at least 10 characters';
    if (!formData.city.trim()) newErrors.city = 'City is required';
    if (!formData.province.trim()) newErrors.province = 'Province is required';
    if (formData.postalCode.trim() && !/^[A-Za-z0-9 -]{3,20}$/.test(formData.postalCode.trim())) {
      newErrors.postalCode = 'Postal code contains invalid characters';
    }

    if (!agreeTerms) {
      newErrors.terms = 'You must agree to the Terms and Conditions to place an order';
    }

    setErrors(newErrors);
    setTouched({
      fullName: true,
      phone: true,
      address: true,
      city: true,
      province: true,
      postalCode: true,
    });

    return Object.keys(newErrors).length === 0;
  };

  const handleApplyCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!couponInput.trim()) {
      setToast({ message: 'Enter a coupon code', type: 'info' });
      return;
    }

    setCouponLoading(true);
    try {
      const preview = await validateCouponPreview(couponInput, availableItems);
      setAppliedCoupon(preview);
      setToast({
        message: `Coupon "${preview.code}" applied for estimated discount of ${formatMoney(preview.discountAmount)}.`,
        type: 'success',
      });
      setCouponInput('');
    } catch (err: unknown) {
      setAppliedCoupon(null);
      setToast({
        message: err instanceof Error ? err.message : 'Invalid or expired coupon code',
        type: 'error',
      });
    } finally {
      setCouponLoading(false);
    }
  };

  const handleRemoveCoupon = () => {
    setAppliedCoupon(null);
    setToast({ message: 'Coupon removed', type: 'info' });
  };

  const handleSubmitOrder = async (e: React.FormEvent) => {
    e.preventDefault();

    if (loading || submittingRef.current) return;
    if (availableItems.length === 0) {
      setToast({ message: 'Your cart has no available items to checkout.', type: 'error' });
      return;
    }

    if (!validateAllFields()) {
      setToast({ message: 'Please fix the errors in the checkout form', type: 'error' });
      return;
    }

    try {
      submittingRef.current = true;
      setLoading(true);

      const effectiveFullName = formData.fullName.trim() || user?.fullName || '';
      const resolvedAddressData: ShippingAddressInput = {
        ...formData,
        fullName: effectiveFullName,
      };

      const idempotencyKey = getIdempotencyKey();
      const payload = serializeCheckoutPayload(
        availableItems,
        resolvedAddressData,
        paymentMethod,
        appliedCoupon?.code,
        formData.customerNote,
        'PKR'
      );

      const result = await submitOrder(payload, idempotencyKey);

      if (result.order) {
        clearCart();
        const destinationOrderId = result.order._id || result.order.orderId;
        router.push(`/order-success?orderId=${encodeURIComponent(destinationOrderId)}`);
      }
    } catch (err: unknown) {
      submittingRef.current = false;
      setLoading(false);

      const errorMessage =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        (err instanceof Error ? err.message : 'Failed to place order. Please check your details and retry.');

      setToast({ message: errorMessage, type: 'error' });
    }
  };

  if (!isInitialized) {
    return (
      <main className="min-h-[70vh] flex flex-col items-center justify-center p-4 bg-slate-50">
        <Loader2 className="w-12 h-12 text-[#ff8a00] animate-spin mb-4" />
        <p className="text-sm font-semibold text-slate-700">Verifying customer session...</p>
      </main>
    );
  }

  if (items.length === 0) {
    return (
      <main className="mx-auto max-w-xl py-16 px-4 text-center">
        <AlertCircle size={40} className="mx-auto text-slate-400 mb-4" />
        <h1 className="text-2xl font-bold text-slate-900 mb-2">Cart is empty</h1>
        <p className="text-sm text-slate-600 mb-6">Add products to your cart before proceeding to checkout.</p>
        <Link
          href="/products"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[#0b132b] text-white font-bold text-sm hover:bg-slate-800 transition shadow-sm"
        >
          Browse Catalogue
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 bg-slate-50 min-h-screen">
      {/* Breadcrumb & Title */}
      <div className="mb-8">
        <Link href="/cart" className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-700 hover:text-[#9a3412] mb-3 transition">
          <ArrowLeft size={14} /> Back to Cart
        </Link>
        <h1 className="text-2xl sm:text-3xl font-black text-[#0b132b]">Secure Checkout</h1>
        <p className="text-xs sm:text-sm text-slate-700 mt-1">
          Provide your verified shipping address and select a supported payment method.
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_24rem]">
        {/* Left Form Column */}
        <form onSubmit={handleSubmitOrder} noValidate className="space-y-8">
          {/* Step 1: Shipping Address */}
          <section className="bg-white p-6 sm:p-7 rounded-2xl border border-slate-200 shadow-xs" aria-labelledby="shipping-heading">
            <div className="flex items-center gap-3 pb-4 mb-5 border-b border-slate-100">
              <div className="w-8 h-8 rounded-full bg-orange-100 text-[#0b132b] font-black flex items-center justify-center text-sm">
                1
              </div>
              <div>
                <h2 id="shipping-heading" className="text-lg font-bold text-slate-900">
                  Delivery & Shipping Address
                </h2>
                <p className="text-xs text-slate-600">Physical address for delivery within Pakistan</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Full Name */}
              <div className="sm:col-span-2">
                <label htmlFor="fullName" className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-1.5">
                  Full Name <span className="text-rose-600">*</span>
                </label>
                <input
                  type="text"
                  id="fullName"
                  name="fullName"
                  value={formData.fullName}
                  onChange={handleFieldChange}
                  onBlur={() => handleBlur('fullName')}
                  aria-invalid={Boolean(touched.fullName && errors.fullName)}
                  aria-describedby={errors.fullName ? 'fullName-error' : undefined}
                  className={`w-full px-3.5 py-2.5 rounded-lg border text-sm text-slate-900 outline-none transition ${
                    touched.fullName && errors.fullName
                      ? 'border-rose-500 ring-1 ring-rose-500 bg-rose-50/20'
                      : 'border-slate-300 focus:border-[#ff8a00] focus:ring-1 focus:ring-[#ff8a00] bg-white'
                  }`}
                  placeholder="e.g. Ahmad Khan"
                />
                {touched.fullName && errors.fullName && (
                  <p id="fullName-error" className="mt-1 text-xs text-rose-700 font-medium flex items-center gap-1">
                    <AlertCircle size={13} /> {errors.fullName}
                  </p>
                )}
              </div>

              {/* Phone */}
              <div className="sm:col-span-2">
                <label htmlFor="phone" className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-1.5">
                  Phone Number <span className="text-rose-600">*</span>
                </label>
                <input
                  type="tel"
                  id="phone"
                  name="phone"
                  value={formData.phone}
                  onChange={handleFieldChange}
                  onBlur={() => handleBlur('phone')}
                  aria-invalid={Boolean(touched.phone && errors.phone)}
                  aria-describedby={errors.phone ? 'phone-error' : undefined}
                  className={`w-full px-3.5 py-2.5 rounded-lg border text-sm text-slate-900 outline-none transition ${
                    touched.phone && errors.phone
                      ? 'border-rose-500 ring-1 ring-rose-500 bg-rose-50/20'
                      : 'border-slate-300 focus:border-[#ff8a00] focus:ring-1 focus:ring-[#ff8a00] bg-white'
                  }`}
                  placeholder="e.g. 03001234567 or +923001234567"
                />
                {touched.phone && errors.phone && (
                  <p id="phone-error" className="mt-1 text-xs text-rose-700 font-medium flex items-center gap-1">
                    <AlertCircle size={13} /> {errors.phone}
                  </p>
                )}
              </div>

              {/* Address Line 1 */}
              <div className="sm:col-span-2">
                <label htmlFor="address" className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-1.5">
                  Street Address <span className="text-rose-600">*</span>
                </label>
                <input
                  type="text"
                  id="address"
                  name="address"
                  value={formData.address}
                  onChange={handleFieldChange}
                  onBlur={() => handleBlur('address')}
                  aria-invalid={Boolean(touched.address && errors.address)}
                  aria-describedby={errors.address ? 'address-error' : undefined}
                  className={`w-full px-3.5 py-2.5 rounded-lg border text-sm text-slate-900 outline-none transition ${
                    touched.address && errors.address
                      ? 'border-rose-500 ring-1 ring-rose-500 bg-rose-50/20'
                      : 'border-slate-300 focus:border-[#ff8a00] focus:ring-1 focus:ring-[#ff8a00] bg-white'
                  }`}
                  placeholder="House #, Street name, Sector/Area"
                />
                {touched.address && errors.address && (
                  <p id="address-error" className="mt-1 text-xs text-rose-700 font-medium flex items-center gap-1">
                    <AlertCircle size={13} /> {errors.address}
                  </p>
                )}
              </div>

              {/* Address Line 2 (Optional) */}
              <div className="sm:col-span-2">
                <label htmlFor="addressLine2" className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-1.5">
                  Apartment, suite, unit (optional)
                </label>
                <input
                  type="text"
                  id="addressLine2"
                  name="addressLine2"
                  value={formData.addressLine2}
                  onChange={handleFieldChange}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 focus:border-[#ff8a00] focus:ring-1 focus:ring-[#ff8a00] text-sm text-slate-900 outline-none bg-white"
                  placeholder="Apartment or building details"
                />
              </div>

              {/* City */}
              <div>
                <label htmlFor="city" className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-1.5">
                  City <span className="text-rose-600">*</span>
                </label>
                <input
                  type="text"
                  id="city"
                  name="city"
                  value={formData.city}
                  onChange={handleFieldChange}
                  onBlur={() => handleBlur('city')}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 focus:border-[#ff8a00] focus:ring-1 focus:ring-[#ff8a00] text-sm text-slate-900 outline-none bg-white"
                  placeholder="e.g. Lahore, Karachi, Islamabad"
                />
                {touched.city && errors.city && (
                  <p className="mt-1 text-xs text-rose-700 font-medium">{errors.city}</p>
                )}
              </div>

              {/* Province */}
              <div>
                <label htmlFor="province" className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-1.5">
                  Province / State <span className="text-rose-600">*</span>
                </label>
                <select
                  id="province"
                  name="province"
                  value={formData.province}
                  onChange={handleFieldChange}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 focus:border-[#ff8a00] focus:ring-1 focus:ring-[#ff8a00] text-sm text-slate-900 outline-none bg-white font-medium cursor-pointer"
                >
                  <option value="Punjab">Punjab</option>
                  <option value="Sindh">Sindh</option>
                  <option value="Khyber Pakhtunkhwa">Khyber Pakhtunkhwa</option>
                  <option value="Balochistan">Balochistan</option>
                  <option value="Islamabad Capital Territory">Islamabad Capital Territory</option>
                  <option value="Gilgit-Baltistan">Gilgit-Baltistan</option>
                  <option value="Azad Jammu and Kashmir">Azad Jammu and Kashmir</option>
                </select>
              </div>

              {/* Postal Code (Optional) */}
              <div>
                <label htmlFor="postalCode" className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-1.5">
                  Postal Code (optional)
                </label>
                <input
                  type="text"
                  id="postalCode"
                  name="postalCode"
                  value={formData.postalCode}
                  onChange={handleFieldChange}
                  onBlur={() => handleBlur('postalCode')}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 focus:border-[#ff8a00] focus:ring-1 focus:ring-[#ff8a00] text-sm text-slate-900 outline-none bg-white"
                  placeholder="e.g. 54000"
                />
                {touched.postalCode && errors.postalCode && (
                  <p className="mt-1 text-xs text-rose-700 font-medium">{errors.postalCode}</p>
                )}
              </div>

              {/* Delivery Instructions / Customer Note */}
              <div className="sm:col-span-2">
                <label htmlFor="customerNote" className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-1.5">
                  Delivery Notes / Special Instructions (optional)
                </label>
                <textarea
                  id="customerNote"
                  name="customerNote"
                  rows={2}
                  value={formData.customerNote}
                  onChange={handleFieldChange}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 focus:border-[#ff8a00] focus:ring-1 focus:ring-[#ff8a00] text-sm text-slate-900 outline-none bg-white"
                  placeholder="Gate code, landmark, or delivery time preference"
                />
              </div>
            </div>
          </section>

          {/* Step 2: Payment Method */}
          <section className="bg-white p-6 sm:p-7 rounded-2xl border border-slate-200 shadow-xs" aria-labelledby="payment-heading">
            <div className="flex items-center gap-3 pb-4 mb-5 border-b border-slate-100">
              <div className="w-8 h-8 rounded-full bg-orange-100 text-[#0b132b] font-black flex items-center justify-center text-sm">
                2
              </div>
              <div>
                <h2 id="payment-heading" className="text-lg font-bold text-slate-900">
                  Payment Method
                </h2>
                <p className="text-xs text-slate-600">Select how you want to pay for your order</p>
              </div>
            </div>

            {availableMethods.length === 0 ? (
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 font-semibold">
                No payment methods are currently available for this delivery region.
              </div>
            ) : (
              <div className="space-y-3" role="radiogroup" aria-label="Payment method">
                {/* Cash on Delivery */}
                {availableMethods.includes('cod') && (
                  <label
                    className={`flex items-start gap-3.5 p-4 rounded-xl border cursor-pointer transition ${
                      paymentMethod === 'cod'
                        ? 'border-[#ff8a00] bg-orange-50/40 ring-2 ring-orange-200'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <input
                      type="radio"
                      name="paymentMethod"
                      value="cod"
                      checked={paymentMethod === 'cod'}
                      onChange={() => setPaymentMethod('cod')}
                      className="mt-1 w-4 h-4 text-[#ff8a00] border-slate-300 focus:ring-[#ff8a00]"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <Truck size={17} className="text-[#0b132b]" />
                        <span className="text-sm font-bold text-slate-900">Cash on Delivery (COD)</span>
                        <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded">Standard</span>
                      </div>
                      <p className="text-xs text-slate-600 mt-1">
                        Pay with physical cash directly to the courier upon delivery at your doorstep.
                      </p>
                    </div>
                  </label>
                )}

                {/* Direct Bank Transfer */}
                {availableMethods.includes('bank_transfer') && (
                  <label
                    className={`flex items-start gap-3.5 p-4 rounded-xl border cursor-pointer transition ${
                      paymentMethod === 'bank_transfer'
                        ? 'border-[#ff8a00] bg-orange-50/40 ring-2 ring-orange-200'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <input
                      type="radio"
                      name="paymentMethod"
                      value="bank_transfer"
                      checked={paymentMethod === 'bank_transfer'}
                      onChange={() => setPaymentMethod('bank_transfer')}
                      className="mt-1 w-4 h-4 text-[#ff8a00] border-slate-300 focus:ring-[#ff8a00]"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <Building2 size={17} className="text-[#0b132b]" />
                        <span className="text-sm font-bold text-slate-900">Direct Bank Transfer / IBFT</span>
                      </div>
                      <p className="text-xs text-slate-600 mt-1">
                        Transfer directly into our designated business bank account and upload the reference proof.
                      </p>
                    </div>
                  </label>
                )}

                {/* Raast Instant Payment */}
                {availableMethods.includes('raast') && (
                  <label
                    className={`flex items-start gap-3.5 p-4 rounded-xl border cursor-pointer transition ${
                      paymentMethod === 'raast'
                        ? 'border-[#ff8a00] bg-orange-50/40 ring-2 ring-orange-200'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <input
                      type="radio"
                      name="paymentMethod"
                      value="raast"
                      checked={paymentMethod === 'raast'}
                      onChange={() => setPaymentMethod('raast')}
                      className="mt-1 w-4 h-4 text-[#ff8a00] border-slate-300 focus:ring-[#ff8a00]"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <PhoneCall size={17} className="text-[#0b132b]" />
                        <span className="text-sm font-bold text-slate-900">Raast Instant Payment</span>
                      </div>
                      <p className="text-xs text-slate-600 mt-1">
                        Instant zero-fee account transfer via State Bank of Pakistan Raast ID.
                      </p>
                    </div>
                  </label>
                )}

                {/* Credit / Debit Card (Stripe) */}
                {availableMethods.includes('stripe') && (
                  <label
                    className={`flex items-start gap-3.5 p-4 rounded-xl border cursor-pointer transition ${
                      paymentMethod === 'stripe'
                        ? 'border-[#ff8a00] bg-orange-50/40 ring-2 ring-orange-200'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <input
                      type="radio"
                      name="paymentMethod"
                      value="stripe"
                      checked={paymentMethod === 'stripe'}
                      onChange={() => setPaymentMethod('stripe')}
                      className="mt-1 w-4 h-4 text-[#ff8a00] border-slate-300 focus:ring-[#ff8a00]"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <CreditCard size={17} className="text-[#0b132b]" />
                        <span className="text-sm font-bold text-slate-900">Visa / Mastercard / UnionPay</span>
                      </div>
                      <p className="text-xs text-slate-600 mt-1">
                        Card payment processed securely via encrypted provider session.
                      </p>
                    </div>
                  </label>
                )}
              </div>
            )}
          </section>

          {/* Terms & Place Order */}
          <div className="p-4 bg-white rounded-2xl border border-slate-200 space-y-4">
            <label className="flex items-start gap-3 text-xs text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={agreeTerms}
                onChange={(e) => setAgreeTerms(e.target.checked)}
                className="mt-0.5 w-4 h-4 text-[#ff8a00] border-slate-300 rounded focus:ring-[#ff8a00]"
              />
              <span>
                I agree to the Storefront Terms of Service, Return Policy, and Authoritative Pricing terms.
              </span>
            </label>

            {errors.terms && (
              <p className="text-xs text-rose-700 font-semibold">{errors.terms}</p>
            )}

            <button
              type="submit"
              disabled={loading || availableItems.length === 0}
              className="w-full flex min-h-[50px] items-center justify-center gap-2 rounded-xl bg-[#ff8a00] hover:bg-[#ffab45] text-[#0b132b] font-black text-base shadow-sm transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <Loader2 size={18} className="animate-spin" /> Confirming Order...
                </>
              ) : (
                <>
                  Place Order ({formatMoney(estimatedPayable)}) <ArrowRight size={18} />
                </>
              )}
            </button>
          </div>
        </form>

        {/* Right Sidebar: Order Summary & Coupon */}
        <aside className="space-y-6" aria-label="Order summary sidebar">
          {/* Items Preview */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
            <h2 className="text-base font-extrabold text-slate-900 mb-4 pb-3 border-b border-slate-100">
              Items in Order ({availableItems.reduce((c, i) => c + i.quantity, 0)})
            </h2>

            <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
              {availableItems.map((item) => (
                <div
                  key={`${item.productId || item.id}:${item.variantId || 'default'}`}
                  className="flex items-center gap-3 text-xs"
                >
                  <div className="relative w-12 h-12 rounded-lg bg-slate-100 overflow-hidden shrink-0 border border-slate-200">
                    <Image
                      src={getSafeMediaUrl(item.image)}
                      alt={item.name}
                      fill
                      sizes="48px"
                      className="object-cover"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-slate-900 truncate">{item.name}</p>
                    {item.variant && <p className="text-slate-600 text-[11px] truncate">{item.variant}</p>}
                    <p className="text-slate-600 font-medium">Qty: {item.quantity}</p>
                  </div>
                  <div className="font-extrabold text-slate-900 shrink-0">
                    {formatMoney(item.price * item.quantity)}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Coupon Code Section */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
            <h2 className="text-sm font-extrabold text-slate-900 mb-3 flex items-center gap-2">
              <Tag size={16} className="text-[#ff8a00]" /> Promo / Coupon Code
            </h2>

            {appliedCoupon ? (
              <div className="flex items-center justify-between p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs">
                <div>
                  <span className="font-extrabold text-emerald-900 uppercase tracking-wider block">
                    {appliedCoupon.code}
                  </span>
                  <span className="text-emerald-700 font-semibold">
                    Estimated discount: -{formatMoney(estimatedDiscount)}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleRemoveCoupon}
                  className="p-1 hover:bg-emerald-100 rounded-full transition text-emerald-800"
                  aria-label="Remove coupon"
                >
                  <X size={16} />
                </button>
              </div>
            ) : (
              <form onSubmit={handleApplyCoupon} className="flex gap-2">
                <input
                  type="text"
                  value={couponInput}
                  onChange={(e) => setCouponInput(e.target.value)}
                  placeholder="Enter code (e.g. MEVA10)"
                  className="min-w-0 flex-1 px-3 py-2 border border-slate-300 rounded-lg text-xs uppercase font-bold text-slate-900 outline-none focus:ring-1 focus:ring-[#ff8a00] bg-white"
                  aria-label="Coupon code"
                />
                <button
                  type="submit"
                  disabled={couponLoading || !couponInput.trim()}
                  className="px-4 py-2 bg-[#0b132b] hover:bg-slate-800 text-white text-xs font-bold rounded-lg transition disabled:opacity-50 shrink-0 flex items-center gap-1"
                >
                  {couponLoading ? <Loader2 size={13} className="animate-spin" /> : 'Apply'}
                </button>
              </form>
            )}
          </div>

          {/* Order Totals Box */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-3.5 text-sm">
            <h2 className="font-extrabold text-slate-900 pb-2 border-b border-slate-100">
              Payment Breakdown
            </h2>

            <div className="flex justify-between text-slate-700">
              <span>Items Subtotal</span>
              <span className="font-bold text-slate-900">{formatMoney(subtotal)}</span>
            </div>

            {appliedCoupon && (
              <div className="flex justify-between text-emerald-700 font-semibold">
                <span>Coupon Discount ({appliedCoupon.code})</span>
                <span>-{formatMoney(estimatedDiscount)}</span>
              </div>
            )}

            <div className="flex justify-between text-slate-700">
              <span>Shipping Fee</span>
              <span className="text-xs text-slate-600 font-medium">Calculated by server</span>
            </div>

            <div className="pt-3 border-t border-slate-200 flex justify-between items-baseline">
              <span className="text-base font-extrabold text-slate-900">Estimated Total</span>
              <span className="text-2xl font-black text-[#0b132b]">{formatMoney(estimatedPayable)}</span>
            </div>

            <p className="text-[11px] text-slate-600 leading-normal pt-1">
              Final total and shipping fee are authoritatively computed and committed on the backend upon submission.
            </p>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-center gap-2 text-xs text-slate-700 font-semibold">
              <Shield size={15} className="text-emerald-700" />
              <span>Idempotent Transaction Guarantee</span>
            </div>
          </div>
        </aside>
      </div>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </main>
  );
}

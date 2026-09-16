'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect, useRef, useCallback } from 'react';
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
  Globe,
  RefreshCw,
  Clock,
  CheckCircle2,
  Package,
} from 'lucide-react';
import { useCartStore } from '@/store/cartStore';
import { useAuthStore } from '@/store/authStore';
import {
  validateCouponPreview,
  fetchMarketConfig,
  fetchCheckoutQuote,
  getOrCreateCheckoutAttempt,
  clearCheckoutAttempt,
  detectMaterialQuoteChange,
  serializeCheckoutPayload,
  submitOrder,
  type CouponPreviewResult,
  type ShippingAddressInput,
} from '@/lib/checkoutService';
import { formatExactMoney } from '@/lib/exactMoney';
import { getCountryPolicy, getSubdivisionLabel } from '@/lib/countryPolicy';
import { getSafeMediaUrl } from '@/lib/catalogAdapter';
import Toast from '@/components/Toast';
import { paymentService, type AvailablePaymentMethod } from '@/services/payment.service';
import type { AuthoritativeQuote, MarketConfigResponse } from '@/types/commerce';

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

/**
 * Maps backend machine codes and network errors to customer-safe messages.
 * Prevents raw database, stack trace, or internal exception leaks.
 */
function mapQuoteErrorMessage(err: unknown): string {
  const errorResp = (err as { response?: { data?: { code?: string; message?: string } } })?.response?.data;
  const code = errorResp?.code;
  const rawMsg = errorResp?.message || (err instanceof Error ? err.message : '');

  if (code === 'SHIPPING_WEIGHT_REQUIRED') {
    return 'Product weight missing or invalid for shipping calculation. Please contact customer support.';
  }
  if (code === 'NO_AUTHORIZED_FULFILLMENT_ORIGIN') {
    return 'No authorized fulfillment origin available for this destination.';
  }
  if (code === 'SHIPPING_ZONE_UNAVAILABLE' || code === 'NO_SHIPPING_RULE' || code === 'UNSERVICEABLE_DESTINATION') {
    return 'No governed shipping route available for the specified destination.';
  }
  if (code === 'PAYMENT_PROVIDER_NOT_ELIGIBLE') {
    return 'The selected payment method is not eligible for this destination or currency.';
  }
  if (code === 'QUOTE_EXPIRED' || code === 'QUOTE_TAMPERED') {
    return 'Your checkout quote has expired or is invalid. Please refresh the quote to proceed.';
  }
  if (code === 'INVENTORY_SHORTAGE' || code === 'OUT_OF_STOCK') {
    return 'One or more items in your cart are no longer available in sufficient quantity.';
  }
  if (rawMsg && !rawMsg.includes('Cast to') && !rawMsg.includes('Mongo') && !rawMsg.includes('stack') && !rawMsg.includes('ValidationError:')) {
    return rawMsg;
  }
  return 'Unable to generate authoritative shipping quote for this destination.';
}

export type CheckoutQuoteStatus = 'idle' | 'loading' | 'valid' | 'error' | 'expired';

export default function CheckoutPage() {
  const router = useRouter();
  const { items, clearCart } = useCartStore();
  const { isAuthenticated, isInitialized, user, bootstrap } = useAuthStore();

  const [loading, setLoading] = useState(false);
  const [agreeTerms, setAgreeTerms] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  // Market & Country State
  const [marketConfig, setMarketConfig] = useState<MarketConfigResponse | null>(null);
  const [marketLoading, setMarketLoading] = useState(true);
  const [marketError, setMarketError] = useState<string | null>(null);

  // Form State
  const [formData, setFormData] = useState<FormState>({
    fullName: user?.fullName || '',
    phone: '',
    address: '',
    addressLine2: '',
    city: '',
    province: '',
    postalCode: '',
    country: '',
    customerNote: '',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  // Shipping Service Level Selection (governed arbitrary string code)
  const [shippingServiceLevel, setShippingServiceLevel] = useState<string>('standard');

  // Authoritative Quote State
  const [quote, setQuote] = useState<AuthoritativeQuote | null>(null);
  const [quoteStatus, setQuoteStatus] = useState<CheckoutQuoteStatus>('idle');
  const [lastConfirmedQuote, setLastConfirmedQuote] = useState<AuthoritativeQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [materialChangeNotice, setMaterialChangeNotice] = useState<string | null>(null);

  // Live accessibility announcement
  const [liveAnnouncement, setLiveAnnouncement] = useState<string>('');

  // Payment Selection
  const [availableMethods, setAvailableMethods] = useState<AvailablePaymentMethod[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<string>('');

  // Coupon State
  const [couponInput, setCouponInput] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<CouponPreviewResult | null>(null);
  const [couponLoading, setCouponLoading] = useState(false);

  // In-flight and race cancellation ref
  const quoteRequestIdRef = useRef(0);
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

  // Step 1: Load Authoritative Market Configuration
  useEffect(() => {
    const controller = new AbortController();
    async function loadMarket() {
      try {
        setMarketLoading(true);
        const config = await fetchMarketConfig(controller.signal);
        setMarketConfig(config);
        setMarketError(null);

        // Initialize country from authoritative market configuration
        setFormData((prev) => {
          const defaultCountry = config.merchantCountry || config.homeCountry || config.enabledCountries?.[0] || '';
          if (!prev.country || (config.enabledCountries && !config.enabledCountries.includes(prev.country))) {
            return { ...prev, country: defaultCountry };
          }
          return prev;
        });
      } catch (err: unknown) {
        if (!controller.signal.aborted) {
          const msg = err instanceof Error ? err.message : 'Commerce market configuration unavailable';
          setMarketError(msg);
        }
      } finally {
        if (!controller.signal.aborted) {
          setMarketLoading(false);
        }
      }
    }
    void loadMarket();
    return () => {
      controller.abort();
    };
  }, []);

  const availableItems = items.filter((i) => !i.isUnavailable);

  // Monitor cart items changes to immediately invalidate stale quote token
  const prevItemsFingerprintRef = useRef('');
  const currentItemsFingerprint = availableItems.map((i) => `${i.productId || i.id}:${i.variantId || ''}:${i.quantity}`).join('|');

  useEffect(() => {
    if (prevItemsFingerprintRef.current && prevItemsFingerprintRef.current !== currentItemsFingerprint) {
      setQuote(null);
      setQuoteStatus('loading');
      setQuoteError(null);
    }
    prevItemsFingerprintRef.current = currentItemsFingerprint;
  }, [currentItemsFingerprint]);

  // Active Country Policy
  const activeCountryCode = (formData.country || marketConfig?.merchantCountry || marketConfig?.homeCountry || marketConfig?.enabledCountries?.[0] || '').toUpperCase();
  const countryPolicy = getCountryPolicy(activeCountryCode);

  const subdivisionLabel = getSubdivisionLabel(countryPolicy);

  // Check if current quote is expired via periodic timer tick
  const [currentTime, setCurrentTime] = useState(() => Date.now());

  useEffect(() => {
    if (!quote?.expiresAt) return;
    const interval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 5000);
    return () => clearInterval(interval);
  }, [quote?.expiresAt]);

  const isQuoteExpired = Boolean(
    quote?.expiresAt && new Date(quote.expiresAt).getTime() <= currentTime
  );

  // Step 2: Authoritative Quote Fetcher with Debounce & Stale Response Race Protection
  const requestAuthoritativeQuote = useCallback(
    async (overrideServiceLevel?: string, signal?: AbortSignal) => {
      if (availableItems.length === 0 || !formData.address.trim() || !formData.city.trim()) {
        setQuote(null);
        setQuoteStatus('idle');
        setQuoteError(null);
        setQuoteLoading(false);
        return;
      }

      const currentReqId = ++quoteRequestIdRef.current;
      setQuote(null);
      setQuoteStatus('loading');
      setQuoteLoading(true);
      setQuoteError(null);
      setLiveAnnouncement('Updating authoritative quote and shipping options...');

      const effectiveServiceLevel = overrideServiceLevel || shippingServiceLevel || undefined;

      try {
        const quoteRequest = {
          items: availableItems.map((item) => ({
            productId: item.productId || item.id,
            variantId: item.variantId || undefined,
            quantity: Math.max(1, Math.floor(item.quantity || 1)),
          })),
          shippingAddress: {
            fullName: formData.fullName.trim() || undefined,
            phone: formData.phone.trim() || undefined,
            address: formData.address.trim(),
            addressLine2: formData.addressLine2.trim() || undefined,
            city: formData.city.trim(),
            province: formData.province.trim() || undefined,
            postalCode: formData.postalCode.trim() || undefined,
            country: countryPolicy.name,
            countryCode: activeCountryCode,
          },
          currency: marketConfig?.defaultCurrency || marketConfig?.baseCurrency || undefined,
          couponCode: appliedCoupon?.code || undefined,
          shippingServiceLevel: effectiveServiceLevel,
        };

        const res = await fetchCheckoutQuote(quoteRequest, signal);

        if (currentReqId === quoteRequestIdRef.current) {
          const newQuote = res.data.quote;

          // Fail closed if server returned no available shipping options or missing token
          if (!newQuote.shipping?.availableOptions || newQuote.shipping.availableOptions.length === 0 || !newQuote.quoteToken) {
            setQuote(null);
            setQuoteStatus('error');
            const errMsg = 'No governed shipping service is available for this destination.';
            setQuoteError(errMsg);
            setLiveAnnouncement(errMsg);
            return;
          }

          // Check if material quote terms changed since customer last reviewed
          if (lastConfirmedQuote) {
            const diff = detectMaterialQuoteChange(lastConfirmedQuote, newQuote);
            if (diff.changed) {
              setMaterialChangeNotice(diff.reason || 'Authoritative order terms were updated.');
            }
          }

          // Sync selected service level preference with server response
          if (newQuote.shipping.selectedOption?.serviceLevel) {
            setShippingServiceLevel(newQuote.shipping.selectedOption.serviceLevel);
          }

          setQuote(newQuote);
          setQuoteStatus('valid');
          setQuoteError(null);
          setLiveAnnouncement(`Quote updated. Shipping: ${formatExactMoney(newQuote.totals.shippingExact)}`);

          // If COD was selected and destination is international or COD is not eligible, clear COD immediately
          const isHomeCountry = Boolean(marketConfig?.homeCountry && activeCountryCode === marketConfig.homeCountry);
          const isCodEligible = Array.isArray(newQuote.eligiblePaymentMethods) && newQuote.eligiblePaymentMethods.some((m) => m.code === 'cod');
          if ((!newQuote.isDomestic || !isHomeCountry || !isCodEligible) && paymentMethod === 'cod') {
            setPaymentMethod('');
          }
        }
      } catch (err: unknown) {
        if (currentReqId === quoteRequestIdRef.current) {
          // Fail closed: clear stale quote and token on failure
          setQuote(null);
          setQuoteStatus('error');
          const safeMessage = mapQuoteErrorMessage(err);
          setQuoteError(safeMessage);
          setLiveAnnouncement(`Quote error: ${safeMessage}`);
        }
      } finally {
        if (currentReqId === quoteRequestIdRef.current) {
          setQuoteLoading(false);
        }
      }
    },
    [
      availableItems,
      formData.fullName,
      formData.phone,
      formData.address,
      formData.addressLine2,
      formData.city,
      formData.province,
      formData.postalCode,
      countryPolicy.name,
      activeCountryCode,
      marketConfig,
      appliedCoupon,
      shippingServiceLevel,
      lastConfirmedQuote,
      paymentMethod,
    ]
  );

  // Debounced quote updates when address / items / coupon change
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void requestAuthoritativeQuote(shippingServiceLevel, controller.signal);
    }, 350);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [
    formData.address,
    formData.city,
    formData.province,
    formData.postalCode,
    formData.country,
    availableItems.length,
    appliedCoupon?.code,
    shippingServiceLevel,
    requestAuthoritativeQuote,
  ]);

  // Handle shipping service selection with immediate authoritative re-quote
  const handleShippingSelect = (serviceLevel: string) => {
    setShippingServiceLevel(serviceLevel);
    setQuote(null);
    setQuoteStatus('loading');
    setQuoteError(null);
    void requestAuthoritativeQuote(serviceLevel);
  };

  // Step 3: Discover Available Payment Methods from Backend Policy
  useEffect(() => {
    const controller = new AbortController();
    async function loadPaymentMethods() {
      try {
        const currency = quote?.currency || marketConfig?.defaultCurrency || marketConfig?.baseCurrency || '';
        if (!activeCountryCode || !currency) {
          setAvailableMethods([]);
          return;
        }

        const methods = await paymentService.getAvailableMethods(
          activeCountryCode,
          currency,
          controller.signal
        );

        if (!controller.signal.aborted) {
          let filtered = methods;

          // Filter strictly against backend quote's eligible methods
          if (quote && Array.isArray(quote.eligiblePaymentMethods)) {
            const allowedCodes = new Set(quote.eligiblePaymentMethods.map((m) => m.code));
            filtered = methods.filter((m) => allowedCodes.has(m.code));
          }

          // If international / cross-border destination or quote is not domestic, ensure COD is removed
          const isHomeCountry = activeCountryCode === (marketConfig?.homeCountry || marketConfig?.merchantCountry || 'PK');
          if ((quote && !quote.isDomestic) || !isHomeCountry) {
            filtered = filtered.filter((m) => m.code !== 'cod');
          }

          setAvailableMethods(filtered);

          // If current selected payment method is no longer eligible (e.g. COD for international), auto-reset
          setPaymentMethod((current) => {
            if (current && !filtered.some((m) => m.code === current)) {
              return filtered[0]?.code || '';
            }
            return current || filtered[0]?.code || '';
          });
        }
      } catch {
        // Fail closed safely without crashing form
        if (!controller.signal.aborted) {
          setAvailableMethods([]);
        }
      }
    }

    void loadPaymentMethods();

    return () => {
      controller.abort();
    };
  }, [
    activeCountryCode,
    quote,
    marketConfig?.defaultCurrency,
    marketConfig?.baseCurrency,
    marketConfig?.homeCountry,
    marketConfig?.merchantCountry,
  ]);

  const handleFieldChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: '' }));
    }
    // Immediately invalidate stale quote on any address / destination changes
    if (['country', 'province', 'city', 'address', 'addressLine2', 'postalCode', 'fullName', 'phone'].includes(name)) {
      setQuote(null);
      setQuoteStatus('loading');
      setQuoteError(null);
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
      else if (!/^\+?[0-9][0-9 -]{6,19}$/.test(v)) err = 'Please enter a valid phone number (e.g. +923001234567)';
    } else if (field === 'address') {
      if (v.length < 5) err = 'Street address must be at least 5 characters';
      else if (v.length > 300) err = 'Street address must be under 300 characters';
    } else if (field === 'city') {
      if (v.length < 1) err = 'City is required';
    } else if (field === 'province') {
      if (countryPolicy.adminPolicy === 'required' && !v) {
        err = `${subdivisionLabel} is required for ${countryPolicy.name}`;
      }
    } else if (field === 'postalCode') {
      if (countryPolicy.postalPolicy === 'required' && !v) {
        err = `Postal code is required for ${countryPolicy.name}`;
      } else if (v && !/^[A-Za-z0-9 -]{2,20}$/.test(v)) {
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
    if (formData.address.trim().length < 5) newErrors.address = 'Street address must be at least 5 characters';
    if (!formData.city.trim()) newErrors.city = 'City is required';

    if (countryPolicy.adminPolicy === 'required' && !formData.province.trim()) {
      newErrors.province = `${subdivisionLabel} is required for ${countryPolicy.name}`;
    }

    if (countryPolicy.postalPolicy === 'required' && !formData.postalCode.trim()) {
      newErrors.postalCode = `Postal code is required for ${countryPolicy.name}`;
    } else if (formData.postalCode.trim() && !/^[A-Za-z0-9 -]{2,20}$/.test(formData.postalCode.trim())) {
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
    setQuote(null);
    setQuoteStatus('loading');
    setQuoteError(null);
    try {
      const preview = await validateCouponPreview(couponInput, availableItems);
      setAppliedCoupon(preview);
      setToast({
        message: `Coupon "${preview.code}" applied.`,
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
    setQuote(null);
    setQuoteStatus('loading');
    setQuoteError(null);
    setToast({ message: 'Coupon removed', type: 'info' });
  };

  const handleAcknowledgeMaterialChange = () => {
    setLastConfirmedQuote(quote);
    setMaterialChangeNotice(null);
  };

  const handleSubmitOrder = async (e: React.FormEvent) => {
    e.preventDefault();

    if (loading || quoteLoading || quoteStatus !== 'valid' || submittingRef.current) return;
    if (availableItems.length === 0) {
      setToast({ message: 'Your cart has no available items to checkout.', type: 'error' });
      return;
    }

    if (!validateAllFields()) {
      setToast({ message: 'Please fix the errors in the checkout form', type: 'error' });
      setTimeout(() => {
        const firstInvalid = document.querySelector('[aria-invalid="true"]') as HTMLElement;
        firstInvalid?.focus();
      }, 50);
      return;
    }

    if (!quote || !quote.quoteToken || quoteStatus !== 'valid') {
      setToast({ message: 'A valid authoritative checkout quote is required. Please check your address.', type: 'error' });
      return;
    }

    // Check if quote expired
    if (new Date(quote.expiresAt).getTime() <= Date.now()) {
      setQuote(null);
      setQuoteStatus('expired');
      setToast({ message: 'Your checkout quote has expired. Refreshing quote...', type: 'info' });
      await requestAuthoritativeQuote();
      return;
    }

    // Check material quote change
    if (materialChangeNotice) {
      setToast({ message: 'Please review and reconfirm the updated quote before placing your order.', type: 'error' });
      return;
    }

    if (!paymentMethod) {
      setErrors((prev) => ({ ...prev, paymentMethod: 'Please select a payment method.' }));
      setToast({ message: 'Please select a payment method to continue.', type: 'error' });
      return;
    }

    try {
      submittingRef.current = true;
      setLoading(true);

      const effectiveFullName = formData.fullName.trim() || user?.fullName || '';
      const resolvedAddressData: ShippingAddressInput = {
        ...formData,
        fullName: effectiveFullName,
        country: countryPolicy.name,
        countryCode: activeCountryCode,
      };

      // Retrieve or derive stable CheckoutAttempt idempotency key
      const attempt = getOrCreateCheckoutAttempt(
        availableItems,
        resolvedAddressData,
        paymentMethod,
        shippingServiceLevel,
        appliedCoupon?.code
      );

      const payload = serializeCheckoutPayload(
        availableItems,
        resolvedAddressData,
        paymentMethod,
        quote.quoteToken,
        shippingServiceLevel,
        appliedCoupon?.code,
        formData.customerNote,
        quote.currency
      );

      const result = await submitOrder(payload, attempt.idempotencyKey);

      if (result.order) {
        clearCheckoutAttempt();
        clearCart();
        const destinationOrderId = result.order._id || result.order.orderId;
        router.push(`/order-success?orderId=${encodeURIComponent(destinationOrderId)}`);
      }
    } catch (err: unknown) {
      submittingRef.current = false;
      setLoading(false);

      const errorResp = (err as { response?: { data?: { code?: string; message?: string } } })?.response?.data;
      const errorCode = errorResp?.code;

      if (errorCode === 'QUOTE_EXPIRED' || errorCode === 'QUOTE_TAMPERED') {
        setToast({ message: 'Checkout quote expired or invalidated. Refreshing quote...', type: 'info' });
        await requestAuthoritativeQuote();
      } else {
        const safeErrorMessage = mapQuoteErrorMessage(err);
        setToast({ message: safeErrorMessage, type: 'error' });
      }
    }
  };

  if (!isInitialized || marketLoading) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center p-4 bg-slate-50">
        <Loader2 className="w-12 h-12 text-[#ff8a00] animate-spin mb-4" />
        <p className="text-sm font-semibold text-slate-700">Loading verified commerce configuration...</p>
      </div>
    );
  }

  if (marketError) {
    return (
      <div className="mx-auto max-w-xl py-16 px-4 text-center">
        <AlertCircle size={44} className="mx-auto text-rose-500 mb-4" />
        <h1 className="text-2xl font-bold text-slate-900 mb-2">Commerce Unavailable</h1>
        <p className="text-sm text-slate-600 mb-6">{marketError}</p>
        <button
          onClick={() => window.location.reload()}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[#0b132b] text-white font-bold text-sm hover:bg-slate-800 transition shadow-sm"
        >
          <RefreshCw size={16} /> Retry Connection
        </button>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-xl py-16 px-4 text-center">
        <AlertCircle size={40} className="mx-auto text-slate-400 mb-4" />
        <h1 className="text-2xl font-bold text-slate-900 mb-2">Cart is empty</h1>
        <p className="text-sm text-slate-600 mb-6">Add products to your cart before proceeding to checkout.</p>
        <Link
          href="/products"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[#0b132b] text-white font-bold text-sm hover:bg-slate-800 transition shadow-sm"
        >
          Browse Catalogue
        </Link>
      </div>
    );
  }

  const enabledCountriesList = marketConfig?.enabledCountries || (marketConfig?.merchantCountry ? [marketConfig.merchantCountry] : []);
  const isCrossBorderRoute = quote ? !quote.isDomestic : activeCountryCode !== (marketConfig?.homeCountry || marketConfig?.merchantCountry || 'PK');

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 bg-slate-50 min-h-screen">
      {/* Accessible Live Region for Screen Readers */}
      <div role="status" aria-live="polite" className="sr-only">
        {liveAnnouncement}
      </div>

      {/* Breadcrumb & Title */}
      <div className="mb-8">
        <Link href="/cart" className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-700 hover:text-[#9a3412] mb-3 transition">
          <ArrowLeft size={14} /> Back to Cart
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-black text-[#0b132b]">Global Checkout</h1>
            <p className="text-xs sm:text-sm text-slate-700 mt-1">
              Complete your order with authoritative pricing, international tax and customs calculation.
            </p>
          </div>
          <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 shadow-2xs">
            <Globe size={15} className="text-[#ff8a00]" />
            <span>Market: {countryPolicy.name} ({activeCountryCode})</span>
          </div>
        </div>
      </div>

      {/* Profile Country Incompletion Warning */}
      {isAuthenticated && user && (!user.residenceCountry || user.isCountryComplete === false) && (
        <div className="mb-6 p-4 bg-orange-50 border-2 border-[#ff8a00] rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-start gap-3">
            <AlertCircle className="text-[#9a3412] shrink-0 mt-0.5" size={20} />
            <div>
              <h3 className="text-sm font-bold text-slate-900">Residence Country Required</h3>
              <p className="text-xs text-slate-700 mt-0.5">
                Please complete your verified country of residence in your profile before submitting your order.
              </p>
            </div>
          </div>
          <Link
            href="/account?tab=profile&redirect=/checkout"
            className="px-4 py-2 bg-[#0b132b] hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition shrink-0 inline-flex items-center justify-center"
          >
            Complete Profile
          </Link>
        </div>
      )}

      {/* Quote Expiry Warning */}
      {isQuoteExpired && quote && (
        <div className="mb-6 p-4 bg-amber-50 border-2 border-amber-300 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-start gap-3">
            <Clock className="text-amber-700 shrink-0 mt-0.5" size={20} />
            <div>
              <h3 className="text-sm font-bold text-amber-900">Quote Expired</h3>
              <p className="text-xs text-amber-800 mt-0.5">
                Your authoritative checkout quote has expired. Please refresh to retrieve updated rates and delivery promises.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void requestAuthoritativeQuote()}
            disabled={quoteLoading}
            className="px-4 py-2 bg-amber-800 hover:bg-amber-900 text-white text-xs font-bold rounded-xl transition shrink-0 inline-flex items-center gap-1.5"
          >
            <RefreshCw size={14} className={quoteLoading ? 'animate-spin' : ''} /> Refresh Quote
          </button>
        </div>
      )}

      {/* Material Change Reconfirmation Alert */}
      {materialChangeNotice && (
        <div className="mb-6 p-4 bg-amber-50 border-2 border-amber-300 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-start gap-3">
            <AlertCircle className="text-amber-700 shrink-0 mt-0.5" size={20} />
            <div>
              <h3 className="text-sm font-bold text-amber-900">Order Terms Updated</h3>
              <p className="text-xs text-amber-800 mt-0.5">{materialChangeNotice}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleAcknowledgeMaterialChange}
            className="px-4 py-2 bg-amber-800 hover:bg-amber-900 text-white text-xs font-bold rounded-xl transition shrink-0"
          >
            Review & Accept Updated Total
          </button>
        </div>
      )}

      <div className="grid gap-8 lg:grid-cols-[1fr_24rem]">
        {/* Left Form Column */}
        <form onSubmit={handleSubmitOrder} noValidate className="space-y-8">
          {/* Step 1: Destination & Shipping Address */}
          <section className="bg-white p-6 sm:p-7 rounded-2xl border border-slate-200 shadow-xs" aria-labelledby="shipping-heading">
            <div className="flex items-center gap-3 pb-4 mb-5 border-b border-slate-100">
              <div className="w-8 h-8 rounded-full bg-orange-100 text-[#0b132b] font-black flex items-center justify-center text-sm">
                1
              </div>
              <div>
                <h2 id="shipping-heading" className="text-lg font-bold text-slate-900">
                  Destination & Shipping Address
                </h2>
                <p className="text-xs text-slate-600">Select your destination market and physical delivery address</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Destination Country */}
              <div className="sm:col-span-2">
                <label htmlFor="country" className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-1.5">
                  Destination Market / Country <span className="text-rose-600">*</span>
                </label>
                <select
                  id="country"
                  name="country"
                  value={formData.country}
                  onChange={handleFieldChange}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 focus:border-[#ff8a00] focus:ring-1 focus:ring-[#ff8a00] text-sm text-slate-900 outline-none bg-white font-semibold cursor-pointer"
                >
                  {enabledCountriesList.map((code) => {
                    const policy = getCountryPolicy(code);
                    return (
                      <option key={code} value={code}>
                        {policy.name} ({code})
                      </option>
                    );
                  })}
                </select>
              </div>

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
                  <p id="fullName-error" role="alert" className="mt-1 text-xs text-rose-700 font-medium flex items-center gap-1">
                    <AlertCircle size={13} /> {errors.fullName}
                  </p>
                )}
              </div>

              {/* Phone */}
              <div className="sm:col-span-2">
                <label htmlFor="phone" className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-1.5">
                  Phone Number ({countryPolicy.callingCode || 'International'}) <span className="text-rose-600">*</span>
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
                  placeholder={countryPolicy.callingCode ? `${countryPolicy.callingCode} 3001234567` : '+1 555 123 4567'}
                />
                {touched.phone && errors.phone && (
                  <p id="phone-error" role="alert" className="mt-1 text-xs text-rose-700 font-medium flex items-center gap-1">
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
                  placeholder="Building name, Street address, Flat/Suite"
                />
                {touched.address && errors.address && (
                  <p id="address-error" role="alert" className="mt-1 text-xs text-rose-700 font-medium flex items-center gap-1">
                    <AlertCircle size={13} /> {errors.address}
                  </p>
                )}
              </div>

              {/* Address Line 2 */}
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
                  placeholder="Additional delivery instructions"
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
                  aria-invalid={Boolean(touched.city && errors.city)}
                  aria-describedby={errors.city ? 'city-error' : undefined}
                  className={`w-full px-3.5 py-2.5 rounded-lg border text-sm text-slate-900 outline-none transition ${
                    touched.city && errors.city
                      ? 'border-rose-500 ring-1 ring-rose-500 bg-rose-50/20'
                      : 'border-slate-300 focus:border-[#ff8a00] focus:ring-1 focus:ring-[#ff8a00] bg-white'
                  }`}
                  placeholder="e.g. Dubai, London, New York"
                />
                {touched.city && errors.city && (
                  <p id="city-error" role="alert" className="mt-1 text-xs text-rose-700 font-medium flex items-center gap-1">
                    <AlertCircle size={13} /> {errors.city}
                  </p>
                )}
              </div>

              {/* Subdivision (Province / State / Emirate / Region) */}
              <div>
                <label htmlFor="province" className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-1.5">
                  {subdivisionLabel} {countryPolicy.adminPolicy === 'required' && <span className="text-rose-600">*</span>}
                </label>
                <input
                  type="text"
                  id="province"
                  name="province"
                  value={formData.province}
                  onChange={handleFieldChange}
                  onBlur={() => handleBlur('province')}
                  aria-invalid={Boolean(touched.province && errors.province)}
                  aria-describedby={errors.province ? 'province-error' : undefined}
                  className={`w-full px-3.5 py-2.5 rounded-lg border text-sm text-slate-900 outline-none transition ${
                    touched.province && errors.province
                      ? 'border-rose-500 ring-1 ring-rose-500 bg-rose-50/20'
                      : 'border-slate-300 focus:border-[#ff8a00] focus:ring-1 focus:ring-[#ff8a00] bg-white'
                  }`}
                  placeholder={`e.g. ${countryPolicy.adminType === 'emirate' ? 'Dubai / Abu Dhabi' : countryPolicy.adminType === 'state' ? 'California / NY' : 'Punjab / Sindh'}`}
                />
                {touched.province && errors.province && (
                  <p id="province-error" role="alert" className="mt-1 text-xs text-rose-700 font-medium flex items-center gap-1">
                    <AlertCircle size={13} /> {errors.province}
                  </p>
                )}
              </div>

              {/* Postal Code */}
              {countryPolicy.postalPolicy !== 'not_used' && (
                <div className="sm:col-span-2">
                  <label htmlFor="postalCode" className="block text-xs font-bold text-slate-800 uppercase tracking-wider mb-1.5">
                    Postal Code {countryPolicy.postalPolicy === 'required' && <span className="text-rose-600">*</span>}
                  </label>
                  <input
                    type="text"
                    id="postalCode"
                    name="postalCode"
                    value={formData.postalCode}
                    onChange={handleFieldChange}
                    onBlur={() => handleBlur('postalCode')}
                    aria-invalid={Boolean(touched.postalCode && errors.postalCode)}
                    aria-describedby={errors.postalCode ? 'postalCode-error' : undefined}
                    className={`w-full px-3.5 py-2.5 rounded-lg border text-sm text-slate-900 outline-none transition ${
                      touched.postalCode && errors.postalCode
                        ? 'border-rose-500 ring-1 ring-rose-500 bg-rose-50/20'
                        : 'border-slate-300 focus:border-[#ff8a00] focus:ring-1 focus:ring-[#ff8a00] bg-white'
                    }`}
                    placeholder="e.g. 54000 or SW1A 1AA or 90210"
                  />
                  {touched.postalCode && errors.postalCode && (
                    <p id="postalCode-error" role="alert" className="mt-1 text-xs text-rose-700 font-medium flex items-center gap-1">
                      <AlertCircle size={13} /> {errors.postalCode}
                    </p>
                  )}
                </div>
              )}

              {/* Delivery Note */}
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
                  placeholder="Gate instructions, landmark, or delivery time preference"
                />
              </div>
            </div>
          </section>

          {/* Step 2: Dynamic Governed Shipping Options */}
          <section className="bg-white p-6 sm:p-7 rounded-2xl border border-slate-200 shadow-xs" aria-labelledby="shipping-service-heading">
            <div className="flex items-center gap-3 pb-4 mb-5 border-b border-slate-100">
              <div className="w-8 h-8 rounded-full bg-orange-100 text-[#0b132b] font-black flex items-center justify-center text-sm">
                2
              </div>
              <div>
                <h2 id="shipping-service-heading" className="text-lg font-bold text-slate-900">
                  Shipping Method
                </h2>
                <p className="text-xs text-slate-600">Governed delivery services for {countryPolicy.name}</p>
              </div>
            </div>

            {quoteLoading ? (
              <div className="p-6 text-center bg-slate-50 rounded-xl border border-slate-200">
                <Loader2 className="w-6 h-6 text-[#ff8a00] animate-spin mx-auto mb-2" />
                <p className="text-xs text-slate-600 font-semibold">Updating authoritative shipping options...</p>
              </div>
            ) : !quote ? (
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-600">
                Enter your delivery address above to compute available shipping methods and exact rates.
              </div>
            ) : quote.shipping.availableOptions.length === 0 ? (
              <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-semibold flex items-center gap-2">
                <AlertCircle size={16} className="shrink-0" />
                <span>No governed shipping route available for this destination. Order placement is unavailable.</span>
              </div>
            ) : (
              <fieldset className="space-y-3" role="radiogroup" aria-label="Shipping method options">
                <legend className="sr-only">Available Shipping Options</legend>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {quote.shipping.availableOptions.map((opt) => {
                    const isSelected = (quote.shipping.selectedOption?.serviceLevel || shippingServiceLevel) === opt.serviceLevel;
                    return (
                      <label
                        key={opt.serviceLevel}
                        htmlFor={`shipping-option-${opt.serviceLevel}`}
                        className={`flex items-start gap-3.5 p-4 rounded-xl border cursor-pointer transition focus-within:ring-2 focus-within:ring-[#ff8a00] ${
                          isSelected
                            ? 'border-[#ff8a00] bg-orange-50/40 ring-2 ring-orange-200'
                            : 'border-slate-200 hover:border-slate-300 bg-white'
                        }`}
                      >
                        <input
                          type="radio"
                          id={`shipping-option-${opt.serviceLevel}`}
                          name="shippingServiceLevel"
                          value={opt.serviceLevel}
                          checked={isSelected}
                          onChange={() => handleShippingSelect(opt.serviceLevel)}
                          disabled={quoteLoading}
                          className="mt-1 w-4 h-4 text-[#ff8a00] border-slate-300 focus:ring-[#ff8a00]"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <span className="text-sm font-bold text-slate-900">
                              {opt.displayName || `${opt.serviceLevel.toUpperCase()} Delivery`}
                            </span>
                            <span className="text-sm font-black text-[#0b132b]">
                              {formatExactMoney(opt.amountExact)}
                            </span>
                          </div>

                          {/* Delivery Promise Display */}
                          {opt.deliveryPromise?.promiseText ? (
                            <p className="text-xs text-slate-600 mt-1 flex items-center gap-1">
                              <Clock size={12} className="text-[#ff8a00] shrink-0" /> {opt.deliveryPromise.promiseText}
                            </p>
                          ) : opt.deliveryPromise?.minDeliveryDate && opt.deliveryPromise?.maxDeliveryDate ? (
                            <p className="text-xs text-slate-600 mt-1 flex items-center gap-1">
                              <Clock size={12} className="text-[#ff8a00] shrink-0" /> Delivery: {opt.deliveryPromise.minDeliveryDate} – {opt.deliveryPromise.maxDeliveryDate}
                            </p>
                          ) : opt.deliveryEstimate ? (
                            <p className="text-xs text-slate-600 mt-1 flex items-center gap-1">
                              <Clock size={12} className="text-[#ff8a00] shrink-0" /> {opt.deliveryEstimate.minDays} – {opt.deliveryEstimate.maxDays} business days
                            </p>
                          ) : null}

                          {opt.deliveryPromise?.isRemote && (
                            <span className="inline-block text-[10px] font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded mt-1.5">
                              Remote Area
                            </span>
                          )}
                        </div>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            )}
          </section>

          {/* Step 3: Payment Method Discovery (Policy-Backed & Governed) */}
          <section className="bg-white p-6 sm:p-7 rounded-2xl border border-slate-200 shadow-xs" aria-labelledby="payment-heading">
            <div className="flex items-center gap-3 pb-4 mb-5 border-b border-slate-100">
              <div className="w-8 h-8 rounded-full bg-orange-100 text-[#0b132b] font-black flex items-center justify-center text-sm">
                3
              </div>
              <div>
                <h2 id="payment-heading" className="text-lg font-bold text-slate-900">
                  Payment Method
                </h2>
                <p className="text-xs text-slate-600">Select an eligible payment provider for {countryPolicy.name}</p>
              </div>
            </div>

            {/* International Prepaid Requirement Notice */}
            {isCrossBorderRoute && (
              <div className="mb-4 p-3.5 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-900 font-semibold flex items-center gap-2.5">
                <Shield size={16} className="text-blue-700 shrink-0" />
                <span>Prepaid payment required for this destination. Cash on Delivery is not supported for cross-border routes.</span>
              </div>
            )}

            {availableMethods.length === 0 ? (
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 font-semibold flex items-center gap-2">
                <AlertCircle size={16} />
                <span>No eligible payment methods found for this destination and currency.</span>
              </div>
            ) : (
              <div className="space-y-3" role="radiogroup" aria-label="Payment method">
                {availableMethods.map((m) => (
                  <label
                    key={m.code}
                    className={`flex items-start gap-3.5 p-4 rounded-xl border cursor-pointer transition focus-within:ring-2 focus-within:ring-[#ff8a00] ${
                      paymentMethod === m.code
                        ? 'border-[#ff8a00] bg-orange-50/40 ring-2 ring-orange-200'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <input
                      type="radio"
                      name="paymentMethod"
                      value={m.code}
                      checked={paymentMethod === m.code}
                      onChange={() => setPaymentMethod(m.code)}
                      className="mt-1 w-4 h-4 text-[#ff8a00] border-slate-300 focus:ring-[#ff8a00]"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        {m.code === 'cod' && <Truck size={17} className="text-[#0b132b]" />}
                        {m.code === 'bank_transfer' && <Building2 size={17} className="text-[#0b132b]" />}
                        {m.code === 'raast' && <PhoneCall size={17} className="text-[#0b132b]" />}
                        {m.code === 'stripe' && <CreditCard size={17} className="text-[#0b132b]" />}
                        <span className="text-sm font-bold text-slate-900">{m.displayName}</span>
                        {m.code === 'cod' && (
                          <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded">
                            Domestic Only
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-600 mt-1">
                        {m.code === 'cod' && 'Pay with physical cash to the courier upon delivery at your doorstep.'}
                        {m.code === 'bank_transfer' && 'Direct wire or local bank transfer to merchant account.'}
                        {m.code === 'raast' && 'Instant zero-fee account transfer via State Bank Raast ID.'}
                        {m.code === 'stripe' && 'Secure international card processing via encrypted checkout.'}
                      </p>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </section>

          {/* Terms & Place Order */}
          <div className="p-4 bg-white rounded-2xl border border-slate-200 space-y-4">
            <label className="flex items-start gap-3 text-xs text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                id="agreeTerms"
                checked={agreeTerms}
                onChange={(e) => setAgreeTerms(e.target.checked)}
                aria-invalid={Boolean(errors.terms)}
                aria-describedby={errors.terms ? 'terms-error' : undefined}
                className="mt-0.5 w-4 h-4 text-[#ff8a00] border-slate-300 rounded focus:ring-[#ff8a00]"
              />
              <span>
                I agree to the Storefront Terms of Service, Return Policy, and Authoritative Quote Pricing terms.
              </span>
            </label>

            {errors.terms && (
              <p id="terms-error" role="alert" className="text-xs text-rose-700 font-semibold">{errors.terms}</p>
            )}

            {quoteError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-semibold flex items-center gap-2">
                <AlertCircle size={15} className="shrink-0" />
                <span>{quoteError}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={
                loading ||
                quoteLoading ||
                quoteStatus !== 'valid' ||
                availableItems.length === 0 ||
                !quote ||
                !quote.quoteToken ||
                isQuoteExpired ||
                !paymentMethod ||
                Boolean(materialChangeNotice)
              }
              className="w-full flex min-h-[50px] items-center justify-center gap-2 rounded-xl bg-[#ff8a00] hover:bg-[#ffab45] text-[#0b132b] font-black text-base shadow-sm transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {loading ? (
                <>
                  <Loader2 size={18} className="animate-spin" /> Authorizing Order...
                </>
              ) : quoteLoading ? (
                <>
                  <Loader2 size={18} className="animate-spin" /> Updating Quote...
                </>
              ) : (
                <>
                  Place Order ({quote ? formatExactMoney(quote.totals.grandTotalExact) : '—'}) <ArrowRight size={18} />
                </>
              )}
            </button>
          </div>
        </form>

        {/* Right Sidebar: Order Summary & Authoritative Landed Cost Breakdown */}
        <aside className="space-y-6" aria-label="Order summary sidebar">
          {/* Items Preview */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
            <h2 className="text-base font-extrabold text-slate-900 mb-4 pb-3 border-b border-slate-100">
              Items in Order ({availableItems.reduce((c, i) => c + i.quantity, 0)})
            </h2>

            <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
              {availableItems.map((item) => {
                const quoteItem = quote?.items?.find((qi) => qi.productId === (item.productId || item.id));
                return (
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
                      {quoteItem?.lineTotalExact
                        ? formatExactMoney(quoteItem.lineTotalExact)
                        : `${quote?.currency || marketConfig?.defaultCurrency || marketConfig?.baseCurrency || ''} ${(item.price * item.quantity).toLocaleString()}`}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Promo Code Section */}
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
                    Discount Applied
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

          {/* Authoritative Quote Breakdown Box */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-3.5 text-sm">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h2 className="font-extrabold text-slate-900">
                Authoritative Quote
              </h2>
              {quoteLoading ? (
                <span className="inline-flex items-center gap-1 text-[11px] text-amber-700 font-bold bg-amber-50 px-2 py-0.5 rounded">
                  <Loader2 size={11} className="animate-spin" /> Calculating...
                </span>
              ) : quote ? (
                <span className="inline-flex items-center gap-1 text-[11px] text-emerald-800 font-bold bg-emerald-50 px-2 py-0.5 rounded">
                  <CheckCircle2 size={11} /> {quote.quoteId}
                </span>
              ) : (
                <span className="text-[11px] text-slate-500 font-medium">Pending address</span>
              )}
            </div>

            {quote ? (
              <>
                <div className="flex justify-between text-slate-700">
                  <span>Items Subtotal</span>
                  <span className="font-bold text-slate-900">
                    {formatExactMoney(quote.totals.subtotalExact)}
                  </span>
                </div>

                {quote.coupon && (
                  <div className="flex justify-between text-emerald-700 font-semibold">
                    <span>Coupon ({quote.coupon.code})</span>
                    <span>-{formatExactMoney(quote.totals.discountExact)}</span>
                  </div>
                )}

                <div className="flex justify-between text-slate-700">
                  <span>
                    Shipping ({quote.shipping.selectedOption.displayName || quote.shipping.selectedOption.serviceLevel.toUpperCase()})
                  </span>
                  <span className="font-bold text-slate-900">
                    {quote.shipping.selectedOption.freeShippingApplied
                      ? 'FREE'
                      : formatExactMoney(quote.totals.shippingExact)}
                  </span>
                </div>

                {/* Tax Breakdown */}
                <div className="flex justify-between text-slate-700">
                  <span>
                    Taxes ({quote.taxesAndDuties.taxType}{' '}
                    {quote.taxesAndDuties.taxRatePercent > 0 ? `${quote.taxesAndDuties.taxRatePercent}%` : ''})
                  </span>
                  <span className="font-bold text-slate-900">
                    {formatExactMoney(quote.totals.taxExact)}
                  </span>
                </div>

                {/* Customs Duties Breakdown */}
                {quote.taxesAndDuties.dutyRatePercent > 0 || quote.totals.duties > 0 ? (
                  <div className="flex justify-between text-slate-700">
                    <span>
                      Import Duties ({quote.taxesAndDuties.dutyRatePercent}% · {quote.taxesAndDuties.incoterm})
                    </span>
                    <span className="font-bold text-slate-900">
                      {formatExactMoney(quote.totals.dutiesExact)}
                    </span>
                  </div>
                ) : null}

                {/* Incoterm Notice */}
                <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-[11px] text-slate-600 leading-normal">
                  <span className="font-bold text-slate-800">Incoterm {quote.taxesAndDuties.incoterm}: </span>
                  {quote.taxesAndDuties.incoterm === 'DDP'
                    ? 'All import taxes and customs duties are fully prepaid.'
                    : quote.taxesAndDuties.incoterm === 'DAP'
                    ? 'Customs duties and import taxes may be collected upon delivery by courier.'
                    : 'Standard domestic delivery terms.'}
                </div>

                {/* Delivery Promise & Dispatch Timeline */}
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1 text-xs">
                  {quote.shipping.deliveryPromise?.dispatchDate ? (
                    <div className="flex items-center gap-1.5 text-slate-700">
                      <Clock size={12} className="text-[#ff8a00] shrink-0" />
                      <span>Dispatch by: <strong className="font-bold text-slate-900">{quote.shipping.deliveryPromise.dispatchDate}</strong></span>
                    </div>
                  ) : quote.shipping.deliveryPromise?.dispatchMinDate && quote.shipping.deliveryPromise?.dispatchMaxDate ? (
                    <div className="flex items-center gap-1.5 text-slate-700">
                      <Clock size={12} className="text-[#ff8a00] shrink-0" />
                      <span>Dispatch: {quote.shipping.deliveryPromise.dispatchMinDate} – {quote.shipping.deliveryPromise.dispatchMaxDate}</span>
                    </div>
                  ) : null}

                  {quote.shipping.deliveryPromise?.promiseText ? (
                    <div className="flex items-center gap-1.5 text-slate-700 font-medium">
                      <Truck size={12} className="text-[#ff8a00] shrink-0" />
                      <span>{quote.shipping.deliveryPromise.promiseText}</span>
                    </div>
                  ) : quote.shipping.selectedOption.deliveryEstimate ? (
                    <div className="flex items-center gap-1.5 text-slate-700">
                      <Truck size={12} className="text-[#ff8a00] shrink-0" />
                      <span>Estimated: {quote.shipping.selectedOption.deliveryEstimate.minDays} – {quote.shipping.selectedOption.deliveryEstimate.maxDays} business days</span>
                    </div>
                  ) : null}

                  {(quote.shipping.selectedOption.isRemote || quote.shipping.deliveryPromise?.isRemote) && (
                    <div className="mt-1 text-[11px] font-bold text-amber-800">
                      Remote area delivery notice applied.
                    </div>
                  )}
                </div>

                {/* Split Shipment Groups Breakdown (When > 1 Package) */}
                {quote.shipping.shipmentGroups && quote.shipping.shipmentGroups.length > 1 && (
                  <div className="pt-2 border-t border-slate-200 space-y-2">
                    <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                      <Package size={13} className="text-[#ff8a00]" /> Split Fulfillment ({quote.shipping.shipmentGroups.length} Packages)
                    </h3>
                    <div className="space-y-2">
                      {quote.shipping.shipmentGroups.map((grp, idx) => (
                        <div key={grp.groupId || idx} className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-1">
                          <div className="flex justify-between items-center font-bold text-slate-900">
                            <span>Package {idx + 1} ({grp.originCountry || grp.locationCode || 'Fulfillment Center'})</span>
                            <span>{formatExactMoney(grp.shippingAmountExact)}</span>
                          </div>
                          <p className="text-[11px] text-slate-600">
                            Service: <span className="font-semibold text-slate-800">{grp.serviceLevel.toUpperCase()}</span>
                          </p>
                          {grp.items && grp.items.length > 0 && (
                            <p className="text-[11px] text-slate-500">
                              Items: {grp.items.map((i) => `${i.name || i.productId} (×${i.quantity})`).join(', ')}
                            </p>
                          )}
                          {(grp.deliveryPromise?.promiseText || grp.deliveryEstimate) && (
                            <p className="text-[11px] text-slate-600 flex items-center gap-1">
                              <Clock size={10} className="text-slate-400" />
                              {grp.deliveryPromise?.promiseText || `${grp.deliveryEstimate?.minDays}–${grp.deliveryEstimate?.maxDays} days`}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Grand Total */}
                <div className="pt-3 border-t border-slate-200 flex justify-between items-baseline">
                  <span className="text-base font-extrabold text-slate-900">Total Payable</span>
                  <span className="text-2xl font-black text-[#0b132b]">
                    {formatExactMoney(quote.totals.grandTotalExact)}
                  </span>
                </div>
              </>
            ) : (
              <div className="py-6 text-center text-xs text-slate-500 space-y-2">
                <Truck size={24} className="mx-auto text-slate-300" />
                <p>Provide your delivery address to compute exact shipping rates, taxes, and duties.</p>
              </div>
            )}

            <div className="pt-3 border-t border-slate-100 flex items-center justify-center gap-2 text-xs text-slate-700 font-semibold">
              <Shield size={15} className="text-emerald-700" />
              <span>Signed Authoritative Quote & Idempotent Submission</span>
            </div>
          </div>
        </aside>
      </div>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}

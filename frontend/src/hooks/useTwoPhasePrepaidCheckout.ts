'use client';

/**
 * useTwoPhasePrepaidCheckout Hook
 * Phase 6D-5B Batch 4: Storefront Two-Phase Prepaid Checkout Coordinator
 *
 * Responsibilities:
 * 1. Coordinates the two-phase prepaid checkout lifecycle for international/card orders.
 * 2. Enforces Web Locks mutual exclusion during attempt derivation and backend session creation.
 * 3. Prevents duplicate POSTs: re-opens recovery mode if an active session already exists in store.
 * 4. Strictly preserves auth hydration safety: halts store access until auth initialization is conclusive.
 * 5. Maintains clientSecret strictly in React component memory (zero storage/URL persistence).
 * 6. Executes conversion side-effects (cart clearing, attempt completion, navigation) with an exactly-once guard.
 * 7. Leaves Pakistan COD execution completely to the legacy checkout branch.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import type { useRouter } from 'next/navigation';
import type {
  AuthoritativeQuote,
  CheckoutSessionMoney,
  CheckoutSessionStatus,
  CreateCheckoutSessionRequest,
} from '../types/commerce.ts';
import {
  computeHashedUserScope,
  getOrCreateCheckoutAttempt,
  getCheckoutAttempt,
  updateCheckoutAttemptSession,
  withCheckoutLock,
  isCheckoutRecoveryStorageError,
  isCheckoutAttemptActiveIntentConflictError,
  isCheckoutAttemptNonTerminalRotationError,
  type CheckoutIntentInput,
  AUTHORITATIVE_TERMINAL_STATUSES,
} from '../lib/checkoutAttemptStore.ts';
import {
  createCheckoutSession,
  isCheckoutSessionResponseInvalidError,
  type CheckoutApiError,
} from '../lib/checkoutSessionService.ts';
import { scrubStripeUrlParams } from '../lib/prepaidCheckoutPolling.ts';
import type { PrepaidPaymentModalProps } from '../components/checkout/PrepaidPaymentModal.tsx';

export interface CartItemLike {
  productId?: string;
  id?: string;
  variantId?: string | null;
  name?: string;
  price: number;
  quantity: number;
  image?: string;
}

export interface ShippingAddressLike {
  fullName?: string;
  phone?: string;
  address: string;
  addressLine2?: string;
  city: string;
  province?: string;
  postalCode?: string;
  country?: string;
  countryCode?: string;
}

export interface UserLike {
  _id?: string;
  id?: string;
  fullName?: string;
  email?: string;
}

export interface UseTwoPhasePrepaidCheckoutOptions {
  user: UserLike | null;
  isAuthenticated: boolean;
  isInitialized: boolean;
  clearCart: () => void;
  router: ReturnType<typeof useRouter>;
  onQuoteRefreshRequired: () => Promise<void> | void;
  setToast: (toast: { message: string; type: 'success' | 'error' | 'info' }) => void;
}

export interface InitiatePrepaidCheckoutParams {
  availableItems: CartItemLike[];
  resolvedAddressData: ShippingAddressLike;
  paymentMethod: string;
  shippingServiceLevel?: string;
  appliedCoupon?: { code: string } | null;
  quote: AuthoritativeQuote;
  customerNote?: string;
}

export interface RouteCheckoutSubmissionParams {
  paymentMethod: string;
  isDomestic: boolean;
  destinationCountry: string;
  homeCountry: string;
  initiatePrepaidCheckout: () => Promise<void>;
  executeCodCheckout: () => Promise<void>;
  onBlockedMethod: (reason: string) => void;
}

export function normalizePrepaidPaymentMethod(method: string): string {
  const trimmed = String(method || '').trim().toLowerCase();
  if (trimmed === 'card') return 'stripe';
  return trimmed || 'stripe';
}

export async function routeCheckoutSubmission(
  params: RouteCheckoutSubmissionParams
): Promise<'prepaid' | 'cod' | 'blocked'> {
  const {
    paymentMethod,
    isDomestic,
    destinationCountry,
    homeCountry,
    initiatePrepaidCheckout,
    executeCodCheckout,
    onBlockedMethod,
  } = params;

  if (paymentMethod === 'cod') {
    const isHome = destinationCountry.trim().toUpperCase() === homeCountry.trim().toUpperCase();
    if (!isDomestic || !isHome) {
      onBlockedMethod('Cash on Delivery is only available for domestic orders in Pakistan.');
      return 'blocked';
    }
    await executeCodCheckout();
    return 'cod';
  }

  await initiatePrepaidCheckout();
  return 'prepaid';
}

export interface UseTwoPhasePrepaidCheckoutResult {
  isSubmitting: boolean;
  initiatePrepaidCheckout: (params: InitiatePrepaidCheckoutParams) => Promise<void>;
  modalProps: PrepaidPaymentModalProps;
}

export function useTwoPhasePrepaidCheckout(
  options: UseTwoPhasePrepaidCheckoutOptions
): UseTwoPhasePrepaidCheckoutResult {
  const {
    user,
    isAuthenticated,
    isInitialized,
    clearCart,
    router,
    onQuoteRefreshRequired,
    setToast,
  } = options;

  const [isSubmitting, setIsSubmitting] = useState(false);

  // Modal State & Memory-Only Secret
  const [modalIsOpen, setModalIsOpen] = useState(false);
  const [modalSessionId, setModalSessionId] = useState('');
  const [modalClientSecret, setModalClientSecret] = useState<string | null>(null);
  const [modalAmountExact, setModalAmountExact] = useState<CheckoutSessionMoney | undefined>(undefined);
  const [modalCurrency, setModalCurrency] = useState('USD');
  const [modalLeaseExpiresAt, setModalLeaseExpiresAt] = useState<string | null>(null);
  const [modalExpectedFingerprint, setModalExpectedFingerprint] = useState<string | undefined>(undefined);
  const [modalExpectedGeneration, setModalExpectedGeneration] = useState<number | undefined>(undefined);
  const [hasSubmittedPayment, setHasSubmittedPayment] = useState(false);

  // Session-scoped exactly-once guard for conversion side-effects
  const convertedHandledSessionIdRef = useRef<string | null>(null);
  const submittingRef = useRef<boolean>(false);
  const hasScrubbedUrlRef = useRef<boolean>(false);

  // Clear memory-only secret on unmount
  useEffect(() => {
    return () => {
      setModalClientSecret(null);
    };
  }, []);

  // Derive auth-guarded modal state
  const isAuthValid = Boolean(isAuthenticated && user);
  const effectiveModalIsOpen = isAuthValid && modalIsOpen;
  const effectiveClientSecret = isAuthValid ? modalClientSecret : null;
  const effectiveSessionId = isAuthValid ? modalSessionId : '';

  // Mount Recovery: Scrub URL parameters & check for active attempt once auth is hydrated
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // 1. Scrub Stripe parameters at earliest client boundary
    if (!hasScrubbedUrlRef.current) {
      hasScrubbedUrlRef.current = true;
      scrubStripeUrlParams();
    }

    // 2. Wait until authentication hydration is complete
    if (!isInitialized || !isAuthenticated || !user) {
      return;
    }

    const userId = String(user._id || user.id || '');
    if (!userId) return;

    let isMounted = true;

    async function checkMountRecovery() {
      try {
        const hashedScope = await computeHashedUserScope(userId);
        const activeAttempt = getCheckoutAttempt(hashedScope);

        if (!activeAttempt || !activeAttempt.sessionId || !isMounted) {
          return;
        }

        // If active attempt is already converted, redirect immediately
        if (activeAttempt.status === 'converted' && activeAttempt.convertedOrderDisplayId) {
          if (convertedHandledSessionIdRef.current !== activeAttempt.sessionId) {
            convertedHandledSessionIdRef.current = activeAttempt.sessionId;
            clearCart();
            router.push(`/order-success?orderId=${encodeURIComponent(activeAttempt.convertedOrderDisplayId)}`);
          }
          return;
        }

        // If active attempt is non-terminal, reopen modal in secretless recovery mode (zero POST)
        const isTerminal = (AUTHORITATIVE_TERMINAL_STATUSES as readonly string[]).includes(
          activeAttempt.status
        );

        if (!isTerminal) {
          setModalSessionId(activeAttempt.sessionId);
          setModalClientSecret(null); // Memory secret is not available on reload; enters recovery GET polling
          setModalLeaseExpiresAt(activeAttempt.leaseExpiresAt || null);
          setModalExpectedFingerprint(activeAttempt.baseFingerprint);
          setModalExpectedGeneration(activeAttempt.generation);
          setHasSubmittedPayment(Boolean(activeAttempt.paymentSubmittedAt));
          setModalIsOpen(true);
        }
      } catch {
        // Storage / recovery errors fail closed safely
      }
    }

    void checkMountRecovery();

    return () => {
      isMounted = false;
    };
  }, [isInitialized, isAuthenticated, user, clearCart, router]);

  // Handle authoritative conversion from usePrepaidCheckoutSession
  const handleConverted = useCallback(
    (convertedOrderDisplayId: string) => {
      if (!convertedOrderDisplayId) return;
      if (convertedHandledSessionIdRef.current === modalSessionId) return;
      convertedHandledSessionIdRef.current = modalSessionId;

      // 1. Invalidate memory-only secret
      setModalClientSecret(null);

      // 2. Close modal
      setModalIsOpen(false);

      // 3. Clear cart exactly once
      clearCart();

      // 4. Navigate to order success exactly once
      router.push(`/order-success?orderId=${encodeURIComponent(convertedOrderDisplayId)}`);
    },
    [modalSessionId, clearCart, router]
  );

  // Handle terminal session status from modal
  const handleTerminalState = useCallback(
    (status: CheckoutSessionStatus) => {
      // Clear in-memory secret on any terminal outcome
      setModalClientSecret(null);

      if (status === 'expired') {
        setToast({
          message: 'Your checkout hold has expired. Please refresh your quote to continue.',
          type: 'info',
        });
        void onQuoteRefreshRequired();
      } else if (status === 'failed') {
        setToast({
          message: 'Payment authorization failed. You can retry with another payment method.',
          type: 'error',
        });
      } else if (status === 'cancelled') {
        setToast({
          message: 'Checkout session was cancelled.',
          type: 'info',
        });
      } else if (status === 'conflict') {
        setToast({
          message: 'A payment reconciliation conflict was detected. Please contact customer support.',
          type: 'error',
        });
      }
    },
    [onQuoteRefreshRequired, setToast]
  );

  const handleCloseModal = useCallback(() => {
    setModalIsOpen(false);
  }, []);

  const handleQuoteRefreshRequired = useCallback(() => {
    setModalIsOpen(false);
    setModalClientSecret(null);
    void onQuoteRefreshRequired();
  }, [onQuoteRefreshRequired]);

  // Initiate fresh two-phase prepaid checkout session
  const initiatePrepaidCheckout = useCallback(
    async (params: InitiatePrepaidCheckoutParams) => {
      const {
        availableItems,
        resolvedAddressData,
        paymentMethod,
        shippingServiceLevel,
        appliedCoupon,
        quote,
        customerNote,
      } = params;

      if (submittingRef.current) return;

      if (!isAuthenticated || !user) {
        setToast({
          message: 'Please sign in to proceed with secure prepaid checkout.',
          type: 'error',
        });
        return;
      }

      const userId = String(user._id || user.id || '');
      if (!userId) {
        setToast({
          message: 'Authenticated user identity is required for checkout.',
          type: 'error',
        });
        return;
      }

      if (!quote || !quote.quoteToken) {
        setToast({
          message: 'A valid authoritative checkout quote is required. Please check your address.',
          type: 'error',
        });
        return;
      }

      // Check if quote expired before POST
      if (new Date(quote.expiresAt).getTime() <= Date.now()) {
        setToast({
          message: 'Your checkout quote has expired. Refreshing quote...',
          type: 'info',
        });
        await onQuoteRefreshRequired();
        return;
      }

      try {
        submittingRef.current = true;
        setIsSubmitting(true);

        const hashedUserScope = await computeHashedUserScope(userId);
        const normalizedPaymentMethod = normalizePrepaidPaymentMethod(paymentMethod);

        const intentInput: CheckoutIntentInput = {
          quoteId: quote.quoteId,
          items: availableItems.map((item) => ({
            productId: item.productId || item.id,
            variantId: item.variantId || null,
            quantity: item.quantity,
          })),
          shippingAddress: {
            fullName: resolvedAddressData.fullName,
            phone: resolvedAddressData.phone,
            address: resolvedAddressData.address,
            addressLine2: resolvedAddressData.addressLine2,
            city: resolvedAddressData.city,
            province: resolvedAddressData.province,
            postalCode: resolvedAddressData.postalCode,
            country: resolvedAddressData.country,
            countryCode: resolvedAddressData.countryCode,
          },
          paymentMethod: normalizedPaymentMethod,
          currency: quote.currency,
          shippingServiceLevel: shippingServiceLevel || 'standard',
          shippingAdapter: (quote.shipping?.selectedOption as { adapter?: string })?.adapter || null,
          couponCode: appliedCoupon?.code || null,
          quoteConfigVersionId: quote.configVersionId || null,
          quoteIncoterm: quote.taxesAndDuties?.incoterm || null,
          quoteItemsHash: quote.itemsHash || null,
        };

        // Execute under Web Lock mutual exclusion across tabs
        await withCheckoutLock(hashedUserScope, async () => {
          // 1. Get or create deterministic attempt (persists 'creating' in store before network POST)
          const attempt = await getOrCreateCheckoutAttempt(intentInput, { userScope: userId });

          // 2. If attempt already has a valid sessionId, DO NOT issue another POST. Open recovery mode!
          if (attempt.sessionId) {
            const isTerminal = (AUTHORITATIVE_TERMINAL_STATUSES as readonly string[]).includes(
              attempt.status
            );
            if (!isTerminal) {
              setModalSessionId(attempt.sessionId);
              setModalClientSecret(null); // No secret stored; recovery mode polls authoritative GET
              setModalAmountExact(
                quote.totals.grandTotalExact
                  ? {
                      amountMinor: String(quote.totals.grandTotalExact.amountMinor),
                      currency: quote.totals.grandTotalExact.currency,
                      exponent: quote.totals.grandTotalExact.exponent ?? 2,
                      registrySnapshot: 'iso4217:2015',
                    }
                  : undefined
              );
              setModalCurrency(quote.currency || 'USD');
              setModalLeaseExpiresAt(attempt.leaseExpiresAt || null);
              setModalExpectedFingerprint(attempt.baseFingerprint);
              setModalExpectedGeneration(attempt.generation);
              setHasSubmittedPayment(Boolean(attempt.paymentSubmittedAt));
              setModalIsOpen(true);
              return;
            }
          }

          // 3. Strict Request Payload matching backend createCheckoutSessionSchema
          const requestPayload: CreateCheckoutSessionRequest = {
            items: availableItems.map((item) => ({
              productId: String(item.productId || item.id),
              variantId: item.variantId ? String(item.variantId) : null,
              quantity: Number(item.quantity),
            })),
            shippingAddress: {
              fullName: resolvedAddressData.fullName || '',
              phone: resolvedAddressData.phone || '',
              address: resolvedAddressData.address || '',
              addressLine2: resolvedAddressData.addressLine2 || undefined,
              city: resolvedAddressData.city || '',
              province: resolvedAddressData.province || undefined,
              postalCode: resolvedAddressData.postalCode || undefined,
              country: resolvedAddressData.country || undefined,
              countryCode: resolvedAddressData.countryCode || undefined,
            },
            paymentMethod: normalizedPaymentMethod,
            quoteToken: quote.quoteToken,
            currency: quote.currency,
            couponCode: appliedCoupon?.code || undefined,
            shippingServiceLevel: shippingServiceLevel || 'standard',
            shippingAdapter: (quote.shipping?.selectedOption as { adapter?: string })?.adapter || undefined,
            customerNote: customerNote?.trim() || undefined,
          };

          // 4. Call authoritative createCheckoutSession with persisted Idempotency-Key
          const response = await createCheckoutSession(requestPayload, attempt.idempotencyKey);
          const session = response.session;
          const clientSecret = response.paymentAttempt?.clientSecret || null;

          // 5. Update attempt in storage with session references
          updateCheckoutAttemptSession(hashedUserScope, {
            sessionId: session.sessionId,
            leaseExpiresAt: session.leaseExpiresAt || undefined,
            status: session.status,
            expectedFingerprint: attempt.baseFingerprint,
            expectedGeneration: attempt.generation,
            expectedIdempotencyKey: attempt.idempotencyKey,
          });

          // 6. Open modal with memory-only secret
          setModalSessionId(session.sessionId);
          setModalClientSecret(clientSecret);
          setModalAmountExact(session.amounts.totalAmountExact);
          setModalCurrency(session.currency);
          setModalLeaseExpiresAt(session.leaseExpiresAt || null);
          setModalExpectedFingerprint(attempt.baseFingerprint);
          setModalExpectedGeneration(attempt.generation);
          setHasSubmittedPayment(false);
          setModalIsOpen(true);
        });
      } catch (err: unknown) {
        if (isCheckoutRecoveryStorageError(err)) {
          setToast({
            message: 'Browser storage is unavailable. Please enable cookies/storage to proceed with checkout.',
            type: 'error',
          });
          return;
        }

        if (isCheckoutAttemptActiveIntentConflictError(err)) {
          setToast({
            message: 'An active checkout session already exists for your account. Please complete or cancel it.',
            type: 'error',
          });
          if (err.existingSessionId) {
            setModalSessionId(err.existingSessionId);
            setModalClientSecret(null);
            setModalExpectedFingerprint(undefined);
            setModalIsOpen(true);
          }
          return;
        }

        if (isCheckoutAttemptNonTerminalRotationError(err)) {
          setToast({
            message: 'Your in-progress checkout session is still active. Please complete payment.',
            type: 'error',
          });
          return;
        }

        if (isCheckoutSessionResponseInvalidError(err)) {
          setToast({
            message: 'Received invalid response from payment service. Your cart has been preserved.',
            type: 'error',
          });
          return;
        }

        const apiErr = err as CheckoutApiError;
        const statusCode = apiErr.status;
        const errorCode = apiErr.code;

        if (statusCode === 503 || errorCode === 'TWO_PHASE_CHECKOUT_DISABLED') {
          setToast({
            message: 'Prepaid checkout is temporarily unavailable. Please try again later.',
            type: 'error',
          });
          return;
        }

        if (statusCode === 409 || errorCode === 'IDEMPOTENCY_CONFLICT') {
          setToast({
            message: 'A conflicting checkout session was detected. Reopening existing session...',
            type: 'info',
          });
          try {
            const hashedScope = await computeHashedUserScope(userId);
            const existingAttempt = getCheckoutAttempt(hashedScope);
            if (existingAttempt?.sessionId) {
              setModalSessionId(existingAttempt.sessionId);
              setModalClientSecret(null);
              setModalLeaseExpiresAt(existingAttempt.leaseExpiresAt || null);
              setModalExpectedFingerprint(existingAttempt.baseFingerprint);
              setModalExpectedGeneration(existingAttempt.generation);
              setModalIsOpen(true);
              return;
            }
          } catch {
            // Ignore recovery error
          }
          return;
        }

        if (statusCode === 401 || errorCode === 'AUTHENTICATION_REQUIRED') {
          setToast({
            message: 'Your session has expired. Please sign in again to complete checkout.',
            type: 'error',
          });
          return;
        }

        if (statusCode === 404 || errorCode === 'SESSION_NOT_FOUND') {
          setToast({
            message: 'Checkout session expired or not found. Please refresh your quote to start a new checkout.',
            type: 'error',
          });
          return;
        }

        if (errorCode === 'QUOTE_EXPIRED' || errorCode === 'QUOTE_TAMPERED') {
          setToast({
            message: 'Checkout quote expired or invalidated. Refreshing quote...',
            type: 'info',
          });
          await onQuoteRefreshRequired();
          return;
        }

        const msg = apiErr instanceof Error ? apiErr.message : 'Unable to authorize checkout session. Please try again.';
        setToast({
          message: msg,
          type: 'error',
        });
      } finally {
        submittingRef.current = false;
        setIsSubmitting(false);
      }
    },
    [isAuthenticated, user, onQuoteRefreshRequired, setToast]
  );

  const modalProps: PrepaidPaymentModalProps = {
    isOpen: effectiveModalIsOpen,
    onClose: handleCloseModal,
    sessionId: effectiveSessionId,
    clientSecret: effectiveClientSecret,
    amountExact: modalAmountExact,
    currency: modalCurrency,
    leaseExpiresAt: modalLeaseExpiresAt,
    userScope: user ? String(user._id || user.id || '') : undefined,
    expectedFingerprint: modalExpectedFingerprint,
    expectedGeneration: modalExpectedGeneration,
    hasSubmittedPayment,
    onConverted: handleConverted,
    onTerminalState: handleTerminalState,
    onQuoteRefreshRequired: handleQuoteRefreshRequired,
  };

  return {
    isSubmitting,
    initiatePrepaidCheckout,
    modalProps,
  };
}

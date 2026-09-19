'use client';

/**
 * usePrepaidCheckoutSession React Hook
 * Phase 6D-5B Batch 3: Prepaid Payment & Conversion Polling Orchestration
 *
 * Coordinates:
 * 1. Framework-independent polling controller lifecycle
 * 2. Real-time UX countdown timer for lease display without claiming premature local expiry
 * 3. Atomic one-time onConverted and onTerminalState callbacks
 * 4. Local attempt store state synchronization and monotonic reconciliation
 * 5. Safe cancellation and manual status checks
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import type {
  CheckoutSessionStatus,
  PublicCheckoutSession,
} from '../types/commerce.ts';
import {
  PrepaidCheckoutPollingController,
  type PrepaidCheckoutUiState,
  mapServerStatusToUiState,
  isTerminalSessionStatus,
} from '../lib/prepaidCheckoutPolling.ts';
import { cancelCheckoutSession } from '../lib/checkoutSessionService.ts';
import {
  computeHashedUserScope,
  recordPaymentSubmitted as recordPaymentSubmittedInStore,
  updateCheckoutAttemptSession,
} from '../lib/checkoutAttemptStore.ts';

export interface UsePrepaidCheckoutSessionOptions {
  sessionId: string;
  initialStatus?: CheckoutSessionStatus;
  clientSecret?: string | null;
  leaseExpiresAt?: string | null;
  userScope?: string;
  expectedFingerprint?: string;
  expectedGeneration?: number;
  hasSubmittedPayment?: boolean;
  onConverted?: (convertedOrderDisplayId: string, session: PublicCheckoutSession) => void;
  onTerminalState?: (status: CheckoutSessionStatus, session: PublicCheckoutSession) => void;
  onError?: (error: Error) => void;
  jitterProvider?: () => number;
}

export interface UsePrepaidCheckoutSessionResult {
  uiState: PrepaidCheckoutUiState;
  session: PublicCheckoutSession | null;
  isPolling: boolean;
  isCancelling: boolean;
  isConfirmingPayment: boolean;
  errorMessage: string | null;
  timeRemainingMs: number;
  startPolling: () => void;
  stopPolling: () => void;
  manualRefresh: () => Promise<PublicCheckoutSession | null>;
  cancelSession: (reason?: string) => Promise<boolean>;
  setConfirmingPayment: (confirming: boolean) => void;
  recordPaymentSubmitted: () => Promise<void>;
}

export function usePrepaidCheckoutSession(
  options: UsePrepaidCheckoutSessionOptions
): UsePrepaidCheckoutSessionResult {
  const {
    sessionId,
    initialStatus = 'active',
    leaseExpiresAt = null,
    userScope = 'guest',
    expectedFingerprint,
    expectedGeneration,
    hasSubmittedPayment: initialSubmittedPayment = false,
    onConverted,
    onTerminalState,
    onError,
    jitterProvider,
  } = options;

  const [uiState, setUiState] = useState<PrepaidCheckoutUiState>(() =>
    mapServerStatusToUiState(initialStatus, { hasSubmittedPayment: initialSubmittedPayment })
  );
  const [session, setSession] = useState<PublicCheckoutSession | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isConfirmingPayment, setIsConfirmingPayment] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Time remaining countdown in ms (for UX only)
  const [timeRemainingMs, setTimeRemainingMs] = useState<number>(() => {
    if (!leaseExpiresAt) return 0;
    const diff = new Date(leaseExpiresAt).getTime() - Date.now();
    return Math.max(0, diff);
  });

  const controllerRef = useRef<PrepaidCheckoutPollingController | null>(null);
  const onConvertedRef = useRef(onConverted);
  const onTerminalStateRef = useRef(onTerminalState);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onConvertedRef.current = onConverted;
    onTerminalStateRef.current = onTerminalState;
    onErrorRef.current = onError;
  }, [onConverted, onTerminalState, onError]);

  // Synchronize attempt store when server updates session
  const syncAttemptStore = useCallback(
    async (updatedSession: PublicCheckoutSession) => {
      try {
        const hashedScope = await computeHashedUserScope(userScope);
        updateCheckoutAttemptSession(hashedScope, {
          sessionId: updatedSession.sessionId,
          status: updatedSession.status,
          leaseExpiresAt: updatedSession.leaseExpiresAt || undefined,
          convertedOrderDisplayId: updatedSession.convertedOrderDisplayId,
          expectedFingerprint,
          expectedGeneration,
        });
      } catch {
        // Storage errors fail closed safely without crashing hook
      }
    },
    [userScope, expectedFingerprint, expectedGeneration]
  );

  // Initialize and manage controller
  useEffect(() => {
    const controller = new PrepaidCheckoutPollingController({
      sessionId,
      hasSubmittedPayment: initialSubmittedPayment,
      leaseExpiresAt,
      jitterProvider,
      onStateChange: (nextState, latestSession) => {
        setUiState(nextState);
        if (latestSession) {
          setSession(latestSession);
          void syncAttemptStore(latestSession);
        }
        setIsPolling(controller.getIsRunning());
      },
      onConverted: (convertedOrderDisplayId, convertedSession) => {
        onConvertedRef.current?.(convertedOrderDisplayId, convertedSession);
      },
      onTerminalState: (terminalStatus, terminalSession) => {
        onTerminalStateRef.current?.(terminalStatus, terminalSession);
      },
      onError: (err) => {
        setErrorMessage(err.message || 'Verification error occurred.');
        onErrorRef.current?.(err);
      },
    });

    controllerRef.current = controller;

    // Start polling automatically
    controller.start();

    // Tab visibility handling
    const handleVisibilityChange = () => {
      if (typeof document !== 'undefined') {
        const isVisible = document.visibilityState !== 'hidden';
        controller.setVisibility(isVisible);
      }
    };

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }

    return () => {
      controller.stop();
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
    };
  }, [sessionId, initialSubmittedPayment, leaseExpiresAt, jitterProvider, syncAttemptStore]);

  // UX Countdown Timer
  useEffect(() => {
    if (!leaseExpiresAt) {
      return;
    }

    let intervalId: ReturnType<typeof setInterval> | null = null;

    const tick = () => {
      const remaining = new Date(leaseExpiresAt).getTime() - Date.now();
      if (remaining <= 0) {
        setTimeRemainingMs(0);
        if (intervalId) {
          clearInterval(intervalId);
          intervalId = null;
        }
        // Browser clock hit 0: Do NOT claim expired! Trigger authoritative server check!
        void controllerRef.current?.manualCheck();
      } else {
        setTimeRemainingMs(remaining);
      }
    };

    tick();
    intervalId = setInterval(tick, 1000);

    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [leaseExpiresAt]);

  const startPolling = useCallback(() => {
    controllerRef.current?.start();
    setIsPolling(true);
  }, []);

  const stopPolling = useCallback(() => {
    controllerRef.current?.stop();
    setIsPolling(false);
  }, []);

  const manualRefresh = useCallback(async (): Promise<PublicCheckoutSession | null> => {
    setErrorMessage(null);
    return await controllerRef.current?.manualCheck() ?? null;
  }, []);

  const recordPaymentSubmitted = useCallback(async () => {
    try {
      const hashedScope = await computeHashedUserScope(userScope);
      recordPaymentSubmittedInStore(hashedScope);
    } catch {
      // Storage unavailable fail-closed
    }
    controllerRef.current?.setHasSubmittedPayment(true);
  }, [userScope]);

  const cancelSession = useCallback(
    async (reason = 'USER_CANCELLED'): Promise<boolean> => {
      if (isCancelling) return false;
      setIsCancelling(true);
      setErrorMessage(null);

      const abortController = new AbortController();

      try {
        const resp = await cancelCheckoutSession(sessionId, { reason }, abortController.signal);
        const cancelledSession = resp.session;
        setSession(cancelledSession);
        void syncAttemptStore(cancelledSession);

        const mappedState = mapServerStatusToUiState(cancelledSession.status);
        setUiState(mappedState);

        if (isTerminalSessionStatus(cancelledSession.status)) {
          controllerRef.current?.stop();
          setIsPolling(false);
          if (cancelledSession.status === 'converted' && cancelledSession.convertedOrderDisplayId) {
            onConvertedRef.current?.(cancelledSession.convertedOrderDisplayId, cancelledSession);
          } else if (cancelledSession.status !== 'converted') {
            onTerminalStateRef.current?.(cancelledSession.status, cancelledSession);
          }
        } else {
          // If response is not terminal (e.g. cancellation_requested, payment_captured, converting),
          // polling must continue so the session can resolve to terminal state.
          controllerRef.current?.start();
          setIsPolling(true);
        }

        return true;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Cancellation failed';
        setErrorMessage(msg);
        return false;
      } finally {
        setIsCancelling(false);
      }
    },
    [sessionId, isCancelling, syncAttemptStore]
  );

  return {
    uiState,
    session,
    isPolling,
    isCancelling,
    isConfirmingPayment,
    errorMessage,
    timeRemainingMs,
    startPolling,
    stopPolling,
    manualRefresh,
    cancelSession,
    setConfirmingPayment: setIsConfirmingPayment,
    recordPaymentSubmitted,
  };
}

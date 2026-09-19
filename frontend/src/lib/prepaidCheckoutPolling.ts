/**
 * Prepaid Checkout Authoritative Polling Controller & Utilities
 * Phase 6D-5B Batch 3: Storefront Prepaid Payment & Conversion Polling
 *
 * Implements framework-independent, testable polling mechanics:
 * 1. Immediate first poll
 * 2. Visible tab interval (1500ms) vs Hidden tab interval (5000ms)
 * 3. Bounded backoff for transient errors (1500ms, 3000ms, 6000ms, max 6000ms)
 * 4. Bounded jitter (<= ±200ms) without Math.random (injectable or Web Crypto)
 * 5. Hard automatic polling duration (60000ms) with manual verification fallback
 * 6. Non-overlapping GET requests with AbortController lifecycle
 * 7. Server status to UI state mapping
 * 8. Non-authoritative local lease expiry (triggers immediate GET; never marks expired on client clock)
 * 9. Idempotent one-time converted / terminal callbacks
 * 10. SSR-safe Stripe return parameter scrubbing utility
 */

import type {
  CheckoutSessionStatus,
  PublicCheckoutSession,
} from '../types/commerce.ts';
import { getCheckoutSession } from './checkoutSessionService.ts';

export type PrepaidCheckoutUiState =
  | 'idle'
  | 'payment_action_required'
  | 'confirming_payment'
  | 'awaiting_authoritative_capture'
  | 'converting_order'
  | 'cancellation_requested'
  | 'cancelled'
  | 'expired'
  | 'failed'
  | 'conflict'
  | 'verification_conflict'
  | 'network_recovering'
  | 'polling_paused'
  | 'converted'
  | 'authentication_required'
  | 'session_not_found'
  | 'invalid_response';

export interface PollingControllerOptions {
  sessionId: string;
  hasSubmittedPayment?: boolean;
  leaseExpiresAt?: string | null;
  onStateChange: (state: PrepaidCheckoutUiState, session: PublicCheckoutSession | null) => void;
  onConverted: (convertedOrderDisplayId: string, session: PublicCheckoutSession) => void;
  onTerminalState?: (status: CheckoutSessionStatus, session: PublicCheckoutSession) => void;
  onError?: (error: Error) => void;
  jitterProvider?: () => number;
}

export const VISIBLE_POLL_INTERVAL_MS = 1500;
export const HIDDEN_POLL_INTERVAL_MS = 5000;
export const TRANSIENT_BACKOFF_STEPS_MS = [1500, 3000, 6000];
export const MAX_BACKOFF_MS = 6000;
export const MAX_JITTER_MS = 200;
export const HARD_POLLING_DURATION_MS = 60000;

/**
 * Computes bounded jitter in range [-MAX_JITTER_MS, +MAX_JITTER_MS].
 * Strictly uses injectable jitter provider or Web Crypto (zero Math.random).
 */
export function getBoundedJitter(jitterProvider?: () => number): number {
  if (typeof jitterProvider === 'function') {
    const raw = jitterProvider();
    // Normalize raw in [0, 1] or clamp
    const normalized = Math.max(-1, Math.min(1, raw));
    return Math.round(normalized * MAX_JITTER_MS);
  }

  if (typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.getRandomValues === 'function') {
    const arr = new Uint32Array(1);
    globalThis.crypto.getRandomValues(arr);
    const floatVal = arr[0] / 0xffffffff; // 0 to 1
    return Math.round(floatVal * (MAX_JITTER_MS * 2) - MAX_JITTER_MS);
  }

  return 0;
}

/**
 * Maps authoritative server session status to consumer UI state.
 */
export function mapServerStatusToUiState(
  status: CheckoutSessionStatus,
  options: { hasSubmittedPayment?: boolean } = {}
): PrepaidCheckoutUiState {
  switch (status) {
    case 'active':
    case 'payment_pending':
      return options.hasSubmittedPayment
        ? 'awaiting_authoritative_capture'
        : 'payment_action_required';
    case 'payment_captured':
    case 'converting':
      return 'converting_order';
    case 'converted':
      return 'converted';
    case 'cancellation_requested':
      return 'cancellation_requested';
    case 'cancelled':
      return 'cancelled';
    case 'expired':
      return 'expired';
    case 'failed':
      return 'failed';
    case 'conflict':
      return 'conflict';
    default:
      return 'payment_action_required';
  }
}

/**
 * Checks if a status is terminal and should cease automatic polling.
 */
export function isTerminalSessionStatus(status: CheckoutSessionStatus): boolean {
  return (
    status === 'converted' ||
    status === 'cancelled' ||
    status === 'expired' ||
    status === 'failed' ||
    status === 'conflict'
  );
}

/**
 * Framework-independent Pure Polling Controller.
 */
export class PrepaidCheckoutPollingController {
  private sessionId: string;
  private hasSubmittedPayment: boolean;
  private leaseExpiresAt: string | null;
  private onStateChange: (state: PrepaidCheckoutUiState, session: PublicCheckoutSession | null) => void;
  private onConvertedCallback: (convertedOrderDisplayId: string, session: PublicCheckoutSession) => void;
  private onTerminalCallback?: (status: CheckoutSessionStatus, session: PublicCheckoutSession) => void;
  private onErrorCallback?: (error: Error) => void;
  private jitterProvider?: () => number;

  private isRunning = false;
  private inFlightAbortController: AbortController | null = null;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private hardStopTimer: ReturnType<typeof setTimeout> | null = null;
  private pollingStartedAt = 0;
  private consecutiveErrors = 0;
  private isTabVisible = true;
  private convertedDispatched = false;
  private terminalDispatched = false;
  private latestSession: PublicCheckoutSession | null = null;
  private latestUiState: PrepaidCheckoutUiState = 'idle';
  private currentRequestId = 0;
  private is409Refetching = false;

  constructor(options: PollingControllerOptions) {
    this.sessionId = options.sessionId;
    this.hasSubmittedPayment = Boolean(options.hasSubmittedPayment);
    this.leaseExpiresAt = options.leaseExpiresAt || null;
    this.onStateChange = options.onStateChange;
    this.onConvertedCallback = options.onConverted;
    this.onTerminalCallback = options.onTerminalState;
    this.onErrorCallback = options.onError;
    this.jitterProvider = options.jitterProvider;

    if (typeof document !== 'undefined') {
      this.isTabVisible = document.visibilityState !== 'hidden';
    }
  }

  public setHasSubmittedPayment(submitted: boolean): void {
    this.hasSubmittedPayment = submitted;
    if (this.latestSession) {
      const nextState = mapServerStatusToUiState(this.latestSession.status, {
        hasSubmittedPayment: this.hasSubmittedPayment,
      });
      this.updateState(nextState, this.latestSession);
    } else if (submitted) {
      this.updateState('awaiting_authoritative_capture', null);
    }
  }

  public updateLeaseExpiresAt(leaseExpiresAt: string | null): void {
    this.leaseExpiresAt = leaseExpiresAt;
  }

  public getUiState(): PrepaidCheckoutUiState {
    return this.latestUiState;
  }

  public getLatestSession(): PublicCheckoutSession | null {
    return this.latestSession;
  }

  public getIsRunning(): boolean {
    return this.isRunning;
  }

  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.pollingStartedAt = Date.now();
    this.consecutiveErrors = 0;

    // Schedule hard automatic polling timeout
    this.clearTimer('hardStopTimer');
    this.hardStopTimer = setTimeout(() => {
      this.handleHardTimeout();
    }, HARD_POLLING_DURATION_MS);

    // Immediate initial poll
    void this.pollCycle();
  }

  public stop(): void {
    this.isRunning = false;
    this.currentRequestId++; // Invalidate any in-flight request completion
    this.clearTimer('pollTimer');
    this.clearTimer('hardStopTimer');
    if (this.inFlightAbortController) {
      this.inFlightAbortController.abort();
      this.inFlightAbortController = null;
    }
  }

  public setVisibility(isVisible: boolean): void {
    const wasVisible = this.isTabVisible;
    this.isTabVisible = isVisible;

    if (this.isRunning && !wasVisible && isVisible) {
      // Tab became visible again; reschedule immediate check if no request in flight
      if (!this.inFlightAbortController) {
        this.clearTimer('pollTimer');
        void this.pollCycle();
      }
    }
  }

  public async manualCheck(): Promise<PublicCheckoutSession | null> {
    if (this.inFlightAbortController) {
      this.inFlightAbortController.abort();
      this.inFlightAbortController = null;
    }
    this.clearTimer('pollTimer');
    return await this.executePollRequest();
  }

  private clearTimer(timerKey: 'pollTimer' | 'hardStopTimer'): void {
    if (this[timerKey]) {
      clearTimeout(this[timerKey]!);
      this[timerKey] = null;
    }
  }

  private handleHardTimeout(): void {
    if (!this.isRunning) return;
    this.stop();
    if (!isTerminalSessionStatus(this.latestSession?.status as CheckoutSessionStatus)) {
      this.updateState('polling_paused', this.latestSession);
    }
  }

  private async pollCycle(): Promise<void> {
    if (!this.isRunning) return;

    // Check if hard duration exceeded
    if (Date.now() - this.pollingStartedAt >= HARD_POLLING_DURATION_MS) {
      this.handleHardTimeout();
      return;
    }

    // Execute poll request
    const session = await this.executePollRequest();

    if (!this.isRunning) return;

    if (session && isTerminalSessionStatus(session.status)) {
      // Stop automatically on terminal status
      this.stop();
      return;
    }

    // Schedule next cycle
    this.scheduleNextCycle();
  }

  private scheduleNextCycle(): void {
    if (!this.isRunning) return;
    this.clearTimer('pollTimer');

    let baseInterval: number;
    if (this.consecutiveErrors > 0) {
      const stepIdx = Math.min(this.consecutiveErrors - 1, TRANSIENT_BACKOFF_STEPS_MS.length - 1);
      baseInterval = TRANSIENT_BACKOFF_STEPS_MS[stepIdx];
    } else {
      baseInterval = this.isTabVisible ? VISIBLE_POLL_INTERVAL_MS : HIDDEN_POLL_INTERVAL_MS;
    }

    const jitter = getBoundedJitter(this.jitterProvider);
    const delay = Math.max(200, baseInterval + jitter);

    this.pollTimer = setTimeout(() => {
      void this.pollCycle();
    }, delay);
  }

  private async executePollRequest(): Promise<PublicCheckoutSession | null> {
    if (this.inFlightAbortController) {
      return null;
    }

    const requestId = ++this.currentRequestId;
    const controller = new AbortController();
    this.inFlightAbortController = controller;

    try {
      const response = await getCheckoutSession(this.sessionId, controller.signal);

      // If controller stopped or newer request was issued, discard stale response
      if (this.currentRequestId !== requestId) {
        return null;
      }

      this.inFlightAbortController = null;
      this.consecutiveErrors = 0;
      this.is409Refetching = false;

      const session = response.session;
      this.latestSession = session;

      const mappedUiState = mapServerStatusToUiState(session.status, {
        hasSubmittedPayment: this.hasSubmittedPayment,
      });

      this.updateState(mappedUiState, session);

      // Handle terminal callbacks
      if (session.status === 'converted' && !this.convertedDispatched) {
        if (session.convertedOrderDisplayId) {
          this.convertedDispatched = true;
          this.onConvertedCallback(session.convertedOrderDisplayId, session);
        }
      } else if (isTerminalSessionStatus(session.status) && session.status !== 'converted' && !this.terminalDispatched) {
        this.terminalDispatched = true;
        this.onTerminalCallback?.(session.status, session);
      }

      return session;
    } catch (err: unknown) {
      if (this.inFlightAbortController === controller) {
        this.inFlightAbortController = null;
      }

      // Check if aborted/cancelled or stale request token
      const isAborted =
        controller.signal.aborted ||
        (err as { name?: string })?.name === 'CanceledError' ||
        (err as { name?: string })?.name === 'AbortError';

      if (isAborted || this.currentRequestId !== requestId) {
        return null;
      }

      const error = err instanceof Error ? err : new Error(String(err));
      const httpStatus =
        (err as { status?: number })?.status ??
        (err as { response?: { status?: number } })?.response?.status;
      const errorCode =
        (err as { code?: string })?.code ??
        (err as { response?: { data?: { code?: string } } })?.response?.data?.code;

      const isInvalidResponse =
        errorCode === 'CHECKOUT_SESSION_RESPONSE_INVALID' ||
        error.name === 'CheckoutSessionResponseInvalidError' ||
        error.message?.includes('CHECKOUT_SESSION_RESPONSE_INVALID') ||
        error.message?.includes('Invalid checkout session') ||
        error.message?.includes('Missing required exact-money');

      if (this.onErrorCallback) {
        this.onErrorCallback(error);
      }

      // HTTP 401 Unauthorized: Stop automatic polling; authentication required
      if (httpStatus === 401) {
        this.stop();
        this.updateState('authentication_required', this.latestSession);
        return null;
      }

      // HTTP 404 Session Not Found: Stop automatic polling; preserve cart
      if (httpStatus === 404 || errorCode === 'SESSION_NOT_FOUND') {
        this.stop();
        this.updateState('session_not_found', this.latestSession);
        return null;
      }

      // HTTP 409 Conflict: Perform one immediate authoritative refetch with strict loop guard
      if (httpStatus === 409) {
        if (!this.is409Refetching) {
          this.is409Refetching = true;
          return await this.executePollRequest();
        }
        // Persistent 409 conflict: Distinct non-authoritative verification conflict error (not authoritative conflict)
        this.stop();
        this.updateState('verification_conflict', this.latestSession);
        return null;
      }

      // Malformed response / Schema validation failure
      if (isInvalidResponse) {
        this.stop();
        this.updateState('invalid_response', this.latestSession);
        return null;
      }

      // Other non-transient 4xx errors (400, 403, 422, etc.)
      if (typeof httpStatus === 'number' && httpStatus >= 400 && httpStatus < 500) {
        this.stop();
        this.updateState('failed', this.latestSession);
        return null;
      }

      // 5xx Server errors, timeout, or network failures: retry with bounded backoff
      this.consecutiveErrors++;
      this.updateState('network_recovering', this.latestSession);
      return null;
    }
  }

  private updateState(state: PrepaidCheckoutUiState, session: PublicCheckoutSession | null): void {
    this.latestUiState = state;
    this.onStateChange(state, session);
  }
}

/**
 * Cleans Stripe / payment provider redirect parameters from the current URL.
 * Preserves all unrelated query parameters.
 * Uses window.history.replaceState without reloads.
 * Safe for SSR (no-op when window is undefined).
 */
export function scrubStripeUrlParams(win?: Window): void {
  const targetWindow = win || (typeof window !== 'undefined' ? window : undefined);
  if (!targetWindow || !targetWindow.location || !targetWindow.history?.replaceState) {
    return;
  }

  try {
    const url = new URL(targetWindow.location.href);
    const stripeParams = [
      'payment_intent',
      'payment_intent_client_secret',
      'redirect_status',
      'checkout_return',
    ];

    let modified = false;
    for (const param of stripeParams) {
      if (url.searchParams.has(param)) {
        url.searchParams.delete(param);
        modified = true;
      }
    }

    if (modified) {
      const cleanPath = url.pathname + (url.search ? url.search : '') + url.hash;
      targetWindow.history.replaceState(targetWindow.history.state, '', cleanPath);
    }
  } catch {
    // Fail safe with zero exception throw
  }
}

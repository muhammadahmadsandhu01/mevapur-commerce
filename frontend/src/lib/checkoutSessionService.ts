/**
 * Authoritative Two-Phase Storefront CheckoutSession API Client
 * Manages typed requests and responses for:
 * - POST /commerce/checkout/session (Create session with Idempotency-Key)
 * - GET  /commerce/checkout/session/:sessionId (Fetch session by ID)
 * - POST /commerce/checkout/session/:sessionId/cancel (Cancel active session)
 */

import api from './api.ts';
import axios from 'axios';
import type {
  PublicCheckoutSession,
  PaymentAttempt,
  CreateCheckoutSessionRequest,
  CreateCheckoutSessionResponse,
  GetCheckoutSessionResponse,
  CancelCheckoutSessionRequest,
  CancelCheckoutSessionResponse,
} from '../types/commerce.ts';

/**
 * Normalized checkout API error interface.
 */
export interface CheckoutApiError extends Error {
  code?: string;
  status?: number;
  data?: unknown;
}

/**
 * Normalizes Axios and runtime errors into typed CheckoutApiError with code, status, and message.
 */
export function normalizeCheckoutApiError(error: unknown, fallbackMessage: string): CheckoutApiError {
  if (axios.isAxiosError(error) && error.response) {
    const status = error.response.status;
    const resData = error.response.data as Record<string, unknown> | undefined;
    const errorObj = resData?.error as Record<string, unknown> | undefined;

    const message =
      (errorObj?.message as string) ||
      (resData?.message as string) ||
      error.message ||
      fallbackMessage;

    const code =
      (errorObj?.code as string) ||
      (resData?.code as string) ||
      (status === 503 ? 'TWO_PHASE_CHECKOUT_DISABLED' : undefined);

    const apiError = new Error(message) as CheckoutApiError;
    apiError.code = code;
    apiError.status = status;
    apiError.data = resData;
    return apiError;
  }

  if (error instanceof Error) {
    return error as CheckoutApiError;
  }

  return new Error(fallbackMessage) as CheckoutApiError;
}

/**
 * Creates an authoritative two-phase checkout session with an idempotency key.
 */
export async function createCheckoutSession(
  request: CreateCheckoutSessionRequest,
  idempotencyKey: string,
  signal?: AbortSignal
): Promise<{
  session: PublicCheckoutSession;
  paymentAttempt?: PaymentAttempt;
  idempotentReplay?: boolean;
}> {
  if (!idempotencyKey || typeof idempotencyKey !== 'string' || idempotencyKey.trim().length < 8) {
    throw new Error('A valid idempotency key is required to create a checkout session');
  }

  try {
    const response = await api.post<CreateCheckoutSessionResponse>(
      '/commerce/checkout/session',
      request,
      {
        headers: {
          'Idempotency-Key': idempotencyKey.trim(),
        },
        signal,
      }
    );

    if (!response.data?.success || !response.data?.data?.session) {
      throw new Error(response.data?.message || 'Checkout session creation failed');
    }

    return {
      session: response.data.data.session,
      paymentAttempt: response.data.data.paymentAttempt,
      idempotentReplay: Boolean(response.data.data.idempotentReplay),
    };
  } catch (error: unknown) {
    throw normalizeCheckoutApiError(error, 'Checkout session creation failed');
  }
}

/**
 * Fetches an authoritative checkout session by canonical session ID.
 */
export async function getCheckoutSession(
  sessionId: string,
  signal?: AbortSignal
): Promise<{
  session: PublicCheckoutSession;
  paymentAttempt?: PaymentAttempt;
}> {
  const cleanId = String(sessionId || '').trim();
  if (!cleanId) {
    throw new Error('Missing session identifier');
  }

  try {
    const response = await api.get<GetCheckoutSessionResponse>(
      `/commerce/checkout/session/${encodeURIComponent(cleanId)}`,
      { signal }
    );

    if (!response.data?.success || !response.data?.data?.session) {
      throw new Error(response.data?.message || 'Checkout session not found');
    }

    return {
      session: response.data.data.session,
      paymentAttempt: response.data.data.paymentAttempt,
    };
  } catch (error: unknown) {
    throw normalizeCheckoutApiError(error, 'Failed to fetch checkout session');
  }
}

/**
 * Requests authoritative cancellation / compensation of an active checkout session.
 */
export async function cancelCheckoutSession(
  sessionId: string,
  request?: CancelCheckoutSessionRequest,
  signal?: AbortSignal
): Promise<{
  session: PublicCheckoutSession;
}> {
  const cleanId = String(sessionId || '').trim();
  if (!cleanId) {
    throw new Error('Missing session identifier');
  }

  try {
    const response = await api.post<CancelCheckoutSessionResponse>(
      `/commerce/checkout/session/${encodeURIComponent(cleanId)}/cancel`,
      request || {},
      { signal }
    );

    if (!response.data?.success || !response.data?.data?.session) {
      throw new Error(response.data?.message || 'Failed to cancel checkout session');
    }

    return {
      session: response.data.data.session,
    };
  } catch (error: unknown) {
    throw normalizeCheckoutApiError(error, 'Failed to cancel checkout session');
  }
}

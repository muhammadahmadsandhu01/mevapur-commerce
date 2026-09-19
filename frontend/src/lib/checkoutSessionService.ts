/**
 * Authoritative Two-Phase Storefront CheckoutSession API Client
 * Manages typed requests and responses for:
 * - POST /commerce/checkout/session (Create session with Idempotency-Key)
 * - GET  /commerce/checkout/session/:sessionId (Fetch session by ID)
 * - POST /commerce/checkout/session/:sessionId/cancel (Cancel active session)
 *
 * Enforces strict runtime validation via explicit allowlist parsers:
 * - Fails closed on missing or invalid envelope fields
 * - Validates integer strings for amountMinor, non-negative exponents, and exact money integrity
 * - Enforces converted status invariants (convertedOrderDisplayId requirement)
 * - Omits unknown fields from return payload without spreading raw network JSON
 * - Throws CHECKOUT_SESSION_RESPONSE_INVALID with safe field path diagnostics
 */

import api from './api.ts';
import axios from 'axios';
import type {
  PublicCheckoutSession,
  CheckoutSessionStatus,
  CheckoutSessionMoney,
  CheckoutSessionAmounts,
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
 * Thrown when server response fails strict runtime validation.
 */
export class CheckoutSessionResponseInvalidError extends Error {
  readonly code = 'CHECKOUT_SESSION_RESPONSE_INVALID';
  readonly fieldPath?: string;

  constructor(message: string, fieldPath?: string) {
    super(fieldPath ? `${message} (field: ${fieldPath})` : message);
    this.name = 'CheckoutSessionResponseInvalidError';
    this.fieldPath = fieldPath;
  }
}

export function isCheckoutSessionResponseInvalidError(
  error: unknown
): error is CheckoutSessionResponseInvalidError {
  return (
    error instanceof CheckoutSessionResponseInvalidError ||
    (typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: string }).code === 'CHECKOUT_SESSION_RESPONSE_INVALID')
  );
}

const VALID_SESSION_STATUSES: readonly CheckoutSessionStatus[] = [
  'active',
  'payment_pending',
  'payment_captured',
  'converting',
  'converted',
  'cancellation_requested',
  'cancelled',
  'expired',
  'failed',
  'conflict',
] as const;

/**
 * Strictly parses and validates a single exact money object.
 */
export function parseCheckoutSessionMoney(
  raw: unknown,
  fieldPath: string,
  expectedCurrency: string
): CheckoutSessionMoney {
  if (!raw || typeof raw !== 'object') {
    throw new CheckoutSessionResponseInvalidError(`Expected Money object`, fieldPath);
  }

  const obj = raw as Record<string, unknown>;

  // amountMinor must be an integer string, NEVER a number
  if (typeof obj.amountMinor !== 'string' || !/^-?[0-9]+$/.test(obj.amountMinor)) {
    throw new CheckoutSessionResponseInvalidError(
      `amountMinor must be a valid integer string`,
      `${fieldPath}.amountMinor`
    );
  }

  // currency must match session currency
  if (typeof obj.currency !== 'string' || obj.currency.trim().toUpperCase() !== expectedCurrency) {
    throw new CheckoutSessionResponseInvalidError(
      `Money currency mismatch or invalid (expected '${expectedCurrency}')`,
      `${fieldPath}.currency`
    );
  }

  // exponent must be a non-negative integer
  if (
    typeof obj.exponent !== 'number' ||
    !Number.isInteger(obj.exponent) ||
    obj.exponent < 0 ||
    obj.exponent > 4
  ) {
    throw new CheckoutSessionResponseInvalidError(
      `exponent must be an integer between 0 and 4`,
      `${fieldPath}.exponent`
    );
  }

  // registrySnapshot must be a non-empty string
  if (typeof obj.registrySnapshot !== 'string' || obj.registrySnapshot.trim().length === 0) {
    throw new CheckoutSessionResponseInvalidError(
      `registrySnapshot must be a non-empty string`,
      `${fieldPath}.registrySnapshot`
    );
  }

  return {
    amountMinor: obj.amountMinor,
    currency: obj.currency.trim().toUpperCase(),
    exponent: obj.exponent,
    registrySnapshot: obj.registrySnapshot.trim(),
  };
}

/**
 * Strictly parses and validates the complete 8 exact-money fields breakdown.
 */
export function parseCheckoutSessionAmounts(raw: unknown, sessionCurrency: string): CheckoutSessionAmounts {
  if (!raw || typeof raw !== 'object') {
    throw new CheckoutSessionResponseInvalidError(`Expected amounts breakdown object`, 'amounts');
  }

  const obj = raw as Record<string, unknown>;

  const requiredMoneyFields: (keyof CheckoutSessionAmounts)[] = [
    'subtotalExact',
    'discountExact',
    'shippingCostExact',
    'taxAmountExact',
    'additionalTaxAmountExact',
    'taxIncludedAmountExact',
    'dutiesExact',
    'totalAmountExact',
  ];

  for (const field of requiredMoneyFields) {
    if (!obj[field]) {
      throw new CheckoutSessionResponseInvalidError(`Missing required exact-money field '${field}'`, `amounts.${field}`);
    }
  }

  return {
    subtotalExact: parseCheckoutSessionMoney(obj.subtotalExact, 'amounts.subtotalExact', sessionCurrency),
    discountExact: parseCheckoutSessionMoney(obj.discountExact, 'amounts.discountExact', sessionCurrency),
    shippingCostExact: parseCheckoutSessionMoney(obj.shippingCostExact, 'amounts.shippingCostExact', sessionCurrency),
    taxAmountExact: parseCheckoutSessionMoney(obj.taxAmountExact, 'amounts.taxAmountExact', sessionCurrency),
    additionalTaxAmountExact: parseCheckoutSessionMoney(
      obj.additionalTaxAmountExact,
      'amounts.additionalTaxAmountExact',
      sessionCurrency
    ),
    taxIncludedAmountExact: parseCheckoutSessionMoney(
      obj.taxIncludedAmountExact,
      'amounts.taxIncludedAmountExact',
      sessionCurrency
    ),
    dutiesExact: parseCheckoutSessionMoney(obj.dutiesExact, 'amounts.dutiesExact', sessionCurrency),
    totalAmountExact: parseCheckoutSessionMoney(obj.totalAmountExact, 'amounts.totalAmountExact', sessionCurrency),
  };
}

/**
 * Parses paymentAttempt object if present in response.
 */
export function parsePaymentAttempt(raw: unknown): PaymentAttempt | undefined {
  if (raw === null || raw === undefined) {
    return undefined;
  }

  if (typeof raw !== 'object') {
    throw new CheckoutSessionResponseInvalidError(`paymentAttempt must be an object`, 'paymentAttempt');
  }

  const obj = raw as Record<string, unknown>;

  if (typeof obj.provider !== 'string' || obj.provider.trim().length === 0) {
    throw new CheckoutSessionResponseInvalidError(`paymentAttempt.provider must be a non-empty string`, 'paymentAttempt.provider');
  }

  if (typeof obj.status !== 'string' || obj.status.trim().length === 0) {
    throw new CheckoutSessionResponseInvalidError(`paymentAttempt.status must be a non-empty string`, 'paymentAttempt.status');
  }

  let clientSecret: string | undefined = undefined;
  if (obj.clientSecret !== undefined && obj.clientSecret !== null) {
    if (typeof obj.clientSecret !== 'string' || obj.clientSecret.trim().length === 0) {
      throw new CheckoutSessionResponseInvalidError(
        `paymentAttempt.clientSecret must be a non-empty string if present`,
        'paymentAttempt.clientSecret'
      );
    }
    clientSecret = obj.clientSecret.trim();
  }

  return {
    provider: obj.provider.trim(),
    status: obj.status.trim(),
    ...(clientSecret ? { clientSecret } : {}),
  };
}

/**
 * Parses and validates PublicCheckoutSession with strict allowlist and type invariants.
 */
export function parsePublicCheckoutSession(raw: unknown): PublicCheckoutSession {
  if (!raw || typeof raw !== 'object') {
    throw new CheckoutSessionResponseInvalidError(`Expected session object`, 'session');
  }

  const obj = raw as Record<string, unknown>;

  if (typeof obj.sessionId !== 'string' || obj.sessionId.trim().length === 0) {
    throw new CheckoutSessionResponseInvalidError(`sessionId must be a non-empty string`, 'session.sessionId');
  }

  if (typeof obj.status !== 'string' || !(VALID_SESSION_STATUSES as readonly string[]).includes(obj.status)) {
    throw new CheckoutSessionResponseInvalidError(`Unknown or invalid session status '${obj.status}'`, 'session.status');
  }
  const status = obj.status as CheckoutSessionStatus;

  if (typeof obj.currency !== 'string' || obj.currency.trim().length === 0) {
    throw new CheckoutSessionResponseInvalidError(`currency must be a non-empty string`, 'session.currency');
  }
  const currency = obj.currency.trim().toUpperCase();

  if (typeof obj.destinationCountry !== 'string' || obj.destinationCountry.trim().length === 0) {
    throw new CheckoutSessionResponseInvalidError(
      `destinationCountry must be a non-empty string`,
      'session.destinationCountry'
    );
  }
  const destinationCountry = obj.destinationCountry.trim().toUpperCase();

  let leaseExpiresAt: string | null = null;
  if (obj.leaseExpiresAt !== undefined && obj.leaseExpiresAt !== null) {
    if (typeof obj.leaseExpiresAt !== 'string' || isNaN(Date.parse(obj.leaseExpiresAt))) {
      throw new CheckoutSessionResponseInvalidError(
        `leaseExpiresAt must be a valid ISO timestamp string`,
        'session.leaseExpiresAt'
      );
    }
    leaseExpiresAt = obj.leaseExpiresAt;
  }

  // Parse exact amounts breakdown with currency validation
  const amounts = parseCheckoutSessionAmounts(obj.amounts, currency);

  let convertedOrderDisplayId: string | null = null;
  if (status === 'converted') {
    if (typeof obj.convertedOrderDisplayId !== 'string' || obj.convertedOrderDisplayId.trim().length === 0) {
      throw new CheckoutSessionResponseInvalidError(
        `convertedOrderDisplayId is required when session status is 'converted'`,
        'session.convertedOrderDisplayId'
      );
    }
    convertedOrderDisplayId = obj.convertedOrderDisplayId.trim();
  } else if (obj.convertedOrderDisplayId !== undefined && obj.convertedOrderDisplayId !== null) {
    if (typeof obj.convertedOrderDisplayId === 'string' && obj.convertedOrderDisplayId.trim().length > 0) {
      convertedOrderDisplayId = obj.convertedOrderDisplayId.trim();
    }
  }

  return {
    sessionId: obj.sessionId.trim(),
    status,
    ...(leaseExpiresAt ? { leaseExpiresAt } : {}),
    amounts,
    currency,
    destinationCountry,
    ...(convertedOrderDisplayId ? { convertedOrderDisplayId } : {}),
  };
}

/**
 * Normalizes Axios and runtime errors into typed CheckoutApiError with code, status, and message.
 */
export function normalizeCheckoutApiError(error: unknown, fallbackMessage: string): CheckoutApiError {
  if (error instanceof CheckoutSessionResponseInvalidError) {
    return error as CheckoutApiError;
  }

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
      throw new CheckoutSessionResponseInvalidError(
        response.data?.message || 'Checkout session creation failed',
        'data.session'
      );
    }

    const session = parsePublicCheckoutSession(response.data.data.session);
    const paymentAttempt = parsePaymentAttempt(response.data.data.paymentAttempt);

    return {
      session,
      ...(paymentAttempt ? { paymentAttempt } : {}),
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
      throw new CheckoutSessionResponseInvalidError(
        response.data?.message || 'Checkout session not found',
        'data.session'
      );
    }

    const session = parsePublicCheckoutSession(response.data.data.session);
    const paymentAttempt = parsePaymentAttempt(response.data.data.paymentAttempt);

    return {
      session,
      ...(paymentAttempt ? { paymentAttempt } : {}),
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
      throw new CheckoutSessionResponseInvalidError(
        response.data?.message || 'Failed to cancel checkout session',
        'data.session'
      );
    }

    const session = parsePublicCheckoutSession(response.data.data.session);

    return {
      session,
    };
  } catch (error: unknown) {
    throw normalizeCheckoutApiError(error, 'Failed to cancel checkout session');
  }
}

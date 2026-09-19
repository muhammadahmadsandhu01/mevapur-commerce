/**
 * Authoritative Storefront Checkout Attempt Identity & Cryptographic Fingerprinting Store
 *
 * Requirements & Architecture:
 * - Deterministic canonical JSON key sorting
 * - Deterministic cart item sorting by productId, variantId, and lineId
 * - Web Crypto SHA-256 only via globalThis.crypto.subtle.digest('SHA-256', ...)
 * - UTF-8 encoding via TextEncoder
 * - Lowercase 64-character hexadecimal digests
 * - Fail closed if Web Crypto API is unavailable (zero non-cryptographic fallback)
 * - Base fingerprint: SHA256(canonicalCheckoutIntent)
 * - Idempotency key: "checkout-v1-" + SHA256(baseFingerprint + ":" + generation)
 * - Reload-safe & cross-tab synchronized exclusively via localStorage
 * - Storage namespace: mevapur:checkout-attempt:v1:<hashedUserScope>
 * - hashedUserScope: 64-character lowercase SHA-256 digest
 * - Fail closed with CHECKOUT_RECOVERY_STORAGE_UNAVAILABLE if localStorage is missing, blocked, or throws
 * - Browser localStorage persistence only (zero memory fallback)
 * - Zero-PII and Zero-Secret storage guarantees
 * - Terminal-only generation rotation: forceNewAttempt requires authoritative failed, expired, or cancelled status
 * - Changed-intent protection: active attempts throw CHECKOUT_ATTEMPT_ACTIVE_INTENT_CONFLICT
 * - Monotonic reconciliation: stale cross-tab responses cannot regress terminal or advanced payment states
 * - Cross-tab coordination via deterministic idempotency keys, navigator.locks, and BroadcastChannel/storage events
 */

import type { CheckoutSessionStatus } from '../types/commerce.ts';

export interface ShippingAddressInput {
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

export interface CanonicalCheckoutItem {
  productId: string;
  variantId: string | null;
  quantity: number;
}

export interface CanonicalCheckoutIntent {
  hashedUserScope: string;
  items: CanonicalCheckoutItem[];
  shippingAddressHash: string;
  destinationCountry: string;
  shippingServiceLevel: string;
  shippingAdapter: string | null;
  currency: string;
  paymentMethod: string;
  couponCode: string | null;
  quoteConfigVersionId: string | null;
  quoteIncoterm: string | null;
  quoteItemsHash: string | null;
}

export interface CheckoutIntentInput {
  items: Array<{ productId?: string; id?: string; variantId?: string | null; quantity: number }>;
  shippingAddress: ShippingAddressInput;
  paymentMethod: string;
  currency?: string;
  shippingServiceLevel?: string;
  shippingAdapter?: string | null;
  couponCode?: string | null;
  quoteConfigVersionId?: string | null;
  quoteIncoterm?: string | null;
  quoteItemsHash?: string | null;
}

export type CheckoutAttemptStatus = 'creating' | CheckoutSessionStatus;

export interface CheckoutAttemptRecord {
  schemaVersion: 1;
  baseFingerprint: string;
  generation: number;
  idempotencyKey: string;
  sessionId?: string;
  leaseExpiresAt?: string;
  status: CheckoutAttemptStatus;
  paymentSubmittedAt?: string | null;
  createdAt: number;
  updatedAt: number;
  recoveryExpiresAt: number;
}

export class CheckoutRecoveryStorageError extends Error {
  readonly code = 'CHECKOUT_RECOVERY_STORAGE_UNAVAILABLE';

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'CheckoutRecoveryStorageError';
    if (cause) {
      this.cause = cause;
    }
  }
}

export function isCheckoutRecoveryStorageError(error: unknown): error is CheckoutRecoveryStorageError {
  return (
    error instanceof CheckoutRecoveryStorageError ||
    (typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: string }).code === 'CHECKOUT_RECOVERY_STORAGE_UNAVAILABLE')
  );
}

export class CheckoutAttemptNonTerminalRotationError extends Error {
  readonly code = 'CHECKOUT_ATTEMPT_NON_TERMINAL_ROTATION_FORBIDDEN';
  readonly status: CheckoutAttemptStatus;
  readonly sessionId: string | null;

  constructor(status: CheckoutAttemptStatus, sessionId: string | null = null, message?: string) {
    super(
      message ||
        `Cannot force a new attempt when existing attempt status is non-terminal '${status}'. Authoritative server status must be 'failed', 'expired', or 'cancelled'.`
    );
    this.name = 'CheckoutAttemptNonTerminalRotationError';
    this.status = status;
    this.sessionId = sessionId;
  }
}

export class CheckoutAttemptActiveIntentConflictError extends Error {
  readonly code = 'CHECKOUT_ATTEMPT_ACTIVE_INTENT_CONFLICT';
  readonly existingSessionId: string | null;
  readonly existingStatus: CheckoutAttemptStatus;
  readonly existingRecoveryExpiresAt: number;

  constructor(metadata: {
    existingSessionId: string | null;
    existingStatus: CheckoutAttemptStatus;
    existingRecoveryExpiresAt: number;
  }) {
    super(
      `Cannot create a new checkout attempt with changed intent while an active attempt exists (status='${metadata.existingStatus}', sessionId='${metadata.existingSessionId || 'none'}'). Prior attempt must reach an authoritative terminal state or be cancelled/reconciled first.`
    );
    this.name = 'CheckoutAttemptActiveIntentConflictError';
    this.existingSessionId = metadata.existingSessionId;
    this.existingStatus = metadata.existingStatus;
    this.existingRecoveryExpiresAt = metadata.existingRecoveryExpiresAt;
  }
}

export class CheckoutAttemptStaleUpdateError extends Error {
  readonly code = 'CHECKOUT_ATTEMPT_STALE_UPDATE_IGNORED';
  readonly reason: string;

  constructor(reason: string) {
    super(`Checkout attempt update rejected as stale: ${reason}`);
    this.name = 'CheckoutAttemptStaleUpdateError';
    this.reason = reason;
  }
}

export const STORAGE_KEY_PREFIX = 'mevapur:checkout-attempt:v1:';
export const DEFAULT_RECOVERY_TTL_MS = 30 * 60 * 1000; // 30 minutes
export const SUBMITTED_PAYMENT_RECOVERY_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
export const BROADCAST_CHANNEL_NAME = 'mevapur_checkout_attempt_sync';

export const AUTHORITATIVE_TERMINAL_STATUSES: readonly CheckoutSessionStatus[] = [
  'failed',
  'expired',
  'cancelled',
] as const;

/**
 * Accesses localStorage safely at runtime.
 * Strictly throws CheckoutRecoveryStorageError if localStorage is unavailable, blocked, or throws.
 */
function getLocalStorage(): Storage {
  if (typeof window === 'undefined') {
    throw new CheckoutRecoveryStorageError(
      'Window / DOM environment is unavailable. Checkout attempt recovery requires a client runtime.'
    );
  }
  try {
    const storage = window.localStorage;
    if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function') {
      throw new Error('window.localStorage interface is missing or inaccessible');
    }
    return storage;
  } catch (err) {
    throw new CheckoutRecoveryStorageError(
      'Browser localStorage is unavailable or access was blocked. Cannot safely recover or persist checkout attempt identity.',
      err
    );
  }
}

/**
 * Recursively serializes arbitrary values to canonical JSON with sorted object keys.
 */
export function canonicalizeJson(val: unknown): string {
  if (val === null || typeof val !== 'object') {
    return JSON.stringify(val);
  }
  if (Array.isArray(val)) {
    return '[' + val.map(canonicalizeJson).join(',') + ']';
  }
  const obj = val as Record<string, unknown>;
  const sortedKeys = Object.keys(obj).sort();
  const entries = sortedKeys
    .filter((k) => obj[k] !== undefined)
    .map((k) => `${JSON.stringify(k)}:${canonicalizeJson(obj[k])}`);
  return '{' + entries.join(',') + '}';
}

/**
 * Computes lowercase 64-character hexadecimal SHA-256 digest using globalThis.crypto.subtle.
 * Strictly fails closed if Web Crypto API is unavailable.
 */
export async function computeSha256Hex(data: string): Promise<string> {
  const cryptoApi = typeof globalThis !== 'undefined' ? globalThis.crypto : undefined;
  if (!cryptoApi?.subtle?.digest) {
    throw new Error(
      'Web Crypto API (globalThis.crypto.subtle.digest) is unavailable. Checkout fingerprinting must fail closed.'
    );
  }
  const encoder = new TextEncoder();
  const bytes = encoder.encode(data);
  const digestBuffer = await cryptoApi.subtle.digest('SHA-256', bytes);
  const hashArray = Array.from(new Uint8Array(digestBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Computes a 64-character lowercase SHA-256 digest for user scope isolation.
 */
export async function computeHashedUserScope(userScope?: string | null): Promise<string> {
  const normalized = userScope && typeof userScope === 'string' && userScope.trim() ? userScope.trim() : 'anonymous';
  return computeSha256Hex(`mevapur-scope:${normalized}`);
}

/**
 * Derives scoped storage key: mevapur:checkout-attempt:v1:<hashedUserScope>
 */
export function getStorageKey(hashedUserScope: string): string {
  return `${STORAGE_KEY_PREFIX}${hashedUserScope}`;
}

/**
 * Normalizes shipping address and returns its cryptographic SHA-256 digest.
 * Prevents raw PII from being stored or exposed in the canonical intent.
 */
export async function computeShippingAddressHash(address: ShippingAddressInput): Promise<string> {
  const countryCode = String(address.countryCode || address.country || '').trim().toUpperCase();
  const normalized = {
    address: String(address.address || '').trim(),
    addressLine2: String(address.addressLine2 || '').trim(),
    city: String(address.city || '').trim(),
    countryCode,
    fullName: String(address.fullName || '').trim(),
    phone: String(address.phone || '').trim(),
    postalCode: String(address.postalCode || '').trim(),
    province: String(address.province || '').trim(),
  };
  return computeSha256Hex(canonicalizeJson(normalized));
}

/**
 * Builds the canonical intent object with sorted items and hashed address.
 */
export async function buildCanonicalCheckoutIntent(
  input: CheckoutIntentInput,
  hashedUserScope: string
): Promise<CanonicalCheckoutIntent> {
  const sortedItems: CanonicalCheckoutItem[] = input.items
    .map((i) => {
      const pId = String(i.productId || i.id || '').trim();
      const vId = i.variantId ? String(i.variantId).trim() : null;
      const qNum = Number(i.quantity);
      const qty = Number.isInteger(qNum) && qNum > 0 ? qNum : 1;
      return {
        productId: pId,
        variantId: vId,
        quantity: qty,
      };
    })
    .sort((a, b) => {
      const keyA = `${a.productId}:${a.variantId || ''}`;
      const keyB = `${b.productId}:${b.variantId || ''}`;
      return keyA.localeCompare(keyB);
    });

  const addressHash = await computeShippingAddressHash(input.shippingAddress);
  const destinationCountry = String(
    input.shippingAddress.countryCode || input.shippingAddress.country || ''
  ).trim().toUpperCase();

  return {
    hashedUserScope,
    items: sortedItems,
    shippingAddressHash: addressHash,
    destinationCountry,
    shippingServiceLevel: String(input.shippingServiceLevel || 'standard').trim().toLowerCase(),
    shippingAdapter: input.shippingAdapter && input.shippingAdapter.trim() ? input.shippingAdapter.trim().toLowerCase() : null,
    currency: String(input.currency || 'USD').trim().toUpperCase(),
    paymentMethod: String(input.paymentMethod || '').trim().toLowerCase(),
    couponCode: input.couponCode && input.couponCode.trim() ? input.couponCode.trim().toUpperCase() : null,
    quoteConfigVersionId: input.quoteConfigVersionId && input.quoteConfigVersionId.trim() ? input.quoteConfigVersionId.trim() : null,
    quoteIncoterm: input.quoteIncoterm && input.quoteIncoterm.trim() ? input.quoteIncoterm.trim().toUpperCase() : null,
    quoteItemsHash: input.quoteItemsHash && input.quoteItemsHash.trim() ? input.quoteItemsHash.trim() : null,
  };
}

/**
 * Computes authoritative base SHA-256 fingerprint for canonical checkout intent.
 * baseFingerprint = SHA256(canonicalCheckoutIntent)
 */
export async function computeCheckoutFingerprint(
  input: CheckoutIntentInput,
  hashedUserScope: string
): Promise<string> {
  const canonicalIntent = await buildCanonicalCheckoutIntent(input, hashedUserScope);
  const canonicalJson = canonicalizeJson(canonicalIntent);
  return computeSha256Hex(canonicalJson);
}

/**
 * Derives deterministic idempotency key from base fingerprint and generation counter.
 * idempotencyKey = "checkout-v1-" + SHA256(baseFingerprint + ":" + generation)
 */
export async function deriveIdempotencyKey(baseFingerprint: string, generation: number): Promise<string> {
  const hash = await computeSha256Hex(`${baseFingerprint}:${generation}`);
  return `checkout-v1-${hash}`;
}

/**
 * Strictly validates whether an object matches the bounded CheckoutAttemptRecord schema.
 */
export function isValidAttemptRecord(record: unknown): record is CheckoutAttemptRecord {
  if (!record || typeof record !== 'object') return false;
  const r = record as Record<string, unknown>;

  if (r.schemaVersion !== 1) return false;
  if (typeof r.baseFingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(r.baseFingerprint)) return false;
  if (typeof r.generation !== 'number' || !Number.isInteger(r.generation) || r.generation < 1) return false;
  if (typeof r.idempotencyKey !== 'string' || !/^checkout-v1-[a-f0-9]{64}$/.test(r.idempotencyKey)) return false;
  if (typeof r.status !== 'string') return false;
  if (typeof r.createdAt !== 'number' || typeof r.updatedAt !== 'number' || typeof r.recoveryExpiresAt !== 'number') return false;

  // Strict check: zero raw PII or secret fields allowed
  if (
    'userId' in r ||
    'email' in r ||
    'phone' in r ||
    'address' in r ||
    'quoteToken' in r ||
    'clientSecret' in r
  ) {
    return false;
  }

  return true;
}

let sharedBroadcastChannel: BroadcastChannel | null = null;
function getBroadcastChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel !== 'undefined') {
    try {
      if (!sharedBroadcastChannel) {
        sharedBroadcastChannel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
      }
      return sharedBroadcastChannel;
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Broadcasts sync events across tabs via BroadcastChannel if available.
 */
function broadcastSyncEvent(message: {
  type: 'ATTEMPT_UPDATED' | 'ATTEMPT_CLEARED' | 'ALL_CLEARED';
  hashedUserScope?: string;
  record?: CheckoutAttemptRecord;
}): void {
  try {
    const channel = getBroadcastChannel();
    channel?.postMessage(message);
  } catch {
    // Ignore broadcast error
  }
}

/**
 * Reads attempt record from localStorage with strict schema validation and recovery expiration logic.
 * Strictly fails closed if localStorage is inaccessible.
 */
export function getCheckoutAttempt(hashedUserScope: string): CheckoutAttemptRecord | null {
  const storage = getLocalStorage();
  const storageKey = getStorageKey(hashedUserScope);

  try {
    const raw = storage.getItem(storageKey);
    if (!raw) return null;

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      storage.removeItem(storageKey);
      broadcastSyncEvent({ type: 'ATTEMPT_CLEARED', hashedUserScope });
      return null;
    }

    if (!isValidAttemptRecord(parsed)) {
      storage.removeItem(storageKey);
      broadcastSyncEvent({ type: 'ATTEMPT_CLEARED', hashedUserScope });
      return null;
    }

    const now = Date.now();

    // Check expiration: if paymentSubmittedAt is present, record survives for at least 24 hours
    if (parsed.paymentSubmittedAt) {
      const submittedRecoveryDeadline = parsed.createdAt + SUBMITTED_PAYMENT_RECOVERY_TTL_MS;
      if (now > submittedRecoveryDeadline && now > parsed.recoveryExpiresAt) {
        storage.removeItem(storageKey);
        broadcastSyncEvent({ type: 'ATTEMPT_CLEARED', hashedUserScope });
        return null;
      }
    } else {
      if (now > parsed.recoveryExpiresAt) {
        storage.removeItem(storageKey);
        broadcastSyncEvent({ type: 'ATTEMPT_CLEARED', hashedUserScope });
        return null;
      }
    }

    return parsed;
  } catch (err) {
    if (err instanceof CheckoutRecoveryStorageError) throw err;
    try {
      storage.removeItem(storageKey);
    } catch {
      // Ignore cleanup error
    }
    return null;
  }
}

/**
 * Writes bounded, non-secret, non-PII attempt record to localStorage.
 * Strictly fails closed before POST if localStorage write or quota fails.
 */
function writeCheckoutAttemptRecord(
  hashedUserScope: string,
  record: CheckoutAttemptRecord | null
): void {
  const storage = getLocalStorage();
  const storageKey = getStorageKey(hashedUserScope);

  try {
    if (!record) {
      storage.removeItem(storageKey);
      broadcastSyncEvent({ type: 'ATTEMPT_CLEARED', hashedUserScope });
    } else {
      // Enforce strictly bounded fields and schema version 1
      const safeRecord: CheckoutAttemptRecord = {
        schemaVersion: 1,
        baseFingerprint: record.baseFingerprint,
        generation: record.generation,
        idempotencyKey: record.idempotencyKey,
        sessionId: record.sessionId ? String(record.sessionId) : undefined,
        leaseExpiresAt: record.leaseExpiresAt ? String(record.leaseExpiresAt) : undefined,
        status: record.status,
        paymentSubmittedAt: record.paymentSubmittedAt ? String(record.paymentSubmittedAt) : null,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        recoveryExpiresAt: record.recoveryExpiresAt,
      };

      storage.setItem(storageKey, JSON.stringify(safeRecord));
      broadcastSyncEvent({ type: 'ATTEMPT_UPDATED', hashedUserScope, record: safeRecord });
    }
  } catch (err) {
    if (err instanceof CheckoutRecoveryStorageError) throw err;
    throw new CheckoutRecoveryStorageError(
      'Failed to persist checkout attempt to localStorage. Checkout recovery must fail closed.',
      err
    );
  }
}

/**
 * Executes a function under navigator.locks mutual exclusion when supported, with safe direct fallback.
 */
export async function withCheckoutLock<T>(
  hashedUserScope: string,
  fn: () => Promise<T>
): Promise<T> {
  const lockName = `mevapur_checkout_lock_${hashedUserScope}`;
  if (
    typeof navigator !== 'undefined' &&
    navigator.locks &&
    typeof navigator.locks.request === 'function'
  ) {
    return navigator.locks.request(lockName, { mode: 'exclusive' }, async () => {
      return await fn();
    });
  }
  return await fn();
}

/**
 * Retrieves existing active attempt or generates a new cryptographic attempt identity in localStorage.
 * Operates under mutual exclusion and persists status "creating" before any backend POST.
 *
 * Enforces:
 * 1. Terminal-only generation rotation: forceNewAttempt requires authoritative failed, expired, or cancelled status.
 * 2. Changed-intent protection: active/in-flight attempts cannot be silently overwritten.
 */
export async function getOrCreateCheckoutAttempt(
  input: CheckoutIntentInput,
  options?: {
    forceNewAttempt?: boolean;
    userScope?: string | null;
  }
): Promise<CheckoutAttemptRecord> {
  const hashedUserScope = await computeHashedUserScope(options?.userScope);
  const baseFingerprint = await computeCheckoutFingerprint(input, hashedUserScope);

  return withCheckoutLock(hashedUserScope, async () => {
    const existing = getCheckoutAttempt(hashedUserScope);
    const now = Date.now();

    if (existing) {
      if (existing.baseFingerprint === baseFingerprint) {
        if (options?.forceNewAttempt) {
          // Rule 1: Generation rotation is ONLY allowed if authoritative prior status is terminal (failed, expired, cancelled)
          const isAuthoritativeTerminal = (AUTHORITATIVE_TERMINAL_STATUSES as readonly string[]).includes(
            existing.status
          );

          if (!isAuthoritativeTerminal || existing.paymentSubmittedAt) {
            throw new CheckoutAttemptNonTerminalRotationError(
              existing.status,
              existing.sessionId || null,
              `Cannot force a new checkout attempt when existing attempt status is '${existing.status}'. Generation rotation is strictly forbidden until the session reaches an authoritative terminal status (failed, expired, cancelled).`
            );
          }

          const nextGen = existing.generation + 1;
          const newIdempotencyKey = await deriveIdempotencyKey(baseFingerprint, nextGen);
          const rotatedRecord: CheckoutAttemptRecord = {
            schemaVersion: 1,
            baseFingerprint,
            generation: nextGen,
            idempotencyKey: newIdempotencyKey,
            status: 'creating',
            createdAt: now,
            updatedAt: now,
            recoveryExpiresAt: now + DEFAULT_RECOVERY_TTL_MS,
          };
          writeCheckoutAttemptRecord(hashedUserScope, rotatedRecord);
          return rotatedRecord;
        }

        // Re-use existing attempt and idempotency key across reloads and simultaneous tabs
        return existing;
      }

      // Rule 2: Changed intent cannot overwrite an existing active or submitted attempt
      if (existing.status === 'conflict') {
        if (now > existing.recoveryExpiresAt) {
          // Bounded conflict retention has expired; explicitly purge it before creating fresh attempt
          clearCheckoutAttempt(hashedUserScope);
        } else {
          throw new CheckoutAttemptActiveIntentConflictError({
            existingSessionId: existing.sessionId || null,
            existingStatus: existing.status,
            existingRecoveryExpiresAt: existing.recoveryExpiresAt,
          });
        }
      } else {
        const isAuthoritativeTerminal = (AUTHORITATIVE_TERMINAL_STATUSES as readonly string[]).includes(
          existing.status
        );

        if (!isAuthoritativeTerminal || existing.paymentSubmittedAt) {
          throw new CheckoutAttemptActiveIntentConflictError({
            existingSessionId: existing.sessionId || null,
            existingStatus: existing.status,
            existingRecoveryExpiresAt: existing.recoveryExpiresAt,
          });
        }
      }
    }

    // New intent or initial attempt -> generation 1
    const generation = 1;
    const idempotencyKey = await deriveIdempotencyKey(baseFingerprint, generation);
    const freshRecord: CheckoutAttemptRecord = {
      schemaVersion: 1,
      baseFingerprint,
      generation,
      idempotencyKey,
      status: 'creating',
      createdAt: now,
      updatedAt: now,
      recoveryExpiresAt: now + DEFAULT_RECOVERY_TTL_MS,
    };
    writeCheckoutAttemptRecord(hashedUserScope, freshRecord);
    return freshRecord;
  });
}

/**
 * Monotonically updates session references and authoritative status on the active attempt.
 * Enforces strict anti-regression rules to prevent stale responses from rolling back advanced states.
 */
export function updateCheckoutAttemptSession(
  hashedUserScope: string,
  updates: {
    sessionId?: string;
    leaseExpiresAt?: string;
    status?: CheckoutAttemptStatus;
    paymentSubmittedAt?: string | null;
    expectedGeneration?: number;
    expectedFingerprint?: string;
    expectedIdempotencyKey?: string;
  }
): CheckoutAttemptRecord | null {
  const current = getCheckoutAttempt(hashedUserScope);
  if (!current) {
    return null;
  }

  // Verify generation and fingerprint match if specified
  if (updates.expectedGeneration !== undefined && updates.expectedGeneration < current.generation) {
    throw new CheckoutAttemptStaleUpdateError(
      `Update generation (${updates.expectedGeneration}) is older than current persisted attempt generation (${current.generation})`
    );
  }

  if (updates.expectedFingerprint !== undefined && updates.expectedFingerprint !== current.baseFingerprint) {
    throw new CheckoutAttemptStaleUpdateError(
      `Update fingerprint does not match current persisted attempt baseFingerprint`
    );
  }

  if (updates.expectedIdempotencyKey !== undefined && updates.expectedIdempotencyKey !== current.idempotencyKey) {
    throw new CheckoutAttemptStaleUpdateError(
      `Update idempotencyKey does not match current persisted attempt idempotencyKey`
    );
  }

  // If authoritative server status is converted, clear the record immediately
  if (updates.status === 'converted' || current.status === 'converted') {
    clearCheckoutAttempt(hashedUserScope);
    return null;
  }

  // Prevent status regressions from stale cross-tab responses
  const incomingStatus = updates.status;
  if (incomingStatus) {
    const protectedTerminalAndPaymentStates: readonly CheckoutAttemptStatus[] = [
      'payment_captured',
      'converting',
      'conflict',
      'cancelled',
      'expired',
      'failed',
    ];

    if (protectedTerminalAndPaymentStates.includes(current.status)) {
      const earlyStates: readonly CheckoutAttemptStatus[] = ['creating', 'active', 'payment_pending'];
      if (earlyStates.includes(incomingStatus)) {
        throw new CheckoutAttemptStaleUpdateError(
          `Cannot regress state from advanced status '${current.status}' to earlier status '${incomingStatus}'`
        );
      }

      if (current.status === 'converting' && incomingStatus === 'payment_captured') {
        throw new CheckoutAttemptStaleUpdateError(
          `Cannot regress state from 'converting' to 'payment_captured'`
        );
      }
    }
  }

  const now = Date.now();
  let recoveryExpiresAt = current.recoveryExpiresAt;

  if (updates.paymentSubmittedAt) {
    const submittedDuration = now + SUBMITTED_PAYMENT_RECOVERY_TTL_MS;
    if (submittedDuration > recoveryExpiresAt) {
      recoveryExpiresAt = submittedDuration;
    }
  }

  const updated: CheckoutAttemptRecord = {
    ...current,
    sessionId: updates.sessionId !== undefined ? updates.sessionId : current.sessionId,
    leaseExpiresAt: updates.leaseExpiresAt !== undefined ? updates.leaseExpiresAt : current.leaseExpiresAt,
    status: updates.status !== undefined ? updates.status : current.status,
    paymentSubmittedAt:
      updates.paymentSubmittedAt !== undefined ? updates.paymentSubmittedAt : current.paymentSubmittedAt,
    updatedAt: now,
    recoveryExpiresAt,
  };

  writeCheckoutAttemptRecord(hashedUserScope, updated);
  return updated;
}

/**
 * Records that payment was submitted by the customer.
 * Extends recoverability window for at least 24 hours regardless of lease expiry.
 */
export function recordPaymentSubmitted(
  hashedUserScope: string,
  submittedAt?: string
): CheckoutAttemptRecord | null {
  const current = getCheckoutAttempt(hashedUserScope);
  if (!current) {
    return null;
  }

  const isoTime = submittedAt || new Date().toISOString();
  const now = Date.now();
  const extendedRecovery = now + SUBMITTED_PAYMENT_RECOVERY_TTL_MS;

  const updated: CheckoutAttemptRecord = {
    ...current,
    paymentSubmittedAt: isoTime,
    updatedAt: now,
    recoveryExpiresAt: extendedRecovery > current.recoveryExpiresAt ? extendedRecovery : current.recoveryExpiresAt,
  };

  writeCheckoutAttemptRecord(hashedUserScope, updated);
  return updated;
}

/**
 * Purges a single scoped checkout attempt record from localStorage.
 */
export function clearCheckoutAttempt(hashedUserScope: string): void {
  if (typeof window === 'undefined') return;
  try {
    const storage = window.localStorage;
    const storageKey = getStorageKey(hashedUserScope);
    storage?.removeItem(storageKey);
    broadcastSyncEvent({ type: 'ATTEMPT_CLEARED', hashedUserScope });
  } catch {
    // Ignore cleanup error on logout / invalidation
  }
}

/**
 * Purges every checkout attempt record in the mevapur:checkout-attempt:v1: namespace.
 * Must be called in all logout and session invalidation flows.
 */
export function clearAllCheckoutAttempts(): void {
  if (typeof window === 'undefined') return;
  try {
    const storage = window.localStorage;
    if (!storage) return;

    const keysToRemove: string[] = [];
    const len = storage.length;
    for (let i = 0; i < len; i++) {
      const key = storage.key(i);
      if (key && key.startsWith(STORAGE_KEY_PREFIX)) {
        keysToRemove.push(key);
      }
    }

    for (const key of keysToRemove) {
      storage.removeItem(key);
    }
    broadcastSyncEvent({ type: 'ALL_CLEARED' });
  } catch {
    // Ignore cleanup error on logout / invalidation
  }
}

/**
 * Subscribes to cross-tab synchronization events via BroadcastChannel and window storage events.
 */
export function subscribeCheckoutAttemptSync(
  callback: (event: {
    type: 'ATTEMPT_UPDATED' | 'ATTEMPT_CLEARED' | 'ALL_CLEARED';
    hashedUserScope?: string;
    record?: CheckoutAttemptRecord;
  }) => void
): () => void {
  if (typeof window === 'undefined') return () => {};

  let channel: BroadcastChannel | null = null;
  if (typeof BroadcastChannel !== 'undefined') {
    try {
      channel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
      channel.onmessage = (event) => {
        if (event.data) {
          callback(event.data);
        }
      };
    } catch {
      channel = null;
    }
  }

  const handleStorage = (event: StorageEvent) => {
    if (event.key && event.key.startsWith(STORAGE_KEY_PREFIX)) {
      const hashedUserScope = event.key.slice(STORAGE_KEY_PREFIX.length);
      if (event.newValue) {
        try {
          const parsed = JSON.parse(event.newValue);
          if (isValidAttemptRecord(parsed)) {
            callback({ type: 'ATTEMPT_UPDATED', hashedUserScope, record: parsed });
          }
        } catch {
          // Ignore parse errors
        }
      } else {
        callback({ type: 'ATTEMPT_CLEARED', hashedUserScope });
      }
    }
  };

  window.addEventListener('storage', handleStorage);

  return () => {
    channel?.close();
    window.removeEventListener('storage', handleStorage);
  };
}

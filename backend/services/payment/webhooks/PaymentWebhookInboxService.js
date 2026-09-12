/**
 * @file PaymentWebhookInboxService.js
 * @description Canonical Ingress Service for Durable Payment Webhook Ingestion.
 *
 * Responsibilities:
 * 1. Validates bounded raw Buffer payload before JSON parsing.
 * 2. Authenticates provider signatures, timestamp tolerances, and livemode/environment invariants.
 * 3. Normalizes verified events into strict allowlisted data.
 * 4. Persists durable inbox record into PaymentWebhookEvent before acknowledgment.
 * 5. Handles duplicate deliveries atomically:
 *    - Same identity + same payload hash -> stable 200 duplicate response.
 *    - Same identity + different payload hash -> 409 integrity conflict (never overwrites).
 * 6. Guarantees zero writes on unauthenticated or malformed requests.
 */

'use strict';

const crypto = require('crypto');
const PaymentWebhookEvent = require('../../../models/PaymentWebhookEvent');
const paymentProviderRegistry = require('../../../modules/payments/core/providerRegistry');
const { AppError } = require('../../../common/errors/AppError');
const { WEBHOOK_PROCESSING_STATUSES } = require('../../../constants/paymentConstants');

const MAX_PAYLOAD_BYTES = 256 * 1024; // 256 KB bounded limit

const isDuplicateKey = (error) => error?.code === 11000;

class PaymentWebhookInboxService {
  /**
   * Ingests, authenticates, and persists an incoming webhook event durably.
   * @param {Object} params
   * @param {string} params.provider - Normalized provider code (e.g. 'stripe')
   * @param {Buffer} params.rawBody - Untouched raw request bytes
   * @param {string} params.signature - Webhook signature header
   * @param {Object} [params.headers] - Request headers
   * @param {string} [params.requestId] - Request correlation ID
   * @param {string} [params.accountAlias='default'] - Trusted merchant account alias
   * @param {string} [params.environment] - Trusted environment ('sandbox' | 'production')
   * @param {string} [params.secret] - Injected secret for test environments
   * @param {number} [params.toleranceSeconds=300] - Timestamp tolerance in seconds
   * @returns {Promise<{ received: boolean, duplicate: boolean, status: string, eventId: string, providerEventId: string }>}
   */
  async recordWebhook({
    provider: providerName,
    rawBody,
    signature,
    headers = {},
    requestId = '',
    accountAlias = 'default',
    environment = null,
    secret = null,
    toleranceSeconds = 300
  }) {
    if (!providerName || typeof providerName !== 'string') {
      throw new AppError('Payment provider is required for webhook ingestion', 400, 'PAYMENT_PROVIDER_REQUIRED');
    }

    const normalizedProvider = providerName.trim().toLowerCase();

    if (!Buffer.isBuffer(rawBody)) {
      throw new AppError(
        'Webhook body must be provided as raw bytes',
        400,
        'PAYMENT_WEBHOOK_VERIFICATION_FAILED'
      );
    }

    if (rawBody.length > MAX_PAYLOAD_BYTES) {
      throw new AppError(
        'Webhook payload exceeds maximum allowable size of 256KB',
        400,
        'PAYMENT_WEBHOOK_PAYLOAD_TOO_LARGE'
      );
    }

    if (!signature || typeof signature !== 'string') {
      throw new AppError(
        'Missing webhook signature header',
        400,
        'PAYMENT_WEBHOOK_VERIFICATION_FAILED'
      );
    }

    let provider;
    try {
      provider = paymentProviderRegistry.getInstalled(normalizedProvider);
    } catch (_err) {
      throw new AppError(
        `Provider '${normalizedProvider}' is not supported or not installed`,
        400,
        'PAYMENT_PROVIDER_UNSUPPORTED'
      );
    }

    const manifest = provider.getManifest ? provider.getManifest() : {};
    if (!manifest.requiresWebhook && !manifest.supportsSignatureVerification) {
      throw new AppError(
        `Provider '${normalizedProvider}' does not declare webhook signature support`,
        400,
        'PAYMENT_PROVIDER_UNSUPPORTED'
      );
    }

    const resolvedEnvironment = environment
      || (process.env.NODE_ENV === 'production' ? 'production' : 'sandbox');

    const verifiedEvent = provider.verifyWebhookSignature({
      rawBody,
      signatureHeaders: signature,
      headers,
      account: {
        accountAlias,
        environment: resolvedEnvironment
      },
      secret,
      toleranceSeconds
    });

    if (!verifiedEvent || typeof verifiedEvent.id !== 'string') {
      throw new AppError(
        'The verified webhook event is malformed',
        400,
        'PAYMENT_WEBHOOK_VERIFICATION_FAILED'
      );
    }

    const normalizedData = provider.normalizeWebhookEvent({
      rawBody,
      verifiedEvent,
      account: {
        accountAlias,
        environment: resolvedEnvironment
      }
    });

    const payloadHash = crypto.createHash('sha256').update(rawBody).digest('hex');

    try {
      const eventDoc = await PaymentWebhookEvent.create({
        provider: normalizedProvider,
        accountAlias: accountAlias || 'default',
        environment: resolvedEnvironment,
        providerEventId: normalizedData.providerEventId,
        eventType: normalizedData.eventType,
        providerPaymentId: normalizedData.providerPaymentId || '',
        providerRefundId: normalizedData.providerRefundId || '',
        providerCreatedAt: normalizedData.eventCreatedAt || null,
        livemode: normalizedData.livemode || false,
        normalizedObjectType: normalizedData.normalizedObjectType || '',
        amountMinor: normalizedData.amountMinor || 0,
        currency: normalizedData.currency || '',
        payloadHash,
        eventData: normalizedData,
        status: WEBHOOK_PROCESSING_STATUSES.RECEIVED,
        attemptCount: 0,
        nextAttemptAt: new Date(),
        requestId: requestId || ''
      });

      return {
        received: true,
        duplicate: false,
        status: eventDoc.status,
        eventId: String(eventDoc._id),
        providerEventId: eventDoc.providerEventId
      };
    } catch (error) {
      if (isDuplicateKey(error)) {
        const existing = await PaymentWebhookEvent.findOne({
          provider: normalizedProvider,
          environment: resolvedEnvironment,
          accountAlias: accountAlias || 'default',
          providerEventId: normalizedData.providerEventId
        }).select('+payloadHash');

        if (existing) {
          const hashA = Buffer.from(existing.payloadHash || '', 'utf8');
          const hashB = Buffer.from(payloadHash, 'utf8');

          const isIdentical = hashA.length === hashB.length && crypto.timingSafeEqual(hashA, hashB);
          if (isIdentical) {
            return {
              received: true,
              duplicate: true,
              status: existing.status,
              eventId: String(existing._id),
              providerEventId: existing.providerEventId
            };
          }

          throw new AppError(
            'Webhook event identifier was reused with a different payload',
            409,
            'PAYMENT_WEBHOOK_VERIFICATION_FAILED'
          );
        }
      }

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        'Webhook persistence failed',
        503,
        'PAYMENT_WEBHOOK_PERSISTENCE_FAILED'
      );
    }
  }
}

module.exports = new PaymentWebhookInboxService();

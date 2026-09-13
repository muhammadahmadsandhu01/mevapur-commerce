const crypto = require('crypto');
const mongoose = require('mongoose');
const Order = require('../../models/Order');
const Payment = require('../../models/Payment');
const PaymentWebhookEvent = require('../../models/PaymentWebhookEvent');
const paymentProviderRegistry = require('../../modules/payments/core/providerRegistry');
const PaymentCapabilityPolicy = require('./PaymentCapabilityPolicy');
const refundService = require('./RefundService');
const paymentStateMachine = require('./stateMachine/PaymentStateMachine');
const AuditService = require('../AuditService');
const MarketService = require('../MarketService');
const logger = require('../../utils/logger');
const { AppError } = require('../../common/errors/AppError');
const {
  PAYMENT_STATUSES,
  PROVIDER_ATTEMPT_STATUSES,
  WEBHOOK_PROCESSING_STATUSES
} = require('../../constants/paymentConstants');
const { Money, MoneyMapper, CurrencyRegistry, RolloutAuthority, OrderCurrencyResolver } = require('../../modules/commerce');
const paymentWebhookInboxService = require('./webhooks/PaymentWebhookInboxService');
const paymentWebhookProcessor = require('./webhooks/PaymentWebhookProcessor');

const PAYMENT_EVENT_TYPES = new Set([
  'payment_intent.processing',
  'payment_intent.succeeded',
  'payment_intent.payment_failed',
  'payment_intent.canceled',
  'payment_intent.amount_capturable_updated',
  'payment_intent.requires_action'
]);

const REFUND_EVENT_TYPES = new Set([
  'refund.created',
  'refund.updated',
  'refund.failed'
]);

const hashValue = (value) => crypto
  .createHash('sha256')
  .update(typeof value === 'string' || Buffer.isBuffer(value)
    ? value
    : JSON.stringify(value))
  .digest('hex');

const isDuplicateKey = (error) => error?.code === 11000;
const CLAIM_LEASE_MS = 30 * 1000;

const IDEMPOTENCY_KEY_REGEX = /^[A-Za-z0-9_\-\.:]{1,128}$/;

const validateIdempotencyKey = (key) => {
  if (key === undefined || key === null) return true;
  if (typeof key !== 'string') return false;
  const trimmed = key.trim();
  if (trimmed.length < 1 || trimmed.length > 128) return false;
  if (!IDEMPOTENCY_KEY_REGEX.test(trimmed)) return false;
  if (/@|:\/\/|Bearer|Basic/i.test(trimmed)) return false;
  return true;
};

const deriveProviderKey = (prefix, entityId, clientKey) => {
  const rawKey = clientKey || crypto.randomUUID();
  const digest = hashValue(rawKey).substring(0, 32);
  return `${prefix}:${entityId}:${digest}`;
};

const validateReturnUrl = (returnUrl) => {
  if (!returnUrl || typeof returnUrl !== 'string') return true;
  if (/[\x00-\x1F\x7F]/.test(returnUrl)) return false;
  try {
    const parsed = new URL(returnUrl);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return false;
    }
    if (parsed.username || parsed.password) {
      return false;
    }
    const allowedOrigins = [
      process.env.CLIENT_URL,
      process.env.FRONTEND_URL,
      'http://localhost:3000',
      'http://localhost:3001',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:3001'
    ].filter(Boolean).map((o) => {
      try { return new URL(o).origin; } catch { return o; }
    });
    return allowedOrigins.includes(parsed.origin);
  } catch {
    return false;
  }
};

class PaymentService {
  getProvider(providerName, context = {}) {
    return paymentProviderRegistry.resolve(providerName, context);
  }

  static resolveAuthoritativeOrderCurrency(order) {
    return OrderCurrencyResolver.resolveOrderCurrency(order);
  }

  resolveAuthoritativeOrderCurrency(order) {
    return OrderCurrencyResolver.resolveOrderCurrency(order);
  }

  async createPayment({
    userId,
    orderId,
    provider,
    returnUrl,
    idempotencyKey
  }) {
    if (idempotencyKey && !validateIdempotencyKey(idempotencyKey)) {
      throw new AppError(
        'The Idempotency-Key header is invalid or contains prohibited characters',
        400,
        'PAYMENT_IDEMPOTENCY_KEY_INVALID'
      );
    }

    if (returnUrl && !validateReturnUrl(returnUrl)) {
      throw new AppError(
        'The return URL origin is invalid or unauthorized',
        400,
        'PAYMENT_URL_INVALID'
      );
    }

    const order = await Order.findById(orderId);
    if (!order) {
      throw new AppError('Order not found', 404, 'ORDER_NOT_FOUND');
    }
    if (String(order.user) !== String(userId)) {
      throw new AppError(
        'The order does not belong to the authenticated account',
        403,
        'PAYMENT_FORBIDDEN'
      );
    }
    if (
      order.orderStatus === 'Cancelled'
      || order.paymentStatus === 'Paid'
      || order.paymentMethod !== provider
    ) {
      throw new AppError(
        'The order is not eligible for this payment method',
        409,
        'PAYMENT_ORDER_NOT_PAYABLE'
      );
    }

    const existingCompleted = await Payment.findOne({
      order: order._id,
      status: {
        $in: [
          PAYMENT_STATUSES.COMPLETED,
          PAYMENT_STATUSES.PARTIALLY_REFUNDED,
          PAYMENT_STATUSES.REFUNDED
        ]
      }
    });
    if (existingCompleted) {
      throw new AppError(
        'The order has already been paid and cannot be charged again',
        409,
        'PAYMENT_ORDER_NOT_PAYABLE'
      );
    }

    const paymentCurrency = this.resolveAuthoritativeOrderCurrency(order);

    await PaymentCapabilityPolicy.assertEligibleForOrder(order, provider, paymentCurrency);

    const providerAdapter = this.getProvider(provider, {
      country: order.shippingAddress?.countryCode || order.shippingAddress?.country,
      currency: paymentCurrency,
      amount: order.totalAmount
    });
    const providerManifest = providerAdapter.getManifest();

    const amountExact = order.totalAmountExact || MoneyMapper.fromLegacy(order.totalAmount, paymentCurrency);

    const isProd = process.env.NODE_ENV === 'production';
    const merchantAccount = await PaymentCapabilityPolicy.getMerchantAccount(provider, isProd ? 'production' : 'sandbox');

    const requestHash = hashValue({
      operation: 'initiate',
      orderId: String(order._id),
      provider,
      accountAlias: merchantAccount?.accountAlias || 'default',
      environment: merchantAccount?.environment || (isProd ? 'production' : 'sandbox'),
      currency: paymentCurrency,
      amountMinor: String(amountExact.amountMinor)
    });

    const activePayment = await Payment.findOne({
      order: order._id,
      status: {
        $in: [
          PAYMENT_STATUSES.PENDING,
          PAYMENT_STATUSES.PROCESSING,
          PAYMENT_STATUSES.REQUIRES_CUSTOMER_ACTION,
          PAYMENT_STATUSES.AUTHORIZED,
          PAYMENT_STATUSES.AWAITING_CUSTOMER_PAYMENT,
          PAYMENT_STATUSES.AWAITING_VERIFICATION
        ]
      }
    }).select(
      '+idempotencyKey +requestHash +providerIdempotencyKey '
      + '+providerAttemptStatus +providerClaimToken +providerClaimedAt '
      + '+providerAttemptCount'
    );

    if (activePayment) {
      if (activePayment.idempotencyKey === idempotencyKey && String(activePayment.user) === String(userId)) {
        this.assertIdempotencyMatch(activePayment, requestHash);
        return this.resumePayment(activePayment, true);
      }
      throw new AppError(
        'A payment attempt is already in progress for this order',
        409,
        'PAYMENT_OPERATION_IN_FLIGHT'
      );
    }

    let payment = await this.findByIdempotency({
      userId,
      idempotencyKey
    });

    if (payment) {
      this.assertIdempotencyMatch(payment, requestHash);
      return this.resumePayment(payment, true);
    }

    const providerIdempotencyKey = deriveProviderKey('payment', order._id, idempotencyKey);

    try {
      payment = await Payment.create({
        order: order._id,
        user: userId,
        provider,
        gateway: provider,
        status: PAYMENT_STATUSES.PENDING,
        amount: order.totalAmount,
        amountExact,
        currency: paymentCurrency,
        providerDisplayName: providerManifest.displayName,
        providerIntegrationVersion: providerManifest.integrationVersion,
        paymentType: providerManifest.paymentType,
        capabilitySnapshot: {
          ...providerAdapter.getCapabilities(),
          accountAlias: merchantAccount?.accountAlias || 'default',
          environment: merchantAccount?.environment || (isProd ? 'production' : 'sandbox')
        },
        idempotencyKey,
        requestHash,
        providerIdempotencyKey,
        history: []
      });
      payment = await this.findInternal(payment._id);
    } catch (error) {
      if (!isDuplicateKey(error)) {
        throw error;
      }
      const existing = await this.findByIdempotency({ userId, idempotencyKey })
        || await Payment.findOne({
          order: order._id,
          status: {
            $in: [
              PAYMENT_STATUSES.PENDING,
              PAYMENT_STATUSES.PROCESSING,
              PAYMENT_STATUSES.REQUIRES_CUSTOMER_ACTION,
              PAYMENT_STATUSES.AUTHORIZED,
              PAYMENT_STATUSES.AWAITING_CUSTOMER_PAYMENT,
              PAYMENT_STATUSES.AWAITING_VERIFICATION
            ]
          }
        }).select(
          '+idempotencyKey +requestHash +providerIdempotencyKey '
          + '+providerAttemptStatus +providerClaimToken +providerClaimedAt '
          + '+providerAttemptCount'
        );

      if (!existing) {
        throw error;
      }

      if (existing.idempotencyKey === idempotencyKey && String(existing.user) === String(userId)) {
        this.assertIdempotencyMatch(existing, requestHash);
        return this.resumePayment(existing, true);
      }

      throw new AppError(
        'A payment attempt is already in progress for this order',
        409,
        'PAYMENT_OPERATION_IN_FLIGHT'
      );
    }

    return this.resumePayment(payment, false);
  }

  async findByIdempotency({ userId, idempotencyKey }) {
    return Payment.findOne({
      user: userId,
      idempotencyKey
    }).select(
      '+idempotencyKey +requestHash +providerIdempotencyKey '
      + '+providerAttemptStatus +providerClaimToken +providerClaimedAt '
      + '+providerAttemptCount'
    );
  }

  async findInternal(paymentId, session = null) {
    const query = Payment.findById(paymentId).select(
      '+idempotencyKey +requestHash +providerIdempotencyKey '
      + '+providerAttemptStatus +providerClaimToken +providerClaimedAt '
      + '+providerAttemptCount +refundReservedAmount '
      + '+captureIdempotencyKey +captureRequestHash +captureAttemptStatus +captureClaimToken +captureClaimedAt '
      + '+cancelIdempotencyKey +cancelRequestHash +cancelAttemptStatus +cancelClaimToken +cancelClaimedAt '
      + '+voidIdempotencyKey +voidRequestHash +voidAttemptStatus +voidClaimToken +voidClaimedAt'
    );
    return session ? query.session(session) : query;
  }

  assertIdempotencyMatch(payment, requestHash) {
    if (payment.requestHash !== requestHash) {
      throw new AppError(
        'Idempotency-Key was already used for a different payment request',
        409,
        'PAYMENT_IDEMPOTENCY_CONFLICT'
      );
    }
  }

  async resumePayment(payment, idempotentReplay) {
    if (
      payment.providerPaymentId
      && [
        PAYMENT_STATUSES.PENDING,
        PAYMENT_STATUSES.PROCESSING,
        PAYMENT_STATUSES.FAILED
      ].includes(payment.status)
    ) {
      const provider = paymentProviderRegistry.getInstalled(payment.provider);
      const providerResult = await provider.retrievePayment(
        payment.providerPaymentId,
        {
          providerConfig:
            paymentProviderRegistry.providerConfigs[payment.provider] || {}
        }
      );
      this.assertProviderMetadata(payment, providerResult.metadata);
      return this.toPaymentSession(payment, {
        ...providerResult,
        idempotentReplay: true
      });
    }

    if (
      [
        PAYMENT_STATUSES.COMPLETED,
        PAYMENT_STATUSES.PARTIALLY_REFUNDED,
        PAYMENT_STATUSES.REFUNDED,
        PAYMENT_STATUSES.CANCELLED,
        PAYMENT_STATUSES.REJECTED,
        PAYMENT_STATUSES.EXPIRED,
        PAYMENT_STATUSES.AWAITING_CUSTOMER_PAYMENT,
        PAYMENT_STATUSES.AWAITING_VERIFICATION
      ].includes(payment.status)
    ) {
      return this.toPaymentSession(payment, { idempotentReplay: true });
    }

    const claimToken = crypto.randomUUID();
    const claimed = await Payment.findOneAndUpdate({
      _id: payment._id,
      providerPaymentId: { $in: [null, ''] },
      $or: [{
        providerAttemptStatus: {
          $in: [
            PROVIDER_ATTEMPT_STATUSES.UNCLAIMED,
            PROVIDER_ATTEMPT_STATUSES.FAILED
          ]
        }
      }, {
        providerAttemptStatus: PROVIDER_ATTEMPT_STATUSES.CLAIMED,
        providerClaimedAt: {
          $lt: new Date(Date.now() - CLAIM_LEASE_MS)
        }
      }]
    }, {
      $set: {
        providerAttemptStatus: PROVIDER_ATTEMPT_STATUSES.CLAIMED,
        providerClaimToken: claimToken,
        providerClaimedAt: new Date()
      },
      $inc: { providerAttemptCount: 1 }
    }, {
      new: true
    }).select(
      '+idempotencyKey +requestHash +providerIdempotencyKey +providerAttemptStatus +providerClaimToken '
      + '+providerClaimedAt +providerAttemptCount'
    );

    if (!claimed) {
      const current = await Payment.findById(payment._id);
      return this.toPaymentSession(current, {
        idempotentReplay: true,
        providerOperationPending: true
      });
    }

    const providerAdapter = this.getProvider(claimed.provider, {
      currency: claimed.currency,
      amount: claimed.amount,
      country: claimed.paymentType === 'automated' ? '' : 'Pakistan'
    });
    const providerManifest = providerAdapter.getManifest();

    if (providerManifest.paymentType === 'automated') {
      paymentStateMachine.apply(claimed, PAYMENT_STATUSES.PROCESSING, {
        source: 'api'
      });
      await claimed.save();
    }

    try {
      const providerResult = await providerAdapter.createPayment({
        amount: claimed.amount,
        currency: claimed.currency,
        paymentId: claimed._id,
        orderId: claimed.order,
          environment: process.env.NODE_ENV === 'production'
            ? 'production'
            : 'non-production',
          idempotencyKey: claimed.providerIdempotencyKey,
          providerConfig:
            paymentProviderRegistry.providerConfigs[claimed.provider] || {}
      });

      const isAuthorized = providerResult.status === PAYMENT_STATUSES.AUTHORIZED;
      const persisted = await Payment.findOneAndUpdate({
        _id: claimed._id,
        providerClaimToken: claimToken
      }, {
        $set: {
          providerPaymentId: providerResult.providerPaymentId,
          safeProviderReference: providerResult.providerPaymentId,
          customerAction: providerResult.customerAction || null,
          providerAttemptStatus: PROVIDER_ATTEMPT_STATUSES.READY,
          authorizedAmount: isAuthorized ? (providerResult.authorizedAmount ?? claimed.amount) : null,
          authorizedAmountExact: isAuthorized ? (claimed.amountExact || MoneyMapper.fromLegacy(claimed.amount, claimed.currency)) : null,
          authorizationExpiresAt: providerResult.authorizationExpiresAt || null,
          failureCode: ''
        }
      }, {
        new: true
      });

      if (!persisted) {
        throw new AppError(
          'Payment provider result could not be persisted',
          503,
          'PAYMENT_PROVIDER_RESULT_NOT_PERSISTED'
        );
      }

      if (
        providerResult.status
        && paymentStateMachine.canTransition(
          persisted.status,
          providerResult.status
        )
        && persisted.status !== providerResult.status
      ) {
        paymentStateMachine.apply(persisted, providerResult.status, {
          source: 'provider'
        });
        await persisted.save();
      }

      logger.info('Payment provider session created', {
        paymentId: String(persisted._id),
        orderId: String(persisted.order),
        provider: persisted.provider,
        requestId: undefined
      });

      await AuditService.log({
        userId: persisted.user,
        eventName: 'PAYMENT.INITIATED',
        status: 'SUCCESS',
        metadata: {
          paymentId: String(persisted._id),
          orderId: String(persisted.order),
          provider: persisted.provider,
          currency: persisted.currency,
          amount: persisted.amount
        }
      });

      return this.toPaymentSession(persisted, {
        ...providerResult,
        idempotentReplay: Boolean(idempotentReplay && claimed.providerAttemptCount > 1)
      });
    } catch (error) {
      await this.markProviderAttemptFailed(claimed._id, claimToken);
      throw error;
    }
  }

  async markProviderAttemptFailed(paymentId, claimToken) {
    const payment = await this.findInternal(paymentId);
    if (!payment || payment.providerClaimToken !== claimToken) {
      return;
    }

    payment.providerAttemptStatus = PROVIDER_ATTEMPT_STATUSES.FAILED;
    payment.failureCode = 'PAYMENT_PROVIDER_ERROR';
    paymentStateMachine.apply(payment, PAYMENT_STATUSES.FAILED, {
      source: 'system',
      errorCode: 'PAYMENT_PROVIDER_ERROR'
    });
    await payment.save();
  }

  assertProviderMetadata(payment, metadata) {
    if (
      metadata?.paymentId
      && String(metadata.paymentId) !== String(payment._id)
    ) {
      throw new AppError(
        'Provider payment metadata does not match the payment record',
        422,
        'PAYMENT_WEBHOOK_METADATA_MISMATCH'
      );
    }
    if (
      metadata?.orderId
      && String(metadata.orderId) !== String(payment.order)
    ) {
      throw new AppError(
        'Provider order metadata does not match the payment record',
        422,
        'PAYMENT_WEBHOOK_METADATA_MISMATCH'
      );
    }
  }

  toPaymentSession(payment, {
    clientSecret = null,
    customerAction = null,
    idempotentReplay = false,
    providerOperationPending = false
  } = {}) {
    const result = {
      idempotentReplay,
      providerOperationPending,
      payment: this.toPublicPayment(payment)
    };

    if (
      clientSecret
      && [
        PAYMENT_STATUSES.PENDING,
        PAYMENT_STATUSES.PROCESSING,
        PAYMENT_STATUSES.FAILED
      ].includes(payment.status)
    ) {
      result.clientSecret = clientSecret;
    }
    if (customerAction || payment.customerAction) {
      result.customerAction = customerAction || payment.customerAction;
    }

    return result;
  }

  toPublicPayment(payment) {
    if (!payment) {
      return null;
    }

    const value = payment.toJSON ? payment.toJSON() : { ...payment };
    return {
      _id: value._id,
      order: value.order,
      provider: value.provider,
      providerDisplayName: value.providerDisplayName || value.provider,
      providerIntegrationVersion:
        value.providerIntegrationVersion || 'historical',
      paymentType: value.paymentType || 'historical',
      capabilities: value.capabilitySnapshot || {},
      providerPaymentId: value.providerPaymentId || '',
      safeProviderReference:
        value.safeProviderReference || value.providerPaymentId || '',
      customerAction: value.customerAction || null,
      customerReferenceMasked: value.customerReferenceMasked || '',
      customerSubmittedAt: value.customerSubmittedAt || null,
      verifiedAt: value.verifiedAt || null,
      collectedAt: value.collectedAt || null,
      history: Array.isArray(value.history)
        ? value.history.map((entry) => ({
          previousStatus: entry.previousStatus,
          newStatus: entry.newStatus,
          source: entry.source,
          timestamp: entry.timestamp
        }))
        : [],
      status: value.status,
      amount: value.amount,
      currency: value.currency,
      authorizedAmount: value.authorizedAmount || null,
      capturedAmount: value.capturedAmount || null,
      paidAmount: value.paidAmount,
      refundedAmount: value.refundedAmount,
      authorizationExpiresAt: value.authorizationExpiresAt || null,
      capturedAt: value.capturedAt || null,
      completedAt: value.completedAt,
      failedAt: value.failedAt,
      cancelledAt: value.cancelledAt,
      createdAt: value.createdAt,
      updatedAt: value.updatedAt
    };
  }

  toAdminPayment(payment) {
    const value = payment?.toJSON ? payment.toJSON() : { ...payment };
    return {
      ...this.toPublicPayment(payment),
      authorizedAmountExact: value.authorizedAmountExact || null,
      capturedAmountExact: value.capturedAmountExact || null,
      capturedBy: value.capturedBy || null,
      cancelledBy: value.cancelledBy || null,
      cancelReason: value.cancelReason || '',
      verificationNote: value.verificationNote || '',
      verifiedBy: value.verifiedBy || null,
      collectedBy: value.collectedBy || null
    };
  }

  async getPayment({ paymentId, userId, role }) {
    const payment = await Payment.findById(paymentId);
    if (!payment) {
      throw new AppError('Payment not found', 404, 'PAYMENT_NOT_FOUND');
    }
    if (
      !['admin', 'super_admin'].includes(role)
      && String(payment.user) !== String(userId)
    ) {
      throw new AppError(
        'The payment does not belong to the authenticated account',
        403,
        'PAYMENT_FORBIDDEN'
      );
    }
    return ['admin', 'super_admin'].includes(role)
      ? this.toAdminPayment(payment)
      : this.toPublicPayment(payment);
  }

  async getPaymentForOrder({ orderId, userId, role }) {
    const query = { order: orderId };
    if (!['admin', 'super_admin'].includes(role)) {
      query.user = userId;
    }
    const payment = await Payment.findOne(query).sort({ createdAt: -1 });
    if (!payment) {
      throw new AppError('Payment not found', 404, 'PAYMENT_NOT_FOUND');
    }
    return ['admin', 'super_admin'].includes(role)
      ? this.toAdminPayment(payment)
      : this.toPublicPayment(payment);
  }

  async getPaymentStatus({ paymentId, userId, role }) {
    const payment = await Payment.findById(paymentId);
    if (!payment) {
      throw new AppError('Payment not found', 404, 'PAYMENT_NOT_FOUND');
    }
    const isOwner = String(payment.user) === String(userId) || ['admin', 'super_admin'].includes(role);
    if (!isOwner) {
      throw new AppError('Payment not found', 404, 'PAYMENT_NOT_FOUND');
    }

    const terminalFailed = [
      PAYMENT_STATUSES.FAILED,
      PAYMENT_STATUSES.CANCELLED,
      PAYMENT_STATUSES.EXPIRED,
      PAYMENT_STATUSES.REJECTED
    ].includes(payment.status);

    const requiresAction = payment.status === PAYMENT_STATUSES.REQUIRES_CUSTOMER_ACTION
      || (Boolean(payment.customerAction) && [PAYMENT_STATUSES.PENDING, PAYMENT_STATUSES.PROCESSING].includes(payment.status));

    return {
      _id: payment._id,
      order: payment.order,
      status: payment.status,
      requiresAction,
      retryEligible: terminalFailed,
      customerAction: payment.customerAction || null,
      amount: payment.amount,
      currency: payment.currency,
      authorizedAmount: payment.authorizedAmount || null,
      capturedAmount: payment.capturedAmount || null,
      completedAt: payment.completedAt || null,
      failedAt: payment.failedAt || null,
      cancelledAt: payment.cancelledAt || null,
      createdAt: payment.createdAt,
      updatedAt: payment.updatedAt
    };
  }

  async listPayments({ page = 1, limit = 20, provider, status }) {
    const query = {};
    if (provider) query.provider = provider;
    if (status) query.status = status;
    const [payments, total] = await Promise.all([
      Payment.find(query)
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Payment.countDocuments(query)
    ]);
    return {
      payments: payments.map((payment) => this.toAdminPayment(payment)),
      pagination: {
        page,
        limit,
        total,
        pages: Math.max(1, Math.ceil(total / limit))
      }
    };
  }

  async getAvailableMethods({
    country,
    currency,
    amount
  } = {}) {
    let effectiveCountry = country;
    let effectiveCurrency = currency;

    if (!effectiveCountry || !effectiveCurrency) {
      try {
        const market = await MarketService.getConfig();
        if (!effectiveCountry) {
          effectiveCountry = market.merchantCountry || market.homeCountry || '';
        }
        if (!effectiveCurrency) {
          effectiveCurrency = market.defaultCurrency || market.baseCurrency || '';
        }
      } catch {
        // no-op
      }
    }

    if (effectiveCurrency) {
      effectiveCurrency = String(effectiveCurrency).toUpperCase();
      // Verify if market enables this currency when explicit currency was supplied or resolved
      try {
        const isEnabled = await MarketService.isCurrencyEnabled(effectiveCurrency);
        if (!isEnabled) {
          throw new AppError(
            `Currency '${effectiveCurrency}' is not enabled for this market`,
            409,
            'MARKET_CURRENCY_INELIGIBLE'
          );
        }
      } catch (err) {
        if (err instanceof AppError) throw err;
      }
    }

    const methods = await PaymentCapabilityPolicy.getPublicAvailableMethods({
      country: effectiveCountry,
      currency: effectiveCurrency,
      amount
    });

    return {
      edition: paymentProviderRegistry.edition,
      currency: effectiveCurrency,
      methods
    };
  }

  async getProviderStatuses({
    country,
    currency
  } = {}) {
    let effectiveCountry = country;
    let effectiveCurrency = currency;

    if (!effectiveCountry || !effectiveCurrency) {
      try {
        const market = await MarketService.getConfig();
        if (!effectiveCountry) {
          effectiveCountry = market.merchantCountry || market.homeCountry || '';
        }
        if (!effectiveCurrency) {
          effectiveCurrency = market.defaultCurrency || market.baseCurrency || '';
        }
      } catch {
        // no-op
      }
    }

    if (effectiveCurrency) {
      effectiveCurrency = String(effectiveCurrency).toUpperCase();
    }

    const providers = await PaymentCapabilityPolicy.getAdminProviderStatuses({
      country: effectiveCountry,
      currency: effectiveCurrency
    });

    return {
      edition: paymentProviderRegistry.edition,
      providers
    };
  }

  async getOperationalMetrics() {
    const activeStatuses = [
      PAYMENT_STATUSES.PENDING,
      PAYMENT_STATUSES.PROCESSING,
      PAYMENT_STATUSES.AUTHORIZED,
      PAYMENT_STATUSES.AWAITING_CUSTOMER_PAYMENT,
      PAYMENT_STATUSES.AWAITING_MANUAL_REVIEW
    ];

    const [
      pendingOperationsCount,
      failedOperationsCount,
      inFlightVoidCount,
      inFlightCancelCount,
      inFlightCaptureCount,
      staleVoidCount,
      staleCancelCount,
      staleCaptureCount,
      oldestPendingDoc,
      deadLetterWebhooksCount,
      providers
    ] = await Promise.all([
      Payment.countDocuments({ status: { $in: activeStatuses } }),
      Payment.countDocuments({ status: PAYMENT_STATUSES.FAILED }),
      Payment.countDocuments({ voidAttemptStatus: 'claimed' }),
      Payment.countDocuments({ cancelAttemptStatus: 'claimed' }),
      Payment.countDocuments({ captureAttemptStatus: 'claimed' }),
      Payment.countDocuments({
        voidAttemptStatus: 'claimed',
        voidClaimedAt: { $lt: new Date(Date.now() - 30000) }
      }),
      Payment.countDocuments({
        cancelAttemptStatus: 'claimed',
        cancelClaimedAt: { $lt: new Date(Date.now() - 30000) }
      }),
      Payment.countDocuments({
        captureAttemptStatus: 'claimed',
        captureClaimedAt: { $lt: new Date(Date.now() - 30000) }
      }),
      Payment.findOne({ status: { $in: activeStatuses } }).sort({ createdAt: 1 }).select('createdAt'),
      PaymentWebhookEvent.countDocuments({ status: 'dead_letter' }),
      PaymentCapabilityPolicy.getAdminProviderStatuses()
    ]);

    const oldestPendingAgeSeconds = oldestPendingDoc?.createdAt
      ? Math.max(0, Math.floor((Date.now() - new Date(oldestPendingDoc.createdAt).getTime()) / 1000))
      : 0;

    return {
      pendingOperationsCount,
      inFlightOperationsCount: inFlightVoidCount + inFlightCancelCount + inFlightCaptureCount,
      staleClaimsCount: staleVoidCount + staleCancelCount + staleCaptureCount,
      failedOperationsCount,
      deadLetterWebhooksCount,
      oldestPendingAgeSeconds,
      providers
    };
  }

  async submitManualPayment({
    paymentId,
    userId,
    transactionReference,
    note = ''
  }) {
    const normalizedReference = transactionReference.trim().toLowerCase();
    const referenceHash = hashValue(normalizedReference);
    const maskedReference = normalizedReference.length <= 4
      ? '****'
      : `${'*'.repeat(Math.min(8, normalizedReference.length - 4))}${normalizedReference.slice(-4)}`;
    const payment = await Payment.findById(paymentId)
      .select('+customerReferenceHash');

    if (!payment) {
      throw new AppError('Payment not found', 404, 'PAYMENT_NOT_FOUND');
    }
    if (String(payment.user) !== String(userId)) {
      throw new AppError(
        'The payment does not belong to the authenticated account',
        403,
        'PAYMENT_FORBIDDEN'
      );
    }

    const provider = paymentProviderRegistry.getInstalled(payment.provider);
    if (!provider.getCapabilities().customerConfirmation) {
      throw new AppError(
        'Customer confirmation is unavailable for this payment method',
        409,
        'PAYMENT_PROVIDER_OPERATION_UNAVAILABLE'
      );
    }
    if (
      payment.status === PAYMENT_STATUSES.AWAITING_VERIFICATION
      && payment.customerReferenceHash === referenceHash
    ) {
      return {
        idempotentReplay: true,
        payment: this.toPublicPayment(payment)
      };
    }
    if (payment.status !== PAYMENT_STATUSES.AWAITING_CUSTOMER_PAYMENT) {
      throw new AppError(
        'This payment is not awaiting a customer transfer',
        409,
        'PAYMENT_STATUS_TRANSITION_INVALID'
      );
    }

    payment.customerReferenceHash = referenceHash;
    payment.customerReferenceMasked = maskedReference;
    payment.customerSubmissionNote = note.trim();
    payment.customerSubmittedAt = new Date();
    paymentStateMachine.apply(
      payment,
      PAYMENT_STATUSES.AWAITING_VERIFICATION,
      { source: 'customer' }
    );

    try {
      await payment.save();
    } catch (error) {
      if (isDuplicateKey(error)) {
        throw new AppError(
          'This transfer reference has already been submitted',
          409,
          'PAYMENT_MANUAL_REFERENCE_REUSED'
        );
      }
      throw error;
    }

    return {
      idempotentReplay: false,
      payment: this.toPublicPayment(payment)
    };
  }

  async reviewManualPayment({
    paymentId,
    adminId,
    decision,
    note = '',
    requestId
  }) {
    const session = await mongoose.startSession();
    let publicPayment;
    let idempotentReplay = false;

    try {
      await session.withTransaction(async () => {
        const payment = await this.findInternal(paymentId, session);
        if (!payment) {
          throw new AppError('Payment not found', 404, 'PAYMENT_NOT_FOUND');
        }
        const provider = paymentProviderRegistry.getInstalled(payment.provider);
        if (!provider.getCapabilities().manualReview) {
          throw new AppError(
            'Manual review is unavailable for this payment provider',
            409,
            'PAYMENT_MANUAL_REVIEW_INVALID'
          );
        }

        const nextStatus = decision === 'approve'
          ? PAYMENT_STATUSES.COMPLETED
          : PAYMENT_STATUSES.REJECTED;
        if (payment.status === nextStatus) {
          idempotentReplay = true;
          publicPayment = this.toPublicPayment(payment);
          return;
        }
        if (payment.status !== PAYMENT_STATUSES.AWAITING_VERIFICATION) {
          throw new AppError(
            'This payment is not awaiting manual verification',
            409,
            'PAYMENT_MANUAL_REVIEW_INVALID'
          );
        }

        const order = await Order.findById(payment.order).session(session);
        if (!order) {
          throw new AppError('Order not found', 404, 'ORDER_NOT_FOUND');
        }
        if (order.orderStatus === 'Cancelled') {
          throw new AppError(
            'A cancelled order cannot receive a payment',
            409,
            'PAYMENT_ORDER_NOT_PAYABLE'
          );
        }

        paymentStateMachine.apply(payment, nextStatus, {
          source: 'admin',
          errorCode: decision === 'reject'
            ? 'PAYMENT_MANUAL_REJECTED'
            : ''
        });
        payment.verifiedBy = adminId;
        payment.verifiedAt = new Date();
        payment.verificationNote = note.trim();

        if (decision === 'approve') {
          payment.paidAmount = payment.amount;
          payment.paidAmountExact = payment.amountExact || MoneyMapper.fromLegacy(payment.amount, payment.currency);
          order.paymentStatus = 'Paid';
          order.payment.provider = payment.providerDisplayName
            || payment.provider;
          order.payment.transactionId =
            payment.safeProviderReference || String(payment._id);
          order.payment.paidAt = order.payment.paidAt || new Date();
        }

        await Promise.all([
          payment.save({ session }),
          order.save({ session })
        ]);
        publicPayment = this.toPublicPayment(payment);
      });
    } finally {
      await session.endSession();
    }

    await AuditService.log({
      requestId,
      userId: adminId,
      eventName: decision === 'approve'
        ? 'PAYMENT.COMPLETED'
        : 'PAYMENT.FAILED',
      status: 'SUCCESS',
      metadata: {
        paymentId: String(paymentId),
        operation: `manual_${decision}`
      }
    });

    return { idempotentReplay, payment: publicPayment };
  }

  async collectCodPayment({ paymentId, adminId, note = '', requestId }) {
    const session = await mongoose.startSession();
    let publicPayment;
    let idempotentReplay = false;

    try {
      await session.withTransaction(async () => {
        const payment = await this.findInternal(paymentId, session);
        if (!payment) {
          throw new AppError('Payment not found', 404, 'PAYMENT_NOT_FOUND');
        }
        if (payment.provider !== 'cod') {
          throw new AppError(
            'Only COD payments can be collected manually',
            409,
            'PAYMENT_COD_COLLECTION_INVALID'
          );
        }
        if (payment.status === PAYMENT_STATUSES.COMPLETED) {
          idempotentReplay = true;
          publicPayment = this.toPublicPayment(payment);
          return;
        }
        if (payment.status !== PAYMENT_STATUSES.PENDING) {
          throw new AppError(
            'This COD payment cannot be collected in its current state',
            409,
            'PAYMENT_COD_COLLECTION_INVALID'
          );
        }

        const order = await Order.findById(payment.order).session(session);
        if (!order || order.orderStatus === 'Cancelled') {
          throw new AppError(
            'A cancelled or missing order cannot receive COD collection',
            409,
            'PAYMENT_COD_COLLECTION_INVALID'
          );
        }

        paymentStateMachine.apply(payment, PAYMENT_STATUSES.COMPLETED, {
          source: 'admin'
        });
        payment.paidAmount = payment.amount;
        payment.paidAmountExact = payment.amountExact || MoneyMapper.fromLegacy(payment.amount, payment.currency);
        payment.collectedBy = adminId;
        payment.collectedAt = new Date();
        payment.verificationNote = note.trim();
        order.paymentStatus = 'Paid';
        order.payment.provider = payment.providerDisplayName
          || 'Cash on Delivery';
        order.payment.transactionId =
          payment.safeProviderReference || String(payment._id);
        order.payment.paidAt = order.payment.paidAt || new Date();

        await Promise.all([
          payment.save({ session }),
          order.save({ session })
        ]);
        publicPayment = this.toPublicPayment(payment);
      });
    } finally {
      await session.endSession();
    }

    await AuditService.log({
      requestId,
      userId: adminId,
      eventName: 'PAYMENT.COMPLETED',
      status: 'SUCCESS',
      metadata: {
        paymentId: String(paymentId),
        operation: 'cod_collection',
        idempotentReplay
      }
    });

    return { idempotentReplay, payment: publicPayment };
  }

  async capturePayment({ paymentId, adminId, amount, idempotencyKey, requestId }) {
    if (idempotencyKey && !validateIdempotencyKey(idempotencyKey)) {
      throw new AppError(
        'The Idempotency-Key header is invalid or contains prohibited characters',
        400,
        'PAYMENT_IDEMPOTENCY_KEY_INVALID'
      );
    }

    const payment = await this.findInternal(paymentId);
    if (!payment) {
      throw new AppError('Payment not found', 404, 'PAYMENT_NOT_FOUND');
    }

    const providerAdapter = this.getProvider(payment.provider, {
      currency: payment.currency,
      amount: payment.amount
    });
    const capabilities = providerAdapter.getCapabilities ? providerAdapter.getCapabilities() : {};

    const paymentMethod = payment.paymentMethod || payment.capabilitySnapshot?.paymentMethod || 'card';
    const methodCaps = typeof providerAdapter.getMethodCapabilities === 'function'
      ? providerAdapter.getMethodCapabilities(paymentMethod)
      : (paymentMethod === 'card' ? { capture: true, partialCapture: true } : { capture: false, partialCapture: false });

    const methodSupportsCapture = (payment.capabilitySnapshot?.supportsCapture !== undefined)
      ? payment.capabilitySnapshot.supportsCapture
      : (methodCaps.capture === true && capabilities.capture === true);

    if (!methodSupportsCapture) {
      throw new AppError(
        'Capture is not supported for this payment provider/method',
        409,
        'PAYMENT_CAPTURE_UNAVAILABLE'
      );
    }

    const authorizedAmount = payment.authorizedAmount || payment.amount;
    let captureAmount = authorizedAmount;

    if (amount !== undefined && amount !== null) {
      if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
        throw new AppError(
          'Capture amount must be a positive number',
          422,
          'PAYMENT_CAPTURE_AMOUNT_INVALID'
        );
      }
      if (amount > authorizedAmount) {
        throw new AppError(
          'Capture amount cannot exceed the authorized amount',
          422,
          'PAYMENT_CAPTURE_AMOUNT_EXCEEDED'
        );
      }
      const methodSupportsPartialCapture = (payment.capabilitySnapshot?.supportsPartialCapture !== undefined)
        ? payment.capabilitySnapshot.supportsPartialCapture
        : (methodCaps.partialCapture === true && capabilities.partialCapture === true);

      if (amount < authorizedAmount && (!methodSupportsPartialCapture || !capabilities.partialCapture)) {
        throw new AppError(
          'Partial capture is not supported for this payment provider/method',
          409,
          'PAYMENT_PARTIAL_CAPTURE_UNAVAILABLE'
        );
      }
      captureAmount = amount;
    }

    const captureAmountExact = MoneyMapper.fromLegacy(captureAmount, payment.currency);
    const captureRequestHash = hashValue({
      operation: 'capture',
      paymentId: String(payment._id),
      amountMinor: String(captureAmountExact.amountMinor),
      currency: payment.currency
    });

    if (payment.status === PAYMENT_STATUSES.COMPLETED) {
      if (idempotencyKey && payment.captureIdempotencyKey === idempotencyKey) {
        if (payment.captureRequestHash && payment.captureRequestHash !== captureRequestHash) {
          throw new AppError(
            'Idempotency-Key was already used for a different capture request',
            409,
            'PAYMENT_IDEMPOTENCY_CONFLICT'
          );
        }
        return {
          idempotentReplay: true,
          payment: this.toAdminPayment(payment)
        };
      }
      throw new AppError(
        'Payment has already been completed and cannot be captured again',
        409,
        'PAYMENT_CAPTURE_NOT_ELIGIBLE'
      );
    }

    if (payment.status !== PAYMENT_STATUSES.AUTHORIZED) {
      throw new AppError(
        'Only authorized payments can be captured',
        409,
        'PAYMENT_CAPTURE_NOT_ELIGIBLE'
      );
    }

    if (payment.authorizationExpiresAt && new Date(payment.authorizationExpiresAt) < new Date()) {
      throw new AppError(
        'Payment authorization has expired and cannot be captured',
        409,
        'PAYMENT_CAPTURE_EXPIRED'
      );
    }

    if (idempotencyKey && payment.captureIdempotencyKey === idempotencyKey) {
      if (payment.captureRequestHash && payment.captureRequestHash !== captureRequestHash) {
        throw new AppError(
          'Idempotency-Key was already used for a different capture request',
          409,
          'PAYMENT_IDEMPOTENCY_CONFLICT'
        );
      }
    }

    const claimToken = crypto.randomUUID();
    const effectiveCaptureIdempotencyKey = idempotencyKey || claimToken;
    const claimed = await Payment.findOneAndUpdate({
      _id: payment._id,
      status: PAYMENT_STATUSES.AUTHORIZED,
      $or: [
        { captureAttemptStatus: { $in: [null, 'unclaimed', 'failed'] } },
        {
          captureAttemptStatus: 'claimed',
          captureClaimedAt: { $lt: new Date(Date.now() - CLAIM_LEASE_MS) }
        }
      ]
    }, {
      $set: {
        captureAttemptStatus: 'claimed',
        captureClaimToken: claimToken,
        captureClaimedAt: new Date(),
        captureRequestHash,
        captureIdempotencyKey: effectiveCaptureIdempotencyKey
      }
    }, {
      new: true
    }).select('+captureIdempotencyKey +captureRequestHash +captureAttemptStatus +captureClaimToken +captureClaimedAt');

    if (!claimed) {
      const current = await this.findInternal(payment._id);
      if (current.status === PAYMENT_STATUSES.COMPLETED && current.captureIdempotencyKey === idempotencyKey) {
        if (current.captureRequestHash && current.captureRequestHash !== captureRequestHash) {
          throw new AppError(
            'Idempotency-Key was already used for a different capture request',
            409,
            'PAYMENT_IDEMPOTENCY_CONFLICT'
          );
        }
        return { idempotentReplay: true, payment: this.toAdminPayment(current) };
      }
      throw new AppError(
        'A capture operation is already in flight for this payment',
        409,
        'PAYMENT_OPERATION_IN_FLIGHT'
      );
    }

    const providerCaptureIdempotencyKey = deriveProviderKey('capture', claimed._id, effectiveCaptureIdempotencyKey);

    if (claimed.providerPaymentId && typeof providerAdapter.capturePayment === 'function') {
      try {
        await providerAdapter.capturePayment({
          paymentId: claimed._id,
          providerPaymentId: claimed.providerPaymentId,
          amount: captureAmount,
          currency: claimed.currency,
          idempotencyKey: providerCaptureIdempotencyKey,
          providerConfig: paymentProviderRegistry.providerConfigs[claimed.provider] || {}
        });
      } catch (err) {
        await Payment.findByIdAndUpdate(claimed._id, {
          $set: { captureAttemptStatus: 'failed' }
        });
        throw err;
      }
    }

    const session = await mongoose.startSession();
    let updatedPayment;

    try {
      await session.withTransaction(async () => {
        const currentPayment = await this.findInternal(claimed._id, session);
        if (currentPayment.status !== PAYMENT_STATUSES.AUTHORIZED) {
          throw new AppError(
            'Payment state changed concurrently during capture',
            409,
            'PAYMENT_CAPTURE_NOT_ELIGIBLE'
          );
        }

        const order = await Order.findById(currentPayment.order).session(session);
        if (!order) {
          throw new AppError('Order not found', 404, 'ORDER_NOT_FOUND');
        }

        paymentStateMachine.apply(currentPayment, PAYMENT_STATUSES.COMPLETED, {
          source: 'admin'
        });

        currentPayment.capturedAmount = captureAmount;
        currentPayment.capturedAmountExact = captureAmountExact;
        currentPayment.paidAmount = captureAmount;
        currentPayment.paidAmountExact = captureAmountExact;
        currentPayment.capturedAt = new Date();
        currentPayment.capturedBy = adminId;
        currentPayment.captureAttemptStatus = 'ready';
        currentPayment.captureIdempotencyKey = effectiveCaptureIdempotencyKey;
        currentPayment.captureRequestHash = captureRequestHash;

        order.paymentStatus = 'Paid';
        order.payment = {
          ...(order.payment || {}),
          provider: currentPayment.providerDisplayName || currentPayment.provider,
          transactionId: currentPayment.safeProviderReference || String(currentPayment._id),
          paidAt: new Date()
        };

        await Promise.all([
          currentPayment.save({ session }),
          order.save({ session })
        ]);

        updatedPayment = currentPayment;
      });
    } finally {
      await session.endSession();
    }

    await AuditService.log({
      requestId,
      userId: adminId,
      eventName: 'PAYMENT.CAPTURED',
      status: 'SUCCESS',
      metadata: {
        paymentId: String(payment._id),
        orderId: String(payment.order),
        amount: captureAmount,
        currency: payment.currency
      }
    });

    return {
      idempotentReplay: false,
      payment: this.toAdminPayment(updatedPayment)
    };
  }

  async cancelPayment({ paymentId, adminId, reason = '', idempotencyKey, requestId }) {
    if (idempotencyKey && !validateIdempotencyKey(idempotencyKey)) {
      throw new AppError(
        'The Idempotency-Key header is invalid or contains prohibited characters',
        400,
        'PAYMENT_IDEMPOTENCY_KEY_INVALID'
      );
    }

    const payment = await this.findInternal(paymentId);
    if (!payment) {
      throw new AppError('Payment not found', 404, 'PAYMENT_NOT_FOUND');
    }

    const cancelRequestHash = hashValue({
      operation: 'cancel',
      paymentId: String(payment._id),
      reason: String(reason || '').trim()
    });

    if (payment.status === PAYMENT_STATUSES.CANCELLED) {
      if (idempotencyKey && payment.cancelIdempotencyKey === idempotencyKey) {
        if (payment.cancelRequestHash && payment.cancelRequestHash !== cancelRequestHash) {
          throw new AppError(
            'Idempotency-Key was already used for a different cancellation request',
            409,
            'PAYMENT_IDEMPOTENCY_CONFLICT'
          );
        }
      }
      return {
        idempotentReplay: true,
        payment: this.toAdminPayment(payment)
      };
    }

    if (
      [
        PAYMENT_STATUSES.COMPLETED,
        PAYMENT_STATUSES.PARTIALLY_REFUNDED,
        PAYMENT_STATUSES.REFUNDED
      ].includes(payment.status)
    ) {
      throw new AppError(
        'Completed payments cannot be cancelled/voided. Use refunds instead.',
        409,
        'PAYMENT_CANCEL_NOT_ELIGIBLE'
      );
    }

    if (!paymentStateMachine.canTransition(payment.status, PAYMENT_STATUSES.CANCELLED)) {
      throw new AppError(
        'This payment cannot be cancelled/voided in its current state',
        409,
        'PAYMENT_CANCEL_NOT_ELIGIBLE'
      );
    }

    const providerAdapter = this.getProvider(payment.provider, {
      currency: payment.currency,
      amount: payment.amount
    });
    const capabilities = providerAdapter.getCapabilities ? providerAdapter.getCapabilities() : {};

    if (!capabilities.cancel && !capabilities.void) {
      throw new AppError(
        'Cancellation/void is not supported for this payment provider',
        409,
        'PAYMENT_CANCEL_UNAVAILABLE'
      );
    }

    if (idempotencyKey && payment.cancelIdempotencyKey === idempotencyKey) {
      if (payment.cancelRequestHash && payment.cancelRequestHash !== cancelRequestHash) {
        throw new AppError(
          'Idempotency-Key was already used for a different cancellation request',
          409,
          'PAYMENT_IDEMPOTENCY_CONFLICT'
        );
      }
    }

    const claimToken = crypto.randomUUID();
    const effectiveCancelIdempotencyKey = idempotencyKey || claimToken;
    const claimed = await Payment.findOneAndUpdate({
      _id: payment._id,
      status: {
        $in: [
          PAYMENT_STATUSES.PENDING,
          PAYMENT_STATUSES.PROCESSING,
          PAYMENT_STATUSES.AUTHORIZED,
          PAYMENT_STATUSES.REQUIRES_CUSTOMER_ACTION,
          PAYMENT_STATUSES.AWAITING_CUSTOMER_PAYMENT,
          PAYMENT_STATUSES.AWAITING_VERIFICATION
        ]
      },
      $or: [
        { cancelAttemptStatus: { $in: [null, 'unclaimed', 'failed'] } },
        {
          cancelAttemptStatus: 'claimed',
          cancelClaimedAt: { $lt: new Date(Date.now() - CLAIM_LEASE_MS) }
        }
      ]
    }, {
      $set: {
        cancelAttemptStatus: 'claimed',
        cancelClaimToken: claimToken,
        cancelClaimedAt: new Date(),
        cancelRequestHash,
        cancelIdempotencyKey: effectiveCancelIdempotencyKey
      }
    }, {
      new: true
    }).select('+cancelIdempotencyKey +cancelRequestHash +cancelAttemptStatus +cancelClaimToken +cancelClaimedAt');

    if (!claimed) {
      const current = await this.findInternal(payment._id);
      if (current.status === PAYMENT_STATUSES.CANCELLED) {
        return { idempotentReplay: true, payment: this.toAdminPayment(current) };
      }
      throw new AppError(
        'A cancellation operation is already in flight for this payment',
        409,
        'PAYMENT_OPERATION_IN_FLIGHT'
      );
    }

    const providerCancelIdempotencyKey = deriveProviderKey('cancel', claimed._id, effectiveCancelIdempotencyKey);

    if (claimed.providerPaymentId && typeof providerAdapter.cancelPayment === 'function') {
      try {
        await providerAdapter.cancelPayment({
          paymentId: claimed._id,
          providerPaymentId: claimed.providerPaymentId,
          reason: reason || 'Cancelled by administrator',
          idempotencyKey: providerCancelIdempotencyKey,
          providerConfig: paymentProviderRegistry.providerConfigs[claimed.provider] || {}
        });
      } catch (err) {
        await Payment.findByIdAndUpdate(claimed._id, {
          $set: { cancelAttemptStatus: 'failed' }
        });
        throw err;
      }
    }

    const session = await mongoose.startSession();
    let updatedPayment;

    try {
      await session.withTransaction(async () => {
        const currentPayment = await this.findInternal(claimed._id, session);
        if (currentPayment.status === PAYMENT_STATUSES.CANCELLED) {
          updatedPayment = currentPayment;
          return;
        }

        const order = await Order.findById(currentPayment.order).session(session);

        paymentStateMachine.apply(currentPayment, PAYMENT_STATUSES.CANCELLED, {
          source: 'admin'
        });

        currentPayment.cancelledAt = new Date();
        currentPayment.cancelledBy = adminId;
        currentPayment.cancelReason = reason ? String(reason).trim() : 'Cancelled by administrator';
        currentPayment.cancelAttemptStatus = 'ready';
        currentPayment.cancelIdempotencyKey = effectiveCancelIdempotencyKey;
        currentPayment.cancelRequestHash = cancelRequestHash;

        if (order && ['Pending', 'Failed'].includes(order.paymentStatus)) {
          order.paymentStatus = 'Failed';
          order.statusTimeline.push({
            status: order.orderStatus,
            actor: adminId,
            actorRole: 'admin',
            note: 'Payment cancelled/voided by admin',
            timestamp: new Date()
          });
        }

        const saves = [currentPayment.save({ session })];
        if (order) saves.push(order.save({ session }));
        await Promise.all(saves);

        updatedPayment = currentPayment;
      });
    } finally {
      await session.endSession();
    }

    await AuditService.log({
      requestId,
      userId: adminId,
      eventName: 'PAYMENT.CANCELLED',
      status: 'SUCCESS',
      metadata: {
        paymentId: String(payment._id),
        orderId: String(payment.order),
        reason: reason || 'admin_cancel'
      }
    });

    return {
      idempotentReplay: false,
      payment: this.toAdminPayment(updatedPayment)
    };
  }

  async voidPayment({ paymentId, adminId, reason = '', idempotencyKey, requestId }) {
    if (idempotencyKey && !validateIdempotencyKey(idempotencyKey)) {
      throw new AppError(
        'The Idempotency-Key header is invalid or contains prohibited characters',
        400,
        'PAYMENT_IDEMPOTENCY_KEY_INVALID'
      );
    }

    const payment = await this.findInternal(paymentId);
    if (!payment) {
      throw new AppError('Payment not found', 404, 'PAYMENT_NOT_FOUND');
    }

    const voidRequestHash = hashValue({
      operation: 'void',
      paymentId: String(payment._id),
      reason: String(reason || '').trim()
    });

    if (payment.status === PAYMENT_STATUSES.CANCELLED) {
      if (idempotencyKey && payment.voidIdempotencyKey === idempotencyKey) {
        if (payment.voidRequestHash && payment.voidRequestHash !== voidRequestHash) {
          throw new AppError(
            'Idempotency-Key was already used for a different void request',
            409,
            'PAYMENT_IDEMPOTENCY_CONFLICT'
          );
        }
      }
      return {
        idempotentReplay: true,
        payment: this.toAdminPayment(payment)
      };
    }

    if (
      [
        PAYMENT_STATUSES.COMPLETED,
        PAYMENT_STATUSES.PARTIALLY_REFUNDED,
        PAYMENT_STATUSES.REFUNDED
      ].includes(payment.status)
    ) {
      throw new AppError(
        'Completed payments cannot be cancelled/voided. Use refunds instead.',
        409,
        'PAYMENT_CANCEL_NOT_ELIGIBLE'
      );
    }

    if (!paymentStateMachine.canTransition(payment.status, PAYMENT_STATUSES.CANCELLED)) {
      throw new AppError(
        'This payment cannot be cancelled/voided in its current state',
        409,
        'PAYMENT_CANCEL_NOT_ELIGIBLE'
      );
    }

    const providerAdapter = this.getProvider(payment.provider, {
      currency: payment.currency,
      amount: payment.amount
    });
    const capabilities = providerAdapter.getCapabilities ? providerAdapter.getCapabilities() : {};

    if (!capabilities.cancel && !capabilities.void) {
      throw new AppError(
        'Cancellation/void is not supported for this payment provider',
        409,
        'PAYMENT_CANCEL_UNAVAILABLE'
      );
    }

    if (idempotencyKey && payment.voidIdempotencyKey === idempotencyKey) {
      if (payment.voidRequestHash && payment.voidRequestHash !== voidRequestHash) {
        throw new AppError(
          'Idempotency-Key was already used for a different void request',
          409,
          'PAYMENT_IDEMPOTENCY_CONFLICT'
        );
      }
    }

    const claimToken = crypto.randomUUID();
    const effectiveVoidIdempotencyKey = idempotencyKey || claimToken;
    const claimed = await Payment.findOneAndUpdate({
      _id: payment._id,
      status: {
        $in: [
          PAYMENT_STATUSES.PENDING,
          PAYMENT_STATUSES.PROCESSING,
          PAYMENT_STATUSES.AUTHORIZED,
          PAYMENT_STATUSES.REQUIRES_CUSTOMER_ACTION,
          PAYMENT_STATUSES.AWAITING_CUSTOMER_PAYMENT,
          PAYMENT_STATUSES.AWAITING_VERIFICATION
        ]
      },
      $or: [
        { voidAttemptStatus: { $in: [null, 'unclaimed', 'failed'] } },
        {
          voidAttemptStatus: 'claimed',
          voidClaimedAt: { $lt: new Date(Date.now() - CLAIM_LEASE_MS) }
        }
      ]
    }, {
      $set: {
        voidAttemptStatus: 'claimed',
        voidClaimToken: claimToken,
        voidClaimedAt: new Date(),
        voidRequestHash,
        voidIdempotencyKey: effectiveVoidIdempotencyKey
      }
    }, {
      new: true
    }).select('+voidIdempotencyKey +voidRequestHash +voidAttemptStatus +voidClaimToken +voidClaimedAt');

    if (!claimed) {
      const current = await this.findInternal(payment._id);
      if (current.status === PAYMENT_STATUSES.CANCELLED && current.voidIdempotencyKey === idempotencyKey) {
        if (current.voidRequestHash && current.voidRequestHash !== voidRequestHash) {
          throw new AppError(
            'Idempotency-Key was already used for a different void request',
            409,
            'PAYMENT_IDEMPOTENCY_CONFLICT'
          );
        }
        return { idempotentReplay: true, payment: this.toAdminPayment(current) };
      }
      throw new AppError(
        'A void operation is already in flight for this payment',
        409,
        'PAYMENT_OPERATION_IN_FLIGHT'
      );
    }

    const providerVoidIdempotencyKey = deriveProviderKey('void', claimed._id, effectiveVoidIdempotencyKey);

    if (claimed.providerPaymentId) {
      try {
        if (typeof providerAdapter.voidPayment === 'function') {
          await providerAdapter.voidPayment({
            paymentId: claimed._id,
            providerPaymentId: claimed.providerPaymentId,
            reason: reason || 'Voided by administrator',
            idempotencyKey: providerVoidIdempotencyKey,
            providerConfig: paymentProviderRegistry.providerConfigs[claimed.provider] || {}
          });
        } else if (typeof providerAdapter.cancelPayment === 'function') {
          await providerAdapter.cancelPayment({
            paymentId: claimed._id,
            providerPaymentId: claimed.providerPaymentId,
            reason: reason || 'Voided by administrator',
            idempotencyKey: providerVoidIdempotencyKey,
            providerConfig: paymentProviderRegistry.providerConfigs[claimed.provider] || {}
          });
        }
      } catch (err) {
        await Payment.findByIdAndUpdate(claimed._id, {
          $set: { voidAttemptStatus: 'failed' }
        });
        throw err;
      }
    }

    const session = await mongoose.startSession();
    let updatedPayment;

    try {
      await session.withTransaction(async () => {
        const currentPayment = await this.findInternal(claimed._id, session);
        if (currentPayment.status === PAYMENT_STATUSES.CANCELLED) {
          updatedPayment = currentPayment;
          return;
        }

        const order = await Order.findById(currentPayment.order).session(session);

        paymentStateMachine.apply(currentPayment, PAYMENT_STATUSES.CANCELLED, {
          source: 'admin'
        });

        currentPayment.cancelledAt = new Date();
        currentPayment.cancelledBy = adminId;
        currentPayment.cancelReason = reason ? String(reason).trim() : 'Voided by administrator';
        currentPayment.voidAttemptStatus = 'ready';
        currentPayment.voidIdempotencyKey = effectiveVoidIdempotencyKey;
        currentPayment.voidRequestHash = voidRequestHash;

        if (order && ['Pending', 'Failed'].includes(order.paymentStatus)) {
          order.paymentStatus = 'Failed';
          order.statusTimeline.push({
            status: order.orderStatus,
            actor: adminId,
            actorRole: 'admin',
            note: 'Payment voided by admin',
            timestamp: new Date()
          });
        }

        const saves = [currentPayment.save({ session })];
        if (order) saves.push(order.save({ session }));
        await Promise.all(saves);

        updatedPayment = currentPayment;
      });
    } finally {
      await session.endSession();
    }

    await AuditService.log({
      requestId,
      userId: adminId,
      eventName: 'PAYMENT.VOIDED',
      status: 'SUCCESS',
      metadata: {
        paymentId: String(payment._id),
        orderId: String(payment.order),
        reason: reason || 'admin_void'
      }
    });

    return {
      idempotentReplay: false,
      payment: this.toAdminPayment(updatedPayment)
    };
  }

  async handleWebhook(providerName, rawBody, signature, options = {}) {
    return paymentWebhookInboxService.recordWebhook({
      provider: providerName,
      rawBody,
      signature,
      ...options
    });
  }

  async processVerifiedStripeEvent(event) {
    if (REFUND_EVENT_TYPES.has(event.type)) {
      return refundService.handleProviderEvent(event);
    }
    if (!PAYMENT_EVENT_TYPES.has(event.type)) {
      return { outcome: 'ignored' };
    }

    const providerPayment = event.data.object;
    const payment = await Payment.findOne({
      $or: [
        { providerPaymentId: providerPayment.id },
        { paymentIntentId: providerPayment.id }
      ]
    });

    if (!payment) {
      throw new AppError(
        'Payment record was not found for the provider event',
        404,
        'PAYMENT_NOT_FOUND'
      );
    }

    this.assertProviderMetadata(payment, providerPayment.metadata);

    if (event.type === 'payment_intent.succeeded') {
      if (providerPayment.currency?.toUpperCase() !== payment.currency) {
        throw new AppError(
          'Provider payment currency does not match the order currency',
          422,
          'PAYMENT_CURRENCY_MISMATCH'
        );
      }

      const providerAmount = providerPayment.amount_received
        || providerPayment.amount;

      let expectedMinor;
      try {
        expectedMinor = payment.amountExact?.amountMinor !== undefined
          ? Number(payment.amountExact.amountMinor)
          : Number(Money.fromLegacyNumber(payment.amount, payment.currency).amountMinor);
      } catch (_err) {
        throw new AppError(
          'Payment amount or currency is invalid',
          422,
          'PAYMENT_CURRENCY_UNSUPPORTED'
        );
      }

      if (providerAmount !== expectedMinor) {
        throw new AppError(
          'Provider payment amount does not match the order total',
          422,
          'PAYMENT_AMOUNT_MISMATCH'
        );
      }
    }

    const statusByEvent = {
      'payment_intent.processing': PAYMENT_STATUSES.PROCESSING,
      'payment_intent.succeeded': PAYMENT_STATUSES.COMPLETED,
      'payment_intent.payment_failed': PAYMENT_STATUSES.FAILED,
      'payment_intent.canceled': PAYMENT_STATUSES.CANCELLED,
      'payment_intent.amount_capturable_updated': PAYMENT_STATUSES.AUTHORIZED,
      'payment_intent.requires_action': PAYMENT_STATUSES.REQUIRES_CUSTOMER_ACTION
    };
    const nextStatus = statusByEvent[event.type];

    const session = await mongoose.startSession();
    let outcome = 'processed';
    try {
      await session.withTransaction(async () => {
        const currentPayment = await this.findInternal(payment._id, session);
        const order = await Order.findById(currentPayment.order).session(session);
        if (!order) {
          throw new AppError(
            'Order record was not found during payment reconciliation',
            404,
            'ORDER_NOT_FOUND'
          );
        }

        if (
          [
            PAYMENT_STATUSES.COMPLETED,
            PAYMENT_STATUSES.PARTIALLY_REFUNDED,
            PAYMENT_STATUSES.REFUNDED
          ].includes(currentPayment.status)
        ) {
          outcome = 'ignored';
          return;
        }
        if (
          [
            PAYMENT_STATUSES.CANCELLED,
            PAYMENT_STATUSES.REFUNDED
          ].includes(currentPayment.status)
        ) {
          outcome = 'ignored';
          return;
        }

        if (!paymentStateMachine.canTransition(currentPayment.status, nextStatus)) {
          outcome = 'ignored';
          return;
        }

        paymentStateMachine.apply(currentPayment, nextStatus, {
          source: 'provider',
          providerEventId: event.id,
          errorCode: nextStatus === PAYMENT_STATUSES.FAILED
            ? 'PAYMENT_PROVIDER_DECLINED'
            : ''
        });

        if (nextStatus === PAYMENT_STATUSES.COMPLETED) {
          currentPayment.paidAmount = currentPayment.amount;
          currentPayment.failureCode = '';
          order.paymentStatus = 'Paid';
          order.payment.provider = 'Stripe';
          order.payment.transactionId = providerPayment.id;
          order.payment.paymentIntentId = providerPayment.id;
          order.payment.paidAt = order.payment.paidAt || new Date();
        } else if (nextStatus === PAYMENT_STATUSES.AUTHORIZED) {
          currentPayment.authorizedAmount = currentPayment.amount;
          currentPayment.authorizedAmountExact = currentPayment.amountExact || MoneyMapper.fromLegacy(currentPayment.amount, currentPayment.currency);
          order.paymentStatus = 'Pending';
        } else if (nextStatus === PAYMENT_STATUSES.FAILED) {
          order.paymentStatus = 'Failed';
        } else if (nextStatus === PAYMENT_STATUSES.PROCESSING) {
          order.paymentStatus = 'Pending';
        } else if (nextStatus === PAYMENT_STATUSES.CANCELLED) {
          order.paymentStatus = 'Failed';
        }

        await Promise.all([
          currentPayment.save({ session }),
          order.save({ session })
        ]);
      });
    } finally {
      await session.endSession();
    }

    logger.info('Payment webhook reconciled', {
      paymentId: String(payment._id),
      orderId: String(payment.order),
      providerEventId: event.id,
      eventType: event.type,
      outcome
    });

    if (outcome === 'processed') {
      await AuditService.log({
        eventName: 'PAYMENT.WEBHOOK_PROCESSED',
        status: 'SUCCESS',
        metadata: {
          paymentId: String(payment._id),
          orderId: String(payment.order),
          providerEventId: event.id,
          eventType: event.type
        }
      });
    }

    return { outcome };
  }
}

module.exports = new PaymentService();
module.exports.hashValue = hashValue;

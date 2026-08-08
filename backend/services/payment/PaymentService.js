const crypto = require('crypto');
const mongoose = require('mongoose');
const Order = require('../../models/Order');
const Payment = require('../../models/Payment');
const PaymentWebhookEvent = require('../../models/PaymentWebhookEvent');
const paymentProviderRegistry = require('../../modules/payments/core/providerRegistry');
const refundService = require('./RefundService');
const paymentStateMachine = require('./stateMachine/PaymentStateMachine');
const AuditService = require('../AuditService');
const logger = require('../../utils/logger');
const { AppError } = require('../../common/errors/AppError');
const {
  PAYMENT_STATUSES,
  PROVIDER_ATTEMPT_STATUSES,
  WEBHOOK_PROCESSING_STATUSES
} = require('../../constants/paymentConstants');

const PAYMENT_EVENT_TYPES = new Set([
  'payment_intent.processing',
  'payment_intent.succeeded',
  'payment_intent.payment_failed',
  'payment_intent.canceled'
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
const CLAIM_LEASE_MS = 5 * 60 * 1000;

class PaymentService {
  getProvider(providerName, context = {}) {
    return paymentProviderRegistry.resolve(providerName, context);
  }

  async createPayment({
    userId,
    orderId,
    provider,
    idempotencyKey
  }) {
    const requestHash = hashValue({ orderId, provider });
    let payment = await this.findByIdempotency({
      userId,
      idempotencyKey
    });

    if (payment) {
      this.assertIdempotencyMatch(payment, requestHash);
      return this.resumePayment(payment, true);
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
      order.paymentMethod !== provider
      || order.paymentStatus !== 'Pending'
      || order.orderStatus === 'Cancelled'
    ) {
      throw new AppError(
        'The order is not eligible for this payment method',
        409,
        'PAYMENT_ORDER_NOT_PAYABLE'
      );
    }

    const providerAdapter = this.getProvider(provider, {
      country: order.shippingAddress?.country,
      currency: order.payment?.currency || 'PKR',
      amount: order.totalAmount
    });
    const providerManifest = providerAdapter.getManifest();

    try {
      payment = await Payment.create({
        order: order._id,
        user: userId,
        provider,
        gateway: provider,
        status: PAYMENT_STATUSES.PENDING,
        amount: order.totalAmount,
        currency: order.payment?.currency || 'PKR',
        providerDisplayName: providerManifest.displayName,
        providerIntegrationVersion: providerManifest.integrationVersion,
        paymentType: providerManifest.paymentType,
        capabilitySnapshot: providerAdapter.getCapabilities(),
        idempotencyKey,
        requestHash,
        providerIdempotencyKey: `payment:${order._id}:${idempotencyKey}`,
        history: []
      });
      payment = await this.findInternal(payment._id);
    } catch (error) {
      if (!isDuplicateKey(error)) {
        throw error;
      }
      payment = await this.findByIdempotency({
        userId,
        idempotencyKey
      });
      if (!payment) {
        throw error;
      }
      this.assertIdempotencyMatch(payment, requestHash);
      return this.resumePayment(payment, true);
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
      + '+providerAttemptCount +refundReservedAmount'
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
      '+providerIdempotencyKey +providerAttemptStatus +providerClaimToken '
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

      const persisted = await Payment.findOneAndUpdate({
        _id: claimed._id,
        providerClaimToken: claimToken
      }, {
        $set: {
           providerPaymentId: providerResult.providerPaymentId,
           safeProviderReference: providerResult.providerPaymentId,
           customerAction: providerResult.customerAction || null,
           providerAttemptStatus: PROVIDER_ATTEMPT_STATUSES.READY,
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

      return this.toPaymentSession(persisted, {
        ...providerResult,
        idempotentReplay
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
      paidAmount: value.paidAmount,
      refundedAmount: value.refundedAmount,
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

  getAvailableMethods({
    country = 'Pakistan',
    currency = 'PKR',
    amount
  } = {}) {
    return {
      edition: paymentProviderRegistry.edition,
      currency: String(currency).toUpperCase(),
      methods: paymentProviderRegistry.getPublicMethods({
        country,
        currency,
        amount
      })
    };
  }

  getProviderStatuses({
    country = 'Pakistan',
    currency = 'PKR'
  } = {}) {
    return {
      edition: paymentProviderRegistry.edition,
      providers: paymentProviderRegistry.getAdminStatuses({
        country,
        currency
      })
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

  async handleWebhook(providerName, rawBody, signature) {
    const provider = paymentProviderRegistry.getInstalled(providerName);
    const event = typeof provider.verifyCallback === 'function'
      ? provider.verifyCallback(rawBody, signature)
      : provider.verifyWebhookSignature(rawBody, signature);

    if (
      !event
      || typeof event.id !== 'string'
      || typeof event.type !== 'string'
      || !event.data?.object
    ) {
      throw new AppError(
        'The verified webhook event is malformed',
        400,
        'PAYMENT_WEBHOOK_VERIFICATION_FAILED'
      );
    }

    const payloadHash = hashValue(rawBody);
    let ledger;
    let inserted = false;

    try {
      ledger = await PaymentWebhookEvent.create({
        provider: providerName,
        providerEventId: event.id,
        eventType: event.type,
        payloadHash,
        status: WEBHOOK_PROCESSING_STATUSES.RECEIVED
      });
      inserted = true;
    } catch (error) {
      if (!isDuplicateKey(error)) {
        throw error;
      }
      ledger = await PaymentWebhookEvent.findOne({
        provider: providerName,
        providerEventId: event.id
      }).select('+payloadHash +processingClaim');
    }

    if (!ledger || ledger.payloadHash !== payloadHash) {
      throw new AppError(
        'Webhook event identifier was reused with a different payload',
        409,
        'PAYMENT_WEBHOOK_VERIFICATION_FAILED'
      );
    }

    if (
      [
        WEBHOOK_PROCESSING_STATUSES.PROCESSED,
        WEBHOOK_PROCESSING_STATUSES.IGNORED
      ].includes(ledger.status)
    ) {
      return {
        received: true,
        duplicate: true,
        outcome: ledger.status.toLowerCase()
      };
    }

    const processingClaim = crypto.randomUUID();
    const claimed = await PaymentWebhookEvent.findOneAndUpdate({
      _id: ledger._id,
      $or: [{
        status: {
          $in: [
            WEBHOOK_PROCESSING_STATUSES.RECEIVED,
            WEBHOOK_PROCESSING_STATUSES.FAILED
          ]
        }
      }, {
        status: WEBHOOK_PROCESSING_STATUSES.PROCESSING,
        processingStartedAt: {
          $lt: new Date(Date.now() - CLAIM_LEASE_MS)
        }
      }]
    }, {
      $set: {
        status: WEBHOOK_PROCESSING_STATUSES.PROCESSING,
        processingClaim,
        processingStartedAt: new Date(),
        errorCode: ''
      },
      $inc: { attemptCount: 1 }
    }, {
      new: true
    }).select('+processingClaim');

    if (!claimed) {
      return {
        received: true,
        duplicate: !inserted,
        outcome: 'processing'
      };
    }

    try {
      const result = await this.processVerifiedStripeEvent(event);
      const finalStatus = result.outcome === 'ignored'
        ? WEBHOOK_PROCESSING_STATUSES.IGNORED
        : WEBHOOK_PROCESSING_STATUSES.PROCESSED;

      await PaymentWebhookEvent.updateOne({
        _id: claimed._id,
        processingClaim
      }, {
        $set: {
          status: finalStatus,
          processedAt: new Date(),
          processingClaim: ''
        }
      });

      return {
        received: true,
        duplicate: false,
        outcome: result.outcome
      };
    } catch (error) {
      await PaymentWebhookEvent.updateOne({
        _id: claimed._id,
        processingClaim
      }, {
        $set: {
          status: WEBHOOK_PROCESSING_STATUSES.FAILED,
          errorCode: typeof error.code === 'string'
            ? error.code
            : 'PAYMENT_WEBHOOK_PROCESSING_FAILED',
          processingClaim: ''
        }
      });

      if (error.isOperational) {
        throw error;
      }
      throw new AppError(
        'Webhook processing failed',
        503,
        'PAYMENT_WEBHOOK_PROCESSING_FAILED'
      );
    }
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
      const providerAmount = providerPayment.amount_received
        || providerPayment.amount;
      const expectedMinor = Math.round((payment.amount + Number.EPSILON) * 100);

      if (providerAmount !== expectedMinor) {
        throw new AppError(
          'Provider payment amount does not match the order total',
          422,
          'PAYMENT_AMOUNT_MISMATCH'
        );
      }
      if (providerPayment.currency?.toUpperCase() !== payment.currency) {
        throw new AppError(
          'Provider payment currency does not match the order currency',
          422,
          'PAYMENT_CURRENCY_MISMATCH'
        );
      }
    }

    const statusByEvent = {
      'payment_intent.processing': PAYMENT_STATUSES.PROCESSING,
      'payment_intent.succeeded': PAYMENT_STATUSES.COMPLETED,
      'payment_intent.payment_failed': PAYMENT_STATUSES.FAILED,
      'payment_intent.canceled': PAYMENT_STATUSES.CANCELLED
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
          && nextStatus !== PAYMENT_STATUSES.COMPLETED
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
    return { outcome };
  }
}

module.exports = new PaymentService();
module.exports.hashValue = hashValue;

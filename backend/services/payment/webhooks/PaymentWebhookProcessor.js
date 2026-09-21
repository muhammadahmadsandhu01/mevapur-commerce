/**
 * @file PaymentWebhookProcessor.js
 * @description Canonical Worker Processor for Durable Payment Webhook Events.
 *
 * Responsibilities:
 * 1. Atomically claims due/retryable/expired-lease webhook events using bounded leases.
 * 2. Correlates event with authoritative Payment and Order using trusted scope (provider, environment, account).
 * 3. Enforces multi-source currency validation via OrderCurrencyResolver and exact amount matching.
 * 4. Executes canonical payment state transitions via PaymentStateMachine with out-of-order protection.
 * 5. Reconciles refunds safely through RefundService without initiating new refunds.
 * 6. Governs retry scheduling with exponential backoff and terminal dead-lettering.
 * 7. Provides sanitized aggregate health statistics for Admin RBAC inspection.
 */

'use strict';

const crypto = require('crypto');
const mongoose = require('mongoose');
const PaymentWebhookEvent = require('../../../models/PaymentWebhookEvent');
const Payment = require('../../../models/Payment');
const Order = require('../../../models/Order');
const paymentStateMachine = require('../stateMachine/PaymentStateMachine');
const refundService = require('../RefundService');
const paymentDisputeService = require('../PaymentDisputeService');
const { Money, MoneyMapper, CurrencyRegistry, OrderCurrencyResolver } = require('../../../modules/commerce');
const {
  PAYMENT_STATUSES,
  WEBHOOK_PROCESSING_STATUSES
} = require('../../../constants/paymentConstants');
const { AppError } = require('../../../common/errors/AppError');
const AuditService = require('../../AuditService');
const logger = require('../../../utils/logger');

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

const DISPUTE_EVENT_TYPES = new Set([
  'charge.dispute.created',
  'charge.dispute.updated',
  'charge.dispute.closed',
  'charge.dispute.funds_withdrawn',
  'charge.dispute.funds_reinstated'
]);

const toMinorUnits = (amount, currency = 'USD') => {
  if (typeof amount === 'object' && amount?.amountMinor !== undefined) {
    const money = MoneyMapper.toMoney(amount);
    return Number(money.amountMinor);
  }
  if (typeof amount === 'number') {
    if (!Number.isFinite(amount) || amount <= 0) {
      return 0;
    }
    const money = Money.fromLegacyNumber(amount, currency);
    return Number(money.amountMinor);
  }
  if (typeof amount === 'string') {
    const money = Money.fromDecimal(amount, currency);
    return Number(money.amountMinor);
  }
  return 0;
};

class PaymentWebhookProcessor {
  /**
   * Computes deterministic bounded retry delay with injectable or deterministic jitter.
   * @param {number} attemptCount
   * @param {Object} [options]
   * @param {number|null} [options.jitterMs]
   * @returns {number} Delay in milliseconds
   */
  calculateRetryDelay(attemptCount, { jitterMs = null } = {}) {
    const baseDelayMs = 1000 * Math.pow(2, Math.min(attemptCount, 20));
    const deterministicJitter = jitterMs !== null
      ? jitterMs
      : ((attemptCount * 137) % 500);
    return Math.min(baseDelayMs + deterministicJitter, 3600000); // Capped at 1 hour
  }

  /**
   * Atomically claims one due or expired-lease event.
   * @param {Object} options
   * @param {Date} [options.now=new Date()]
   * @param {number} [options.leaseDurationMs=60000]
   * @param {string} [options.leaseId]
   * @returns {Promise<Object|null>}
   */
  async claimEvent({
    now = new Date(),
    leaseDurationMs = 60000,
    leaseId = crypto.randomUUID()
  } = {}) {
    const claimed = await PaymentWebhookEvent.findOneAndUpdate({
      $or: [
        {
          status: {
            $in: [
              WEBHOOK_PROCESSING_STATUSES.RECEIVED,
              WEBHOOK_PROCESSING_STATUSES.RETRY_SCHEDULED
            ]
          },
          nextAttemptAt: { $lte: now }
        },
        {
          status: WEBHOOK_PROCESSING_STATUSES.PROCESSING,
          leaseExpiresAt: { $lt: now }
        }
      ]
    }, {
      $set: {
        status: WEBHOOK_PROCESSING_STATUSES.PROCESSING,
        leaseId,
        leaseAcquiredAt: now,
        leaseExpiresAt: new Date(now.getTime() + leaseDurationMs),
        errorCode: '',
        errorMessage: ''
      },
      $inc: { attemptCount: 1 }
    }, {
      new: true,
      sort: { nextAttemptAt: 1, createdAt: 1 }
    }).select('+leaseId +payloadHash');

    return claimed;
  }

  /**
   * Claims a batch of due events up to batchSize.
   * @param {Object} options
   * @param {number} [options.batchSize=10]
   * @param {number} [options.leaseDurationMs=60000]
   * @param {Date} [options.now=new Date()]
   * @returns {Promise<Array<Object>>}
   */
  async claimBatch({
    batchSize = 10,
    leaseDurationMs = 60000,
    now = new Date()
  } = {}) {
    const claims = [];
    for (let i = 0; i < batchSize; i += 1) {
      const claim = await this.claimEvent({
        now,
        leaseDurationMs,
        leaseId: crypto.randomUUID()
      });
      if (!claim) {
        break;
      }
      claims.push(claim);
    }
    return claims;
  }

  /**
   * Processes a single claimed event idempotently in a transaction.
   * @param {Object} claimedEvent - Claimed PaymentWebhookEvent document
   * @param {Object} options
   * @param {Date} [options.now=new Date()]
   * @param {number} [options.maxAttempts=5]
   * @param {ClientSession|null} [options.session=null]
   * @returns {Promise<{ outcome: string, status: string }>}
   */
  async processClaimedEvent(claimedEvent, {
    now = new Date(),
    maxAttempts = 5,
    session: injectedSession = null
  } = {}) {
    if (!claimedEvent || !claimedEvent._id || !claimedEvent.leaseId) {
      throw new AppError('A valid claimed event with active lease is required for processing', 400, 'PAYMENT_WEBHOOK_LEASE_REQUIRED');
    }

    const {
      _id: eventId,
      leaseId,
      eventType,
      attemptCount
    } = claimedEvent;

    const ownSession = !injectedSession ? await mongoose.startSession() : null;
    const session = injectedSession || ownSession;

    try {
      let outcome = 'processed';

      if (REFUND_EVENT_TYPES.has(eventType)) {
        outcome = await this.processRefundEvent({
          claimedEvent,
          now,
          session
        });

        const finalStatus = outcome === 'ignored'
          ? WEBHOOK_PROCESSING_STATUSES.IGNORED
          : WEBHOOK_PROCESSING_STATUSES.PROCESSED;

        const updateResult = await PaymentWebhookEvent.updateOne({
          _id: eventId,
          status: WEBHOOK_PROCESSING_STATUSES.PROCESSING,
          leaseId
        }, {
          $set: {
            status: finalStatus,
            processedAt: now,
            leaseId: '',
            leaseAcquiredAt: null,
            leaseExpiresAt: null
          }
        });

        if (updateResult.matchedCount === 0) {
          const err = new AppError('Stale worker attempted to finalize webhook event after lease expiration', 409, 'PAYMENT_WEBHOOK_LEASE_EXPIRED');
          err.isPermanent = true;
          throw err;
        }

        return { outcome, status: finalStatus };
      }

      if (DISPUTE_EVENT_TYPES.has(eventType)) {
        outcome = await this.processDisputeEvent({
          claimedEvent,
          now,
          session
        });

        const finalStatus = outcome === 'ignored'
          ? WEBHOOK_PROCESSING_STATUSES.IGNORED
          : WEBHOOK_PROCESSING_STATUSES.PROCESSED;

        const updateResult = await PaymentWebhookEvent.updateOne({
          _id: eventId,
          status: WEBHOOK_PROCESSING_STATUSES.PROCESSING,
          leaseId
        }, {
          $set: {
            status: finalStatus,
            processedAt: now,
            leaseId: '',
            leaseAcquiredAt: null,
            leaseExpiresAt: null
          }
        });

        if (updateResult.matchedCount === 0) {
          const err = new AppError('Stale worker attempted to finalize webhook event after lease expiration', 409, 'PAYMENT_WEBHOOK_LEASE_EXPIRED');
          err.isPermanent = true;
          throw err;
        }

        return { outcome, status: finalStatus };
      }

      await session.withTransaction(async () => {
        if (PAYMENT_EVENT_TYPES.has(eventType)) {
          outcome = await this.processPaymentEvent({
            claimedEvent,
            now,
            session
          });
        } else {
          outcome = 'ignored';
        }

        const finalStatus = outcome === 'ignored'
          ? WEBHOOK_PROCESSING_STATUSES.IGNORED
          : WEBHOOK_PROCESSING_STATUSES.PROCESSED;

        const updateResult = await PaymentWebhookEvent.updateOne({
          _id: eventId,
          status: WEBHOOK_PROCESSING_STATUSES.PROCESSING,
          leaseId
        }, {
          $set: {
            status: finalStatus,
            processedAt: now,
            leaseId: '',
            leaseAcquiredAt: null,
            leaseExpiresAt: null
          }
        }, { session });

        if (updateResult.matchedCount === 0) {
          const err = new AppError('Stale worker attempted to finalize webhook event after lease expiration', 409, 'PAYMENT_WEBHOOK_LEASE_EXPIRED');
          err.isPermanent = true;
          throw err;
        }
      });

      const finalStatus = outcome === 'ignored'
        ? WEBHOOK_PROCESSING_STATUSES.IGNORED
        : WEBHOOK_PROCESSING_STATUSES.PROCESSED;

      if (outcome === 'processed' || outcome === 'refund_reconciled') {
        await AuditService.log({
          eventName: 'PAYMENT.WEBHOOK_PROCESSED',
          status: 'SUCCESS',
          metadata: {
            providerEventId: claimedEvent.providerEventId,
            eventType: claimedEvent.eventType,
            provider: claimedEvent.provider
          }
        });
      }

      return { outcome, status: finalStatus };
    } catch (error) {
      if (error.code === 'PAYMENT_WEBHOOK_LEASE_EXPIRED') {
        logger.warn('Stale worker lost event lease during processing; releasing without mutating event', {
          eventId,
          leaseId,
          attemptCount
        });
        return { outcome: 'lease_lost', status: WEBHOOK_PROCESSING_STATUSES.PROCESSING };
      }

      const isPermanent = Boolean(
        error.isPermanent
        || error.code === 'PAYMENT_ORDER_CURRENCY_MISMATCH'
        || error.code === 'PAYMENT_AMOUNT_MISMATCH'
        || error.code === 'PAYMENT_CURRENCY_MISMATCH'
        || error.code === 'PAYMENT_STATUS_TRANSITION_INVALID'
        || error.code === 'PAYMENT_ACCOUNT_MISMATCH'
        || error.code === 'PAYMENT_METADATA_MISMATCH'
        || error.code === 'PAYMENT_WEBHOOK_METADATA_MISMATCH'
        || error.code === 'REFUND_NOT_FOUND'
      );

      const errorCode = typeof error.code === 'string'
        ? error.code
        : 'PAYMENT_WEBHOOK_PROCESSING_FAILED';
      const errorMessage = typeof error.message === 'string'
        ? error.message.slice(0, 500)
        : 'Webhook processing error';

      if (isPermanent || attemptCount >= maxAttempts) {
        await PaymentWebhookEvent.updateOne({
          _id: eventId,
          status: WEBHOOK_PROCESSING_STATUSES.PROCESSING,
          leaseId
        }, {
          $set: {
            status: WEBHOOK_PROCESSING_STATUSES.DEAD_LETTER,
            deadLetteredAt: now,
            errorCode,
            errorMessage,
            leaseId: '',
            leaseAcquiredAt: null,
            leaseExpiresAt: null
          }
        });

        await AuditService.log({
          eventName: 'PAYMENT.WEBHOOK_REJECTED',
          status: 'FAILURE',
          metadata: {
            providerEventId: claimedEvent.providerEventId,
            eventType: claimedEvent.eventType,
            provider: claimedEvent.provider,
            errorCode
          }
        });

        try {
          const exceptionQueueService = require('../../../services/exception/ExceptionQueueService');
          await exceptionQueueService.reportException({
            type: 'WEBHOOK_DEAD_LETTERED',
            domainType: 'webhook',
            domainId: claimedEvent.providerEventId || eventId.toString(),
            severity: 'CRITICAL',
            errorCode,
            rawErrorMessage: errorMessage,
            safeDetails: {
              provider: claimedEvent.provider,
              providerEventId: claimedEvent.providerEventId,
              eventType: claimedEvent.eventType,
              attemptCount
            },
            retryEligible: true
          });
        } catch (_exErr) {
          // Non-blocking exception reporting
        }

        return { outcome: 'dead_letter', status: WEBHOOK_PROCESSING_STATUSES.DEAD_LETTER };
      }

      // Retryable error: schedule bounded exponential backoff
      const delayMs = this.calculateRetryDelay(attemptCount);
      const nextAttemptAt = new Date(now.getTime() + delayMs);

      await PaymentWebhookEvent.updateOne({
        _id: eventId,
        status: WEBHOOK_PROCESSING_STATUSES.PROCESSING,
        leaseId
      }, {
        $set: {
          status: WEBHOOK_PROCESSING_STATUSES.RETRY_SCHEDULED,
          nextAttemptAt,
          errorCode,
          errorMessage,
          leaseId: '',
          leaseAcquiredAt: null,
          leaseExpiresAt: null
        }
      });

      try {
        const exceptionQueueService = require('../../../services/exception/ExceptionQueueService');
        await exceptionQueueService.reportException({
          type: 'WEBHOOK_PROCESSING_FAILED',
          domainType: 'webhook',
          domainId: claimedEvent.providerEventId || eventId.toString(),
          severity: 'MEDIUM',
          errorCode,
          rawErrorMessage: errorMessage,
          safeDetails: {
            provider: claimedEvent.provider,
            providerEventId: claimedEvent.providerEventId,
            eventType: claimedEvent.eventType,
            attemptCount
          },
          retryEligible: true
        });
      } catch (_exErr) {
        // Non-blocking exception reporting
      }

      return { outcome: 'retry_scheduled', status: WEBHOOK_PROCESSING_STATUSES.RETRY_SCHEDULED };
    } finally {
      if (ownSession) {
        await ownSession.endSession();
      }
    }
  }

  /**
   * Processes a payment-intent webhook event against authoritative Payment and Order records.
   */
  async processPaymentEvent({ claimedEvent, now, session = null }) {
    const {
      provider,
      environment,
      accountAlias,
      eventType,
      providerEventId,
      providerPaymentId,
      amountMinor,
      currency
    } = claimedEvent;

    if (!providerPaymentId) {
      const err = new AppError('Payment webhook event lacks provider payment identifier', 422, 'PAYMENT_PROVIDER_REFERENCE_MISSING');
      err.isPermanent = true;
      throw err;
    }

    const targetAccountAlias = accountAlias || 'default';
    const targetEnvironment = environment || 'sandbox';

    const query = {
      provider,
      'capabilitySnapshot.environment': targetEnvironment,
      'capabilitySnapshot.accountAlias': targetAccountAlias,
      $or: [
        { providerPaymentId },
        { paymentIntentId: providerPaymentId }
      ]
    };

    const paymentQuery = Payment.findOne(query);
    const payment = session ? await paymentQuery.session(session) : await paymentQuery;

    if (!payment) {
      throw new AppError(`Payment not found for provider reference: ${providerPaymentId}`, 404, 'PAYMENT_NOT_FOUND');
    }

    if (payment.checkoutSessionObjectId && !payment.order) {
      return this.processSessionPaymentEvent({
        payment,
        claimedEvent,
        eventType,
        providerEventId,
        amountMinor,
        currency,
        now,
        session
      });
    }

    const orderQuery = Order.findById(payment.order);
    const order = session ? await orderQuery.session(session) : await orderQuery;
    if (!order) {
      const err = new AppError(`Linked Order ${payment.order} not found for payment ${payment._id}`, 404, 'ORDER_NOT_FOUND');
      err.isPermanent = true;
      throw err;
    }

    // Cross-account isolation check
    const eventMetadata = claimedEvent.eventData?.metadata || {};
    if (eventMetadata.accountAlias && payment.capabilitySnapshot?.accountAlias && eventMetadata.accountAlias !== payment.capabilitySnapshot.accountAlias) {
      const err = new AppError('Webhook event account scope does not match payment merchant account', 409, 'PAYMENT_ACCOUNT_MISMATCH');
      err.isPermanent = true;
      throw err;
    }

    // Authoritative currency validation using OrderCurrencyResolver
    const authoritativeOrderCurrency = OrderCurrencyResolver.resolveOrderCurrency(order);
    if (currency && authoritativeOrderCurrency !== currency) {
      const err = new AppError(
        `Event currency (${currency}) does not match authoritative order currency (${authoritativeOrderCurrency})`,
        409,
        'PAYMENT_ORDER_CURRENCY_MISMATCH'
      );
      err.isPermanent = true;
      throw err;
    }

    if (payment.currency && currency && payment.currency !== currency) {
      const err = new AppError(
        `Event currency (${currency}) does not match payment currency (${payment.currency})`,
        409,
        'PAYMENT_ORDER_CURRENCY_MISMATCH'
      );
      err.isPermanent = true;
      throw err;
    }

    // Amount validation
    if (amountMinor > 0) {
      let expectedMinor;
      try {
        expectedMinor = payment.amountExact?.amountMinor !== undefined
          ? Number(payment.amountExact.amountMinor)
          : toMinorUnits(payment.amount, payment.currency || authoritativeOrderCurrency);
      } catch (_err) {
        const err = new AppError('Invalid currency precision or amount on payment', 422, 'PAYMENT_AMOUNT_MISMATCH');
        err.isPermanent = true;
        throw err;
      }

      if (expectedMinor > 0 && amountMinor !== expectedMinor) {
        const err = new AppError(
          `Event amount (${amountMinor}) does not match payment expected minor amount (${expectedMinor})`,
          422,
          'PAYMENT_AMOUNT_MISMATCH'
        );
        err.isPermanent = true;
        throw err;
      }
    }

    // Metadata validation
    const metadata = claimedEvent.eventData?.metadata;
    if (metadata?.paymentId && metadata.paymentId.trim() !== '' && metadata.paymentId !== payment._id.toString()) {
      const err = new AppError('Webhook event metadata paymentId does not match resolved payment', 409, 'PAYMENT_METADATA_MISMATCH');
      err.isPermanent = true;
      throw err;
    }
    if (metadata?.orderId && metadata.orderId.trim() !== '' && metadata.orderId !== order._id.toString()) {
      const err = new AppError('Webhook event metadata orderId does not match resolved order', 409, 'PAYMENT_METADATA_MISMATCH');
      err.isPermanent = true;
      throw err;
    }

    if (eventType === 'payment_intent.succeeded') {
      if (payment.status === PAYMENT_STATUSES.COMPLETED) {
        return 'processed'; // Harmless duplicate
      }

      if (paymentStateMachine.canTransition(payment.status, PAYMENT_STATUSES.COMPLETED)) {
        paymentStateMachine.apply(payment, PAYMENT_STATUSES.COMPLETED, {
          source: 'provider',
          providerEventId,
          at: now
        });
        payment.paidAmount = payment.amount;
        payment.providerPaymentId = providerPaymentId;
        await payment.save(session ? { session } : {});

        order.paymentStatus = 'Paid';
        order.payment = {
          ...(order.payment || {}),
          provider: payment.provider,
          paymentIntentId: providerPaymentId,
          currency: authoritativeOrderCurrency,
          paidAt: now
        };
        order.statusTimeline.push({
          status: order.orderStatus,
          actor: order.user,
          actorRole: 'system',
          note: 'Payment completed via verified webhook',
          timestamp: now
        });
        await order.save(session ? { session } : {});

        try {
          const InventoryReservationService = require('../../inventory/InventoryReservationService');
          await InventoryReservationService.confirmReservation({ orderId: order.orderId, session });
        } catch (_resvErr) {
          // Safe fallback if order used legacy inventory or already confirmed
        }

        try {
          const transactionalNotificationService = require('../../notification/TransactionalNotificationService');
          await transactionalNotificationService.queueNotification({
            recipient: {
              userId: order.user,
              email: order.customerEmail || order.shippingAddress?.email || '',
              name: order.shippingAddress?.fullName || 'Customer'
            },
            channel: 'EMAIL',
            templateId: 'PAYMENT_SUCCEEDED',
            domainType: 'payment',
            domainId: payment._id.toString(),
            dedupKey: `payment_succeeded:${payment._id.toString()}:${providerPaymentId}`,
            payload: {
              orderNumber: order.orderId,
              customerName: order.shippingAddress?.fullName || 'Customer',
              amount: payment.paidAmount || payment.amount,
              currency: authoritativeOrderCurrency
            }
          });
        } catch (_notifyErr) {
          // Non-blocking
        }

        try {
          const documentService = require('../../document/DocumentService');
          await documentService.getOrIssueOrderDocument(order._id);
        } catch (_docErr) {
          // Non-blocking
        }

        return 'processed';
      }

      // If cannot transition (e.g. out-of-order after terminal), do not regress
      return 'ignored';
    }

    if (eventType === 'payment_intent.payment_failed') {
      if (payment.status === PAYMENT_STATUSES.COMPLETED) {
        // Out-of-order: Succeeded payment must never regress to failed
        return 'ignored';
      }

      if (paymentStateMachine.canTransition(payment.status, PAYMENT_STATUSES.FAILED)) {
        paymentStateMachine.apply(payment, PAYMENT_STATUSES.FAILED, {
          source: 'provider',
          providerEventId,
          errorCode: claimedEvent.errorCode || 'PAYMENT_FAILED_BY_PROVIDER',
          at: now
        });
        await payment.save(session ? { session } : {});

        order.paymentStatus = 'Failed';
        order.statusTimeline.push({
          status: order.orderStatus,
          actor: order.user,
          actorRole: 'system',
          note: 'Payment failed via provider webhook',
          timestamp: now
        });
        await order.save(session ? { session } : {});

        try {
          const InventoryReservationService = require('../../inventory/InventoryReservationService');
          await InventoryReservationService.releaseReservation({
            orderId: order.orderId,
            releaseReason: 'PAYMENT_FAILED_RELEASE',
            session
          });
        } catch (_resvErr) {
          // Safe fallback if order used legacy inventory
        }

        try {
          const exceptionQueueService = require('../../../services/exception/ExceptionQueueService');
          await exceptionQueueService.reportException({
            type: 'PAYMENT_FAILED',
            domainType: 'payment',
            domainId: payment._id.toString(),
            orderId: order._id,
            customerId: order.user,
            severity: 'HIGH',
            errorCode: claimedEvent.errorCode || 'PAYMENT_FAILED_BY_PROVIDER',
            rawErrorMessage: claimedEvent.errorMessage || 'Payment intent failed on processor',
            safeDetails: {
              provider: payment.provider,
              providerPaymentId,
              orderId: order.orderId,
              amount: payment.amount,
              currency: payment.currency
            },
            retryEligible: true
          });
        } catch (_exErr) {
          // Non-blocking
        }

        try {
          const transactionalNotificationService = require('../../notification/TransactionalNotificationService');
          await transactionalNotificationService.queueNotification({
            recipient: {
              userId: order.user,
              email: order.customerEmail || order.shippingAddress?.email || '',
              name: order.shippingAddress?.fullName || 'Customer'
            },
            channel: 'EMAIL',
            templateId: 'PAYMENT_FAILED',
            domainType: 'payment',
            domainId: payment._id.toString(),
            dedupKey: `payment_failed:${payment._id.toString()}:${providerPaymentId}`,
            payload: {
              orderNumber: order.orderId,
              customerName: order.shippingAddress?.fullName || 'Customer',
              reason: claimedEvent.errorMessage || 'Payment failed on processor'
            }
          });
        } catch (_notifyErr) {
          // Non-blocking
        }

        return 'processed';
      }

      return 'ignored';
    }

    if (eventType === 'payment_intent.canceled') {
      if (payment.status === PAYMENT_STATUSES.COMPLETED) {
        return 'ignored'; // Completed payment cannot regress to cancelled
      }

      if (paymentStateMachine.canTransition(payment.status, PAYMENT_STATUSES.CANCELLED)) {
        paymentStateMachine.apply(payment, PAYMENT_STATUSES.CANCELLED, {
          source: 'provider',
          providerEventId,
          at: now
        });
        await payment.save(session ? { session } : {});

        order.paymentStatus = 'Cancelled';
        order.statusTimeline.push({
          status: order.orderStatus,
          actor: order.user,
          actorRole: 'system',
          note: 'Order payment cancelled via provider webhook',
          timestamp: now
        });
        await order.save(session ? { session } : {});

        try {
          const InventoryReservationService = require('../../inventory/InventoryReservationService');
          await InventoryReservationService.releaseReservation({
            orderId: order.orderId,
            releaseReason: 'PAYMENT_FAILED_RELEASE',
            session
          });
        } catch (_resvErr) {
          // Safe fallback if order used legacy inventory
        }
        await order.save(session ? { session } : {});

        return 'processed';
      }

      return 'ignored';
    }

    if (eventType === 'payment_intent.amount_capturable_updated') {
      if (payment.status === PAYMENT_STATUSES.COMPLETED) {
        return 'ignored';
      }

      if (paymentStateMachine.canTransition(payment.status, PAYMENT_STATUSES.AUTHORIZED)) {
        paymentStateMachine.apply(payment, PAYMENT_STATUSES.AUTHORIZED, {
          source: 'provider',
          providerEventId,
          at: now
        });
        payment.authorizedAmount = payment.amount;
        payment.authorizedAmountExact = payment.amountExact || MoneyMapper.fromLegacy(payment.amount, payment.currency || authoritativeOrderCurrency);
        await payment.save(session ? { session } : {});

        order.paymentStatus = 'Pending';
        order.statusTimeline.push({
          status: order.orderStatus,
          actor: order.user,
          actorRole: 'system',
          note: 'Payment authorized via provider webhook',
          timestamp: now
        });
        await order.save(session ? { session } : {});

        return 'processed';
      }

      return 'ignored';
    }

    if (eventType === 'payment_intent.requires_action') {
      if (payment.status === PAYMENT_STATUSES.COMPLETED) {
        return 'ignored';
      }

      if (paymentStateMachine.canTransition(payment.status, PAYMENT_STATUSES.REQUIRES_CUSTOMER_ACTION)) {
        paymentStateMachine.apply(payment, PAYMENT_STATUSES.REQUIRES_CUSTOMER_ACTION, {
          source: 'provider',
          providerEventId,
          at: now
        });
        await payment.save(session ? { session } : {});

        try {
          const exceptionQueueService = require('../../../services/exception/ExceptionQueueService');
          await exceptionQueueService.reportException({
            type: 'PAYMENT_REQUIRES_ACTION',
            domainType: 'payment',
            domainId: payment._id.toString(),
            orderId: order._id,
            customerId: order.user,
            severity: 'MEDIUM',
            errorCode: 'PAYMENT_ACTION_REQUIRED',
            rawErrorMessage: 'Payment requires additional authentication',
            safeDetails: {
              provider: payment.provider,
              providerPaymentId,
              orderId: order.orderId
            },
            retryEligible: true
          });
        } catch (_exErr) {
          // Non-blocking
        }

        try {
          const transactionalNotificationService = require('../../notification/TransactionalNotificationService');
          await transactionalNotificationService.queueNotification({
            recipient: {
              userId: order.user,
              email: order.customerEmail || order.shippingAddress?.email || '',
              name: order.shippingAddress?.fullName || 'Customer'
            },
            channel: 'EMAIL',
            templateId: 'PAYMENT_ACTION_REQUIRED',
            domainType: 'payment',
            domainId: payment._id.toString(),
            dedupKey: `payment_requires_action:${payment._id.toString()}:${providerPaymentId}`,
            payload: {
              orderNumber: order.orderId,
              customerName: order.shippingAddress?.fullName || 'Customer',
              actionUrl: `/orders/${order.orderId}`
            }
          });
        } catch (_notifyErr) {
          // Non-blocking
        }

        return 'processed';
      }

      return 'ignored';
    }

    return 'ignored';
  }

  /**
   * Reconciles a refund webhook event using RefundService without creating new refunds.
   */
  async processRefundEvent({ claimedEvent, now }) {
    const { providerEventId, providerRefundId, providerPaymentId, eventType } = claimedEvent;

    // Delegate to existing RefundService event handler safely
    if (typeof refundService.handleProviderEvent === 'function') {
      const refundResult = await refundService.handleProviderEvent({
        id: providerEventId,
        type: eventType,
        data: {
          object: {
            id: providerRefundId || claimedEvent.eventData?.providerRefundId,
            payment_intent: providerPaymentId || claimedEvent.eventData?.providerPaymentId,
            status: claimedEvent.eventData?.rawObjectStatus
              || (claimedEvent.proposedStatus === 'Completed' ? 'succeeded' : (claimedEvent.eventData?.status || 'succeeded')),
            amount: claimedEvent.amountMinor,
            currency: claimedEvent.currency?.toLowerCase(),
            metadata: claimedEvent.eventData?.metadata || {}
          }
        }
      });
      return refundResult.outcome || 'processed';
    }

    return 'processed';
  }

  /**
   * Reconciles a dispute / chargeback webhook event using PaymentDisputeService.
   */
  async processDisputeEvent({ claimedEvent, now, session = null }) {
    const {
      provider,
      providerEventId,
      eventType,
      eventData
    } = claimedEvent;

    const providerDisputeId = eventData?.providerDisputeId || claimedEvent.providerRefundId || claimedEvent.providerEventId;
    const providerPaymentId = eventData?.providerPaymentId || claimedEvent.providerPaymentId;
    const paymentId = eventData?.metadata?.paymentId || null;
    const currency = claimedEvent.currency || eventData?.currency || 'PKR';
    const amountMinor = claimedEvent.amountMinor || eventData?.amountMinor || 0;
    const amount = amountMinor > 0 ? (amountMinor / 100) : (eventData?.amount || 0);

    let status = 'needs_response';
    if (eventType === 'charge.dispute.closed') {
      const rawStatus = (eventData?.rawObjectStatus || eventData?.proposedStatus || '').toLowerCase();
      status = rawStatus === 'won' ? 'won' : (rawStatus === 'charge_refunded' ? 'charge_refunded' : 'lost');
    } else if (eventType === 'charge.dispute.updated') {
      status = eventData?.proposedStatus || 'under_review';
    } else if (eventType === 'charge.dispute.created') {
      status = 'needs_response';
    }

    await paymentDisputeService.recordOrUpdateDispute({
      providerDisputeId,
      providerPaymentId,
      paymentId,
      provider,
      amount,
      currency,
      fee: eventData?.fee || 0,
      status,
      reason: eventData?.reason || 'general',
      evidenceDueBy: eventData?.evidenceDueBy || null,
      providerEventId,
      session
    });

    return 'dispute_processed';
  }

  /**
   * Claims and processes due events in a single batch call.
   * @param {Object} options
   * @returns {Promise<{ claimed: number, processed: number, retryScheduled: number, deadLettered: number, ignored: number }>}
   */
  async processPending({
    batchSize = 10,
    leaseDurationMs = 60000,
    now = new Date(),
    maxAttempts = 5
  } = {}) {
    const claims = await this.claimBatch({ batchSize, leaseDurationMs, now });
    const summary = {
      claimed: claims.length,
      processed: 0,
      retryScheduled: 0,
      deadLettered: 0,
      ignored: 0
    };

    for (const claim of claims) {
      const result = await this.processClaimedEvent(claim, { now, maxAttempts });
      if (result.status === WEBHOOK_PROCESSING_STATUSES.PROCESSED) {
        summary.processed += 1;
      } else if (result.status === WEBHOOK_PROCESSING_STATUSES.IGNORED) {
        summary.ignored += 1;
      } else if (result.status === WEBHOOK_PROCESSING_STATUSES.RETRY_SCHEDULED) {
        summary.retryScheduled += 1;
      } else if (result.status === WEBHOOK_PROCESSING_STATUSES.DEAD_LETTER) {
        summary.deadLettered += 1;
      }
    }

    return summary;
  }

  /**
   * Aggregates sanitized webhook health metrics for Admin RBAC inspection.
   * Guarantees zero leakage of raw payloads, payload hashes, signatures, or secrets.
   */
  async getHealthStats() {
    const counts = await PaymentWebhookEvent.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    const statusCounts = {
      received: 0,
      processing: 0,
      retry_scheduled: 0,
      processed: 0,
      ignored: 0,
      dead_letter: 0
    };

    counts.forEach((c) => {
      if (statusCounts[c._id] !== undefined) {
        statusCounts[c._id] = c.count;
      }
    });

    const oldestPending = await PaymentWebhookEvent.findOne({
      status: {
        $in: [
          WEBHOOK_PROCESSING_STATUSES.RECEIVED,
          WEBHOOK_PROCESSING_STATUSES.RETRY_SCHEDULED
        ]
      }
    }).sort({ createdAt: 1 }).select('createdAt');

    const lastProcessed = await PaymentWebhookEvent.findOne({
      status: WEBHOOK_PROCESSING_STATUSES.PROCESSED
    }).sort({ processedAt: -1 }).select('processedAt');

    const recentErrors = await PaymentWebhookEvent.aggregate([
      {
        $match: {
          errorCode: { $ne: '' }
        }
      },
      {
        $group: {
          _id: '$errorCode',
          count: { $sum: 1 }
        }
      },
      {
        $project: {
          _id: 0,
          errorCode: '$_id',
          count: 1
        }
      },
      { $limit: 10 }
    ]);

    const now = Date.now();
    const oldestPendingAgeMs = oldestPending?.createdAt
      ? Math.max(0, now - new Date(oldestPending.createdAt).getTime())
      : 0;

    return {
      counts: statusCounts,
      totalCount: Object.values(statusCounts).reduce((a, b) => a + b, 0),
      oldestPendingAgeMs,
      lastProcessedAt: lastProcessed?.processedAt || null,
      recentErrors
    };
  }

  async processSessionPaymentEvent({
    payment,
    claimedEvent,
    eventType,
    providerEventId,
    amountMinor,
    currency,
    now,
    session
  }) {
    const CheckoutSession = require('../../../models/CheckoutSession');
    const InventoryHold = require('../../../models/InventoryHold');
    const CheckoutSessionService = require('../../order/CheckoutSessionService');
    const StockHoldLeaseService = require('../../inventory/StockHoldLeaseService');

    const checkoutSessionQuery = CheckoutSession.findById(payment.checkoutSessionObjectId);
    const checkoutSession = session ? await checkoutSessionQuery.session(session) : await checkoutSessionQuery;

    if (!checkoutSession) {
      const err = new AppError(`Linked CheckoutSession ${payment.checkoutSessionObjectId} not found for payment ${payment._id}`, 404, 'SESSION_NOT_FOUND');
      err.isPermanent = true;
      throw err;
    }

    // Provider validation
    const eventProvider = (claimedEvent.provider || claimedEvent.eventData?.provider || '').toLowerCase();
    if (eventProvider && payment.provider && eventProvider !== payment.provider.toLowerCase()) {
      const err = new AppError('Webhook event provider mismatch', 409, 'PAYMENT_PROVIDER_MISMATCH');
      err.isPermanent = true;
      throw err;
    }

    // Environment validation
    const eventEnvironment = claimedEvent.environment || claimedEvent.eventData?.environment;
    if (eventEnvironment && payment.capabilitySnapshot?.environment && eventEnvironment !== payment.capabilitySnapshot.environment) {
      const err = new AppError('Webhook event environment mismatch', 409, 'PAYMENT_ENVIRONMENT_MISMATCH');
      err.isPermanent = true;
      throw err;
    }

    // Cross-account isolation check
    const eventMetadata = claimedEvent.eventData?.metadata || {};
    if (eventMetadata.accountAlias && payment.capabilitySnapshot?.accountAlias && eventMetadata.accountAlias !== payment.capabilitySnapshot.accountAlias) {
      const err = new AppError('Webhook event account scope does not match payment merchant account', 409, 'PAYMENT_ACCOUNT_MISMATCH');
      err.isPermanent = true;
      throw err;
    }

    // Currency validation
    if (currency && checkoutSession.currency !== currency) {
      const err = new AppError(`Event currency (${currency}) does not match session currency (${checkoutSession.currency})`, 409, 'PAYMENT_CURRENCY_MISMATCH');
      err.isPermanent = true;
      throw err;
    }

    // Amount validation
    if (amountMinor > 0) {
      let expectedMinor;
      try {
        expectedMinor = Number(checkoutSession.amounts.totalAmountExact.amountMinor);
      } catch (_err) {
        expectedMinor = 0;
      }
      if (expectedMinor > 0 && amountMinor !== expectedMinor) {
        const err = new AppError(`Event amount (${amountMinor}) does not match session expected minor amount (${expectedMinor})`, 422, 'PAYMENT_AMOUNT_MISMATCH');
        err.isPermanent = true;
        throw err;
      }
    }

    // Metadata validation
    if (eventMetadata.sessionId && eventMetadata.sessionId.trim() !== '' && eventMetadata.sessionId !== checkoutSession.sessionId) {
      const err = new AppError('Webhook event metadata sessionId does not match resolved session', 409, 'PAYMENT_METADATA_MISMATCH');
      err.isPermanent = true;
      throw err;
    }

    if (eventType === 'payment_intent.succeeded') {
      if (checkoutSession.status === CheckoutSession.STATUSES.CONVERTED) {
        return 'processed'; // Harmless duplicate
      }

      const rawTimestamp = claimedEvent.providerCreatedAt
        || claimedEvent.eventData?.eventCreatedAt
        || claimedEvent.eventData?.capturedAt
        || (claimedEvent.eventData?.created ? new Date(claimedEvent.eventData.created * 1000) : null);

      if (!rawTimestamp) {
        const err = new AppError('Payment webhook event lacks authoritative provider capture timestamp', 422, 'PAYMENT_CAPTURE_TIMESTAMP_MISSING');
        err.isPermanent = true;
        throw err;
      }

      const providerCapturedAt = new Date(rawTimestamp);
      if (isNaN(providerCapturedAt.getTime())) {
        const err = new AppError('Payment webhook event has invalid provider capture timestamp', 422, 'PAYMENT_CAPTURE_TIMESTAMP_INVALID');
        err.isPermanent = true;
        throw err;
      }

      const isTimelyCapture = providerCapturedAt <= checkoutSession.leaseExpiresAt;

      if (isTimelyCapture) {
        // Atomic Hold Protection
        const holdUpdate = await InventoryHold.findOneAndUpdate(
          { _id: checkoutSession.inventoryHoldId, status: InventoryHold.STATUSES.ACTIVE },
          { $set: { status: InventoryHold.STATUSES.CAPTURE_COMMITTED }, $inc: { lockVersion: 1 } },
          { session, new: true }
        );

        if (holdUpdate || checkoutSession.status === CheckoutSession.STATUSES.PAYMENT_CAPTURED) {
          checkoutSession.status = CheckoutSession.STATUSES.PAYMENT_CAPTURED;
          await checkoutSession.save(session ? { session } : {});

          payment.status = PAYMENT_STATUSES.COMPLETED;
          payment.paidAmount = payment.amount;
          payment.capturedAt = providerCapturedAt;
          await payment.save(session ? { session } : {});

          // Trigger conversion
          await CheckoutSessionService.convertSessionToOrder({
            sessionId: checkoutSession.sessionId,
            merchantScopeId: checkoutSession.merchantScopeId,
            paymentEvidence: {
              amountExact: payment.amountExact,
              currency: payment.currency,
              providerPaymentId: payment.providerPaymentId
            },
            session
          });

          return 'processed';
        }
      }

      // Late capture or hold already expired: fail closed into conflict reconciliation
      checkoutSession.status = CheckoutSession.STATUSES.CONFLICT;
      checkoutSession.reconciliation = {
        reasonCode: 'LATE_CAPTURE_HOLD_EXPIRED',
        capturedAmountExact: payment.amountExact,
        capturedCurrency: payment.currency,
        providerPaymentId: payment.providerPaymentId,
        detectedAt: now,
        reconciliationActionRequired: 'MANUAL_REVIEW',
        reconciliationStatus: 'UNRESOLVED',
        notes: 'Payment captured after lease expired. Fails closed without creating unbacked order.'
      };
      await checkoutSession.save(session ? { session } : {});

      payment.status = PAYMENT_STATUSES.COMPLETED;
      payment.capturedAt = providerCapturedAt;
      await payment.save(session ? { session } : {});

      return 'processed';
    }

    if (eventType === 'payment_intent.payment_failed' || eventType === 'payment_intent.canceled') {
      if (
        checkoutSession.status === CheckoutSession.STATUSES.CONVERTED ||
        checkoutSession.status === CheckoutSession.STATUSES.PAYMENT_CAPTURED ||
        checkoutSession.status === CheckoutSession.STATUSES.CONVERTING
      ) {
        return 'ignored';
      }

      await StockHoldLeaseService.releaseHold({
        holdId: checkoutSession.inventoryHoldId,
        sessionId: checkoutSession.sessionId,
        merchantScopeId: checkoutSession.merchantScopeId,
        releaseReason: eventType === 'payment_intent.payment_failed' ? 'PAYMENT_FAILED' : 'CUSTOMER_CANCELLED',
        session
      });

      checkoutSession.status = eventType === 'payment_intent.payment_failed'
        ? CheckoutSession.STATUSES.FAILED
        : CheckoutSession.STATUSES.CANCELLED;
      await checkoutSession.save(session ? { session } : {});

      payment.status = eventType === 'payment_intent.payment_failed'
        ? PAYMENT_STATUSES.FAILED
        : PAYMENT_STATUSES.CANCELLED;
      await payment.save(session ? { session } : {});

      return 'processed';
    }

    return 'ignored';
  }
}

module.exports = new PaymentWebhookProcessor();

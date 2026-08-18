const crypto = require('crypto');
const mongoose = require('mongoose');
const Order = require('../../models/Order');
const Payment = require('../../models/Payment');
const Refund = require('../../models/Refund');
const Return = require('../../models/Return');
const ReturnInventoryService = require('../ReturnInventoryService');
const paymentProviderRegistry = require('../../modules/payments/core/providerRegistry');
const paymentStateMachine = require('./stateMachine/PaymentStateMachine');
const { AppError } = require('../../common/errors/AppError');
const {
  PAYMENT_STATUSES,
  PROVIDER_ATTEMPT_STATUSES,
  REFUND_STATUSES
} = require('../../constants/paymentConstants');

const stableHash = (value) => crypto
  .createHash('sha256')
  .update(JSON.stringify(value))
  .digest('hex');

const isDuplicateKey = (error) => error?.code === 11000;
const CLAIM_LEASE_MS = 5 * 60 * 1000;

class RefundService {
  getProvider(providerName) {
    const provider = paymentProviderRegistry.resolve(providerName, {
      currency: 'PKR'
    });
    if (!provider.getCapabilities().refund) {
      throw new AppError(
        'The refund provider is unavailable',
        409,
        'PAYMENT_PROVIDER_OPERATION_UNAVAILABLE'
      );
    }
    return provider;
  }

  async createRefund({
    paymentId,
    amount,
    reason = '',
    adminId,
    idempotencyKey,
    returnId = null,
    method = 'original_payment'
  }) {
    return this.createRefundRecord({
      paymentId,
      amount,
      reason,
      adminId,
      idempotencyKey,
      returnId,
      method
    }, 'provider');
  }

  async createManualRefund({
    paymentId,
    amount,
    reason = '',
    adminId,
    idempotencyKey,
    returnId,
    method = 'original_payment'
  }) {
    if (!returnId) {
      throw new AppError(
        'A manual refund must be linked to an approved return',
        400,
        'RETURN_REFUND_STATE_UNAVAILABLE'
      );
    }
    return this.createRefundRecord({
      paymentId,
      amount,
      reason,
      adminId,
      idempotencyKey,
      returnId,
      method
    }, 'manual');
  }

  async createRefundRecord({
    paymentId,
    amount,
    reason,
    adminId,
    idempotencyKey,
    returnId,
    method
  }, processingMode) {
    const requestHash = stableHash({
      paymentId: String(paymentId),
      amount,
      reason,
      returnId: returnId ? String(returnId) : null,
      method,
      processingMode
    });
    let refund = await this.findByIdempotency(paymentId, idempotencyKey);

    if (refund) {
      this.assertIdempotencyMatch(refund, requestHash);
      if (refund.processingMode !== processingMode) {
        throw new AppError(
          'The refund processing mode conflicts with the existing request',
          409,
          'REFUND_IDEMPOTENCY_CONFLICT'
        );
      }
      return this.resumeByMode(refund, true);
    }

    const payment = await Payment.findById(paymentId)
      .select('+refundReservedAmount');

    if (!payment) {
      throw new AppError('Payment not found', 404, 'PAYMENT_NOT_FOUND');
    }
    if (
      ![
        PAYMENT_STATUSES.COMPLETED,
        PAYMENT_STATUSES.PARTIALLY_REFUNDED
      ].includes(payment.status)
      || !payment.providerPaymentId
    ) {
      throw new AppError(
        'The payment is not eligible for a refund',
        409,
        'REFUND_PAYMENT_NOT_ELIGIBLE'
      );
    }

    if (processingMode === 'provider') {
      this.getProvider(payment.provider);
    } else {
      const providerManifest = paymentProviderRegistry
        .getInstalled(payment.provider)
        .getManifest();
      if (!['offline', 'manual'].includes(providerManifest.paymentType)) {
        throw new AppError(
          'This payment requires its provider refund operation',
          409,
          'PAYMENT_PROVIDER_OPERATION_UNAVAILABLE'
        );
      }
    }

    try {
      refund = await Refund.create({
        payment: payment._id,
        order: payment.order,
        customer: payment.user,
        provider: payment.provider,
        amount,
        currency: payment.currency,
        status: REFUND_STATUSES.PENDING,
        idempotencyKey,
        requestHash,
        providerIdempotencyKey: `refund:${payment._id}:${idempotencyKey}`,
        processingMode,
        providerOutcome: 'unattempted',
        processedBy: adminId,
        reason,
        returnId: returnId || undefined,
        method,
        history: [{
          status: REFUND_STATUSES.PENDING,
          source: 'admin',
          timestamp: new Date()
        }]
      });
    } catch (error) {
      if (!isDuplicateKey(error)) {
        throw error;
      }
      refund = await this.findByIdempotency(paymentId, idempotencyKey);
      if (!refund) {
        throw error;
      }
      this.assertIdempotencyMatch(refund, requestHash);
      return this.resumeByMode(refund, true);
    }

    try {
      await this.reserveRefundAmount(refund._id);
    } catch (error) {
      await Refund.updateOne({ _id: refund._id }, {
        $set: {
          status: REFUND_STATUSES.FAILED,
          providerAttemptStatus: PROVIDER_ATTEMPT_STATUSES.FAILED,
          failureCode: typeof error.code === 'string'
            ? error.code
            : 'REFUND_AMOUNT_EXCEEDS_AVAILABLE'
        }
      });
      throw error;
    }
    refund = await this.findInternal(refund._id);
    return this.resumeByMode(refund, false);
  }

  resumeByMode(refund, idempotentReplay) {
    return refund.processingMode === 'manual'
      ? this.resumeManualRefund(refund, idempotentReplay)
      : this.resumeRefund(refund, idempotentReplay);
  }

  async findByIdempotency(paymentId, idempotencyKey) {
    return Refund.findOne({
      payment: paymentId,
      idempotencyKey
    }).select(
      '+idempotencyKey +requestHash +providerIdempotencyKey '
      + '+providerAttemptStatus +providerClaimToken +providerClaimedAt '
      + '+reservationActive +processingMode +providerOutcome +returnId +method'
    );
  }

  async findInternal(refundId, session = null) {
    const query = Refund.findById(refundId).select(
      '+idempotencyKey +requestHash +providerIdempotencyKey '
      + '+providerAttemptStatus +providerClaimToken +providerClaimedAt '
      + '+reservationActive +processingMode +providerOutcome +returnId +method'
    );
    return session ? query.session(session) : query;
  }

  assertIdempotencyMatch(refund, requestHash) {
    if (refund.requestHash !== requestHash) {
      throw new AppError(
        'Idempotency-Key was already used for a different refund request',
        409,
        'REFUND_IDEMPOTENCY_CONFLICT'
      );
    }
  }

  async reserveRefundAmount(refundId) {
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const refund = await this.findInternal(refundId, session);
        if (!refund || refund.status === REFUND_STATUSES.COMPLETED) {
          return;
        }

        let returnEntry = null;
        if (refund.returnId) {
          returnEntry = await Return.findById(refund.returnId)
            .select('+refund +inventoryRestockedAt')
            .session(session);
          if (
            !returnEntry
            || String(returnEntry.order) !== String(refund.order)
            || !['approved', 'inspected'].includes(returnEntry.status)
            || Number(returnEntry.refundAmount.toFixed(2))
              !== Number(refund.amount.toFixed(2))
            || (returnEntry.refund
              && String(returnEntry.refund) !== String(refund._id))
          ) {
            throw new AppError(
              'Return refund reconciliation state is unavailable',
              503,
              'RETURN_REFUND_STATE_UNAVAILABLE'
            );
          }
          returnEntry.refund = refund._id;
        }
        if (refund.reservationActive) {
          if (returnEntry?.isModified()) await returnEntry.save({ session });
          return;
        }

        const payment = await Payment.findOneAndUpdate({
          _id: refund.payment,
          status: {
            $in: [
              PAYMENT_STATUSES.COMPLETED,
              PAYMENT_STATUSES.PARTIALLY_REFUNDED
            ]
          },
          $expr: {
            $gte: [
              {
                $subtract: [
                  {
                    $subtract: [
                      {
                        $cond: [
                          { $gt: ['$paidAmount', 0] },
                          '$paidAmount',
                          '$amount'
                        ]
                      },
                      '$refundedAmount'
                    ]
                  },
                  '$refundReservedAmount'
                ]
              },
              refund.amount
            ]
          }
        }, {
          $inc: { refundReservedAmount: refund.amount }
        }, {
          new: true,
          session
        });

        if (!payment) {
          throw new AppError(
            'Refund amount exceeds the remaining paid amount',
            409,
            'REFUND_AMOUNT_EXCEEDS_AVAILABLE'
          );
        }

        refund.reservationActive = true;
        refund.status = REFUND_STATUSES.PENDING;
        refund.providerAttemptStatus = PROVIDER_ATTEMPT_STATUSES.UNCLAIMED;
        refund.failureCode = '';
        await refund.save({ session });
        if (returnEntry) await returnEntry.save({ session });
      });
    } finally {
      await session.endSession();
    }
  }

  async resumeRefund(refund, idempotentReplay) {
    if (refund.status === REFUND_STATUSES.COMPLETED) {
      return {
        idempotentReplay,
        refund: this.toPublicRefund(refund)
      };
    }

    if (refund.providerOutcome === 'succeeded') {
      await this.completeRefund(refund._id, { source: 'provider' });
      const completed = await Refund.findById(refund._id);
      return {
        idempotentReplay: true,
        refund: this.toPublicRefund(completed)
      };
    }

    if (
      [REFUND_STATUSES.PENDING, REFUND_STATUSES.FAILED].includes(refund.status)
      && !refund.reservationActive
    ) {
      try {
        await this.reserveRefundAmount(refund._id);
      } catch (error) {
        await Refund.updateOne({ _id: refund._id }, {
          $set: {
            status: REFUND_STATUSES.FAILED,
            providerAttemptStatus: PROVIDER_ATTEMPT_STATUSES.FAILED,
            failureCode: typeof error.code === 'string'
              ? error.code
              : 'REFUND_AMOUNT_EXCEEDS_AVAILABLE'
          }
        });
        throw error;
      }
      refund = await this.findInternal(refund._id);
    }

    const claimToken = crypto.randomUUID();
    const claimed = await Refund.findOneAndUpdate({
      _id: refund._id,
      reservationActive: true,
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
        providerClaimedAt: new Date(),
        status: REFUND_STATUSES.PROCESSING,
        failureCode: ''
      },
      $push: {
        history: {
          status: REFUND_STATUSES.PROCESSING,
          source: 'system',
          timestamp: new Date()
        }
      }
    }, {
      new: true
    }).select(
      '+providerIdempotencyKey +providerAttemptStatus +providerClaimToken '
      + '+reservationActive +processingMode +providerOutcome +returnId +method'
    );

    if (!claimed) {
      const current = await Refund.findById(refund._id);
      return {
        idempotentReplay: true,
        refund: this.toPublicRefund(current)
      };
    }

    let providerConfirmed = false;
    try {
      const payment = await Payment.findById(claimed.payment);
      const provider = this.getProvider(claimed.provider);
      const providerResult = await provider.refundPayment({
        providerPaymentId: payment.providerPaymentId,
        amount: claimed.amount,
        refundId: claimed._id,
        paymentId: payment._id,
        orderId: payment.order,
        idempotencyKey: claimed.providerIdempotencyKey
      });
      const providerOutcome = ['succeeded', 'failed', 'canceled'].includes(
        providerResult.status
      ) ? providerResult.status : 'pending';

      const persisted = await Refund.updateOne({
        _id: claimed._id,
        providerClaimToken: claimToken
      }, {
        $set: {
          providerRefundId: providerResult.providerRefundId,
          providerAttemptStatus: PROVIDER_ATTEMPT_STATUSES.READY,
          providerOutcome
        }
      });
      if (persisted.matchedCount !== 1) {
        throw new AppError(
          'Refund provider result could not be persisted',
          503,
          'REFUND_PROVIDER_RESULT_NOT_PERSISTED'
        );
      }

      if (providerResult.status === 'succeeded') {
        providerConfirmed = true;
        await this.completeRefund(claimed._id, {
          source: 'provider'
        });
      } else if (['failed', 'canceled'].includes(providerResult.status)) {
        await this.failRefund(claimed._id, 'REFUND_PROVIDER_ERROR', {
          source: 'provider'
        });
      }

      const current = await Refund.findById(claimed._id);
      return {
        idempotentReplay,
        refund: this.toPublicRefund(current)
      };
    } catch (error) {
      if (!providerConfirmed) {
        await this.markRefundIndeterminate(claimed._id);
      }
      throw error;
    }
  }

  async resumeManualRefund(refund, idempotentReplay) {
    if (refund.status === REFUND_STATUSES.COMPLETED) {
      return {
        idempotentReplay,
        refund: this.toPublicRefund(refund)
      };
    }

    if (
      [REFUND_STATUSES.PENDING, REFUND_STATUSES.FAILED].includes(refund.status)
      && !refund.reservationActive
    ) {
      try {
        await this.reserveRefundAmount(refund._id);
      } catch (error) {
        await Refund.updateOne({ _id: refund._id }, {
          $set: {
            status: REFUND_STATUSES.FAILED,
            providerAttemptStatus: PROVIDER_ATTEMPT_STATUSES.FAILED,
            failureCode: typeof error.code === 'string'
              ? error.code
              : 'REFUND_AMOUNT_EXCEEDS_AVAILABLE'
          }
        });
        throw error;
      }
      refund = await this.findInternal(refund._id);
    }

    const claimed = await Refund.findOneAndUpdate({
      _id: refund._id,
      processingMode: 'manual',
      reservationActive: true,
      status: { $ne: REFUND_STATUSES.COMPLETED },
      providerAttemptStatus: {
        $in: [
          PROVIDER_ATTEMPT_STATUSES.UNCLAIMED,
          PROVIDER_ATTEMPT_STATUSES.FAILED
        ]
      }
    }, {
      $set: {
        providerAttemptStatus: PROVIDER_ATTEMPT_STATUSES.READY,
        providerOutcome: 'manual_confirmed',
        status: REFUND_STATUSES.PROCESSING,
        failureCode: ''
      },
      $push: {
        history: {
          status: REFUND_STATUSES.PROCESSING,
          source: 'admin',
          timestamp: new Date()
        }
      }
    }, { new: true }).select(
      '+processingMode +providerOutcome +reservationActive +returnId +method'
    );

    if (!claimed) {
      const current = await this.findInternal(refund._id);
      if (current?.providerOutcome === 'manual_confirmed') {
        await this.completeRefund(current._id, { source: 'admin' });
      }
      const reconciled = await Refund.findById(refund._id);
      return {
        idempotentReplay: true,
        refund: this.toPublicRefund(reconciled)
      };
    }

    await this.completeRefund(claimed._id, { source: 'admin' });
    const completed = await Refund.findById(claimed._id);
    return {
      idempotentReplay,
      refund: this.toPublicRefund(completed)
    };
  }

  async completeRefund(refundId, {
    source,
    providerEventId = ''
  }) {
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const refund = await this.findInternal(refundId, session);
        if (!refund || refund.status === REFUND_STATUSES.COMPLETED) {
          return;
        }
        const confirmed = refund.processingMode === 'manual'
          ? refund.providerOutcome === 'manual_confirmed'
          : refund.providerOutcome === 'succeeded';
        if (!confirmed) {
          throw new AppError(
            'Refund completion has not been financially confirmed',
            409,
            'REFUND_CONFIRMATION_REQUIRED'
          );
        }

        const payment = await Payment.findById(refund.payment)
          .select('+refundReservedAmount')
          .session(session);
        const order = await Order.findById(refund.order).session(session);
        const returnEntry = refund.returnId
          ? await Return.findById(refund.returnId)
            .select('+refund +inventoryRestockedAt')
            .session(session)
          : null;

        if (
          !payment
          || !order
          || !refund.reservationActive
          || (refund.returnId && (
            !returnEntry
            || String(returnEntry.order) !== String(order._id)
            || String(returnEntry.refund) !== String(refund._id)
            || !['approved', 'inspected'].includes(returnEntry.status)
            || Number(returnEntry.refundAmount.toFixed(2))
              !== Number(refund.amount.toFixed(2))
          ))
        ) {
          throw new AppError(
            'Refund reconciliation state is unavailable',
            503,
            'PAYMENT_WEBHOOK_PROCESSING_FAILED'
          );
        }

        const paidAmount = payment.paidAmount > 0
          ? payment.paidAmount
          : payment.amount;
        const nextRefundedAmount = Number(
          (payment.refundedAmount + refund.amount).toFixed(2)
        );
        const fullyRefunded = nextRefundedAmount >= paidAmount;
        const paymentStatus = fullyRefunded
          ? PAYMENT_STATUSES.REFUNDED
          : PAYMENT_STATUSES.PARTIALLY_REFUNDED;

        payment.refundedAmount = nextRefundedAmount;
        payment.refundReservedAmount = Math.max(
          0,
          Number((payment.refundReservedAmount - refund.amount).toFixed(2))
        );
        paymentStateMachine.apply(payment, paymentStatus, {
          source: 'refund',
          providerEventId
        });

        refund.status = REFUND_STATUSES.COMPLETED;
        refund.completedAt = refund.completedAt || new Date();
        refund.reservationActive = false;
        refund.providerAttemptStatus = PROVIDER_ATTEMPT_STATUSES.READY;
        refund.failureCode = '';
        refund.history.push({
          status: REFUND_STATUSES.COMPLETED,
          source,
          providerEventId,
          timestamp: new Date()
        });

        order.paymentStatus = fullyRefunded
          ? 'Refunded'
          : 'PartiallyRefunded';

        if (returnEntry) {
          await ReturnInventoryService.restockInTransaction(returnEntry, {
            session,
            adminId: refund.processedBy,
            refundId: refund._id
          });
          returnEntry.status = 'refunded';
          returnEntry.refundedAt = returnEntry.refundedAt || new Date();
          returnEntry.refund = refund._id;
        }

        await payment.save({ session });
        await refund.save({ session });
        await order.save({ session });
        if (returnEntry) await returnEntry.save({ session });
      });
    } finally {
      await session.endSession();
    }
  }

  async markRefundIndeterminate(refundId) {
    await Refund.updateOne({
      _id: refundId,
      status: { $ne: REFUND_STATUSES.COMPLETED }
    }, {
      $set: {
        status: REFUND_STATUSES.PROCESSING,
        providerAttemptStatus: PROVIDER_ATTEMPT_STATUSES.FAILED,
        providerOutcome: 'unknown',
        failureCode: 'REFUND_PROVIDER_OUTCOME_UNKNOWN'
      },
      $push: {
        history: {
          status: REFUND_STATUSES.PROCESSING,
          source: 'system',
          errorCode: 'REFUND_PROVIDER_OUTCOME_UNKNOWN',
          timestamp: new Date()
        }
      }
    });
  }

  async failRefund(refundId, errorCode, {
    source,
    providerEventId = '',
    providerOutcome = null
  }) {
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const refund = await this.findInternal(refundId, session);
        if (
          !refund
          || refund.status === REFUND_STATUSES.COMPLETED
          || refund.status === REFUND_STATUSES.CANCELLED
        ) {
          return;
        }

        if (refund.reservationActive) {
          await Payment.updateOne({
            _id: refund.payment,
            refundReservedAmount: { $gte: refund.amount }
          }, {
            $inc: { refundReservedAmount: -refund.amount }
          }, {
            session
          });
        }

        refund.reservationActive = false;
        refund.status = REFUND_STATUSES.FAILED;
        refund.providerAttemptStatus = PROVIDER_ATTEMPT_STATUSES.FAILED;
        if (providerOutcome) refund.providerOutcome = providerOutcome;
        refund.failureCode = errorCode;
        refund.history.push({
          status: REFUND_STATUSES.FAILED,
          source,
          providerEventId,
          errorCode,
          timestamp: new Date()
        });
        await refund.save({ session });
      });
    } finally {
      await session.endSession();
    }
  }

  async handleProviderEvent(event) {
    const providerRefund = event.data?.object;
    const refundId = providerRefund?.metadata?.refundId;
    const refund = refundId
      ? await this.findInternal(refundId)
      : await Refund.findOne({ providerRefundId: providerRefund?.id }).select(
        '+providerAttemptStatus +reservationActive'
      );

    if (!refund) {
      throw new AppError(
        'Refund record was not found for the provider event',
        404,
        'REFUND_NOT_FOUND'
      );
    }
    if (
      providerRefund.metadata?.paymentId
      && String(providerRefund.metadata.paymentId) !== String(refund.payment)
    ) {
      throw new AppError(
        'Provider refund metadata does not match the refund record',
        422,
        'PAYMENT_WEBHOOK_METADATA_MISMATCH'
      );
    }
    if (
      Number.isFinite(providerRefund.amount)
      && providerRefund.amount !== Math.round((refund.amount + Number.EPSILON) * 100)
    ) {
      throw new AppError(
        'Provider refund amount does not match the refund record',
        422,
        'PAYMENT_AMOUNT_MISMATCH'
      );
    }
    if (
      providerRefund.currency
      && providerRefund.currency.toUpperCase() !== refund.currency
    ) {
      throw new AppError(
        'Provider refund currency does not match the refund record',
        422,
        'PAYMENT_CURRENCY_MISMATCH'
      );
    }

    if (refund.status === REFUND_STATUSES.COMPLETED) {
      return {
        outcome: providerRefund.status === 'succeeded' ? 'processed' : 'ignored'
      };
    }

    const providerOutcome = ['succeeded', 'failed', 'canceled'].includes(
      providerRefund.status
    ) ? providerRefund.status : 'pending';
    if (providerRefund.id && !refund.providerRefundId) {
      refund.providerRefundId = providerRefund.id;
    }
    if (refund.providerOutcome !== providerOutcome) {
      refund.providerOutcome = providerOutcome;
    }
    if (refund.isModified()) {
      await refund.save();
    }

    if (providerRefund.status === 'succeeded') {
      if (!refund.reservationActive) {
        await this.reserveRefundAmount(refund._id);
      }
      await this.completeRefund(refund._id, {
        source: 'provider',
        providerEventId: event.id
      });
      return { outcome: 'processed' };
    }

    if (['failed', 'canceled'].includes(providerRefund.status)) {
      await this.failRefund(refund._id, 'REFUND_PROVIDER_ERROR', {
        source: 'provider',
        providerEventId: event.id
      });
      return { outcome: 'processed' };
    }

    return { outcome: 'processed' };
  }

  async listRefunds({ page, limit, status }) {
    const query = status ? { status } : {};
    const [refunds, total] = await Promise.all([
      Refund.find(query)
        .populate('customer', 'fullName email phone')
        .populate('order', 'orderId')
        .populate('payment', 'provider providerPaymentId status amount currency refundedAmount')
        .populate('processedBy', 'fullName')
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Refund.countDocuments(query)
    ]);

    return {
      refunds: refunds.map((refund) => this.toPublicRefund(refund)),
      pagination: {
        page,
        limit,
        total,
        pages: Math.max(1, Math.ceil(total / limit))
      }
    };
  }

  async getRefund(refundId) {
    const refund = await Refund.findById(refundId)
      .populate('customer', 'fullName email phone')
      .populate('order', 'orderId')
      .populate('payment', 'provider providerPaymentId status amount currency refundedAmount')
      .populate('processedBy', 'fullName');

    if (!refund) {
      throw new AppError('Refund not found', 404, 'REFUND_NOT_FOUND');
    }
    return this.toPublicRefund(refund);
  }

  toPublicRefund(refund) {
    return refund?.toJSON ? refund.toJSON() : refund;
  }
}

module.exports = new RefundService();
module.exports.stableHash = stableHash;

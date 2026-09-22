/**
 * @file OrderDeliveryOutcomeService.js
 * @description Transactional Delivery Outcome Recording and Rolling Risk Governance.
 * Atomically records immutable courier delivery outcomes, evaluates rolling 90-day qualifying
 * RTO/refusal thresholds, and derives 30-day customer COD temporary locks.
 */

'use strict';

const mongoose = require('mongoose');
const Order = require('../../models/Order');
const CodDeliveryOutcome = require('../../models/CodDeliveryOutcome');
const CustomerCodRestriction = require('../../models/CustomerCodRestriction');
const { AppError } = require('../../common/errors/AppError');
const logger = require('../../utils/logger');

const ROLLING_WINDOW_DAYS = 90;
const LOCK_DURATION_DAYS = 30;
const QUALIFYING_THRESHOLD_COUNT = 2;

class OrderDeliveryOutcomeService {
  constructor({
    orderModel = Order,
    outcomeModel = CodDeliveryOutcome,
    restrictionModel = CustomerCodRestriction
  } = {}) {
    this.orderModel = orderModel;
    this.outcomeModel = outcomeModel;
    this.restrictionModel = restrictionModel;
  }

  /**
   * Records a courier delivery outcome within an atomic MongoDB transaction.
   *
   * @param {Object} params
   * @param {string} [params.merchantScopeId='default']
   * @param {string} params.orderId - Order _id or public orderId
   * @param {string} params.outcomeCode - Canonical outcome code
   * @param {string} [params.eventId] - Unique idempotent event ID
   * @param {Date} [params.occurredAt=new Date()]
   * @param {Object} [params.actor] - Authenticated admin or system actor
   * @param {Object} [params.metadata={}] - Tracking number, courier name, refusal reason, etc.
   * @param {mongoose.ClientSession} [params.session]
   * @returns {Promise<{ outcome: Object, restriction: Object|null, qualifyingCount: number, isDuplicate: boolean }>}
   */
  async recordDeliveryOutcome({
    merchantScopeId = 'default',
    orderId,
    outcomeCode,
    eventId = null,
    occurredAt = new Date(),
    actor = null,
    metadata = {},
    session: existingSession = null
  }) {
    if (!orderId) {
      throw new AppError('Order ID is required to record delivery outcome', 400, 'ORDER_ID_REQUIRED');
    }

    if (!outcomeCode || !this.outcomeModel.ALL_COD_OUTCOMES.includes(outcomeCode)) {
      throw new AppError(
        `Invalid delivery outcome code: '${outcomeCode}'`,
        400,
        'INVALID_OUTCOME_CODE'
      );
    }

    const resolvedEventId = eventId || `EVT_${orderId}_${outcomeCode}_${new Date(occurredAt).getTime()}`;

    // 1. Idempotency Check
    const existing = await this.outcomeModel.findOne({
      merchantScopeId,
      eventId: resolvedEventId
    });
    if (existing) {
      logger.info('Duplicate delivery outcome event ignored', { merchantScopeId, eventId: resolvedEventId });
      return { outcome: existing, restriction: null, qualifyingCount: 0, isDuplicate: true };
    }

    const runWork = async (session) => {
      // Find Order
      const query = mongoose.Types.ObjectId.isValid(orderId)
        ? { $or: [{ _id: orderId }, { orderId }] }
        : { orderId };

      const order = await this.orderModel.findOne(query).session(session);
      if (!order) {
        throw new AppError(`Order not found for ID: ${orderId}`, 404, 'ORDER_NOT_FOUND');
      }

      const customerId = order.user || null;
      const occurredDate = new Date(occurredAt);

      // 2. Append-Only Event Record
      const outcome = new this.outcomeModel({
        merchantScopeId,
        customerId: customerId || new mongoose.Types.ObjectId('000000000000000000000000'),
        orderId: order._id,
        publicOrderId: order.orderId,
        eventId: resolvedEventId,
        outcomeCode,
        occurredAt: occurredDate,
        recordedAt: new Date(),
        recordedBy: actor?._id || actor?.id || null,
        metadata: {
          courierName: metadata.courierName || null,
          trackingNumber: metadata.trackingNumber || null,
          refusalReason: metadata.refusalReason || null,
          rtoReason: metadata.rtoReason || null,
          notes: metadata.notes || null
        }
      });

      await outcome.save({ session });

      let restriction = null;
      let qualifyingCount = 0;

      // 3. Rolling Window Evaluation for Authenticated Customers
      if (customerId && this.outcomeModel.isQualifyingOutcome(outcomeCode)) {
        const windowStartDate = new Date(occurredDate.getTime() - ROLLING_WINDOW_DAYS * 24 * 60 * 60 * 1000);

        qualifyingCount = await this.outcomeModel.countDocuments({
          merchantScopeId,
          customerId,
          outcomeCode: { $in: this.outcomeModel.QUALIFYING_COD_OUTCOMES },
          occurredAt: { $gte: windowStartDate, $lte: occurredDate }
        }).session(session);

        if (qualifyingCount >= QUALIFYING_THRESHOLD_COUNT) {
          const lockUntil = new Date(occurredDate.getTime() + LOCK_DURATION_DAYS * 24 * 60 * 60 * 1000);

          restriction = await this.restrictionModel.findOne({
            merchantScopeId,
            customerId
          }).session(session);

          if (!restriction) {
            restriction = new this.restrictionModel({
              merchantScopeId,
              customerId,
              temporaryLockUntil: lockUntil,
              temporaryLockReasonCode: 'COD_CUSTOMER_TEMPORARILY_LOCKED',
              automaticLockSource: 'ROLLING_RTO_THRESHOLD',
              lockVersion: 1
            });
          } else {
            const currentLockTime = restriction.temporaryLockUntil
              ? new Date(restriction.temporaryLockUntil).getTime()
              : 0;

            if (lockUntil.getTime() > currentLockTime) {
              restriction.temporaryLockUntil = lockUntil;
              restriction.temporaryLockReasonCode = 'COD_CUSTOMER_TEMPORARILY_LOCKED';
              restriction.automaticLockSource = 'ROLLING_RTO_THRESHOLD';
              restriction.lockVersion = (restriction.lockVersion || 1) + 1;
            }
          }

          await restriction.save({ session });

          logger.warn('Customer COD temporarily locked due to rolling delivery refusal threshold', {
            merchantScopeId,
            customerId: String(customerId),
            qualifyingCount,
            temporaryLockUntil: lockUntil.toISOString()
          });
        }
      }

      return { outcome, restriction, qualifyingCount, isDuplicate: false };
    };

    if (existingSession) {
      return runWork(existingSession);
    }

    const session = await mongoose.startSession();
    try {
      let result;
      await session.withTransaction(async () => {
        result = await runWork(session);
      });
      return result;
    } finally {
      await session.endSession();
    }
  }
}

const defaultOrderDeliveryOutcomeService = new OrderDeliveryOutcomeService();

module.exports = defaultOrderDeliveryOutcomeService;
module.exports.OrderDeliveryOutcomeService = OrderDeliveryOutcomeService;
module.exports.ROLLING_WINDOW_DAYS = ROLLING_WINDOW_DAYS;
module.exports.LOCK_DURATION_DAYS = LOCK_DURATION_DAYS;
module.exports.QUALIFYING_THRESHOLD_COUNT = QUALIFYING_THRESHOLD_COUNT;

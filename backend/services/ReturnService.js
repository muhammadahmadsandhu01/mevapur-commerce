const mongoose = require('mongoose');
const Order = require('../models/Order');
const Payment = require('../models/Payment');
const Refund = require('../models/Refund');
const Return = require('../models/Return');
const RefundService = require('./payment/RefundService');
const paymentProviderRegistry = require('../modules/payments/core/providerRegistry');
const { AppError } = require('../common/errors/AppError');
const ERROR_CODES = require('../constants/errorCodes');
const { PAYMENT_STATUSES } = require('../constants/paymentConstants');
const {
  allocateOrderMerchandise,
  amountForQuantityRange,
  fromMinorUnits,
  orderLineKey: lineKey,
  toMinorUnits
} = require('./ReturnMoneyAllocationService');

const RETURN_POLICY = Object.freeze({ eligibleStatus: 'Delivered', windowDays: 30 });
const RESERVED_RETURN_STATUSES = Object.freeze([
  'pending',
  'approved',
  'received',
  'inspected',
  'refunded'
]);
const ACTIVE_RETURN_STATUSES = Object.freeze([
  'pending',
  'approved',
  'received',
  'inspected'
]);
const REFUNDABLE_RETURN_STATUSES = Object.freeze(['approved', 'inspected']);

const roundMoney = (value) => fromMinorUnits(toMinorUnits(value));

const referenceQuery = (reference) => (
  mongoose.isObjectIdOrHexString(reference)
    ? { _id: reference }
    : { orderId: reference }
);

class ReturnService {
  matchOrderLine(order, requestItem) {
    const productMatches = order.items.filter(
      (item) => String(item.product) === String(requestItem.productId)
    );
    const matches = requestItem.variantId
      ? productMatches.filter(
        (item) => String(item.variantId || '') === String(requestItem.variantId)
      )
      : productMatches;

    if (matches.length !== 1) {
      throw new AppError(
        matches.length > 1
          ? 'A variant identifier is required for this return item'
          : 'Return item does not belong to the order',
        400,
        ERROR_CODES.CUSTOMER_RETURN_NOT_ELIGIBLE
      );
    }
    return matches[0];
  }

  priorQuantityForLine(priorReturns, orderItem) {
    const canonicalKey = lineKey(orderItem.product, orderItem.variantId);
    return priorReturns.reduce((total, priorReturn) => (
      total + priorReturn.items.reduce((itemTotal, item) => {
        if (item.orderLineKey) {
          return item.orderLineKey === canonicalKey
            ? itemTotal + item.quantity
            : itemTotal;
        }
        if (String(item.product) !== String(orderItem.product)) return itemTotal;
        if (item.variantId && String(item.variantId) !== String(orderItem.variantId || '')) {
          return itemTotal;
        }
        // Historical return rows did not retain variant identity. Counting them
        // conservatively prevents a legacy row from enabling an over-return.
        return itemTotal + item.quantity;
      }, 0)
    ), 0);
  }

  canonicalizeItems(order, requestedItems, priorReturns) {
    const allocation = allocateOrderMerchandise(order);
    const seen = new Set();
    let requestedRefundMinor = 0;
    const items = requestedItems.map((requestItem) => {
      if (!Number.isInteger(requestItem.quantity) || requestItem.quantity <= 0) {
        throw new AppError(
          'Return quantity must be a positive integer',
          400,
          ERROR_CODES.CUSTOMER_RETURN_NOT_ELIGIBLE
        );
      }

      const orderItem = this.matchOrderLine(order, requestItem);
      const orderLineKey = lineKey(orderItem.product, orderItem.variantId);
      if (seen.has(orderLineKey)) {
        throw new AppError(
          'Duplicate order lines are not allowed in a return request',
          400,
          ERROR_CODES.CUSTOMER_RETURN_NOT_ELIGIBLE
        );
      }
      seen.add(orderLineKey);

      const priorQuantity = this.priorQuantityForLine(priorReturns, orderItem);
      const remainingQuantity = orderItem.quantity - priorQuantity;
      if (requestItem.quantity > remainingQuantity) {
        throw new AppError(
          'Return quantity exceeds the remaining eligible quantity',
          409,
          ERROR_CODES.CUSTOMER_RETURN_NOT_ELIGIBLE
        );
      }

      const allocatedLine = allocation.lines.find(
        (line) => line.item === orderItem
      );
      if (!allocatedLine) {
        throw new AppError(
          'Order monetary snapshot is unavailable for return allocation',
          503,
          'RETURN_REFUND_STATE_UNAVAILABLE'
        );
      }
      const itemRefundMinor = amountForQuantityRange(
        allocatedLine,
        priorQuantity,
        requestItem.quantity
      );
      requestedRefundMinor += itemRefundMinor;

      return {
        product: orderItem.product,
        variantId: orderItem.variantId || null,
        isDefaultVariant: Boolean(orderItem.isDefaultVariant),
        orderLineKey,
        name: orderItem.name,
        quantity: requestItem.quantity,
        price: orderItem.price,
        refundAmount: fromMinorUnits(itemRefundMinor),
        reason: requestItem.reason,
        reasonDetails: requestItem.reasonDetails || '',
        images: requestItem.images || [],
        condition: requestItem.condition || 'new'
      };
    });

    const allocatedPriorMinor = order.items.reduce((total, orderItem) => {
      const allocatedLine = allocation.lines.find(
        (line) => line.item === orderItem
      );
      const priorQuantity = this.priorQuantityForLine(priorReturns, orderItem);
      if (!allocatedLine || priorQuantity > orderItem.quantity) {
        throw new AppError(
          'Prior return allocation exceeds the historical order line',
          503,
          'RETURN_REFUND_STATE_UNAVAILABLE'
        );
      }
      return total + amountForQuantityRange(
        allocatedLine,
        0,
        priorQuantity
      );
    }, 0);
    const recordedPriorMinor = priorReturns.reduce(
      (total, priorReturn) => total + toMinorUnits(priorReturn.refundAmount || 0),
      0
    );
    const consumedPriorMinor = Math.max(
      allocatedPriorMinor,
      recordedPriorMinor
    );
    if (
      consumedPriorMinor + requestedRefundMinor
      > allocation.allocatableMinor
    ) {
      throw new AppError(
        'Return amount exceeds the remaining refundable merchandise amount',
        409,
        ERROR_CODES.CUSTOMER_RETURN_NOT_ELIGIBLE
      );
    }

    return {
      items,
      refundAmount: fromMinorUnits(requestedRefundMinor)
    };
  }

  assertCustomerEligibility(order, userId) {
    if (String(order.user) !== String(userId)) {
      throw new AppError('Order not found', 404, ERROR_CODES.ORDER_NOT_FOUND);
    }
    if (
      order.orderStatus !== RETURN_POLICY.eligibleStatus
      || !order.deliveredAt
      || Date.now() - order.deliveredAt.getTime()
        > RETURN_POLICY.windowDays * 86400000
    ) {
      throw new AppError(
        'This order is not eligible for a return request',
        409,
        ERROR_CODES.CUSTOMER_RETURN_NOT_ELIGIBLE
      );
    }
  }

  async createReturn({ input, userId = null, requireOwnership = false }) {
    const session = await mongoose.startSession();
    try {
      let created;
      await session.withTransaction(async () => {
        const order = await Order.findOne(referenceQuery(input.orderId))
          .select('+returnReservationVersion')
          .session(session);
        if (!order) {
          throw new AppError('Order not found', 404, ERROR_CODES.ORDER_NOT_FOUND);
        }
        if (requireOwnership) this.assertCustomerEligibility(order, userId);

        const activeReturn = await Return.exists({
          order: order._id,
          status: { $in: ACTIVE_RETURN_STATUSES }
        }).session(session);
        if (activeReturn) {
          throw new AppError(
            'An active return request already exists for this order',
            409,
            ERROR_CODES.CUSTOMER_RETURN_EXISTS
          );
        }

        const priorReturns = await Return.find({
          order: order._id,
          status: { $in: RESERVED_RETURN_STATUSES }
        }).session(session);
        const canonical = this.canonicalizeItems(order, input.items, priorReturns);

        // This write makes same-order request transactions conflict rather than
        // allowing two independent eligibility reads to reserve the same units.
        await Order.updateOne(
          { _id: order._id },
          { $inc: { returnReservationVersion: 1 } },
          { session }
        );

        [created] = await Return.create([{
          order: order._id,
          customer: order.user,
          items: canonical.items,
          refundMethod: input.refundMethod || 'original_payment',
          refundAmount: canonical.refundAmount,
          customerNotes: input.customerNotes || ''
        }], { session });
      });
      return created;
    } finally {
      await session.endSession();
    }
  }

  requestCustomerReturn(userId, input) {
    return this.createReturn({ input, userId, requireOwnership: true });
  }

  createAdminReturn(input) {
    return this.createReturn({ input });
  }

  async updateStatus(returnId, input, adminId) {
    const entry = await Return.findById(returnId).select('+refund');
    if (!entry) throw new AppError('Return not found', 404, 'RETURN_NOT_FOUND');
    if (entry.status === input.status) return entry;
    if (entry.refund) {
      throw new AppError(
        'A refund is already being reconciled for this return',
        409,
        'RETURN_REFUND_IN_PROGRESS'
      );
    }

    const update = { $set: { status: input.status } };
    if (input.adminNotes) {
      update.$push = {
        adminNotes: { note: input.adminNotes, addedBy: adminId }
      };
    }
    if (input.status === 'approved') {
      update.$set.approvedBy = adminId;
      update.$set.approvedAt = new Date();
    }
    if (input.status === 'received') update.$set.receivedAt = new Date();
    if (input.status === 'rejected') {
      update.$set.rejectedReason = input.rejectedReason || 'No reason provided';
    }
    if (input.trackingNumber) update.$set.trackingNumber = input.trackingNumber;
    if (input.courierCompany) update.$set.courierCompany = input.courierCompany;

    const updated = await Return.findOneAndUpdate({
      _id: entry._id,
      status: entry.status,
      refund: null
    }, update, { new: true });
    if (updated) return updated;

    const current = await Return.findById(entry._id).select('+refund');
    if (current?.status === input.status) return current;
    throw new AppError(
      'Return state changed while the update was being processed',
      409,
      'RETURN_REFUND_CONFLICT'
    );
  }

  async authoritativeRefundSnapshot(entry) {
    const order = await Order.findById(entry.order);
    if (!order) throw new AppError('Order not found', 404, ERROR_CODES.ORDER_NOT_FOUND);
    const priorReturns = await Return.find({
      _id: { $ne: entry._id },
      order: order._id,
      status: { $in: RESERVED_RETURN_STATUSES }
    });
    const requestedItems = entry.items.map((item) => ({
      productId: String(item.product),
      variantId: item.variantId ? String(item.variantId) : undefined,
      quantity: item.quantity,
      reason: item.reason,
      reasonDetails: item.reasonDetails || '',
      images: item.images || [],
      condition: item.condition || 'new'
    }));
    return this.canonicalizeItems(order, requestedItems, priorReturns);
  }

  async processRefund({ returnId, adminId, adminNotes = '' }) {
    let entry = await Return.findById(returnId).select('+refund');
    if (!entry) throw new AppError('Return not found', 404, 'RETURN_NOT_FOUND');

    if (entry.status === 'refunded') {
      const completed = entry.refund
        ? await Refund.findById(entry.refund)
        : await Refund.findOne({ returnId: entry._id });
      if (!completed || completed.status !== 'Completed') {
        throw new AppError(
          'Completed refund evidence is unavailable for this return',
          503,
          'RETURN_REFUND_STATE_UNAVAILABLE'
        );
      }
      return { idempotentReplay: true, refund: completed, return: entry };
    }
    if (!REFUNDABLE_RETURN_STATUSES.includes(entry.status)) {
      throw new AppError(
        'Return must be inspected or approved before refund',
        409,
        'RETURN_NOT_REFUNDABLE'
      );
    }

    const canonical = await this.authoritativeRefundSnapshot(entry);
    if (!entry.refund) {
      entry = await Return.findOneAndUpdate({
        _id: entry._id,
        status: { $in: REFUNDABLE_RETURN_STATUSES },
        refund: null
      }, {
        $set: {
          items: canonical.items,
          refundAmount: canonical.refundAmount
        }
      }, { new: true }).select('+refund');
      if (!entry) {
        throw new AppError(
          'Return state changed while the refund was being prepared',
          409,
          'RETURN_REFUND_CONFLICT'
        );
      }
    } else if (
      Number(entry.refundAmount.toFixed(2))
      !== Number(canonical.refundAmount.toFixed(2))
    ) {
      throw new AppError(
        'Return refund reconciliation state is unavailable',
        503,
        'RETURN_REFUND_STATE_UNAVAILABLE'
      );
    }

    let existingRefund = null;
    let payment = null;
    if (entry.refund) {
      existingRefund = await Refund.findById(entry.refund)
        .select('+processingMode');
      if (!existingRefund) {
        throw new AppError(
          'Return refund reconciliation state is unavailable',
          503,
          'RETURN_REFUND_STATE_UNAVAILABLE'
        );
      }
      payment = await Payment.findById(existingRefund.payment);
    } else {
      payment = await Payment.findOne({
        order: entry.order,
        status: {
          $in: [
            PAYMENT_STATUSES.COMPLETED,
            PAYMENT_STATUSES.PARTIALLY_REFUNDED
          ]
        }
      }).sort({ completedAt: -1, _id: -1 });
    }
    if (!payment) {
      throw new AppError(
        'A completed payment is required before this return can be refunded',
        409,
        'RETURN_PAYMENT_NOT_REFUNDABLE'
      );
    }

    const provider = paymentProviderRegistry.getInstalled(payment.provider);
    const manifest = provider.getManifest();
    let processingMode = existingRefund?.processingMode;
    if (!processingMode) {
      if (entry.refundMethod === 'store_credit') {
        throw new AppError(
          'Store-credit refunds are not implemented',
          409,
          'RETURN_REFUND_METHOD_UNAVAILABLE'
        );
      }
      if (manifest.capabilities.refund) {
        if (entry.refundMethod !== 'original_payment') {
          throw new AppError(
            'This payment must be refunded through its original provider',
            409,
            'RETURN_REFUND_METHOD_UNAVAILABLE'
          );
        }
        processingMode = 'provider';
      } else if (['offline', 'manual'].includes(manifest.paymentType)) {
        processingMode = 'manual';
      } else {
        throw new AppError(
          'The original payment provider cannot process this refund',
          409,
          'PAYMENT_PROVIDER_OPERATION_UNAVAILABLE'
        );
      }
    }

    const refundInput = {
      paymentId: payment._id,
      amount: canonical.refundAmount,
      reason: `Approved return ${entry.returnNumber}`,
      adminId,
      idempotencyKey: `return:${entry._id}`,
      returnId: entry._id,
      method: entry.refundMethod
    };
    const result = processingMode === 'provider'
      ? await RefundService.createRefund(refundInput)
      : await RefundService.createManualRefund(refundInput);
    if (result.refund.status === 'Failed') {
      throw new AppError(
        'The payment provider rejected the refund',
        502,
        'PAYMENT_PROVIDER_ERROR'
      );
    }

    if (!result.idempotentReplay && adminNotes) {
      await Return.updateOne(
        { _id: entry._id },
        { $push: { adminNotes: { note: adminNotes, addedBy: adminId } } }
      );
    }

    const currentReturn = await Return.findById(entry._id);
    return { ...result, return: currentReturn };
  }
}

module.exports = new ReturnService();
module.exports.lineKey = lineKey;
module.exports.roundMoney = roundMoney;

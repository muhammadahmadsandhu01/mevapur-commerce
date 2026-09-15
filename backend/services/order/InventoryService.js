/**
 * @file InventoryService.js (Order Domain)
 * @description Order inventory reservation and restoration adapter for Phase 6D-2.
 * Delegates to canonical InventoryReservationService while maintaining backward compatibility.
 */

const Product = require('../../models/Product');
const InventoryTransaction = require('../../models/InventoryTransaction');
const FulfillmentLocation = require('../../models/FulfillmentLocation');
const InventoryPosition = require('../../models/InventoryPosition');
const InventoryReservationService = require('../inventory/InventoryReservationService');
const { AppError } = require('../../common/errors/AppError');
const ERROR_CODES = require('../../constants/errorCodes');

class OrderInventoryService {
  /**
   * Reserve inventory for an order across multi-origin locations.
   */
  async reserve(items, {
    session,
    orderId,
    orderObjectId,
    userId,
    destinationCountry = 'PK',
    merchantScopeId = 'default',
    idempotencyKey = null,
    isInstantConfirm = false
  }) {
    // Check if multi-origin fulfillment locations and inventory positions exist
    const hasPositions = await InventoryPosition.exists({ merchantScopeId });

    if (hasPositions) {
      return InventoryReservationService.createReservation({
        orderId,
        orderObjectId,
        items,
        destinationCountry,
        merchantScopeId,
        checkoutAttempt: idempotencyKey || orderId,
        idempotencyKey: idempotencyKey || `${orderId}:order-reserve`,
        isInstantConfirm,
        session,
        userId
      });
    }

    // Fallback for legacy standalone test environments without multi-origin positions
    for (const item of items) {
      const query = {
        _id: item.product,
        isActive: true
      };
      const stockPath = item.variantId
        ? 'variants.$.stock'
        : 'stock';

      if (item.variantId) {
        query.variants = {
          $elemMatch: {
            _id: item.variantId,
            stock: { $gte: item.quantity }
          }
        };
        query.stock = { $gte: item.quantity };
      } else {
        query.stock = { $gte: item.quantity };
      }

      const increment = {
        [stockPath]: -item.quantity,
        soldCount: item.quantity
      };

      if (item.variantId) {
        increment.stock = -item.quantity;
      }

      const productBefore = await Product.findOneAndUpdate(
        query,
        { $inc: increment },
        { session, new: false }
      );

      if (!productBefore) {
        throw new AppError(
          `Insufficient stock for ${item.name}`,
          409,
          ERROR_CODES.ORDER_OUT_OF_STOCK
        );
      }

      const previousStock = item.variantId
        ? productBefore.variants.id(item.variantId).stock
        : productBefore.stock;

      await InventoryTransaction.create([{
        product: item.product,
        variantId: item.variantId || null,
        order: orderObjectId,
        operationKey: `${orderObjectId}:${item.product}:${item.variantId || 'root'}:sale`,
        type: 'sale',
        quantity: item.quantity,
        previousStock,
        newStock: previousStock - item.quantity,
        reason: 'Stock reserved for customer order',
        reference: orderId,
        performedBy: userId,
        metadata: {
          orderId,
          sku: item.sku || ''
        }
      }], { session });
    }
  }

  /**
   * Restore inventory upon order cancellation.
   */
  async restore(order, { session, userId }) {
    if (order.inventoryReservationId || (order.items?.[0]?.inventoryPositionId)) {
      await InventoryReservationService.releaseReservation({
        orderId: order.orderId,
        reservationId: order.inventoryReservationId,
        releaseReason: 'ORDER_CANCELLED',
        merchantScopeId: 'default',
        session,
        userId
      });
      return;
    }

    // Fallback for legacy orders
    for (const item of order.items) {
      const update = {
        $inc: {
          soldCount: -item.quantity
        }
      };

      if (item.variantId) {
        update.$inc['variants.$.stock'] = item.quantity;
        update.$inc.stock = item.quantity;
      } else {
        update.$inc.stock = item.quantity;
      }

      const query = { _id: item.product };
      if (item.variantId) {
        query['variants._id'] = item.variantId;
      }

      const productBefore = await Product.findOneAndUpdate(
        query,
        update,
        { session, new: false }
      );

      if (!productBefore) {
        throw new AppError(
          'Order inventory could not be restored',
          409,
          ERROR_CODES.ORDER_TRANSACTION_FAILED
        );
      }

      const previousStock = item.variantId
        ? productBefore.variants.id(item.variantId).stock
        : productBefore.stock;

      await InventoryTransaction.create([{
        product: item.product,
        variantId: item.variantId || null,
        order: order._id,
        operationKey: `${order._id}:${item.product}:${item.variantId || 'root'}:cancel`,
        type: 'return',
        quantity: item.quantity,
        previousStock,
        newStock: previousStock + item.quantity,
        reason: 'Stock restored after order cancellation',
        reference: order.orderId,
        performedBy: userId,
        metadata: {
          orderId: order.orderId,
          cancellation: true
        }
      }], { session });
    }
  }
}

module.exports = new OrderInventoryService();

/**
 * @file InventoryService.js (Order Domain)
 * @description Canonical Order Inventory Reservation and Restoration Adapter for Phase 6D-2.
 * Pure compatibility façade delegating strictly to canonical inventory services (InventoryReservationService).
 * Enforces single inventory authority: Product.stock is never read, decremented, or mutated at runtime.
 */

const InventoryReservationService = require('../inventory/InventoryReservationService');
const { AppError } = require('../../common/errors/AppError');
const ERROR_CODES = require('../../constants/errorCodes');

class OrderInventoryService {
  /**
   * Reserve inventory for an order across canonical multi-origin locations.
   * Delegates strictly to InventoryReservationService.
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

  /**
   * Restore inventory upon order cancellation.
   * Delegates strictly to InventoryReservationService.
   */
  async restore(order, { session, userId }) {
    return InventoryReservationService.releaseReservation({
      orderId: order.orderId,
      reservationId: order.inventoryReservationId || null,
      releaseReason: 'ORDER_CANCELLED',
      merchantScopeId: order.merchantScopeId || 'default',
      session,
      userId
    });
  }
}

module.exports = new OrderInventoryService();

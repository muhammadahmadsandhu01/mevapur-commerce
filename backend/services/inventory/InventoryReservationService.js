/**
 * @file InventoryReservationService.js
 * @description Durable reservation state machine and atomic execution engine for Phase 6D-2.
 * Coordinates multi-origin allocation, atomic MongoDB transaction reservation, payment confirmation/compensation,
 * shipment physical stock consumption, cancellation releases, and explicit TTL expiry reconciliation.
 */

const mongoose = require('mongoose');
const FulfillmentLocation = require('../../models/FulfillmentLocation');
const InventoryPosition = require('../../models/InventoryPosition');
const InventoryLedger = require('../../models/InventoryLedger');
const InventoryReservation = require('../../models/InventoryReservation');
const InventoryAllocationService = require('./InventoryAllocationService');
const { AppError } = require('../../common/errors/AppError');
const ERROR_CODES = require('../../constants/errorCodes');

class InventoryReservationService {
  /**
   * Atomically reserve stock across allocated fulfillment origins inside a MongoDB transaction.
   * @param {Object} params
   * @param {string} params.orderId - Human-readable order identifier
   * @param {mongoose.Types.ObjectId} [params.orderObjectId] - Mongo ObjectId for order
   * @param {Array<Object>} params.items - Priced line items
   * @param {string} params.destinationCountry - ISO alpha-2 country
   * @param {string} [params.merchantScopeId='default']
   * @param {string} [params.checkoutAttempt]
   * @param {string} params.idempotencyKey
   * @param {boolean} [params.isInstantConfirm=false] - True for COD where reservation is immediately confirmed
   * @param {mongoose.ClientSession} params.session - Active MongoDB transaction session
   * @param {mongoose.Types.ObjectId} [params.userId]
   * @returns {Promise<Object>}
   */
  async createReservation({
    orderId,
    orderObjectId = null,
    items,
    destinationCountry,
    merchantScopeId = 'default',
    checkoutAttempt = null,
    idempotencyKey,
    isInstantConfirm = false,
    session,
    userId = null
  }) {
    if (!orderId || !items || !destinationCountry || !idempotencyKey) {
      throw new AppError('Missing required parameters for inventory reservation', 400, ERROR_CODES.VALIDATION_ERROR);
    }

    const reservationKey = `resv:${merchantScopeId}:${idempotencyKey}`;

    // 1. Idempotency Check
    let existingQuery = InventoryReservation.findOne({
      $or: [{ reservationKey }, { merchantScopeId, orderId }]
    });
    if (session) existingQuery = existingQuery.session(session);
    const existing = await existingQuery;

    if (existing) {
      return {
        reservation: existing,
        allocations: existing.allocations,
        isReplay: true
      };
    }

    // 2. Deterministic Allocation Evaluation
    const allocationResult = await InventoryAllocationService.allocate({
      items,
      destinationCountry,
      merchantScopeId,
      session
    });

    if (!allocationResult.success) {
      throw new AppError(
        allocationResult.message || 'Insufficient inventory available to satisfy order',
        409,
        ERROR_CODES.INVENTORY_INSUFFICIENT || 'INSUFFICIENT_STOCK'
      );
    }

    const { allocations, shipmentGroups } = allocationResult;
    const reservationDocId = new mongoose.Types.ObjectId();

    // 3. Atomically lock & reserve each position with conditional ATP checks
    for (const alloc of allocations) {
      let posQuery = InventoryPosition.findById(alloc.inventoryPositionId);
      if (session) posQuery = posQuery.session(session);
      const posBefore = await posQuery;

      if (!posBefore) {
        throw new AppError(
          `Inventory position '${alloc.inventoryPositionId}' for SKU '${alloc.canonicalSku}' was not found`,
          404,
          'INVENTORY_POSITION_NOT_FOUND'
        );
      }

      const beforeAtp = posBefore.calculateATP();
      if (beforeAtp < alloc.quantity) {
        throw new AppError(
          `Insufficient available stock for SKU '${alloc.canonicalSku}' at location '${alloc.locationCode}'`,
          409,
          ERROR_CODES.INVENTORY_INSUFFICIENT || 'INSUFFICIENT_STOCK'
        );
      }

      // Conditional atomic update enforcing non-negative remaining ATP
      const updateCondition = {
        _id: alloc.inventoryPositionId,
        $expr: {
          $gte: [
            {
              $subtract: [
                { $subtract: [{ $subtract: ['$onHand', '$reserved'] }, '$unavailable'] },
                '$safetyStock'
              ]
            },
            alloc.quantity
          ]
        }
      };

      const updatePayload = {
        $inc: {
          reserved: alloc.quantity,
          lockVersion: 1
        },
        $set: {
          lastLedgerSequence: `${orderId}:${alloc.canonicalSku}:reserve`
        }
      };

      let posUpdateQuery = InventoryPosition.findOneAndUpdate(updateCondition, updatePayload, { new: true });
      if (session) posUpdateQuery = posUpdateQuery.session(session);
      const posAfter = await posUpdateQuery;

      if (!posAfter) {
        throw new AppError(
          `Insufficient available stock for SKU '${alloc.canonicalSku}' at location '${alloc.locationCode}'`,
          409,
          ERROR_CODES.INVENTORY_INSUFFICIENT || 'INSUFFICIENT_STOCK'
        );
      }

      const afterAtp = posAfter.calculateATP();

      // Record immutable ledger entry in the same transaction
      const ledgerEntry = new InventoryLedger({
        merchantScopeId,
        locationId: alloc.locationId,
        locationCode: alloc.locationCode,
        productId: alloc.productId,
        variantId: alloc.variantId || null,
        canonicalSku: alloc.canonicalSku,
        movementType: 'RESERVATION_CREATED',
        quantityDelta: 0,
        reservationDelta: alloc.quantity,
        beforeSnapshot: {
          onHand: posBefore.onHand,
          reserved: posBefore.reserved,
          unavailable: posBefore.unavailable,
          safetyStock: posBefore.safetyStock,
          atp: beforeAtp
        },
        afterSnapshot: {
          onHand: posAfter.onHand,
          reserved: posAfter.reserved,
          unavailable: posAfter.unavailable,
          safetyStock: posAfter.safetyStock,
          atp: afterAtp
        },
        reasonCode: 'ORDER_RESERVATION_CREATED',
        sourceType: 'order',
        sourceId: String(orderObjectId || orderId),
        orderId,
        reservationId: reservationDocId,
        idempotencyKey: `${orderId}:${alloc.inventoryPositionId}:reserve`,
        actorType: userId ? 'user' : 'system',
        actorId: userId,
        correlationId: String(checkoutAttempt || idempotencyKey)
      });

      if (session) {
        await ledgerEntry.save({ session });
      } else {
        await ledgerEntry.save();
      }
    }

    // 4. Create Durable Reservation Document
    const initialStatus = isInstantConfirm ? 'confirmed' : 'pending';
    const now = new Date();

    const reservation = new InventoryReservation({
      _id: reservationDocId,
      merchantScopeId,
      reservationKey,
      orderId,
      orderObjectId,
      checkoutAttempt,
      status: initialStatus,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30 minutes TTL
      confirmedAt: isInstantConfirm ? now : null,
      allocations,
      lockVersion: 1
    });

    if (session) {
      await reservation.save({ session });
    } else {
      await reservation.save();
    }

    return {
      reservation,
      allocations,
      shipmentGroups,
      isReplay: false
    };
  }

  /**
   * Confirm an existing pending reservation upon successful payment capture/authorization.
   */
  async confirmReservation({ orderId, reservationId = null, merchantScopeId = 'default', session = null, userId = null }) {
    const query = reservationId
      ? { _id: reservationId }
      : { merchantScopeId, orderId };

    let findQuery = InventoryReservation.findOne(query);
    if (session) findQuery = findQuery.session(session);
    const reservation = await findQuery;

    if (!reservation) {
      throw new AppError(`Inventory reservation for order '${orderId}' was not found`, 404, 'RESERVATION_NOT_FOUND');
    }

    if (reservation.status === 'confirmed' || reservation.status === 'consumed') {
      return { reservation, isReplay: true };
    }

    if (reservation.status !== 'pending') {
      throw new AppError(
        `Cannot confirm reservation in '${reservation.status}' state`,
        409,
        'INVALID_RESERVATION_STATE'
      );
    }

    reservation.status = 'confirmed';
    reservation.confirmedAt = new Date();
    reservation.lockVersion += 1;

    if (session) {
      await reservation.save({ session });
    } else {
      await reservation.save();
    }

    return { reservation, isReplay: false };
  }

  /**
   * Release reserved stock back to sellable ATP (on payment failure or manual admin release).
   */
  async releaseReservation({
    orderId,
    reservationId = null,
    releaseReason = 'PAYMENT_FAILED_RELEASE',
    merchantScopeId = 'default',
    session = null,
    userId = null
  }) {
    const query = reservationId
      ? { _id: reservationId }
      : { merchantScopeId, orderId };

    let findQuery = InventoryReservation.findOne(query);
    if (session) findQuery = findQuery.session(session);
    const reservation = await findQuery;

    if (!reservation) {
      return { success: true, released: false, message: 'No reservation found to release' };
    }

    if (reservation.status === 'released' || reservation.status === 'expired' || reservation.status === 'cancelled') {
      return { reservation, isReplay: true };
    }

    if (reservation.status === 'consumed') {
      throw new AppError('Cannot release an already consumed inventory reservation', 409, 'RESERVATION_ALREADY_CONSUMED');
    }

    // Decrement reserved counters on positions and append ledger entries
    for (const alloc of reservation.allocations) {
      let posQuery = InventoryPosition.findById(alloc.inventoryPositionId);
      if (session) posQuery = posQuery.session(session);
      const posBefore = await posQuery;

      if (posBefore) {
        const beforeAtp = posBefore.calculateATP();
        const nextReserved = Math.max(0, posBefore.reserved - alloc.quantity);

        let posUpdateQuery = InventoryPosition.findByIdAndUpdate(
          alloc.inventoryPositionId,
          {
            $set: { reserved: nextReserved },
            $inc: { lockVersion: 1 }
          },
          { new: true }
        );
        if (session) posUpdateQuery = posUpdateQuery.session(session);
        const posAfter = await posUpdateQuery;

        const ledgerMovementType = releaseReason === 'ORDER_CANCELLED'
          ? 'ORDER_CANCELLED_RELEASE'
          : (releaseReason === 'EXPIRED_UNPAID' ? 'RESERVATION_EXPIRED' : 'PAYMENT_FAILED_RELEASE');

        const ledgerEntry = new InventoryLedger({
          merchantScopeId,
          locationId: alloc.locationId,
          locationCode: alloc.locationCode,
          productId: alloc.productId,
          variantId: alloc.variantId || null,
          canonicalSku: alloc.canonicalSku,
          movementType: ledgerMovementType,
          quantityDelta: 0,
          reservationDelta: -alloc.quantity,
          beforeSnapshot: {
            onHand: posBefore.onHand,
            reserved: posBefore.reserved,
            unavailable: posBefore.unavailable,
            safetyStock: posBefore.safetyStock,
            atp: beforeAtp
          },
          afterSnapshot: {
            onHand: posAfter.onHand,
            reserved: posAfter.reserved,
            unavailable: posAfter.unavailable,
            safetyStock: posAfter.safetyStock,
            atp: posAfter.calculateATP()
          },
          reasonCode: releaseReason,
          sourceType: 'reservation',
          sourceId: String(reservation._id),
          orderId: reservation.orderId,
          reservationId: reservation._id,
          idempotencyKey: `${reservation.orderId}:${alloc.inventoryPositionId}:release:${releaseReason}`,
          actorType: userId ? 'user' : 'system',
          actorId: userId
        });

        if (session) {
          await ledgerEntry.save({ session });
        } else {
          await ledgerEntry.save();
        }
      }
    }

    reservation.status = releaseReason === 'ORDER_CANCELLED' ? 'cancelled' : (releaseReason === 'EXPIRED_UNPAID' ? 'expired' : 'released');
    reservation.releasedAt = new Date();
    reservation.releaseReason = releaseReason;
    reservation.lockVersion += 1;

    if (session) {
      await reservation.save({ session });
    } else {
      await reservation.save();
    }

    return { reservation, isReplay: false };
  }

  /**
   * Authoritatively consume physical inventory upon shipment/fulfillment transition.
   * Mutates: onHand -= qty, reserved -= qty, marks reservation 'consumed'.
   */
  async consumeShipment({ order, session = null, userId = null }) {
    if (!order) {
      throw new AppError('Order is required for shipment stock consumption', 400, ERROR_CODES.VALIDATION_ERROR);
    }

    const orderId = order.orderId;
    let findQuery = InventoryReservation.findOne({ orderId });
    if (session) findQuery = findQuery.session(session);
    const reservation = await findQuery;

    if (!reservation) {
      return { success: true, consumed: false, message: 'No reservation to consume' };
    }

    if (reservation.status === 'consumed') {
      return { reservation, isReplay: true };
    }

    for (const alloc of reservation.allocations) {
      let posQuery = InventoryPosition.findById(alloc.inventoryPositionId);
      if (session) posQuery = posQuery.session(session);
      const posBefore = await posQuery;

      if (posBefore) {
        const beforeAtp = posBefore.calculateATP();
        const nextOnHand = Math.max(0, posBefore.onHand - alloc.quantity);
        const nextReserved = Math.max(0, posBefore.reserved - alloc.quantity);

        let posUpdateQuery = InventoryPosition.findByIdAndUpdate(
          alloc.inventoryPositionId,
          {
            $set: {
              onHand: nextOnHand,
              reserved: nextReserved
            },
            $inc: { lockVersion: 1 }
          },
          { new: true }
        );
        if (session) posUpdateQuery = posUpdateQuery.session(session);
        const posAfter = await posUpdateQuery;

        const ledgerEntry = new InventoryLedger({
          merchantScopeId: reservation.merchantScopeId,
          locationId: alloc.locationId,
          locationCode: alloc.locationCode,
          productId: alloc.productId,
          variantId: alloc.variantId || null,
          canonicalSku: alloc.canonicalSku,
          movementType: 'SHIPMENT_CONSUMED',
          quantityDelta: -alloc.quantity,
          reservationDelta: -alloc.quantity,
          beforeSnapshot: {
            onHand: posBefore.onHand,
            reserved: posBefore.reserved,
            unavailable: posBefore.unavailable,
            safetyStock: posBefore.safetyStock,
            atp: beforeAtp
          },
          afterSnapshot: {
            onHand: posAfter.onHand,
            reserved: posAfter.reserved,
            unavailable: posAfter.unavailable,
            safetyStock: posAfter.safetyStock,
            atp: posAfter.calculateATP()
          },
          reasonCode: 'ORDER_SHIPMENT_DISPATCHED',
          sourceType: 'order',
          sourceId: String(order._id || orderId),
          orderId,
          reservationId: reservation._id,
          idempotencyKey: `${orderId}:${alloc.inventoryPositionId}:shipment_consumed`,
          actorType: userId ? 'admin' : 'system',
          actorId: userId
        });

        if (session) {
          await ledgerEntry.save({ session });
        } else {
          await ledgerEntry.save();
        }
      }
    }

    reservation.status = 'consumed';
    reservation.consumedAt = new Date();
    reservation.lockVersion += 1;

    if (session) {
      await reservation.save({ session });
    } else {
      await reservation.save();
    }

    return { reservation, isReplay: false };
  }

  /**
   * Explicit TTL Expiry Reconciliation Worker.
   * Finds expired non-terminal pending reservations, releases reserved counters,
   * creates immutable RESERVATION_EXPIRED ledger movements, and marks reservations expired.
   */
  async reconcileExpiredReservations({ merchantScopeId = 'default', olderThanMinutes = 0, batchSize = 100 } = {}) {
    const cutoff = new Date(Date.now() - olderThanMinutes * 60 * 1000);

    const expiredPending = await InventoryReservation.find({
      merchantScopeId,
      status: 'pending',
      expiresAt: { $lte: cutoff }
    }).limit(batchSize);

    let expiredCount = 0;

    for (const resv of expiredPending) {
      try {
        await this.releaseReservation({
          orderId: resv.orderId,
          reservationId: resv._id,
          releaseReason: 'EXPIRED_UNPAID',
          merchantScopeId
        });
        expiredCount += 1;
      } catch (err) {
        // Safe skip on individual conflict
      }
    }

    return {
      evaluated: expiredPending.length,
      expiredCount
    };
  }
}

module.exports = new InventoryReservationService();

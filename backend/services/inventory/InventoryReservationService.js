/**
 * @file InventoryReservationService.js
 * @description Durable reservation state machine and atomic execution engine for Phase 6D-2.
 * Coordinates multi-origin allocation, atomic MongoDB transaction reservation, payment confirmation/compensation,
 * shipment physical stock consumption, cancellation releases, return quarantine/restock conservation,
 * and explicit TTL expiry reconciliation.
 */

const mongoose = require('mongoose');
const FulfillmentLocation = require('../../models/FulfillmentLocation');
const InventoryPosition = require('../../models/InventoryPosition');
const InventoryLedger = require('../../models/InventoryLedger');
const InventoryReservation = require('../../models/InventoryReservation');
const Product = require('../../models/Product');
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
      allowSplit: true,
      session
    });

    if (!allocationResult.success) {
      throw new AppError(
        `Insufficient stock: ${allocationResult.message || 'Insufficient inventory available to satisfy order'}`,
        409,
        ERROR_CODES.ORDER_OUT_OF_STOCK || 'ORDER_OUT_OF_STOCK'
      );
    }

    const { allocations, shipmentGroups } = allocationResult;
    const reservationDocId = new mongoose.Types.ObjectId();
    const finalAllocations = [];

    // 3. Atomically lock & reserve each position with conditional ATP & backorder checks
    for (let i = 0; i < allocations.length; i++) {
      const alloc = allocations[i];
      let posQuery = InventoryPosition.findById(alloc.inventoryPositionId);
      if (session) posQuery = posQuery.session(session);
      const posBefore = await posQuery;

      if (!posBefore) {
        throw new AppError(
          `Inventory position '${alloc.inventoryPositionId}' for SKU '${alloc.canonicalSku}' was not found`,
          409,
          'INVENTORY_POSITION_REQUIRED'
        );
      }

      const physicalAtp = posBefore.getPhysicalATP ? posBefore.getPhysicalATP() : Math.max(0, posBefore.onHand - posBefore.reserved - posBefore.unavailable - posBefore.safetyStock);
      const backorderAtp = posBefore.getBackorderATP ? posBefore.getBackorderATP() : ((posBefore.allowBackorder && posBefore.backorderLimit > 0) ? Math.max(0, posBefore.backorderLimit - (posBefore.backordered || 0)) : 0);
      const totalSellableAtp = physicalAtp + backorderAtp;

      if (totalSellableAtp < alloc.quantity) {
        throw new AppError(
          `Insufficient available stock for SKU '${alloc.canonicalSku}' at location '${alloc.locationCode}'`,
          409,
          ERROR_CODES.INVENTORY_INSUFFICIENT || 'INSUFFICIENT_STOCK'
        );
      }

      const physicalAlloc = Math.min(physicalAtp, alloc.quantity);
      const backorderAlloc = alloc.quantity - physicalAlloc;

      if (backorderAlloc > 0 && backorderAlloc > backorderAtp) {
        throw new AppError(
          `Insufficient backorder capacity for SKU '${alloc.canonicalSku}' at location '${alloc.locationCode}'`,
          409,
          ERROR_CODES.INVENTORY_INSUFFICIENT || 'INSUFFICIENT_STOCK'
        );
      }

      let updateCondition;
      let updatePayload;

      if (physicalAlloc > 0 && backorderAlloc === 0) {
        updateCondition = {
          _id: alloc.inventoryPositionId,
          $expr: {
            $gte: [
              {
                $subtract: [
                  { $subtract: [{ $subtract: ['$onHand', '$reserved'] }, '$unavailable'] },
                  '$safetyStock'
                ]
              },
              physicalAlloc
            ]
          }
        };
        updatePayload = {
          $inc: {
            reserved: physicalAlloc,
            lockVersion: 1
          },
          $set: {
            lastLedgerSequence: `${orderId}:${alloc.canonicalSku}:reserve`
          }
        };
      } else if (physicalAlloc > 0 && backorderAlloc > 0) {
        updateCondition = {
          _id: alloc.inventoryPositionId,
          allowBackorder: true,
          $expr: {
            $and: [
              {
                $gte: [
                  {
                    $subtract: [
                      { $subtract: [{ $subtract: ['$onHand', '$reserved'] }, '$unavailable'] },
                      '$safetyStock'
                    ]
                  },
                  physicalAlloc
                ]
              },
              {
                $gte: [
                  { $subtract: ['$backorderLimit', { $ifNull: ['$backordered', 0] }] },
                  backorderAlloc
                ]
              }
            ]
          }
        };
        updatePayload = {
          $inc: {
            reserved: physicalAlloc,
            backordered: backorderAlloc,
            lockVersion: 1
          },
          $set: {
            lastLedgerSequence: `${orderId}:${alloc.canonicalSku}:reserve`
          }
        };
      } else {
        // Only backorder
        updateCondition = {
          _id: alloc.inventoryPositionId,
          allowBackorder: true,
          $expr: {
            $gte: [
              { $subtract: ['$backorderLimit', { $ifNull: ['$backordered', 0] }] },
              backorderAlloc
            ]
          }
        };
        updatePayload = {
          $inc: {
            backordered: backorderAlloc,
            lockVersion: 1
          },
          $set: {
            lastLedgerSequence: `${orderId}:${alloc.canonicalSku}:reserve`
          }
        };
      }

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


      const beforeAtp = posBefore.calculateATP();
      const afterAtp = posAfter.calculateATP();

      finalAllocations.push({
        locationId: alloc.locationId,
        locationCode: alloc.locationCode,
        originCountry: alloc.originCountry,
        productId: alloc.productId,
        variantId: alloc.variantId || null,
        canonicalSku: alloc.canonicalSku,
        quantity: alloc.quantity,
        physicalReservedQuantity: physicalAlloc,
        backorderedQuantity: backorderAlloc,
        consumedQuantity: 0,
        releasedQuantity: 0,
        returnedQuantity: 0,
        inspectionPendingQuantity: 0,
        restockedQuantity: 0,
        disposedQuantity: 0,
        status: isInstantConfirm ? 'confirmed' : 'pending',
        inventoryPositionId: alloc.inventoryPositionId,
        inventoryLockVersion: posAfter.lockVersion,
        fulfillmentMode: alloc.fulfillmentMode,
        shipmentGroup: alloc.shipmentGroup
      });

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
        reservationDelta: physicalAlloc,
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
        idempotencyKey: `${orderId}:${alloc.inventoryPositionId}:reserve:${i}`,
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
      allocations: finalAllocations,
      lockVersion: 1
    });

    if (session) {
      await reservation.save({ session });
    } else {
      await reservation.save();
    }

    return {
      reservation,
      allocations: finalAllocations,
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
    reservation.allocations.forEach((a) => {
      if (a.status === 'pending') a.status = 'confirmed';
    });

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

    // Decrement physical reserved and backorder counters on positions and append ledger entries
    for (let i = 0; i < reservation.allocations.length; i++) {
      const alloc = reservation.allocations[i];
      let posQuery = InventoryPosition.findById(alloc.inventoryPositionId);
      if (session) posQuery = posQuery.session(session);
      const posBefore = await posQuery;

      if (posBefore) {
        const beforeAtp = posBefore.calculateATP();
        const physToRelease = Math.max(0, (alloc.physicalReservedQuantity || 0) - (alloc.consumedQuantity || 0) - (alloc.releasedQuantity || 0));
        const backToRelease = Math.max(0, (alloc.backorderedQuantity || 0));

        const incObj = { lockVersion: 1 };
        if (physToRelease > 0) incObj.reserved = -physToRelease;
        if (backToRelease > 0) incObj.backordered = -backToRelease;

        let posAfter = posBefore;
        if (physToRelease > 0 || backToRelease > 0) {
          let posUpdateQuery = InventoryPosition.findByIdAndUpdate(
            alloc.inventoryPositionId,
            { $inc: incObj },
            { new: true }
          );
          if (session) posUpdateQuery = posUpdateQuery.session(session);
          posAfter = await posUpdateQuery;

        }

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
          reservationDelta: -physToRelease,
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
          idempotencyKey: `${reservation.orderId}:${alloc.inventoryPositionId}:release:${releaseReason}:${i}`,
          actorType: userId ? 'user' : 'system',
          actorId: userId
        });

        if (session) {
          await ledgerEntry.save({ session });
        } else {
          await ledgerEntry.save();
        }

        alloc.releasedQuantity = (alloc.releasedQuantity || 0) + physToRelease + backToRelease;
        alloc.status = 'released';
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

    for (let i = 0; i < reservation.allocations.length; i++) {
      const alloc = reservation.allocations[i];
      let posQuery = InventoryPosition.findById(alloc.inventoryPositionId);
      if (session) posQuery = posQuery.session(session);
      const posBefore = await posQuery;

      if (posBefore) {
        const beforeAtp = posBefore.calculateATP();
        const toConsume = Math.max(0, (alloc.physicalReservedQuantity || alloc.quantity) - (alloc.consumedQuantity || 0));

        if (toConsume > 0) {
          let posUpdateQuery = InventoryPosition.findByIdAndUpdate(
            alloc.inventoryPositionId,
            {
              $inc: {
                onHand: -toConsume,
                reserved: -toConsume,
                lockVersion: 1
              }
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
            quantityDelta: -toConsume,
            reservationDelta: -toConsume,
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
            idempotencyKey: `${orderId}:${alloc.inventoryPositionId}:shipment_consumed:${i}`,
            actorType: userId ? 'admin' : 'system',
            actorId: userId
          });

          if (session) {
            await ledgerEntry.save({ session });
          } else {
            await ledgerEntry.save();
          }

          alloc.consumedQuantity = (alloc.consumedQuantity || 0) + toConsume;
          alloc.status = 'consumed';
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
   * Process return receipt into quarantine (physical return re-enters facility but is unavailable).
   * Conservation: onHand += qty, unavailable += qty (sellable ATP remains unchanged).
   */
  async processReturnReceipt({
    orderId,
    reservationId = null,
    items,
    session = null,
    userId = null,
    reason = 'CUSTOMER_RETURN'
  }) {
    const query = reservationId ? { _id: reservationId } : { orderId };
    let findQuery = InventoryReservation.findOne(query);
    if (session) findQuery = findQuery.session(session);
    const reservation = await findQuery;

    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const alloc = reservation?.allocations.find((a) =>
        String(a.productId) === String(it.productId || it.product) &&
        String(a.variantId || '') === String(it.variantId || '')
      );

      const posId = it.inventoryPositionId || alloc?.inventoryPositionId;
      if (!posId) continue;

      let posQuery = InventoryPosition.findById(posId);
      if (session) posQuery = posQuery.session(session);
      const posBefore = await posQuery;

      if (posBefore) {
        const beforeAtp = posBefore.calculateATP();
        const qty = Number(it.quantity);

        let posUpdateQuery = InventoryPosition.findByIdAndUpdate(
          posId,
          {
            $inc: {
              onHand: qty,
              unavailable: qty,
              lockVersion: 1
            }
          },
          { new: true }
        );
        if (session) posUpdateQuery = posUpdateQuery.session(session);
        const posAfter = await posUpdateQuery;

        const ledgerEntry = new InventoryLedger({
          merchantScopeId: posBefore.merchantScopeId,
          locationId: posBefore.locationId,
          locationCode: posBefore.locationCode,
          productId: posBefore.productId,
          variantId: posBefore.variantId || null,
          canonicalSku: posBefore.canonicalSku,
          movementType: 'RETURN_RECEIVED',
          quantityDelta: qty,
          reservationDelta: 0,
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
          reasonCode: reason,
          sourceType: 'return',
          sourceId: String(orderId),
          orderId,
          reservationId: reservation?._id || null,
          idempotencyKey: `${orderId}:${posId}:return_receipt:${i}`,
          actorType: userId ? 'admin' : 'system',
          actorId: userId
        });

        if (session) {
          await ledgerEntry.save({ session });
        } else {
          await ledgerEntry.save();
        }

        if (alloc) {
          alloc.returnedQuantity = (alloc.returnedQuantity || 0) + qty;
          alloc.inspectionPendingQuantity = (alloc.inspectionPendingQuantity || 0) + qty;
        }
      }
    }

    if (reservation) {
      if (session) await reservation.save({ session });
      else await reservation.save();
    }

    return { success: true };
  }

  /**
   * Process return inspection decision (restock, quarantine, dispose).
   */
  async processReturnInspection({
    orderId,
    reservationId = null,
    items,
    decision = 'restock',
    session = null,
    userId = null,
    reason = 'INSPECTION_DECISION'
  }) {
    const query = reservationId ? { _id: reservationId } : { orderId };
    let findQuery = InventoryReservation.findOne(query);
    if (session) findQuery = findQuery.session(session);
    const reservation = await findQuery;

    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const alloc = reservation?.allocations.find((a) =>
        String(a.productId) === String(it.productId || it.product) &&
        String(a.variantId || '') === String(it.variantId || '')
      );

      const posId = it.inventoryPositionId || alloc?.inventoryPositionId;
      if (!posId) continue;

      let posQuery = InventoryPosition.findById(posId);
      if (session) posQuery = posQuery.session(session);
      const posBefore = await posQuery;

      if (posBefore) {
        const beforeAtp = posBefore.calculateATP();
        const qty = Number(it.quantity);
        let incObj = { lockVersion: 1 };
        let movementType = 'RETURN_RESTOCKED';
        let qtyDelta = 0;

        if (decision === 'restock') {
          // Already in onHand: reduce unavailable to release back to ATP
          incObj.unavailable = -qty;
          movementType = 'RETURN_RESTOCKED';
          qtyDelta = 0;
          if (alloc) {
            alloc.inspectionPendingQuantity = Math.max(0, (alloc.inspectionPendingQuantity || 0) - qty);
            alloc.restockedQuantity = (alloc.restockedQuantity || 0) + qty;
          }
        } else if (decision === 'dispose') {
          // Discard: reduce unavailable and onHand
          incObj.unavailable = -qty;
          incObj.onHand = -qty;
          movementType = 'DAMAGE';
          qtyDelta = -qty;
          if (alloc) {
            alloc.inspectionPendingQuantity = Math.max(0, (alloc.inspectionPendingQuantity || 0) - qty);
            alloc.disposedQuantity = (alloc.disposedQuantity || 0) + qty;
          }
        } else {
          // Quarantine confirmed
          movementType = 'RETURN_QUARANTINED';
          qtyDelta = 0;
          if (alloc) {
            alloc.inspectionPendingQuantity = Math.max(0, (alloc.inspectionPendingQuantity || 0) - qty);
          }
        }

        let posUpdateQuery = InventoryPosition.findByIdAndUpdate(posId, { $inc: incObj }, { new: true });
        if (session) posUpdateQuery = posUpdateQuery.session(session);
        const posAfter = await posUpdateQuery;

        const ledgerEntry = new InventoryLedger({
          merchantScopeId: posBefore.merchantScopeId,
          locationId: posBefore.locationId,
          locationCode: posBefore.locationCode,
          productId: posBefore.productId,
          variantId: posBefore.variantId || null,
          canonicalSku: posBefore.canonicalSku,
          movementType,
          quantityDelta: qtyDelta,
          reservationDelta: 0,
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
          reasonCode: reason,
          sourceType: 'return',
          sourceId: String(orderId),
          orderId,
          reservationId: reservation?._id || null,
          idempotencyKey: `${orderId}:${posId}:inspection_${decision}:${i}`,
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

    if (reservation) {
      if (session) await reservation.save({ session });
      else await reservation.save();
    }

    return { success: true };
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

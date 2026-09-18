/**
 * @file StockHoldLeaseService.js
 * @description Durable stock-hold leasing engine for Phase 6D-5A.
 * Manages atomic multi-line/multi-origin capacity holds, bounded lease renewals,
 * atomic hold conversions, and hardened crash-safe expiry reconciliations.
 */

'use strict';

const mongoose = require('mongoose');
const FulfillmentLocation = require('../../models/FulfillmentLocation');
const InventoryPosition = require('../../models/InventoryPosition');
const InventoryLedger = require('../../models/InventoryLedger');
const InventoryHold = require('../../models/InventoryHold');
const InventoryReservation = require('../../models/InventoryReservation');
const InventoryAllocationService = require('./InventoryAllocationService');
const { AppError } = require('../../common/errors/AppError');
const ERROR_CODES = require('../../constants/errorCodes');

class StockHoldLeaseService {
  /**
   * Atomically acquire a multi-line, multi-origin stock hold lease within a MongoDB transaction.
   * @param {Object} params
   * @param {string} params.sessionId
   * @param {Array<Object>} params.items - Priced line items
   * @param {string} params.destinationCountry - ISO alpha-2 country
   * @param {string} [params.merchantScopeId='default']
   * @param {number} [params.leaseDurationMinutes=15]
   * @param {string} params.idempotencyKey
   * @param {mongoose.ClientSession} params.session - Active MongoDB transaction session
   * @param {mongoose.Types.ObjectId} [params.userId]
   * @returns {Promise<{ hold: Object, allocations: Array, isReplay: boolean }>}
   */
  async acquireHold({
    sessionId,
    items,
    destinationCountry,
    merchantScopeId = 'default',
    leaseDurationMinutes = 15,
    idempotencyKey,
    session,
    userId = null
  }) {
    if (!sessionId || !items || !destinationCountry || !idempotencyKey) {
      throw new AppError('Missing required parameters for stock hold acquisition', 400, ERROR_CODES.VALIDATION_ERROR);
    }

    const holdKey = `hold:${merchantScopeId}:${sessionId}`;

    // 1. Idempotency Check
    let existingQuery = InventoryHold.findOne({
      $or: [{ holdKey }, { merchantScopeId, sessionId }]
    });
    if (session) existingQuery = existingQuery.session(session);
    const existing = await existingQuery;

    if (existing) {
      return {
        hold: existing,
        allocations: existing.allocations,
        isReplay: true
      };
    }

    // 2. Deterministic Multi-Origin Allocation Evaluation
    const allocationResult = await InventoryAllocationService.allocate({
      items,
      destinationCountry,
      merchantScopeId,
      allowSplit: true,
      session
    });

    if (!allocationResult.success) {
      throw new AppError(
        `Insufficient stock: ${allocationResult.message || 'Insufficient inventory available to satisfy cart'}`,
        409,
        ERROR_CODES.ORDER_OUT_OF_STOCK || 'ORDER_OUT_OF_STOCK'
      );
    }

    const { allocations, shipmentGroups } = allocationResult;
    const holdDocId = new mongoose.Types.ObjectId();
    const finalAllocations = [];
    const now = new Date();
    const leaseExpiresAt = new Date(now.getTime() + leaseDurationMinutes * 60 * 1000);
    const maxLifetimeExpiresAt = new Date(now.getTime() + 45 * 60 * 1000); // Strict 45-minute hard ceiling

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

      const physicalAtp = posBefore.getPhysicalATP
        ? posBefore.getPhysicalATP()
        : Math.max(0, posBefore.onHand - posBefore.reserved - posBefore.unavailable - posBefore.safetyStock);
      const backorderAtp = posBefore.getBackorderATP
        ? posBefore.getBackorderATP()
        : ((posBefore.allowBackorder && posBefore.backorderLimit > 0)
          ? Math.max(0, posBefore.backorderLimit - (posBefore.backordered || 0))
          : 0);
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

      // Allocation integrity check: physical + backordered == quantity
      if (physicalAlloc + backorderAlloc !== alloc.quantity) {
        throw new AppError(
          `Allocation balance error for SKU '${alloc.canonicalSku}'`,
          409,
          'INVENTORY_ALLOCATION_BALANCE_MISMATCH'
        );
      }

      let updateCondition;
      let updatePayload;

      if (physicalAlloc > 0 && backorderAlloc === 0) {
        updateCondition = {
          _id: alloc.inventoryPositionId,
          merchantScopeId,
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
            lastLedgerSequence: `${sessionId}:${alloc.canonicalSku}:hold`
          }
        };
      } else if (physicalAlloc > 0 && backorderAlloc > 0) {
        updateCondition = {
          _id: alloc.inventoryPositionId,
          merchantScopeId,
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
            lastLedgerSequence: `${sessionId}:${alloc.canonicalSku}:hold`
          }
        };
      } else {
        // Backorder only
        updateCondition = {
          _id: alloc.inventoryPositionId,
          merchantScopeId,
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
            lastLedgerSequence: `${sessionId}:${alloc.canonicalSku}:hold`
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

      const beforeAtp = posBefore.calculateATP ? posBefore.calculateATP() : physicalAtp;
      const afterAtp = posAfter.calculateATP ? posAfter.calculateATP() : (physicalAtp - physicalAlloc);

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
        inventoryPositionId: alloc.inventoryPositionId,
        inventoryLockVersion: posAfter.lockVersion,
        fulfillmentMode: alloc.fulfillmentMode || 'local',
        shipmentGroup: alloc.shipmentGroup || 'group_1'
      });

      // Record genuine immutable ledger entry in the same transaction
      const ledgerEntry = new InventoryLedger({
        merchantScopeId,
        locationId: alloc.locationId,
        locationCode: alloc.locationCode,
        productId: alloc.productId,
        variantId: alloc.variantId || null,
        canonicalSku: alloc.canonicalSku,
        movementType: 'HOLD_CREATED',
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
        reasonCode: 'CHECKOUT_HOLD_ACQUIRED',
        sourceType: 'checkout_session',
        sourceId: String(holdDocId),
        orderId: null,
        reservationId: null,
        idempotencyKey: `${sessionId}:${alloc.inventoryPositionId}:hold:${i}`,
        actorType: userId ? 'user' : 'system',
        actorId: userId,
        correlationId: String(idempotencyKey)
      });

      if (session) {
        await ledgerEntry.save({ session });
      } else {
        await ledgerEntry.save();
      }
    }

    // 4. Create Durable InventoryHold Document
    const hold = new InventoryHold({
      _id: holdDocId,
      merchantScopeId,
      sessionId,
      holdKey,
      status: InventoryHold.STATUSES.ACTIVE,
      expiresAt: leaseExpiresAt,
      renewalCount: 0,
      maxLifetimeExpiresAt,
      allocations: finalAllocations,
      lockVersion: 1
    });

    if (session) {
      await hold.save({ session });
    } else {
      await hold.save();
    }

    return {
      hold,
      allocations: finalAllocations,
      shipmentGroups,
      isReplay: false
    };
  }

  /**
   * Inspect an existing hold lease.
   */
  async inspectHold({ holdId, sessionId, merchantScopeId = 'default', session = null }) {
    const query = holdId ? { _id: holdId } : { merchantScopeId, sessionId };
    let findQuery = InventoryHold.findOne(query);
    if (session) findQuery = findQuery.session(session);
    return findQuery;
  }

  /**
   * Bounded hold renewal.
   */
  async renewHold({
    holdId,
    sessionId,
    merchantScopeId = 'default',
    extendMinutes = 15,
    session = null,
    userId = null
  }) {
    const query = holdId ? { _id: holdId } : { merchantScopeId, sessionId };
    let findQuery = InventoryHold.findOne(query);
    if (session) findQuery = findQuery.session(session);
    const hold = await findQuery;

    if (!hold) {
      throw new AppError('Stock hold not found', 404, 'HOLD_NOT_FOUND');
    }

    if (hold.status !== InventoryHold.STATUSES.ACTIVE) {
      throw new AppError(`Cannot renew hold in '${hold.status}' status`, 409, 'HOLD_STATUS_NOT_RENEWABLE');
    }

    const now = new Date();
    if (hold.expiresAt <= now) {
      throw new AppError('Cannot renew an expired hold lease', 409, 'HOLD_LEASE_EXPIRED');
    }

    if (hold.renewalCount >= 2) {
      throw new AppError('Maximum renewal count (2) exceeded for this hold lease', 409, 'HOLD_MAX_RENEWALS_EXCEEDED');
    }

    const potentialExpiry = new Date(now.getTime() + extendMinutes * 60 * 1000);
    const newExpiresAt = new Date(Math.min(potentialExpiry.getTime(), hold.maxLifetimeExpiresAt.getTime()));

    if (newExpiresAt <= hold.expiresAt) {
      throw new AppError('Hold lease has already reached its maximum allowed lifetime', 409, 'HOLD_MAX_LIFETIME_REACHED');
    }

    const updateFilter = {
      _id: hold._id,
      status: InventoryHold.STATUSES.ACTIVE,
      lockVersion: hold.lockVersion
    };
    const updatePayload = {
      $set: { expiresAt: newExpiresAt },
      $inc: { renewalCount: 1, lockVersion: 1 }
    };

    let updateQuery = InventoryHold.findOneAndUpdate(updateFilter, updatePayload, { new: true });
    if (session) updateQuery = updateQuery.session(session);
    const updatedHold = await updateQuery;

    if (!updatedHold) {
      throw new AppError('Concurrent modification during hold renewal', 409, 'CONCURRENT_HOLD_MUTATION');
    }

    return updatedHold;
  }

  /**
   * Transition an active hold to capture_committed upon verified payment capture.
   * Prevents the expiry worker from releasing the hold during order conversion.
   */
  async protectHoldForCapture({ holdId, sessionId, merchantScopeId = 'default', session = null }) {
    const query = holdId ? { _id: holdId } : { merchantScopeId, sessionId };
    let findQuery = InventoryHold.findOne(query);
    if (session) findQuery = findQuery.session(session);
    const hold = await findQuery;

    if (!hold) {
      throw new AppError('Stock hold not found', 404, 'HOLD_NOT_FOUND');
    }

    if (
      hold.status === InventoryHold.STATUSES.CAPTURE_COMMITTED ||
      hold.status === InventoryHold.STATUSES.CONVERTED
    ) {
      return hold;
    }

    if (hold.status !== InventoryHold.STATUSES.ACTIVE) {
      throw new AppError(`Cannot protect hold in '${hold.status}' status for capture`, 409, 'HOLD_STATUS_INVALID');
    }

    const updateFilter = {
      _id: hold._id,
      status: InventoryHold.STATUSES.ACTIVE,
      lockVersion: hold.lockVersion
    };
    const updatePayload = {
      $set: { status: InventoryHold.STATUSES.CAPTURE_COMMITTED },
      $inc: { lockVersion: 1 }
    };

    let updateQuery = InventoryHold.findOneAndUpdate(updateFilter, updatePayload, { new: true });
    if (session) updateQuery = updateQuery.session(session);
    const updatedHold = await updateQuery;

    if (!updatedHold) {
      throw new AppError('Concurrent modification while protecting hold for capture', 409, 'CONCURRENT_HOLD_MUTATION');
    }

    return updatedHold;
  }

  /**
   * Atomically release a stock hold and restore sellable ATP.
   */
  async releaseHold({
    holdId,
    sessionId,
    merchantScopeId = 'default',
    releaseReason = 'CHECKOUT_CANCELLED',
    session = null,
    userId = null
  }) {
    const query = holdId ? { _id: holdId } : { merchantScopeId, sessionId };
    let findQuery = InventoryHold.findOne(query);
    if (session) findQuery = findQuery.session(session);
    const hold = await findQuery;

    if (!hold) {
      return { success: true, released: false, message: 'No hold found to release' };
    }

    if (
      hold.status === InventoryHold.STATUSES.RELEASED ||
      hold.status === InventoryHold.STATUSES.EXPIRED
    ) {
      return { hold, released: false, isReplay: true };
    }

    if (hold.status === InventoryHold.STATUSES.CONVERTED) {
      throw new AppError('Cannot release an already converted stock hold', 409, 'HOLD_ALREADY_CONVERTED');
    }

    if (hold.status === InventoryHold.STATUSES.CAPTURE_COMMITTED) {
      throw new AppError('Cannot release a stock hold that is already capture committed', 409, 'HOLD_CAPTURE_COMMITTED');
    }

    // Hardened position decrement with strict preconditions
    for (let i = 0; i < hold.allocations.length; i++) {
      const alloc = hold.allocations[i];
      let posQuery = InventoryPosition.findById(alloc.inventoryPositionId);
      if (session) posQuery = posQuery.session(session);
      const posBefore = await posQuery;

      if (posBefore) {
        const physToRelease = Math.max(0, alloc.physicalReservedQuantity || 0);
        const backToRelease = Math.max(0, alloc.backorderedQuantity || 0);

        const updateFilter = {
          _id: alloc.inventoryPositionId,
          merchantScopeId: hold.merchantScopeId,
          reserved: { $gte: physToRelease }
        };
        if (backToRelease > 0) {
          updateFilter.backordered = { $gte: backToRelease };
        }

        const incObj = { lockVersion: 1 };
        if (physToRelease > 0) incObj.reserved = -physToRelease;
        if (backToRelease > 0) incObj.backordered = -backToRelease;

        let posUpdateQuery = InventoryPosition.findOneAndUpdate(
          updateFilter,
          { $inc: incObj },
          { new: true }
        );
        if (session) posUpdateQuery = posUpdateQuery.session(session);
        const posAfter = await posUpdateQuery;

        if (!posAfter) {
          throw new AppError(
            `Position release precondition failed for SKU '${alloc.canonicalSku}'`,
            409,
            'INVENTORY_RELEASE_PRECONDITION_FAILED'
          );
        }

        const movementType = releaseReason === 'EXPIRED_UNPAID'
          ? 'HOLD_EXPIRED'
          : 'HOLD_RELEASED';

        const beforeAtp = posBefore.calculateATP ? posBefore.calculateATP() : (posBefore.onHand - posBefore.reserved - posBefore.unavailable - posBefore.safetyStock);
        const afterAtp = posAfter.calculateATP ? posAfter.calculateATP() : (posAfter.onHand - posAfter.reserved - posAfter.unavailable - posAfter.safetyStock);

        const ledgerEntry = new InventoryLedger({
          merchantScopeId: hold.merchantScopeId,
          locationId: alloc.locationId,
          locationCode: alloc.locationCode,
          productId: alloc.productId,
          variantId: alloc.variantId || null,
          canonicalSku: alloc.canonicalSku,
          movementType,
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
            atp: afterAtp
          },
          reasonCode: releaseReason,
          sourceType: 'checkout_session',
          sourceId: String(hold._id),
          orderId: null,
          reservationId: null,
          idempotencyKey: `${hold.sessionId}:${alloc.inventoryPositionId}:release:${releaseReason}:${i}`,
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

    hold.status = releaseReason === 'EXPIRED_UNPAID'
      ? InventoryHold.STATUSES.EXPIRED
      : InventoryHold.STATUSES.RELEASED;
    hold.releasedAt = new Date();
    hold.releaseReason = releaseReason;
    hold.lockVersion += 1;

    if (session) {
      await hold.save({ session });
    } else {
      await hold.save();
    }

    return { hold, released: true, isReplay: false };
  }

  /**
   * Atomically convert hold to confirmed InventoryReservation upon authoritative payment capture.
   */
  async convertHold({
    holdId,
    sessionId,
    orderId,
    orderObjectId,
    merchantScopeId = 'default',
    session = null,
    userId = null
  }) {
    const query = holdId ? { _id: holdId } : { merchantScopeId, sessionId };
    let findQuery = InventoryHold.findOne(query);
    if (session) findQuery = findQuery.session(session);
    const hold = await findQuery;

    if (!hold) {
      throw new AppError(`Inventory hold for session '${sessionId}' was not found`, 404, 'HOLD_NOT_FOUND');
    }

    if (hold.status === InventoryHold.STATUSES.CONVERTED) {
      return { hold, isReplay: true };
    }

    if (
      hold.status !== InventoryHold.STATUSES.ACTIVE &&
      hold.status !== InventoryHold.STATUSES.CAPTURE_COMMITTED
    ) {
      throw new AppError(
        `Cannot convert hold in '${hold.status}' status`,
        409,
        'INVALID_HOLD_STATE_FOR_CONVERSION'
      );
    }

    // 1. Create confirmed permanent InventoryReservation for the Order
    const reservationDocId = new mongoose.Types.ObjectId();
    const reservationKey = `resv:${merchantScopeId}:${orderId}`;
    const reservationAllocations = hold.allocations.map((alloc) => ({
      locationId: alloc.locationId,
      locationCode: alloc.locationCode,
      originCountry: alloc.originCountry,
      productId: alloc.productId,
      variantId: alloc.variantId || null,
      canonicalSku: alloc.canonicalSku,
      quantity: alloc.quantity,
      physicalReservedQuantity: alloc.physicalReservedQuantity,
      backorderedQuantity: alloc.backorderedQuantity,
      consumedQuantity: 0,
      releasedQuantity: 0,
      returnedQuantity: 0,
      inspectionPendingQuantity: 0,
      restockedQuantity: 0,
      disposedQuantity: 0,
      status: 'confirmed',
      inventoryPositionId: alloc.inventoryPositionId,
      inventoryLockVersion: alloc.inventoryLockVersion,
      fulfillmentMode: alloc.fulfillmentMode,
      shipmentGroup: alloc.shipmentGroup
    }));

    const reservation = new InventoryReservation({
      _id: reservationDocId,
      merchantScopeId,
      reservationKey,
      orderId,
      orderObjectId,
      checkoutAttempt: sessionId,
      status: 'confirmed',
      expiresAt: new Date(Date.now() + 30 * 24 * 3600 * 1000), // 30-day fulfillment window
      confirmedAt: new Date(),
      allocations: reservationAllocations,
      lockVersion: 1
    });

    if (session) {
      await reservation.save({ session });
    } else {
      await reservation.save();
    }

    // 2. Mark Hold as Converted
    hold.status = InventoryHold.STATUSES.CONVERTED;
    hold.convertedAt = new Date();
    hold.convertedOrderId = orderObjectId;
    hold.lockVersion += 1;

    if (session) {
      await hold.save({ session });
    } else {
      await hold.save();
    }

    return { hold, reservation, isReplay: false };
  }

  /**
   * Deterministic batch worker for expired stock holds.
   */
  async expireDueHolds({ merchantScopeId = 'default', olderThanMinutes = 0, batchSize = 100 } = {}) {
    const cutoff = new Date(Date.now() - olderThanMinutes * 60 * 1000);

    const expiredActive = await InventoryHold.find({
      merchantScopeId,
      status: InventoryHold.STATUSES.ACTIVE,
      expiresAt: { $lte: cutoff }
    }).limit(batchSize);

    let expiredCount = 0;

    for (const hold of expiredActive) {
      const mongoSession = await mongoose.startSession();
      try {
        await mongoSession.withTransaction(async () => {
          await this.releaseHold({
            holdId: hold._id,
            sessionId: hold.sessionId,
            releaseReason: 'EXPIRED_UNPAID',
            merchantScopeId,
            session: mongoSession
          });
        });
        expiredCount += 1;
      } catch (err) {
        // Safe skip on individual collision
      } finally {
        await mongoSession.endSession();
      }
    }

    return {
      evaluated: expiredActive.length,
      expiredCount
    };
  }

  /**
   * Calculate active + capture_committed reserved capacity for a specific position.
   */
  async calculateReservedCapacity({ inventoryPositionId, merchantScopeId = 'default' }) {
    const holds = await InventoryHold.find({
      merchantScopeId,
      status: { $in: [InventoryHold.STATUSES.ACTIVE, InventoryHold.STATUSES.CAPTURE_COMMITTED] },
      'allocations.inventoryPositionId': inventoryPositionId
    });

    let activeReserved = 0;
    let activeBackordered = 0;

    for (const hold of holds) {
      const match = hold.allocations.find((a) => String(a.inventoryPositionId) === String(inventoryPositionId));
      if (match) {
        activeReserved += match.physicalReservedQuantity || 0;
        activeBackordered += match.backorderedQuantity || 0;
      }
    }

    return { activeReserved, activeBackordered, holdCount: holds.length };
  }
}

module.exports = new StockHoldLeaseService();

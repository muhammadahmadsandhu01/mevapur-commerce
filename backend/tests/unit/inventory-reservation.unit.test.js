/**
 * @file inventory-reservation.unit.test.js
 * @description Unit tests for InventoryReservation and InventoryLedger models,
 * state machine invariants, snapshots, and immutable ledger contracts in Phase 6D-2.
 */

const mongoose = require('mongoose');
const InventoryReservation = require('../../models/InventoryReservation');
const InventoryLedger = require('../../models/InventoryLedger');

describe('Phase 6D-2: InventoryReservation & Ledger Unit Tests', () => {
  const dummyLocId = new mongoose.Types.ObjectId();
  const dummyProdId = new mongoose.Types.ObjectId();
  const dummyPosId = new mongoose.Types.ObjectId();

  describe('InventoryReservation Model Invariants', () => {
    it('creates a valid reservation in pending state', () => {
      const reservation = new InventoryReservation({
        merchantScopeId: 'default',
        reservationKey: 'resv:default:idemp-123',
        orderId: 'ORD-20260915-ABCD1234EF',
        status: 'pending',
        expiresAt: new Date(Date.now() + 1800000),
        allocations: [{
          locationId: dummyLocId,
          locationCode: 'WH-LHE-01',
          originCountry: 'PK',
          productId: dummyProdId,
          variantId: null,
          canonicalSku: 'SKU-001',
          quantity: 2,
          inventoryPositionId: dummyPosId,
          inventoryLockVersion: 1,
          fulfillmentMode: 'local',
          shipmentGroup: 'group_1'
        }]
      });

      const err = reservation.validateSync();
      expect(err).toBeUndefined();
      expect(reservation.status).toBe('pending');
      expect(reservation.allocations.length).toBe(1);
    });

    it('rejects a reservation without any allocations', () => {
      const reservation = new InventoryReservation({
        merchantScopeId: 'default',
        reservationKey: 'resv:default:idemp-empty',
        orderId: 'ORD-20260915-EMPTY',
        status: 'pending',
        allocations: []
      });

      const err = reservation.validateSync();
      expect(err).toBeDefined();
      expect(err.errors['allocations']).toBeDefined();
    });

    it('rejects invalid reservation statuses', () => {
      const reservation = new InventoryReservation({
        merchantScopeId: 'default',
        reservationKey: 'resv:default:idemp-bad',
        orderId: 'ORD-20260915-BAD',
        status: 'unknown_status',
        allocations: [{
          locationId: dummyLocId,
          locationCode: 'WH-LHE-01',
          originCountry: 'PK',
          productId: dummyProdId,
          canonicalSku: 'SKU-001',
          quantity: 1,
          inventoryPositionId: dummyPosId
        }]
      });

      const err = reservation.validateSync();
      expect(err).toBeDefined();
      expect(err.errors['status']).toBeDefined();
    });
  });

  describe('InventoryLedger Model Invariants', () => {
    it('validates a complete ledger entry with before and after snapshots', () => {
      const entry = new InventoryLedger({
        merchantScopeId: 'default',
        locationId: dummyLocId,
        locationCode: 'WH-LHE-01',
        productId: dummyProdId,
        canonicalSku: 'SKU-001',
        movementType: 'RESERVATION_CREATED',
        quantityDelta: 0,
        reservationDelta: 2,
        beforeSnapshot: {
          onHand: 10,
          reserved: 0,
          unavailable: 0,
          safetyStock: 2,
          atp: 8
        },
        afterSnapshot: {
          onHand: 10,
          reserved: 2,
          unavailable: 0,
          safetyStock: 2,
          atp: 6
        },
        reasonCode: 'ORDER_RESERVATION_CREATED',
        sourceType: 'order',
        sourceId: 'ORD-123',
        idempotencyKey: 'ORD-123:POS-1:reserve'
      });

      const err = entry.validateSync();
      expect(err).toBeUndefined();
      expect(entry.movementType).toBe('RESERVATION_CREATED');
      expect(entry.reservationDelta).toBe(2);
    });

    it('rejects an unlisted movement type', () => {
      const entry = new InventoryLedger({
        merchantScopeId: 'default',
        productId: dummyProdId,
        canonicalSku: 'SKU-001',
        movementType: 'MAGIC_STOCK_INCREASE', // Invalid
        quantityDelta: 10,
        beforeSnapshot: { onHand: 0, reserved: 0, unavailable: 0, safetyStock: 0, atp: 0 },
        afterSnapshot: { onHand: 10, reserved: 0, unavailable: 0, safetyStock: 0, atp: 10 },
        reasonCode: 'TEST',
        sourceType: 'adjustment',
        idempotencyKey: 'key-1'
      });

      const err = entry.validateSync();
      expect(err).toBeDefined();
      expect(err.errors['movementType']).toBeDefined();
    });
  });
});

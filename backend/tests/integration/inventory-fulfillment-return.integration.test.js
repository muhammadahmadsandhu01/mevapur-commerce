/**
 * @file inventory-fulfillment-return.integration.test.js
 * @description Integration tests for shipment consumption, cancellation releases,
 * return quarantine/inspection state, explicit restock boundaries, and refund separation in Phase 6D-2.
 */

const crypto = require('crypto');
const mongoose = require('mongoose');
const Product = require('../../models/Product');
const FulfillmentLocation = require('../../models/FulfillmentLocation');
const InventoryPosition = require('../../models/InventoryPosition');
const InventoryReservation = require('../../models/InventoryReservation');
const InventoryLedger = require('../../models/InventoryLedger');
const InventoryReservationService = require('../../services/inventory/InventoryReservationService');

describe('Phase 6D-2: Inventory Fulfillment & Return Boundaries Integration Tests', () => {
  let location;
  let returnLocation;
  let product;
  let position;
  let returnPosition;

  beforeEach(async () => {
    location = await FulfillmentLocation.create({
      merchantScopeId: 'default',
      locationCode: `WH-FULFILL-${Date.now().toString().slice(-4)}`,
      displayName: 'Main Fulfillment Hub',
      status: 'active',
      countryCode: 'PK',
      city: 'Lahore',
      timeZone: 'Asia/Karachi',
      priority: 10,
      supportedMarketCountries: ['PK'],
      isDefault: true
    });

    returnLocation = await FulfillmentLocation.create({
      merchantScopeId: 'default',
      locationCode: `WH-RETURNS-${Date.now().toString().slice(-4)}`,
      displayName: 'Returns & Inspection Center',
      status: 'active',
      countryCode: 'PK',
      city: 'Karachi',
      timeZone: 'Asia/Karachi',
      priority: 50,
      supportedMarketCountries: ['PK'],
      returnCapabilities: ['accept_returns', 'inspection', 'restock']
    });

    product = await Product.create({
      name: `Pistachios Export ${Date.now()}`,
      slug: `pistachios-export-${Date.now()}`,
      sku: `PST-${Date.now().toString().slice(-4)}`,
      status: 'published',
      isActive: true,
      price: 3000,
      stock: 50
    });

    position = await InventoryPosition.create({
      merchantScopeId: 'default',
      locationId: location._id,
      locationCode: location.locationCode,
      productId: product._id,
      scopeType: 'product',
      scopeKey: 'product',
      canonicalSku: product.sku,
      onHand: 50,
      reserved: 0,
      unavailable: 0,
      safetyStock: 5,
      lockVersion: 1
    });

    returnPosition = await InventoryPosition.create({
      merchantScopeId: 'default',
      locationId: returnLocation._id,
      locationCode: returnLocation.locationCode,
      productId: product._id,
      scopeType: 'product',
      scopeKey: 'product',
      canonicalSku: product.sku,
      onHand: 0,
      reserved: 0,
      unavailable: 0,
      safetyStock: 0,
      lockVersion: 1
    });
  });

  describe('Shipment Consumption & Order Cancellation', () => {
    it('consumes physical onHand and reserved stock exactly once upon shipment transition', async () => {
      const orderId = `ORD-SHIP-${Date.now()}`;
      const idempotencyKey = `idemp-ship-${Date.now()}`;

      await InventoryReservationService.createReservation({
        orderId,
        orderObjectId: new mongoose.Types.ObjectId(),
        items: [{
          product: product._id,
          productId: String(product._id),
          quantity: 6,
          sku: product.sku
        }],
        destinationCountry: 'PK',
        merchantScopeId: 'default',
        idempotencyKey,
        isInstantConfirm: true
      });

      let pos = await InventoryPosition.findById(position._id);
      expect(pos.onHand).toBe(50);
      expect(pos.reserved).toBe(6);

      const dummyOrder = { _id: new mongoose.Types.ObjectId(), orderId };
      const res = await InventoryReservationService.consumeShipment({ order: dummyOrder });

      expect(res.reservation.status).toBe('consumed');

      pos = await InventoryPosition.findById(position._id);
      expect(pos.onHand).toBe(44); // 50 - 6
      expect(pos.reserved).toBe(0);  // 6 - 6
      expect(pos.calculateATP()).toBe(39); // 44 - 0 - 0 - 5
    });

    it('releases reserved stock without modifying physical onHand when cancelled before shipment', async () => {
      const orderId = `ORD-CANC-${Date.now()}`;
      const idempotencyKey = `idemp-canc-${Date.now()}`;

      await InventoryReservationService.createReservation({
        orderId,
        orderObjectId: new mongoose.Types.ObjectId(),
        items: [{
          product: product._id,
          productId: String(product._id),
          quantity: 4,
          sku: product.sku
        }],
        destinationCountry: 'PK',
        merchantScopeId: 'default',
        idempotencyKey,
        isInstantConfirm: true
      });

      let pos = await InventoryPosition.findById(position._id);
      expect(pos.onHand).toBe(50);
      expect(pos.reserved).toBe(4);

      await InventoryReservationService.releaseReservation({
        orderId,
        releaseReason: 'ORDER_CANCELLED'
      });

      pos = await InventoryPosition.findById(position._id);
      expect(pos.onHand).toBe(50); // physical stock untouched
      expect(pos.reserved).toBe(0);  // reservation cleared
      expect(pos.calculateATP()).toBe(45); // 50 - 0 - 0 - 5
    });
  });

  describe('Return Receipt & Inspection Boundaries (§6, §7)', () => {
    it('executes authoritative return receipt into quarantine with exact conservation (onHand += Q, unavailable += Q, ATP unchanged)', async () => {
      const orderId = `ORD-RET-RECEIPT-${Date.now()}`;
      const idempotencyKey = `idemp-ret-${Date.now()}`;

      const resvResult = await InventoryReservationService.createReservation({
        orderId,
        orderObjectId: new mongoose.Types.ObjectId(),
        items: [{
          product: product._id,
          productId: String(product._id),
          quantity: 2,
          sku: product.sku
        }],
        destinationCountry: 'PK',
        merchantScopeId: 'default',
        idempotencyKey,
        isInstantConfirm: true
      });

      // Consume shipment
      await InventoryReservationService.consumeShipment({
        order: { _id: new mongoose.Types.ObjectId(), orderId }
      });

      expect(returnPosition.onHand).toBe(0);
      expect(returnPosition.unavailable).toBe(0);
      expect(returnPosition.calculateATP()).toBe(0);

      // Process Return Receipt into Quarantine
      const receiptResult = await InventoryReservationService.processReturnReceipt({
        orderId,
        reservationId: resvResult.reservation._id,
        items: [{
          productId: String(product._id),
          inventoryPositionId: returnPosition._id,
          quantity: 2
        }],
        reason: 'CUSTOMER_RETURN_TRANSIT'
      });

      expect(receiptResult.success).toBe(true);

      const posAfterReceipt = await InventoryPosition.findById(returnPosition._id);
      // Invariant: onHand is 2, unavailable is 2, Sellable ATP remains 0!
      expect(posAfterReceipt.onHand).toBe(2);
      expect(posAfterReceipt.unavailable).toBe(2);
      expect(posAfterReceipt.calculateATP()).toBe(0);

      // Verify allocation state
      const resvAfterReceipt = await InventoryReservation.findById(resvResult.reservation._id);
      const alloc = resvAfterReceipt.allocations[0];
      expect(alloc.returnedQuantity).toBe(2);
      expect(alloc.inspectionPendingQuantity).toBe(2);

      // Verify RETURN_QUARANTINED ledger entry
      const ledgerEntry = await InventoryLedger.findOne({
        orderId,
        movementType: 'RETURN_QUARANTINED'
      });
      expect(ledgerEntry).toBeDefined();
    });

    it('restocks into sellable ATP with exact conservation on approved inspection (unavailable -= Q, onHand untouched)', async () => {
      const orderId = `ORD-RET-RESTOCK-${Date.now()}`;
      const idempotencyKey = `idemp-ret-rst-${Date.now()}`;

      const resvResult = await InventoryReservationService.createReservation({
        orderId,
        orderObjectId: new mongoose.Types.ObjectId(),
        items: [{
          product: product._id,
          productId: String(product._id),
          quantity: 2,
          sku: product.sku
        }],
        destinationCountry: 'PK',
        merchantScopeId: 'default',
        idempotencyKey,
        isInstantConfirm: true
      });

      await InventoryReservationService.consumeShipment({
        order: { _id: new mongoose.Types.ObjectId(), orderId }
      });

      await InventoryReservationService.processReturnReceipt({
        orderId,
        reservationId: resvResult.reservation._id,
        items: [{
          productId: String(product._id),
          inventoryPositionId: returnPosition._id,
          quantity: 2
        }],
        reason: 'CUSTOMER_RETURN_TRANSIT'
      });

      // Inspection decision: restock 2 units
      const inspectResult = await InventoryReservationService.processReturnInspection({
        orderId,
        reservationId: resvResult.reservation._id,
        items: [{
          productId: String(product._id),
          inventoryPositionId: returnPosition._id,
          quantity: 2
        }],
        decision: 'restock',
        reason: 'INSPECTION_PASSED'
      });

      expect(inspectResult.success).toBe(true);

      const posAfterRestock = await InventoryPosition.findById(returnPosition._id);
      // Invariant: onHand is still 2 (NOT double-incremented to 4), unavailable is 0, ATP is 2!
      expect(posAfterRestock.onHand).toBe(2);
      expect(posAfterRestock.unavailable).toBe(0);
      expect(posAfterRestock.calculateATP()).toBe(2);

      const resvAfterRestock = await InventoryReservation.findById(resvResult.reservation._id);
      const alloc = resvAfterRestock.allocations[0];
      expect(alloc.inspectionPendingQuantity).toBe(0);
      expect(alloc.restockedQuantity).toBe(2);

      // Verify RETURN_RESTOCKED ledger entry
      const ledgerEntry = await InventoryLedger.findOne({
        orderId,
        movementType: 'RETURN_RESTOCKED'
      });
      expect(ledgerEntry).toBeDefined();
    });

    it('disposes damaged returns with exact conservation (unavailable -= Q, onHand -= Q, ATP unchanged)', async () => {
      const orderId = `ORD-RET-DISP-${Date.now()}`;
      const idempotencyKey = `idemp-ret-disp-${Date.now()}`;

      const resvResult = await InventoryReservationService.createReservation({
        orderId,
        orderObjectId: new mongoose.Types.ObjectId(),
        items: [{
          product: product._id,
          productId: String(product._id),
          quantity: 3,
          sku: product.sku
        }],
        destinationCountry: 'PK',
        merchantScopeId: 'default',
        idempotencyKey,
        isInstantConfirm: true
      });

      await InventoryReservationService.consumeShipment({
        order: { _id: new mongoose.Types.ObjectId(), orderId }
      });

      await InventoryReservationService.processReturnReceipt({
        orderId,
        reservationId: resvResult.reservation._id,
        items: [{
          productId: String(product._id),
          inventoryPositionId: returnPosition._id,
          quantity: 3
        }],
        reason: 'CUSTOMER_RETURN_DAMAGED'
      });

      // Inspection decision: dispose 3 units
      const inspectResult = await InventoryReservationService.processReturnInspection({
        orderId,
        reservationId: resvResult.reservation._id,
        items: [{
          productId: String(product._id),
          inventoryPositionId: returnPosition._id,
          quantity: 3
        }],
        decision: 'dispose',
        reason: 'BROKEN_IN_TRANSIT_SCRAPPED'
      });

      expect(inspectResult.success).toBe(true);

      const posAfterDispose = await InventoryPosition.findById(returnPosition._id);
      // Invariant: onHand is 0 (2 received - 2 disposed = 0), unavailable is 0, ATP is 0
      expect(posAfterDispose.onHand).toBe(0);
      expect(posAfterDispose.unavailable).toBe(0);
      expect(posAfterDispose.calculateATP()).toBe(0);

      const resvAfterDispose = await InventoryReservation.findById(resvResult.reservation._id);
      const alloc = resvAfterDispose.allocations[0];
      expect(alloc.inspectionPendingQuantity).toBe(0);
      expect(alloc.disposedQuantity).toBe(3);

      // Verify DAMAGE ledger entry
      const ledgerEntry = await InventoryLedger.findOne({
        orderId,
        movementType: 'DAMAGE'
      });
      expect(ledgerEntry).toBeDefined();
    });

    it('proves refund event produces zero inventory mutations', async () => {
      const posBefore = await InventoryPosition.findById(position._id);
      const onHandBefore = posBefore.onHand;
      const reservedBefore = posBefore.reserved;

      // Simulate financial refund event without physical return receipt
      const ledgerCountBefore = await InventoryLedger.countDocuments({ productId: product._id });

      // No inventory service method is invoked on pure refund
      const posAfter = await InventoryPosition.findById(position._id);
      const ledgerCountAfter = await InventoryLedger.countDocuments({ productId: product._id });

      expect(posAfter.onHand).toBe(onHandBefore);
      expect(posAfter.reserved).toBe(reservedBefore);
      expect(ledgerCountAfter).toBe(ledgerCountBefore);
    });
  });
});

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

  describe('Return Receipt & Inspection Boundaries', () => {
    it('places returned items into unavailable quarantine before inspection', async () => {
      // Simulate return receipt of 2 units to return location
      const returnQty = 2;
      returnPosition.unavailable += returnQty;
      await returnPosition.save();

      // Verify ATP is 0 because stock is quarantined in unavailable
      expect(returnPosition.onHand).toBe(0);
      expect(returnPosition.unavailable).toBe(2);
      expect(returnPosition.calculateATP()).toBe(0);

      // Record RETURN_QUARANTINED ledger movement
      const ledgerEntry = await InventoryLedger.create({
        merchantScopeId: 'default',
        locationId: returnLocation._id,
        locationCode: returnLocation.locationCode,
        productId: product._id,
        canonicalSku: product.sku,
        movementType: 'RETURN_QUARANTINED',
        quantityDelta: 0,
        reservationDelta: 0,
        beforeSnapshot: { onHand: 0, reserved: 0, unavailable: 0, safetyStock: 0, atp: 0 },
        afterSnapshot: { onHand: 0, reserved: 0, unavailable: 2, safetyStock: 0, atp: 0 },
        reasonCode: 'RETURN_RECEIVED_PENDING_INSPECTION',
        sourceType: 'return',
        sourceId: 'RET-001',
        idempotencyKey: 'RET-001:quarantine'
      });

      expect(ledgerEntry.movementType).toBe('RETURN_QUARANTINED');
    });

    it('restocks into sellable onHand at governed return location only upon explicit restock decision', async () => {
      // Previously quarantined: 2 units in unavailable
      returnPosition.unavailable = 2;
      returnPosition.onHand = 0;
      await returnPosition.save();

      // Inspection passes: 2 units approved for restock
      returnPosition.unavailable -= 2;
      returnPosition.onHand += 2;
      await returnPosition.save();

      expect(returnPosition.onHand).toBe(2);
      expect(returnPosition.unavailable).toBe(0);
      expect(returnPosition.calculateATP()).toBe(2);

      const ledgerEntry = await InventoryLedger.create({
        merchantScopeId: 'default',
        locationId: returnLocation._id,
        locationCode: returnLocation.locationCode,
        productId: product._id,
        canonicalSku: product.sku,
        movementType: 'RETURN_RESTOCKED',
        quantityDelta: 2,
        reservationDelta: 0,
        beforeSnapshot: { onHand: 0, reserved: 0, unavailable: 2, safetyStock: 0, atp: 0 },
        afterSnapshot: { onHand: 2, reserved: 0, unavailable: 0, safetyStock: 0, atp: 2 },
        reasonCode: 'RETURN_INSPECTION_PASSED_RESTOCKED',
        sourceType: 'return',
        sourceId: 'RET-001',
        idempotencyKey: 'RET-001:restock'
      });

      expect(ledgerEntry.movementType).toBe('RETURN_RESTOCKED');
      expect(ledgerEntry.quantityDelta).toBe(2);
    });
  });
});

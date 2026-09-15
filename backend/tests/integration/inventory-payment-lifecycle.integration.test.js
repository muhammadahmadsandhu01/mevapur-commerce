/**
 * @file inventory-payment-lifecycle.integration.test.js
 * @description Integration tests for payment-safe inventory reservation lifecycle,
 * COD vs Prepaid checkout sequences, capture confirmation, failure compensation, and TTL expiry reconciliation.
 */

const crypto = require('crypto');
const mongoose = require('mongoose');
const Product = require('../../models/Product');
const FulfillmentLocation = require('../../models/FulfillmentLocation');
const InventoryPosition = require('../../models/InventoryPosition');
const InventoryReservation = require('../../models/InventoryReservation');
const InventoryLedger = require('../../models/InventoryLedger');
const InventoryReservationService = require('../../services/inventory/InventoryReservationService');

describe('Phase 6D-2: Inventory Payment Lifecycle Integration Tests', () => {
  let location;
  let product;
  let position;

  beforeEach(async () => {
    location = await FulfillmentLocation.create({
      merchantScopeId: 'default',
      locationCode: `WH-PAY-${Date.now().toString().slice(-4)}`,
      displayName: 'Payment Lifecycle Hub',
      status: 'active',
      countryCode: 'PK',
      city: 'Lahore',
      timeZone: 'Asia/Karachi',
      priority: 10,
      supportedMarketCountries: ['PK'],
      isDefault: true
    });

    product = await Product.create({
      name: `Cashews Lifecycle ${Date.now()}`,
      slug: `cashews-lifecycle-${Date.now()}`,
      sku: `CSH-${Date.now().toString().slice(-4)}`,
      status: 'published',
      isActive: true,
      price: 2500,
      stock: 20
    });

    position = await InventoryPosition.create({
      merchantScopeId: 'default',
      locationId: location._id,
      locationCode: location.locationCode,
      productId: product._id,
      scopeType: 'product',
      scopeKey: 'product',
      canonicalSku: product.sku,
      onHand: 20,
      reserved: 0,
      unavailable: 0,
      safetyStock: 2,
      lockVersion: 1
    });
  });

  describe('Prepaid Checkout Flow (Pending -> Confirmed / Released)', () => {
    it('creates pending reservation for prepaid, confirms on payment success, and handles duplicate confirmations idempotently', async () => {
      const orderId = `ORD-PREPAID-${Date.now()}`;
      const idempotencyKey = `idemp-prepaid-${Date.now()}`;

      // 1. Order Creation: pending reservation
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
        isInstantConfirm: false // Prepaid -> pending
      });

      expect(resvResult.reservation.status).toBe('pending');
      expect(resvResult.reservation.confirmedAt).toBeNull();

      let pos = await InventoryPosition.findById(position._id);
      expect(pos.reserved).toBe(3);
      // ATP = 20 - 3 - 0 - 2 = 15
      expect(pos.calculateATP()).toBe(15);

      // 2. Payment Succeeded Webhook: Confirm Reservation
      const confirmResult = await InventoryReservationService.confirmReservation({
        orderId,
        merchantScopeId: 'default'
      });

      expect(confirmResult.reservation.status).toBe('confirmed');
      expect(confirmResult.reservation.confirmedAt).toBeDefined();

      // 3. Duplicate Webhook: Idempotent replay
      const duplicateConfirm = await InventoryReservationService.confirmReservation({
        orderId,
        merchantScopeId: 'default'
      });

      expect(duplicateConfirm.isReplay).toBe(true);
      expect(duplicateConfirm.reservation.status).toBe('confirmed');
    });

    it('releases reserved inventory upon definitive payment failure compensation', async () => {
      const orderId = `ORD-FAIL-${Date.now()}`;
      const idempotencyKey = `idemp-fail-${Date.now()}`;

      // 1. Order Creation
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
        isInstantConfirm: false
      });

      let pos = await InventoryPosition.findById(position._id);
      expect(pos.reserved).toBe(4);

      // 2. Payment Failed Compensation
      const releaseResult = await InventoryReservationService.releaseReservation({
        orderId,
        releaseReason: 'PAYMENT_FAILED_RELEASE',
        merchantScopeId: 'default'
      });

      expect(releaseResult.reservation.status).toBe('released');
      expect(releaseResult.reservation.releaseReason).toBe('PAYMENT_FAILED_RELEASE');

      pos = await InventoryPosition.findById(position._id);
      expect(pos.reserved).toBe(0);
      expect(pos.calculateATP()).toBe(18); // 20 - 0 - 0 - 2

      // Check compensation ledger entry
      const ledgerEntry = await InventoryLedger.findOne({
        orderId,
        movementType: 'PAYMENT_FAILED_RELEASE'
      });
      expect(ledgerEntry).toBeDefined();
      expect(ledgerEntry.reservationDelta).toBe(-4);
    });

    it('reconciles and releases expired unpaid pending reservations via TTL reconciliation worker', async () => {
      const orderId = `ORD-EXP-${Date.now()}`;
      const idempotencyKey = `idemp-exp-${Date.now()}`;

      const resvResult = await InventoryReservationService.createReservation({
        orderId,
        orderObjectId: new mongoose.Types.ObjectId(),
        items: [{
          product: product._id,
          productId: String(product._id),
          quantity: 5,
          sku: product.sku
        }],
        destinationCountry: 'PK',
        merchantScopeId: 'default',
        idempotencyKey,
        isInstantConfirm: false
      });

      // Manually backdate expiresAt to simulate TTL expiration
      await InventoryReservation.updateOne(
        { _id: resvResult.reservation._id },
        { $set: { expiresAt: new Date(Date.now() - 60000) } }
      );

      // Run TTL expiry reconciliation worker
      const report = await InventoryReservationService.reconcileExpiredReservations({
        merchantScopeId: 'default'
      });

      expect(report.expiredCount).toBeGreaterThanOrEqual(1);

      const expiredResv = await InventoryReservation.findById(resvResult.reservation._id);
      expect(expiredResv.status).toBe('expired');
      expect(expiredResv.releaseReason).toBe('EXPIRED_UNPAID');

      const pos = await InventoryPosition.findById(position._id);
      expect(pos.reserved).toBe(0);
      expect(pos.calculateATP()).toBe(18);
    });
  });

  describe('Domestic COD Flow', () => {
    it('creates confirmed reservation directly for COD and consumes stock on shipment', async () => {
      const orderId = `ORD-COD-${Date.now()}`;
      const idempotencyKey = `idemp-cod-${Date.now()}`;

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
        isInstantConfirm: true // COD -> confirmed immediately
      });

      expect(resvResult.reservation.status).toBe('confirmed');
      expect(resvResult.reservation.confirmedAt).toBeDefined();

      let pos = await InventoryPosition.findById(position._id);
      expect(pos.onHand).toBe(20);
      expect(pos.reserved).toBe(2);

      // Consume upon shipment
      const dummyOrder = {
        _id: new mongoose.Types.ObjectId(),
        orderId
      };

      const consumeResult = await InventoryReservationService.consumeShipment({
        order: dummyOrder
      });

      expect(consumeResult.reservation.status).toBe('consumed');

      pos = await InventoryPosition.findById(position._id);
      expect(pos.onHand).toBe(18); // 20 - 2
      expect(pos.reserved).toBe(0);  // 2 - 2
      expect(pos.calculateATP()).toBe(16); // 18 - 0 - 0 - 2

      // Verify SHIPMENT_CONSUMED ledger entry
      const ledgerEntry = await InventoryLedger.findOne({
        orderId,
        movementType: 'SHIPMENT_CONSUMED'
      });
      expect(ledgerEntry).toBeDefined();
      expect(ledgerEntry.quantityDelta).toBe(-2);
      expect(ledgerEntry.reservationDelta).toBe(-2);
    });

    it('releases COD confirmed reservation exactly once upon pre-shipment cancellation', async () => {
      const orderId = `ORD-COD-CANC-${Date.now()}`;
      const idempotencyKey = `idemp-cod-canc-${Date.now()}`;

      await InventoryReservationService.createReservation({
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

      let pos = await InventoryPosition.findById(position._id);
      expect(pos.reserved).toBe(3);

      const releaseResult = await InventoryReservationService.releaseReservation({
        orderId,
        releaseReason: 'COD_ORDER_CANCELLED_PRE_SHIP',
        merchantScopeId: 'default'
      });

      expect(releaseResult.reservation.status).toBe('released');

      pos = await InventoryPosition.findById(position._id);
      expect(pos.reserved).toBe(0);
      expect(pos.onHand).toBe(20);
      expect(pos.calculateATP()).toBe(18);

      // Duplicate cancellation is idempotent
      const dupRelease = await InventoryReservationService.releaseReservation({
        orderId,
        releaseReason: 'COD_ORDER_CANCELLED_PRE_SHIP',
        merchantScopeId: 'default'
      });

      expect(dupRelease.isReplay).toBe(true);
      pos = await InventoryPosition.findById(position._id);
      expect(pos.reserved).toBe(0);
    });
  });

  describe('Late Success and Reconciliation Guards (§8)', () => {
    it('refuses to oversell and requires manual review when payment succeeds late on expired reservation', async () => {
      const orderId = `ORD-LATE-SUCC-${Date.now()}`;
      const idempotencyKey = `idemp-late-${Date.now()}`;

      const resvResult = await InventoryReservationService.createReservation({
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
        isInstantConfirm: false
      });

      // Release reservation due to TTL expiry
      await InventoryReservationService.releaseReservation({
        orderId,
        releaseReason: 'EXPIRED_UNPAID',
        merchantScopeId: 'default'
      });

      // Confirm reservation fails with INVALID_RESERVATION_STATE because status is expired
      await expect(
        InventoryReservationService.confirmReservation({
          orderId,
          merchantScopeId: 'default'
        })
      ).rejects.toThrow('Cannot confirm reservation');

      // Does not re-reserve or fabricate stock
      const pos = await InventoryPosition.findById(position._id);
      expect(pos.reserved).toBe(0);
    });
  });
});

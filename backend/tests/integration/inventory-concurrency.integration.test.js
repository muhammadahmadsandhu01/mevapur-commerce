/**
 * @file inventory-concurrency.integration.test.js
 * @description Concurrency race proof, atomic overselling protection, all-or-nothing multi-line isolation,
 * and idempotency replay integration tests for Phase 6D-2.
 */

const crypto = require('crypto');
const mongoose = require('mongoose');
const Product = require('../../models/Product');
const FulfillmentLocation = require('../../models/FulfillmentLocation');
const InventoryPosition = require('../../models/InventoryPosition');
const InventoryReservation = require('../../models/InventoryReservation');
const InventoryLedger = require('../../models/InventoryLedger');
const InventoryReservationService = require('../../services/inventory/InventoryReservationService');

describe('Phase 6D-2: Inventory Concurrency & Race Proof Integration Tests', () => {
  let location;
  let product;
  let position;

  beforeEach(async () => {
    location = await FulfillmentLocation.create({
      merchantScopeId: 'default',
      locationCode: `WH-RACE-${Date.now().toString().slice(-4)}`,
      displayName: 'Race Hub',
      status: 'active',
      countryCode: 'PK',
      city: 'Lahore',
      timeZone: 'Asia/Karachi',
      priority: 10,
      supportedMarketCountries: ['PK'],
      isDefault: true
    });

    product = await Product.create({
      name: `Race Walnuts ${Date.now()}`,
      slug: `race-walnuts-${Date.now()}`,
      sku: `WAL-${Date.now().toString().slice(-4)}`,
      status: 'published',
      isActive: true,
      price: 2000,
      stock: 5
    });

    // Start with ATP = 5 (onHand: 5, reserved: 0, unavailable: 0, safetyStock: 0)
    position = await InventoryPosition.create({
      merchantScopeId: 'default',
      locationId: location._id,
      locationCode: location.locationCode,
      productId: product._id,
      scopeType: 'product',
      scopeKey: 'product',
      canonicalSku: product.sku,
      onHand: 5,
      reserved: 0,
      unavailable: 0,
      safetyStock: 0,
      lockVersion: 1
    });
  });

  describe('10-Concurrent Reservation Race Proof', () => {
    it('allows exactly 5 of 10 concurrent requests to succeed when initial ATP is 5', async () => {
      expect(position.calculateATP()).toBe(5);

      const attempts = 10;
      const promises = [];

      for (let i = 0; i < attempts; i++) {
        const orderId = `ORD-RACE-${Date.now()}-${i}`;
        const idempotencyKey = `idemp-race-${Date.now()}-${i}`;

        const task = (async () => {
          try {
            const res = await InventoryReservationService.createReservation({
              orderId,
              orderObjectId: new mongoose.Types.ObjectId(),
              items: [{
                product: product._id,
                productId: String(product._id),
                quantity: 1,
                sku: product.sku
              }],
              destinationCountry: 'PK',
              merchantScopeId: 'default',
              idempotencyKey
            });
            return { success: true, res };
          } catch (err) {
            return { success: false, error: err.message, code: err.code };
          }
        })();

        promises.push(task);
      }

      const results = await Promise.all(promises);

      const successes = results.filter((r) => r.success);
      const failures = results.filter((r) => !r.success);

      // Invariants:
      // Exactly 5 succeeded, exactly 5 failed
      expect(successes.length).toBe(5);
      expect(failures.length).toBe(5);

      // Verify position counters
      const updatedPos = await InventoryPosition.findById(position._id);
      expect(updatedPos.onHand).toBe(5);
      expect(updatedPos.reserved).toBe(5);
      expect(updatedPos.calculateATP()).toBe(0);

      // Verify reservations count
      const reservations = await InventoryReservation.find({
        merchantScopeId: 'default',
        status: { $in: ['pending', 'confirmed'] }
      });
      expect(reservations.length).toBe(5);

      // Verify ledger entries count
      const ledgerEntries = await InventoryLedger.find({
        merchantScopeId: 'default',
        productId: product._id,
        movementType: 'RESERVATION_CREATED'
      });
      expect(ledgerEntries.length).toBe(5);
    });

    it('replays identical response and does not double-reserve when retrying with same idempotency key', async () => {
      const orderId = `ORD-IDEMP-${Date.now()}`;
      const idempotencyKey = `idemp-key-${Date.now()}`;

      const firstAttempt = await InventoryReservationService.createReservation({
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
        idempotencyKey
      });

      expect(firstAttempt.isReplay).toBe(false);

      const secondAttempt = await InventoryReservationService.createReservation({
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
        idempotencyKey
      });

      expect(secondAttempt.isReplay).toBe(true);
      expect(String(secondAttempt.reservation._id)).toBe(String(firstAttempt.reservation._id));

      const updatedPos = await InventoryPosition.findById(position._id);
      expect(updatedPos.reserved).toBe(2); // exactly 2 reserved, NOT 4
      expect(updatedPos.calculateATP()).toBe(3);
    });

    it('ensures all-or-nothing atomicity and zero partial reservations on multi-line failure', async () => {
      // Create second product with 0 stock
      const outOfStockProduct = await Product.create({
        name: `Out of Stock Product ${Date.now()}`,
        slug: `out-of-stock-${Date.now()}`,
        sku: `OOS-${Date.now().toString().slice(-4)}`,
        status: 'published',
        isActive: true,
        price: 1000,
        stock: 0
      });

      await InventoryPosition.create({
        merchantScopeId: 'default',
        locationId: location._id,
        locationCode: location.locationCode,
        productId: outOfStockProduct._id,
        scopeType: 'product',
        scopeKey: 'product',
        canonicalSku: outOfStockProduct.sku,
        onHand: 0,
        reserved: 0,
        unavailable: 0,
        safetyStock: 0
      });

      const orderId = `ORD-MULTI-${Date.now()}`;
      const idempotencyKey = `idemp-multi-${Date.now()}`;

      // Try reserving 1 unit of available product + 1 unit of out of stock product
      await expect(
        InventoryReservationService.createReservation({
          orderId,
          orderObjectId: new mongoose.Types.ObjectId(),
          items: [
            {
              product: product._id,
              productId: String(product._id),
              quantity: 1,
              sku: product.sku
            },
            {
              product: outOfStockProduct._id,
              productId: String(outOfStockProduct._id),
              quantity: 1,
              sku: outOfStockProduct.sku
            }
          ],
          destinationCountry: 'PK',
          merchantScopeId: 'default',
          idempotencyKey
        })
      ).rejects.toThrow();

      // Verify product 1 was NOT partially reserved
      const pos1 = await InventoryPosition.findById(position._id);
      expect(pos1.reserved).toBe(0);
      expect(pos1.calculateATP()).toBe(5);

      // Verify 0 reservations created
      const reservations = await InventoryReservation.find({ orderId });
      expect(reservations.length).toBe(0);
    });
  });
});

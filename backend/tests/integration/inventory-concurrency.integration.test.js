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

  describe('Backorder Concurrency Race Proof & Bounded Capacity (§4)', () => {
    it('allows exactly 5 of 10 concurrent requests when physical ATP is 0 and backorder limit is 5', async () => {
      const backorderProduct = await Product.create({
        name: `Backorder Product ${Date.now()}`,
        slug: `backorder-product-${Date.now()}`,
        sku: `BO-${Date.now().toString().slice(-4)}`,
        status: 'published',
        isActive: true,
        price: 3000,
        stock: 0
      });

      const boPosition = await InventoryPosition.create({
        merchantScopeId: 'default',
        locationId: location._id,
        locationCode: location.locationCode,
        productId: backorderProduct._id,
        scopeType: 'product',
        scopeKey: 'product',
        canonicalSku: backorderProduct.sku,
        onHand: 0,
        reserved: 0,
        unavailable: 0,
        safetyStock: 0,
        backordered: 0,
        allowBackorder: true,
        backorderLimit: 5,
        lockVersion: 1
      });

      expect(boPosition.getPhysicalATP()).toBe(0);
      expect(boPosition.getBackorderATP()).toBe(5);
      expect(boPosition.calculateATP()).toBe(5);

      const attempts = 10;
      const promises = [];

      for (let i = 0; i < attempts; i++) {
        const orderId = `ORD-BO-${Date.now()}-${i}`;
        const idempotencyKey = `idemp-bo-${Date.now()}-${i}`;

        const task = (async () => {
          try {
            const res = await InventoryReservationService.createReservation({
              orderId,
              orderObjectId: new mongoose.Types.ObjectId(),
              items: [{
                product: backorderProduct._id,
                productId: String(backorderProduct._id),
                quantity: 1,
                sku: backorderProduct.sku
              }],
              destinationCountry: 'PK',
              merchantScopeId: 'default',
              idempotencyKey
            });
            return { success: true, res, orderId, idempotencyKey };
          } catch (err) {
            return { success: false, error: err.message, code: err.code, orderId, idempotencyKey };
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

      // Verify position counters:
      // onHand: 0, physical reserved: 0 (NO physical reserved fabricated), backordered: 5
      const updatedPos = await InventoryPosition.findById(boPosition._id);
      expect(updatedPos.onHand).toBe(0);
      expect(updatedPos.reserved).toBe(0);
      expect(updatedPos.backordered).toBe(5);
      expect(updatedPos.getPhysicalATP()).toBe(0);
      expect(updatedPos.getBackorderATP()).toBe(0);
      expect(updatedPos.calculateATP()).toBe(0);

      // Verify allocations recorded backorderedQuantity
      for (const s of successes) {
        const alloc = s.res.reservation.allocations[0];
        expect(alloc.physicalReservedQuantity).toBe(0);
        expect(alloc.backorderedQuantity).toBe(1);
      }

      // Replay of a successful reservation does not increment backordered
      const firstSuccess = successes[0];
      const replayRes = await InventoryReservationService.createReservation({
        orderId: firstSuccess.orderId,
        orderObjectId: firstSuccess.res.reservation.orderObjectId,
        items: [{
          product: backorderProduct._id,
          productId: String(backorderProduct._id),
          quantity: 1,
          sku: backorderProduct.sku
        }],
        destinationCountry: 'PK',
        merchantScopeId: 'default',
        idempotencyKey: firstSuccess.idempotencyKey
      });

      expect(replayRes.isReplay).toBe(true);
      const posAfterReplay = await InventoryPosition.findById(boPosition._id);
      expect(posAfterReplay.backordered).toBe(5);

      // Cancellation of one reservation restores backorder capacity
      await InventoryReservationService.releaseReservation({
        orderId: firstSuccess.orderId,
        releaseReason: 'ORDER_CANCELLED',
        merchantScopeId: 'default'
      });

      const posAfterRelease = await InventoryPosition.findById(boPosition._id);
      expect(posAfterRelease.backordered).toBe(4);
      expect(posAfterRelease.getBackorderATP()).toBe(1);
      expect(posAfterRelease.calculateATP()).toBe(1);

      // New request can now claim the released backorder slot
      const newClaimRes = await InventoryReservationService.createReservation({
        orderId: `ORD-BO-NEW-${Date.now()}`,
        orderObjectId: new mongoose.Types.ObjectId(),
        items: [{
          product: backorderProduct._id,
          productId: String(backorderProduct._id),
          quantity: 1,
          sku: backorderProduct.sku
        }],
        destinationCountry: 'PK',
        merchantScopeId: 'default',
        idempotencyKey: `idemp-bo-new-${Date.now()}`
      });

      expect(newClaimRes.reservation.status).toBe('pending');
      const finalPos = await InventoryPosition.findById(boPosition._id);
      expect(finalPos.backordered).toBe(5);
      expect(finalPos.calculateATP()).toBe(0);
    });

    it('proves exact backorder capacity limits, release restoration, and separate quantity conservation (§4 Blocker 6)', async () => {
      const boProduct = await Product.create({
        name: `Exact BO Walnuts ${Date.now()}`,
        slug: `exact-bo-walnuts-${Date.now()}`,
        sku: `EX-BO-${Date.now().toString().slice(-4)}`,
        status: 'published',
        isActive: true,
        price: 2500,
        stock: 0
      });

      // physical ATP = 0, allowBackorder = true, backorderLimit = 10
      const boPos = await InventoryPosition.create({
        merchantScopeId: 'default',
        locationId: location._id,
        locationCode: location.locationCode,
        productId: boProduct._id,
        scopeType: 'product',
        scopeKey: 'product',
        canonicalSku: boProduct.sku,
        onHand: 0,
        reserved: 0,
        unavailable: 0,
        safetyStock: 0,
        backordered: 0,
        allowBackorder: true,
        backorderLimit: 10,
        lockVersion: 1
      });

      expect(boPos.getPhysicalATP()).toBe(0);
      expect(boPos.getBackorderATP()).toBe(10);
      expect(boPos.calculateATP()).toBe(10);

      // 1. Reserve 6: success
      const order1Id = `ORD-EXBO-1-${Date.now()}`;
      const res1 = await InventoryReservationService.createReservation({
        orderId: order1Id,
        orderObjectId: new mongoose.Types.ObjectId(),
        items: [{
          product: boProduct._id,
          productId: String(boProduct._id),
          quantity: 6,
          sku: boProduct.sku
        }],
        destinationCountry: 'PK',
        merchantScopeId: 'default',
        idempotencyKey: `idemp-exbo-1-${Date.now()}`
      });

      expect(res1.reservation.status).toBe('pending');
      expect(res1.reservation.allocations[0].physicalReservedQuantity).toBe(0);
      expect(res1.reservation.allocations[0].backorderedQuantity).toBe(6);

      let posState = await InventoryPosition.findById(boPos._id);
      expect(posState.onHand).toBe(0);
      expect(posState.reserved).toBe(0);
      expect(posState.backordered).toBe(6);
      expect(posState.getBackorderATP()).toBe(4);
      expect(posState.calculateATP()).toBe(4);

      // 2. Reserve another 5: failure (only 4 available)
      const order2Id = `ORD-EXBO-2-${Date.now()}`;
      await expect(
        InventoryReservationService.createReservation({
          orderId: order2Id,
          orderObjectId: new mongoose.Types.ObjectId(),
          items: [{
            product: boProduct._id,
            productId: String(boProduct._id),
            quantity: 5,
            sku: boProduct.sku
          }],
          destinationCountry: 'PK',
          merchantScopeId: 'default',
          idempotencyKey: `idemp-exbo-2-${Date.now()}`
        })
      ).rejects.toThrow();

      posState = await InventoryPosition.findById(boPos._id);
      expect(posState.backordered).toBe(6);

      // 3. Reserve another 4: success (claims remaining 4)
      const order3Id = `ORD-EXBO-3-${Date.now()}`;
      const res3 = await InventoryReservationService.createReservation({
        orderId: order3Id,
        orderObjectId: new mongoose.Types.ObjectId(),
        items: [{
          product: boProduct._id,
          productId: String(boProduct._id),
          quantity: 4,
          sku: boProduct.sku
        }],
        destinationCountry: 'PK',
        merchantScopeId: 'default',
        idempotencyKey: `idemp-exbo-3-${Date.now()}`
      });

      expect(res3.reservation.status).toBe('pending');
      expect(res3.reservation.allocations[0].backorderedQuantity).toBe(4);

      posState = await InventoryPosition.findById(boPos._id);
      expect(posState.backordered).toBe(10);
      expect(posState.getBackorderATP()).toBe(0);
      expect(posState.calculateATP()).toBe(0);

      // 4. Release 3 from order 1: exactly 3 capacity restored
      // (Order 1 had 6, release partial or release full reservation)
      // When order 1 (qty 6) is cancelled/released:
      const releaseRes = await InventoryReservationService.releaseReservation({
        orderId: order1Id,
        releaseReason: 'ORDER_CANCELLED',
        merchantScopeId: 'default'
      });
      expect(['cancelled', 'released']).toContain(releaseRes.reservation.status);

      posState = await InventoryPosition.findById(boPos._id);
      expect(posState.backordered).toBe(4); // 10 - 6 = 4
      expect(posState.getBackorderATP()).toBe(6);
      expect(posState.calculateATP()).toBe(6);

      // Duplicate release is idempotent and does not restore more capacity
      const duplicateRelease = await InventoryReservationService.releaseReservation({
        orderId: order1Id,
        releaseReason: 'ORDER_CANCELLED',
        merchantScopeId: 'default'
      });
      expect(duplicateRelease.isReplay).toBe(true);
      posState = await InventoryPosition.findById(boPos._id);
      expect(posState.backordered).toBe(4);

      // 5. Concurrent attempts never exceed 10
      // 4 slots are occupied, 6 remain. Launch 10 concurrent requests for 1 unit each.
      const concurrentPromises = [];
      for (let i = 0; i < 10; i++) {
        const oId = `ORD-EXBO-CONC-${Date.now()}-${i}`;
        const iKey = `idemp-exbo-conc-${Date.now()}-${i}`;
        concurrentPromises.push(
          InventoryReservationService.createReservation({
            orderId: oId,
            orderObjectId: new mongoose.Types.ObjectId(),
            items: [{
              product: boProduct._id,
              productId: String(boProduct._id),
              quantity: 1,
              sku: boProduct.sku
            }],
            destinationCountry: 'PK',
            merchantScopeId: 'default',
            idempotencyKey: iKey
          }).then((r) => ({ success: true, r })).catch((e) => ({ success: false, e }))
        );
      }

      const concurrentResults = await Promise.all(concurrentPromises);
      const concSuccesses = concurrentResults.filter((r) => r.success);
      const concFailures = concurrentResults.filter((r) => !r.success);

      expect(concSuccesses.length).toBe(6);
      expect(concFailures.length).toBe(4);

      posState = await InventoryPosition.findById(boPos._id);
      expect(posState.backordered).toBe(10);
      expect(posState.getBackorderATP()).toBe(0);
      expect(posState.calculateATP()).toBe(0);

      // 6. Backordered never becomes negative
      expect(posState.backordered).toBeGreaterThanOrEqual(0);
      expect(posState.reserved).toBe(0); // Physical reserved stays 0
    });
  });
});

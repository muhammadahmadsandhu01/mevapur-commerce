/**
 * @file stock-hold-concurrency.integration.test.js
 * @description Integration and concurrency tests for StockHoldLeaseService, multi-line/multi-origin holds,
 * all-or-nothing rollbacks, racing on final units, cross-tenant isolation, and negative counter protections.
 */

'use strict';

const mongoose = require('mongoose');
const InventoryHold = require('../../../models/InventoryHold');
const InventoryPosition = require('../../../models/InventoryPosition');
const InventoryLedger = require('../../../models/InventoryLedger');
const User = require('../../../models/User');
const Product = require('../../../models/Product');
const FulfillmentLocation = require('../../../models/FulfillmentLocation');
const StockHoldLeaseService = require('../../../services/inventory/StockHoldLeaseService');

describe('Phase 6D-5A Stock Hold Concurrency and Transaction Integration Tests', () => {
  let testUser;
  let testProduct1;
  let testProduct2;
  let locationUS1;
  let locationUS2;
  let pos1;
  let pos2;

  beforeEach(async () => {
    testUser = await User.create({
      fullName: 'Concurrency Test Customer',
      email: `concurrency-${Date.now()}@example.com`,
      password: 'password123',
      role: 'customer'
    });

    locationUS1 = await FulfillmentLocation.create({
      merchantScopeId: 'default',
      locationCode: `WH1-${Date.now()}`.slice(0, 40),
      displayName: 'Dallas Hub',
      status: 'active',
      countryCode: 'US',
      city: 'Dallas',
      timeZone: 'America/Chicago',
      addressLine1: '100 Logistics Blvd',
      postalCode: '75201',
      supportedMarketCountries: ['US'],
      capabilities: ['local_delivery', 'cross_border'],
      effectiveFrom: new Date(Date.now() - 60000)
    });

    locationUS2 = await FulfillmentLocation.create({
      merchantScopeId: 'default',
      locationCode: `WH2-${Date.now()}`.slice(0, 40),
      displayName: 'Chicago Hub',
      status: 'active',
      countryCode: 'US',
      city: 'Chicago',
      timeZone: 'America/Chicago',
      addressLine1: '200 Logistics Way',
      postalCode: '60601',
      supportedMarketCountries: ['US'],
      capabilities: ['local_delivery', 'cross_border'],
      effectiveFrom: new Date(Date.now() - 60000)
    });

    testProduct1 = await Product.create({
      name: 'Widget Alpha',
      slug: `widget-alpha-${Date.now()}`,
      price: 50,
      countInStock: 10,
      sku: `SKU-ALPHA-${Date.now()}`
    });

    testProduct2 = await Product.create({
      name: 'Widget Beta',
      slug: `widget-beta-${Date.now()}`,
      price: 75,
      countInStock: 10,
      sku: `SKU-BETA-${Date.now()}`
    });

    pos1 = await InventoryPosition.create({
      merchantScopeId: 'default',
      locationId: locationUS1._id,
      locationCode: locationUS1.locationCode,
      productId: testProduct1._id,
      canonicalSku: testProduct1.sku,
      onHand: 10,
      reserved: 0,
      unavailable: 0,
      safetyStock: 0,
      allowBackorder: true,
      backorderLimit: 5,
      backordered: 0,
      lockVersion: 1
    });

    pos2 = await InventoryPosition.create({
      merchantScopeId: 'default',
      locationId: locationUS2._id,
      locationCode: locationUS2.locationCode,
      productId: testProduct2._id,
      canonicalSku: testProduct2.sku,
      onHand: 10,
      reserved: 0,
      unavailable: 0,
      safetyStock: 0,
      allowBackorder: true,
      backorderLimit: 5,
      backordered: 0,
      lockVersion: 1
    });
  });

  it('1. acquires multi-line hold across different locations atomically', async () => {
    const sessionId = `cs_multiline_${Date.now()}`;
    const result = await StockHoldLeaseService.acquireHold({
      sessionId,
      items: [
        {
          productId: testProduct1._id,
          sku: testProduct1.sku,
          name: testProduct1.name,
          quantity: 3,
          lineTotal: 150,
          weightGrams: 500
        },
        {
          productId: testProduct2._id,
          sku: testProduct2.sku,
          name: testProduct2.name,
          quantity: 2,
          lineTotal: 150,
          weightGrams: 500
        }
      ],
      destinationCountry: 'US',
      merchantScopeId: 'default',
      leaseDurationMinutes: 15,
      idempotencyKey: `idemp_${sessionId}`,
      userId: testUser._id
    });

    expect(result.hold).toBeDefined();
    expect(result.hold.allocations.length).toBe(2);

    const pos1After = await InventoryPosition.findById(pos1._id);
    const pos2After = await InventoryPosition.findById(pos2._id);

    expect(pos1After.reserved).toBe(3);
    expect(pos2After.reserved).toBe(2);

    // Verify ledgers created for both
    const ledgers = await InventoryLedger.find({ sourceId: String(result.hold._id) });
    expect(ledgers.length).toBe(2);
  });

  it('2. all-or-nothing rollback when second position has insufficient stock', async () => {
    // Make pos2 completely out of stock
    await InventoryPosition.updateOne(
      { _id: pos2._id },
      { $set: { onHand: 0, allowBackorder: false } }
    );

    const sessionId = `cs_rollback_${Date.now()}`;

    await expect(StockHoldLeaseService.acquireHold({
      sessionId,
      items: [
        {
          productId: testProduct1._id,
          sku: testProduct1.sku,
          name: testProduct1.name,
          quantity: 3,
          lineTotal: 150,
          weightGrams: 500
        },
        {
          productId: testProduct2._id,
          sku: testProduct2.sku,
          name: testProduct2.name,
          quantity: 2,
          lineTotal: 150,
          weightGrams: 500
        }
      ],
      destinationCountry: 'US',
      merchantScopeId: 'default',
      leaseDurationMinutes: 15,
      idempotencyKey: `idemp_${sessionId}`,
      userId: testUser._id
    })).rejects.toThrow(/insufficient/i);

    // Proves pos1 reservation was rolled back completely (remains 0)
    const pos1After = await InventoryPosition.findById(pos1._id);
    expect(pos1After.reserved).toBe(0);

    // Proves no hold was saved
    const hold = await InventoryHold.findOne({ sessionId });
    expect(hold).toBeNull();
  });

  it('3. two concurrent sessions racing for the final unit: exactly one succeeds', async () => {
    // Set pos1 to only have 1 unit of stock
    await InventoryPosition.updateOne(
      { _id: pos1._id },
      { $set: { onHand: 1, reserved: 0, allowBackorder: false } }
    );

    const session1Id = `cs_race_1_${Date.now()}`;
    const session2Id = `cs_race_2_${Date.now()}`;

    const p1 = StockHoldLeaseService.acquireHold({
      sessionId: session1Id,
      items: [{
        productId: testProduct1._id,
        sku: testProduct1.sku,
        name: testProduct1.name,
        quantity: 1,
        lineTotal: 50,
        weightGrams: 500
      }],
      destinationCountry: 'US',
      merchantScopeId: 'default',
      leaseDurationMinutes: 15,
      idempotencyKey: `idemp_${session1Id}`,
      userId: testUser._id
    });

    const p2 = StockHoldLeaseService.acquireHold({
      sessionId: session2Id,
      items: [{
        productId: testProduct1._id,
        sku: testProduct1.sku,
        name: testProduct1.name,
        quantity: 1,
        lineTotal: 50,
        weightGrams: 500
      }],
      destinationCountry: 'US',
      merchantScopeId: 'default',
      leaseDurationMinutes: 15,
      idempotencyKey: `idemp_${session2Id}`,
      userId: testUser._id
    });

    const results = await Promise.allSettled([p1, p2]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);

    const posAfter = await InventoryPosition.findById(pos1._id);
    expect(posAfter.reserved).toBe(1);
  });

  it('4. tenant isolation: Tenant A cannot hold or release Tenant B inventory', async () => {
    const sessionId = `cs_tenant_iso_${Date.now()}`;

    // Tenant B attempts to allocate against default tenant's inventory
    await expect(StockHoldLeaseService.acquireHold({
      sessionId,
      items: [{
        productId: testProduct1._id,
        sku: testProduct1.sku,
        name: testProduct1.name,
        quantity: 1,
        lineTotal: 50,
        weightGrams: 500
      }],
      destinationCountry: 'US',
      merchantScopeId: 'tenant_bravo',
      leaseDurationMinutes: 15,
      idempotencyKey: `idemp_${sessionId}`,
      userId: testUser._id
    })).rejects.toThrow(/insufficient/i);

    const pos = await InventoryPosition.findById(pos1._id);
    expect(pos.reserved).toBe(0);
  });

  it('5. duplicate release is an idempotent no-op and never creates negative counters', async () => {
    const sessionId = `cs_dup_rel_${Date.now()}`;

    const acquireResult = await StockHoldLeaseService.acquireHold({
      sessionId,
      items: [{
        productId: testProduct1._id,
        sku: testProduct1.sku,
        name: testProduct1.name,
        quantity: 2,
        lineTotal: 100,
        weightGrams: 500
      }],
      destinationCountry: 'US',
      merchantScopeId: 'default',
      leaseDurationMinutes: 15,
      idempotencyKey: `idemp_${sessionId}`,
      userId: testUser._id
    });

    const holdId = acquireResult.hold._id;

    // First release
    const rel1 = await StockHoldLeaseService.releaseHold({
      holdId,
      sessionId,
      merchantScopeId: 'default',
      releaseReason: 'TEST_CANCEL'
    });
    expect(rel1.released).toBe(true);

    const posAfterRel1 = await InventoryPosition.findById(pos1._id);
    expect(posAfterRel1.reserved).toBe(0);

    // Second duplicate release
    const rel2 = await StockHoldLeaseService.releaseHold({
      holdId,
      sessionId,
      merchantScopeId: 'default',
      releaseReason: 'TEST_CANCEL_DUP'
    });
    expect(rel2.isReplay).toBe(true);

    // Proves reserved counter did not go negative (< 0)
    const posAfterRel2 = await InventoryPosition.findById(pos1._id);
    expect(posAfterRel2.reserved).toBe(0);
  });

  it('6. capture_committed and converted holds cannot be expired by expiry worker', async () => {
    const sessionId1 = `cs_cap_comm_${Date.now()}`;
    const sessionId2 = `cs_conv_${Date.now()}`;

    const pastDate = new Date(Date.now() - 10 * 60 * 1000);

    const hold1 = await InventoryHold.create({
      merchantScopeId: 'default',
      sessionId: sessionId1,
      holdKey: `hold:default:${sessionId1}`,
      status: InventoryHold.STATUSES.CAPTURE_COMMITTED,
      expiresAt: pastDate,
      maxLifetimeExpiresAt: new Date(Date.now() + 30 * 60 * 1000),
      allocations: [{
        locationId: locationUS1._id,
        locationCode: locationUS1.locationCode,
        originCountry: 'US',
        productId: testProduct1._id,
        canonicalSku: testProduct1.sku,
        quantity: 1,
        physicalReservedQuantity: 1,
        backorderedQuantity: 0,
        inventoryPositionId: pos1._id,
        inventoryLockVersion: 1
      }]
    });

    const hold2 = await InventoryHold.create({
      merchantScopeId: 'default',
      sessionId: sessionId2,
      holdKey: `hold:default:${sessionId2}`,
      status: InventoryHold.STATUSES.CONVERTED,
      expiresAt: pastDate,
      maxLifetimeExpiresAt: new Date(Date.now() + 30 * 60 * 1000),
      allocations: [{
        locationId: locationUS1._id,
        locationCode: locationUS1.locationCode,
        originCountry: 'US',
        productId: testProduct1._id,
        canonicalSku: testProduct1.sku,
        quantity: 1,
        physicalReservedQuantity: 1,
        backorderedQuantity: 0,
        inventoryPositionId: pos1._id,
        inventoryLockVersion: 1
      }]
    });

    // Run batch expiry
    const summary = await StockHoldLeaseService.expireDueHolds({ batchSize: 50 });

    const updatedHold1 = await InventoryHold.findById(hold1._id);
    const updatedHold2 = await InventoryHold.findById(hold2._id);

    // Proves neither was expired
    expect(updatedHold1.status).toBe(InventoryHold.STATUSES.CAPTURE_COMMITTED);
    expect(updatedHold2.status).toBe(InventoryHold.STATUSES.CONVERTED);
  });
});

/**
 * @file checkout-session-workers.unit.test.js
 * @description Unit & worker tests for reconcileExpiredCheckoutSessions and purgeAbandonedCheckoutSessions.
 * Proves bounded batching, deterministic sorting, PII redaction safety, and audit evidence retention.
 */

'use strict';

const mongoose = require('mongoose');
const CheckoutSession = require('../../../models/CheckoutSession');
const InventoryHold = require('../../../models/InventoryHold');
const InventoryPosition = require('../../../models/InventoryPosition');
const InventoryLedger = require('../../../models/InventoryLedger');
const StockHoldLeaseService = require('../../../services/inventory/StockHoldLeaseService');
const { reconcileExpiredCheckoutSessions } = require('../../../scripts/workers/reconcileExpiredCheckoutSessions');
const { purgeAbandonedCheckoutSessions } = require('../../../scripts/workers/purgeAbandonedCheckoutSessions');
const { Money, MoneyMapper } = require('../../../modules/commerce');

describe('Phase 6D-5A Checkout Session Worker & PII Redaction Unit Tests', () => {
  it('1. reconcileExpiredCheckoutSessions processes expired sessions in bounded deterministic batches', async () => {
    const totalAmountMoney = Money.fromMinor('2500', 'USD');
    const totalAmountExact = MoneyMapper.toPersistence(totalAmountMoney);
    const pastDate = new Date(Date.now() - 10 * 60 * 1000);

    // Create 3 expired sessions
    for (let i = 0; i < 3; i++) {
      const sessionId = `cs_batch_${i}_${Date.now()}`;
      const hold = await InventoryHold.create({
        merchantScopeId: 'default',
        sessionId,
        holdKey: `hold:default:${sessionId}`,
        status: InventoryHold.STATUSES.ACTIVE,
        expiresAt: pastDate,
        maxLifetimeExpiresAt: new Date(Date.now() + 30 * 60 * 1000),
        allocations: [{
          locationId: new mongoose.Types.ObjectId(),
          locationCode: 'WH-TEST',
          originCountry: 'US',
          productId: new mongoose.Types.ObjectId(),
          canonicalSku: `SKU-${i}`,
          quantity: 1,
          physicalReservedQuantity: 1,
          backorderedQuantity: 0,
          inventoryPositionId: new mongoose.Types.ObjectId(),
          inventoryLockVersion: 1
        }]
      });

      await CheckoutSession.create({
        sessionId,
        merchantScopeId: 'default',
        userId: new mongoose.Types.ObjectId(),
        customerEmail: `user${i}@example.com`,
        status: CheckoutSession.STATUSES.PAYMENT_PENDING,
        destinationCountry: 'US',
        currency: 'USD',
        quoteId: `quote_${sessionId}`,
        quoteTokenHash: `hash_${sessionId}`,
        quoteSnapshot: {
          quoteId: `quote_${sessionId}`,
          kid: 'kid_test',
          incoterm: 'DDP',
          merchantScopeId: 'default',
          issuedAt: new Date(),
          expiresAt: new Date(Date.now() + 30 * 60 * 1000),
          itemsHash: 'hash'
        },
        orderData: {
          items: [{
            productId: new mongoose.Types.ObjectId(),
            canonicalSku: `SKU-${i}`,
            name: `Widget ${i}`,
            quantity: 1,
            unitPriceExact: totalAmountExact,
            lineTotalExact: totalAmountExact,
            weightGrams: 200
          }],
          shippingAddress: {
            fullName: `Customer ${i}`,
            addressLine1: `${i} Main St`,
            locality: 'Dallas',
            countryCode: 'US',
            phone: '+15550000000'
          },
          paymentMethod: 'stripe'
        },
        taxesAndDutiesSnapshot: {
          taxType: 'SALES_TAX',
          taxTreatment: 'EXCLUSIVE',
          taxableBasis: 'DESTINATION',
          taxRateNumerator: 0,
          taxRateDenominator: 10000,
          dutyRateNumerator: 0,
          dutyRateDenominator: 10000,
          taxAmountExact: MoneyMapper.toPersistence(Money.zero('USD')),
          additionalTaxAmountExact: MoneyMapper.toPersistence(Money.zero('USD')),
          taxIncludedAmountExact: MoneyMapper.toPersistence(Money.zero('USD')),
          goodsValueExact: totalAmountExact,
          payableDutyExact: MoneyMapper.toPersistence(Money.zero('USD'))
        },
        shippingSnapshot: {
          serviceLevel: 'standard',
          shippingAmountExact: MoneyMapper.toPersistence(Money.zero('USD'))
        },
        amounts: {
          subtotalExact: totalAmountExact,
          discountExact: MoneyMapper.toPersistence(Money.zero('USD')),
          shippingCostExact: MoneyMapper.toPersistence(Money.zero('USD')),
          taxAmountExact: MoneyMapper.toPersistence(Money.zero('USD')),
          additionalTaxAmountExact: MoneyMapper.toPersistence(Money.zero('USD')),
          taxIncludedAmountExact: MoneyMapper.toPersistence(Money.zero('USD')),
          dutiesExact: MoneyMapper.toPersistence(Money.zero('USD')),
          totalAmountExact
        },
        inventoryHoldId: hold._id,
        leaseExpiresAt: pastDate,
        idempotencyKey: `idemp_${sessionId}`,
        requestHash: `req_${sessionId}`
      });
    }

    // Run with batchSize: 2 (proves bounded batching)
    const summary1 = await reconcileExpiredCheckoutSessions({ batchSize: 2 });
    expect(summary1.processed).toBe(2);
    expect(summary1.expiredCount).toBe(2);

    // Run second batch (processes the remaining 1)
    const summary2 = await reconcileExpiredCheckoutSessions({ batchSize: 2 });
    expect(summary2.processed).toBe(1);
    expect(summary2.expiredCount).toBe(1);
  });

  it('2. purgeAbandonedCheckoutSessions redacts PII on abandoned sessions while preserving financial records', async () => {
    const totalAmountMoney = Money.fromMinor('5000', 'USD');
    const totalAmountExact = MoneyMapper.toPersistence(totalAmountMoney);
    const oldDate = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000); // 40 days ago

    const sessionId = `cs_abandoned_${Date.now()}`;
    const sessionDoc = await CheckoutSession.create({
      sessionId,
      merchantScopeId: 'default',
      userId: new mongoose.Types.ObjectId(),
      customerEmail: 'sensitive.customer@example.com',
      status: CheckoutSession.STATUSES.EXPIRED,
      destinationCountry: 'US',
      currency: 'USD',
      quoteId: `quote_${sessionId}`,
      quoteTokenHash: `hash_${sessionId}`,
      quoteSnapshot: {
        quoteId: `quote_${sessionId}`,
        kid: 'kid_test',
        incoterm: 'DDP',
        merchantScopeId: 'default',
        issuedAt: oldDate,
        expiresAt: oldDate,
        itemsHash: 'hash'
      },
      orderData: {
        items: [{
          productId: new mongoose.Types.ObjectId(),
          canonicalSku: 'SKU-OLD',
          name: 'Old Widget',
          quantity: 1,
          unitPriceExact: totalAmountExact,
          lineTotalExact: totalAmountExact,
          weightGrams: 200
        }],
        shippingAddress: {
          fullName: 'Secret Customer Name',
          addressLine1: '99 Secret Avenue',
          addressLine2: 'Apt 4B',
          locality: 'Dallas',
          postalCode: '75201',
          countryCode: 'US',
          phone: '+15559998888'
        },
        customerNote: 'Please leave at back gate code 1234',
        paymentMethod: 'stripe'
      },
      taxesAndDutiesSnapshot: {
        taxType: 'SALES_TAX',
        taxTreatment: 'EXCLUSIVE',
        taxableBasis: 'DESTINATION',
        taxRateNumerator: 0,
        taxRateDenominator: 10000,
        dutyRateNumerator: 0,
        dutyRateDenominator: 10000,
        taxAmountExact: MoneyMapper.toPersistence(Money.zero('USD')),
        additionalTaxAmountExact: MoneyMapper.toPersistence(Money.zero('USD')),
        taxIncludedAmountExact: MoneyMapper.toPersistence(Money.zero('USD')),
        goodsValueExact: totalAmountExact,
        payableDutyExact: MoneyMapper.toPersistence(Money.zero('USD'))
      },
      shippingSnapshot: {
        serviceLevel: 'standard',
        shippingAmountExact: MoneyMapper.toPersistence(Money.zero('USD'))
      },
      amounts: {
        subtotalExact: totalAmountExact,
        discountExact: MoneyMapper.toPersistence(Money.zero('USD')),
        shippingCostExact: MoneyMapper.toPersistence(Money.zero('USD')),
        taxAmountExact: MoneyMapper.toPersistence(Money.zero('USD')),
        additionalTaxAmountExact: MoneyMapper.toPersistence(Money.zero('USD')),
        taxIncludedAmountExact: MoneyMapper.toPersistence(Money.zero('USD')),
        dutiesExact: MoneyMapper.toPersistence(Money.zero('USD')),
        totalAmountExact
      },
      inventoryHoldId: new mongoose.Types.ObjectId(),
      leaseExpiresAt: oldDate,
      idempotencyKey: `idemp_${sessionId}`,
      requestHash: `req_${sessionId}`,
      updatedAt: oldDate
    });

    // Run purge worker
    const purgeSummary = await purgeAbandonedCheckoutSessions({ retentionDays: 30 });
    expect(purgeSummary.redactedCount).toBeGreaterThanOrEqual(1);

    // Verify PII is redacted
    const redactedSession = await CheckoutSession.findById(sessionDoc._id);
    expect(redactedSession.customerEmail).toBe('[redacted]');
    expect(redactedSession.orderData.shippingAddress.fullName).toBe('[REDACTED]');
    expect(redactedSession.orderData.shippingAddress.addressLine1).toBe('[REDACTED]');
    expect(redactedSession.orderData.shippingAddress.phone).toBe('[REDACTED]');
    expect(redactedSession.orderData.customerNote).toBe('[REDACTED]');

    // Verify financial amounts and non-PII geography are retained
    expect(redactedSession.destinationCountry).toBe('US');
    expect(redactedSession.amounts.totalAmountExact.amountMinor.toString()).toBe('5000');
    expect(redactedSession.redactedAt).toBeDefined();

    // Verify second purge run is idempotent
    const secondPurge = await purgeAbandonedCheckoutSessions({ retentionDays: 30 });
    expect(secondPurge.redactedCount).toBe(0);
  });

  it('3. purgeAbandonedCheckoutSessions strictly NEVER redacts converted or conflict sessions', async () => {
    const totalAmountMoney = Money.fromMinor('5000', 'USD');
    const totalAmountExact = MoneyMapper.toPersistence(totalAmountMoney);
    const oldDate = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);

    const convertedSessionId = `cs_conv_old_${Date.now()}`;
    const conflictSessionId = `cs_conf_old_${Date.now()}`;

    await CheckoutSession.create({
      sessionId: convertedSessionId,
      merchantScopeId: 'default',
      userId: new mongoose.Types.ObjectId(),
      customerEmail: 'converted.user@example.com',
      status: CheckoutSession.STATUSES.CONVERTED,
      destinationCountry: 'US',
      currency: 'USD',
      quoteId: `quote_${convertedSessionId}`,
      quoteTokenHash: `hash_${convertedSessionId}`,
      quoteSnapshot: {
        quoteId: `quote_${convertedSessionId}`,
        kid: 'kid_test',
        incoterm: 'DDP',
        merchantScopeId: 'default',
        issuedAt: oldDate,
        expiresAt: oldDate,
        itemsHash: 'hash'
      },
      orderData: {
        items: [{
          productId: new mongoose.Types.ObjectId(),
          canonicalSku: 'SKU-CONV',
          name: 'Converted Widget',
          quantity: 1,
          unitPriceExact: totalAmountExact,
          lineTotalExact: totalAmountExact,
          weightGrams: 200
        }],
        shippingAddress: {
          fullName: 'Preserved Converted Customer',
          addressLine1: '100 Main St',
          locality: 'Dallas',
          countryCode: 'US'
        },
        paymentMethod: 'stripe'
      },
      taxesAndDutiesSnapshot: {
        taxType: 'SALES_TAX',
        taxTreatment: 'EXCLUSIVE',
        taxableBasis: 'DESTINATION',
        taxRateNumerator: 0,
        taxRateDenominator: 10000,
        dutyRateNumerator: 0,
        dutyRateDenominator: 10000,
        taxAmountExact: MoneyMapper.toPersistence(Money.zero('USD')),
        additionalTaxAmountExact: MoneyMapper.toPersistence(Money.zero('USD')),
        taxIncludedAmountExact: MoneyMapper.toPersistence(Money.zero('USD')),
        goodsValueExact: totalAmountExact,
        payableDutyExact: MoneyMapper.toPersistence(Money.zero('USD'))
      },
      shippingSnapshot: {
        serviceLevel: 'standard',
        shippingAmountExact: MoneyMapper.toPersistence(Money.zero('USD'))
      },
      amounts: {
        subtotalExact: totalAmountExact,
        discountExact: MoneyMapper.toPersistence(Money.zero('USD')),
        shippingCostExact: MoneyMapper.toPersistence(Money.zero('USD')),
        taxAmountExact: MoneyMapper.toPersistence(Money.zero('USD')),
        additionalTaxAmountExact: MoneyMapper.toPersistence(Money.zero('USD')),
        taxIncludedAmountExact: MoneyMapper.toPersistence(Money.zero('USD')),
        dutiesExact: MoneyMapper.toPersistence(Money.zero('USD')),
        totalAmountExact
      },
      inventoryHoldId: new mongoose.Types.ObjectId(),
      leaseExpiresAt: oldDate,
      idempotencyKey: `idemp_${convertedSessionId}`,
      requestHash: `req_${convertedSessionId}`,
      updatedAt: oldDate
    });

    await CheckoutSession.create({
      sessionId: conflictSessionId,
      merchantScopeId: 'default',
      userId: new mongoose.Types.ObjectId(),
      customerEmail: 'conflict.user@example.com',
      status: CheckoutSession.STATUSES.CONFLICT,
      destinationCountry: 'US',
      currency: 'USD',
      quoteId: `quote_${conflictSessionId}`,
      quoteTokenHash: `hash_${conflictSessionId}`,
      quoteSnapshot: {
        quoteId: `quote_${conflictSessionId}`,
        kid: 'kid_test',
        incoterm: 'DDP',
        merchantScopeId: 'default',
        issuedAt: oldDate,
        expiresAt: oldDate,
        itemsHash: 'hash'
      },
      orderData: {
        items: [{
          productId: new mongoose.Types.ObjectId(),
          canonicalSku: 'SKU-CONF',
          name: 'Conflict Widget',
          quantity: 1,
          unitPriceExact: totalAmountExact,
          lineTotalExact: totalAmountExact,
          weightGrams: 200
        }],
        shippingAddress: {
          fullName: 'Preserved Conflict Customer',
          addressLine1: '200 Main St',
          locality: 'Dallas',
          countryCode: 'US'
        },
        paymentMethod: 'stripe'
      },
      taxesAndDutiesSnapshot: {
        taxType: 'SALES_TAX',
        taxTreatment: 'EXCLUSIVE',
        taxableBasis: 'DESTINATION',
        taxRateNumerator: 0,
        taxRateDenominator: 10000,
        dutyRateNumerator: 0,
        dutyRateDenominator: 10000,
        taxAmountExact: MoneyMapper.toPersistence(Money.zero('USD')),
        additionalTaxAmountExact: MoneyMapper.toPersistence(Money.zero('USD')),
        taxIncludedAmountExact: MoneyMapper.toPersistence(Money.zero('USD')),
        goodsValueExact: totalAmountExact,
        payableDutyExact: MoneyMapper.toPersistence(Money.zero('USD'))
      },
      shippingSnapshot: {
        serviceLevel: 'standard',
        shippingAmountExact: MoneyMapper.toPersistence(Money.zero('USD'))
      },
      amounts: {
        subtotalExact: totalAmountExact,
        discountExact: MoneyMapper.toPersistence(Money.zero('USD')),
        shippingCostExact: MoneyMapper.toPersistence(Money.zero('USD')),
        taxAmountExact: MoneyMapper.toPersistence(Money.zero('USD')),
        additionalTaxAmountExact: MoneyMapper.toPersistence(Money.zero('USD')),
        taxIncludedAmountExact: MoneyMapper.toPersistence(Money.zero('USD')),
        dutiesExact: MoneyMapper.toPersistence(Money.zero('USD')),
        totalAmountExact
      },
      inventoryHoldId: new mongoose.Types.ObjectId(),
      leaseExpiresAt: oldDate,
      idempotencyKey: `idemp_${conflictSessionId}`,
      requestHash: `req_${conflictSessionId}`,
      updatedAt: oldDate
    });

    await purgeAbandonedCheckoutSessions({ retentionDays: 30 });

    const checkConverted = await CheckoutSession.findOne({ sessionId: convertedSessionId });
    const checkConflict = await CheckoutSession.findOne({ sessionId: conflictSessionId });

    expect(checkConverted.customerEmail).toBe('converted.user@example.com');
    expect(checkConverted.redactedAt).toBeNull();

    expect(checkConflict.customerEmail).toBe('conflict.user@example.com');
    expect(checkConflict.redactedAt).toBeNull();
  });

  describe('Group D: Injected Worker Failures & Transaction Rollback Atomicity', () => {
    let testLocationId;
    let testProductId;
    let testPosition;

    beforeEach(async () => {
      testLocationId = new mongoose.Types.ObjectId();
      testProductId = new mongoose.Types.ObjectId();

      testPosition = await InventoryPosition.create({
        merchantScopeId: 'default',
        locationId: testLocationId,
        locationCode: 'WH-WORKER-TEST',
        productId: testProductId,
        canonicalSku: 'SKU-FAIL-TEST',
        onHand: 20,
        reserved: 0,
        unavailable: 0,
        safetyStock: 0,
        allowBackorder: true,
        backorderLimit: 10,
        backordered: 0,
        lockVersion: 1
      });
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    async function createWorkerFixtureSession({
      sessionId = `cs_worker_fail_${Date.now()}`,
      allocations = null
    } = {}) {
      const totalAmountMoney = Money.fromMinor('5000', 'USD');
      const totalAmountExact = MoneyMapper.toPersistence(totalAmountMoney);
      const pastDate = new Date(Date.now() - 10 * 60 * 1000);

      const defaultAllocations = allocations || [{
        locationId: testLocationId,
        locationCode: 'WH-WORKER-TEST',
        originCountry: 'US',
        productId: testProductId,
        canonicalSku: 'SKU-FAIL-TEST',
        quantity: 1,
        physicalReservedQuantity: 1,
        backorderedQuantity: 0,
        inventoryPositionId: testPosition._id,
        inventoryLockVersion: 1
      }];

      for (const alloc of defaultAllocations) {
        if (alloc.physicalReservedQuantity > 0) {
          await InventoryPosition.updateOne(
            { _id: alloc.inventoryPositionId },
            { $inc: { reserved: alloc.physicalReservedQuantity } }
          );
        }
      }

      const hold = await InventoryHold.create({
        merchantScopeId: 'default',
        sessionId,
        holdKey: `hold:default:${sessionId}`,
        status: InventoryHold.STATUSES.ACTIVE,
        expiresAt: pastDate,
        maxLifetimeExpiresAt: new Date(Date.now() + 30 * 60 * 1000),
        allocations: defaultAllocations
      });

      const session = await CheckoutSession.create({
        sessionId,
        merchantScopeId: 'default',
        userId: new mongoose.Types.ObjectId(),
        customerEmail: 'worker.test@example.com',
        status: CheckoutSession.STATUSES.PAYMENT_PENDING,
        destinationCountry: 'US',
        currency: 'USD',
        quoteId: `quote_${sessionId}`,
        quoteTokenHash: `hash_${sessionId}`,
        quoteSnapshot: {
          quoteId: `quote_${sessionId}`,
          kid: 'kid_test',
          incoterm: 'DDP',
          merchantScopeId: 'default',
          issuedAt: pastDate,
          expiresAt: pastDate,
          itemsHash: 'hash'
        },
        orderData: {
          items: [{
            productId: testProductId,
            canonicalSku: 'SKU-FAIL-TEST',
            name: 'Worker Test Widget',
            quantity: 1,
            unitPriceExact: totalAmountExact,
            lineTotalExact: totalAmountExact,
            weightGrams: 200
          }],
          shippingAddress: {
            fullName: 'Worker Customer',
            addressLine1: '100 Main St',
            locality: 'Dallas',
            countryCode: 'US'
          },
          paymentMethod: 'stripe'
        },
        taxesAndDutiesSnapshot: {
          taxType: 'SALES_TAX',
          taxTreatment: 'EXCLUSIVE',
          taxableBasis: 'DESTINATION',
          taxRateNumerator: 0,
          taxRateDenominator: 10000,
          dutyRateNumerator: 0,
          dutyRateDenominator: 10000,
          taxAmountExact: MoneyMapper.toPersistence(Money.zero('USD')),
          additionalTaxAmountExact: MoneyMapper.toPersistence(Money.zero('USD')),
          taxIncludedAmountExact: MoneyMapper.toPersistence(Money.zero('USD')),
          goodsValueExact: totalAmountExact,
          payableDutyExact: MoneyMapper.toPersistence(Money.zero('USD'))
        },
        shippingSnapshot: {
          serviceLevel: 'standard',
          shippingAmountExact: MoneyMapper.toPersistence(Money.zero('USD'))
        },
        amounts: {
          subtotalExact: totalAmountExact,
          discountExact: MoneyMapper.toPersistence(Money.zero('USD')),
          shippingCostExact: MoneyMapper.toPersistence(Money.zero('USD')),
          taxAmountExact: MoneyMapper.toPersistence(Money.zero('USD')),
          additionalTaxAmountExact: MoneyMapper.toPersistence(Money.zero('USD')),
          taxIncludedAmountExact: MoneyMapper.toPersistence(Money.zero('USD')),
          dutiesExact: MoneyMapper.toPersistence(Money.zero('USD')),
          totalAmountExact
        },
        inventoryHoldId: hold._id,
        leaseExpiresAt: pastDate,
        idempotencyKey: `idemp_${sessionId}`,
        requestHash: `req_${sessionId}`
      });

      return { session, hold };
    }

    it('inject failure after session claim: rolls back transaction, session and hold remain active/pending', async () => {
      const { session, hold } = await createWorkerFixtureSession();

      // Mock releaseHold to throw an error inside the transaction right after session claim
      jest.spyOn(StockHoldLeaseService, 'releaseHold').mockRejectedValueOnce(new Error('Injected failure after session claim'));

      const summary = await reconcileExpiredCheckoutSessions({ now: new Date() });
      expect(summary.failedCount).toBe(1);

      // Verify transaction rolled back: session remains PAYMENT_PENDING, hold remains ACTIVE
      const sessionAfter = await CheckoutSession.findById(session._id);
      expect(sessionAfter.status).toBe(CheckoutSession.STATUSES.PAYMENT_PENDING);

      const holdAfter = await InventoryHold.findById(hold._id);
      expect(holdAfter.status).toBe(InventoryHold.STATUSES.ACTIVE);

      const posAfter = await InventoryPosition.findById(testPosition._id);
      expect(posAfter.reserved).toBe(1);

      const ledgers = await InventoryLedger.find({ sourceId: String(hold._id) });
      expect(ledgers.length).toBe(0);
    });

    it('inject failure after hold claim: rolls back transaction, session and hold remain consistent', async () => {
      const { session, hold } = await createWorkerFixtureSession();

      // Mock InventoryHold.findOne to fail inside releaseHold
      const originalFindOne = InventoryHold.findOne.bind(InventoryHold);
      const findOneSpy = jest.spyOn(InventoryHold, 'findOne').mockImplementation((...args) => {
        const query = originalFindOne(...args);
        return {
          ...query,
          session: () => {
            throw new Error('Injected failure during hold claim inside transaction');
          }
        };
      });

      const summary = await reconcileExpiredCheckoutSessions({ now: new Date() });
      expect(summary.failedCount).toBe(1);

      findOneSpy.mockRestore();

      const sessionAfter = await CheckoutSession.findById(session._id);
      expect(sessionAfter.status).toBe(CheckoutSession.STATUSES.PAYMENT_PENDING);

      const holdAfter = await InventoryHold.findById(hold._id);
      expect(holdAfter.status).toBe(InventoryHold.STATUSES.ACTIVE);

      const posAfter = await InventoryPosition.findById(testPosition._id);
      expect(posAfter.reserved).toBe(1);
    });

    it('inject failure after first position release in a multi-line hold: rolls back all position counter changes', async () => {
      // Create a second position
      const testPosition2 = await InventoryPosition.create({
        merchantScopeId: 'default',
        locationId: testLocationId,
        locationCode: 'WH-WORKER-TEST',
        productId: new mongoose.Types.ObjectId(),
        canonicalSku: 'SKU-FAIL-TEST-2',
        onHand: 15,
        reserved: 0,
        unavailable: 0,
        safetyStock: 0,
        allowBackorder: true,
        backorderLimit: 10,
        backordered: 0,
        lockVersion: 1
      });

      const multiAllocations = [
        {
          locationId: testLocationId,
          locationCode: 'WH-WORKER-TEST',
          originCountry: 'US',
          productId: testProductId,
          canonicalSku: 'SKU-FAIL-TEST',
          quantity: 1,
          physicalReservedQuantity: 1,
          backorderedQuantity: 0,
          inventoryPositionId: testPosition._id,
          inventoryLockVersion: 1
        },
        {
          locationId: testLocationId,
          locationCode: 'WH-WORKER-TEST',
          originCountry: 'US',
          productId: testPosition2.productId,
          canonicalSku: 'SKU-FAIL-TEST-2',
          quantity: 1,
          physicalReservedQuantity: 1,
          backorderedQuantity: 0,
          inventoryPositionId: testPosition2._id,
          inventoryLockVersion: 1
        }
      ];

      const { session, hold } = await createWorkerFixtureSession({ allocations: multiAllocations });

      // In multi-line release, allow first position to update but fail on the second
      let callCount = 0;
      const originalFindOneAndUpdate = InventoryPosition.findOneAndUpdate.bind(InventoryPosition);
      jest.spyOn(InventoryPosition, 'findOneAndUpdate').mockImplementation((...args) => {
        callCount++;
        if (callCount === 2) {
          throw new Error('Injected crash on 2nd line of multi-line hold release');
        }
        return originalFindOneAndUpdate(...args);
      });

      const summary = await reconcileExpiredCheckoutSessions({ now: new Date() });
      expect(summary.failedCount).toBe(1);

      // Verify transaction rollback: BOTH positions remain reserved = 1
      const pos1After = await InventoryPosition.findById(testPosition._id);
      expect(pos1After.reserved).toBe(1);

      const pos2After = await InventoryPosition.findById(testPosition2._id);
      expect(pos2After.reserved).toBe(1);

      const holdAfter = await InventoryHold.findById(hold._id);
      expect(holdAfter.status).toBe(InventoryHold.STATUSES.ACTIVE);

      const sessionAfter = await CheckoutSession.findById(session._id);
      expect(sessionAfter.status).toBe(CheckoutSession.STATUSES.PAYMENT_PENDING);

      const ledgers = await InventoryLedger.find({ sourceId: String(hold._id) });
      expect(ledgers.length).toBe(0);
    });

    it('inject failure during ledger insertion: rolls back transaction and persists zero inconsistent records', async () => {
      const { session, hold } = await createWorkerFixtureSession();

      // Spy on InventoryLedger.prototype.save to throw
      jest.spyOn(InventoryLedger.prototype, 'save').mockRejectedValueOnce(new Error('Injected failure during ledger insertion'));

      const summary = await reconcileExpiredCheckoutSessions({ now: new Date() });
      expect(summary.failedCount).toBe(1);

      const sessionAfter = await CheckoutSession.findById(session._id);
      expect(sessionAfter.status).toBe(CheckoutSession.STATUSES.PAYMENT_PENDING);

      const holdAfter = await InventoryHold.findById(hold._id);
      expect(holdAfter.status).toBe(InventoryHold.STATUSES.ACTIVE);

      const posAfter = await InventoryPosition.findById(testPosition._id);
      expect(posAfter.reserved).toBe(1);

      const ledgers = await InventoryLedger.find({ sourceId: String(hold._id) });
      expect(ledgers.length).toBe(0);
    });

    it('simulates two independently constructed worker instances; proves exactly one release', async () => {
      const { session, hold } = await createWorkerFixtureSession();

      const [res1, res2] = await Promise.all([
        reconcileExpiredCheckoutSessions({ now: new Date() }),
        reconcileExpiredCheckoutSessions({ now: new Date() })
      ]);

      const totalExpired = (res1.expiredCount || 0) + (res2.expiredCount || 0);
      expect(totalExpired).toBe(1);

      const posAfter = await InventoryPosition.findById(testPosition._id);
      expect(posAfter.reserved).toBe(0);

      const holdAfter = await InventoryHold.findById(hold._id);
      expect(holdAfter.status).toBe(InventoryHold.STATUSES.EXPIRED);

      const sessionAfter = await CheckoutSession.findById(session._id);
      expect(sessionAfter.status).toBe(CheckoutSession.STATUSES.EXPIRED);

      const ledgers = await InventoryLedger.find({ sourceId: String(hold._id) });
      expect(ledgers.length).toBe(1);
    });

    it('simulates interrupted eligible work and proves a later worker run resumes it', async () => {
      const { session: s1 } = await createWorkerFixtureSession({ sessionId: `cs_resumable_1_${Date.now()}` });
      const { session: s2 } = await createWorkerFixtureSession({ sessionId: `cs_resumable_2_${Date.now()}` });

      // Run with batchSize: 1 (interrupted / bounded work)
      const run1 = await reconcileExpiredCheckoutSessions({ batchSize: 1, now: new Date() });
      expect(run1.processed).toBe(1);
      expect(run1.expiredCount).toBe(1);

      // Later run picks up the remaining eligible session
      const run2 = await reconcileExpiredCheckoutSessions({ batchSize: 1, now: new Date() });
      expect(run2.processed).toBe(1);
      expect(run2.expiredCount).toBe(1);

      const s1After = await CheckoutSession.findById(s1._id);
      const s2After = await CheckoutSession.findById(s2._id);
      expect(s1After.status).toBe(CheckoutSession.STATUSES.EXPIRED);
      expect(s2After.status).toBe(CheckoutSession.STATUSES.EXPIRED);
    });

    it('asserts purge retains converted, conflict, payment_captured, converting, and cancellation_requested evidence', async () => {
      const totalAmountMoney = Money.fromMinor('5000', 'USD');
      const totalAmountExact = MoneyMapper.toPersistence(totalAmountMoney);
      const oldDate = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);

      const statesToPreserve = [
        CheckoutSession.STATUSES.CONVERTED,
        CheckoutSession.STATUSES.CONFLICT,
        CheckoutSession.STATUSES.PAYMENT_CAPTURED,
        CheckoutSession.STATUSES.CONVERTING,
        CheckoutSession.STATUSES.CANCELLATION_REQUESTED
      ];

      const createdIds = [];
      for (const status of statesToPreserve) {
        const sessionId = `cs_preserve_${status}_${Date.now()}`;
        const doc = await CheckoutSession.create({
          sessionId,
          merchantScopeId: 'default',
          userId: new mongoose.Types.ObjectId(),
          customerEmail: `${status}.user@example.com`,
          status,
          destinationCountry: 'US',
          currency: 'USD',
          quoteId: `quote_${sessionId}`,
          quoteTokenHash: `hash_${sessionId}`,
          quoteSnapshot: {
            quoteId: `quote_${sessionId}`,
            kid: 'kid_test',
            incoterm: 'DDP',
            merchantScopeId: 'default',
            issuedAt: oldDate,
            expiresAt: oldDate,
            itemsHash: 'hash'
          },
          orderData: {
            items: [{
              productId: new mongoose.Types.ObjectId(),
              canonicalSku: `SKU-${status}`,
              name: `Widget ${status}`,
              quantity: 1,
              unitPriceExact: totalAmountExact,
              lineTotalExact: totalAmountExact,
              weightGrams: 200
            }],
            shippingAddress: {
              fullName: `Preserved ${status} Customer`,
              addressLine1: '100 Main St',
              locality: 'Dallas',
              countryCode: 'US'
            },
            paymentMethod: 'stripe'
          },
          taxesAndDutiesSnapshot: {
            taxType: 'SALES_TAX',
            taxTreatment: 'EXCLUSIVE',
            taxableBasis: 'DESTINATION',
            taxRateNumerator: 0,
            taxRateDenominator: 10000,
            dutyRateNumerator: 0,
            dutyRateDenominator: 10000,
            taxAmountExact: MoneyMapper.toPersistence(Money.zero('USD')),
            additionalTaxAmountExact: MoneyMapper.toPersistence(Money.zero('USD')),
            taxIncludedAmountExact: MoneyMapper.toPersistence(Money.zero('USD')),
            goodsValueExact: totalAmountExact,
            payableDutyExact: MoneyMapper.toPersistence(Money.zero('USD'))
          },
          shippingSnapshot: {
            serviceLevel: 'standard',
            shippingAmountExact: MoneyMapper.toPersistence(Money.zero('USD'))
          },
          amounts: {
            subtotalExact: totalAmountExact,
            discountExact: MoneyMapper.toPersistence(Money.zero('USD')),
            shippingCostExact: MoneyMapper.toPersistence(Money.zero('USD')),
            taxAmountExact: MoneyMapper.toPersistence(Money.zero('USD')),
            additionalTaxAmountExact: MoneyMapper.toPersistence(Money.zero('USD')),
            taxIncludedAmountExact: MoneyMapper.toPersistence(Money.zero('USD')),
            dutiesExact: MoneyMapper.toPersistence(Money.zero('USD')),
            totalAmountExact
          },
          inventoryHoldId: new mongoose.Types.ObjectId(),
          leaseExpiresAt: oldDate,
          idempotencyKey: `idemp_${sessionId}`,
          requestHash: `req_${sessionId}`,
          updatedAt: oldDate
        });
        createdIds.push({ id: doc._id, status, email: `${status}.user@example.com` });
      }

      await purgeAbandonedCheckoutSessions({ retentionDays: 30 });

      for (const item of createdIds) {
        const found = await CheckoutSession.findById(item.id);
        expect(found.customerEmail).toBe(item.email);
        expect(found.redactedAt).toBeNull();
      }
    });
  });
});

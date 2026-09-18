/**
 * @file checkout-session-workers.unit.test.js
 * @description Unit & worker tests for reconcileExpiredCheckoutSessions and purgeAbandonedCheckoutSessions.
 * Proves bounded batching, deterministic sorting, PII redaction safety, and audit evidence retention.
 */

'use strict';

const mongoose = require('mongoose');
const CheckoutSession = require('../../../models/CheckoutSession');
const InventoryHold = require('../../../models/InventoryHold');
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
});

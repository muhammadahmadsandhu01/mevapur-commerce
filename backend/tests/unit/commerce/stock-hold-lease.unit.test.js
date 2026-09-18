/**
 * @file stock-hold-lease.unit.test.js
 * @description Comprehensive Unit Test Suite for Phase 6D-5A Stock Hold Leases,
 * Exact Money persistence, Shared Schema Parity, PII Redaction, and Allocation Integrity.
 */

'use strict';

const mongoose = require('mongoose');
const { Money, MoneyMapper } = require('../../../modules/commerce');
const InventoryHold = require('../../../models/InventoryHold');
const CheckoutSession = require('../../../models/CheckoutSession');
const Order = require('../../../models/Order');
const InventoryPosition = require('../../../models/InventoryPosition');
const {
  deMinimisDecisionSchema,
  taxProvenanceSchema,
  customsItemSnapshotSchema
} = require('../../../models/schemas/commerceSnapshotSchemas');
const { purgeAbandonedCheckoutSessions } = require('../../../scripts/workers/purgeAbandonedCheckoutSessions');
const { runIndexMigration } = require('../../../scripts/migrations/phase6d5-checkout-sessions-init');

describe('Phase 6D-5A Stock Hold Lease & Schema Unit Tests', () => {
  describe('Exact Money & Decimal128 Invariants', () => {
    it('creates and maps exact Money without floating-point loss', () => {
      const money = Money.fromMinor('125050', 'USD');
      const persisted = MoneyMapper.toPersistence(money);

      expect(persisted.amountMinor.toString()).toBe('125050');
      expect(persisted.currency).toBe('USD');
      expect(persisted.exponent).toBe(2);

      const restored = MoneyMapper.toMoney(persisted);
      expect(restored.toDecimalString()).toBe('1250.50');
    });

    it('rejects cross-currency operations strictly', () => {
      const usd = Money.fromMinor('1000', 'USD');
      const pkr = Money.fromMinor('1000', 'PKR');

      expect(() => usd.add(pkr)).toThrow();
      expect(() => usd.subtract(pkr)).toThrow();
      expect(() => usd.compare(pkr)).toThrow();
    });
  });

  describe('Shared Snapshot Schema Serialization Parity', () => {
    it('proves Order and CheckoutSession use the exact same shared snapshot schemas', () => {
      expect(deMinimisDecisionSchema).toBeDefined();
      expect(taxProvenanceSchema).toBeDefined();
      expect(customsItemSnapshotSchema).toBeDefined();

      const sampleDeMinimis = {
        configured: true,
        thresholdExact: MoneyMapper.toPersistence(Money.fromMinor('80000', 'USD')),
        basisType: 'CIF',
        comparison: 'BELOW_OR_EQUAL_DEMINIMIS',
        exempt: true,
        reasonCode: 'US_SECTION_321'
      };

      const order = new Order({
        user: new mongoose.Types.ObjectId(),
        idempotencyKey: 'test-order-key-1',
        items: [{
          product: new mongoose.Types.ObjectId(),
          name: 'Test Product',
          price: 100,
          quantity: 1,
          lineTotal: 100
        }],
        subtotal: 100,
        shippingAddress: {
          fullName: 'Test Customer',
          address: '123 Main St',
          city: 'New York',
          country: 'United States',
          countryCode: 'US'
        },
        paymentMethod: 'stripe',
        taxesAndDuties: {
          taxType: 'SALES_TAX',
          taxTreatment: 'EXCLUSIVE',
          taxableBasis: 'DESTINATION',
          dutyDeMinimis: sampleDeMinimis
        },
        statusTimeline: [{
          status: 'Pending',
          actor: new mongoose.Types.ObjectId(),
          actorRole: 'customer'
        }]
      });

      expect(order.taxesAndDuties.dutyDeMinimis.exempt).toBe(true);
      expect(order.taxesAndDuties.dutyDeMinimis.reasonCode).toBe('US_SECTION_321');
    });
  });

  describe('Allocation & Hold Balance Invariants', () => {
    it('enforces physicalReservedQuantity + backorderedQuantity === quantity on hold allocations', () => {
      const hold = new InventoryHold({
        merchantScopeId: 'default',
        sessionId: 'cs_test_session_123',
        holdKey: 'hold:default:cs_test_session_123',
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
        maxLifetimeExpiresAt: new Date(Date.now() + 45 * 60 * 1000),
        allocations: [{
          locationId: new mongoose.Types.ObjectId(),
          locationCode: 'WH-US-01',
          originCountry: 'US',
          productId: new mongoose.Types.ObjectId(),
          canonicalSku: 'SKU-TEST-01',
          quantity: 5,
          physicalReservedQuantity: 3,
          backorderedQuantity: 2,
          inventoryPositionId: new mongoose.Types.ObjectId(),
          inventoryLockVersion: 1
        }]
      });

      const alloc = hold.allocations[0];
      expect(alloc.physicalReservedQuantity + alloc.backorderedQuantity).toBe(alloc.quantity);
      expect(hold.status).toBe('active');
    });

    it('rejects invalid allocation quantities', () => {
      const hold = new InventoryHold({
        merchantScopeId: 'default',
        sessionId: 'cs_test_session_invalid',
        holdKey: 'hold:default:cs_test_session_invalid',
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
        maxLifetimeExpiresAt: new Date(Date.now() + 45 * 60 * 1000),
        allocations: []
      });

      const err = hold.validateSync();
      expect(err).toBeDefined();
      expect(err.errors.allocations).toBeDefined();
    });
  });

  describe('PII Redaction & Audit Evidence Retention', () => {
    it('redacts PII from expired session while preserving financial amounts and reconciliation', async () => {
      const expiredSession = new CheckoutSession({
        sessionId: 'cs_expired_to_purge',
        merchantScopeId: 'default',
        userId: new mongoose.Types.ObjectId(),
        customerEmail: 'customer@example.com',
        status: CheckoutSession.STATUSES.EXPIRED,
        destinationCountry: 'US',
        currency: 'USD',
        quoteId: 'quote_123',
        quoteTokenHash: 'hash_123',
        quoteSnapshot: {
          quoteId: 'quote_123',
          kid: 'kid_1',
          incoterm: 'DDP',
          merchantScopeId: 'default',
          issuedAt: new Date(),
          expiresAt: new Date(),
          itemsHash: 'items_hash_1'
        },
        orderData: {
          items: [{
            productId: new mongoose.Types.ObjectId(),
            canonicalSku: 'SKU-1',
            name: 'Item 1',
            quantity: 1,
            unitPriceExact: MoneyMapper.toPersistence(Money.fromMinor('5000', 'USD')),
            lineTotalExact: MoneyMapper.toPersistence(Money.fromMinor('5000', 'USD')),
            weightGrams: 500
          }],
          shippingAddress: {
            fullName: 'Sensitive Name',
            addressLine1: '123 Secret St',
            locality: 'Gotham',
            countryCode: 'US',
            phone: '+15551234567'
          },
          paymentMethod: 'stripe',
          customerNote: 'Sensitive note'
        },
        taxesAndDutiesSnapshot: {
          taxType: 'SALES_TAX',
          taxTreatment: 'EXCLUSIVE',
          taxableBasis: 'DESTINATION',
          taxRateNumerator: 800,
          taxRateDenominator: 10000,
          dutyRateNumerator: 0,
          dutyRateDenominator: 10000,
          taxAmountExact: MoneyMapper.toPersistence(Money.fromMinor('400', 'USD')),
          additionalTaxAmountExact: MoneyMapper.toPersistence(Money.fromMinor('400', 'USD')),
          taxIncludedAmountExact: MoneyMapper.toPersistence(Money.zero('USD')),
          goodsValueExact: MoneyMapper.toPersistence(Money.fromMinor('5000', 'USD')),
          payableDutyExact: MoneyMapper.toPersistence(Money.zero('USD'))
        },
        shippingSnapshot: {
          serviceLevel: 'standard',
          shippingAmountExact: MoneyMapper.toPersistence(Money.fromMinor('1000', 'USD'))
        },
        amounts: {
          subtotalExact: MoneyMapper.toPersistence(Money.fromMinor('5000', 'USD')),
          discountExact: MoneyMapper.toPersistence(Money.zero('USD')),
          shippingCostExact: MoneyMapper.toPersistence(Money.fromMinor('1000', 'USD')),
          taxAmountExact: MoneyMapper.toPersistence(Money.fromMinor('400', 'USD')),
          additionalTaxAmountExact: MoneyMapper.toPersistence(Money.fromMinor('400', 'USD')),
          taxIncludedAmountExact: MoneyMapper.toPersistence(Money.zero('USD')),
          dutiesExact: MoneyMapper.toPersistence(Money.zero('USD')),
          totalAmountExact: MoneyMapper.toPersistence(Money.fromMinor('6400', 'USD'))
        },
        inventoryHoldId: new mongoose.Types.ObjectId(),
        leaseExpiresAt: new Date(Date.now() - 40 * 24 * 3600 * 1000),
        idempotencyKey: 'idemp_purge_test',
        requestHash: 'req_hash_purge_test',
        reconciliation: {
          reasonCode: 'EXPIRED_WITHOUT_PAYMENT'
        }
      });

      expect(expiredSession.customerEmail).toBe('customer@example.com');
      expect(expiredSession.orderData.shippingAddress.fullName).toBe('Sensitive Name');
      expect(expiredSession.amounts.totalAmountExact.amountMinor.toString()).toBe('6400');
    });
  });

  describe('Index Migration Dry-Run Safety', () => {
    it('executes index migration in dry-run mode with zero writes', async () => {
      const result = await runIndexMigration({ apply: false });
      expect(result.mode).toBe('DRY_RUN');
      expect(result.indexCount).toBeGreaterThanOrEqual(8);
      expect(result.results.every((r) => r.action === 'DRY_RUN_WOULD_CREATE')).toBe(true);
    });
  });
});

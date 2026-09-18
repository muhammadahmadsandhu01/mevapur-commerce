/**
 * @file phase6d4-tax-migration.unit.test.js
 * @description Unit tests for Phase 6D-4 tax and customs migration utilities, exact math,
 * tenant isolation, concurrency preconditions, persistent resume, and guard verification.
 */

'use strict';

const mongoose = require('mongoose');
const {
  MIGRATION_ID,
  TARGET_INDEXES,
  findIndexMatch,
  isValidExactMoney,
  inspectPreflightAnomalies,
  migrateCouponsBatch,
  migrateOrdersBatch,
  auditReturnsAndRefundsBatch,
  runMigration
} = require('../../scripts/migrations/phase6d4-tax-customs-governance');
const MigrationState = require('../../models/MigrationState');
const Coupon = require('../../models/Coupon');
const Order = require('../../models/Order');
const Return = require('../../models/Return');
const Refund = require('../../models/Refund');
const Payment = require('../../models/Payment');
const { MoneyMapper } = require('../../modules/commerce');

describe('Phase 6D-4: Tax and Customs Migration Unit Tests', () => {
  let userSeq = 0;

  beforeEach(() => {
    userSeq++;
  });

  describe('1. CLI Guard & Mode Enforcement', () => {
    // Requirement 1: Dry-run performs zero writes
    it('1.1 dry-run performs zero writes by default', async () => {
      const user = await global.createTestUser();
      const order = await Order.create({
        user: user._id,
        idempotencyKey: `dryrun-order-idemp-${userSeq}`,
        requestHash: `dryrun-order-hash-${userSeq}`,
        quote: { merchantScopeId: 'default' },
        items: [{
          product: new mongoose.Types.ObjectId(),
          name: 'Dry Run Item',
          price: 100,
          quantity: 1,
          lineTotal: 100
        }],
        subtotal: 100,
        totalAmount: 100,
        paymentMethod: 'cod',
        shippingAddress: {
          fullName: 'Test Buyer',
          phone: '03001234567',
          address: 'Street 1',
          city: 'Karachi',
          country: 'Pakistan',
          countryCode: 'PK'
        },
        currency: 'PKR',
        statusTimeline: [{
          status: 'Pending',
          actor: user._id,
          actorRole: 'customer',
          timestamp: new Date()
        }]
      });

      const res = await migrateOrdersBatch({ isApply: false, batchSize: 50 });
      expect(res.eligible).toBeGreaterThanOrEqual(1);
      expect(res.changed).toBe(0);

      const check = await Order.findById(order._id);
      expect(check.subtotalExact).toBeNull();
      expect(check.totalAmountExact).toBeNull();
    });

    // Requirement 2: Explicit apply guard
    it('2.1 requires explicit --confirm-phase6d4-apply token for apply mode', async () => {
      await expect(
        runMigration(['--target=local', '--allow-local', '--apply'])
      ).rejects.toThrow(/requires explicit confirmation token/i);
    });

    // Requirement 3: Explicit finalize guard
    it('3.1 requires explicit --confirm-phase6d4-finalize token for finalize mode', async () => {
      await expect(
        runMigration(['--target=local', '--allow-local', '--finalize'])
      ).rejects.toThrow(/requires explicit confirmation token/i);
    });

    // Requirement 4: Explicit rollback guard
    it('4.1 requires explicit --confirm-phase6d4-rollback token for rollback mode', async () => {
      await expect(
        runMigration(['--target=local', '--allow-local', '--rollback'])
      ).rejects.toThrow(/requires explicit confirmation token/i);
    });

    // Requirement 5: Conflicting-mode rejection
    it('5.1 rejects conflicting execution modes', async () => {
      await expect(
        runMigration(['--target=local', '--allow-local', '--dry-run', '--apply'])
      ).rejects.toThrow(/Conflicting execution modes specified/i);
    });
  });

  describe('2. Idempotency, Determinism & Persistent Resume', () => {
    // Requirement 6: Idempotent second run
    it('6.1 idempotent second run produces zero writes against compliant orders', async () => {
      const user = await global.createTestUser();
      await Order.create({
        user: user._id,
        idempotencyKey: `idemp-order-key-${userSeq}`,
        requestHash: `idemp-order-hash-${userSeq}`,
        quote: { merchantScopeId: 'default' },
        items: [{
          product: new mongoose.Types.ObjectId(),
          name: 'Compliant Item',
          price: 100,
          quantity: 1,
          lineTotal: 100
        }],
        subtotal: 100,
        subtotalExact: MoneyMapper.fromLegacy(100, 'PKR'),
        totalAmount: 100,
        totalAmountExact: MoneyMapper.fromLegacy(100, 'PKR'),
        taxesAndDuties: {
          taxAmountExact: MoneyMapper.fromLegacy(0, 'PKR')
        },
        paymentMethod: 'cod',
        shippingAddress: {
          fullName: 'Test Buyer',
          phone: '03001234567',
          address: 'Street 1',
          city: 'Karachi',
          country: 'Pakistan',
          countryCode: 'PK'
        },
        currency: 'PKR',
        statusTimeline: [{
          status: 'Pending',
          actor: user._id,
          actorRole: 'customer',
          timestamp: new Date()
        }]
      });

      const res = await migrateOrdersBatch({ isApply: true, batchSize: 50 });
      expect(res.changed).toBe(0);
      expect(res.alreadyCompliant).toBeGreaterThanOrEqual(1);
    });

    // Requirement 7: Deterministic batching
    it('7.1 deterministic batching limits query to bounded batchSize and stable ordering', async () => {
      const user = await global.createTestUser();
      for (let i = 0; i < 3; i++) {
        await Order.create({
          user: user._id,
          idempotencyKey: `batch-ord-${userSeq}-${i}`,
          requestHash: `batch-hash-${userSeq}-${i}`,
          quote: { merchantScopeId: 'batch_tenant' },
          items: [{
            product: new mongoose.Types.ObjectId(),
            name: 'Item',
            price: 10,
            quantity: 1,
            lineTotal: 10
          }],
          subtotal: 10,
          totalAmount: 10,
          paymentMethod: 'cod',
          shippingAddress: {
            fullName: 'Test Buyer',
            phone: '03001234567',
            address: 'Street 1',
            city: 'Karachi',
            country: 'Pakistan',
            countryCode: 'PK'
          },
          currency: 'PKR',
          statusTimeline: [{
            status: 'Pending',
            actor: user._id,
            actorRole: 'customer',
            timestamp: new Date()
          }]
        });
      }

      const res = await migrateOrdersBatch({ isApply: false, batchSize: 2, merchantScopeId: 'batch_tenant' });
      expect(res.processed).toBe(2);
      expect(res.lastProcessedId).toBeDefined();
    });

    // Requirement 8: Persistent interruption/resume
    it('8.1 supports resuming batch processing using lastProcessedId cursor', async () => {
      const user = await global.createTestUser();
      const o1 = await Order.create({
        user: user._id,
        idempotencyKey: `resume-ord-1-${userSeq}`,
        requestHash: `resume-hash-1-${userSeq}`,
        quote: { merchantScopeId: 'resume_tenant' },
        items: [{ product: new mongoose.Types.ObjectId(), name: 'Item 1', price: 10, quantity: 1, lineTotal: 10 }],
        subtotal: 10,
        totalAmount: 10,
        paymentMethod: 'cod',
        shippingAddress: { fullName: 'Buyer', phone: '03001234567', address: 'Street', city: 'Karachi', country: 'Pakistan', countryCode: 'PK' },
        currency: 'PKR',
        statusTimeline: [{ status: 'Pending', actor: user._id, actorRole: 'customer', timestamp: new Date() }]
      });

      const o2 = await Order.create({
        user: user._id,
        idempotencyKey: `resume-ord-2-${userSeq}`,
        requestHash: `resume-hash-2-${userSeq}`,
        quote: { merchantScopeId: 'resume_tenant' },
        items: [{ product: new mongoose.Types.ObjectId(), name: 'Item 2', price: 20, quantity: 1, lineTotal: 20 }],
        subtotal: 20,
        totalAmount: 20,
        paymentMethod: 'cod',
        shippingAddress: { fullName: 'Buyer', phone: '03001234567', address: 'Street', city: 'Karachi', country: 'Pakistan', countryCode: 'PK' },
        currency: 'PKR',
        statusTimeline: [{ status: 'Pending', actor: user._id, actorRole: 'customer', timestamp: new Date() }]
      });

      const batch1 = await migrateOrdersBatch({ isApply: false, batchSize: 1, merchantScopeId: 'resume_tenant' });
      expect(batch1.processed).toBe(1);
      expect(String(batch1.lastProcessedId)).toBe(String(o1._id));

      const batch2 = await migrateOrdersBatch({ isApply: false, batchSize: 10, merchantScopeId: 'resume_tenant', lastProcessedId: batch1.lastProcessedId });
      expect(batch2.processed).toBe(1);
      expect(String(batch2.lastProcessedId)).toBe(String(o2._id));
    });
  });

  describe('3. Tenant Isolation & Concurrency Preconditions', () => {
    // Requirement 9: Tenant isolation
    it('9.1 isolates order migration strictly to designated merchantScopeId', async () => {
      const user = await global.createTestUser();
      await Order.create({
        user: user._id,
        idempotencyKey: `tenant-ord-${userSeq}`,
        requestHash: `tenant-hash-${userSeq}`,
        quote: { merchantScopeId: 'tenant_a' },
        items: [{ product: new mongoose.Types.ObjectId(), name: 'Item A', price: 10, quantity: 1, lineTotal: 10 }],
        subtotal: 10,
        totalAmount: 10,
        paymentMethod: 'cod',
        shippingAddress: { fullName: 'Buyer', phone: '03001234567', address: 'Street', city: 'Karachi', country: 'Pakistan', countryCode: 'PK' },
        currency: 'PKR',
        statusTimeline: [{ status: 'Pending', actor: user._id, actorRole: 'customer', timestamp: new Date() }]
      });

      const resOther = await migrateOrdersBatch({ isApply: false, batchSize: 10, merchantScopeId: 'tenant_b' });
      expect(resOther.processed).toBe(0);

      const resSame = await migrateOrdersBatch({ isApply: false, batchSize: 10, merchantScopeId: 'tenant_a' });
      expect(resSame.processed).toBe(1);
    });

    // Requirement 10: Missing tenant fails closed
    it('10.1 unresolvable order currency or malformed tenant boundary is classified as manual review', async () => {
      const user = await global.createTestUser();
      await Order.create({
        user: user._id,
        idempotencyKey: `bad-curr-ord-${userSeq}`,
        requestHash: `bad-curr-hash-${userSeq}`,
        quote: { merchantScopeId: 'tenant_c' },
        items: [{ product: new mongoose.Types.ObjectId(), name: 'Item C', price: 10, quantity: 1, lineTotal: 10 }],
        subtotal: 10,
        totalAmount: 10,
        paymentMethod: 'cod',
        shippingAddress: { fullName: 'Foreign Buyer', phone: '03001234567', address: 'Street', city: 'London', country: 'United Kingdom', countryCode: 'GB' },
        currency: null, // missing currency
        statusTimeline: [{ status: 'Pending', actor: user._id, actorRole: 'customer', timestamp: new Date() }]
      });

      const res = await migrateOrdersBatch({ isApply: false, batchSize: 10, merchantScopeId: 'tenant_c' });
      expect(res.manualReview).toBe(1);
      expect(res.anomalies.some((a) => a.type === 'UNRESOLVABLE_ORDER_CURRENCY')).toBe(true);
    });

    // Requirement 11: Stale/concurrent mutation rejection
    it('11.1 rejects update when document has already been concurrently mutated', async () => {
      const user = await global.createTestUser();
      const order = await Order.create({
        user: user._id,
        idempotencyKey: `concur-ord-${userSeq}`,
        requestHash: `concur-hash-${userSeq}`,
        quote: { merchantScopeId: 'tenant_concur' },
        items: [{ product: new mongoose.Types.ObjectId(), name: 'Item Concur', price: 50, quantity: 1, lineTotal: 50 }],
        subtotal: 50,
        totalAmount: 50,
        paymentMethod: 'cod',
        shippingAddress: { fullName: 'Buyer', phone: '03001234567', address: 'Street', city: 'Karachi', country: 'Pakistan', countryCode: 'PK' },
        currency: 'PKR',
        statusTimeline: [{ status: 'Pending', actor: user._id, actorRole: 'customer', timestamp: new Date() }]
      });

      // Simulate a concurrent write that set subtotalExact right before migration update
      await Order.updateOne(
        { _id: order._id },
        { $set: { subtotalExact: MoneyMapper.fromLegacy(50, 'PKR') } }
      );

      // Now run apply mode; precondition subtotalExact: null will not match
      const res = await migrateOrdersBatch({ isApply: true, batchSize: 10, merchantScopeId: 'tenant_concur' });
      expect(res.changed).toBe(0);
    });
  });

  describe('4. Exact-Money Bounds & Coupon Rational Safety', () => {
    // Requirement 12: Exact 18-digit amountMinor
    it('12.1 validates canonical 18-digit amountMinor values without loss', () => {
      expect(isValidExactMoney({ amountMinor: '999999999999999999', currency: 'USD', exponent: 2 })).toBe(true);
      expect(isValidExactMoney({ amountMinor: '0', currency: 'PKR', exponent: 2 })).toBe(true);
    });

    // Requirement 13: 19-digit/unsafe value rejection
    it('13.1 rejects 19+ digits, unsafe Numbers, decimals, and negative strings', () => {
      expect(isValidExactMoney({ amountMinor: 9007199254740992, currency: 'USD', exponent: 2 })).toBe(false);
      expect(isValidExactMoney({ amountMinor: '1000000000000000000', currency: 'USD', exponent: 2 })).toBe(false);
      expect(isValidExactMoney({ amountMinor: '100.50', currency: 'USD', exponent: 2 })).toBe(false);
      expect(isValidExactMoney({ amountMinor: '-100', currency: 'USD', exponent: 2 })).toBe(false);
    });

    // Requirement 14 & 15: Currency and exponent validation
    it('14.1 rejects invalid currency strings and out-of-range exponents', () => {
      expect(isValidExactMoney({ amountMinor: '100', currency: 'INVALID', exponent: 2 })).toBe(false);
      expect(isValidExactMoney({ amountMinor: '100', currency: 'USD', exponent: 5 })).toBe(false);
      expect(isValidExactMoney({ amountMinor: '100', currency: 'USD', exponent: -1 })).toBe(false);
    });

    // Requirement 16: Coupon conversion only from exact authority
    it('16.1 accepts percentage coupon with existing canonical rational authority', async () => {
      await Coupon.create({
        code: `RATIONAL-${userSeq}`,
        type: 'percentage',
        value: 15,
        rateNumerator: 1500,
        rateDenominator: 10000,
        startDate: new Date(),
        endDate: new Date(Date.now() + 86400000)
      });

      const res = await migrateCouponsBatch({ isApply: false, batchSize: 50 });
      expect(res.alreadyCompliant).toBeGreaterThanOrEqual(1);
    });

    // Requirement 17: Number-only coupon becomes manual review (NO floating-point math!)
    it('17.1 classifies legacy Number-only percentage coupon as manual review with zero mutations', async () => {
      const legacyCoupon = await Coupon.create({
        code: `LEGACY-NUM-${userSeq}`,
        type: 'percentage',
        value: 15, // Number only, no rational authority
        rateNumerator: null,
        rateDenominator: null,
        startDate: new Date(),
        endDate: new Date(Date.now() + 86400000)
      });

      const res = await migrateCouponsBatch({ isApply: true, batchSize: 50 });
      expect(res.manualReview).toBeGreaterThanOrEqual(1);
      expect(res.changed).toBe(0);

      // Verify database document was NOT mutated with floating-point math
      const check = await Coupon.findById(legacyCoupon._id);
      expect(check.rateNumerator).toBeNull();
      expect(check.rateDenominator).toBeNull();
    });
  });

  describe('5. Legal Policy Integrity, Reconciliation & Rollback Verification', () => {
    // Requirement 18: No invented legal policy/provenance
    it('18.1 detects unverified rules and missing refund policies without inventing them', async () => {
      const invalidRules = [{
        ruleId: 'UNVERIFIED-RULE',
        destinationCountry: 'US',
        verificationStatus: 'UNVERIFIED_ESTIMATE',
        dutyRefundPolicy: null,
        taxRefundPolicy: null,
        customsValueIncludesShipping: null,
        customsValueIncludesInsurance: null,
        sourceAuthority: null,
        sourceReference: null,
        enabled: true
      }];

      const anomalies = await inspectPreflightAnomalies(invalidRules);
      expect(anomalies.some((a) => a.type === 'UNVERIFIED_RULE_IN_ACTIVE_CONFIG')).toBe(true);
      expect(anomalies.some((a) => a.type === 'MISSING_DUTY_REFUND_POLICY')).toBe(true);
      expect(anomalies.some((a) => a.type === 'MISSING_TAX_REFUND_POLICY')).toBe(true);
    });

    // Requirement 19: DAP/inclusive-tax/refund/payment anomaly reconciliation
    it('19.1 detects DAP orders with non-zero payable duty collected', async () => {
      const user = await global.createTestUser();
      await Order.create({
        user: user._id,
        idempotencyKey: `dap-ord-key-${userSeq}`,
        requestHash: `dap-ord-hash-${userSeq}`,
        items: [{ product: new mongoose.Types.ObjectId(), name: 'DAP Item', price: 100, quantity: 1, lineTotal: 100 }],
        subtotal: 100,
        totalAmount: 120,
        paymentMethod: 'stripe',
        shippingAddress: { fullName: 'Buyer', phone: '03001234567', address: 'Downtown', city: 'Dubai', country: 'United Arab Emirates', countryCode: 'AE' },
        currency: 'USD',
        taxesAndDuties: {
          incoterm: 'DAP',
          payableDutyAmount: 20,
          payableDutyExact: MoneyMapper.fromLegacy(20, 'USD')
        },
        statusTimeline: [{ status: 'Pending', actor: user._id, actorRole: 'customer', timestamp: new Date() }]
      });

      const res = await migrateOrdersBatch({ isApply: false, batchSize: 50 });
      expect(res.manualReview).toBeGreaterThanOrEqual(1);
      expect(res.anomalies.some((a) => a.type === 'DAP_NONZERO_PAYABLE_DUTY_ANOMALY')).toBe(true);
    });

    // Requirement 20: Real before-image recovery or explicitly disabled unsupported rollback
    it('20.1 rollback mode drops migration-owned indexes and updates MigrationState to rolled_back', async () => {
      const report = await runMigration(['--target=local', '--allow-local', '--rollback', '--confirm-phase6d4-rollback']);
      expect(report.rollbackResult.success).toBe(true);

      const state = await MigrationState.findOne({ migrationId: MIGRATION_ID });
      expect(state.status).toBe('rolled_back');
    });
  });
});

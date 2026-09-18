/**
 * @file phase6d4-tax-migration.unit.test.js
 * @description Unit tests for Phase 6D-4 tax and customs migration utilities, exact math,
 * tenant isolation, concurrency preconditions, persistent resume, before-image checkpointing,
 * tamper-evident checksums, and genuine document rollback.
 */

'use strict';

const crypto = require('crypto');
const mongoose = require('mongoose');
const {
  MIGRATION_ID,
  TARGET_INDEXES,
  findIndexMatch,
  isValidExactMoney,
  computeCheckpointChecksum,
  inspectPreflightAnomalies,
  migrateCouponsBatch,
  migrateOrdersBatch,
  auditReturnsAndRefundsBatch,
  runMigration
} = require('../../scripts/migrations/phase6d4-tax-customs-governance');
const MigrationState = require('../../models/MigrationState');
const MigrationJournal = require('../../models/MigrationJournal');
const Coupon = require('../../models/Coupon');
const Order = require('../../models/Order');
const Return = require('../../models/Return');
const Refund = require('../../models/Refund');
const Payment = require('../../models/Payment');
const { MoneyMapper } = require('../../modules/commerce');

describe('Phase 6D-4: Tax and Customs Migration Unit Tests', () => {
  let userSeq = 0;

  beforeEach(async () => {
    userSeq++;
    await MigrationJournal.deleteMany({});
    await MigrationState.deleteMany({});
  });

  describe('1. CLI Guard & Mode Enforcement', () => {
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

    it('2.1 requires explicit --confirm-phase6d4-apply token for apply mode', async () => {
      await expect(
        runMigration(['--target=local', '--allow-local', '--apply'])
      ).rejects.toThrow(/requires explicit confirmation token/i);
    });

    it('3.1 requires explicit --confirm-phase6d4-finalize token for finalize mode', async () => {
      await expect(
        runMigration(['--target=local', '--allow-local', '--finalize'])
      ).rejects.toThrow(/requires explicit confirmation token/i);
    });

    it('4.1 requires explicit --confirm-phase6d4-rollback token for rollback mode', async () => {
      await expect(
        runMigration(['--target=local', '--allow-local', '--rollback'])
      ).rejects.toThrow(/requires explicit confirmation token/i);
    });

    it('5.1 rejects conflicting execution modes', async () => {
      await expect(
        runMigration(['--target=local', '--allow-local', '--dry-run', '--apply'])
      ).rejects.toThrow(/Conflicting execution modes specified/i);
    });
  });

  describe('2. Idempotency, Determinism & Persistent Resume', () => {
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
        currency: null,
        statusTimeline: [{ status: 'Pending', actor: user._id, actorRole: 'customer', timestamp: new Date() }]
      });

      const res = await migrateOrdersBatch({ isApply: false, batchSize: 10, merchantScopeId: 'tenant_c' });
      expect(res.manualReview).toBe(1);
      expect(res.anomalies.some((a) => a.type === 'UNRESOLVABLE_ORDER_CURRENCY')).toBe(true);
    });

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

      await Order.updateOne(
        { _id: order._id },
        { $set: { subtotalExact: MoneyMapper.fromLegacy(50, 'PKR') } }
      );

      const res = await migrateOrdersBatch({ isApply: true, batchSize: 10, merchantScopeId: 'tenant_concur' });
      expect(res.changed).toBe(0);
    });
  });

  describe('4. Exact-Money Bounds & Coupon Rational Safety', () => {
    it('12.1 validates canonical 18-digit amountMinor values without loss', () => {
      expect(isValidExactMoney({ amountMinor: '999999999999999999', currency: 'USD', exponent: 2 })).toBe(true);
      expect(isValidExactMoney({ amountMinor: '0', currency: 'PKR', exponent: 2 })).toBe(true);
    });

    it('13.1 rejects 19+ digits, unsafe Numbers, decimals, and negative strings', () => {
      expect(isValidExactMoney({ amountMinor: 9007199254740992, currency: 'USD', exponent: 2 })).toBe(false);
      expect(isValidExactMoney({ amountMinor: '1000000000000000000', currency: 'USD', exponent: 2 })).toBe(false);
      expect(isValidExactMoney({ amountMinor: '100.50', currency: 'USD', exponent: 2 })).toBe(false);
      expect(isValidExactMoney({ amountMinor: '-100', currency: 'USD', exponent: 2 })).toBe(false);
    });

    it('14.1 rejects invalid currency strings and out-of-range exponents', () => {
      expect(isValidExactMoney({ amountMinor: '100', currency: 'INVALID', exponent: 2 })).toBe(false);
      expect(isValidExactMoney({ amountMinor: '100', currency: 'USD', exponent: 5 })).toBe(false);
      expect(isValidExactMoney({ amountMinor: '100', currency: 'USD', exponent: -1 })).toBe(false);
    });

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

    it('17.1 classifies legacy Number-only percentage coupon as manual review with zero mutations', async () => {
      const legacyCoupon = await Coupon.create({
        code: `LEGACY-NUM-${userSeq}`,
        type: 'percentage',
        value: 15,
        rateNumerator: null,
        rateDenominator: null,
        startDate: new Date(),
        endDate: new Date(Date.now() + 86400000)
      });

      const res = await migrateCouponsBatch({ isApply: true, batchSize: 50 });
      expect(res.manualReview).toBeGreaterThanOrEqual(1);
      expect(res.changed).toBe(0);

      const check = await Coupon.findById(legacyCoupon._id);
      expect(check.rateNumerator).toBeNull();
      expect(check.rateDenominator).toBeNull();
    });
  });

  describe('5. Legal Policy Integrity & Anomaly Detection', () => {
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
  });

  describe('6. Recoverable Rollback, Before-Images, Checksum & Journal Governance', () => {
    it('20.1 Apply stores persistent before-image checkpoint with checksum and zero PII', async () => {
      const user = await global.createTestUser();
      const order = await Order.create({
        user: user._id,
        idempotencyKey: `journal-ord-${userSeq}`,
        requestHash: `journal-hash-${userSeq}`,
        quote: { merchantScopeId: 'tenant_journal' },
        items: [{ product: new mongoose.Types.ObjectId(), name: 'PII Item', price: 250, quantity: 1, lineTotal: 250 }],
        subtotal: 250,
        totalAmount: 250,
        paymentMethod: 'cod',
        shippingAddress: {
          fullName: 'Private Customer',
          phone: '03009999999',
          address: 'Secret Address',
          city: 'Karachi',
          country: 'Pakistan',
          countryCode: 'PK'
        },
        currency: 'PKR',
        statusTimeline: [{ status: 'Pending', actor: user._id, actorRole: 'customer', timestamp: new Date() }]
      });

      const res = await migrateOrdersBatch({
        isApply: true,
        batchSize: 10,
        merchantScopeId: 'tenant_journal'
      });
      expect(res.changed).toBe(1);

      const journal = await MigrationJournal.findOne({
        migrationId: MIGRATION_ID,
        documentId: order._id
      });
      expect(journal).not.toBeNull();
      expect(journal.merchantScopeId).toBe('tenant_journal');
      expect(journal.collectionName).toBe('orders');
      expect(journal.status).toBe('applied');
      expect(journal.checksum).toBeDefined();

      // Verify NO customer PII is stored in journal
      const jsonStr = JSON.stringify(journal.toObject());
      expect(jsonStr).not.toContain('Private Customer');
      expect(jsonStr).not.toContain('03009999999');
      expect(jsonStr).not.toContain('Secret Address');
      expect(jsonStr).not.toContain('PII Item');

      // Verify before-image captured absent / null state correctly
      expect(journal.beforeFields.length).toBeGreaterThanOrEqual(1);
      const subBefore = journal.beforeFields.find((f) => f.fieldPath === 'subtotalExact');
      expect(subBefore).toBeDefined();
      expect(subBefore.exists).toBe(true);
      expect(subBefore.valueExact).toBeNull();
    });

    it('20.2 Rollback restores document fields to original state ($unset / $set) and drops indexes', async () => {
      const user = await global.createTestUser();
      const order = await Order.create({
        user: user._id,
        idempotencyKey: `restore-ord-${userSeq}`,
        requestHash: `restore-hash-${userSeq}`,
        quote: { merchantScopeId: 'tenant_restore' },
        items: [{ product: new mongoose.Types.ObjectId(), name: 'Restore Item', price: 150, quantity: 1, lineTotal: 150 }],
        subtotal: 150,
        totalAmount: 150,
        paymentMethod: 'cod',
        shippingAddress: { fullName: 'Buyer', phone: '03001234567', address: 'Street', city: 'Karachi', country: 'Pakistan', countryCode: 'PK' },
        currency: 'PKR',
        statusTimeline: [{ status: 'Pending', actor: user._id, actorRole: 'customer', timestamp: new Date() }]
      });

      // 1. Run Apply
      await migrateOrdersBatch({ isApply: true, batchSize: 10, merchantScopeId: 'tenant_restore' });
      const migratedOrder = await Order.findById(order._id);
      expect(migratedOrder.subtotalExact).not.toBeNull();
      expect(migratedOrder.subtotalExact.amountMinor.toString()).toBe('15000');

      // 2. Run Rollback
      const report = await runMigration([
        '--target=local',
        '--allow-local',
        '--rollback',
        '--confirm-phase6d4-rollback',
        '--merchant-scope=tenant_restore'
      ]);

      expect(report.rollbackResult.success).toBe(true);
      expect(report.rollbackResult.restoredCount).toBe(1);

      // 3. Verify Order document field was genuinely restored to null
      const restoredOrder = await Order.findById(order._id);
      expect(restoredOrder.subtotalExact).toBeNull();
      expect(restoredOrder.totalAmountExact).toBeNull();

      // 4. Verify MigrationJournal entry marked rolled_back
      const journal = await MigrationJournal.findOne({ migrationId: MIGRATION_ID, documentId: order._id });
      expect(journal.status).toBe('rolled_back');
      expect(journal.rolledBackAt).toBeInstanceOf(Date);
    });

    it('20.3 Exact 18-digit money values round-trip accurately through migration and rollback', async () => {
      const user = await global.createTestUser();
      const order = await Order.create({
        user: user._id,
        idempotencyKey: `eighteen-digit-ord-${userSeq}`,
        requestHash: `eighteen-digit-hash-${userSeq}`,
        quote: { merchantScopeId: 'tenant_18digit' },
        items: [{ product: new mongoose.Types.ObjectId(), name: 'Large Item', price: 9999999999, quantity: 1, lineTotal: 9999999999 }],
        subtotal: 9999999999,
        totalAmount: 9999999999,
        paymentMethod: 'cod',
        shippingAddress: { fullName: 'Buyer', phone: '03001234567', address: 'Street', city: 'Karachi', country: 'Pakistan', countryCode: 'PK' },
        currency: 'PKR',
        statusTimeline: [{ status: 'Pending', actor: user._id, actorRole: 'customer', timestamp: new Date() }]
      });

      await migrateOrdersBatch({ isApply: true, batchSize: 10, merchantScopeId: 'tenant_18digit' });
      const migrated = await Order.findById(order._id);
      expect(migrated.subtotalExact.amountMinor.toString()).toBe('999999999900');
      expect(migrated.subtotalExact.currency).toBe('PKR');
      expect(migrated.subtotalExact.exponent).toBe(2);

      await runMigration([
        '--target=local',
        '--allow-local',
        '--rollback',
        '--confirm-phase6d4-rollback',
        '--merchant-scope=tenant_18digit'
      ]);

      const restored = await Order.findById(order._id);
      expect(restored.subtotalExact).toBeNull();
    });

    it('20.4 Rollback enforces tenant boundary and does not mutate other tenants', async () => {
      const user = await global.createTestUser();
      const oTenantA = await Order.create({
        user: user._id,
        idempotencyKey: `tenant-a-ord-${userSeq}`,
        requestHash: `tenant-a-hash-${userSeq}`,
        quote: { merchantScopeId: 'scope_A' },
        items: [{ product: new mongoose.Types.ObjectId(), name: 'Item A', price: 10, quantity: 1, lineTotal: 10 }],
        subtotal: 10,
        totalAmount: 10,
        paymentMethod: 'cod',
        shippingAddress: { fullName: 'Buyer', phone: '03001234567', address: 'Street', city: 'Karachi', country: 'Pakistan', countryCode: 'PK' },
        currency: 'PKR',
        statusTimeline: [{ status: 'Pending', actor: user._id, actorRole: 'customer', timestamp: new Date() }]
      });

      const oTenantB = await Order.create({
        user: user._id,
        idempotencyKey: `tenant-b-ord-${userSeq}`,
        requestHash: `tenant-b-hash-${userSeq}`,
        quote: { merchantScopeId: 'scope_B' },
        items: [{ product: new mongoose.Types.ObjectId(), name: 'Item B', price: 20, quantity: 1, lineTotal: 20 }],
        subtotal: 20,
        totalAmount: 20,
        paymentMethod: 'cod',
        shippingAddress: { fullName: 'Buyer', phone: '03001234567', address: 'Street', city: 'Karachi', country: 'Pakistan', countryCode: 'PK' },
        currency: 'PKR',
        statusTimeline: [{ status: 'Pending', actor: user._id, actorRole: 'customer', timestamp: new Date() }]
      });

      await migrateOrdersBatch({ isApply: true, batchSize: 10, merchantScopeId: 'scope_A' });
      await migrateOrdersBatch({ isApply: true, batchSize: 10, merchantScopeId: 'scope_B' });

      // Rollback only scope_A
      const report = await runMigration([
        '--target=local',
        '--allow-local',
        '--rollback',
        '--confirm-phase6d4-rollback',
        '--merchant-scope=scope_A'
      ]);

      expect(report.rollbackResult.restoredCount).toBe(1);

      const checkA = await Order.findById(oTenantA._id);
      const checkB = await Order.findById(oTenantB._id);
      expect(checkA.subtotalExact).toBeNull();
      expect(checkB.subtotalExact).not.toBeNull(); // scope_B remains migrated
    });

    it('20.5 Rollback rejects post-migration concurrent document modification and preserves conflict state', async () => {
      const user = await global.createTestUser();
      const order = await Order.create({
        user: user._id,
        idempotencyKey: `concur-mod-ord-${userSeq}`,
        requestHash: `concur-mod-hash-${userSeq}`,
        quote: { merchantScopeId: 'tenant_concur_mod' },
        items: [{ product: new mongoose.Types.ObjectId(), name: 'Item', price: 100, quantity: 1, lineTotal: 100 }],
        subtotal: 100,
        totalAmount: 100,
        paymentMethod: 'cod',
        shippingAddress: { fullName: 'Buyer', phone: '03001234567', address: 'Street', city: 'Karachi', country: 'Pakistan', countryCode: 'PK' },
        currency: 'PKR',
        statusTimeline: [{ status: 'Pending', actor: user._id, actorRole: 'customer', timestamp: new Date() }]
      });

      await migrateOrdersBatch({ isApply: true, batchSize: 10, merchantScopeId: 'tenant_concur_mod' });

      // Simulate an out-of-band post-migration modification
      await Order.updateOne(
        { _id: order._id },
        { $set: { subtotalExact: MoneyMapper.fromLegacy(999, 'PKR') } }
      );

      const report = await runMigration([
        '--target=local',
        '--allow-local',
        '--rollback',
        '--confirm-phase6d4-rollback',
        '--merchant-scope=tenant_concur_mod'
      ]);

      expect(report.success).toBe(false);
      expect(report.rollbackResult.conflictCount).toBe(1);

      // Verify document was NOT blindly overwritten
      const check = await Order.findById(order._id);
      expect(check.subtotalExact.amountMinor.toString()).toBe('99900');

      const journal = await MigrationJournal.findOne({ migrationId: MIGRATION_ID, documentId: order._id });
      expect(journal.status).toBe('conflict');
    });

    it('20.6 Tampered checkpoint checksum fails closed during rollback', async () => {
      const user = await global.createTestUser();
      const order = await Order.create({
        user: user._id,
        idempotencyKey: `tamper-ord-${userSeq}`,
        requestHash: `tamper-hash-${userSeq}`,
        quote: { merchantScopeId: 'tenant_tamper' },
        items: [{ product: new mongoose.Types.ObjectId(), name: 'Item', price: 50, quantity: 1, lineTotal: 50 }],
        subtotal: 50,
        totalAmount: 50,
        paymentMethod: 'cod',
        shippingAddress: { fullName: 'Buyer', phone: '03001234567', address: 'Street', city: 'Karachi', country: 'Pakistan', countryCode: 'PK' },
        currency: 'PKR',
        statusTimeline: [{ status: 'Pending', actor: user._id, actorRole: 'customer', timestamp: new Date() }]
      });

      await migrateOrdersBatch({ isApply: true, batchSize: 10, merchantScopeId: 'tenant_tamper' });

      // Tamper with the checksum in MigrationJournal
      await MigrationJournal.updateOne(
        { migrationId: MIGRATION_ID, documentId: order._id },
        { $set: { checksum: 'tampered_invalid_sha256_hash_value' } }
      );

      const report = await runMigration([
        '--target=local',
        '--allow-local',
        '--rollback',
        '--confirm-phase6d4-rollback',
        '--merchant-scope=tenant_tamper'
      ]);

      expect(report.success).toBe(false);
      expect(report.rollbackResult.conflictCount).toBe(1);

      const journal = await MigrationJournal.findOne({ migrationId: MIGRATION_ID, documentId: order._id });
      expect(journal.status).toBe('conflict');
    });

    it('20.7 Rollback is idempotent across repeated executions', async () => {
      const user = await global.createTestUser();
      const order = await Order.create({
        user: user._id,
        idempotencyKey: `idemp-rb-ord-${userSeq}`,
        requestHash: `idemp-rb-hash-${userSeq}`,
        quote: { merchantScopeId: 'tenant_idemp_rb' },
        items: [{ product: new mongoose.Types.ObjectId(), name: 'Item', price: 80, quantity: 1, lineTotal: 80 }],
        subtotal: 80,
        totalAmount: 80,
        paymentMethod: 'cod',
        shippingAddress: { fullName: 'Buyer', phone: '03001234567', address: 'Street', city: 'Karachi', country: 'Pakistan', countryCode: 'PK' },
        currency: 'PKR',
        statusTimeline: [{ status: 'Pending', actor: user._id, actorRole: 'customer', timestamp: new Date() }]
      });

      await migrateOrdersBatch({ isApply: true, batchSize: 10, merchantScopeId: 'tenant_idemp_rb' });

      // First Rollback
      const report1 = await runMigration([
        '--target=local',
        '--allow-local',
        '--rollback',
        '--confirm-phase6d4-rollback',
        '--merchant-scope=tenant_idemp_rb'
      ]);
      expect(report1.rollbackResult.success).toBe(true);
      expect(report1.rollbackResult.restoredCount).toBe(1);

      // Second Rollback (No-op)
      const report2 = await runMigration([
        '--target=local',
        '--allow-local',
        '--rollback',
        '--confirm-phase6d4-rollback',
        '--merchant-scope=tenant_idemp_rb'
      ]);
      expect(report2.rollbackResult.success).toBe(true);
      expect(report2.rollbackResult.restoredCount).toBe(0);
    });

    it('20.8 Finalize refuses when conflict checkpoints exist', async () => {
      await MigrationJournal.create({
        migrationId: MIGRATION_ID,
        collectionName: 'orders',
        documentId: new mongoose.Types.ObjectId(),
        merchantScopeId: 'default',
        status: 'conflict',
        fieldsWritten: ['subtotalExact'],
        preconditionFingerprint: 'prec',
        postWriteFingerprint: 'post',
        checksum: 'invalid'
      });

      await expect(
        runMigration([
          '--target=local',
          '--allow-local',
          '--finalize',
          '--confirm-phase6d4-finalize'
        ])
      ).rejects.toThrow(/unresolved conflict checkpoints exist/i);
    });

    it('20.9 Backward compatibility: MigrationJournal handles historical entries without new fields', async () => {
      const historicalId = new mongoose.Types.ObjectId();
      const historicalEntry = await MigrationJournal.create({
        migrationId: 'phase4d-exact-money',
        collectionName: 'orders',
        documentId: historicalId,
        status: 'applied',
        fieldsWritten: ['subtotalExact', 'totalAmountExact'],
        preconditionFingerprint: 'legacy-prec-fingerprint',
        postWriteFingerprint: 'legacy-post-fingerprint'
      });

      expect(historicalEntry._id).toBeDefined();
      expect(historicalEntry.operationId).toBeNull();
      expect(historicalEntry.beforeFields).toEqual([]);
      expect(historicalEntry.appliedFields).toEqual([]);
      expect(historicalEntry.checksum).toBeNull();
      expect(historicalEntry.schemaVersion).toBe('1.0.0');
    });

    it('20.10 Gap 1: Non-allowlisted or forbidden field paths fail closed in checksum and persistence', () => {
      // Non-allowlisted dotted path
      expect(() => {
        computeCheckpointChecksum({
          migrationId: MIGRATION_ID,
          collectionName: 'orders',
          documentId: new mongoose.Types.ObjectId(),
          fieldsWritten: ['subtotalExact', 'shippingAddress.city'],
          beforeFields: [{ fieldPath: 'shippingAddress.city', exists: true, valueExact: null }],
          appliedFields: []
        });
      }).toThrow(/Forbidden field path/i);

      // Forbidden prototype segment
      expect(() => {
        computeCheckpointChecksum({
          migrationId: MIGRATION_ID,
          collectionName: 'orders',
          documentId: new mongoose.Types.ObjectId(),
          fieldsWritten: ['__proto__.polluted'],
          beforeFields: [],
          appliedFields: []
        });
      }).toThrow(/forbidden path segment/i);

      // Malformed dot segment
      expect(() => {
        computeCheckpointChecksum({
          migrationId: MIGRATION_ID,
          collectionName: 'orders',
          documentId: new mongoose.Types.ObjectId(),
          fieldsWritten: ['.leadingDot'],
          beforeFields: [],
          appliedFields: []
        });
      }).toThrow(/malformed dot segments/i);
    });

    it('20.11 Gap 2: Concurrency rejection when totalAmountExact is modified post-migration (subtotalExact unchanged)', async () => {
      const user = await global.createTestUser();
      const order = await Order.create({
        user: user._id,
        idempotencyKey: `concur-tot-ord-${userSeq}`,
        requestHash: `concur-tot-hash-${userSeq}`,
        quote: { merchantScopeId: 'tenant_concur_tot' },
        items: [{ product: new mongoose.Types.ObjectId(), name: 'Item', price: 100, quantity: 1, lineTotal: 100 }],
        subtotal: 100,
        totalAmount: 100,
        paymentMethod: 'cod',
        shippingAddress: { fullName: 'Buyer', phone: '03001234567', address: 'Street', city: 'Karachi', country: 'Pakistan', countryCode: 'PK' },
        currency: 'PKR',
        statusTimeline: [{ status: 'Pending', actor: user._id, actorRole: 'customer', timestamp: new Date() }]
      });

      await migrateOrdersBatch({ isApply: true, batchSize: 10, merchantScopeId: 'tenant_concur_tot' });

      // Modify only totalAmountExact
      await Order.updateOne(
        { _id: order._id },
        { $set: { totalAmountExact: MoneyMapper.fromLegacy(500, 'PKR') } }
      );

      const report = await runMigration([
        '--target=local',
        '--allow-local',
        '--rollback',
        '--confirm-phase6d4-rollback',
        '--merchant-scope=tenant_concur_tot'
      ]);

      expect(report.success).toBe(false);
      expect(report.rollbackResult.conflictCount).toBe(1);

      // Verify zero restoration occurred on subtotalExact
      const check = await Order.findById(order._id);
      expect(check.subtotalExact.amountMinor.toString()).toBe('10000');
      expect(check.totalAmountExact.amountMinor.toString()).toBe('50000');
    });

    it('20.12 Gap 2: Concurrency rejection on currency-only or exponent-only divergence', async () => {
      const user = await global.createTestUser();
      const order = await Order.create({
        user: user._id,
        idempotencyKey: `concur-cur-ord-${userSeq}`,
        requestHash: `concur-cur-hash-${userSeq}`,
        quote: { merchantScopeId: 'tenant_concur_cur' },
        items: [{ product: new mongoose.Types.ObjectId(), name: 'Item', price: 100, quantity: 1, lineTotal: 100 }],
        subtotal: 100,
        totalAmount: 100,
        paymentMethod: 'cod',
        shippingAddress: { fullName: 'Buyer', phone: '03001234567', address: 'Street', city: 'Karachi', country: 'Pakistan', countryCode: 'PK' },
        currency: 'PKR',
        statusTimeline: [{ status: 'Pending', actor: user._id, actorRole: 'customer', timestamp: new Date() }]
      });

      await migrateOrdersBatch({ isApply: true, batchSize: 10, merchantScopeId: 'tenant_concur_cur' });

      // Change only currency on subtotalExact
      await Order.updateOne(
        { _id: order._id },
        { $set: { 'subtotalExact.currency': 'USD' } }
      );

      const report = await runMigration([
        '--target=local',
        '--allow-local',
        '--rollback',
        '--confirm-phase6d4-rollback',
        '--merchant-scope=tenant_concur_cur'
      ]);

      expect(report.success).toBe(false);
      expect(report.rollbackResult.conflictCount).toBe(1);

      const check = await Order.findById(order._id);
      expect(check.subtotalExact.currency).toBe('USD');
      expect(check.totalAmountExact).not.toBeNull();
    });

    it('20.13 Gap 3: Finalize rejects when non-applied journals exist or counters mismatch', async () => {
      const user = await global.createTestUser();
      const order = await Order.create({
        user: user._id,
        idempotencyKey: `fin-chk-ord-${userSeq}`,
        requestHash: `fin-chk-hash-${userSeq}`,
        quote: { merchantScopeId: 'tenant_fin_chk' },
        items: [{ product: new mongoose.Types.ObjectId(), name: 'Item', price: 50, quantity: 1, lineTotal: 50 }],
        subtotal: 50,
        totalAmount: 50,
        paymentMethod: 'cod',
        shippingAddress: { fullName: 'Buyer', phone: '03001234567', address: 'Street', city: 'Karachi', country: 'Pakistan', countryCode: 'PK' },
        currency: 'PKR',
        statusTimeline: [{ status: 'Pending', actor: user._id, actorRole: 'customer', timestamp: new Date() }]
      });

      await migrateOrdersBatch({ isApply: true, batchSize: 10, merchantScopeId: 'tenant_fin_chk' });

      // Simulate counter mismatch in MigrationState
      await MigrationState.updateOne(
        { migrationId: MIGRATION_ID },
        { $set: { status: 'applied', updatedCount: 999, metadata: { merchantScopeId: 'tenant_fin_chk' } } },
        { upsert: true }
      );

      await expect(
        runMigration([
          '--target=local',
          '--allow-local',
          '--finalize',
          '--confirm-phase6d4-finalize',
          '--merchant-scope=tenant_fin_chk'
        ])
      ).rejects.toThrow(/updatedCount \(999\) does not match applied MigrationJournal count/i);
    });

    it('20.14 Gap 3: Successful finalize preserves recovery evidence in MigrationJournal', async () => {
      const user = await global.createTestUser();
      const order = await Order.create({
        user: user._id,
        idempotencyKey: `fin-succ-ord-${userSeq}`,
        requestHash: `fin-succ-hash-${userSeq}`,
        quote: { merchantScopeId: 'tenant_fin_succ' },
        items: [{ product: new mongoose.Types.ObjectId(), name: 'Item', price: 60, quantity: 1, lineTotal: 60 }],
        subtotal: 60,
        totalAmount: 60,
        paymentMethod: 'cod',
        shippingAddress: { fullName: 'Buyer', phone: '03001234567', address: 'Street', city: 'Karachi', country: 'Pakistan', countryCode: 'PK' },
        currency: 'PKR',
        statusTimeline: [{ status: 'Pending', actor: user._id, actorRole: 'customer', timestamp: new Date() }]
      });

      await migrateOrdersBatch({ isApply: true, batchSize: 10, merchantScopeId: 'tenant_fin_succ' });
      await MigrationState.updateOne(
        { migrationId: MIGRATION_ID },
        { $set: { status: 'applied', updatedCount: 1, metadata: { merchantScopeId: 'tenant_fin_succ' } } },
        { upsert: true }
      );

      const report = await runMigration([
        '--target=local',
        '--allow-local',
        '--finalize',
        '--confirm-phase6d4-finalize',
        '--merchant-scope=tenant_fin_succ'
      ]);

      expect(report.success).toBe(true);

      // Verify journal entry was NOT deleted
      const journal = await MigrationJournal.findOne({ migrationId: MIGRATION_ID, documentId: order._id });
      expect(journal).not.toBeNull();
      expect(journal.status).toBe('applied');
      expect(journal.beforeFields.length).toBeGreaterThan(0);
    });

    it('20.15 Gap 4: Different operation cannot overwrite existing checkpoint', async () => {
      const user = await global.createTestUser();
      const order = await Order.create({
        user: user._id,
        idempotencyKey: `diff-op-ord-${userSeq}`,
        requestHash: `diff-op-hash-${userSeq}`,
        quote: { merchantScopeId: 'tenant_diff_op' },
        items: [{ product: new mongoose.Types.ObjectId(), name: 'Item', price: 70, quantity: 1, lineTotal: 70 }],
        subtotal: 70,
        totalAmount: 70,
        paymentMethod: 'cod',
        shippingAddress: { fullName: 'Buyer', phone: '03001234567', address: 'Street', city: 'Karachi', country: 'Pakistan', countryCode: 'PK' },
        currency: 'PKR',
        statusTimeline: [{ status: 'Pending', actor: user._id, actorRole: 'customer', timestamp: new Date() }]
      });

      await migrateOrdersBatch({ isApply: true, batchSize: 10, merchantScopeId: 'tenant_diff_op', operationId: 'op_initial_run' });

      // Reset order subtotalExact to null to simulate re-apply attempt under a different operation ID
      await Order.updateOne({ _id: order._id }, { $set: { subtotalExact: null } });

      // Attempt apply with different operation ID on same order
      const res = await migrateOrdersBatch({
        isApply: true,
        batchSize: 10,
        merchantScopeId: 'tenant_diff_op',
        operationId: 'op_rogue_different_run'
      });

      expect(res.failed).toBe(1);
      expect(res.anomalies[0].message).toMatch(/already journaled under different operation 'op_initial_run'/i);
    });
  });
});

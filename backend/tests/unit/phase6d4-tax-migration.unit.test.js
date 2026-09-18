/**
 * @file phase6d4-tax-migration.unit.test.js
 * @description Unit tests for Phase 6D-4 tax and customs migration utilities, exact math,
 * coupon backfills, DAP/DDP invariant checks, and tenant-safe batching.
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
  migrateReturnsAndRefundsBatch
} = require('../../scripts/migrations/phase6d4-tax-customs-governance');
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

  describe('1. Index Matching & Exact-Money Validation', () => {
    const existingIndexes = [
      { key: { 'taxesAndDuties.provenance.ruleId': 1 }, name: 'order_tax_rule_id_lookup_idx' },
      { key: { 'taxesAndDuties.incoterm': 1 }, name: 'order_incoterm_lookup_idx' }
    ];

    it('1.1 matches target index by key pattern', () => {
      const match = findIndexMatch(existingIndexes, { key: { 'taxesAndDuties.incoterm': 1 } });
      expect(match).toBeDefined();
      expect(match.name).toBe('order_incoterm_lookup_idx');
    });

    it('1.2 matches target index by name', () => {
      const match = findIndexMatch(existingIndexes, {}, 'order_tax_rule_id_lookup_idx');
      expect(match).toBeDefined();
      expect(match.name).toBe('order_tax_rule_id_lookup_idx');
    });

    it('1.3 rejects non-existent index', () => {
      const match = findIndexMatch(existingIndexes, { key: { unknown: 1 } }, 'unknown_idx');
      expect(match).toBeNull();
    });

    it('1.4 validates canonical 18-digit amountMinor string', () => {
      expect(isValidExactMoney({ amountMinor: '999999999999999999', currency: 'USD', exponent: 2 })).toBe(true);
      expect(isValidExactMoney({ amountMinor: '0', currency: 'PKR', exponent: 2 })).toBe(true);
    });

    it('1.5 rejects unsafe numbers, 19+ digits, and negative strings', () => {
      expect(isValidExactMoney({ amountMinor: 9007199254740992, currency: 'USD', exponent: 2 })).toBe(false);
      expect(isValidExactMoney({ amountMinor: '-500', currency: 'USD', exponent: 2 })).toBe(false);
      expect(isValidExactMoney({ amountMinor: '1000000000000000000', currency: 'USD', exponent: 2 })).toBe(false);
      expect(isValidExactMoney({ amountMinor: '100.5', currency: 'USD', exponent: 2 })).toBe(false);
    });

    it('1.6 rejects invalid currencies and out-of-range exponents', () => {
      expect(isValidExactMoney({ amountMinor: '100', currency: 'INVALID', exponent: 2 })).toBe(false);
      expect(isValidExactMoney({ amountMinor: '100', currency: 'USD', exponent: 5 })).toBe(false);
      expect(isValidExactMoney({ amountMinor: '100', currency: 'USD', exponent: -1 })).toBe(false);
    });
  });

  describe('2. Preflight Tax Rule Anomalies & Legal Governance Integrity', () => {
    it('2.1 reports zero anomalies for clean verified tax rules', async () => {
      const cleanRules = [
        {
          ruleId: 'RULE-PK-01',
          destinationCountry: 'PK',
          destinationSubdivision: '',
          taxType: 'SALES_TAX',
          taxTreatment: 'exclusive',
          taxableBasis: 'subtotal',
          taxRateNumerator: 1700,
          taxRateDenominator: 10000,
          dutyRateNumerator: 0,
          dutyRateDenominator: 10000,
          roundingMode: 'HALF_UP',
          roundingScope: 'subtotal',
          incoterm: 'DOMESTIC',
          verificationStatus: 'VERIFIED_LEGAL_RULE',
          dutyRefundPolicy: 'REFUNDABLE',
          taxRefundPolicy: 'REFUNDABLE',
          customsValueIncludesShipping: false,
          customsValueIncludesInsurance: false,
          sourceAuthority: 'FBR',
          sourceReference: 'Sales Tax Act 1990',
          enabled: true
        }
      ];

      const anomalies = await inspectPreflightAnomalies(cleanRules);
      expect(anomalies).toEqual([]);
    });

    it('2.2 detects unverified estimates in active configuration', async () => {
      const unverifiedRules = [
        {
          ruleId: 'RULE-UNVERIFIED',
          destinationCountry: 'AE',
          verificationStatus: 'UNVERIFIED_ESTIMATE',
          dutyRefundPolicy: 'REFUNDABLE',
          taxRefundPolicy: 'REFUNDABLE',
          customsValueIncludesShipping: false,
          customsValueIncludesInsurance: false,
          sourceAuthority: 'Manual note',
          sourceReference: 'Estimate',
          enabled: true
        }
      ];

      const anomalies = await inspectPreflightAnomalies(unverifiedRules);
      expect(anomalies.some((a) => a.type === 'UNVERIFIED_RULE_IN_ACTIVE_CONFIG')).toBe(true);
    });

    it('2.3 detects missing required legal refund policies', async () => {
      const missingPolicyRules = [
        {
          ruleId: 'RULE-MISSING-POLICY',
          destinationCountry: 'PK',
          verificationStatus: 'VERIFIED_LEGAL_RULE',
          dutyRefundPolicy: null,
          taxRefundPolicy: null,
          customsValueIncludesShipping: null,
          customsValueIncludesInsurance: null,
          sourceAuthority: 'FBR',
          sourceReference: 'Ref',
          enabled: true
        }
      ];

      const anomalies = await inspectPreflightAnomalies(missingPolicyRules);
      expect(anomalies.some((a) => a.type === 'MISSING_DUTY_REFUND_POLICY')).toBe(true);
      expect(anomalies.some((a) => a.type === 'MISSING_TAX_REFUND_POLICY')).toBe(true);
      expect(anomalies.some((a) => a.type === 'MISSING_CUSTOMS_SHIPPING_INCLUSION')).toBe(true);
    });

    it('2.4 detects ambiguous route overlap between active rules', async () => {
      const overlappingRules = [
        {
          ruleId: 'RULE-1',
          destinationCountry: 'US',
          destinationSubdivision: 'CA',
          verificationStatus: 'VERIFIED_LEGAL_RULE',
          dutyRefundPolicy: 'REFUNDABLE',
          taxRefundPolicy: 'REFUNDABLE',
          customsValueIncludesShipping: false,
          customsValueIncludesInsurance: false,
          sourceAuthority: 'CDTFA',
          sourceReference: 'Tax Pub 100',
          enabled: true
        },
        {
          ruleId: 'RULE-2',
          destinationCountry: 'US',
          destinationSubdivision: 'CA',
          verificationStatus: 'VERIFIED_LEGAL_RULE',
          dutyRefundPolicy: 'REFUNDABLE',
          taxRefundPolicy: 'REFUNDABLE',
          customsValueIncludesShipping: false,
          customsValueIncludesInsurance: false,
          sourceAuthority: 'CDTFA',
          sourceReference: 'Tax Pub 100',
          enabled: true
        }
      ];

      const anomalies = await inspectPreflightAnomalies(overlappingRules);
      expect(anomalies.some((a) => a.type === 'AMBIGUOUS_ROUTE_OVERLAP')).toBe(true);
    });
  });

  describe('3. Coupon Exact & Rational Migration', () => {
    it('3.1 dry-run performs zero writes on percentage coupon', async () => {
      const coupon = await Coupon.create({
        code: `DRYRUN-${userSeq}`,
        type: 'percentage',
        value: 15,
        startDate: new Date(),
        endDate: new Date(Date.now() + 86400000)
      });

      const res = await migrateCouponsBatch({ isApply: false, batchSize: 50 });
      expect(res.eligible).toBeGreaterThanOrEqual(1);
      expect(res.changed).toBe(0);

      const unchanged = await Coupon.findById(coupon._id);
      expect(unchanged.rateNumerator).toBeNull();
      expect(unchanged.rateDenominator).toBeNull();
    });

    it('3.2 apply mode backfills canonical rational rate (15% -> 1500 / 10000)', async () => {
      const coupon = await Coupon.create({
        code: `APPLY-${userSeq}`,
        type: 'percentage',
        value: 15,
        startDate: new Date(),
        endDate: new Date(Date.now() + 86400000)
      });

      const res = await migrateCouponsBatch({ isApply: true, batchSize: 50 });
      expect(res.changed).toBeGreaterThanOrEqual(1);

      const updated = await Coupon.findById(coupon._id);
      expect(updated.rateNumerator).toBe(1500);
      expect(updated.rateDenominator).toBe(10000);
    });

    it('3.3 idempotent run against compliant coupon produces zero changes', async () => {
      await Coupon.create({
        code: `COMPLIANT-${userSeq}`,
        type: 'percentage',
        value: 15,
        rateNumerator: 1500,
        rateDenominator: 10000,
        startDate: new Date(),
        endDate: new Date(Date.now() + 86400000)
      });

      const res2 = await migrateCouponsBatch({ isApply: true, batchSize: 50 });
      expect(res2.changed).toBe(0);
      expect(res2.alreadyCompliant).toBeGreaterThanOrEqual(1);
    });

    it('3.4 flags invalid percentage values for manual review', async () => {
      const badCoupon = await Coupon.create({
        code: `BADVAL-${userSeq}`,
        type: 'percentage',
        value: 150, // invalid > 100
        startDate: new Date(),
        endDate: new Date(Date.now() + 86400000)
      });

      const res = await migrateCouponsBatch({ isApply: false, batchSize: 50 });
      expect(res.manualReview).toBeGreaterThanOrEqual(1);
      expect(res.anomalies.some((a) => a.code === badCoupon.code)).toBe(true);
    });
  });

  describe('4. Order Exact Snapshots & DAP/Inclusive Tax Anomaly Detection', () => {
    it('4.1 detects DAP orders with non-zero payable duty collected', async () => {
      const user = await global.createTestUser();
      const order = await Order.create({
        user: user._id,
        idempotencyKey: `dap-key-${userSeq}`,
        requestHash: `dap-hash-${userSeq}`,
        items: [{
          product: new mongoose.Types.ObjectId(),
          name: 'Test Cross-Border Item',
          price: 100,
          quantity: 1,
          lineTotal: 100
        }],
        subtotal: 100,
        totalAmount: 120,
        paymentMethod: 'stripe',
        shippingAddress: {
          fullName: 'Test Buyer',
          phone: '03001234567',
          address: 'Downtown',
          city: 'Dubai',
          country: 'United Arab Emirates',
          countryCode: 'AE'
        },
        currency: 'USD',
        taxesAndDuties: {
          incoterm: 'DAP',
          payableDutyAmount: 20, // DAP must NOT have collected payable duty
          payableDutyExact: MoneyMapper.fromLegacy(20, 'USD')
        },
        statusTimeline: [{
          status: 'Pending',
          actor: user._id,
          actorRole: 'customer',
          timestamp: new Date()
        }]
      });

      const res = await migrateOrdersBatch({ isApply: false, batchSize: 50 });
      expect(res.manualReview).toBeGreaterThanOrEqual(1);
      expect(res.anomalies.some((a) => a.type === 'DAP_NONZERO_PAYABLE_DUTY_ANOMALY')).toBe(true);
    });

    it('4.2 tenant isolation respects merchantScopeId filtering', async () => {
      const user = await global.createTestUser();
      await Order.create({
        user: user._id,
        idempotencyKey: `tenant-scope-key-${userSeq}`,
        requestHash: `tenant-scope-hash-${userSeq}`,
        quote: { merchantScopeId: 'tenant_special' },
        items: [{
          product: new mongoose.Types.ObjectId(),
          name: 'Scoped Item',
          price: 50,
          quantity: 1,
          lineTotal: 50
        }],
        subtotal: 50,
        totalAmount: 50,
        paymentMethod: 'cod',
        shippingAddress: {
          fullName: 'Local Buyer',
          phone: '03001234567',
          address: 'Main Blvd',
          city: 'Lahore',
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

      const scopedRes = await migrateOrdersBatch({ isApply: false, batchSize: 50, merchantScopeId: 'tenant_other' });
      expect(scopedRes.processed).toBe(0);

      const matchRes = await migrateOrdersBatch({ isApply: false, batchSize: 50, merchantScopeId: 'tenant_special' });
      expect(matchRes.processed).toBe(1);
    });
  });

  describe('5. Refund Component Exact Math & Resumability', () => {
    it('5.1 detects refund component sum mismatch', async () => {
      const user = await global.createTestUser();
      await Refund.create({
        payment: new mongoose.Types.ObjectId(),
        order: new mongoose.Types.ObjectId(),
        customer: user._id,
        processedBy: user._id,
        providerIdempotencyKey: `prov-idemp-${userSeq}`,
        requestHash: `req-hash-${userSeq}`,
        idempotencyKey: `idemp-${userSeq}`,
        provider: 'stripe',
        amount: 100,
        amountExact: MoneyMapper.fromLegacy(100, 'USD'),
        allocationSnapshot: {
          merchandiseRefundExact: MoneyMapper.fromLegacy(70, 'USD'),
          taxRefundExact: MoneyMapper.fromLegacy(10, 'USD'),
          dutyRefundExact: MoneyMapper.fromLegacy(10, 'USD'),
          shippingRefundExact: MoneyMapper.fromLegacy(0, 'USD'),
          totalRefundExact: MoneyMapper.fromLegacy(100, 'USD') // 70 + 10 + 10 = 90 != 100
        }
      });

      const res = await migrateReturnsAndRefundsBatch({ isApply: false, batchSize: 50 });
      expect(res.manualReview).toBeGreaterThanOrEqual(1);
      expect(res.anomalies.some((a) => a.type === 'REFUND_COMPONENT_EXACT_SUM_MISMATCH')).toBe(true);
    });

    it('5.2 accepts compliant refund component sum', async () => {
      const user = await global.createTestUser();
      await Refund.create({
        payment: new mongoose.Types.ObjectId(),
        order: new mongoose.Types.ObjectId(),
        customer: user._id,
        processedBy: user._id,
        providerIdempotencyKey: `prov-idemp-comp-${userSeq}`,
        requestHash: `req-hash-comp-${userSeq}`,
        idempotencyKey: `idemp-comp-${userSeq}`,
        provider: 'stripe',
        amount: 100,
        amountExact: MoneyMapper.fromLegacy(100, 'USD'),
        allocationSnapshot: {
          merchandiseRefundExact: MoneyMapper.fromLegacy(80, 'USD'),
          taxRefundExact: MoneyMapper.fromLegacy(10, 'USD'),
          dutyRefundExact: MoneyMapper.fromLegacy(10, 'USD'),
          shippingRefundExact: MoneyMapper.fromLegacy(0, 'USD'),
          totalRefundExact: MoneyMapper.fromLegacy(100, 'USD') // 80 + 10 + 10 = 100
        }
      });

      const res = await migrateReturnsAndRefundsBatch({ isApply: false, batchSize: 50 });
      expect(res.alreadyCompliant).toBeGreaterThanOrEqual(1);
    });
  });
});

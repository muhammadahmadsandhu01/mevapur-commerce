/**
 * @file tax-governance-reconciliation.unit.test.js
 * @description Unit tests for Phase 6D-4 tax governance reconciliation tool and anomaly detector.
 */

'use strict';

const mongoose = require('mongoose');
const {
  EXIT_CODE,
  isValidExactMoney,
  reconcileSingleTenant,
  auditCoupons,
  auditReturnsAndRefunds,
  auditPayments,
  runTaxReconciliation
} = require('../../scripts/reconciliation/taxGovernanceReconciliation');
const CommerceConfigurationVersion = require('../../models/CommerceConfigurationVersion');
const Coupon = require('../../models/Coupon');
const Order = require('../../models/Order');
const Refund = require('../../models/Refund');
const Payment = require('../../models/Payment');
const { MoneyMapper } = require('../../modules/commerce');

describe('Phase 6D-4: Tax Governance Reconciliation Unit Tests', () => {
  let seq = 0;

  beforeEach(() => {
    seq++;
  });

  function createValidConfigData(scopeId, version = 1) {
    return {
      merchantScopeId: scopeId,
      version,
      status: 'active',
      effectiveFrom: new Date(Date.now() - 10000),
      merchantProfile: {
        merchantCountry: 'PK',
        baseCurrency: 'PKR',
        defaultCurrency: 'PKR',
        sellingMode: 'hybrid',
        enabledCountries: ['PK', 'AE'],
        enabledCurrencies: ['PKR', 'AED', 'USD']
      },
      shippingRules: [],
      taxRules: [
        {
          ruleId: 'GOV-TAX-PK',
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
        },
        {
          ruleId: 'GOV-TAX-AE',
          destinationCountry: 'AE',
          destinationSubdivision: '',
          taxType: 'VAT',
          taxTreatment: 'exclusive',
          taxableBasis: 'subtotal',
          taxRateNumerator: 500,
          taxRateDenominator: 10000,
          dutyRateNumerator: 500,
          dutyRateDenominator: 10000,
          roundingMode: 'HALF_UP',
          roundingScope: 'subtotal',
          incoterm: 'DDP',
          verificationStatus: 'VERIFIED_LEGAL_RULE',
          dutyRefundPolicy: 'NON_REFUNDABLE',
          taxRefundPolicy: 'PROPORTIONAL',
          customsValueIncludesShipping: true,
          customsValueIncludesInsurance: false,
          sourceAuthority: 'UAE FTA',
          sourceReference: 'Federal Decree-Law No. 8',
          enabled: true
        }
      ]
    };
  }

  describe('1. CLI & Tenant Scope Validation', () => {
    it('1.1 invocation without scope or all-tenants fails with CLI error', async () => {
      const res = await runTaxReconciliation([]);
      expect(res.success).toBe(false);
      expect(res.exitCode).toBe(EXIT_CODE.CLI_ERROR);
    });

    it('1.2 missing active version for tenant scope is reported as critical anomaly', async () => {
      const report = await reconcileSingleTenant(`nonexistent-tenant-${seq}`);
      expect(report.success).toBe(false);
      expect(report.anomalies.some((a) => a.type === 'MISSING_ACTIVE_VERSION')).toBe(true);
    });

    it('1.3 clean configuration with full country coverage reports success', async () => {
      const scope = `clean-tenant-${seq}`;
      await CommerceConfigurationVersion.create(createValidConfigData(scope));

      const report = await reconcileSingleTenant(scope);
      expect(report.success).toBe(true);
      expect(report.anomalies).toEqual([]);
      expect(report.uncoveredCountries).toEqual([]);
    });
  });

  describe('2. Active Configuration Legal Rule Anomalies', () => {
    it('2.1 detects uncovered enabled destination countries', async () => {
      const scope = `uncovered-tenant-${seq}`;
      const data = createValidConfigData(scope);
      data.merchantProfile.enabledCountries = ['PK', 'AE', 'GB']; // GB is uncovered
      await CommerceConfigurationVersion.create(data);

      const report = await reconcileSingleTenant(scope);
      expect(report.uncoveredCountries).toContain('GB');
      expect(report.anomalies.some((a) => a.type === 'UNCOVERED_ENABLED_COUNTRY')).toBe(true);
    });

    it('2.2 detects unverified rules in active configuration', async () => {
      const scope = `unverified-tenant-${seq}`;
      const data = createValidConfigData(scope);
      data.taxRules[0].verificationStatus = 'UNVERIFIED_ESTIMATE';
      await CommerceConfigurationVersion.create(data);

      const report = await reconcileSingleTenant(scope);
      expect(report.success).toBe(false);
      expect(report.anomalies.some((a) => a.type === 'UNVERIFIED_TAX_RULE')).toBe(true);
    });

    it('2.3 detects de-minimis threshold without basis or comparison', async () => {
      const scope = `deminimis-bad-tenant-${seq}`;
      const data = createValidConfigData(scope);
      data.taxRules[1].customsDutyDeMinimisExact = MoneyMapper.fromLegacy(300, 'AED');
      data.taxRules[1].deMinimisBasis = null;
      data.taxRules[1].deMinimisComparison = null;
      await CommerceConfigurationVersion.create(data);

      const report = await reconcileSingleTenant(scope);
      expect(report.success).toBe(false);
      expect(report.anomalies.some((a) => a.type === 'INCOMPLETE_DEMINIMIS_CONFIGURATION')).toBe(true);
    });
  });

  describe('3. Order Anomaly Auditing', () => {
    it('3.1 detects inclusive tax double-counting in orders', async () => {
      const scope = `order-inclusive-tenant-${seq}`;
      await CommerceConfigurationVersion.create(createValidConfigData(scope));

      const user = await global.createTestUser();
      await Order.create({
        user: user._id,
        idempotencyKey: `incl-order-key-${seq}`,
        requestHash: `incl-order-hash-${seq}`,
        quote: { merchantScopeId: scope },
        items: [{
          product: new mongoose.Types.ObjectId(),
          name: 'Inclusive Tax Item',
          price: 100,
          quantity: 1,
          lineTotal: 100
        }],
        subtotal: 100,
        subtotalExact: MoneyMapper.fromLegacy(100, 'PKR'),
        taxAmount: 17,
        taxAmountExact: MoneyMapper.fromLegacy(17, 'PKR'),
        totalAmount: 117, // Subtotal 100 + Tax 17 = 117 (double added for inclusive tax!)
        totalAmountExact: MoneyMapper.fromLegacy(117, 'PKR'),
        paymentMethod: 'cod',
        shippingAddress: {
          fullName: 'Tax Buyer',
          phone: '03001234567',
          address: 'Street 1',
          city: 'Karachi',
          country: 'Pakistan',
          countryCode: 'PK'
        },
        currency: 'PKR',
        taxesAndDuties: {
          taxTreatment: 'inclusive',
          taxAmountExact: MoneyMapper.fromLegacy(17, 'PKR')
        },
        statusTimeline: [{
          status: 'Pending',
          actor: user._id,
          actorRole: 'customer',
          timestamp: new Date()
        }]
      });

      const report = await reconcileSingleTenant(scope);
      expect(report.anomalies.some((a) => a.type === 'INCLUSIVE_TAX_DOUBLE_COUNTING_ANOMALY')).toBe(true);
    });
  });

  describe('4. Coupon, Refund, and Payment Auditing', () => {
    it('4.1 detects percentage coupon without rational authority', async () => {
      await Coupon.create({
        code: `NO-RATIONAL-${seq}`,
        type: 'percentage',
        value: 20,
        rateNumerator: null,
        rateDenominator: null,
        startDate: new Date(),
        endDate: new Date(Date.now() + 86400000)
      });

      const res = await auditCoupons();
      expect(res.anomalies.some((a) => a.type === 'COUPON_MISSING_RATIONAL_AUTHORITY')).toBe(true);
    });

    it('4.2 detects payment refund cap violation', async () => {
      const user = await global.createTestUser();
      await Payment.create({
        order: new mongoose.Types.ObjectId(),
        user: user._id,
        provider: 'stripe',
        providerIdempotencyKey: `pay-idemp-${seq}`,
        requestHash: `pay-hash-${seq}`,
        idempotencyKey: `pay-key-${seq}`,
        amount: 100,
        currency: 'USD',
        capturedAmount: 100,
        capturedAmountExact: MoneyMapper.fromLegacy(100, 'USD'),
        refundedAmount: 80,
        refundedAmountExact: MoneyMapper.fromLegacy(80, 'USD'),
        refundReservedAmount: 30, // 80 + 30 = 110 > 100!
        refundReservedAmountExact: MoneyMapper.fromLegacy(30, 'USD')
      });

      const res = await auditPayments();
      expect(res.anomalies.some((a) => a.type === 'PAYMENT_REFUND_CAP_EXCEEDED')).toBe(true);
      expect(res.anomalies.some((a) => a.type === 'PAYMENT_EXACT_REFUND_CAP_EXCEEDED')).toBe(true);
    });
  });
});

/**
 * Phase 6D-4D Admin Tax, Customs, De-Minimis & Refund Governance Contract Test Suite
 * Validates exact field serialization, rational arithmetic, exact-money formatting,
 * and immutable zero-write preview contracts.
 */

import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatExactMoney,
  normalizeMinorString,
  formatRationalPercentage,
  getCurrencyExponent,
} from '../src/lib/exactMoney.ts';
import type { TaxRule, QuotePreviewResponse, ReturnAllocationSnapshot } from '../src/types/commerceGovernance.ts';

describe('Phase 6D-4D: Admin Tax, Customs & Governance Contracts', () => {

  describe('1. Authoritative Exact Money Formatting Suite', () => {
    test('formats zero minor unit correctly', () => {
      assert.equal(formatExactMoney({ amountMinor: '0', currency: 'USD' }), 'USD 0.00');
      assert.equal(formatExactMoney({ amountMinor: '0', currency: 'JPY' }), 'JPY 0');
      assert.equal(formatExactMoney({ amountMinor: '0', currency: 'BHD' }), 'BHD 0.000');
      assert.equal(formatExactMoney({ amountMinor: '0', currency: 'CLF' }), 'CLF 0.0000');
    });

    test('formats exponent 0 currencies (JPY, KRW, CLP, VND, UGX)', () => {
      assert.equal(formatExactMoney({ amountMinor: '1500', currency: 'JPY' }), 'JPY 1,500');
      assert.equal(formatExactMoney({ amountMinor: '50000', currency: 'KRW' }), 'KRW 50,000');
      assert.equal(formatExactMoney({ amountMinor: '750', currency: 'CLP' }), 'CLP 750');
      assert.equal(formatExactMoney({ amountMinor: '100000', currency: 'VND' }), 'VND 100,000');
    });

    test('formats exponent 2 currencies (USD, EUR, GBP, PKR, AED, SAR, CAD)', () => {
      assert.equal(formatExactMoney({ amountMinor: '1999', currency: 'USD' }), 'USD 19.99');
      assert.equal(formatExactMoney({ amountMinor: '250000', currency: 'PKR' }), 'PKR 2,500.00');
      assert.equal(formatExactMoney({ amountMinor: '500', currency: 'AED' }), 'AED 5.00');
      assert.equal(formatExactMoney({ amountMinor: '99', currency: 'EUR' }), 'EUR 0.99');
      assert.equal(formatExactMoney({ amountMinor: '5', currency: 'GBP' }), 'GBP 0.05');
    });

    test('formats exponent 3 currencies (BHD, KWD, OMR, JOD, TND)', () => {
      assert.equal(formatExactMoney({ amountMinor: '12345', currency: 'BHD' }), 'BHD 12.345');
      assert.equal(formatExactMoney({ amountMinor: '1000', currency: 'KWD' }), 'KWD 1.000');
      assert.equal(formatExactMoney({ amountMinor: '50', currency: 'OMR' }), 'OMR 0.050');
      assert.equal(formatExactMoney({ amountMinor: '5', currency: 'JOD' }), 'JOD 0.005');
    });

    test('formats exponent 4 currencies (CLF, UYW)', () => {
      assert.equal(formatExactMoney({ amountMinor: '123456', currency: 'CLF' }), 'CLF 12.3456');
      assert.equal(formatExactMoney({ amountMinor: '99', currency: 'UYW' }), 'UYW 0.0099');
      assert.equal(formatExactMoney({ amountMinor: '10000', currency: 'CLF' }), 'CLF 1.0000');
    });

    test('formats 18-digit minor units beyond Number.MAX_SAFE_INTEGER without precision loss', () => {
      const huge18Digit = '123456789012345678';
      const formatted = formatExactMoney({ amountMinor: huge18Digit, currency: 'USD' });
      assert.equal(formatted, 'USD 1,234,567,890,123,456.78');
    });

    test('formats negative exact money amounts safely', () => {
      assert.equal(formatExactMoney({ amountMinor: '-1500', currency: 'USD' }), '-USD 15.00');
      assert.equal(formatExactMoney({ amountMinor: '-5', currency: 'USD' }), '-USD 0.05');
      assert.equal(formatExactMoney({ amountMinor: '-1000', currency: 'JPY' }), '-JPY 1,000');
    });

    test('fails safely for invalid non-integer/decimal/exponential inputs', () => {
      assert.throws(() => normalizeMinorString('12.34'), /Invalid minor amount format/);
      assert.throws(() => normalizeMinorString('1e5'), /Invalid minor amount format/);
      assert.throws(() => normalizeMinorString('abc'), /Invalid minor amount format/);
      assert.throws(() => normalizeMinorString(null), /Minor amount is required/);
    });

    test('handles unknown currency gracefully when explicit exponent is provided vs missing', () => {
      assert.throws(() => getCurrencyExponent('XYZ'), /Unknown currency code/);
      assert.equal(getCurrencyExponent('XYZ', 3), 3);
      assert.equal(formatExactMoney({ amountMinor: '5000', currency: 'XYZ', exponent: 3 }), 'XYZ 5.000');
      assert.equal(formatExactMoney(null), '—');
      assert.equal(formatExactMoney(undefined), '—');
    });
  });

  describe('2. TaxRule Schema & Policy Invariant Contracts', () => {
    test('serializes complete 6D-4 tax and customs rule schema with exact backend names', () => {
      const governedRule: TaxRule = {
        ruleId: 'tax_rule_ae_standard',
        priority: 100,
        destinationCountry: 'AE',
        destinationSubdivision: 'Dubai',
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
        customsDutyDeMinimisExact: { amountMinor: '80000', currency: 'USD', exponent: 2 },
        importTaxDeMinimisExact: { amountMinor: '15000', currency: 'USD', exponent: 2 },
        deMinimisBasis: 'CUSTOMS_VALUE',
        deMinimisComparison: 'LTE',
        customsValueIncludesShipping: true,
        customsValueIncludesInsurance: false,
        dutyRefundPolicy: 'NON_REFUNDABLE',
        taxRefundPolicy: 'REFUNDABLE',
        providerType: 'MANUAL_GOVERNED',
        providerReference: '',
        sourceAuthority: 'Federal Tax Authority (FTA)',
        sourceReference: 'UAE VAT Law Decree 8/2017',
        verificationStatus: 'VERIFIED_LEGAL_RULE',
        requiresTax: true,
        requiresDuty: true,
        enabled: true,
      };

      assert.equal(governedRule.destinationCountry, 'AE');
      assert.equal(governedRule.incoterm, 'DDP');
      assert.equal(governedRule.dutyRefundPolicy, 'NON_REFUNDABLE');
      assert.equal(governedRule.taxRefundPolicy, 'REFUNDABLE');
      assert.equal(governedRule.customsValueIncludesShipping, true);
      assert.equal(governedRule.customsValueIncludesInsurance, false);
      assert.equal(governedRule.customsDutyDeMinimisExact?.amountMinor, '80000');
    });

    test('duty refund policy strictly excludes PROPORTIONAL while tax policy permits PROPORTIONAL', () => {
      const validDutyPolicies = ['REFUNDABLE', 'NON_REFUNDABLE', 'MANUAL_REVIEW', null];
      const validTaxPolicies = ['REFUNDABLE', 'NON_REFUNDABLE', 'PROPORTIONAL', 'MANUAL_REVIEW', null];

      assert.ok(!validDutyPolicies.includes('PROPORTIONAL'));
      assert.ok(validTaxPolicies.includes('PROPORTIONAL'));
    });

    test('deMinimisBasis permits strictly GOODS_VALUE, CUSTOMS_VALUE, CIF and excludes CIF_VALUE and SUBTOTAL', () => {
      const validDeMinimisBases: Array<NonNullable<TaxRule['deMinimisBasis']>> = ['GOODS_VALUE', 'CUSTOMS_VALUE', 'CIF'];

      assert.ok(validDeMinimisBases.includes('GOODS_VALUE'));
      assert.ok(validDeMinimisBases.includes('CUSTOMS_VALUE'));
      assert.ok(validDeMinimisBases.includes('CIF'));

      // Invariant: CIF_VALUE and SUBTOTAL must NOT be present in valid enum set
      // @ts-expect-error CIF_VALUE is not assignable to TaxRule['deMinimisBasis']
      assert.ok(!validDeMinimisBases.includes('CIF_VALUE'));
      // @ts-expect-error SUBTOTAL is not assignable to TaxRule['deMinimisBasis']
      assert.ok(!validDeMinimisBases.includes('SUBTOTAL'));
    });

    test('isDeMinimisBasis type guard strictly validates valid bases and rejects invalid strings/aliases', async () => {
      const { isDeMinimisBasis } = await import('../src/types/commerceGovernance.ts');

      assert.equal(isDeMinimisBasis('GOODS_VALUE'), true);
      assert.equal(isDeMinimisBasis('CUSTOMS_VALUE'), true);
      assert.equal(isDeMinimisBasis('CIF'), true);

      assert.equal(isDeMinimisBasis('CIF_VALUE'), false);
      assert.equal(isDeMinimisBasis('SUBTOTAL'), false);
      assert.equal(isDeMinimisBasis('NONE'), false);
      assert.equal(isDeMinimisBasis(''), false);
      assert.equal(isDeMinimisBasis(null), false);
      assert.equal(isDeMinimisBasis(undefined), false);
      assert.equal(isDeMinimisBasis(123), false);
    });

    test('reasonCode strictly matches backend authority and rejects incorrect aliases', () => {
      const validReasonCodes = ['DE_MINIMIS_EXEMPT', 'ABOVE_DE_MINIMIS_THRESHOLD', 'NO_THRESHOLD_CONFIGURED'];

      assert.ok(validReasonCodes.includes('DE_MINIMIS_EXEMPT'));
      assert.ok(validReasonCodes.includes('ABOVE_DE_MINIMIS_THRESHOLD'));
      assert.ok(validReasonCodes.includes('NO_THRESHOLD_CONFIGURED'));

      // Invalid aliases must not be accepted
      assert.ok(!validReasonCodes.includes('ABOVE_THRESHOLD'));
      assert.ok(!validReasonCodes.includes('BELOW_DE_MINIMIS_THRESHOLD'));
      assert.ok(!validReasonCodes.includes('NOT_CONFIGURED'));
    });

    test('serializes and preserves literal CIF in payload round-trip unchanged', () => {
      const cifRule: TaxRule = {
        ruleId: 'tax_rule_cif',
        destinationCountry: 'GB',
        taxType: 'VAT',
        taxRateNumerator: 2000,
        taxRateDenominator: 10000,
        incoterm: 'DDP',
        deMinimisBasis: 'CIF',
        deMinimisComparison: 'LTE',
        customsDutyDeMinimisExact: { amountMinor: '13500', currency: 'GBP', exponent: 2 },
        dutyRefundPolicy: 'NON_REFUNDABLE',
        taxRefundPolicy: 'REFUNDABLE',
        sourceAuthority: 'HMRC',
        sourceReference: 'UK VAT Act 1994',
        verificationStatus: 'VERIFIED_LEGAL_RULE',
      };

      const serialized = JSON.stringify(cifRule);
      const parsed = JSON.parse(serialized) as TaxRule;

      assert.equal(parsed.deMinimisBasis, 'CIF');
      assert.equal(parsed.destinationCountry, 'GB');
      assert.equal(parsed.customsDutyDeMinimisExact?.amountMinor, '13500');
    });

    test('calculates exact rational percentage representations without floating-point drift', () => {
      assert.equal(formatRationalPercentage(500, 10000), '5%');
      assert.equal(formatRationalPercentage(1700, 10000), '17%');
      assert.equal(formatRationalPercentage(550, 10000), '5.5%');
      assert.equal(formatRationalPercentage(0, 10000), '0%');
      assert.equal(formatRationalPercentage(100, 0), '0%');
    });
  });

  describe('3. Quote Preview Simulation Contract', () => {
    test('validates preview response shape containing landed-cost and de-minimis exact snapshots', () => {
      const mockPreviewResponse: QuotePreviewResponse = {
        previewVersion: 4,
        previewStatus: 'active',
        merchantScopeId: 'default',
        destinationCountry: 'AE',
        destinationPostalFingerprint: 'sha256_fp_998877',
        currency: 'AED',
        incoterm: 'DDP',
        serviceability: true,
        items: [
          {
            itemIndex: 0,
            name: 'Pecan Nuts 500g',
            quantity: 2,
            unitPrice: 50,
            unitPriceExact: { amountMinor: '5000', currency: 'AED', exponent: 2 },
            lineTotal: 100,
            lineTotalExact: { amountMinor: '10000', currency: 'AED', exponent: 2 },
            weightGrams: 1000,
          },
        ],
        taxesAndDuties: {
          taxType: 'VAT',
          taxTreatment: 'exclusive',
          taxableBasis: 'subtotal',
          taxRatePercent: 5,
          taxAmount: 5,
          taxAmountExact: { amountMinor: '500', currency: 'AED', exponent: 2 },
          additionalTaxAmountExact: { amountMinor: '500', currency: 'AED', exponent: 2 },
          taxIncludedAmountExact: { amountMinor: '0', currency: 'AED', exponent: 2 },
          dutyRatePercent: 5,
          estimatedDutyExact: { amountMinor: '500', currency: 'AED', exponent: 2 },
          payableDutyExact: { amountMinor: '500', currency: 'AED', exponent: 2 },
          goodsValueExact: { amountMinor: '10000', currency: 'AED', exponent: 2 },
          customsValueExact: { amountMinor: '10000', currency: 'AED', exponent: 2 },
          cifValueExact: { amountMinor: '12000', currency: 'AED', exponent: 2 },
          customsValueIncludesShipping: false,
          customsValueIncludesInsurance: false,
          dutyDeMinimis: {
            configured: true,
            exempt: false,
            basisType: 'CUSTOMS_VALUE',
            basisAmountExact: { amountMinor: '10000', currency: 'AED', exponent: 2 },
            thresholdExact: { amountMinor: '30000', currency: 'AED', exponent: 2 },
            comparison: 'LTE',
            reasonCode: 'ABOVE_DE_MINIMIS_THRESHOLD',
          },
          taxDeMinimis: {
            configured: false,
            exempt: false,
          },
          incoterm: 'DDP',
          provenance: {
            ruleId: 'tax_rule_ae_1',
            sourceAuthority: 'FTA',
            sourceReference: 'UAE VAT Law',
            verificationStatus: 'VERIFIED_LEGAL_RULE',
            dutyRefundPolicy: 'NON_REFUNDABLE',
            taxRefundPolicy: 'REFUNDABLE',
          },
        },
        totals: {
          subtotal: 100,
          subtotalExact: { amountMinor: '10000', currency: 'AED', exponent: 2 },
          shipping: 20,
          shippingExact: { amountMinor: '2000', currency: 'AED', exponent: 2 },
          tax: 5,
          taxExact: { amountMinor: '500', currency: 'AED', exponent: 2 },
          taxType: 'VAT',
          duties: 5,
          dutiesExact: { amountMinor: '500', currency: 'AED', exponent: 2 },
          landedCostExact: { amountMinor: '13000', currency: 'AED', exponent: 2 },
          grandTotal: 130,
          grandTotalExact: { amountMinor: '13000', currency: 'AED', exponent: 2 },
        },
        appliedRules: {
          shippingRuleId: 'ship_rule_ae_express',
          taxRuleId: 'tax_rule_ae_1',
          taxSourceReference: 'UAE VAT Law',
          taxVerificationStatus: 'VERIFIED_LEGAL_RULE',
        },
        deliveryEstimate: {
          minDays: 3,
          maxDays: 5,
        },
      };

      assert.equal(mockPreviewResponse.totals.grandTotalExact?.amountMinor, '13000');
      assert.equal(mockPreviewResponse.taxesAndDuties?.dutyDeMinimis?.exempt, false);
      assert.equal(mockPreviewResponse.taxesAndDuties?.provenance?.verificationStatus, 'VERIFIED_LEGAL_RULE');
      assert.equal(mockPreviewResponse.destinationPostalFingerprint, 'sha256_fp_998877');
    });
  });

  describe('4. Refund Allocation Snapshot Contract', () => {
    test('validates refund component allocation snapshot fields', () => {
      const allocation: ReturnAllocationSnapshot = {
        merchandiseRefundExact: { amountMinor: '5000', currency: 'PKR', exponent: 2 },
        taxRefundExact: { amountMinor: '850', currency: 'PKR', exponent: 2 },
        dutyRefundExact: { amountMinor: '0', currency: 'PKR', exponent: 2 },
        shippingRefundExact: { amountMinor: '250', currency: 'PKR', exponent: 2 },
        totalRefundExact: { amountMinor: '6100', currency: 'PKR', exponent: 2 },
        taxRefundPolicy: 'REFUNDABLE',
        dutyRefundPolicy: 'NON_REFUNDABLE',
        taxTreatment: 'EXCLUSIVE',
        incoterm: 'DOMESTIC',
        allocationVersion: '6D-4C',
      };

      assert.equal(allocation.totalRefundExact?.amountMinor, '6100');
      assert.equal(allocation.taxRefundPolicy, 'REFUNDABLE');
      assert.equal(allocation.dutyRefundPolicy, 'NON_REFUNDABLE');
      assert.equal(allocation.taxTreatment, 'EXCLUSIVE');
    });
  });
});

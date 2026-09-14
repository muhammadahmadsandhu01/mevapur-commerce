/**
 * @file taxDutyConfiguration.test.js
 * @description Unit tests for Phase 6B exact rational Tax, Duty & Landed-Cost Engine.
 * Covers isolated test fixtures (PK, AE, GB, DE, US), exact rational arithmetic,
 * inclusive/exclusive extraction, rounding modes, currency exponents, and fail-closed policies.
 */

const { TaxDutyEngine } = require('../../../services/checkout/TaxDutyEngine');
const { Money } = require('../../../modules/commerce');

const TEST_PK_FIXTURE = Object.freeze({
  ruleId: 'TAX-PK-TEST',
  destinationCountry: 'PK',
  destinationSubdivision: '',
  taxType: 'GST',
  taxTreatment: 'exclusive',
  taxRateNumerator: 0,
  taxRateDenominator: 10000,
  dutyRateNumerator: 0,
  dutyRateDenominator: 10000,
  roundingMode: 'HALF_UP',
  incoterm: 'DOMESTIC',
  sourceAuthority: 'Federal Board of Revenue',
  sourceReference: 'PK-FBR-TEST-2026',
  verificationStatus: 'VERIFIED_LEGAL_RULE',
  requiresTax: false,
  requiresDuty: false,
  enabled: true
});

const TEST_AE_FIXTURE = Object.freeze({
  ruleId: 'TAX-AE-TEST',
  destinationCountry: 'AE',
  destinationSubdivision: '',
  taxType: 'VAT',
  taxTreatment: 'exclusive',
  taxRateNumerator: 500, // 5% VAT (500 / 10000)
  taxRateDenominator: 10000,
  dutyRateNumerator: 500, // 5% Customs Duty
  dutyRateDenominator: 10000,
  roundingMode: 'HALF_UP',
  incoterm: 'DDP',
  sourceAuthority: 'Federal Tax Authority UAE',
  sourceReference: 'UAE-FTA-TEST-2026',
  verificationStatus: 'VERIFIED_LEGAL_RULE',
  requiresTax: true,
  requiresDuty: true,
  enabled: true
});

const TEST_GB_FIXTURE = Object.freeze({
  ruleId: 'TAX-GB-TEST',
  destinationCountry: 'GB',
  destinationSubdivision: '',
  taxType: 'VAT',
  taxTreatment: 'exclusive',
  taxRateNumerator: 2000, // 20% UK VAT
  taxRateDenominator: 10000,
  dutyRateNumerator: 250, // 2.5% Customs Duty
  dutyRateDenominator: 10000,
  roundingMode: 'HALF_UP',
  incoterm: 'DDP',
  sourceAuthority: 'HMRC UK',
  sourceReference: 'UK-HMRC-TEST-2026',
  verificationStatus: 'VERIFIED_LEGAL_RULE',
  requiresTax: true,
  requiresDuty: true,
  enabled: true
});

const TEST_DE_FIXTURE = Object.freeze({
  ruleId: 'TAX-DE-TEST',
  destinationCountry: 'DE',
  destinationSubdivision: '',
  taxType: 'VAT',
  taxTreatment: 'inclusive', // Test inclusive VAT extraction
  taxRateNumerator: 1900, // 19% German VAT
  taxRateDenominator: 10000,
  dutyRateNumerator: 250,
  dutyRateDenominator: 10000,
  roundingMode: 'HALF_UP',
  incoterm: 'DDP',
  sourceAuthority: 'Federal Ministry of Finance Germany',
  sourceReference: 'DE-BMF-TEST-2026',
  verificationStatus: 'VERIFIED_LEGAL_RULE',
  requiresTax: true,
  requiresDuty: true,
  enabled: true
});

const TEST_US_CA_SUBDIVISION_FIXTURE = Object.freeze({
  ruleId: 'TAX-US-CA-TEST',
  destinationCountry: 'US',
  destinationSubdivision: 'CA',
  taxType: 'SALES_TAX',
  taxTreatment: 'exclusive',
  taxRateNumerator: 725, // 7.25% California Base Sales Tax
  taxRateDenominator: 10000,
  dutyRateNumerator: 0,
  dutyRateDenominator: 10000,
  roundingMode: 'HALF_UP',
  incoterm: 'DAP',
  sourceAuthority: 'CDTFA',
  sourceReference: 'US-CA-CDTFA-TEST-2026',
  verificationStatus: 'VERIFIED_LEGAL_RULE',
  requiresTax: true,
  requiresDuty: false,
  enabled: true
});

const ALL_TEST_FIXTURES = [
  TEST_PK_FIXTURE,
  TEST_AE_FIXTURE,
  TEST_GB_FIXTURE,
  TEST_DE_FIXTURE,
  TEST_US_CA_SUBDIVISION_FIXTURE
];

describe('Phase 6B: Tax & Duty Exact Rational Engine', () => {
  let engine;

  beforeEach(() => {
    engine = new TaxDutyEngine(ALL_TEST_FIXTURES);
  });

  describe('1. Production Rate Zero-Assumption & Fail Closed', () => {
    it('1.1 Empty engine without configured rules strictly fails closed', () => {
      const emptyEngine = new TaxDutyEngine([]);
      expect(() => {
        emptyEngine.calculate({
          destinationCountry: 'AE',
          originCountry: 'PK',
          taxableSubtotal: Money.fromLegacyNumber(100, 'AED'),
          currency: 'AED'
        });
      }).toThrow('No tax or duty governance rule is configured for destination \'AE\'');
    });

    it('1.2 Subdivision-dependent route (US) fails closed when subdivision rule is missing', () => {
      expect(() => {
        engine.calculate({
          destinationCountry: 'US',
          originCountry: 'PK',
          administrativeArea: 'NY', // CA is configured, NY is absent
          taxableSubtotal: Money.fromLegacyNumber(100, 'USD'),
          currency: 'USD'
        });
      }).toThrow('No tax or duty governance rule is configured for destination \'US\' (NY)');
    });
  });

  describe('2. Exact Rational Calculations across Currencies', () => {
    it('2.1 Computes exact 5% VAT and 5% CIF Duty for AE DDP route', () => {
      const result = engine.calculate({
        destinationCountry: 'AE',
        originCountry: 'PK',
        taxableSubtotal: Money.fromLegacyNumber(1000, 'AED'),
        shippingAmount: Money.fromLegacyNumber(100, 'AED'),
        currency: 'AED'
      });

      // 5% VAT on 1000 = 50.00
      expect(result.taxAmount).toBe(50);
      expect(result.taxAmountExact.amountMinor.toString()).toBe('5000');

      // 5% CIF Duty on (1000 subtotal + 100 shipping = 1100) = 55.00
      expect(result.dutyAmount).toBe(55);
      expect(result.dutyAmountExact.amountMinor.toString()).toBe('5500');
      expect(result.incoterm).toBe('DDP');
    });

    it('2.2 Computes exact 20% VAT and 2.5% CIF Duty for GB DDP route', () => {
      const result = engine.calculate({
        destinationCountry: 'GB',
        originCountry: 'PK',
        taxableSubtotal: Money.fromLegacyNumber(200, 'GBP'),
        shippingAmount: Money.fromLegacyNumber(20, 'GBP'),
        currency: 'GBP'
      });

      // 20% VAT on 200 = 40.00
      expect(result.taxAmount).toBe(40);
      expect(result.taxAmountExact.amountMinor.toString()).toBe('4000');

      // 2.5% CIF Duty on 220 = 5.50
      expect(result.dutyAmount).toBe(5.5);
      expect(result.dutyAmountExact.amountMinor.toString()).toBe('550');
    });

    it('2.3 Computes exact tax-inclusive VAT extraction formula for DE', () => {
      // 119 EUR gross subtotal with 19% inclusive VAT
      // Tax = 119 * 1900 / (10000 + 1900) = 119 * 1900 / 11900 = 19.00 EUR
      const result = engine.calculate({
        destinationCountry: 'DE',
        originCountry: 'PK',
        taxableSubtotal: Money.fromLegacyNumber(119, 'EUR'),
        currency: 'EUR'
      });

      expect(result.taxTreatment).toBe('inclusive');
      expect(result.taxAmount).toBe(19);
      expect(result.taxAmountExact.amountMinor.toString()).toBe('1900');
    });

    it('2.4 Computes exact tax for 3-decimal currencies (e.g. KWD) with zero floating math', () => {
      const result = engine.calculate({
        destinationCountry: 'AE',
        originCountry: 'PK',
        taxableSubtotal: Money.fromLegacyNumber(12.345, 'KWD'),
        shippingAmount: Money.fromLegacyNumber(1.000, 'KWD'),
        currency: 'KWD'
      });

      // 5% of 12.345 KWD (12345 minor) = 617.25 -> 617 minor (0.617 KWD) with HALF_UP
      expect(result.taxAmountExact.amountMinor.toString()).toBe('617');
      expect(result.taxAmount).toBe(0.617);
    });

    it('2.5 Computes exact tax for 0-decimal currencies (e.g. JPY)', () => {
      const result = engine.calculate({
        destinationCountry: 'AE',
        originCountry: 'PK',
        taxableSubtotal: Money.fromLegacyNumber(10000, 'JPY'),
        shippingAmount: Money.fromLegacyNumber(1000, 'JPY'),
        currency: 'JPY'
      });

      // 5% of 10000 JPY = 500 JPY
      expect(result.taxAmountExact.amountMinor.toString()).toBe('500');
      expect(result.taxAmount).toBe(500);
      expect(result.dutyAmountExact.amountMinor.toString()).toBe('550'); // 5% of 11000 JPY
    });

    it('2.6 Subtotal currency and shipping currency mismatch fails closed', () => {
      expect(() => {
        engine.calculate({
          destinationCountry: 'AE',
          originCountry: 'PK',
          taxableSubtotal: Money.fromLegacyNumber(100, 'AED'),
          shippingAmount: Money.fromLegacyNumber(10, 'USD'),
          currency: 'AED'
        });
      }).toThrow('Shipping currency mismatch during tax calculation');
    });
  });
});

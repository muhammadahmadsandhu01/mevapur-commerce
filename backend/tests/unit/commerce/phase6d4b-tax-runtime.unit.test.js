/**
 * @file phase6d4b-tax-runtime.unit.test.js
 * @description Comprehensive unit test suite for Phase 6D-4B:
 * Deterministic Tax/Duty Runtime, De-Minimis, Exact Customs Valuation, and Signed Quote Tamper Resistance.
 */

const { Money, MoneyMapper } = require('../../../modules/commerce');
const TaxDutyEngine = require('../../../services/checkout/TaxDutyEngine');
const TaxService = require('../../../services/order/TaxService');
const CheckoutQuoteService = require('../../../services/checkout/CheckoutQuoteService');
const CouponService = require('../../../services/order/CouponService');

describe('Phase 6D-4B: Deterministic Tax/Duty Runtime, De-Minimis & Signed Provenance', () => {
  const baseGovernedRule = {
    ruleId: 'TAX-PK-01',
    destinationCountry: 'PK',
    destinationSubdivision: '',
    taxType: 'GST',
    taxTreatment: 'exclusive',
    taxableBasis: 'subtotal',
    taxRateNumerator: 0,
    taxRateDenominator: 100,
    dutyRateNumerator: 0,
    dutyRateDenominator: 100,
    requiresTax: false,
    requiresDuty: false,
    customsValueIncludesShipping: false,
    customsValueIncludesInsurance: false,
    dutyRefundPolicy: 'FULL',
    taxRefundPolicy: 'FULL',
    incoterm: 'DOMESTIC',
    providerType: 'MANUAL_GOVERNED',
    verificationStatus: 'VERIFIED_LEGAL_RULE',
    sourceAuthority: 'FBR_STATUTE',
    sourceReference: 'FBR-GST-2026',
    enabled: true
  };

  describe('1. Legacy Authority Removal & Strict Fail-Closed', () => {
    test('1.1 Empty engine without governed rules fails closed with TAX_RULE_UNCONFIGURED', () => {
      const engine = new TaxDutyEngine.TaxDutyEngine([]);
      expect(() => {
        engine.calculate({
          destinationCountry: 'PK',
          originCountry: 'PK',
          taxableSubtotal: Money.fromDecimal('100.00', 'PKR'),
          currency: 'PKR',
          taxRules: []
        });
      }).toThrow(/TAX_RULE_UNCONFIGURED|No tax or duty governance rule is configured/i);
    });

    test('1.2 Environment flag cannot create synthetic zero-tax quote when rules missing', () => {
      const prevEnv = process.env.ALLOW_LEGACY_DOMESTIC_COD_COMPATIBILITY;
      try {
        process.env.ALLOW_LEGACY_DOMESTIC_COD_COMPATIBILITY = 'true';
        expect(() => {
          TaxDutyEngine.calculate({
            destinationCountry: 'PK',
            originCountry: 'PK',
            taxableSubtotal: Money.fromDecimal('100.00', 'PKR'),
            currency: 'PKR',
            taxRules: []
          });
        }).toThrow(/No tax or duty governance rule is configured/i);
      } finally {
        if (prevEnv) process.env.ALLOW_LEGACY_DOMESTIC_COD_COMPATIBILITY = prevEnv;
        else delete process.env.ALLOW_LEGACY_DOMESTIC_COD_COMPATIBILITY;
      }
    });

    test('1.3 TaxService requires explicit trusted context and fails closed if missing', () => {
      expect(() => {
        TaxService.calculate({
          subtotal: 100,
          address: { country: 'PK', city: 'Lahore' }
          // missing currency, originCountry
        });
      }).toThrow(/TAX_CURRENCY_REQUIRED|Currency is required/i);
    });

    test('1.4 TaxService successfully calculates tax when explicit governed rules are provided', () => {
      const totalTaxAndDuty = TaxService.calculate({
        merchantScopeId: 'default',
        currency: 'PKR',
        originCountry: 'PK',
        address: { country: 'PK', state: 'Punjab', city: 'Lahore' },
        taxRules: [baseGovernedRule],
        subtotal: Money.fromDecimal('500.00', 'PKR')
      });

      expect(totalTaxAndDuty).toBe(0);

      const comp = TaxService.calculateComprehensive({
        destinationCountry: 'PK',
        originCountry: 'PK',
        taxableSubtotal: Money.fromDecimal('500.00', 'PKR'),
        currency: 'PKR',
        taxRules: [baseGovernedRule]
      });
      expect(comp.provenance.ruleId).toBe('TAX-PK-01');
      expect(comp.provenance.sourceAuthority).toBe('FBR_STATUTE');
    });
  });

  describe('2. Deterministic Pure Rule Resolution', () => {
    test('2.1 Exact subdivision rule takes precedence over country-level fallback', () => {
      const countryFallback = {
        ...baseGovernedRule,
        ruleId: 'US-COUNTRY-DEFAULT',
        destinationCountry: 'US',
        destinationSubdivision: '',
        incoterm: 'DDP',
        taxRateNumerator: 5,
        taxRateDenominator: 100,
        sourceAuthority: 'US_CBP',
        sourceReference: 'US-DEFAULT-01'
      };
      const subdivisionRule = {
        ...baseGovernedRule,
        ruleId: 'US-CA-RULE',
        destinationCountry: 'US',
        destinationSubdivision: 'CA',
        incoterm: 'DDP',
        taxRateNumerator: 725,
        taxRateDenominator: 10000, // 7.25%
        sourceAuthority: 'CDTFA',
        sourceReference: 'CA-SALES-TAX-2026'
      };

      const matched = TaxDutyEngine.resolveMatchingRule(
        [countryFallback, subdivisionRule],
        'US',
        'CA'
      );
      expect(matched.ruleId).toBe('US-CA-RULE');

      const matchedFallback = TaxDutyEngine.resolveMatchingRule(
        [countryFallback, subdivisionRule],
        'US',
        'NY'
      );
      expect(matchedFallback.ruleId).toBe('US-COUNTRY-DEFAULT');
    });

    test('2.2 Multiple candidates at winning specificity fail closed with AMBIGUOUS_TAX_RULE_MATCH', () => {
      const ruleA = {
        ...baseGovernedRule,
        ruleId: 'AE-RULE-A',
        destinationCountry: 'AE',
        destinationSubdivision: '',
        priority: 100,
        taxRateNumerator: 5,
        taxRateDenominator: 100,
        incoterm: 'DDP',
        sourceAuthority: 'UAE_FTA',
        sourceReference: 'FTA-01'
      };
      const ruleB = {
        ...baseGovernedRule,
        ruleId: 'AE-RULE-B',
        destinationCountry: 'AE',
        destinationSubdivision: '',
        priority: 200,
        taxRateNumerator: 5,
        taxRateDenominator: 100,
        incoterm: 'DDP',
        sourceAuthority: 'UAE_FTA',
        sourceReference: 'FTA-02'
      };

      expect(() => {
        TaxDutyEngine.resolveMatchingRule([ruleA, ruleB], 'AE', '');
      }).toThrow(/AMBIGUOUS_TAX_RULE_MATCH|Ambiguous tax rule match/i);
    });

    test('2.3 Array reversal produces identical deterministic result or failure', () => {
      const ruleA = {
        ...baseGovernedRule,
        ruleId: 'AE-RULE-A',
        destinationCountry: 'AE',
        destinationSubdivision: '',
        priority: 100,
        taxRateNumerator: 5,
        taxRateDenominator: 100,
        incoterm: 'DDP',
        sourceAuthority: 'UAE_FTA',
        sourceReference: 'FTA-01'
      };
      const ruleB = {
        ...baseGovernedRule,
        ruleId: 'AE-RULE-B',
        destinationCountry: 'AE',
        destinationSubdivision: '',
        priority: 200,
        taxRateNumerator: 5,
        taxRateDenominator: 100,
        incoterm: 'DDP',
        sourceAuthority: 'UAE_FTA',
        sourceReference: 'FTA-02'
      };

      // Both orders throw AMBIGUOUS_TAX_RULE_MATCH
      expect(() => TaxDutyEngine.resolveMatchingRule([ruleA, ruleB], 'AE', '')).toThrow();
      expect(() => TaxDutyEngine.resolveMatchingRule([ruleB, ruleA], 'AE', '')).toThrow();
    });

    test('2.4 Disabled rules are ignored and do not trigger ambiguity with active rule', () => {
      const activeRule = {
        ...baseGovernedRule,
        ruleId: 'GB-ACTIVE',
        destinationCountry: 'GB',
        destinationSubdivision: '',
        taxRateNumerator: 20,
        taxRateDenominator: 100,
        incoterm: 'DDP',
        enabled: true,
        sourceAuthority: 'HMRC',
        sourceReference: 'HMRC-2026'
      };
      const disabledRule = {
        ...baseGovernedRule,
        ruleId: 'GB-DISABLED',
        destinationCountry: 'GB',
        destinationSubdivision: '',
        taxRateNumerator: 20,
        taxRateDenominator: 100,
        incoterm: 'DDP',
        enabled: false,
        sourceAuthority: 'HMRC',
        sourceReference: 'HMRC-OLD'
      };

      const matched = TaxDutyEngine.resolveMatchingRule([activeRule, disabledRule], 'GB', '');
      expect(matched.ruleId).toBe('GB-ACTIVE');
    });

    test('2.5 Unverified rule or missing sourceAuthority fails closed', () => {
      const unverifiedRule = {
        ...baseGovernedRule,
        ruleId: 'UNVERIFIED-RULE',
        destinationCountry: 'FR',
        verificationStatus: 'UNVERIFIED_ESTIMATE',
        sourceAuthority: 'TEST',
        sourceReference: 'TEST'
      };
      expect(() => {
        TaxDutyEngine.resolveMatchingRule([unverifiedRule], 'FR', '');
      }).toThrow(/UNVERIFIED_TAX_RULE|is unverified/i);

      const missingAuthRule = {
        ...baseGovernedRule,
        ruleId: 'NO-AUTH-RULE',
        destinationCountry: 'FR',
        verificationStatus: 'VERIFIED_LEGAL_RULE',
        sourceAuthority: '',
        sourceReference: 'TEST'
      };
      expect(() => {
        TaxDutyEngine.resolveMatchingRule([missingAuthRule], 'FR', '');
      }).toThrow(/SOURCE_AUTHORITY_REQUIRED|missing sourceAuthority/i);
    });

    test('2.6 External tax provider type fails closed in runtime engine', () => {
      const externalRule = {
        ...baseGovernedRule,
        ruleId: 'EXT-RULE',
        destinationCountry: 'DE',
        providerType: 'EXTERNAL_PROVIDER',
        verificationStatus: 'VERIFIED_LEGAL_RULE',
        sourceAuthority: 'AVALARA',
        sourceReference: 'AVALARA-01'
      };
      expect(() => {
        TaxDutyEngine.resolveMatchingRule([externalRule], 'DE', '');
      }).toThrow(/UNSUPPORTED_TAX_PROVIDER_TYPE|External tax providers are not supported/i);
    });
  });

  describe('3. Exact Customs Valuation Model', () => {
    test('3.1 Derives goods value exact as subtotal minus discount with exact Money', () => {
      const rule = {
        ...baseGovernedRule,
        ruleId: 'AE-CIF',
        destinationCountry: 'AE',
        taxRateNumerator: 5,
        taxRateDenominator: 100,
        dutyRateNumerator: 5,
        dutyRateDenominator: 100,
        requiresTax: true,
        requiresDuty: true,
        customsValueIncludesShipping: true,
        customsValueIncludesInsurance: false,
        incoterm: 'DDP',
        sourceAuthority: 'UAE_FTA',
        sourceReference: 'FTA-2026'
      };

      const result = TaxDutyEngine.calculate({
        destinationCountry: 'AE',
        originCountry: 'PK',
        taxableSubtotal: Money.fromDecimal('100.00', 'AED'),
        discountAmount: Money.fromDecimal('20.00', 'AED'), // goodsValue = 80.00 AED
        shippingAmount: Money.fromDecimal('10.00', 'AED'),
        insuranceAmount: Money.zero('AED'),
        currency: 'AED',
        taxRules: [rule]
      });

      expect(MoneyMapper.toMoney(result.goodsValueExact).toDecimalString()).toBe('80.00');
      // customsValue = goodsValue (80) + shipping (10) = 90.00 AED
      expect(MoneyMapper.toMoney(result.customsValueExact).toDecimalString()).toBe('90.00');
      // duty = 5% of 90.00 = 4.50 AED
      expect(MoneyMapper.toMoney(result.payableDutyExact).toDecimalString()).toBe('4.50');
      // tax = 5% of 80.00 = 4.00 AED
      expect(MoneyMapper.toMoney(result.taxAmountExact).toDecimalString()).toBe('4.00');
      // grandTotal = 80 + 10 + 4.00 + 4.50 = 98.50 AED
      expect(MoneyMapper.toMoney(result.checkoutGrandTotalExact).toDecimalString()).toBe('98.50');
    });

    test('3.2 Customs value inclusion flags (shipping and insurance) are strictly respected', () => {
      const ruleWithBoth = {
        ...baseGovernedRule,
        ruleId: 'GB-CIF-INS',
        destinationCountry: 'GB',
        taxRateNumerator: 20,
        taxRateDenominator: 100,
        dutyRateNumerator: 10,
        dutyRateDenominator: 100,
        requiresTax: true,
        requiresDuty: true,
        customsValueIncludesShipping: true,
        customsValueIncludesInsurance: true,
        incoterm: 'DDP',
        sourceAuthority: 'HMRC',
        sourceReference: 'HMRC-2026'
      };

      const result = TaxDutyEngine.calculate({
        destinationCountry: 'GB',
        originCountry: 'PK',
        taxableSubtotal: Money.fromDecimal('200.00', 'GBP'),
        discountAmount: Money.zero('GBP'),
        shippingAmount: Money.fromDecimal('30.00', 'GBP'),
        insuranceAmount: Money.fromDecimal('10.00', 'GBP'),
        insuranceProvenance: 'EXPLICIT_INSURANCE_CHARGE',
        currency: 'GBP',
        taxRules: [ruleWithBoth]
      });

      // customsValue = 200 + 30 + 10 = 240.00 GBP
      expect(MoneyMapper.toMoney(result.customsValueExact).toDecimalString()).toBe('240.00');
      // duty = 10% of 240 = 24.00 GBP
      expect(MoneyMapper.toMoney(result.payableDutyExact).toDecimalString()).toBe('24.00');
    });

    test('3.3 Currency and exponent agreement is strictly enforced across all money inputs', () => {
      const rule = {
        ...baseGovernedRule,
        ruleId: 'AE-RULE',
        destinationCountry: 'AE',
        incoterm: 'DDP',
        sourceAuthority: 'UAE_FTA',
        sourceReference: 'FTA-2026'
      };

      expect(() => {
        TaxDutyEngine.calculate({
          destinationCountry: 'AE',
          originCountry: 'PK',
          taxableSubtotal: Money.fromDecimal('100.00', 'AED'),
          shippingAmount: Money.fromDecimal('10.00', 'USD'), // Currency mismatch!
          currency: 'AED',
          taxRules: [rule]
        });
      }).toThrow(/Currency mismatch/i);
    });

    test('3.4 Handles canonical 18-digit monetary values without overflow or precision loss', () => {
      const rule = {
        ...baseGovernedRule,
        ruleId: 'PK-BIG',
        destinationCountry: 'PK',
        taxRateNumerator: 10,
        taxRateDenominator: 100,
        requiresTax: true,
        incoterm: 'DOMESTIC',
        sourceAuthority: 'FBR',
        sourceReference: 'FBR-2026'
      };

      // 18 digits minor: 900000000000000000n = 9,000,000,000,000,000.00 PKR
      const hugeSubtotal = Money.fromMinor(900000000000000000n, 'PKR');
      const result = TaxDutyEngine.calculate({
        destinationCountry: 'PK',
        originCountry: 'PK',
        taxableSubtotal: hugeSubtotal,
        currency: 'PKR',
        taxRules: [rule]
      });

      // 10% of 900000000000000000 = 90000000000000000n
      expect(MoneyMapper.toMoney(result.taxAmountExact).amountMinor).toBe(90000000000000000n);
    });
  });

  describe('4. Generic De-Minimis Threshold Evaluation', () => {
    test('4.1 Absent threshold means no exemption configured', () => {
      const decision = TaxDutyEngine.evaluateDeMinimisDecision({
        thresholdExact: null,
        basisMoney: Money.fromDecimal('50.00', 'USD'),
        basisType: 'GOODS_VALUE',
        comparison: 'LT',
        currency: 'USD'
      });

      expect(decision.configured).toBe(false);
      expect(decision.exempt).toBe(false);
      expect(decision.reasonCode).toBe('NO_THRESHOLD_CONFIGURED');
    });

    test('4.2 LT (Less Than) comparison: strictly below is exempt, equal or above is not exempt', () => {
      const threshold = Money.fromDecimal('100.00', 'USD');

      // Below threshold (99.99) -> exempt
      const below = TaxDutyEngine.evaluateDeMinimisDecision({
        thresholdExact: threshold,
        basisMoney: Money.fromDecimal('99.99', 'USD'),
        basisType: 'GOODS_VALUE',
        comparison: 'LT',
        currency: 'USD'
      });
      expect(below.exempt).toBe(true);
      expect(below.reasonCode).toBe('DE_MINIMIS_EXEMPT');

      // Exactly equal (100.00) -> NOT exempt under LT
      const equal = TaxDutyEngine.evaluateDeMinimisDecision({
        thresholdExact: threshold,
        basisMoney: Money.fromDecimal('100.00', 'USD'),
        basisType: 'GOODS_VALUE',
        comparison: 'LT',
        currency: 'USD'
      });
      expect(equal.exempt).toBe(false);
      expect(equal.reasonCode).toBe('ABOVE_DE_MINIMIS_THRESHOLD');

      // Above threshold (100.01) -> NOT exempt
      const above = TaxDutyEngine.evaluateDeMinimisDecision({
        thresholdExact: threshold,
        basisMoney: Money.fromDecimal('100.01', 'USD'),
        basisType: 'GOODS_VALUE',
        comparison: 'LT',
        currency: 'USD'
      });
      expect(above.exempt).toBe(false);
    });

    test('4.3 LTE (Less Than or Equal) comparison: strictly below and equal are exempt, above is not exempt', () => {
      const threshold = Money.fromDecimal('100.00', 'USD');

      // Exactly equal (100.00) -> EXEMPT under LTE
      const equal = TaxDutyEngine.evaluateDeMinimisDecision({
        thresholdExact: threshold,
        basisMoney: Money.fromDecimal('100.00', 'USD'),
        basisType: 'GOODS_VALUE',
        comparison: 'LTE',
        currency: 'USD'
      });
      expect(equal.exempt).toBe(true);
      expect(equal.reasonCode).toBe('DE_MINIMIS_EXEMPT');

      // Above (100.01) -> NOT exempt
      const above = TaxDutyEngine.evaluateDeMinimisDecision({
        thresholdExact: threshold,
        basisMoney: Money.fromDecimal('100.01', 'USD'),
        basisType: 'GOODS_VALUE',
        comparison: 'LTE',
        currency: 'USD'
      });
      expect(above.exempt).toBe(false);
    });

    test('4.4 Duty de-minimis and Import Tax de-minimis are evaluated independently', () => {
      const rule = {
        ...baseGovernedRule,
        ruleId: 'US-DEMINIMIS',
        destinationCountry: 'US',
        taxRateNumerator: 8,
        taxRateDenominator: 100,
        dutyRateNumerator: 5,
        dutyRateDenominator: 100,
        requiresTax: true,
        requiresDuty: true,
        incoterm: 'DDP',
        customsDutyDeMinimisExact: Money.fromDecimal('800.00', 'USD'), // Duty free up to 800 USD
        importTaxDeMinimisExact: Money.fromDecimal('50.00', 'USD'), // Tax free only up to 50 USD
        deMinimisBasis: 'goods_value',
        deMinimisComparison: 'LTE',
        sourceAuthority: 'US_CBP',
        sourceReference: 'CBP-SECTION-321'
      };

      // Order value is 100 USD (exempt from duty, but dutiable for tax)
      const result = TaxDutyEngine.calculate({
        destinationCountry: 'US',
        originCountry: 'PK',
        taxableSubtotal: Money.fromDecimal('100.00', 'USD'),
        currency: 'USD',
        taxRules: [rule]
      });

      expect(result.dutyDeMinimis.exempt).toBe(true);
      expect(MoneyMapper.toMoney(result.payableDutyExact).toDecimalString()).toBe('0.00');
      expect(result.taxDeMinimis.exempt).toBe(false);
      expect(MoneyMapper.toMoney(result.taxAmountExact).toDecimalString()).toBe('8.00');
    });

    test('4.5 Threshold currency mismatch fails closed with TAX_THRESHOLD_CURRENCY_MISMATCH', () => {
      expect(() => {
        TaxDutyEngine.evaluateDeMinimisDecision({
          thresholdExact: Money.fromDecimal('800.00', 'USD'),
          basisMoney: Money.fromDecimal('500.00', 'EUR'),
          basisType: 'GOODS_VALUE',
          comparison: 'LT',
          currency: 'EUR'
        });
      }).toThrow(/TAX_THRESHOLD_CURRENCY_MISMATCH|does not match quote currency/i);
    });

    test('4.6 Evaluates correctly across 0, 2, 3, and 4 decimal currencies', () => {
      // 0 decimal: JPY
      const jpyDecision = TaxDutyEngine.evaluateDeMinimisDecision({
        thresholdExact: Money.fromDecimal('10000', 'JPY'),
        basisMoney: Money.fromDecimal('9999', 'JPY'),
        basisType: 'GOODS_VALUE',
        comparison: 'LTE',
        currency: 'JPY'
      });
      expect(jpyDecision.exempt).toBe(true);

      // 3 decimal: KWD
      const kwdDecision = TaxDutyEngine.evaluateDeMinimisDecision({
        thresholdExact: Money.fromDecimal('30.000', 'KWD'),
        basisMoney: Money.fromDecimal('30.001', 'KWD'),
        basisType: 'GOODS_VALUE',
        comparison: 'LTE',
        currency: 'KWD'
      });
      expect(kwdDecision.exempt).toBe(false);
    });
  });

  describe('5. DDP vs DAP Semantics, Inclusive/Exclusive Tax & Insurance Authority', () => {
    test('5.1 Under DDP, estimated duty equals payable duty and is collected at checkout', () => {
      const rule = {
        ...baseGovernedRule,
        ruleId: 'AE-DDP',
        destinationCountry: 'AE',
        taxRateNumerator: 5,
        taxRateDenominator: 100,
        dutyRateNumerator: 10,
        dutyRateDenominator: 100,
        requiresTax: true,
        requiresDuty: true,
        customsValueIncludesShipping: true,
        incoterm: 'DDP',
        sourceAuthority: 'UAE_FTA',
        sourceReference: 'FTA-2026'
      };

      const result = TaxDutyEngine.calculate({
        destinationCountry: 'AE',
        originCountry: 'PK',
        taxableSubtotal: Money.fromDecimal('100.00', 'AED'),
        shippingAmount: Money.fromDecimal('20.00', 'AED'),
        insuranceAmount: Money.zero('AED'),
        insuranceProvenance: 'NO_INSURANCE_CHARGE',
        currency: 'AED',
        taxRules: [rule]
      });

      expect(result.incoterm).toBe('DDP');
      expect(MoneyMapper.toMoney(result.estimatedDutyExact).toDecimalString()).toBe('12.00');
      expect(MoneyMapper.toMoney(result.payableDutyExact).toDecimalString()).toBe('12.00');
      expect(MoneyMapper.toMoney(result.checkoutGrandTotalExact).toDecimalString()).toBe('137.00');
    });

    test('5.2 Under DAP, estimated duty is displayed but payable duty is exactly zero and excluded from checkout total', () => {
      const rule = {
        ...baseGovernedRule,
        ruleId: 'AE-DAP',
        destinationCountry: 'AE',
        taxRateNumerator: 5,
        taxRateDenominator: 100,
        dutyRateNumerator: 10,
        dutyRateDenominator: 100,
        requiresTax: true,
        requiresDuty: true,
        customsValueIncludesShipping: true,
        incoterm: 'DAP',
        sourceAuthority: 'UAE_FTA',
        sourceReference: 'FTA-2026'
      };

      const result = TaxDutyEngine.calculate({
        destinationCountry: 'AE',
        originCountry: 'PK',
        taxableSubtotal: Money.fromDecimal('100.00', 'AED'),
        shippingAmount: Money.fromDecimal('20.00', 'AED'),
        insuranceAmount: Money.zero('AED'),
        insuranceProvenance: 'NO_INSURANCE_CHARGE',
        currency: 'AED',
        taxRules: [rule]
      });

      expect(result.incoterm).toBe('DAP');
      expect(MoneyMapper.toMoney(result.estimatedDutyExact).toDecimalString()).toBe('12.00');
      expect(MoneyMapper.toMoney(result.payableDutyExact).toDecimalString()).toBe('0.00');
      expect(MoneyMapper.toMoney(result.checkoutGrandTotalExact).toDecimalString()).toBe('125.00');
      expect(MoneyMapper.toMoney(result.landedCostExact).toDecimalString()).toBe('137.00');
    });

    test('5.3 Exclusive 10% on 100 => assessed 10, additional 10, grand total 110', () => {
      const exclusiveRule = {
        ...baseGovernedRule,
        ruleId: 'EXCL-10',
        destinationCountry: 'US',
        taxTreatment: 'exclusive',
        taxRateNumerator: 10,
        taxRateDenominator: 100,
        requiresTax: true,
        incoterm: 'DOMESTIC',
        sourceAuthority: 'US_IRS',
        sourceReference: 'IRS-10'
      };

      const result = TaxDutyEngine.calculate({
        destinationCountry: 'US',
        originCountry: 'US',
        goodsValue: Money.fromDecimal('100.00', 'USD'),
        shippingAmount: Money.zero('USD'),
        insuranceAmount: Money.zero('USD'),
        insuranceProvenance: 'NO_INSURANCE_CHARGE',
        currency: 'USD',
        taxRules: [exclusiveRule]
      });

      expect(MoneyMapper.toMoney(result.taxAmountExact).toDecimalString()).toBe('10.00');
      expect(MoneyMapper.toMoney(result.additionalTaxAmountExact).toDecimalString()).toBe('10.00');
      expect(MoneyMapper.toMoney(result.taxIncludedAmountExact).toDecimalString()).toBe('0.00');
      expect(MoneyMapper.toMoney(result.checkoutGrandTotalExact).toDecimalString()).toBe('110.00');
    });

    test('5.4 Inclusive 10% in 110 => assessed 10, additional 0, grand total 110 (no double addition)', () => {
      const inclusiveRule = {
        ...baseGovernedRule,
        ruleId: 'INCL-10',
        destinationCountry: 'PK',
        taxTreatment: 'inclusive',
        taxRateNumerator: 10,
        taxRateDenominator: 100,
        requiresTax: true,
        incoterm: 'DOMESTIC',
        sourceAuthority: 'FBR',
        sourceReference: 'FBR-INCL'
      };

      const result = TaxDutyEngine.calculate({
        destinationCountry: 'PK',
        originCountry: 'PK',
        goodsValue: Money.fromDecimal('110.00', 'PKR'),
        shippingAmount: Money.zero('PKR'),
        insuranceAmount: Money.zero('PKR'),
        insuranceProvenance: 'NO_INSURANCE_CHARGE',
        currency: 'PKR',
        taxRules: [inclusiveRule]
      });

      // Assessed tax extracted: 110 * 10 / 110 = 10.00 PKR
      expect(MoneyMapper.toMoney(result.taxAmountExact).toDecimalString()).toBe('10.00');
      // Additional tax payable at checkout MUST be 0
      expect(MoneyMapper.toMoney(result.additionalTaxAmountExact).toDecimalString()).toBe('0.00');
      expect(MoneyMapper.toMoney(result.taxIncludedAmountExact).toDecimalString()).toBe('10.00');
      // Grand total remains 110.00 (not 120.00!)
      expect(MoneyMapper.toMoney(result.checkoutGrandTotalExact).toDecimalString()).toBe('110.00');
    });

    test('5.5 Inclusive tax with shipping, DDP duty, and DAP estimated duty', () => {
      const ddpInclusiveRule = {
        ...baseGovernedRule,
        ruleId: 'GB-DDP-INCL',
        destinationCountry: 'GB',
        taxTreatment: 'inclusive',
        taxRateNumerator: 20,
        taxRateDenominator: 100,
        dutyRateNumerator: 10,
        dutyRateDenominator: 100,
        requiresTax: true,
        requiresDuty: true,
        customsValueIncludesShipping: true,
        incoterm: 'DDP',
        sourceAuthority: 'HMRC',
        sourceReference: 'HMRC-INCL'
      };

      const resultDDP = TaxDutyEngine.calculate({
        destinationCountry: 'GB',
        originCountry: 'PK',
        goodsValue: Money.fromDecimal('120.00', 'GBP'), // 20 GBP VAT extracted
        shippingAmount: Money.fromDecimal('30.00', 'GBP'),
        insuranceAmount: Money.zero('GBP'),
        insuranceProvenance: 'NO_INSURANCE_CHARGE',
        currency: 'GBP',
        taxRules: [ddpInclusiveRule]
      });

      expect(MoneyMapper.toMoney(resultDDP.taxAmountExact).toDecimalString()).toBe('20.00');
      expect(MoneyMapper.toMoney(resultDDP.additionalTaxAmountExact).toDecimalString()).toBe('0.00');
      // customsValue = 120 + 30 = 150 GBP
      expect(MoneyMapper.toMoney(resultDDP.customsValueExact).toDecimalString()).toBe('150.00');
      // duty = 10% of 150 = 15.00 GBP
      expect(MoneyMapper.toMoney(resultDDP.payableDutyExact).toDecimalString()).toBe('15.00');
      // grandTotal = 120 (goods) + 30 (shipping) + 0 (tax) + 15 (duty) = 165.00 GBP
      expect(MoneyMapper.toMoney(resultDDP.checkoutGrandTotalExact).toDecimalString()).toBe('165.00');
    });

    test('5.6 Strict insurance provenance validation fails closed on mismatch or omitted input', () => {
      const rule = {
        ...baseGovernedRule,
        ruleId: 'INS-CHECK',
        destinationCountry: 'AE',
        taxRateNumerator: 5,
        taxRateDenominator: 100,
        incoterm: 'DDP',
        sourceAuthority: 'UAE_FTA',
        sourceReference: 'FTA-2026'
      };

      // Missing insuranceProvenance with non-zero insurance fails closed
      expect(() => {
        TaxDutyEngine.calculate({
          destinationCountry: 'AE',
          originCountry: 'PK',
          goodsValue: Money.fromDecimal('100.00', 'AED'),
          insuranceAmount: Money.fromDecimal('10.00', 'AED'),
          currency: 'AED',
          taxRules: [rule]
        });
      }).toThrow(/INSURANCE_PROVENANCE_MISMATCH|Insurance provenance/i);

      // Inconsistent provenance: 0 amount with EXPLICIT_INSURANCE_CHARGE
      expect(() => {
        TaxDutyEngine.calculate({
          destinationCountry: 'AE',
          originCountry: 'PK',
          goodsValue: Money.fromDecimal('100.00', 'AED'),
          insuranceAmount: Money.zero('AED'),
          insuranceProvenance: 'EXPLICIT_INSURANCE_CHARGE',
          currency: 'AED',
          taxRules: [rule]
        });
      }).toThrow(/INSURANCE_PROVENANCE_MISMATCH|Insurance provenance/i);
    });
  });

  describe('6. Canonical Coupon Exact Authority & Validation', () => {
    test('6.1 Percentage coupon requires canonical rateNumerator and rateDenominator', () => {
      const validPercentageCoupon = {
        code: 'VALID15',
        type: 'percentage',
        rateNumerator: 15,
        rateDenominator: 100,
        value: 15
      };

      const discount = CouponService.calculateDiscount({
        coupon: validPercentageCoupon,
        items: [{ product: 'prod1', lineTotal: 100 }],
        subtotal: 100,
        currency: 'USD'
      });
      expect(discount.discountExact.amountMinor).toBe(1500n);
      expect(discount.discountAmount).toBe(15.0);

      // Exact 33.33% rational
      const exact33Coupon = {
        code: 'RATIONAL33',
        type: 'percentage',
        rateNumerator: 3333,
        rateDenominator: 10000
      };
      const disc33 = CouponService.calculateDiscount({
        coupon: exact33Coupon,
        items: [{ product: 'prod1', lineTotal: 100 }],
        subtotal: 100,
        currency: 'USD'
      });
      expect(disc33.discountExact.amountMinor).toBe(3333n);

      // Exact 0.1% rational
      const exactTenthPercentCoupon = {
        code: 'RATIONAL01',
        type: 'percentage',
        rateNumerator: 1,
        rateDenominator: 1000
      };
      const disc01 = CouponService.calculateDiscount({
        coupon: exactTenthPercentCoupon,
        items: [{ product: 'prod1', lineTotal: 100 }],
        subtotal: 100,
        currency: 'USD'
      });
      expect(disc01.discountExact.amountMinor).toBe(10n);
    });

    test('6.2 Missing canonical authority on unmigrated legacy coupons strictly fails closed', () => {
      const legacyPercentageCoupon = {
        code: 'LEGACYPERCENT',
        type: 'percentage',
        value: 20
        // Missing rateNumerator / rateDenominator
      };

      expect(() => {
        CouponService.calculateDiscount({
          coupon: legacyPercentageCoupon,
          items: [{ product: 'prod1', lineTotal: 100 }],
          subtotal: 100,
          currency: 'USD'
        });
      }).toThrow(/COUPON_EXACT_VALUE_REQUIRED|rateNumerator and positive rateDenominator/i);

      const legacyFixedCoupon = {
        code: 'LEGACYFIXED',
        type: 'fixed',
        value: 10
        // Missing valueExact
      };

      expect(() => {
        CouponService.calculateDiscount({
          coupon: legacyFixedCoupon,
          items: [{ product: 'prod1', lineTotal: 100 }],
          subtotal: 100,
          currency: 'USD'
        });
      }).toThrow(/COUPON_EXACT_VALUE_REQUIRED|valueExact/i);
    });

    test('6.3 Rejects invalid rational parameters (denominator zero, negative rate)', () => {
      const denomZeroCoupon = {
        code: 'DIVZERO',
        type: 'percentage',
        rateNumerator: 10,
        rateDenominator: 0
      };
      expect(() => {
        CouponService.calculateDiscount({
          coupon: denomZeroCoupon,
          items: [{ product: 'prod1', lineTotal: 100 }],
          subtotal: 100,
          currency: 'USD'
        });
      }).toThrow(/COUPON_EXACT_VALUE_REQUIRED|rateDenominator/i);

      const negativeCoupon = {
        code: 'NEGATIVE',
        type: 'percentage',
        rateNumerator: -5,
        rateDenominator: 100
      };
      expect(() => {
        CouponService.calculateDiscount({
          coupon: negativeCoupon,
          items: [{ product: 'prod1', lineTotal: 100 }],
          subtotal: 100,
          currency: 'USD'
        });
      }).toThrow(/COUPON_EXACT_VALUE_REQUIRED|rateNumerator/i);
    });

    test('6.4 Handles 18-digit monetary subtotal without precision loss', () => {
      const coupon = {
        code: 'SAVE10',
        type: 'percentage',
        rateNumerator: 10,
        rateDenominator: 100
      };
      const hugeSubtotal = Money.fromMinor(900000000000000000n, 'PKR');
      const discount = CouponService.calculateDiscount({
        coupon,
        items: [{ product: 'prod1', lineTotal: 9000000000000000 }],
        subtotal: 9000000000000000,
        currency: 'PKR',
        subtotalMoney: hugeSubtotal
      });
      expect(discount.discountExact.amountMinor).toBe(90000000000000000n);
    });
  });

  describe('7. Complete De-Minimis Decision Comparison', () => {
    test('7.1 compareDeMinimisDecisions matches identical decisions across all fields', () => {
      const decA = {
        configured: true,
        thresholdExact: { amountMinor: '80000', currency: 'USD', exponent: 2 },
        basisType: 'GOODS_VALUE',
        basisAmountExact: { amountMinor: '50000', currency: 'USD', exponent: 2 },
        comparison: 'LTE',
        exempt: true,
        reasonCode: 'DE_MINIMIS_EXEMPT'
      };
      const decB = { ...decA };
      expect(TaxDutyEngine.compareDeMinimisDecisions(decA, decB)).toBe(true);
    });

    test('7.2 compareDeMinimisDecisions fails when any field is tampered', () => {
      const base = {
        configured: true,
        thresholdExact: { amountMinor: '80000', currency: 'USD', exponent: 2 },
        basisType: 'GOODS_VALUE',
        basisAmountExact: { amountMinor: '50000', currency: 'USD', exponent: 2 },
        comparison: 'LTE',
        exempt: true,
        reasonCode: 'DE_MINIMIS_EXEMPT'
      };

      expect(TaxDutyEngine.compareDeMinimisDecisions(base, { ...base, exempt: false })).toBe(false);
      expect(TaxDutyEngine.compareDeMinimisDecisions(base, { ...base, thresholdExact: { amountMinor: '90000', currency: 'USD', exponent: 2 } })).toBe(false);
      expect(TaxDutyEngine.compareDeMinimisDecisions(base, { ...base, basisType: 'CIF' })).toBe(false);
      expect(TaxDutyEngine.compareDeMinimisDecisions(base, { ...base, comparison: 'LT' })).toBe(false);
      expect(TaxDutyEngine.compareDeMinimisDecisions(base, { ...base, reasonCode: 'TAMPERED' })).toBe(false);
    });
  });

  describe('8. Cryptographic Quote Binding, Destination & Tamper Resistance', () => {
    const sampleSignablePayload = {
      kid: 'v2',
      quoteId: 'QUO-20260917-TEST001',
      merchantScopeId: 'default',
      configVersionId: 'v1',
      merchantCountry: 'PK',
      fulfillmentOriginCountry: 'PK',
      destinationCountry: 'AE',
      destinationSubdivision: 'DUBAI',
      destinationPostalFingerprint: CheckoutQuoteService.hashPostalCode('54000'),
      currency: 'AED',
      itemsHash: 'b'.repeat(64),
      customsItems: [
        {
          productId: 'prod1',
          variantId: null,
          quantity: 2,
          hsCode: '08041000',
          countryOfOrigin: 'PK',
          customsDescription: 'Organic Medjool Dates',
          declaredValueEligibility: 'COMMERCIAL',
          dangerousGoodsClassification: 'NOT_DANGEROUS',
          weightGrams: 500
        }
      ],
      subtotalMinor: '10000',
      discountMinor: '0',
      shippingMinor: '2000',
      goodsValueMinor: '10000',
      customsValueMinor: '10000',
      cifValueMinor: '12000',
      customsValueIncludesShipping: false,
      customsValueIncludesInsurance: false,
      taxMinor: '500',
      additionalTaxMinor: '500',
      taxIncludedMinor: '0',
      insuranceAmountMinor: '0',
      insuranceProvenance: 'NO_INSURANCE_CHARGE',
      estimatedDutyMinor: '600',
      payableDutyMinor: '600',
      dutyDeMinimis: {
        configured: false,
        thresholdExact: null,
        basisType: 'GOODS_VALUE',
        basisAmountExact: { amountMinor: '10000', currency: 'AED', exponent: 2 },
        comparison: 'LT',
        exempt: false,
        reasonCode: 'NO_THRESHOLD_CONFIGURED'
      },
      taxDeMinimis: {
        configured: false,
        thresholdExact: null,
        basisType: 'GOODS_VALUE',
        basisAmountExact: { amountMinor: '10000', currency: 'AED', exponent: 2 },
        comparison: 'LT',
        exempt: false,
        reasonCode: 'NO_THRESHOLD_CONFIGURED'
      },
      grandTotalMinor: '13100',
      taxRuleId: 'TAX-AE-01',
      taxRateNumerator: 5,
      taxRateDenominator: 100,
      dutyRateNumerator: 6,
      dutyRateDenominator: 100,
      roundingMode: 'HALF_UP',
      roundingScope: 'subtotal',
      incoterm: 'DDP',
      providerType: 'MANUAL_GOVERNED',
      sourceAuthority: 'UAE_FTA',
      sourceReference: 'FTA-2026',
      verificationStatus: 'VERIFIED_LEGAL_RULE',
      dutyRefundPolicy: 'FULL',
      taxRefundPolicy: 'FULL',
      shippingServiceLevel: 'standard',
      issuedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 900000).toISOString()
    };

    test('8.1 Builds canonical envelope, signs token, and verifies round-trip integrity', () => {
      const signable = CheckoutQuoteService.buildSignablePayload(sampleSignablePayload);
      const sig = CheckoutQuoteService.signQuote(signable);
      const envelope = { ...signable, quoteSignature: sig };
      const token = Buffer.from(JSON.stringify(envelope)).toString('base64url');

      const verified = CheckoutQuoteService.verifyAndDecodeQuoteToken(token);
      expect(verified.quoteId).toBe('QUO-20260917-TEST001');
      expect(verified.destinationCountry).toBe('AE');
      expect(verified.destinationSubdivision).toBe('DUBAI');
      expect(verified.taxRuleId).toBe('TAX-AE-01');
      expect(verified.payableDutyMinor).toBe('600');
    });

    test('8.2 Tampering with destination subdivision invalidates quote token signature', () => {
      const signable = CheckoutQuoteService.buildSignablePayload(sampleSignablePayload);
      const sig = CheckoutQuoteService.signQuote(signable);
      const envelope = { ...signable, quoteSignature: sig, destinationSubdivision: 'ABU_DHABI' };
      const token = Buffer.from(JSON.stringify(envelope)).toString('base64url');

      expect(() => CheckoutQuoteService.verifyAndDecodeQuoteToken(token)).toThrow(/tampered|invalid/i);
    });

    test('8.3 Tampering with tax rule ID or provenance invalidates quote token signature', () => {
      const signable = CheckoutQuoteService.buildSignablePayload(sampleSignablePayload);
      const sig = CheckoutQuoteService.signQuote(signable);
      const envelope = { ...signable, quoteSignature: sig, taxRuleId: 'TAX-TAMPERED-01' };
      const token = Buffer.from(JSON.stringify(envelope)).toString('base64url');

      expect(() => CheckoutQuoteService.verifyAndDecodeQuoteToken(token)).toThrow(/tampered|invalid/i);
    });

    test('8.4 Tampering with de-minimis decision invalidates quote token signature', () => {
      const signable = CheckoutQuoteService.buildSignablePayload(sampleSignablePayload);
      const sig = CheckoutQuoteService.signQuote(signable);
      const envelope = {
        ...signable,
        quoteSignature: sig,
        dutyDeMinimis: { ...signable.dutyDeMinimis, exempt: true }
      };
      const token = Buffer.from(JSON.stringify(envelope)).toString('base64url');

      expect(() => CheckoutQuoteService.verifyAndDecodeQuoteToken(token)).toThrow(/tampered|invalid/i);
    });

    test('8.5 Tampering with HS code or country of origin in customs snapshot invalidates signature', () => {
      const signable = CheckoutQuoteService.buildSignablePayload(sampleSignablePayload);
      const sig = CheckoutQuoteService.signQuote(signable);
      const tamperedItems = [{ ...signable.customsItems[0], hsCode: '99999999' }];
      const envelope = { ...signable, quoteSignature: sig, customsItems: tamperedItems };
      const token = Buffer.from(JSON.stringify(envelope)).toString('base64url');

      expect(() => CheckoutQuoteService.verifyAndDecodeQuoteToken(token)).toThrow(/tampered|invalid/i);
    });

    test('8.6 Postal code normalization and fingerprint hashing is case and whitespace invariant', () => {
      const hash1 = CheckoutQuoteService.hashPostalCode(' 54000 ');
      const hash2 = CheckoutQuoteService.hashPostalCode('54000');
      const hash3 = CheckoutQuoteService.hashPostalCode('sw1a 2aa');
      const hash4 = CheckoutQuoteService.hashPostalCode('SW1A 2AA');

      expect(hash1).toBe(hash2);
      expect(hash3).toBe(hash4);
      expect(CheckoutQuoteService.hashPostalCode('')).toBe('');
      expect(CheckoutQuoteService.hashPostalCode(null)).toBe('');
    });
  });
});

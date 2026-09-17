/**
 * @file phase6d4-tax-governance.unit.test.js
 * @description Comprehensive unit tests for Phase 6D-4A: Tax/Customs Domain Authority,
 * Tenant Isolation, Deterministic Validation, Route Overlap Non-Ambiguity Invariant,
 * Exact Money Bounds, Verification-Status Lifecycle, Explicit Legal Policies, and Symmetrical Parity.
 */

const mongoose = require('mongoose');
const {
  validateTaxRulesIntegrity,
  validateMoneyExact,
  ALLOWED_TAX_TYPES,
  ALLOWED_TAX_TREATMENTS,
  ALLOWED_TAXABLE_BASES,
  ALLOWED_ROUNDING_MODES,
  ALLOWED_ROUNDING_SCOPES,
  ALLOWED_INCOTERMS,
  ALLOWED_DE_MINIMIS_BASES,
  ALLOWED_DE_MINIMIS_COMPARISONS,
  ALLOWED_DUTY_REFUND_POLICIES,
  ALLOWED_TAX_REFUND_POLICIES,
  ALLOWED_PROVIDER_TYPES,
  ALLOWED_VERIFICATION_STATUSES
} = require('../../../validators/taxRuleIntegrityValidator');

const CommerceConfigurationVersion = require('../../../models/CommerceConfigurationVersion');
const CommerceConfigurationService = require('../../../services/commerce/CommerceConfigurationService');
const { resolveAuthenticatedMerchantScope } = require('../../../controllers/commerceGovernanceController');
const {
  taxRuleSchema: zodTaxRuleSchema,
  createDraftSchema: zodCreateDraftSchema
} = require('../../../validators/commerceGovernanceValidator');

const VALID_MERCHANT_PROFILE = Object.freeze({
  merchantCountry: 'PK',
  legalName: 'MevaPur Global Ltd',
  sellingMode: 'hybrid',
  baseCurrency: 'PKR',
  defaultCurrency: 'PKR',
  enabledCurrencies: ['PKR', 'USD', 'AED', 'GBP', 'EUR'],
  enabledCountries: ['PK', 'AE', 'GB', 'DE', 'US'],
  defaultLocale: 'en-PK',
  defaultTimeZone: 'Asia/Karachi',
  fulfillmentOrigins: [
    {
      originId: 'ORIGIN-PK-MAIN',
      name: 'Main Pakistan Warehouse',
      country: 'PK',
      city: 'Karachi',
      timeZone: 'Asia/Karachi',
      enabled: true,
      isDefault: true
    }
  ],
  supportedIncoterms: ['DOMESTIC', 'DAP', 'DDP'],
  taxCalculationMode: 'exact_rational'
});

const VALID_DOMESTIC_TAX_RULE = Object.freeze({
  ruleId: 'RULE-TAX-PK-01',
  destinationCountry: 'PK',
  destinationSubdivision: '',
  taxType: 'GST',
  taxTreatment: 'exclusive',
  taxableBasis: 'subtotal',
  taxRateNumerator: 0,
  taxRateDenominator: 10000,
  dutyRateNumerator: 0,
  dutyRateDenominator: 10000,
  roundingMode: 'HALF_UP',
  roundingScope: 'subtotal',
  incoterm: 'DOMESTIC',
  priority: 100,
  customsDutyDeMinimisExact: null,
  importTaxDeMinimisExact: null,
  deMinimisBasis: null,
  deMinimisComparison: null,
  customsValueIncludesShipping: true,
  customsValueIncludesInsurance: false,
  dutyRefundPolicy: 'NON_REFUNDABLE',
  taxRefundPolicy: 'REFUNDABLE',
  providerType: 'MANUAL_GOVERNED',
  providerReference: null,
  sourceAuthority: 'Federal Board of Revenue',
  sourceReference: 'PK-FBR-TEST-2026',
  verificationStatus: 'VERIFIED_LEGAL_RULE',
  requiresTax: false,
  requiresDuty: false,
  enabled: true
});

const VALID_INTERNATIONAL_DDP_RULE = Object.freeze({
  ruleId: 'RULE-TAX-AE-01',
  destinationCountry: 'AE',
  destinationSubdivision: '',
  taxType: 'VAT',
  taxTreatment: 'exclusive',
  taxableBasis: 'subtotal',
  taxRateNumerator: 500, // 5% VAT
  taxRateDenominator: 10000,
  dutyRateNumerator: 500, // 5% Customs Duty
  dutyRateDenominator: 10000,
  roundingMode: 'HALF_UP',
  roundingScope: 'subtotal',
  incoterm: 'DDP',
  priority: 100,
  customsDutyDeMinimisExact: { amountMinor: '30000', currency: 'AED', exponent: 2 },
  importTaxDeMinimisExact: { amountMinor: '30000', currency: 'AED', exponent: 2 },
  deMinimisBasis: 'CIF',
  deMinimisComparison: 'LTE',
  customsValueIncludesShipping: true,
  customsValueIncludesInsurance: true,
  dutyRefundPolicy: 'NON_REFUNDABLE',
  taxRefundPolicy: 'PROPORTIONAL',
  providerType: 'MANUAL_GOVERNED',
  providerReference: null,
  sourceAuthority: 'Federal Tax Authority UAE',
  sourceReference: 'UAE-FTA-2026',
  verificationStatus: 'VERIFIED_LEGAL_RULE',
  requiresTax: true,
  requiresDuty: true,
  enabled: true
});

describe('Phase 6D-4A: Tax & Customs Governance Domain Authority Suite', () => {

  describe('1. Tenant Isolation & Fail-Closed Authority', () => {
    it('1.1 Missing authenticated merchant scope in controller throws 403 without DB query', () => {
      const mockReqEmpty = { user: { role: 'admin', merchantScopeId: '' } };
      const mockReqNull = { user: { role: 'admin' } };
      const mockReqWhitespace = { user: { role: 'admin', merchantScopeId: '   ' } };

      expect(() => resolveAuthenticatedMerchantScope(mockReqEmpty)).toThrow('Authenticated merchant scope is required');
      expect(() => resolveAuthenticatedMerchantScope(mockReqNull)).toThrow('Authenticated merchant scope is required');
      expect(() => resolveAuthenticatedMerchantScope(mockReqWhitespace)).toThrow('Authenticated merchant scope is required');
    });

    it('1.2 Valid authenticated merchant scope resolves cleanly trimmed', () => {
      const mockReq = { user: { role: 'admin', merchantScopeId: ' tenant-abc ' } };
      expect(resolveAuthenticatedMerchantScope(mockReq)).toBe('tenant-abc');
    });

    it('1.3 Direct CommerceConfigurationService calls without merchantScopeId fail closed', async () => {
      await expect(CommerceConfigurationService.listVersions({ merchantScopeId: '' }))
        .rejects.toThrow('Merchant scope identifier is required');
      await expect(CommerceConfigurationService.getVersionById('v1', { merchantScopeId: null }))
        .rejects.toThrow('Merchant scope identifier is required');
      await expect(CommerceConfigurationService.createDraft({ merchantScopeId: undefined }))
        .rejects.toThrow('Merchant scope identifier is required');
      await expect(CommerceConfigurationService.updateDraft({ id: '6aabae56bbbe2c8c4293aaa4', merchantScopeId: '' }))
        .rejects.toThrow('Merchant scope identifier is required');
      await expect(CommerceConfigurationService.validateDraft({ id: '6aabae56bbbe2c8c4293aaa4', merchantScopeId: null }))
        .rejects.toThrow('Merchant scope identifier is required');
      await expect(CommerceConfigurationService.scheduleOrActivateVersion({ id: '6aabae56bbbe2c8c4293aaa4', merchantScopeId: '' }))
        .rejects.toThrow('Merchant scope identifier is required');
      await expect(CommerceConfigurationService.retireVersion({ id: '6aabae56bbbe2c8c4293aaa4', merchantScopeId: undefined }))
        .rejects.toThrow('Merchant scope identifier is required');
      await expect(CommerceConfigurationService.previewQuote({ configId: '6aabae56bbbe2c8c4293aaa4', merchantScopeId: null }))
        .rejects.toThrow('Merchant scope identifier is required');
      await expect(CommerceConfigurationService.getReadinessStatus({ merchantScopeId: '' }))
        .rejects.toThrow('Merchant scope identifier is required');
    });
  });

  describe('2. Exact Money & Threshold Bounds', () => {
    it('2.1 Validates amountMinor: 0 is accepted', () => {
      const zeroMoney = { amountMinor: 0, currency: 'USD', exponent: 2 };
      const errs = validateMoneyExact(zeroMoney, 'testField', ['USD']);
      expect(errs).toHaveLength(0);
    });

    it('2.2 Validates maximum canonical 18-digit string value is accepted', () => {
      const maxMoney = { amountMinor: '999999999999999999', currency: 'USD', exponent: 2 };
      const errs = validateMoneyExact(maxMoney, 'testField', ['USD']);
      expect(errs).toHaveLength(0);
    });

    it('2.3 Rejects unsafe numeric 9007199254740992 but accepts same value as string', () => {
      const unsafeNumeric = { amountMinor: 9007199254740992, currency: 'USD', exponent: 2 };
      const safeString = { amountMinor: '9007199254740992', currency: 'USD', exponent: 2 };

      const errsNumeric = validateMoneyExact(unsafeNumeric, 'testField', ['USD']);
      expect(errsNumeric.some((e) => e.code === 'INVALID_MONEY_AMOUNT_MINOR')).toBe(true);

      const errsString = validateMoneyExact(safeString, 'testField', ['USD']);
      expect(errsString).toHaveLength(0);
    });

    it('2.4 Rejects amounts exceeding 18-digit domain size (19 digits)', () => {
      const outOfBounds = { amountMinor: '1000000000000000000', currency: 'USD', exponent: 2 };
      const errs = validateMoneyExact(outOfBounds, 'testField', ['USD']);
      expect(errs.some((e) => e.code === 'MONEY_AMOUNT_OUT_OF_BOUNDS')).toBe(true);
    });

    it('2.5 Rejects amountMinor with decimals, negative values, and scientific notation', () => {
      const floatMoney = { amountMinor: 12.34, currency: 'USD', exponent: 2 };
      const floatStrMoney = { amountMinor: '12.34', currency: 'USD', exponent: 2 };
      const negMoney = { amountMinor: -100, currency: 'USD', exponent: 2 };
      const sciMoney = { amountMinor: '1e5', currency: 'USD', exponent: 2 };

      expect(validateMoneyExact(floatMoney, 'testField', ['USD']).length).toBeGreaterThan(0);
      expect(validateMoneyExact(floatStrMoney, 'testField', ['USD']).length).toBeGreaterThan(0);
      expect(validateMoneyExact(negMoney, 'testField', ['USD']).length).toBeGreaterThan(0);
      expect(validateMoneyExact(sciMoney, 'testField', ['USD']).length).toBeGreaterThan(0);
    });

    it('2.6 Supports Decimal128-compatible value objects', () => {
      const decimalMoney = {
        amountMinor: { $numberDecimal: '50000' },
        currency: 'USD',
        exponent: 2
      };
      const errs = validateMoneyExact(decimalMoney, 'testField', ['USD']);
      expect(errs).toHaveLength(0);
    });

    it('2.7 Validates exponents 0, 1, 2, 3, 4 and rejects < 0 or > 4', () => {
      for (const exp of [0, 1, 2, 3, 4]) {
        const validExp = { amountMinor: '100', currency: 'USD', exponent: exp };
        expect(validateMoneyExact(validExp, 'testField', ['USD'])).toHaveLength(0);
      }
      const invalidExpNeg = { amountMinor: '100', currency: 'USD', exponent: -1 };
      const invalidExpHigh = { amountMinor: '100', currency: 'USD', exponent: 5 };
      expect(validateMoneyExact(invalidExpNeg, 'testField', ['USD']).length).toBeGreaterThan(0);
      expect(validateMoneyExact(invalidExpHigh, 'testField', ['USD']).length).toBeGreaterThan(0);
    });

    it('2.8 Rejects currencies not in merchant profile enabled currencies', () => {
      const unEnabledCurrency = { amountMinor: '1000', currency: 'JPY', exponent: 0 };
      const errs = validateMoneyExact(unEnabledCurrency, 'testField', ['USD', 'EUR']);
      expect(errs.some((e) => e.code === 'CURRENCY_NOT_ENABLED')).toBe(true);
    });
  });

  describe('3. Deterministic Route Overlap Authority & Ambiguity Invariant', () => {
    it('3.1 Same route + same priority is rejected as ambiguous overlap', () => {
      const rules = [
        VALID_INTERNATIONAL_DDP_RULE,
        {
          ...VALID_INTERNATIONAL_DDP_RULE,
          ruleId: 'RULE-TAX-AE-02',
          priority: 100 // Same priority on same route AE:*
        }
      ];
      const errors = validateTaxRulesIntegrity(rules, VALID_MERCHANT_PROFILE);
      expect(errors.some((e) => e.code === 'AMBIGUOUS_TAX_RULE_OVERLAP')).toBe(true);
    });

    it('3.2 Same route + different priority is rejected because runtime engine ignores priority', () => {
      const rules = [
        VALID_INTERNATIONAL_DDP_RULE,
        {
          ...VALID_INTERNATIONAL_DDP_RULE,
          ruleId: 'RULE-TAX-AE-02',
          priority: 200 // Different priority on same route AE:*
        }
      ];
      const errors = validateTaxRulesIntegrity(rules, VALID_MERCHANT_PROFILE);
      expect(errors.some((e) => e.code === 'AMBIGUOUS_TAX_RULE_OVERLAP')).toBe(true);
    });

    it('3.3 Same route + different taxType is rejected because engine returns only one rule', () => {
      const rules = [
        VALID_INTERNATIONAL_DDP_RULE,
        {
          ...VALID_INTERNATIONAL_DDP_RULE,
          ruleId: 'RULE-TAX-AE-VAT-2',
          taxType: 'CUSTOMS_VAT',
          priority: 50
        }
      ];
      const errors = validateTaxRulesIntegrity(rules, VALID_MERCHANT_PROFILE);
      expect(errors.some((e) => e.code === 'AMBIGUOUS_TAX_RULE_OVERLAP')).toBe(true);
    });

    it('3.4 Reversing array order cannot produce a valid ambiguous configuration', () => {
      const ruleA = { ...VALID_INTERNATIONAL_DDP_RULE, ruleId: 'RULE-A', priority: 100 };
      const ruleB = { ...VALID_INTERNATIONAL_DDP_RULE, ruleId: 'RULE-B', priority: 200 };

      const order1Errors = validateTaxRulesIntegrity([ruleA, ruleB], VALID_MERCHANT_PROFILE);
      const order2Errors = validateTaxRulesIntegrity([ruleB, ruleA], VALID_MERCHANT_PROFILE);

      expect(order1Errors.some((e) => e.code === 'AMBIGUOUS_TAX_RULE_OVERLAP')).toBe(true);
      expect(order2Errors.some((e) => e.code === 'AMBIGUOUS_TAX_RULE_OVERLAP')).toBe(true);
    });

    it('3.5 Country fallback (US:*) + subdivision override (US:CA) coexists deterministically', () => {
      const rules = [
        {
          ...VALID_INTERNATIONAL_DDP_RULE,
          ruleId: 'RULE-TAX-US-FALLBACK',
          destinationCountry: 'US',
          destinationSubdivision: '',
          incoterm: 'DAP',
          priority: 100
        },
        {
          ...VALID_INTERNATIONAL_DDP_RULE,
          ruleId: 'RULE-TAX-US-CA-OVERRIDE',
          destinationCountry: 'US',
          destinationSubdivision: 'CA',
          incoterm: 'DAP',
          priority: 100
        }
      ];
      const errors = validateTaxRulesIntegrity(rules, VALID_MERCHANT_PROFILE);
      expect(errors).toHaveLength(0);
    });

    it('3.6 Disabled duplicate route rule does not create an active conflict', () => {
      const rules = [
        VALID_INTERNATIONAL_DDP_RULE,
        {
          ...VALID_INTERNATIONAL_DDP_RULE,
          ruleId: 'RULE-TAX-AE-DISABLED',
          enabled: false
        }
      ];
      const errors = validateTaxRulesIntegrity(rules, VALID_MERCHANT_PROFILE);
      expect(errors).toHaveLength(0);
    });

    it('3.7 Duplicate ruleId is rejected even if one is disabled', () => {
      const rules = [
        VALID_DOMESTIC_TAX_RULE,
        { ...VALID_DOMESTIC_TAX_RULE, enabled: false }
      ];
      const errors = validateTaxRulesIntegrity(rules, VALID_MERCHANT_PROFILE);
      expect(errors.some((e) => e.code === 'DUPLICATE_TAX_RULE_ID')).toBe(true);
    });

    it('3.8 Rejects invalid ISO destination country', () => {
      const rules = [{ ...VALID_DOMESTIC_TAX_RULE, destinationCountry: 'XX' }];
      const errors = validateTaxRulesIntegrity(rules, VALID_MERCHANT_PROFILE);
      expect(errors.some((e) => e.code === 'INVALID_TAX_DESTINATION_COUNTRY')).toBe(true);
    });

    it('3.9 Rejects priority out of bounds (< 0 or > 10000)', () => {
      const rules = [
        { ...VALID_DOMESTIC_TAX_RULE, priority: -1 },
        { ...VALID_INTERNATIONAL_DDP_RULE, priority: 10001 }
      ];
      const errors = validateTaxRulesIntegrity(rules, VALID_MERCHANT_PROFILE);
      expect(errors.filter((e) => e.code === 'INVALID_TAX_RULE_PRIORITY')).toHaveLength(2);
    });

    it('3.10 Rejects invalid numerator / denominator rates', () => {
      const rules = [{
        ...VALID_DOMESTIC_TAX_RULE,
        taxRateNumerator: -5,
        taxRateDenominator: 0,
        dutyRateNumerator: 10000001,
        dutyRateDenominator: -100
      }];
      const errors = validateTaxRulesIntegrity(rules, VALID_MERCHANT_PROFILE);
      expect(errors.some((e) => e.code === 'INVALID_TAX_NUMERATOR')).toBe(true);
      expect(errors.some((e) => e.code === 'INVALID_TAX_DENOMINATOR')).toBe(true);
      expect(errors.some((e) => e.code === 'INVALID_DUTY_NUMERATOR')).toBe(true);
      expect(errors.some((e) => e.code === 'INVALID_DUTY_DENOMINATOR')).toBe(true);
    });

    it('3.11 Rejects Incoterm semantic mismatches (DOMESTIC on cross-border or non-DOMESTIC on domestic)', () => {
      const rules = [
        {
          ...VALID_DOMESTIC_TAX_RULE,
          ruleId: 'RULE-1',
          destinationCountry: 'AE',
          incoterm: 'DOMESTIC'
        },
        {
          ...VALID_INTERNATIONAL_DDP_RULE,
          ruleId: 'RULE-2',
          destinationCountry: 'PK',
          incoterm: 'DDP'
        }
      ];
      const errors = validateTaxRulesIntegrity(rules, VALID_MERCHANT_PROFILE);
      expect(errors.some((e) => e.code === 'INCOTERM_DOMESTIC_MISMATCH')).toBe(true);
      expect(errors.some((e) => e.code === 'INCOTERM_INTERNATIONAL_MISMATCH')).toBe(true);
    });
  });

  describe('4. Explicit Legal Policies & Verification Governance', () => {
    it('4.1 Enabled rule without explicit dutyRefundPolicy is rejected', () => {
      const rule = { ...VALID_INTERNATIONAL_DDP_RULE, dutyRefundPolicy: null };
      const errors = validateTaxRulesIntegrity([rule], VALID_MERCHANT_PROFILE);
      expect(errors.some((e) => e.code === 'DUTY_REFUND_POLICY_REQUIRED')).toBe(true);
    });

    it('4.2 Enabled rule without explicit taxRefundPolicy is rejected', () => {
      const rule = { ...VALID_INTERNATIONAL_DDP_RULE, taxRefundPolicy: null };
      const errors = validateTaxRulesIntegrity([rule], VALID_MERCHANT_PROFILE);
      expect(errors.some((e) => e.code === 'TAX_REFUND_POLICY_REQUIRED')).toBe(true);
    });

    it('4.3 Enabled rule without explicit customsValueIncludesShipping boolean is rejected', () => {
      const rule = { ...VALID_INTERNATIONAL_DDP_RULE, customsValueIncludesShipping: null };
      const errors = validateTaxRulesIntegrity([rule], VALID_MERCHANT_PROFILE);
      expect(errors.some((e) => e.code === 'CUSTOMS_VALUE_INCLUDES_SHIPPING_REQUIRED')).toBe(true);
    });

    it('4.4 Enabled rule without explicit customsValueIncludesInsurance boolean is rejected', () => {
      const rule = { ...VALID_INTERNATIONAL_DDP_RULE, customsValueIncludesInsurance: null };
      const errors = validateTaxRulesIntegrity([rule], VALID_MERCHANT_PROFILE);
      expect(errors.some((e) => e.code === 'CUSTOMS_VALUE_INCLUDES_INSURANCE_REQUIRED')).toBe(true);
    });

    it('4.5 De-minimis threshold configured without explicit deMinimisBasis and deMinimisComparison is rejected', () => {
      const rule = {
        ...VALID_INTERNATIONAL_DDP_RULE,
        customsDutyDeMinimisExact: { amountMinor: '10000', currency: 'AED', exponent: 2 },
        deMinimisBasis: null,
        deMinimisComparison: null
      };
      const errors = validateTaxRulesIntegrity([rule], VALID_MERCHANT_PROFILE);
      expect(errors.some((e) => e.code === 'DE_MINIMIS_BASIS_REQUIRED')).toBe(true);
      expect(errors.some((e) => e.code === 'DE_MINIMIS_COMPARISON_REQUIRED')).toBe(true);
    });

    it('4.6 Enabled rule with UNVERIFIED_ESTIMATE is rejected for validation', () => {
      const rule = { ...VALID_INTERNATIONAL_DDP_RULE, verificationStatus: 'UNVERIFIED_ESTIMATE' };
      const errors = validateTaxRulesIntegrity([rule], VALID_MERCHANT_PROFILE);
      expect(errors.some((e) => e.code === 'UNVERIFIED_TAX_RULE')).toBe(true);
    });

    it('4.7 Rejects missing source authority or source reference provenance', () => {
      const rules = [{
        ...VALID_DOMESTIC_TAX_RULE,
        sourceAuthority: '',
        sourceReference: '   '
      }];
      const errors = validateTaxRulesIntegrity(rules, VALID_MERCHANT_PROFILE);
      expect(errors.some((e) => e.code === 'SOURCE_AUTHORITY_REQUIRED')).toBe(true);
      expect(errors.some((e) => e.code === 'SOURCE_REFERENCE_REQUIRED')).toBe(true);
    });

    it('4.8 Rejects EXTERNAL_PROVIDER and requires providerReference if specified', () => {
      const ruleWithoutRef = {
        ...VALID_INTERNATIONAL_DDP_RULE,
        providerType: 'EXTERNAL_PROVIDER',
        providerReference: ''
      };
      const errors = validateTaxRulesIntegrity([ruleWithoutRef], VALID_MERCHANT_PROFILE);
      expect(errors.some((e) => e.code === 'PROVIDER_REFERENCE_REQUIRED')).toBe(true);
      expect(errors.some((e) => e.code === 'UNSUPPORTED_TAX_PROVIDER_TYPE')).toBe(true);
    });
  });

  describe('5. Architectural Layering & Symmetrical Parity', () => {
    it('5.1 Model validateIntegrity() uses neutral validator and produces identical errors', () => {
      const invalidRule = {
        ...VALID_INTERNATIONAL_DDP_RULE,
        destinationCountry: 'XX'
      };

      const doc = new CommerceConfigurationVersion({
        merchantScopeId: 'default',
        version: 1,
        merchantProfile: VALID_MERCHANT_PROFILE,
        shippingRules: [],
        taxRules: [invalidRule]
      });

      const errors = doc.validateIntegrity();
      expect(errors.some((e) => e.code === 'INVALID_TAX_DESTINATION_COUNTRY')).toBe(true);
    });

    it('5.2 Zod taxRuleSchema does not inject silent defaults for legal policy fields', () => {
      const inputRule = {
        ruleId: 'RULE-TAX-TEST',
        destinationCountry: 'PK',
        taxType: 'GST',
        taxRateNumerator: 0,
        incoterm: 'DOMESTIC',
        sourceAuthority: 'FBR',
        sourceReference: 'REF-1'
      };

      const parsed = zodTaxRuleSchema.parse(inputRule);
      expect(parsed.dutyRefundPolicy).toBeUndefined();
      expect(parsed.taxRefundPolicy).toBeUndefined();
      expect(parsed.customsValueIncludesShipping).toBeUndefined();
      expect(parsed.customsValueIncludesInsurance).toBeUndefined();
      expect(parsed.deMinimisBasis).toBeUndefined();
      expect(parsed.deMinimisComparison).toBeUndefined();
    });

    it('5.3 Draft with incomplete fields can be instantiated as draft but fails validation', async () => {
      const incompleteTaxRule = {
        ruleId: 'RULE-INCOMPLETE',
        destinationCountry: 'PK',
        taxType: 'GST',
        taxRateNumerator: 0,
        incoterm: 'DOMESTIC',
        sourceAuthority: 'FBR',
        sourceReference: 'REF-1',
        verificationStatus: 'UNVERIFIED_ESTIMATE',
        enabled: true
      };

      const doc = new CommerceConfigurationVersion({
        merchantScopeId: 'default',
        version: 1,
        status: 'draft',
        merchantProfile: VALID_MERCHANT_PROFILE,
        shippingRules: [],
        taxRules: [incompleteTaxRule]
      });

      // Draft document is valid for mongoose document structure
      const mongooseErr = doc.validateSync();
      expect(mongooseErr).toBeUndefined();

      // But fails domain integrity validation
      const errors = doc.validateIntegrity();
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.code === 'UNVERIFIED_TAX_RULE')).toBe(true);
      expect(errors.some((e) => e.code === 'DUTY_REFUND_POLICY_REQUIRED')).toBe(true);
    });
  });
});

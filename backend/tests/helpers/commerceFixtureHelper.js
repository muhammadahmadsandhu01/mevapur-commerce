'use strict';

/**
 * @file commerceFixtureHelper.js
 * @description Test-only helper factory for creating governed CommerceConfigurationVersion,
 * canonical exact-money/rational Coupons, and international customs product fixtures.
 */

const CommerceConfigurationVersion = require('../../models/CommerceConfigurationVersion');
const Coupon = require('../../models/Coupon');
const Product = require('../../models/Product');
const { MoneyMapper } = require('../../modules/commerce');

/**
 * Creates and persists a minimal or fully customized governed CommerceConfigurationVersion.
 * @param {Object} [overrides={}]
 * @returns {Promise<Object>}
 */
async function createGovernedCommerceConfiguration(overrides = {}) {
  const merchantScopeId = overrides.merchantScopeId || 'default';
  const version = overrides.version || Math.floor(Math.random() * 1000000) + 1;

  const defaultMerchantProfile = {
    merchantCountry: 'PK',
    baseCurrency: 'PKR',
    defaultCurrency: 'PKR',
    sellingMode: 'hybrid',
    enabledCountries: ['PK', 'US', 'AE', 'GB', 'CA', 'JP', 'KW'],
    enabledCurrencies: ['PKR', 'USD', 'AED', 'GBP', 'CAD', 'JPY', 'KWD'],
    defaultLocale: 'en-PK',
    defaultTimeZone: 'Asia/Karachi',
    supportedIncoterms: ['DOMESTIC', 'DAP', 'DDP'],
    taxCalculationMode: 'exact_rational',
    fulfillmentOrigins: [
      {
        originId: 'origin-pk-central',
        name: 'Pakistan Central Warehouse',
        country: 'PK',
        city: 'Karachi',
        timeZone: 'Asia/Karachi',
        enabled: true,
        isDefault: true
      }
    ]
  };

  const defaultTaxRules = [
    {
      ruleId: 'TAX-PK-DOMESTIC',
      name: 'Pakistan Domestic Tax Rule',
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
      priority: 10,
      requiresTax: false,
      requiresDuty: false,
      customsValueIncludesShipping: false,
      customsValueIncludesInsurance: false,
      dutyRefundPolicy: 'REFUNDABLE',
      taxRefundPolicy: 'REFUNDABLE',
      providerType: 'MANUAL_GOVERNED',
      verificationStatus: 'VERIFIED_LEGAL_RULE',
      sourceAuthority: 'STATUTE',
      sourceReference: 'DEFAULT-DOMESTIC-TAX-2026',
      enabled: true
    },
    {
      ruleId: 'TAX-US-INTL',
      name: 'US International Rule',
      destinationCountry: 'US',
      destinationSubdivision: '',
      taxType: 'VAT',
      taxTreatment: 'exclusive',
      taxableBasis: 'subtotal',
      taxRateNumerator: 0,
      taxRateDenominator: 10000,
      dutyRateNumerator: 0,
      dutyRateDenominator: 10000,
      roundingMode: 'HALF_UP',
      roundingScope: 'subtotal',
      incoterm: 'DAP',
      priority: 20,
      requiresTax: false,
      requiresDuty: false,
      customsValueIncludesShipping: true,
      customsValueIncludesInsurance: false,
      dutyRefundPolicy: 'REFUNDABLE',
      taxRefundPolicy: 'REFUNDABLE',
      providerType: 'MANUAL_GOVERNED',
      verificationStatus: 'VERIFIED_LEGAL_RULE',
      sourceAuthority: 'STATUTE',
      sourceReference: 'INTL-RULES-2026',
      enabled: true
    },
    {
      ruleId: 'TAX-AE-INTL',
      name: 'UAE International Rule',
      destinationCountry: 'AE',
      destinationSubdivision: '',
      taxType: 'VAT',
      taxTreatment: 'exclusive',
      taxableBasis: 'subtotal',
      taxRateNumerator: 0,
      taxRateDenominator: 10000,
      dutyRateNumerator: 0,
      dutyRateDenominator: 10000,
      roundingMode: 'HALF_UP',
      roundingScope: 'subtotal',
      incoterm: 'DAP',
      priority: 20,
      requiresTax: false,
      requiresDuty: false,
      customsValueIncludesShipping: true,
      customsValueIncludesInsurance: false,
      dutyRefundPolicy: 'REFUNDABLE',
      taxRefundPolicy: 'REFUNDABLE',
      providerType: 'MANUAL_GOVERNED',
      verificationStatus: 'VERIFIED_LEGAL_RULE',
      sourceAuthority: 'STATUTE',
      sourceReference: 'INTL-RULES-2026',
      enabled: true
    }
  ];

  const defaultShippingRules = [
    {
      ruleId: 'GOV-SHIP-PK-STD',
      name: 'Pakistan Domestic Standard',
      serviceCode: 'standard',
      displayName: 'TCS Ground Standard',
      originCountry: 'PK',
      destinationCountry: 'PK',
      currency: 'PKR',
      baseRateExact: MoneyMapper.fromLegacy(250, 'PKR'),
      freeShippingThresholdExact: MoneyMapper.fromLegacy(5000, 'PKR'),
      remoteRateExact: MoneyMapper.fromLegacy(350, 'PKR'),
      deliveryMinDays: 2,
      deliveryMaxDays: 4,
      processingCutoffLocal: '14:00',
      workingDays: [1, 2, 3, 4, 5],
      processingMinBusinessDays: 0,
      processingMaxBusinessDays: 1,
      weightBands: [
        { minWeightGrams: 0, maxWeightGrams: 50000, rateExact: MoneyMapper.fromLegacy(250, 'PKR'), pricingMode: 'REPLACE_BASE' }
      ],
      supportedIncoterms: ['DOMESTIC'],
      priority: 10,
      enabled: true
    }
  ];

  const doc = {
    merchantScopeId,
    version,
    status: overrides.status || 'active',
    effectiveFrom: overrides.effectiveFrom || new Date(Date.now() - 60000),
    effectiveTo: overrides.effectiveTo || null,
    merchantProfile: {
      ...defaultMerchantProfile,
      ...(overrides.merchantProfile || {})
    },
    shippingRules: overrides.shippingRules !== undefined ? overrides.shippingRules : defaultShippingRules,
    taxRules: overrides.taxRules !== undefined ? overrides.taxRules : defaultTaxRules
  };

  if (overrides.persist === false) {
    return doc;
  }

  return await CommerceConfigurationVersion.create(doc);
}

/**
 * Creates and persists a canonical exact-money / rational Coupon.
 * @param {Object} [overrides={}]
 * @returns {Promise<Object>}
 */
async function createCanonicalCoupon(overrides = {}) {
  const code = (overrides.code || `TEST-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`).toUpperCase();
  const type = overrides.type || 'percentage';
  const currency = overrides.currency || 'PKR';

  let value = overrides.value;
  let rateNumerator = overrides.rateNumerator;
  let rateDenominator = overrides.rateDenominator;
  let valueExact = overrides.valueExact;

  if (type === 'percentage') {
    if (rateNumerator === undefined) {
      rateNumerator = value !== undefined ? value : 10;
    }
    if (rateDenominator === undefined) {
      rateDenominator = 100;
    }
    if (value === undefined) {
      value = rateNumerator;
    }
  } else if (type === 'fixed') {
    if (valueExact === undefined) {
      const numVal = value !== undefined ? value : 100;
      valueExact = MoneyMapper.fromLegacy(numVal, currency);
    }
    if (value === undefined) {
      value = typeof valueExact === 'object' && valueExact.amountMinor !== undefined
        ? Number(valueExact.amountMinor) / Math.pow(10, valueExact.exponent || 2)
        : 100;
    }
  } else if (type === 'freeshipping') {
    if (value === undefined) value = 0;
  }

  let minOrderAmountExact = overrides.minOrderAmountExact;
  if (minOrderAmountExact === undefined && overrides.minOrderAmount !== undefined) {
    minOrderAmountExact = MoneyMapper.fromLegacy(overrides.minOrderAmount, currency);
  }

  let maxDiscountExact = overrides.maxDiscountExact;
  if (maxDiscountExact === undefined && overrides.maxDiscount !== undefined) {
    maxDiscountExact = MoneyMapper.fromLegacy(overrides.maxDiscount, currency);
  }

  const doc = {
    code,
    type,
    value: value !== undefined ? value : 0,
    rateNumerator: rateNumerator !== undefined ? rateNumerator : null,
    rateDenominator: rateDenominator !== undefined ? rateDenominator : null,
    valueExact: valueExact || null,
    currency,
    minOrderAmount: overrides.minOrderAmount !== undefined ? overrides.minOrderAmount : 0,
    minOrderAmountExact: minOrderAmountExact || null,
    maxDiscount: overrides.maxDiscount !== undefined ? overrides.maxDiscount : 0,
    maxDiscountExact: maxDiscountExact || null,
    usageLimit: overrides.usageLimit !== undefined ? overrides.usageLimit : 1000,
    usedCount: overrides.usedCount !== undefined ? overrides.usedCount : 0,
    perCustomerLimit: overrides.perCustomerLimit !== undefined ? overrides.perCustomerLimit : 0,
    status: overrides.status || 'active',
    isActive: overrides.isActive !== undefined ? overrides.isActive : true,
    startDate: overrides.startDate || new Date(Date.now() - 3600000),
    endDate: overrides.endDate || new Date(Date.now() + 86400000 * 30),
    applicableProducts: overrides.applicableProducts || [],
    applicableCategories: overrides.applicableCategories || [],
    description: overrides.description || 'Test coupon'
  };

  if (overrides.persist === false) {
    return doc;
  }

  return await Coupon.create(doc);
}

/**
 * Builds attributes for an international customs product.
 * @param {Object} [overrides={}]
 * @returns {Object}
 */
function createInternationalCustomsProduct(overrides = {}) {
  return {
    hsCode: overrides.hsCode || '080212',
    hsClassification: {
      code: overrides.hsCode || (overrides.hsClassification && overrides.hsClassification.code) || '080212',
      description: overrides.customsDescription || 'Shelled Almonds',
      source: 'MANUAL_OVERRIDE',
      confidence: 'VERIFIED',
      sourceReference: 'CUSTOMS-FIXTURE-2026',
      ...(overrides.hsClassification || {})
    },
    countryOfOrigin: overrides.countryOfOrigin || 'PK',
    customsDescription: overrides.customsDescription || 'Shelled edible almonds for retail sale',
    declaredValueEligibility: overrides.declaredValueEligibility || 'ELIGIBLE',
    dangerousGoodsClassification: overrides.dangerousGoodsClassification || 'NOT_RESTRICTED',
    weightGrams: overrides.weightGrams || 500,
    dimensionsMm: overrides.dimensionsMm || { length: 150, width: 100, height: 50 },
    ...overrides
  };
}

module.exports = {
  createGovernedCommerceConfiguration,
  createCanonicalCoupon,
  createInternationalCustomsProduct
};

/**
 * @file TaxDutyEngine.js
 * @description Provider-Neutral Tax, Duty & Landed-Cost Calculation Engine.
 * Supports country-level VAT, GST, Sales Tax, and Customs Duty policies with exact-money precision.
 */

const { Money, MoneyMapper } = require('../../modules/commerce');
const { AppError } = require('../../common/errors/AppError');

/**
 * Baseline Configuration-driven Tax & Duty Policies for Phase 6A.
 * Standard rates per ISO 3166-1 alpha-2 country.
 */
const DEFAULT_TAX_RULES = Object.freeze({
  PK: {
    taxType: 'GST',
    standardRatePercent: 0, // Standard food/agricultural products tax exempt in baseline
    requiresTax: false,
    dutyPercent: 0,
    incoterm: 'DAP'
  },
  AE: {
    taxType: 'VAT',
    standardRatePercent: 5.0, // 5% UAE VAT
    requiresTax: true,
    dutyPercent: 5.0, // Standard 5% customs duty
    incoterm: 'DDP'
  },
  GB: {
    taxType: 'VAT',
    standardRatePercent: 20.0, // 20% UK Standard VAT
    requiresTax: true,
    dutyPercent: 2.5,
    incoterm: 'DDP'
  },
  DE: {
    taxType: 'VAT',
    standardRatePercent: 19.0, // 19% German Standard VAT
    requiresTax: true,
    dutyPercent: 2.5,
    incoterm: 'DDP'
  },
  US: {
    taxType: 'SALES_TAX',
    standardRatePercent: 0, // State-dependent in live, baseline default 0 unless configured
    requiresTax: false,
    dutyPercent: 0,
    incoterm: 'DAP'
  }
});

class TaxDutyEngine {
  constructor(customRules = {}) {
    this.rules = { ...DEFAULT_TAX_RULES, ...customRules };
  }

  /**
   * Calculate exact tax and duties for a destination and taxable subtotal.
   * @param {Object} params
   * @param {string} params.destinationCountry - ISO 3166-1 alpha-2
   * @param {string} [params.originCountry='PK'] - ISO 3166-1 alpha-2
   * @param {string} [params.administrativeArea] - State/Province
   * @param {Money} params.taxableSubtotal - Money value object
   * @param {Money} [params.shippingAmount] - Money value object for shipping
   * @param {string} [params.currency] - ISO 4217 Currency
   * @returns {Object} Tax & Duty calculation result
   */
  calculate({
    destinationCountry,
    originCountry = 'PK',
    administrativeArea = '',
    taxableSubtotal,
    shippingAmount = null,
    currency = null
  }) {
    if (!destinationCountry || typeof destinationCountry !== 'string') {
      throw new AppError('Destination country is required for tax calculation', 400, 'TAX_DESTINATION_REQUIRED');
    }

    const dest = destinationCountry.trim().toUpperCase();
    const origin = originCountry.trim().toUpperCase();
    const isDomestic = dest === origin;

    const curr = currency || (taxableSubtotal ? taxableSubtotal.currency : 'PKR');
    const subtotalMoney = taxableSubtotal instanceof Money
      ? taxableSubtotal
      : (typeof taxableSubtotal === 'number'
        ? Money.fromLegacyNumber(taxableSubtotal, curr)
        : (taxableSubtotal && typeof taxableSubtotal === 'object' && taxableSubtotal.amountMinor !== undefined
          ? MoneyMapper.toMoney(taxableSubtotal)
          : Money.zero(curr)));

    const shippingMoney = shippingAmount instanceof Money
      ? shippingAmount
      : (typeof shippingAmount === 'number'
        ? Money.fromLegacyNumber(shippingAmount, curr)
        : (shippingAmount && typeof shippingAmount === 'object' && shippingAmount.amountMinor !== undefined
          ? MoneyMapper.toMoney(shippingAmount)
          : Money.zero(curr)));

    if (subtotalMoney.currency !== curr) {
      throw new AppError('Subtotal currency mismatch during tax calculation', 400, 'TAX_CURRENCY_MISMATCH');
    }
    if (shippingMoney.currency !== curr) {
      throw new AppError('Shipping currency mismatch during tax calculation', 400, 'TAX_CURRENCY_MISMATCH');
    }

    const rule = this.rules[dest] || {
      taxType: 'CUSTOMS_VAT',
      standardRatePercent: 0,
      requiresTax: false,
      dutyPercent: 0,
      incoterm: isDomestic ? 'DAP' : 'DAP'
    };

    const isTaxable = rule.requiresTax && rule.standardRatePercent > 0;
    const isDutiable = !isDomestic && (rule.dutyPercent > 0 || rule.incoterm === 'DDP');

    // 1. Calculate Tax (e.g. VAT / GST on subtotal)
    let taxMoney = Money.zero(curr);
    let taxRateBasis = 0;
    if (isTaxable) {
      taxRateBasis = rule.standardRatePercent;
      // Exact arithmetic using multiplyRational (e.g., 5% = 500 / 10000)
      const basisPoints = Math.round(taxRateBasis * 100);
      taxMoney = subtotalMoney.multiplyRational(basisPoints, 10000, 'HALF_UP');
    }

    // 2. Calculate Duty (Import duties for international routes)
    let dutyMoney = Money.zero(curr);
    let dutyRateBasis = 0;
    if (isDutiable && rule.dutyPercent > 0) {
      dutyRateBasis = rule.dutyPercent;
      const basisPoints = Math.round(dutyRateBasis * 100);
      // Landed cost duty calculation on CIF (Cost + Insurance + Freight) if DDP, else on subtotal
      const dutyBase = rule.incoterm === 'DDP' ? subtotalMoney.add(shippingMoney) : subtotalMoney;
      dutyMoney = dutyBase.multiplyRational(basisPoints, 10000, 'HALF_UP');
    }

    return {
      destinationCountry: dest,
      originCountry: origin,
      isDomestic,
      incoterm: isDomestic ? 'DOMESTIC' : (rule.incoterm || 'DAP'),
      taxType: rule.taxType,
      taxRatePercent: taxRateBasis,
      taxAmount: Number(taxMoney.toDecimalString()),
      taxAmountExact: MoneyMapper.toPersistence(taxMoney),
      dutyRatePercent: dutyRateBasis,
      dutyAmount: Number(dutyMoney.toDecimalString()),
      dutyAmountExact: MoneyMapper.toPersistence(dutyMoney),
      currency: curr,
      provenance: {
        engine: 'MevaPur-Deterministic-TaxEngine-v1',
        ruleSource: this.rules[dest] ? 'CONFIGURED_COUNTRY_PROFILE' : 'FALLBACK_NEUTRAL_POLICY',
        timestamp: new Date().toISOString()
      }
    };
  }
}

module.exports = new TaxDutyEngine();
module.exports.TaxDutyEngine = TaxDutyEngine;
module.exports.DEFAULT_TAX_RULES = DEFAULT_TAX_RULES;

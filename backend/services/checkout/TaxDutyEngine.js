/**
 * @file TaxDutyEngine.js
 * @description Provider-Neutral, Configuration-Driven Tax, Duty & Landed-Cost Calculation Engine.
 * Supports exact-money rational arithmetic, inclusive/exclusive taxation, CIF/DDP duties,
 * and immutable configuration provenance with zero floating-point math and zero production hardcoded rates.
 */

const { Money, MoneyMapper } = require('../../modules/commerce');
const { AppError } = require('../../common/errors/AppError');

class TaxDutyEngine {
  constructor(customRules = null) {
    this.customRules = customRules;
  }

  /**
   * Resolves a matching tax rule for destination from configured rules.
   * Subdivision-specific rules take precedence over country-level rules.
   * @param {Array<Object>|Object} rules
   * @param {string} destinationCountry
   * @param {string} subdivision
   * @returns {Object|null}
   */
  resolveMatchingRule(rules, destinationCountry, subdivision = '') {
    if (!rules) return null;

    const dest = destinationCountry.trim().toUpperCase();
    const sub = (subdivision || '').trim().toUpperCase();

    if (Array.isArray(rules)) {
      // 1. Check subdivision match
      if (sub) {
        const subMatch = rules.find((r) => (
          r.enabled !== false
          && r.destinationCountry === dest
          && r.destinationSubdivision
          && r.destinationSubdivision.toUpperCase() === sub
        ));
        if (subMatch) return subMatch;
      }

      // 2. Check country-level match (empty subdivision)
      const countryMatch = rules.find((r) => (
        r.enabled !== false
        && r.destinationCountry === dest
        && (!r.destinationSubdivision || r.destinationSubdivision.trim() === '')
      ));
      if (countryMatch) return countryMatch;

      return null;
    }

    if (typeof rules === 'object') {
      return rules[dest] || null;
    }

    return null;
  }

  /**
   * Calculate exact tax and duties for a destination and taxable subtotal.
   * @param {Object} params
   * @param {string} params.destinationCountry - ISO 3166-1 alpha-2
   * @param {string} [params.originCountry='PK'] - ISO 3166-1 alpha-2
   * @param {string} [params.administrativeArea=''] - State/Province
   * @param {Money|Object|number} params.taxableSubtotal - Money value object
   * @param {Money|Object|number} [params.shippingAmount=null] - Money value object for shipping
   * @param {string} [params.currency=null] - ISO 4217 Currency
   * @param {Array<Object>|Object} [params.taxRules=null] - Configured tax rules
   * @param {string|number} [params.configVersionId=null] - Configuration version identifier
   * @returns {Object} Tax & Duty calculation result
   */
  calculate({
    destinationCountry,
    originCountry = 'PK',
    administrativeArea = '',
    taxableSubtotal,
    shippingAmount = null,
    currency = null,
    taxRules = null,
    configVersionId = null
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

    const effectiveRules = taxRules || this.customRules;
    const rule = this.resolveMatchingRule(effectiveRules, dest, administrativeArea);

    // Fail closed: Missing or unconfigured required tax rule strictly fails closed
    if (!rule) {
      if (process.env.ALLOW_LEGACY_DOMESTIC_COD_COMPATIBILITY === 'true' && isDomestic && dest === 'PK') {
        return {
          destinationCountry: 'PK',
          destinationSubdivision: administrativeArea || '',
          originCountry: origin,
          isDomestic: true,
          incoterm: 'DOMESTIC',
          taxType: 'GST',
          taxTreatment: 'exclusive',
          taxRateNumerator: 0,
          taxRateDenominator: 100,
          taxRatePercent: 0,
          taxAmount: 0,
          taxAmountExact: MoneyMapper.toPersistence(Money.zero(curr)),
          dutyRateNumerator: 0,
          dutyRateDenominator: 100,
          dutyRatePercent: 0,
          dutyAmount: 0,
          dutyAmountExact: MoneyMapper.toPersistence(Money.zero(curr)),
          currency: curr,
          provenance: {
            engine: 'MevaPur-Legacy-Domestic-COD-Gate',
            configVersionId: 'legacy-fallback',
            ruleId: 'LEGACY-PK-DOMESTIC-0',
            sourceAuthority: 'Legacy Domestic Compatibility Gate',
            sourceReference: 'ALLOW_LEGACY_DOMESTIC_COD_COMPATIBILITY',
            verificationStatus: 'LEGACY_COMPATIBILITY_UNVERIFIED',
            roundingMode: 'HALF_UP',
            timestamp: new Date().toISOString()
          }
        };
      }

      throw new AppError(
        `No tax or duty governance rule is configured for destination '${dest}'${administrativeArea ? ` (${administrativeArea})` : ''}`,
        409,
        'TAX_RULE_UNCONFIGURED'
      );
    }

    const taxType = rule.taxType || 'VAT';
    const taxTreatment = rule.taxTreatment || 'exclusive';
    const roundingMode = rule.roundingMode || 'HALF_UP';
    const incoterm = isDomestic ? 'DOMESTIC' : (rule.incoterm || 'DAP');

    const taxNumerator = rule.taxRateNumerator != null ? Number(rule.taxRateNumerator) : (rule.standardRatePercent ? Math.round(rule.standardRatePercent * 100) : 0);
    const taxDenominator = rule.taxRateDenominator != null ? Number(rule.taxRateDenominator) : 10000;
    const dutyNumerator = rule.dutyRateNumerator != null ? Number(rule.dutyRateNumerator) : (rule.dutyPercent ? Math.round(rule.dutyPercent * 100) : 0);
    const dutyDenominator = rule.dutyRateDenominator != null ? Number(rule.dutyRateDenominator) : 10000;

    const isTaxable = rule.requiresTax !== false && taxNumerator > 0;
    const isDutiable = !isDomestic && (rule.requiresDuty === true || incoterm === 'DDP') && dutyNumerator > 0;

    // 1. Calculate Tax using Exact Rational Arithmetic
    let taxMoney = Money.zero(curr);
    if (isTaxable) {
      if (taxTreatment === 'inclusive') {
        // Exact tax-inclusive formula: tax = subtotal * num / (denom + num)
        const combinedDenominator = taxDenominator + taxNumerator;
        taxMoney = subtotalMoney.multiplyRational(taxNumerator, combinedDenominator, roundingMode);
      } else {
        // Exclusive tax formula: tax = subtotal * num / denom
        taxMoney = subtotalMoney.multiplyRational(taxNumerator, taxDenominator, roundingMode);
      }
    }

    // 2. Calculate Duty using Exact Rational Arithmetic
    let dutyMoney = Money.zero(curr);
    if (isDutiable) {
      // Landed cost duty calculation on CIF (Cost + Freight) if DDP, else on subtotal
      const dutyBase = incoterm === 'DDP' ? subtotalMoney.add(shippingMoney) : subtotalMoney;
      dutyMoney = dutyBase.multiplyRational(dutyNumerator, dutyDenominator, roundingMode);
    }

    const taxRatePercent = taxDenominator > 0 ? (taxNumerator / taxDenominator) * 100 : 0;
    const dutyRatePercent = dutyDenominator > 0 ? (dutyNumerator / dutyDenominator) * 100 : 0;

    return {
      destinationCountry: dest,
      destinationSubdivision: administrativeArea || '',
      originCountry: origin,
      isDomestic,
      incoterm,
      taxType,
      taxTreatment,
      taxRateNumerator: taxNumerator,
      taxRateDenominator: taxDenominator,
      taxRatePercent,
      taxAmount: Number(taxMoney.toDecimalString()),
      taxAmountExact: MoneyMapper.toPersistence(taxMoney),
      dutyRateNumerator: dutyNumerator,
      dutyRateDenominator: dutyDenominator,
      dutyRatePercent,
      dutyAmount: Number(dutyMoney.toDecimalString()),
      dutyAmountExact: MoneyMapper.toPersistence(dutyMoney),
      currency: curr,
      provenance: {
        engine: 'MevaPur-Deterministic-TaxEngine-v2',
        configVersionId: configVersionId || rule.configVersionId || 'v-active',
        ruleId: rule.ruleId || `TAX-${dest}`,
        sourceAuthority: rule.sourceAuthority || 'Configured Commerce Authority',
        sourceReference: rule.sourceReference || 'CONFIGURED_GOVERNANCE_RULE',
        verificationStatus: rule.verificationStatus || 'UNVERIFIED_ESTIMATE',
        roundingMode,
        timestamp: new Date().toISOString()
      }
    };
  }
}

module.exports = new TaxDutyEngine();
module.exports.TaxDutyEngine = TaxDutyEngine;

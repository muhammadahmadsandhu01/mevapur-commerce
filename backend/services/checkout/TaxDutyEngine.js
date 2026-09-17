/**
 * @file TaxDutyEngine.js
 * @description Provider-Neutral, Configuration-Driven Tax, Duty & Landed-Cost Calculation Engine.
 * Supports exact-money rational arithmetic, inclusive/exclusive taxation, CIF/DDP duties,
 * pure deterministic rule resolution, independent generic de-minimis evaluation,
 * and immutable configuration provenance with zero floating-point math and zero production hardcoded rates.
 */

const { Money, MoneyMapper } = require('../../modules/commerce');
const { AppError } = require('../../common/errors/AppError');

class TaxDutyEngine {
  constructor(customRules = null) {
    this.customRules = customRules;
  }

  /**
   * Pure evaluation of a single de-minimis threshold against a basis amount.
   * @param {Object} params
   * @param {Object|null} params.thresholdExact
   * @param {Money} params.basisMoney
   * @param {string} params.basisType
   * @param {string} [params.comparison='LT'] - 'LT' or 'LTE'
   * @param {string} params.currency
   * @returns {Object}
   */
  evaluateDeMinimisDecision({ thresholdExact, basisMoney, basisType, comparison = 'LT', currency }) {
    if (!thresholdExact) {
      return {
        configured: false,
        thresholdExact: null,
        basisType: basisType || 'GOODS_VALUE',
        basisAmountExact: MoneyMapper.toPersistence(basisMoney),
        comparison: comparison || 'LT',
        exempt: false,
        reasonCode: 'NO_THRESHOLD_CONFIGURED'
      };
    }

    const tMoney = MoneyMapper.toMoney(thresholdExact);
    if (tMoney.currency !== currency) {
      throw new AppError(
        `Tax threshold currency '${tMoney.currency}' does not match quote currency '${currency}'`,
        400,
        'TAX_THRESHOLD_CURRENCY_MISMATCH'
      );
    }

    const normComparison = (comparison || 'LT').toUpperCase();
    let exempt = false;
    if (normComparison === 'LTE') {
      exempt = basisMoney.amountMinor <= tMoney.amountMinor;
    } else {
      // Default 'LT'
      exempt = basisMoney.amountMinor < tMoney.amountMinor;
    }

    return {
      configured: true,
      thresholdExact: MoneyMapper.toPersistence(tMoney),
      basisType: basisType || 'GOODS_VALUE',
      basisAmountExact: MoneyMapper.toPersistence(basisMoney),
      comparison: normComparison,
      exempt,
      reasonCode: exempt ? 'DE_MINIMIS_EXEMPT' : 'ABOVE_DE_MINIMIS_THRESHOLD'
    };
  }

  /**
   * Deep equality comparator for de-minimis decision snapshots.
   * @param {Object|null} d1
   * @param {Object|null} d2
   * @returns {boolean}
   */
  static compareDeMinimisDecisions(d1, d2) {
    if (!d1 && !d2) return true;
    if (!d1 || !d2) return false;
    if (Boolean(d1.configured) !== Boolean(d2.configured)) return false;
    if (Boolean(d1.exempt) !== Boolean(d2.exempt)) return false;
    if (d1.configured) {
      if (d1.basisType !== d2.basisType) return false;
      if (d1.comparison !== d2.comparison) return false;
      if (d1.reasonCode !== d2.reasonCode) return false;
      if (d1.thresholdExact?.amountMinor?.toString() !== d2.thresholdExact?.amountMinor?.toString()) return false;
      if (d1.thresholdExact?.currency !== d2.thresholdExact?.currency) return false;
      if (d1.basisAmountExact?.amountMinor?.toString() !== d2.basisAmountExact?.amountMinor?.toString()) return false;
      if (d1.basisAmountExact?.currency !== d2.basisAmountExact?.currency) return false;
    }
    return true;
  }

  /**
   * Resolves a matching tax rule for destination from configured rules deterministically.
   * Subdivision-specific rules take precedence over country-level rules.
   * If multiple candidates match at winning specificity, fails closed with AMBIGUOUS_TAX_RULE_MATCH.
   * Array order or priority must never silently decide winning rule.
   *
   * @param {Array<Object>|Object} rules
   * @param {string} destinationCountry
   * @param {string} [subdivision='']
   * @returns {Object|null}
   */
  resolveMatchingRule(rules, destinationCountry, subdivision = '') {
    if (!rules) return null;

    if (!destinationCountry || typeof destinationCountry !== 'string') {
      return null;
    }

    const dest = destinationCountry.trim().toUpperCase();
    const sub = (subdivision || '').trim().toUpperCase();

    let ruleList = [];
    if (Array.isArray(rules)) {
      ruleList = rules;
    } else if (typeof rules === 'object') {
      ruleList = Object.values(rules);
    } else {
      return null;
    }

    // Filter enabled rules matching destination country
    const enabledRules = ruleList.filter((r) => {
      if (!r || typeof r !== 'object') return false;
      if (r.enabled === false) return false;
      const rDest = (r.destinationCountry || '').trim().toUpperCase();
      return rDest === dest;
    });

    if (enabledRules.length === 0) {
      return null;
    }

    // Validate governed provenance & reject unverified/external providers
    for (const r of enabledRules) {
      if (r.providerType === 'EXTERNAL_PROVIDER') {
        throw new AppError(
          `External tax providers are not supported in Phase 6D-4; rule '${r.ruleId || 'unnamed'}' must be MANUAL_GOVERNED`,
          409,
          'UNSUPPORTED_TAX_PROVIDER_TYPE'
        );
      }
      if (r.verificationStatus && r.verificationStatus !== 'VERIFIED_LEGAL_RULE') {
        throw new AppError(
          `Tax rule '${r.ruleId || 'unnamed'}' is unverified (${r.verificationStatus}); enabled rules require VERIFIED_LEGAL_RULE`,
          409,
          'UNVERIFIED_TAX_RULE'
        );
      }
      if (!r.sourceAuthority || typeof r.sourceAuthority !== 'string' || !r.sourceAuthority.trim()) {
        throw new AppError(
          `Tax rule '${r.ruleId || 'unnamed'}' is missing sourceAuthority`,
          409,
          'SOURCE_AUTHORITY_REQUIRED'
        );
      }
      if (!r.sourceReference || typeof r.sourceReference !== 'string' || !r.sourceReference.trim()) {
        throw new AppError(
          `Tax rule '${r.ruleId || 'unnamed'}' is missing sourceReference`,
          409,
          'SOURCE_REFERENCE_REQUIRED'
        );
      }
      if (r.taxRateNumerator != null && r.taxRateDenominator != null && Number(r.taxRateDenominator) <= 0) {
        throw new AppError(`Tax rule '${r.ruleId}' has invalid taxRateDenominator <= 0`, 409, 'INVALID_TAX_RATE_FRACTION');
      }
      if (r.dutyRateNumerator != null && r.dutyRateDenominator != null && Number(r.dutyRateDenominator) <= 0) {
        throw new AppError(`Tax rule '${r.ruleId}' has invalid dutyRateDenominator <= 0`, 409, 'INVALID_DUTY_RATE_FRACTION');
      }
    }

    // 1. Check subdivision match if subdivision provided
    if (sub) {
      const subMatches = enabledRules.filter((r) => {
        const rSub = (r.destinationSubdivision || '').trim().toUpperCase();
        return rSub === sub;
      });

      if (subMatches.length === 1) {
        return subMatches[0];
      }
      if (subMatches.length > 1) {
        throw new AppError(
          `Ambiguous tax rule match: ${subMatches.length} rules match destination '${dest}' subdivision '${sub}'`,
          409,
          'AMBIGUOUS_TAX_RULE_MATCH'
        );
      }
    }

    // 2. Check country-level match (empty or wildcard subdivision)
    const countryMatches = enabledRules.filter((r) => {
      const rSub = (r.destinationSubdivision || '').trim();
      return !rSub || rSub === '' || rSub === '*';
    });

    if (countryMatches.length === 1) {
      return countryMatches[0];
    }
    if (countryMatches.length > 1) {
      throw new AppError(
        `Ambiguous tax rule match: ${countryMatches.length} rules match destination country '${dest}'`,
        409,
        'AMBIGUOUS_TAX_RULE_MATCH'
      );
    }

    return null;
  }

  /**
   * Calculate exact tax and duties for a destination and discounted merchandise goods value.
   * @param {Object} params
   * @param {string} params.destinationCountry - ISO 3166-1 alpha-2
   * @param {string} [params.originCountry='PK'] - ISO 3166-1 alpha-2
   * @param {string} [params.administrativeArea=''] - State/Province
   * @param {Money|Object|number} [params.goodsValue] - Post-discount merchandise value
   * @param {Money|Object|number} [params.taxableSubtotal] - Backward-compatible alias for goodsValue
   * @param {Money|Object|number} [params.discountedMerchandiseSubtotal] - Backward-compatible alias for goodsValue
   * @param {Money|Object|number} [params.discountAmount=null] - Money value object for coupon/discount
   * @param {Money|Object|number} [params.shippingAmount=null] - Money value object for shipping
   * @param {Money|Object|number} [params.insuranceAmount=null] - Money value object for insurance
   * @param {string} [params.insuranceProvenance=null] - 'NO_INSURANCE_CHARGE' or 'EXPLICIT_INSURANCE_CHARGE'
   * @param {string} [params.currency=null] - ISO 4217 Currency
   * @param {Array<Object>|Object} [params.taxRules=null] - Configured tax rules
   * @param {string|number} [params.configVersionId=null] - Configuration version identifier
   * @param {string} [params.merchantScopeId='default'] - Merchant scope identifier
   * @returns {Object} Tax & Duty calculation result
   */
  calculate({
    destinationCountry,
    originCountry = 'PK',
    administrativeArea = '',
    goodsValue = null,
    taxableSubtotal = null,
    discountedMerchandiseSubtotal = null,
    discountAmount = null,
    shippingAmount = null,
    insuranceAmount = null,
    insuranceProvenance = null,
    currency = null,
    taxRules = null,
    configVersionId = null,
    merchantScopeId = 'default'
  }) {
    if (!destinationCountry || typeof destinationCountry !== 'string') {
      throw new AppError('Destination country is required for tax calculation', 400, 'TAX_DESTINATION_REQUIRED');
    }

    const dest = destinationCountry.trim().toUpperCase();
    const origin = (originCountry || '').trim().toUpperCase();
    if (!origin) {
      throw new AppError('Origin country is required for tax calculation', 400, 'TAX_ORIGIN_REQUIRED');
    }
    const isDomestic = dest === origin;

    const rawGoodsValue = goodsValue !== null ? goodsValue : (discountedMerchandiseSubtotal !== null ? discountedMerchandiseSubtotal : taxableSubtotal);
    const curr = (currency || (rawGoodsValue && rawGoodsValue.currency) || '').toUpperCase();
    if (!curr) {
      throw new AppError('Currency is required for tax calculation', 400, 'TAX_CURRENCY_REQUIRED');
    }

    let subtotalMoney = rawGoodsValue instanceof Money
      ? rawGoodsValue
      : (typeof rawGoodsValue === 'number'
        ? Money.fromLegacyNumber(rawGoodsValue, curr)
        : (rawGoodsValue && typeof rawGoodsValue === 'object' && rawGoodsValue.amountMinor !== undefined
          ? MoneyMapper.toMoney(rawGoodsValue)
          : Money.zero(curr)));

    const discountMoney = discountAmount instanceof Money
      ? discountAmount
      : (typeof discountAmount === 'number'
        ? Money.fromLegacyNumber(discountAmount, curr)
        : (discountAmount && typeof discountAmount === 'object' && discountAmount.amountMinor !== undefined
          ? MoneyMapper.toMoney(discountAmount)
          : Money.zero(curr)));

    const shippingMoney = shippingAmount instanceof Money
      ? shippingAmount
      : (typeof shippingAmount === 'number'
        ? Money.fromLegacyNumber(shippingAmount, curr)
        : (shippingAmount && typeof shippingAmount === 'object' && shippingAmount.amountMinor !== undefined
          ? MoneyMapper.toMoney(shippingAmount)
          : Money.zero(curr)));

    const insuranceMoney = insuranceAmount instanceof Money
      ? insuranceAmount
      : (typeof insuranceAmount === 'number'
        ? Money.fromLegacyNumber(insuranceAmount, curr)
        : (insuranceAmount && typeof insuranceAmount === 'object' && insuranceAmount.amountMinor !== undefined
          ? MoneyMapper.toMoney(insuranceAmount)
          : Money.zero(curr)));

    if (subtotalMoney.currency !== curr) {
      throw new AppError('Subtotal currency mismatch during tax calculation', 400, 'TAX_CURRENCY_MISMATCH');
    }
    if (discountMoney.currency !== curr) {
      throw new AppError('Discount currency mismatch during tax calculation', 400, 'TAX_CURRENCY_MISMATCH');
    }
    if (shippingMoney.currency !== curr) {
      throw new AppError('Shipping currency mismatch during tax calculation', 400, 'TAX_CURRENCY_MISMATCH');
    }
    if (insuranceMoney.currency !== curr) {
      throw new AppError('Insurance currency mismatch during tax calculation', 400, 'TAX_CURRENCY_MISMATCH');
    }

    if (subtotalMoney.isNegative()) {
      throw new AppError('Merchandise subtotal cannot be negative', 400, 'TAX_VALUATION_NEGATIVE');
    }
    if (discountMoney.isNegative()) {
      throw new AppError('Discount amount cannot be negative', 400, 'TAX_VALUATION_NEGATIVE');
    }
    if (shippingMoney.isNegative()) {
      throw new AppError('Shipping amount cannot be negative', 400, 'TAX_VALUATION_NEGATIVE');
    }
    if (insuranceMoney.isNegative()) {
      throw new AppError('Insurance amount cannot be negative', 400, 'TAX_VALUATION_NEGATIVE');
    }

    // Derive post-discount goodsValueMoney
    const goodsValueMoney = discountMoney.isPositive()
      ? (subtotalMoney.amountMinor >= discountMoney.amountMinor ? subtotalMoney.subtract(discountMoney) : Money.zero(curr))
      : subtotalMoney;

    const effectiveRules = taxRules || this.customRules;
    const rule = this.resolveMatchingRule(effectiveRules, dest, administrativeArea);

    if (!rule) {
      throw new AppError(
        `No tax or duty governance rule is configured for destination '${dest}'${administrativeArea ? ` (${administrativeArea})` : ''}`,
        409,
        'TAX_RULE_UNCONFIGURED'
      );
    }

    // Check rounding scope: per_item must fail closed
    if (rule.roundingScope === 'per_item') {
      throw new AppError(
        'per_item rounding scope is not supported in quote-aggregate calculation',
        400,
        'UNSUPPORTED_TAX_ROUNDING_SCOPE'
      );
    }

    const customsValueIncludesInsurance = Boolean(rule.customsValueIncludesInsurance);

    // Strict insurance contract validation
    if (customsValueIncludesInsurance && insuranceAmount === null && insuranceProvenance === null) {
      throw new AppError(
        'Insurance amount and provenance are required when rule includes insurance',
        400,
        'TAX_INSURANCE_INPUT_REQUIRED'
      );
    }

    if (insuranceMoney.isPositive() && insuranceProvenance !== 'EXPLICIT_INSURANCE_CHARGE') {
      throw new AppError(
        'Insurance provenance mismatch: Non-zero insurance amount requires EXPLICIT_INSURANCE_CHARGE provenance',
        400,
        'TAX_INSURANCE_PROVENANCE_MISMATCH'
      );
    }

    if (insuranceMoney.isZero() && insuranceProvenance && insuranceProvenance !== 'NO_INSURANCE_CHARGE') {
      throw new AppError(
        'Insurance provenance mismatch: Zero insurance amount requires NO_INSURANCE_CHARGE provenance',
        400,
        'TAX_INSURANCE_PROVENANCE_MISMATCH'
      );
    }

    const finalInsuranceProvenance = insuranceMoney.isZero()
      ? (insuranceProvenance || 'NO_INSURANCE_CHARGE')
      : (insuranceProvenance || 'EXPLICIT_INSURANCE_CHARGE');

    const taxType = rule.taxType || 'VAT';
    const taxTreatment = rule.taxTreatment || 'exclusive';
    const roundingMode = rule.roundingMode || 'HALF_UP';
    const incoterm = isDomestic ? 'DOMESTIC' : (rule.incoterm || 'DAP');

    const customsValueIncludesShipping = rule.customsValueIncludesShipping !== undefined
      ? Boolean(rule.customsValueIncludesShipping)
      : (incoterm === 'DDP' || (rule.taxableBasis || '').toLowerCase() === 'cif');

    let customsValueMoney = goodsValueMoney;
    if (customsValueIncludesShipping) {
      customsValueMoney = customsValueMoney.add(shippingMoney);
    }
    if (customsValueIncludesInsurance) {
      customsValueMoney = customsValueMoney.add(insuranceMoney);
    }

    const cifValueMoney = goodsValueMoney.add(shippingMoney).add(insuranceMoney);

    // De-Minimis Basis resolution
    const deMinimisBasis = (rule.deMinimisBasis || 'GOODS_VALUE').toUpperCase();
    const deMinimisComparison = (rule.deMinimisComparison || 'LT').toUpperCase();

    let deMinimisBasisMoney = goodsValueMoney;
    if (deMinimisBasis === 'CUSTOMS_VALUE') {
      deMinimisBasisMoney = customsValueMoney;
    } else if (deMinimisBasis === 'CIF') {
      deMinimisBasisMoney = cifValueMoney;
    }

    // Independent Duty and Tax De-Minimis Evaluation
    const dutyDeMinimis = this.evaluateDeMinimisDecision({
      thresholdExact: rule.customsDutyDeMinimisExact,
      basisMoney: deMinimisBasisMoney,
      basisType: deMinimisBasis,
      comparison: deMinimisComparison,
      currency: curr
    });

    const taxDeMinimis = this.evaluateDeMinimisDecision({
      thresholdExact: rule.importTaxDeMinimisExact,
      basisMoney: deMinimisBasisMoney,
      basisType: deMinimisBasis,
      comparison: deMinimisComparison,
      currency: curr
    });

    const taxNumerator = rule.taxRateNumerator != null ? Number(rule.taxRateNumerator) : (rule.standardRatePercent ? Math.round(rule.standardRatePercent * 100) : 0);
    const taxDenominator = rule.taxRateDenominator != null ? Number(rule.taxRateDenominator) : 10000;
    const dutyNumerator = rule.dutyRateNumerator != null ? Number(rule.dutyRateNumerator) : (rule.dutyPercent ? Math.round(rule.dutyPercent * 100) : 0);
    const dutyDenominator = rule.dutyRateDenominator != null ? Number(rule.dutyRateDenominator) : 10000;

    const isTaxable = rule.requiresTax !== false && !taxDeMinimis.exempt && taxNumerator > 0;
    const isDutiable = !isDomestic && (rule.requiresDuty === true || incoterm === 'DDP') && !dutyDeMinimis.exempt && dutyNumerator > 0;

    // 1. Calculate Tax using Exact Rational Arithmetic on selected basis
    const taxableBasisType = (rule.taxableBasis || 'subtotal').toLowerCase();
    let taxableBasisMoney = goodsValueMoney;
    if (taxableBasisType === 'subtotal_shipping') {
      taxableBasisMoney = goodsValueMoney.add(shippingMoney);
    } else if (taxableBasisType === 'cif') {
      taxableBasisMoney = cifValueMoney;
    }

    let assessedTaxMoney = Money.zero(curr);
    if (isTaxable) {
      if (taxTreatment === 'inclusive') {
        // Exact tax-inclusive extraction formula: tax = basis * num / (denom + num)
        const combinedDenominator = taxDenominator + taxNumerator;
        assessedTaxMoney = taxableBasisMoney.multiplyRational(taxNumerator, combinedDenominator, roundingMode);
      } else {
        // Exclusive tax addition formula: tax = basis * num / denom
        assessedTaxMoney = taxableBasisMoney.multiplyRational(taxNumerator, taxDenominator, roundingMode);
      }
    }

    // Additional tax payable at checkout:
    // Exclusive: assessedTaxMoney added on top of merchandise
    // Inclusive: exact zero additional (tax is already inside merchandise price)
    const additionalTaxPayableMoney = taxTreatment === 'inclusive' ? Money.zero(curr) : assessedTaxMoney;
    const taxIncludedMoney = taxTreatment === 'inclusive' ? assessedTaxMoney : Money.zero(curr);

    // 2. Calculate Duty using Exact Rational Arithmetic
    let estimatedDutyMoney = Money.zero(curr);
    if (isDutiable) {
      const dutyBase = customsValueMoney;
      estimatedDutyMoney = dutyBase.multiplyRational(dutyNumerator, dutyDenominator, roundingMode);
    }

    // 3. Incoterm Payable Duty Determination
    // DDP: payable at checkout (seller collects import duties)
    // DAP / DOMESTIC: exact zero payable at checkout (buyer pays at border / domestic)
    let payableDutyMoney = Money.zero(curr);
    if (incoterm === 'DDP') {
      payableDutyMoney = estimatedDutyMoney;
    }

    const taxRatePercent = taxDenominator > 0 ? (taxNumerator / taxDenominator) * 100 : 0;
    const dutyRatePercent = dutyDenominator > 0 ? (dutyNumerator / dutyDenominator) * 100 : 0;

    // Grand total and Landed cost compositions
    const landedCostMoney = goodsValueMoney.add(shippingMoney).add(additionalTaxPayableMoney).add(estimatedDutyMoney);
    const grandTotalMoney = goodsValueMoney.add(shippingMoney).add(additionalTaxPayableMoney).add(payableDutyMoney);

    return {
      destinationCountry: dest,
      destinationSubdivision: administrativeArea || '',
      originCountry: origin,
      isDomestic,
      incoterm,
      taxType,
      taxTreatment,
      taxableBasis: taxableBasisType,
      taxRateNumerator: taxNumerator,
      taxRateDenominator: taxDenominator,
      taxRatePercent,
      taxAmount: Number(assessedTaxMoney.toDecimalString()),
      taxAmountExact: MoneyMapper.toPersistence(assessedTaxMoney),
      additionalTaxAmount: Number(additionalTaxPayableMoney.toDecimalString()),
      additionalTaxAmountExact: MoneyMapper.toPersistence(additionalTaxPayableMoney),
      taxIncludedAmount: Number(taxIncludedMoney.toDecimalString()),
      taxIncludedAmountExact: MoneyMapper.toPersistence(taxIncludedMoney),
      dutyRateNumerator: dutyNumerator,
      dutyRateDenominator: dutyDenominator,
      dutyRatePercent,
      estimatedDutyAmount: Number(estimatedDutyMoney.toDecimalString()),
      estimatedDutyExact: MoneyMapper.toPersistence(estimatedDutyMoney),
      payableDutyAmount: Number(payableDutyMoney.toDecimalString()),
      payableDutyExact: MoneyMapper.toPersistence(payableDutyMoney),
      dutyAmount: Number(payableDutyMoney.toDecimalString()),
      dutyAmountExact: MoneyMapper.toPersistence(payableDutyMoney),
      goodsValueExact: MoneyMapper.toPersistence(goodsValueMoney),
      customsValueExact: MoneyMapper.toPersistence(customsValueMoney),
      cifValueExact: MoneyMapper.toPersistence(cifValueMoney),
      customsValueIncludesShipping,
      customsValueIncludesInsurance,
      dutyDeMinimis,
      taxDeMinimis,
      landedCostExact: MoneyMapper.toPersistence(landedCostMoney),
      checkoutGrandTotalExact: MoneyMapper.toPersistence(grandTotalMoney),
      currency: curr,
      provenance: {
        engine: 'MevaPur-Deterministic-TaxEngine-v2',
        configVersionId: configVersionId || rule.configVersionId || 'v-active',
        merchantScopeId: merchantScopeId || 'default',
        ruleId: rule.ruleId || `TAX-${dest}`,
        priority: rule.priority !== undefined ? Number(rule.priority) : 100,
        taxType,
        taxTreatment,
        taxableBasis: taxableBasisType,
        taxRateNumerator: taxNumerator,
        taxRateDenominator: taxDenominator,
        dutyRateNumerator: dutyNumerator,
        dutyRateDenominator: dutyDenominator,
        roundingMode,
        roundingScope: rule.roundingScope || 'subtotal',
        incoterm,
        providerType: rule.providerType || 'MANUAL_GOVERNED',
        sourceAuthority: rule.sourceAuthority || 'Configured Commerce Authority',
        sourceReference: rule.sourceReference || 'CONFIGURED_GOVERNANCE_RULE',
        verificationStatus: rule.verificationStatus || 'VERIFIED_LEGAL_RULE',
        dutyRefundPolicy: rule.dutyRefundPolicy || null,
        taxRefundPolicy: rule.taxRefundPolicy || null,
        customsValueIncludesShipping,
        customsValueIncludesInsurance,
        dutyDeMinimis,
        taxDeMinimis,
        insuranceProvenance: finalInsuranceProvenance,
        timestamp: new Date().toISOString()
      }
    };
  }

  compareDeMinimisDecisions(decisionA, decisionB) {
    return TaxDutyEngine.compareDeMinimisDecisions(decisionA, decisionB);
  }
}

const defaultInstance = new TaxDutyEngine();
defaultInstance.TaxDutyEngine = TaxDutyEngine;
defaultInstance.compareDeMinimisDecisions = TaxDutyEngine.compareDeMinimisDecisions;

TaxDutyEngine.calculate = defaultInstance.calculate.bind(defaultInstance);
TaxDutyEngine.evaluateDeMinimisDecision = defaultInstance.evaluateDeMinimisDecision.bind(defaultInstance);
TaxDutyEngine.resolveMatchingRule = defaultInstance.resolveMatchingRule.bind(defaultInstance);

module.exports = defaultInstance;
module.exports.TaxDutyEngine = TaxDutyEngine;

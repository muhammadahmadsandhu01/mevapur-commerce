/**
 * @file taxRuleIntegrityValidator.js
 * @description Pure validation helper for Phase 6D-4 Tax, Duty & Customs Governance rules.
 * Located in backend/validators to maintain pure domain/validator architectural layering.
 * Enforces rule uniqueness, exact-money de minimis bounds, DDP/DAP semantics,
 * explicit legal/refund policies, provider governance, and deterministic route non-ambiguity.
 */

const { CountryRegistry, CurrencyRegistry } = require('../modules/commerce');

const ALLOWED_TAX_TYPES = ['VAT', 'GST', 'SALES_TAX', 'CUSTOMS_VAT', 'EXEMPT'];
const ALLOWED_TAX_TREATMENTS = ['inclusive', 'exclusive'];
const ALLOWED_TAXABLE_BASES = ['subtotal', 'subtotal_shipping', 'cif'];
const ALLOWED_ROUNDING_MODES = ['HALF_UP', 'HALF_EVEN', 'FLOOR', 'CEIL'];
const ALLOWED_ROUNDING_SCOPES = ['subtotal', 'per_item'];
const ALLOWED_INCOTERMS = ['DOMESTIC', 'DAP', 'DDP'];
const ALLOWED_DE_MINIMIS_BASES = ['GOODS_VALUE', 'CUSTOMS_VALUE', 'CIF'];
const ALLOWED_DE_MINIMIS_COMPARISONS = ['LT', 'LTE'];
const ALLOWED_DUTY_REFUND_POLICIES = ['REFUNDABLE', 'NON_REFUNDABLE', 'MANUAL_REVIEW'];
const ALLOWED_TAX_REFUND_POLICIES = ['REFUNDABLE', 'NON_REFUNDABLE', 'PROPORTIONAL', 'MANUAL_REVIEW'];
const ALLOWED_PROVIDER_TYPES = ['MANUAL_GOVERNED', 'EXTERNAL_PROVIDER'];
const ALLOWED_VERIFICATION_STATUSES = ['UNVERIFIED_ESTIMATE', 'VERIFIED_LEGAL_RULE'];

/**
 * Validates a MoneyExact object representation.
 * Rejects unsafe numeric numbers (e.g. > Number.MAX_SAFE_INTEGER), floats, and scientific notation.
 * @param {Object} moneyObj
 * @param {string} fieldPath
 * @param {Array<string>} [enabledCurrencies]
 * @returns {Array<{ code: string, path: string, message: string }>}
 */
function validateMoneyExact(moneyObj, fieldPath, enabledCurrencies = null) {
  const errors = [];
  if (!moneyObj) return errors;

  const rawMinor = moneyObj.amountMinor !== undefined ? moneyObj.amountMinor : moneyObj;
  let minorStr = '';

  if (rawMinor && typeof rawMinor === 'object' && rawMinor.$numberDecimal) {
    minorStr = String(rawMinor.$numberDecimal);
  } else if (rawMinor && typeof rawMinor === 'object' && typeof rawMinor.toString === 'function') {
    minorStr = rawMinor.toString();
  } else if (typeof rawMinor === 'number') {
    if (!Number.isSafeInteger(rawMinor) || rawMinor < 0) {
      errors.push({
        code: 'INVALID_MONEY_AMOUNT_MINOR',
        path: `${fieldPath}.amountMinor`,
        message: `amountMinor '${rawMinor}' must be a non-negative safe integer`
      });
      return errors;
    }
    minorStr = String(rawMinor);
  } else if (typeof rawMinor === 'string') {
    minorStr = rawMinor;
  } else {
    errors.push({
      code: 'INVALID_MONEY_AMOUNT_MINOR',
      path: `${fieldPath}.amountMinor`,
      message: 'amountMinor must be a valid integer or string representation'
    });
    return errors;
  }

  // Reject scientific notation, floats, negative values
  if (!/^\d+$/.test(minorStr.trim())) {
    errors.push({
      code: 'INVALID_MONEY_AMOUNT_MINOR',
      path: `${fieldPath}.amountMinor`,
      message: `amountMinor '${minorStr}' must be a non-negative integer without decimals or scientific notation`
    });
  } else {
    try {
      const b = BigInt(minorStr.trim());
      if (b < 0n || b > 999999999999999999n) {
        errors.push({
          code: 'MONEY_AMOUNT_OUT_OF_BOUNDS',
          path: `${fieldPath}.amountMinor`,
          message: 'amountMinor exceeds maximum canonical domain size (18 digits)'
        });
      }
    } catch {
      errors.push({
        code: 'INVALID_MONEY_AMOUNT_MINOR',
        path: `${fieldPath}.amountMinor`,
        message: 'amountMinor cannot be parsed as a safe integer'
      });
    }
  }

  const curr = typeof moneyObj.currency === 'string' ? moneyObj.currency.trim().toUpperCase() : '';
  if (!curr || !CurrencyRegistry.has(curr)) {
    errors.push({
      code: 'INVALID_MONEY_CURRENCY',
      path: `${fieldPath}.currency`,
      message: `Currency '${moneyObj.currency}' is not a valid ISO 4217 currency`
    });
  } else if (Array.isArray(enabledCurrencies) && enabledCurrencies.length > 0 && !enabledCurrencies.includes(curr)) {
    errors.push({
      code: 'CURRENCY_NOT_ENABLED',
      path: `${fieldPath}.currency`,
      message: `Currency '${curr}' is not among the merchant profile enabled currencies`
    });
  }

  const exp = moneyObj.exponent !== undefined && moneyObj.exponent !== null ? Number(moneyObj.exponent) : 2;
  if (!Number.isInteger(exp) || exp < 0 || exp > 4) {
    errors.push({
      code: 'INVALID_MONEY_EXPONENT',
      path: `${fieldPath}.exponent`,
      message: `Exponent '${moneyObj.exponent}' must be an integer between 0 and 4`
    });
  }

  return errors;
}

/**
 * Pure validation helper for tax and customs rules.
 * @param {Array<Object>} taxRules
 * @param {Object} [merchantProfile]
 * @returns {Array<{ code: string, path: string, message: string }>}
 */
function validateTaxRulesIntegrity(taxRules, merchantProfile = null) {
  const errors = [];
  if (!Array.isArray(taxRules)) return errors;

  const ruleIds = new Set();
  const enabledRouteMap = new Map();
  const merchantCountry = merchantProfile?.merchantCountry ? merchantProfile.merchantCountry.trim().toUpperCase() : null;
  const enabledCurrencies = Array.isArray(merchantProfile?.enabledCurrencies)
    ? merchantProfile.enabledCurrencies.map((c) => String(c).trim().toUpperCase())
    : (merchantProfile?.baseCurrency ? [String(merchantProfile.baseCurrency).trim().toUpperCase()] : null);

  for (let i = 0; i < taxRules.length; i++) {
    const tr = taxRules[i];
    if (!tr || typeof tr !== 'object') {
      errors.push({
        code: 'INVALID_TAX_RULE_OBJECT',
        path: `taxRules[${i}]`,
        message: 'Tax rule entry must be a valid object'
      });
      continue;
    }

    // 1. Rule ID
    const ruleId = typeof tr.ruleId === 'string' ? tr.ruleId.trim() : '';
    if (!ruleId) {
      errors.push({
        code: 'TAX_RULE_ID_REQUIRED',
        path: `taxRules[${i}].ruleId`,
        message: 'Tax ruleId is required and cannot be empty'
      });
    } else if (ruleIds.has(ruleId)) {
      errors.push({
        code: 'DUPLICATE_TAX_RULE_ID',
        path: `taxRules[${i}].ruleId`,
        message: `Duplicate tax ruleId '${ruleId}'`
      });
    } else {
      ruleIds.add(ruleId);
    }

    // 2. Destination Country & Subdivision
    const destCountry = typeof tr.destinationCountry === 'string' ? tr.destinationCountry.trim().toUpperCase() : '';
    if (!destCountry || !CountryRegistry.hasCountry(destCountry)) {
      errors.push({
        code: 'INVALID_TAX_DESTINATION_COUNTRY',
        path: `taxRules[${i}].destinationCountry`,
        message: `Tax destination country '${tr.destinationCountry}' is not a valid ISO 3166-1 alpha-2 code`
      });
    }

    const destSub = typeof tr.destinationSubdivision === 'string' ? tr.destinationSubdivision.trim().toUpperCase() : '';

    // 3. Priority Bounds
    const priority = tr.priority !== undefined && tr.priority !== null ? Number(tr.priority) : 100;
    if (!Number.isInteger(priority) || priority < 0 || priority > 10000) {
      errors.push({
        code: 'INVALID_TAX_RULE_PRIORITY',
        path: `taxRules[${i}].priority`,
        message: `Priority '${tr.priority}' must be an integer between 0 and 10000`
      });
    }

    // 4. Rate Numerators and Denominators
    const taxNum = Number(tr.taxRateNumerator);
    if (!Number.isInteger(taxNum) || taxNum < 0 || taxNum > 10000000) {
      errors.push({
        code: 'INVALID_TAX_NUMERATOR',
        path: `taxRules[${i}].taxRateNumerator`,
        message: 'taxRateNumerator must be an integer between 0 and 10,000,000'
      });
    }

    const taxDenom = tr.taxRateDenominator !== undefined && tr.taxRateDenominator !== null ? Number(tr.taxRateDenominator) : 10000;
    if (!Number.isInteger(taxDenom) || taxDenom < 1 || taxDenom > 10000000) {
      errors.push({
        code: 'INVALID_TAX_DENOMINATOR',
        path: `taxRules[${i}].taxRateDenominator`,
        message: 'taxRateDenominator must be a positive integer between 1 and 10,000,000'
      });
    }

    const dutyNum = tr.dutyRateNumerator !== undefined && tr.dutyRateNumerator !== null ? Number(tr.dutyRateNumerator) : 0;
    if (!Number.isInteger(dutyNum) || dutyNum < 0 || dutyNum > 10000000) {
      errors.push({
        code: 'INVALID_DUTY_NUMERATOR',
        path: `taxRules[${i}].dutyRateNumerator`,
        message: 'dutyRateNumerator must be an integer between 0 and 10,000,000'
      });
    }

    const dutyDenom = tr.dutyRateDenominator !== undefined && tr.dutyRateDenominator !== null ? Number(tr.dutyRateDenominator) : 10000;
    if (!Number.isInteger(dutyDenom) || dutyDenom < 1 || dutyDenom > 10000000) {
      errors.push({
        code: 'INVALID_DUTY_DENOMINATOR',
        path: `taxRules[${i}].dutyRateDenominator`,
        message: 'dutyRateDenominator must be a positive integer between 1 and 10,000,000'
      });
    }

    // 5. Enumeration Bounds
    if (tr.taxType && !ALLOWED_TAX_TYPES.includes(tr.taxType)) {
      errors.push({
        code: 'INVALID_TAX_TYPE',
        path: `taxRules[${i}].taxType`,
        message: `taxType '${tr.taxType}' is not valid`
      });
    }

    if (tr.taxTreatment && !ALLOWED_TAX_TREATMENTS.includes(tr.taxTreatment)) {
      errors.push({
        code: 'INVALID_TAX_TREATMENT',
        path: `taxRules[${i}].taxTreatment`,
        message: `taxTreatment '${tr.taxTreatment}' is not valid`
      });
    }

    if (tr.taxableBasis && !ALLOWED_TAXABLE_BASES.includes(tr.taxableBasis)) {
      errors.push({
        code: 'INVALID_TAXABLE_BASIS',
        path: `taxRules[${i}].taxableBasis`,
        message: `taxableBasis '${tr.taxableBasis}' is not valid`
      });
    }

    if (tr.roundingMode && !ALLOWED_ROUNDING_MODES.includes(tr.roundingMode)) {
      errors.push({
        code: 'INVALID_ROUNDING_MODE',
        path: `taxRules[${i}].roundingMode`,
        message: `roundingMode '${tr.roundingMode}' is not valid`
      });
    }

    if (tr.roundingScope && !ALLOWED_ROUNDING_SCOPES.includes(tr.roundingScope)) {
      errors.push({
        code: 'INVALID_ROUNDING_SCOPE',
        path: `taxRules[${i}].roundingScope`,
        message: `roundingScope '${tr.roundingScope}' is not valid`
      });
    }

    if (!tr.incoterm || !ALLOWED_INCOTERMS.includes(tr.incoterm)) {
      errors.push({
        code: 'INVALID_INCOTERM',
        path: `taxRules[${i}].incoterm`,
        message: `incoterm '${tr.incoterm}' is required and must be one of: ${ALLOWED_INCOTERMS.join(', ')}`
      });
    }

    // 6. Explicit Legal & Refund Policies (Required for enabled rules)
    if (tr.enabled !== false) {
      if (!tr.dutyRefundPolicy) {
        errors.push({
          code: 'DUTY_REFUND_POLICY_REQUIRED',
          path: `taxRules[${i}].dutyRefundPolicy`,
          message: 'dutyRefundPolicy is required for enabled tax rules'
        });
      } else if (!ALLOWED_DUTY_REFUND_POLICIES.includes(tr.dutyRefundPolicy)) {
        errors.push({
          code: 'INVALID_DUTY_REFUND_POLICY',
          path: `taxRules[${i}].dutyRefundPolicy`,
          message: `dutyRefundPolicy '${tr.dutyRefundPolicy}' is not valid`
        });
      }

      if (!tr.taxRefundPolicy) {
        errors.push({
          code: 'TAX_REFUND_POLICY_REQUIRED',
          path: `taxRules[${i}].taxRefundPolicy`,
          message: 'taxRefundPolicy is required for enabled tax rules'
        });
      } else if (!ALLOWED_TAX_REFUND_POLICIES.includes(tr.taxRefundPolicy)) {
        errors.push({
          code: 'INVALID_TAX_REFUND_POLICY',
          path: `taxRules[${i}].taxRefundPolicy`,
          message: `taxRefundPolicy '${tr.taxRefundPolicy}' is not valid`
        });
      }

      if (typeof tr.customsValueIncludesShipping !== 'boolean') {
        errors.push({
          code: 'CUSTOMS_VALUE_INCLUDES_SHIPPING_REQUIRED',
          path: `taxRules[${i}].customsValueIncludesShipping`,
          message: 'customsValueIncludesShipping must be an explicit boolean for enabled rules'
        });
      }

      if (typeof tr.customsValueIncludesInsurance !== 'boolean') {
        errors.push({
          code: 'CUSTOMS_VALUE_INCLUDES_INSURANCE_REQUIRED',
          path: `taxRules[${i}].customsValueIncludesInsurance`,
          message: 'customsValueIncludesInsurance must be an explicit boolean for enabled rules'
        });
      }
    } else {
      if (tr.dutyRefundPolicy && !ALLOWED_DUTY_REFUND_POLICIES.includes(tr.dutyRefundPolicy)) {
        errors.push({
          code: 'INVALID_DUTY_REFUND_POLICY',
          path: `taxRules[${i}].dutyRefundPolicy`,
          message: `dutyRefundPolicy '${tr.dutyRefundPolicy}' is not valid`
        });
      }
      if (tr.taxRefundPolicy && !ALLOWED_TAX_REFUND_POLICIES.includes(tr.taxRefundPolicy)) {
        errors.push({
          code: 'INVALID_TAX_REFUND_POLICY',
          path: `taxRules[${i}].taxRefundPolicy`,
          message: `taxRefundPolicy '${tr.taxRefundPolicy}' is not valid`
        });
      }
    }

    // 7. De-Minimis Thresholds & Basis / Comparison
    const hasDeMinimisThreshold = Boolean(tr.customsDutyDeMinimisExact || tr.importTaxDeMinimisExact);
    if (hasDeMinimisThreshold) {
      if (!tr.deMinimisBasis || !ALLOWED_DE_MINIMIS_BASES.includes(tr.deMinimisBasis)) {
        errors.push({
          code: 'DE_MINIMIS_BASIS_REQUIRED',
          path: `taxRules[${i}].deMinimisBasis`,
          message: `deMinimisBasis is required when de-minimis threshold is configured and must be one of: ${ALLOWED_DE_MINIMIS_BASES.join(', ')}`
        });
      }
      if (!tr.deMinimisComparison || !ALLOWED_DE_MINIMIS_COMPARISONS.includes(tr.deMinimisComparison)) {
        errors.push({
          code: 'DE_MINIMIS_COMPARISON_REQUIRED',
          path: `taxRules[${i}].deMinimisComparison`,
          message: `deMinimisComparison is required when de-minimis threshold is configured and must be one of: ${ALLOWED_DE_MINIMIS_COMPARISONS.join(', ')}`
        });
      }
    } else {
      if (tr.deMinimisBasis && !ALLOWED_DE_MINIMIS_BASES.includes(tr.deMinimisBasis)) {
        errors.push({
          code: 'INVALID_DE_MINIMIS_BASIS',
          path: `taxRules[${i}].deMinimisBasis`,
          message: `deMinimisBasis '${tr.deMinimisBasis}' is not valid`
        });
      }
      if (tr.deMinimisComparison && !ALLOWED_DE_MINIMIS_COMPARISONS.includes(tr.deMinimisComparison)) {
        errors.push({
          code: 'INVALID_DE_MINIMIS_COMPARISON',
          path: `taxRules[${i}].deMinimisComparison`,
          message: `deMinimisComparison '${tr.deMinimisComparison}' is not valid`
        });
      }
    }

    // 8. Provider Type & Reference Governance
    if (tr.providerType && !ALLOWED_PROVIDER_TYPES.includes(tr.providerType)) {
      errors.push({
        code: 'INVALID_PROVIDER_TYPE',
        path: `taxRules[${i}].providerType`,
        message: `providerType '${tr.providerType}' is not valid`
      });
    } else if (tr.providerType === 'EXTERNAL_PROVIDER') {
      if (!tr.providerReference || typeof tr.providerReference !== 'string' || !tr.providerReference.trim()) {
        errors.push({
          code: 'PROVIDER_REFERENCE_REQUIRED',
          path: `taxRules[${i}].providerReference`,
          message: 'providerReference is required when providerType is EXTERNAL_PROVIDER'
        });
      }
      errors.push({
        code: 'UNSUPPORTED_TAX_PROVIDER_TYPE',
        path: `taxRules[${i}].providerType`,
        message: 'External tax providers are not supported in Phase 6D-4; providerType must be MANUAL_GOVERNED'
      });
    }

    // 9. Verification Status
    if (tr.verificationStatus && !ALLOWED_VERIFICATION_STATUSES.includes(tr.verificationStatus)) {
      errors.push({
        code: 'INVALID_VERIFICATION_STATUS',
        path: `taxRules[${i}].verificationStatus`,
        message: `verificationStatus '${tr.verificationStatus}' is not valid`
      });
    } else if (tr.enabled !== false && tr.verificationStatus !== 'VERIFIED_LEGAL_RULE') {
      errors.push({
        code: 'UNVERIFIED_TAX_RULE',
        path: `taxRules[${i}].verificationStatus`,
        message: 'verificationStatus must be VERIFIED_LEGAL_RULE for enabled tax rules'
      });
    }

    // 10. Source Provenance
    if (!tr.sourceAuthority || typeof tr.sourceAuthority !== 'string' || !tr.sourceAuthority.trim()) {
      errors.push({
        code: 'SOURCE_AUTHORITY_REQUIRED',
        path: `taxRules[${i}].sourceAuthority`,
        message: 'sourceAuthority is required for tax governance rules'
      });
    }

    if (!tr.sourceReference || typeof tr.sourceReference !== 'string' || !tr.sourceReference.trim()) {
      errors.push({
        code: 'SOURCE_REFERENCE_REQUIRED',
        path: `taxRules[${i}].sourceReference`,
        message: 'sourceReference is required for tax governance rules'
      });
    }

    // 11. Exact Money Bounds for De Minimis & Exemption
    if (tr.customsDutyDeMinimisExact) {
      errors.push(...validateMoneyExact(tr.customsDutyDeMinimisExact, `taxRules[${i}].customsDutyDeMinimisExact`, enabledCurrencies));
    }
    if (tr.importTaxDeMinimisExact) {
      errors.push(...validateMoneyExact(tr.importTaxDeMinimisExact, `taxRules[${i}].importTaxDeMinimisExact`, enabledCurrencies));
    }
    if (tr.exemptionThresholdExact) {
      errors.push(...validateMoneyExact(tr.exemptionThresholdExact, `taxRules[${i}].exemptionThresholdExact`, enabledCurrencies));
    }

    // 12. Incoterm & Domestic Consistency
    if (merchantCountry && destCountry) {
      if (tr.incoterm === 'DOMESTIC' && destCountry !== merchantCountry) {
        errors.push({
          code: 'INCOTERM_DOMESTIC_MISMATCH',
          path: `taxRules[${i}].incoterm`,
          message: `Incoterm DOMESTIC is only valid for merchant country '${merchantCountry}', but destination is '${destCountry}'`
        });
      }
      if (destCountry === merchantCountry && tr.incoterm && tr.incoterm !== 'DOMESTIC') {
        errors.push({
          code: 'INCOTERM_INTERNATIONAL_MISMATCH',
          path: `taxRules[${i}].incoterm`,
          message: `Domestic destination '${destCountry}' requires DOMESTIC incoterm, found '${tr.incoterm}'`
        });
      }
    }

    // 13. Non-Ambiguity Invariant: Rejection of any two enabled rules with identical route coverage
    // Because runtime TaxDutyEngine ignores priority and returns first matching rule in array order,
    // identical route matches must be strictly rejected regardless of priority or taxType.
    if (tr.enabled !== false && destCountry) {
      const routeKey = `${destCountry}:${destSub || '*'}`;
      if (enabledRouteMap.has(routeKey)) {
        const existingRuleId = enabledRouteMap.get(routeKey);
        errors.push({
          code: 'AMBIGUOUS_TAX_RULE_OVERLAP',
          path: `taxRules[${i}]`,
          message: `Ambiguous tax rule overlap: rule '${ruleId || i}' targets the same destination route '${destCountry}${destSub ? `/${destSub}` : ''}' as rule '${existingRuleId}'`
        });
      } else {
        enabledRouteMap.set(routeKey, ruleId || `rule_${i}`);
      }
    }
  }

  return errors;
}

module.exports = {
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
};

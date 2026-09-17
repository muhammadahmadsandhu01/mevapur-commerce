/**
 * @file TaxService.js
 * @description Global Tax and Landed-Cost Service.
 * Delegates strictly to TaxDutyEngine for exact-money tax, VAT/GST, and duty calculations.
 * Requires explicit trusted merchant and market context.
 */

const TaxDutyEngine = require('../checkout/TaxDutyEngine');
const { AppError } = require('../../common/errors/AppError');

class TaxService {
  /**
   * Calculate tax amount for subtotal and address with explicit context
   * @param {Object} params
   * @param {number|Object} params.subtotal
   * @param {Object} params.address
   * @param {string} params.currency
   * @param {string} params.originCountry
   * @param {Array<Object>} [params.taxRules]
   * @param {string} [params.merchantScopeId='default']
   * @param {string} [params.configVersionId]
   * @returns {number} Payable tax and duty amount in decimal
   */
  calculate({
    subtotal,
    address,
    currency,
    originCountry,
    taxRules = null,
    merchantScopeId = 'default',
    configVersionId = null
  } = {}) {
    if (!address || (!address.country && !address.countryCode)) {
      throw new AppError('Destination address is required for tax calculation', 400, 'TAX_DESTINATION_REQUIRED');
    }
    if (!currency) {
      throw new AppError('Currency is required for tax calculation', 400, 'TAX_CURRENCY_REQUIRED');
    }
    if (!originCountry) {
      throw new AppError('Origin country is required for tax calculation', 400, 'TAX_ORIGIN_REQUIRED');
    }

    const result = TaxDutyEngine.calculate({
      destinationCountry: address.countryCode || address.country,
      originCountry,
      administrativeArea: address.province || address.state || address.administrativeArea || '',
      taxableSubtotal: subtotal,
      currency,
      taxRules,
      merchantScopeId,
      configVersionId
    });

    return result.taxAmount + result.payableDutyAmount;
  }

  /**
   * Comprehensive tax & duty calculation
   * @param {Object} params
   * @returns {Object}
   */
  calculateComprehensive(params) {
    return TaxDutyEngine.calculate(params);
  }
}

module.exports = new TaxService();
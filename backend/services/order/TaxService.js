/**
 * @file TaxService.js
 * @description Global Tax and Landed-Cost Service.
 * Delegates to TaxDutyEngine for exact-money tax, VAT/GST, and duty calculations.
 */

const TaxDutyEngine = require('../checkout/TaxDutyEngine');

class TaxService {
  /**
   * Calculate tax amount for subtotal and address
   * @param {number|Object} subtotal
   * @param {Object} address
   * @param {string} [currency='PKR']
   * @returns {number} Tax amount in decimal
   */
  calculate(subtotal, address, currency = 'PKR') {
    if (!address || !address.country) {
      return 0;
    }

    const result = TaxDutyEngine.calculate({
      destinationCountry: address.countryCode || address.country,
      originCountry: 'PK',
      administrativeArea: address.province || address.state || '',
      taxableSubtotal: subtotal,
      currency
    });

    return result.taxAmount + result.dutyAmount;
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
class TaxService {
  /**
   * Calculate tax
   * @param {number} subtotal 
   * @param {Object} address 
   * @returns {number} Tax amount
   */
  calculate(subtotal, address) {
    // Currently no tax
    // Future: Implement GST/VAT logic here based on location
    return 0;
  }
}

module.exports = new TaxService();
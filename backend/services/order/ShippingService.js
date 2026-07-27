class ShippingService {
  /**
   * Calculate shipping cost based on address and order value
   * @param {Object} address - Shipping address
   * @param {number} afterDiscountAmount - Order total after discount
   * @returns {number} Shipping cost
   */
  calculate(address, afterDiscountAmount) {
    // Simple Logic: Free shipping over 1500 PKR
    if (afterDiscountAmount >= 1500) {
      return 0;
    }

    // Flat rate for now
    // Future: Can add logic based on province/city or courier API
    return 150;
  }
}

module.exports = new ShippingService();
const Coupon = require('../models/Coupon');

class PricingService {
  /**
   * Calculate totals strictly on server side
   * @param {Array} items - Cart items with valid prices from DB
   * @param {String} couponCode - Optional coupon code
   * @param {Object} shippingAddress - For shipping rules
   */
  static async calculateOrderTotals(items, couponCode = null, shippingAddress = {}) {
    // 1. Calculate Subtotal (Prices MUST come from DB, not client)
    let subtotal = 0;
    for (const item of items) {
      // Ensure price is a number and positive
      const price = parseFloat(item.price) || 0;
      const quantity = parseInt(item.quantity) || 0;
      subtotal += price * quantity;
    }

    // 2. Apply Coupon Discount
    let discountAmount = 0;
    let appliedCoupon = null;

    if (couponCode) {
      const coupon = await Coupon.findOne({ 
        code: couponCode.trim().toUpperCase(), 
        isActive: true 
      });

      if (coupon) {
        const now = new Date();
        if (now >= coupon.startDate && now <= coupon.endDate) {
          if (coupon.usageLimit === 0 || coupon.usedCount < coupon.usageLimit) {
            if (subtotal >= coupon.minOrderAmount) {
              // Calculate Discount
              if (coupon.type === 'percentage') {
                discountAmount = (subtotal * coupon.value) / 100;
                if (coupon.maxDiscount > 0) {
                  discountAmount = Math.min(discountAmount, coupon.maxDiscount);
                }
              } else if (coupon.type === 'fixed') {
                discountAmount = coupon.value;
              }
              
              // Ensure discount doesn't exceed subtotal
              discountAmount = Math.min(discountAmount, subtotal);
              appliedCoupon = coupon;
            }
          }
        }
      }
    }

    const afterDiscount = subtotal - discountAmount;

    // 3. Calculate Shipping (Simple Rule: Free over 1500)
    const shippingCost = afterDiscount >= 1500 ? 0 : 150;

    // 4. Final Total
    const grandTotal = afterDiscount + shippingCost;
    const totalSavings = discountAmount + (shippingCost === 0 ? 150 : 0);

    return {
      subtotal: Number(subtotal.toFixed(2)),
      discountAmount: Number(discountAmount.toFixed(2)),
      shippingCost: Number(shippingCost.toFixed(2)),
      grandTotal: Number(grandTotal.toFixed(2)),
      totalSavings: Number(totalSavings.toFixed(2)),
      appliedCoupon: appliedCoupon ? appliedCoupon._id : null,
      couponCode: appliedCoupon ? appliedCoupon.code : null
    };
  }
}

module.exports = PricingService;
const Coupon = require('../../models/Coupon');

class CouponService {
  /**
   * Validate coupon and calculate discount
   * @param {string} code - Coupon code
   * @param {number} subtotal - Order subtotal
   * @returns {Object} { isValid, discountAmount, appliedCoupon }
   */
  async validateAndCalculate(code, subtotal) {
    if (!code) return { isValid: true, discountAmount: 0, appliedCoupon: null };

    const normalizedCode = code.trim().toUpperCase();
    const coupon = await Coupon.findOne({ code: normalizedCode });

    if (!coupon) {
      throw new Error('Invalid coupon code');
    }

    const now = new Date();
    if (!coupon.isActive || now < coupon.startDate || now > coupon.endDate) {
      throw new Error('Coupon is expired or not active');
    }

    if (coupon.usageLimit > 0 && coupon.usedCount >= coupon.usageLimit) {
      throw new Error('Coupon usage limit reached');
    }

    if (coupon.minOrderAmount > subtotal) {
      throw new Error(`Minimum order amount is ${coupon.minOrderAmount}`);
    }

    // Calculate Discount
    let discountAmount = 0;
    if (coupon.type === 'percentage') {
      discountAmount = (subtotal * coupon.value) / 100;
      if (coupon.maxDiscount > 0 && discountAmount > coupon.maxDiscount) {
        discountAmount = coupon.maxDiscount;
      }
    } else if (coupon.type === 'fixed') {
      discountAmount = coupon.value;
    } else if (coupon.type === 'freeshipping') {
      // Handled in shipping service usually, but here we can set a flag
      discountAmount = 0; 
    }

    return {
      isValid: true,
      discountAmount: Math.min(discountAmount, subtotal), // Cannot exceed subtotal
      appliedCoupon: coupon._id,
      code: coupon.code
    };
  }

  /**
   * Increment coupon usage count
   */
  async incrementUsage(couponId, session) {
    if (!couponId) return;
    await Coupon.findByIdAndUpdate(couponId, { $inc: { usedCount: 1 } }, { session });
  }

  /**
   * Decrement coupon usage count (on cancel)
   */
  async decrementUsage(couponId, session) {
    if (!couponId) return;
    await Coupon.findByIdAndUpdate(couponId, { $inc: { usedCount: -1 } }, { session });
  }
}

module.exports = new CouponService();
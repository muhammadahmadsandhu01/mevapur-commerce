const mongoose = require('mongoose');
const { MoneySchema } = require('../modules/commerce');

const { SUPPORTED_ORDER_PAYMENT_METHODS } = require('../constants/orderConstants');

// Guard Clause: Prevent OverwriteModelError
if (mongoose.models.Coupon) {
  module.exports = mongoose.models.Coupon;
} else {
  const couponSchema = new mongoose.Schema({
    code: {
      type: String,
      required: [true, 'Please add a coupon code'],
      unique: true,
      uppercase: true,
      trim: true
    },
    type: {
      type: String,
      enum: ['percentage', 'fixed', 'freeshipping'],
      required: true
    },
    value: { type: Number, required: true, min: 0 },
    rateNumerator: { type: Number, default: null, min: 0 },
    rateDenominator: { type: Number, default: null, min: 1 },
    valueExact: { type: MoneySchema, default: null },
    minOrderAmount: { type: Number, default: 0, min: 0 },
    minOrderAmountExact: { type: MoneySchema, default: null },
    maxDiscount: { type: Number, default: 0, min: 0 },
    maxDiscountExact: { type: MoneySchema, default: null },
    currency: { type: String, trim: true, uppercase: true, match: /^[A-Z]{3}$/, default: 'PKR' },
    usageLimit: { type: Number, default: 0, min: 0 },
    usedCount: { type: Number, default: 0, min: 0 },
    perCustomerLimit: { type: Number, default: 0, min: 0 },
    status: {
      type: String,
      enum: ['draft', 'active', 'disabled', 'archived'],
      default: 'active',
      required: true,
      index: true
    },
    isActive: { type: Boolean, default: true },
    // Retained for backward-compatibility reads; new mutations use CouponRedemption ledger
    redemptions: [{
      _id: false,
      user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
      count: { type: Number, default: 0, min: 0 },
      lastUsedAt: { type: Date, default: Date.now }
    }],
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    applicableProducts: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
    applicableCategories: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Category' }],
    paymentEligibility: {
      restrictionMode: {
        type: String,
        enum: ['ANY', 'ALLOWLIST'],
        default: 'ANY',
        required: true
      },
      allowedMethods: {
        type: [{
          type: String,
          enum: SUPPORTED_ORDER_PAYMENT_METHODS,
          trim: true,
          lowercase: true
        }],
        validate: {
          validator: function(val) {
            if (this.paymentEligibility?.restrictionMode === 'ALLOWLIST') {
              return Array.isArray(val) && val.length > 0;
            }
            return true;
          },
          message: 'ALLOWLIST payment restriction requires at least one valid payment method'
        }
      }
    },
    description: { type: String, maxlength: 500, default: '', trim: true }
  }, { timestamps: true, versionKey: '__v' });

  // Pre-validate hook for dual-write compatibility and payment method deduplication
  couponSchema.pre('validate', function(next) {
    if (this.status) {
      this.isActive = (this.status === 'active');
    } else {
      this.status = this.isActive ? 'active' : 'disabled';
    }
    if (this.paymentEligibility?.allowedMethods && Array.isArray(this.paymentEligibility.allowedMethods)) {
      this.paymentEligibility.allowedMethods = [...new Set(
        this.paymentEligibility.allowedMethods.map((m) => String(m).toLowerCase().trim())
      )];
    }
    next();
  });

  /**
   * Evaluates if a given payment method is allowed under this coupon.
   * Backward compatible: missing paymentEligibility or 'ANY' mode allows all methods.
   * @param {string} methodCode
   * @returns {boolean}
   */
  couponSchema.methods.isMethodAllowed = function isMethodAllowed(methodCode) {
    if (!this.paymentEligibility || this.paymentEligibility.restrictionMode === 'ANY') {
      return true;
    }
    if (this.paymentEligibility.restrictionMode === 'ALLOWLIST') {
      const allowed = this.paymentEligibility.allowedMethods || [];
      return allowed.includes(String(methodCode).toLowerCase().trim());
    }
    return true;
  };

  /**
   * Helper to determine if COD tender is allowed.
   * @returns {boolean}
   */
  couponSchema.methods.isCodAllowed = function isCodAllowed() {
    return this.isMethodAllowed('cod');
  };

  couponSchema.index({ status: 1, startDate: 1, endDate: 1 });
  couponSchema.index({ isActive: 1, startDate: 1, endDate: 1 });
  couponSchema.index({ 'redemptions.user': 1 });

  module.exports = mongoose.model('Coupon', couponSchema);
}

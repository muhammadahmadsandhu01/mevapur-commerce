const mongoose = require('mongoose');

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
    minOrderAmount: { type: Number, default: 0, min: 0 },
    maxDiscount: { type: Number, default: 0, min: 0 },
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
    description: { type: String, maxlength: 500, default: '', trim: true }
  }, { timestamps: true, versionKey: '__v' });

  // Pre-validate hook for dual-write compatibility
  couponSchema.pre('validate', function(next) {
    if (this.status) {
      this.isActive = (this.status === 'active');
    } else {
      this.status = this.isActive ? 'active' : 'disabled';
    }
    next();
  });

  couponSchema.index({ status: 1, startDate: 1, endDate: 1 });
  couponSchema.index({ isActive: 1, startDate: 1, endDate: 1 });
  couponSchema.index({ 'redemptions.user': 1 });

  module.exports = mongoose.model('Coupon', couponSchema);
}

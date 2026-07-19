const mongoose = require('mongoose');

// Guard Clause: Prevent OverwriteModelError
if (mongoose.models.Coupon) {
  module.exports = mongoose.models.Coupon;
} else {
  const couponSchema = new mongoose.Schema({
    // unique: true creates index automatically
    code: { type: String, required: [true, 'Please add a coupon code'], unique: true, uppercase: true, trim: true },
    type: { type: String, enum: ['percentage', 'fixed', 'freeshipping'], required: true },
    value: { type: Number, required: true, min: 0 },
    minOrderAmount: { type: Number, default: 0, min: 0 },
    maxDiscount: { type: Number, default: 0, min: 0 },
    usageLimit: { type: Number, default: 0, min: 0 },
    usedCount: { type: Number, default: 0 },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    isActive: { type: Boolean, default: true },
    applicableProducts: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
    applicableCategories: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Category' }],
    description: { type: String, maxlength: 500 }
  }, { timestamps: true });

  // Removed duplicate code index. Kept functional composite index.
  couponSchema.index({ isActive: 1, startDate: 1, endDate: 1 });

  module.exports = mongoose.model('Coupon', couponSchema);
}
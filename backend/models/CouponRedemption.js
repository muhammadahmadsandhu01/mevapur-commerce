const mongoose = require('mongoose');

const couponRedemptionSchema = new mongoose.Schema({
  coupon: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Coupon',
    required: true,
    index: true
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
    index: true
  },
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    default: null,
    index: true
  },
  checkoutKey: {
    type: String,
    required: true,
    maxlength: 128
  },
  status: {
    type: String,
    enum: ['reserved', 'committed', 'released'],
    default: 'reserved',
    required: true,
    index: true
  },
  discountSnapshot: {
    code: { type: String, trim: true, uppercase: true },
    type: { type: String, enum: ['percentage', 'fixed', 'freeshipping'] },
    value: { type: Number, min: 0 },
    discountAmount: { type: Number, min: 0, default: 0 },
    freeShipping: { type: Boolean, default: false }
  },
  expiresAt: {
    type: Date,
    required: true,
    index: true
  },
  committedAt: {
    type: Date,
    default: null
  },
  releasedAt: {
    type: Date,
    default: null
  },
  releaseReason: {
    type: String,
    maxlength: 200,
    default: '',
    trim: true
  }
}, {
  timestamps: true
});

// Exactly-once reservation per checkout idempotency key
couponRedemptionSchema.index(
  { coupon: 1, checkoutKey: 1 },
  { unique: true, name: 'unique_coupon_checkout_key' }
);

// Exactly-once commitment per order (when orderId is set)
couponRedemptionSchema.index(
  { coupon: 1, orderId: 1 },
  {
    unique: true,
    partialFilterExpression: { orderId: { $type: 'objectId' } },
    name: 'unique_coupon_order_commit'
  }
);

// Per-customer and status querying
couponRedemptionSchema.index({ coupon: 1, user: 1, status: 1 });
couponRedemptionSchema.index({ status: 1, expiresAt: 1 });

module.exports = mongoose.model('CouponRedemption', couponRedemptionSchema);

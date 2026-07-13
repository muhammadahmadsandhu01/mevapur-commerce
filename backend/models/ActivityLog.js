const mongoose = require('mongoose');

const activityLogSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  action: {
    type: String,
    required: true,
    enum: [
      'LOGIN',
      'LOGOUT',
      'PRODUCT_CREATE',
      'PRODUCT_UPDATE',
      'PRODUCT_DELETE',
      'ORDER_STATUS_UPDATE',
      'ORDER_CANCEL',
      'CUSTOMER_BLOCK',
      'CUSTOMER_UNBLOCK',
      'CATEGORY_CREATE',
      'CATEGORY_UPDATE',
      'CATEGORY_DELETE',
      'BRAND_CREATE',
      'BRAND_UPDATE',
      'BRAND_DELETE',
      'REVIEW_APPROVE',
      'REVIEW_REJECT',
      'REVIEW_DELETE',
      'COUPON_CREATE',
      'COUPON_UPDATE',
      'COUPON_DELETE',
      'SETTINGS_UPDATE',
      'USER_CREATE',
      'USER_UPDATE',
      'USER_DELETE',
      'EXPORT_DATA'
    ]
  },
  description: {
    type: String,
    required: true
  },
  details: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  ipAddress: {
    type: String
  },
  userAgent: {
    type: String
  },
  browser: {
    type: String
  },
  os: {
    type: String
  }
}, {
  timestamps: true
});

// Index for faster queries
activityLogSchema.index({ user: 1, createdAt: -1 });
activityLogSchema.index({ action: 1, createdAt: -1 });
activityLogSchema.index({ createdAt: -1 });

// Auto-delete logs older than 90 days
activityLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

module.exports = mongoose.model('ActivityLog', activityLogSchema);
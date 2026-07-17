const mongoose = require('mongoose');

const activityLogSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false // False taake system-generated actions (cron jobs) bhi log ho saken
  },
  action: {
    type: String,
    required: true,
    index: true
  },
  description: {
    type: String,
    required: true
  },
  details: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  resourceType: {
    type: String, // e.g., 'Product', 'Order', 'User', 'Setting'
    index: true
  },
  resourceId: {
    type: mongoose.Schema.Types.ObjectId // The specific ID of the affected resource
  },
  ipAddress: {
    type: String,
    index: true
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

// Indexes for lightning-fast filtering
activityLogSchema.index({ user: 1, createdAt: -1 });
activityLogSchema.index({ action: 1, createdAt: -1 });
activityLogSchema.index({ resourceType: 1, resourceId: 1 });
activityLogSchema.index({ createdAt: -1 });

// 🌟 ENTERPRISE FEATURE: Auto-delete logs older than 90 days (TTL Index)
// Note: MongoDB runs TTL cleanup every 60 seconds, so it's approximate.
activityLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

module.exports = mongoose.model('ActivityLog', activityLogSchema);
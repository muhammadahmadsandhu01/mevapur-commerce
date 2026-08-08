const mongoose = require('mongoose');
const sessionSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  
  // Hashed Refresh Token (Never store plain text)
  refreshTokenHash: {
    type: String,
    required: true,
    match: /^[a-f0-9]{64}$/,
    select: false
  },

  tokenFamilyId: {
    type: String,
    required: true,
    index: true
  },

  // Device Info
  deviceInfo: {
    deviceId: String,
    browser: String,
    os: String,
    deviceName: String,
    fingerprint: String
  },

  // Location & Network
  ipAddress: String,
  userAgent: String,
  country: String,
  city: String,

  // Status
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },
  isRevoked: {
    type: Boolean,
    default: false,
    index: true
  },
  revokedReason: String,
  revokedAt: Date,

  // Timestamps
  lastActive: {
    type: Date,
    default: Date.now
  },
  lastRotatedAt: {
    type: Date,
    default: null
  },
  expiresAt: {
    type: Date,
    required: true,
    index: { expireAfterSeconds: 0 } // TTL Index for auto-cleanup
  }
}, {
  timestamps: true
});

// Index for finding active sessions per user
sessionSchema.index({ user: 1, isActive: 1, isRevoked: 1 });
sessionSchema.index({ user: 1, tokenFamilyId: 1 });

module.exports = mongoose.model('Session', sessionSchema);

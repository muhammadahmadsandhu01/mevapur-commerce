const mongoose = require('mongoose');
const crypto = require('crypto');

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
    select: false
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
  expiresAt: {
    type: Date,
    required: true,
    index: { expireAfterSeconds: 0 } // TTL Index for auto-cleanup
  }
}, {
  timestamps: true
});

// Index for finding active sessions per user
sessionSchema.index({ user: 1, isActive: 1 });

// Helper to hash token before saving
sessionSchema.pre('save', function(next) {
  if (this.isModified('refreshTokenHash')) {
    // Already hashed by service, just ensure it's set
  }
  next();
});

// Method to verify token
sessionSchema.methods.verifyToken = async function(token) {
  const crypto = require('crypto');
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  return hash === this.refreshTokenHash;
};

module.exports = mongoose.model('Session', sessionSchema);
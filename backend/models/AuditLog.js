const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  eventId: {
    type: String,
    required: true,
    index: true
  },
  requestId: {
    type: String,
    required: true,
    index: true
  },
  sessionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Session',
    index: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true
  },
  eventName: {
    type: String,
    required: true,
    enum: [
      'AUTH.LOGIN.SUCCESS',
      'AUTH.LOGIN.FAILED',
      'AUTH.LOGOUT',
      'AUTH.REGISTER',
      'AUTH.PASSWORD.RESET.REQUEST',
      'AUTH.PASSWORD.RESET.COMPLETE',
      'AUTH.EMAIL.VERIFICATION.REQUEST',
      'AUTH.EMAIL.VERIFIED',
      'AUTH.SESSION.CREATED',
      'AUTH.SESSION.REVOKED',
      'AUTH.SESSION.REFRESHED',
      'AUTH.2FA.ENABLED',
      'AUTH.2FA.DISABLED',
      'AUTH.ACCOUNT.LOCKED',
      'AUTH.ACCOUNT.UNBLOCKED',
      'ORDER.CREATED',
      'ORDER.UPDATED',
      'ORDER.CANCELLED',
      'PAYMENT.INITIATED',
      'PAYMENT.COMPLETED',
      'PAYMENT.FAILED',
      'PAYMENT.REFUNDED',
      'ROLE.ASSIGNED',
      'ROLE.REMOVED',
      'PERMISSION.CHANGED',
      'USER.BLOCKED',
      'USER.UNBLOCKED',
      'SECURITY.SUSPICIOUS_ACTIVITY'
    ],
    index: true
  },
  status: {
    type: String,
    enum: ['SUCCESS', 'FAILURE', 'WARNING'],
    required: true,
    index: true
  },
  ipAddress: {
    type: String,
    required: true
  },
  userAgent: {
    type: String,
    required: true
  },
  country: {
    type: String,
    default: 'Unknown'
  },
  city: {
    type: String,
    default: 'Unknown'
  },
  deviceInfo: {
    browser: String,
    os: String,
    device: String
  },
  metadata: {
    type: Object,
    default: {}
  },
  before: {
    type: Object,
    default: null
  },
  after: {
    type: Object,
    default: null
  },
  errorMessage: {
    type: String,
    default: null
  },
  errorCode: {
    type: String,
    default: null
  }
}, {
  timestamps: true
});

// Prevent any updates - audit logs are immutable
auditLogSchema.pre('save', function(next) {
  if (!this.isNew) {
    const error = new Error('Audit logs cannot be updated or modified');
    error.code = 'AUDIT_LOG_IMMUTABLE';
    return next(error);
  }
  next();
});

auditLogSchema.methods.update = function() {
  throw new Error('Audit logs cannot be updated');
};

auditLogSchema.methods.delete = function() {
  throw new Error('Audit logs cannot be deleted');
};

// Indexes for fast querying
auditLogSchema.index({ userId: 1, createdAt: -1 });
auditLogSchema.index({ eventName: 1, createdAt: -1 });
auditLogSchema.index({ status: 1, createdAt: -1 });
auditLogSchema.index({ requestId: 1 });

// TTL index for auto-expiry after 2 years (adjust as per compliance needs)
// auditLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 63072000 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
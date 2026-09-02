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
      'AUTH.SESSION.REVOKED_ALL',
      'AUTH.SESSION.REFRESHED',
      'AUTH.TOKEN.REUSE_DETECTED',
      'AUTH.PASSWORD.CHANGED',
      'AUTH.RATE_LIMIT_EXCEEDED',
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
      'USER.BLOCKED',
      'USER.UNBLOCKED',
      'CUSTOMER.PROFILE_UPDATED',
      'CUSTOMER.BLOCKED',
      'CUSTOMER.UNBLOCKED',
      'CUSTOMER.EXPORTED',
      'INVENTORY.STOCK_ADJUSTED',
      'INVENTORY.EXPORTED',
      'SECURITY.SUSPICIOUS_ACTIVITY',
      'REVIEW.SUBMITTED',
      'REVIEW.EDITED',
      'REVIEW.WITHDRAWN',
      'REVIEW.APPROVED',
      'REVIEW.REJECTED',
      'REVIEW.FLAGGED',
      'REVIEW.REPORTED',
      'REVIEW.REPORT_RESOLVED',
      'REVIEW.REPLIED',
      'REVIEW.EXCEPTIONAL_ERASED',
      'COUPON.CREATED',
      'COUPON.UPDATED',
      'COUPON.DISABLED',
      'COUPON.ARCHIVED',
      'COUPON.DRAFT_DELETED',
      'ACTIVITY.EXPORTED',
      'AUTH.MFA.SETUP.INITIATED',
      'AUTH.MFA.ENROLLED',
      'AUTH.MFA.CHALLENGE_ISSUED',
      'AUTH.MFA.VERIFY.SUCCESS',
      'AUTH.MFA.VERIFY.FAILED',
      'AUTH.MFA.CONFIRM.FAILED',
      'AUTH.MFA.DISABLED',
      'AUTH.MFA.RECOVERY_CODES_REGENERATED',
      'STAFF.INVITATION.CREATED',
      'STAFF.INVITATION.ACCEPTED',
      'STAFF.INVITATION.RESENT',
      'STAFF.INVITATION.REVOKED'
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

[
  'updateOne',
  'updateMany',
  'findOneAndUpdate',
  'deleteOne',
  'deleteMany',
  'findOneAndDelete'
].forEach((operation) => {
  auditLogSchema.pre(operation, function(next) {
    const error = new Error('Audit logs are append-only');
    error.code = 'AUDIT_LOG_IMMUTABLE';
    next(error);
  });
});

// Indexes for fast querying
auditLogSchema.index({ userId: 1, createdAt: -1 });
auditLogSchema.index({ eventName: 1, createdAt: -1 });
auditLogSchema.index({ status: 1, createdAt: -1 });

// TTL index for auto-expiry after 2 years (adjust as per compliance needs)
// auditLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 63072000 });

module.exports = mongoose.model('AuditLog', auditLogSchema);

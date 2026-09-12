const mongoose = require('mongoose');
const {
  WEBHOOK_PROCESSING_STATUSES
} = require('../constants/paymentConstants');

const normalizedEventDataSchema = new mongoose.Schema({
  providerEventId: { type: String, default: '', maxlength: 255 },
  eventType: { type: String, default: '', maxlength: 255 },
  providerPaymentId: { type: String, default: '', maxlength: 255 },
  providerRefundId: { type: String, default: '', maxlength: 255 },
  amountMinor: { type: Number, default: 0 },
  currency: { type: String, default: '', maxlength: 3, uppercase: true, trim: true },
  livemode: { type: Boolean, default: false },
  environment: { type: String, enum: ['sandbox', 'production'], default: 'sandbox' },
  eventCreatedAt: { type: Date, default: null },
  normalizedObjectType: { type: String, default: '', maxlength: 64 },
  proposedStatus: { type: String, default: '', maxlength: 64 },
  rawObjectStatus: { type: String, default: '', maxlength: 64 },
  metadata: {
    paymentId: { type: String, default: '', maxlength: 128 },
    orderId: { type: String, default: '', maxlength: 128 },
    refundId: { type: String, default: '', maxlength: 128 }
  }
}, {
  _id: false,
  strict: 'throw'
});

const paymentWebhookEventSchema = new mongoose.Schema({
  provider: {
    type: String,
    required: true,
    trim: true,
    lowercase: true,
    minlength: 2,
    maxlength: 64,
    match: /^[a-z0-9_]+$/
  },
  accountAlias: {
    type: String,
    trim: true,
    default: 'default',
    maxlength: 100
  },
  environment: {
    type: String,
    enum: ['sandbox', 'production'],
    default: 'sandbox',
    required: true
  },
  providerEventId: {
    type: String,
    required: true,
    maxlength: 255
  },
  eventType: {
    type: String,
    required: true,
    maxlength: 255
  },
  providerPaymentId: {
    type: String,
    default: '',
    maxlength: 255
  },
  providerRefundId: {
    type: String,
    default: '',
    maxlength: 255
  },
  providerCreatedAt: {
    type: Date,
    default: null
  },
  livemode: {
    type: Boolean,
    default: false
  },
  normalizedObjectType: {
    type: String,
    default: '',
    maxlength: 64
  },
  amountMinor: {
    type: Number,
    default: 0
  },
  currency: {
    type: String,
    default: '',
    uppercase: true,
    trim: true,
    maxlength: 3
  },
  payloadHash: {
    type: String,
    required: true,
    select: false,
    maxlength: 128
  },
  eventData: {
    type: normalizedEventDataSchema,
    default: () => ({})
  },
  status: {
    type: String,
    enum: Object.values(WEBHOOK_PROCESSING_STATUSES),
    default: WEBHOOK_PROCESSING_STATUSES.RECEIVED,
    required: true,
    index: true
  },
  attemptCount: {
    type: Number,
    default: 0,
    min: 0
  },
  nextAttemptAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  leaseId: {
    type: String,
    default: '',
    select: false,
    maxlength: 128
  },
  leaseAcquiredAt: {
    type: Date,
    default: null
  },
  leaseExpiresAt: {
    type: Date,
    default: null,
    index: true
  },
  processedAt: {
    type: Date,
    default: null
  },
  deadLetteredAt: {
    type: Date,
    default: null
  },
  errorCode: {
    type: String,
    default: '',
    maxlength: 100
  },
  errorMessage: {
    type: String,
    default: '',
    maxlength: 500
  },
  requestId: {
    type: String,
    default: '',
    maxlength: 128
  },
  receivedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  strict: 'throw',
  toJSON: {
    transform: (_document, value) => {
      delete value.payloadHash;
      delete value.leaseId;
      delete value.errorMessage;
      return value;
    }
  }
});

paymentWebhookEventSchema.index(
  { provider: 1, providerEventId: 1 },
  { unique: true, name: 'unique_provider_webhook_event' }
);

paymentWebhookEventSchema.index(
  { provider: 1, environment: 1, accountAlias: 1, providerEventId: 1 },
  { unique: true, name: 'unique_provider_webhook_event_scope' }
);

paymentWebhookEventSchema.index(
  { status: 1, nextAttemptAt: 1 },
  { name: 'idx_webhook_worker_schedule' }
);

paymentWebhookEventSchema.index(
  { status: 1, leaseExpiresAt: 1 },
  { name: 'idx_webhook_lease_expiry' }
);

module.exports = mongoose.models.PaymentWebhookEvent
  || mongoose.model('PaymentWebhookEvent', paymentWebhookEventSchema);

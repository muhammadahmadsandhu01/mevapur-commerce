const mongoose = require('mongoose');
const {
  WEBHOOK_PROCESSING_STATUSES
} = require('../constants/paymentConstants');

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
  providerEventId: {
    type: String,
    required: true,
    maxlength: 255
  },
  eventType: { type: String, required: true, maxlength: 255 },
  payloadHash: { type: String, required: true, select: false, maxlength: 128 },
  status: {
    type: String,
    enum: Object.values(WEBHOOK_PROCESSING_STATUSES),
    default: WEBHOOK_PROCESSING_STATUSES.RECEIVED,
    required: true,
    index: true
  },
  attemptCount: { type: Number, default: 0, min: 0 },
  processingClaim: { type: String, default: '', select: false, maxlength: 128 },
  processingStartedAt: { type: Date, default: null },
  processedAt: { type: Date, default: null },
  errorCode: { type: String, default: '', maxlength: 100 }
}, {
  timestamps: true,
  toJSON: {
    transform: (_document, value) => {
      delete value.payloadHash;
      delete value.processingClaim;
      return value;
    }
  }
});

paymentWebhookEventSchema.index(
  { provider: 1, providerEventId: 1 },
  { unique: true, name: 'unique_provider_webhook_event' }
);

module.exports = mongoose.models.PaymentWebhookEvent
  || mongoose.model('PaymentWebhookEvent', paymentWebhookEventSchema);

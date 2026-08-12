const crypto = require('crypto');
const mongoose = require('mongoose');
const {
  REFUND_STATUSES,
  PROVIDER_ATTEMPT_STATUSES,
  SUPPORTED_PAYMENT_CURRENCIES
} = require('../constants/paymentConstants');

const generateRefundNumber = () => (
  `REF-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${crypto.randomBytes(5).toString('hex').toUpperCase()}`
);

const refundHistorySchema = new mongoose.Schema({
  status: {
    type: String,
    enum: Object.values(REFUND_STATUSES),
    required: true
  },
  source: {
    type: String,
    enum: ['admin', 'provider', 'system'],
    required: true
  },
  providerEventId: { type: String, default: '', maxlength: 255 },
  errorCode: { type: String, default: '', maxlength: 100 },
  timestamp: { type: Date, default: Date.now, required: true }
}, { _id: false });

const refundSchema = new mongoose.Schema({
  refundNumber: {
    type: String,
    unique: true,
    required: true,
    immutable: true,
    default: generateRefundNumber
  },
  payment: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Payment',
    required: true,
    index: true
  },
  order: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    required: true,
    index: true
  },
  customer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  provider: {
    type: String,
    required: true,
    trim: true,
    lowercase: true,
    minlength: 2,
    maxlength: 64,
    match: /^[a-z0-9_]+$/
  },
  amount: { type: Number, required: true, min: 0.01 },
  currency: {
    type: String,
    required: true,
    default: 'PKR',
    uppercase: true,
    enum: SUPPORTED_PAYMENT_CURRENCIES
  },
  status: {
    type: String,
    enum: Object.values(REFUND_STATUSES),
    default: REFUND_STATUSES.PENDING,
    required: true,
    index: true
  },
  providerRefundId: { type: String, trim: true, maxlength: 255 },
  idempotencyKey: {
    type: String,
    required: true,
    select: false,
    maxlength: 128
  },
  requestHash: {
    type: String,
    required: true,
    select: false,
    immutable: true,
    maxlength: 128
  },
  providerIdempotencyKey: {
    type: String,
    required: true,
    select: false,
    immutable: true,
    maxlength: 255
  },
  providerAttemptStatus: {
    type: String,
    enum: Object.values(PROVIDER_ATTEMPT_STATUSES),
    default: PROVIDER_ATTEMPT_STATUSES.UNCLAIMED,
    required: true,
    select: false
  },
  providerClaimToken: { type: String, default: '', select: false, maxlength: 128 },
  providerClaimedAt: { type: Date, default: null, select: false },
  reservationActive: { type: Boolean, default: false, select: false },
  processingMode: {
    type: String,
    enum: ['provider', 'manual'],
    default: 'provider',
    required: true,
    select: false,
    immutable: true
  },
  providerOutcome: {
    type: String,
    enum: ['unattempted', 'pending', 'succeeded', 'failed', 'canceled', 'unknown', 'manual_confirmed'],
    default: 'unattempted',
    required: true,
    select: false
  },
  processedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  reason: { type: String, default: '', trim: true, maxlength: 200 },
  failureCode: { type: String, default: '', maxlength: 100 },
  completedAt: { type: Date, default: null },
  history: { type: [refundHistorySchema], default: [] },

  // Legacy Return-engine references stay optional for historical documents.
  returnId: { type: mongoose.Schema.Types.ObjectId, ref: 'Return', select: false },
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', select: false },
  method: { type: String, select: false },
  transactionId: { type: String, select: false },
  notes: { type: String, select: false },
  failureReason: { type: String, select: false }
}, {
  timestamps: true,
  toJSON: {
    transform: (_document, value) => {
      delete value.idempotencyKey;
      delete value.requestHash;
      delete value.providerIdempotencyKey;
      delete value.providerAttemptStatus;
      delete value.providerClaimToken;
      delete value.providerClaimedAt;
      delete value.reservationActive;
      delete value.processingMode;
      delete value.providerOutcome;
      delete value.returnId;
      delete value.orderId;
      delete value.method;
      delete value.transactionId;
      delete value.notes;
      delete value.failureReason;
      return value;
    }
  }
});

refundSchema.index(
  { payment: 1, idempotencyKey: 1 },
  {
    unique: true,
    name: 'unique_payment_refund_idempotency',
    partialFilterExpression: {
      payment: { $type: 'objectId' },
      idempotencyKey: { $type: 'string' }
    }
  }
);
refundSchema.index(
  { provider: 1, providerRefundId: 1 },
  {
    unique: true,
    sparse: true,
    name: 'unique_provider_refund_reference'
  }
);
refundSchema.index({ status: 1, createdAt: -1 });
refundSchema.index(
  { returnId: 1 },
  { unique: true, sparse: true, name: 'unique_refund_return' }
);

refundSchema.statics.generateRefundNumber = generateRefundNumber;

module.exports = mongoose.models.Refund || mongoose.model('Refund', refundSchema);

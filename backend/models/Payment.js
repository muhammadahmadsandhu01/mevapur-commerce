const mongoose = require('mongoose');
const { MoneySchema } = require('../modules/commerce');
const {
  PAYMENT_STATUSES,
  PROVIDER_ATTEMPT_STATUSES
} = require('../constants/paymentConstants');

const paymentHistorySchema = new mongoose.Schema({
  previousStatus: {
    type: String,
    enum: Object.values(PAYMENT_STATUSES),
    required: true
  },
  newStatus: {
    type: String,
    enum: Object.values(PAYMENT_STATUSES),
    required: true
  },
  source: {
    type: String,
    enum: ['api', 'customer', 'admin', 'provider', 'refund', 'system'],
    required: true
  },
  providerEventId: { type: String, default: '', maxlength: 255 },
  errorCode: { type: String, default: '', maxlength: 100 },
  timestamp: { type: Date, default: Date.now, required: true }
}, { _id: false });

const paymentSchema = new mongoose.Schema({
  order: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    required: true,
    index: true
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  provider: {
    type: String,
    required: true,
    immutable: true,
    trim: true,
    lowercase: true,
    minlength: 2,
    maxlength: 64,
    match: /^[a-z0-9_]+$/
  },
  // Retained only so historical documents created by the retired contract remain readable.
  gateway: {
    type: String,
    select: false
  },
  providerDisplayName: {
    type: String,
    trim: true,
    maxlength: 100,
    default: ''
  },
  providerIntegrationVersion: {
    type: String,
    trim: true,
    maxlength: 50,
    default: ''
  },
  paymentType: {
    type: String,
    enum: ['offline', 'manual', 'automated', 'historical'],
    default: 'historical'
  },
  capabilitySnapshot: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  customerAction: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  safeProviderReference: {
    type: String,
    trim: true,
    maxlength: 100,
    default: ''
  },
  customerReferenceHash: {
    type: String,
    select: false,
    maxlength: 128
  },
  customerReferenceMasked: {
    type: String,
    default: '',
    maxlength: 32
  },
  customerSubmissionNote: {
    type: String,
    default: '',
    maxlength: 300
  },
  customerSubmittedAt: { type: Date, default: null },
  verifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  verifiedAt: { type: Date, default: null },
  verificationNote: {
    type: String,
    default: '',
    maxlength: 300
  },
  collectedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  collectedAt: { type: Date, default: null },
  providerPaymentId: {
    type: String,
    trim: true,
    maxlength: 255
  },
  // Historical compatibility field. New code writes providerPaymentId.
  paymentIntentId: {
    type: String,
    trim: true,
    maxlength: 255,
    select: false
  },
  status: {
    type: String,
    enum: Object.values(PAYMENT_STATUSES),
    default: PAYMENT_STATUSES.PENDING,
    required: true,
    index: true
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  amountExact: { type: MoneySchema, default: null },
  currency: {
    type: String,
    required: true,
    default: 'PKR',
    trim: true,
    uppercase: true,
    match: /^[A-Z]{3}$/
  },
  paidAmount: { type: Number, default: 0, min: 0 },
  paidAmountExact: { type: MoneySchema, default: null },
  refundedAmount: { type: Number, default: 0, min: 0 },
  refundedAmountExact: { type: MoneySchema, default: null },
  refundReservedAmount: { type: Number, default: 0, min: 0, select: false },
  refundReservedAmountExact: { type: MoneySchema, default: null, select: false },
  authorizedAmount: { type: Number, default: 0, min: 0 },
  authorizedAmountExact: { type: MoneySchema, default: null },
  capturedAmount: { type: Number, default: 0, min: 0 },
  capturedAmountExact: { type: MoneySchema, default: null },
  authorizationExpiresAt: { type: Date, default: null },
  capturedAt: { type: Date, default: null },
  capturedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  cancelledBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  cancelReason: { type: String, default: '', maxlength: 200 },
  captureIdempotencyKey: {
    type: String,
    select: false,
    maxlength: 255
  },
  captureRequestHash: {
    type: String,
    select: false,
    maxlength: 128
  },
  captureAttemptStatus: {
    type: String,
    default: 'unclaimed',
    select: false
  },
  captureClaimToken: { type: String, default: '', select: false, maxlength: 128 },
  captureClaimedAt: { type: Date, default: null, select: false },
  cancelIdempotencyKey: {
    type: String,
    select: false,
    maxlength: 255
  },
  cancelRequestHash: {
    type: String,
    select: false,
    maxlength: 128
  },
  cancelAttemptStatus: {
    type: String,
    default: 'unclaimed',
    select: false
  },
  cancelClaimToken: { type: String, default: '', select: false, maxlength: 128 },
  cancelClaimedAt: { type: Date, default: null, select: false },
  voidIdempotencyKey: {
    type: String,
    select: false,
    maxlength: 255
  },
  voidRequestHash: {
    type: String,
    select: false,
    maxlength: 128
  },
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
  providerAttemptCount: { type: Number, default: 0, min: 0, select: false },
  failureCode: { type: String, default: '', maxlength: 100 },
  completedAt: { type: Date, default: null },
  failedAt: { type: Date, default: null },
  cancelledAt: { type: Date, default: null },
  history: { type: [paymentHistorySchema], default: [] }
}, {
  timestamps: true,
  toJSON: {
    transform: (_document, value) => {
      delete value.idempotencyKey;
      delete value.requestHash;
      delete value.providerIdempotencyKey;
      delete value.captureIdempotencyKey;
      delete value.captureRequestHash;
      delete value.captureAttemptStatus;
      delete value.captureClaimToken;
      delete value.captureClaimedAt;
      delete value.cancelIdempotencyKey;
      delete value.cancelRequestHash;
      delete value.cancelAttemptStatus;
      delete value.cancelClaimToken;
      delete value.cancelClaimedAt;
      delete value.voidIdempotencyKey;
      delete value.voidRequestHash;
      delete value.providerAttemptStatus;
      delete value.providerClaimToken;
      delete value.providerClaimedAt;
      delete value.providerAttemptCount;
      delete value.refundReservedAmount;
      delete value.gateway;
      delete value.paymentIntentId;
      return value;
    }
  }
});

paymentSchema.index(
  { user: 1, idempotencyKey: 1 },
  { unique: true, name: 'unique_user_payment_idempotency' }
);
paymentSchema.index(
  { provider: 1, providerPaymentId: 1 },
  {
    unique: true,
    sparse: true,
    name: 'unique_provider_payment_reference'
  }
);
paymentSchema.index({ order: 1, createdAt: -1 });
paymentSchema.index(
  { customerReferenceHash: 1 },
  {
    unique: true,
    sparse: true,
    name: 'unique_manual_customer_reference'
  }
);

module.exports = mongoose.models.Payment || mongoose.model('Payment', paymentSchema);

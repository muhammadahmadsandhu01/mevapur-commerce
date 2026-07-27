const mongoose = require('mongoose');

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
  gateway: {
    type: String,
    enum: ['stripe', 'jazzcash', 'easypaisa', 'paypal'],
    required: true
  },
  transactionId: {
    type: String,
    unique: true,
    sparse: true // Some gateways might not provide this immediately
  },
  paymentIntentId: {
    type: String,
    index: true // Stripe Payment Intent ID
  },
  status: {
    type: String,
    enum: [
      'Pending', 'Processing', 'RequiresAction', 
      'Authorized', 'Captured', 'Completed', 
      'Failed', 'RefundPending', 'Refunded', 'Cancelled'
    ],
    default: 'Pending',
    required: true
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  currency: {
    type: String,
    default: 'PKR',
    uppercase: true
  },
  providerResponse: {
    type: Object,
    default: {} // Store raw response from gateway for debugging
  },
  idempotencyKey: {
    type: String,
    unique: true,
    required: true
  },
  failureReason: {
    type: String,
    default: null
  },
  refundDetails: {
    amount: Number,
    reason: String,
    refundedAt: Date,
    transactionId: String
  },
  auditLogs: [{
    action: String,
    status: String,
    timestamp: { type: Date, default: Date.now },
    metadata: Object
  }],
  expiresAt: {
    type: Date,
    index: { expireAfterSeconds: 1800 } // Auto-cancel after 30 mins if pending
  }
}, {
  timestamps: true
});

// Index for finding payments by order and status
paymentSchema.index({ order: 1, status: 1 });

module.exports = mongoose.model('Payment', paymentSchema);
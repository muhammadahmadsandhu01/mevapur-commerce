/**
 * @file PaymentDispute.js
 * @description Canonical model for payment disputes, chargebacks, and inquiry lifecycle.
 * Manages provider dispute identity, evidence timeline, financial hold correlation, and resolution tracking.
 */

'use strict';

const crypto = require('crypto');
const mongoose = require('mongoose');
const { MoneySchema } = require('../modules/commerce');

const generateDisputeId = () => {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const entropy = crypto.randomBytes(6).toString('hex').toUpperCase();
  return `DISP-${date}-${entropy}`;
};

const DISPUTE_STATUSES = Object.freeze({
  WARNING_NEEDS_RESPONSE: 'warning_needs_response',
  NEEDS_RESPONSE: 'needs_response',
  UNDER_REVIEW: 'under_review',
  WON: 'won',
  LOST: 'lost',
  CHARGE_REFUNDED: 'charge_refunded'
});

const DISPUTE_REASONS = Object.freeze({
  FRAUDULENT: 'fraudulent',
  UNRECOGNIZED: 'unrecognized',
  DUPLICATE: 'duplicate',
  SUBSCRIPTION_CANCELED: 'subscription_canceled',
  PRODUCT_NOT_RECEIVED: 'product_not_received',
  PRODUCT_UNACCEPTABLE: 'product_unacceptable',
  CREDIT_NOT_PROCESSED: 'credit_not_processed',
  GENERAL: 'general',
  OTHER: 'other'
});

const disputeHistorySchema = new mongoose.Schema({
  status: {
    type: String,
    enum: Object.values(DISPUTE_STATUSES),
    required: true
  },
  source: {
    type: String,
    enum: ['provider', 'admin', 'system'],
    required: true
  },
  providerEventId: { type: String, default: '', maxlength: 255 },
  note: { type: String, default: '', maxlength: 500 },
  timestamp: { type: Date, default: Date.now, required: true }
}, { _id: false });

const disputeEvidenceSchema = new mongoose.Schema({
  submittedAt: { type: Date, default: null },
  submittedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  trackingNumber: { type: String, default: '', maxlength: 100 },
  customerCommunication: { type: String, default: '', maxlength: 2000 },
  refundPolicyDisclosure: { type: String, default: '', maxlength: 2000 },
  notes: { type: String, default: '', maxlength: 2000 },
  documents: { type: [{ type: String, maxlength: 500 }], default: [] }
}, { _id: false });

const paymentDisputeSchema = new mongoose.Schema({
  disputeId: {
    type: String,
    default: generateDisputeId,
    unique: true,
    required: true,
    immutable: true
  },
  providerDisputeId: {
    type: String,
    required: true,
    trim: true,
    maxlength: 255
  },
  payment: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Payment',
    required: true
  },
  order: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    required: true
  },
  customer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  provider: {
    type: String,
    required: true,
    trim: true,
    lowercase: true,
    maxlength: 64
  },
  amount: {
    type: Number,
    required: true,
    min: 0.01
  },
  amountExact: {
    type: MoneySchema,
    required: true
  },
  currency: {
    type: String,
    required: true,
    uppercase: true,
    match: /^[A-Z]{3}$/
  },
  fee: {
    type: Number,
    default: 0,
    min: 0
  },
  feeExact: {
    type: MoneySchema,
    default: null
  },
  status: {
    type: String,
    enum: Object.values(DISPUTE_STATUSES),
    default: DISPUTE_STATUSES.NEEDS_RESPONSE,
    required: true
  },
  reason: {
    type: String,
    enum: Object.values(DISPUTE_REASONS),
    default: DISPUTE_REASONS.GENERAL
  },
  evidenceDueBy: {
    type: Date,
    default: null
  },
  evidence: {
    type: disputeEvidenceSchema,
    default: () => ({})
  },
  history: {
    type: [disputeHistorySchema],
    default: []
  },
  isResolved: {
    type: Boolean,
    default: false
  },
  resolvedAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

paymentDisputeSchema.index(
  { provider: 1, providerDisputeId: 1 },
  { unique: true, name: 'unique_provider_dispute_reference' }
);
paymentDisputeSchema.index({ payment: 1, status: 1 }, { name: 'idx_dispute_payment_status' });
paymentDisputeSchema.index({ order: 1 }, { name: 'idx_dispute_order' });
paymentDisputeSchema.index({ customer: 1, createdAt: -1 }, { name: 'idx_dispute_customer' });

paymentDisputeSchema.statics.DISPUTE_STATUSES = DISPUTE_STATUSES;
paymentDisputeSchema.statics.DISPUTE_REASONS = DISPUTE_REASONS;

module.exports = mongoose.models.PaymentDispute || mongoose.model('PaymentDispute', paymentDisputeSchema);

/**
 * @file CustomerOperationException.js
 * @description Customer & Admin Operation Exception Domain Model for Phase 8.
 * Captures failed payments, dead-lettered webhooks, shipping exceptions,
 * return action requests, refund failures, and notification failures with
 * deduplicated convergence, optimistic locking, and audit trails.
 */

'use strict';

const mongoose = require('mongoose');

const customerOperationExceptionSchema = new mongoose.Schema({
  exceptionNumber: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    maxlength: 128
  },
  dedupKey: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    maxlength: 255
  },
  type: {
    type: String,
    required: true,
    enum: [
      'PAYMENT_FAILED',
      'PAYMENT_REQUIRES_ACTION',
      'WEBHOOK_PROCESSING_FAILED',
      'WEBHOOK_DEAD_LETTERED',
      'SHIPMENT_DELAYED',
      'SHIPMENT_EXCEPTION',
      'RETURN_ACTION_REQUIRED',
      'REFUND_FAILED',
      'REFUND_STALLED',
      'NOTIFICATION_DELIVERY_FAILED',
      'DOCUMENT_GENERATION_FAILED'
    ],
    index: true
  },
  domainType: {
    type: String,
    required: true,
    enum: ['payment', 'order', 'shipment', 'return', 'refund', 'webhook', 'notification', 'document', 'system']
  },
  domainId: {
    type: String,
    required: true,
    trim: true,
    maxlength: 128
  },
  customer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
    index: true
  },
  order: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    default: null,
    index: true
  },
  payment: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Payment',
    default: null
  },
  shipment: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Shipment',
    default: null
  },
  returnRequest: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Return',
    default: null
  },
  refund: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Refund',
    default: null
  },
  webhookEvent: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PaymentWebhookEvent',
    default: null
  },
  transactionalMessage: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TransactionalMessage',
    default: null
  },
  severity: {
    type: String,
    enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
    default: 'MEDIUM',
    index: true
  },
  status: {
    type: String,
    enum: [
      'OPEN',
      'ACKNOWLEDGED',
      'IN_PROGRESS',
      'RETRY_SCHEDULED',
      'ESCALATED',
      'RESOLVED',
      'DISMISSED_AS_DUPLICATE'
    ],
    default: 'OPEN',
    required: true,
    index: true
  },
  errorCode: {
    type: String,
    default: '',
    maxlength: 100
  },
  sanitizedSummary: {
    type: String,
    required: true,
    maxlength: 500
  },
  safeDetails: {
    type: mongoose.Schema.Types.Mixed,
    default: () => ({})
  },
  customerRecoveryGuidance: {
    type: String,
    default: '',
    maxlength: 500
  },
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  assignedAt: {
    type: Date,
    default: null
  },
  acknowledgedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  acknowledgedAt: {
    type: Date,
    default: null
  },
  resolvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  resolvedAt: {
    type: Date,
    default: null
  },
  resolutionReason: {
    type: String,
    default: '',
    maxlength: 1000
  },
  resolutionCode: {
    type: String,
    default: '',
    maxlength: 64
  },
  escalatedTo: {
    type: String,
    default: '',
    maxlength: 128
  },
  escalatedAt: {
    type: Date,
    default: null
  },
  retryEligible: {
    type: Boolean,
    default: false
  },
  attemptCount: {
    type: Number,
    default: 0,
    min: 0
  },
  maxAttempts: {
    type: Number,
    default: 3
  },
  nextRetryAt: {
    type: Date,
    default: null,
    index: true
  },
  lastRetriedAt: {
    type: Date,
    default: null
  },
  slaDueAt: {
    type: Date,
    default: null,
    index: true
  },
  version: {
    type: Number,
    default: 1
  }
}, {
  timestamps: true,
  strict: 'throw'
});

customerOperationExceptionSchema.index(
  { exceptionNumber: 1 },
  { unique: true, name: 'unique_exception_number' }
);

customerOperationExceptionSchema.index(
  { dedupKey: 1 },
  { unique: true, name: 'unique_exception_dedup_key' }
);

customerOperationExceptionSchema.index(
  { status: 1, severity: 1, createdAt: -1 },
  { name: 'idx_exception_status_severity' }
);

customerOperationExceptionSchema.index(
  { type: 1, status: 1 },
  { name: 'idx_exception_type_status' }
);

customerOperationExceptionSchema.index(
  { customer: 1, createdAt: -1 },
  { name: 'idx_customer_exceptions' }
);

customerOperationExceptionSchema.index(
  { order: 1 },
  { name: 'idx_order_exceptions' }
);

module.exports = mongoose.models.CustomerOperationException
  || mongoose.model('CustomerOperationException', customerOperationExceptionSchema);

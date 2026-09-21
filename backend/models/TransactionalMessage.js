/**
 * @file TransactionalMessage.js
 * @description Durable Outbox / Transactional Messaging Model for Phase 8.
 * Provides deduplication keys, atomic lease claiming, bounded retry backoff,
 * terminal dead-lettering, and delivery audit.
 */

'use strict';

const mongoose = require('mongoose');

const transactionalMessageSchema = new mongoose.Schema({
  dedupKey: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    maxlength: 255
  },
  domainType: {
    type: String,
    required: true,
    enum: ['order', 'payment', 'shipment', 'return', 'refund', 'dispute', 'system', 'auth'],
    index: true
  },
  domainId: {
    type: String,
    required: true,
    trim: true,
    maxlength: 128
  },
  channel: {
    type: String,
    required: true,
    enum: ['EMAIL', 'SMS', 'IN_APP', 'WHATSAPP'],
    default: 'EMAIL'
  },
  templateId: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  templateVersion: {
    type: String,
    required: true,
    default: '1.0',
    maxlength: 32
  },
  recipient: {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      default: ''
    },
    phone: {
      type: String,
      trim: true,
      default: ''
    },
    name: {
      type: String,
      trim: true,
      default: ''
    }
  },
  locale: {
    type: String,
    default: 'en-US',
    maxlength: 16
  },
  status: {
    type: String,
    enum: ['PENDING', 'PROCESSING', 'DELIVERED', 'FAILED', 'DEAD_LETTERED'],
    default: 'PENDING',
    required: true,
    index: true
  },
  priority: {
    type: String,
    enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'],
    default: 'MEDIUM'
  },
  payload: {
    type: mongoose.Schema.Types.Mixed,
    default: () => ({})
  },
  renderedSubject: {
    type: String,
    default: '',
    maxlength: 500
  },
  renderedBody: {
    type: String,
    default: ''
  },
  renderedText: {
    type: String,
    default: ''
  },
  attemptCount: {
    type: Number,
    default: 0,
    min: 0
  },
  maxAttempts: {
    type: Number,
    default: 5
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
  provider: {
    type: String,
    default: 'internal',
    maxlength: 64
  },
  providerMessageId: {
    type: String,
    default: '',
    maxlength: 255
  },
  providerStatus: {
    type: String,
    default: '',
    maxlength: 64
  },
  lastErrorCode: {
    type: String,
    default: '',
    maxlength: 100
  },
  lastErrorMessage: {
    type: String,
    default: '',
    maxlength: 500
  },
  deliveredAt: {
    type: Date,
    default: null
  },
  deadLetteredAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true,
  strict: 'throw',
  toJSON: {
    transform: (_doc, ret) => {
      delete ret.leaseId;
      return ret;
    }
  }
});

transactionalMessageSchema.index(
  { dedupKey: 1 },
  { unique: true, name: 'unique_transactional_message_dedup' }
);

transactionalMessageSchema.index(
  { status: 1, nextAttemptAt: 1 },
  { name: 'idx_outbox_worker_schedule' }
);

transactionalMessageSchema.index(
  { status: 1, leaseExpiresAt: 1 },
  { name: 'idx_outbox_lease_expiry' }
);

transactionalMessageSchema.index(
  { domainType: 1, domainId: 1 },
  { name: 'idx_outbox_domain_ref' }
);

module.exports = mongoose.models.TransactionalMessage
  || mongoose.model('TransactionalMessage', transactionalMessageSchema);

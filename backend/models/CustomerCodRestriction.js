/**
 * @file CustomerCodRestriction.js
 * @description Customer COD Restriction and Policy State Model.
 * Tracks manual blocks, rolling 30-day locks, and authorized administrative overrides.
 * All active states are time-derived dynamically without relying on stale booleans.
 */

'use strict';

const mongoose = require('mongoose');

const customerCodRestrictionSchema = new mongoose.Schema(
  {
    merchantScopeId: {
      type: String,
      required: true,
      trim: true,
      default: 'default',
      maxlength: 100,
      index: true
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    manualBlockActive: {
      type: Boolean,
      default: false,
      index: true
    },
    manualBlockReasonCode: {
      type: String,
      default: null,
      trim: true,
      maxlength: 100
    },
    manualBlockedAt: {
      type: Date,
      default: null
    },
    manualBlockedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    temporaryLockUntil: {
      type: Date,
      default: null,
      index: true
    },
    temporaryLockReasonCode: {
      type: String,
      default: null,
      trim: true,
      maxlength: 100
    },
    automaticLockSource: {
      type: String,
      default: null,
      trim: true,
      maxlength: 100
    },
    overrideMode: {
      type: String,
      enum: ['NONE', 'UNTIL', 'INDEFINITE'],
      default: 'NONE',
      required: true
    },
    overrideUntil: {
      type: Date,
      default: null
    },
    overrideReasonCode: {
      type: String,
      default: null,
      trim: true,
      maxlength: 100
    },
    overrideActor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    overrideCreatedAt: {
      type: Date,
      default: null
    },
    lockVersion: {
      type: Number,
      default: 1,
      min: 1,
      required: true
    }
  },
  {
    timestamps: true
  }
);

// Compound Unique Index: One restriction state per customer per merchant scope
customerCodRestrictionSchema.index(
  { merchantScopeId: 1, customerId: 1 },
  { unique: true, name: 'merchantScopeId_1_customerId_1_unique' }
);

/**
 * Derives whether customer currently has an active temporary lock.
 * @param {Date} [atDate=new Date()]
 * @returns {boolean}
 */
customerCodRestrictionSchema.methods.isTemporaryLockActive = function isTemporaryLockActive(atDate = new Date()) {
  if (!this.temporaryLockUntil) return false;
  return new Date(this.temporaryLockUntil).getTime() > new Date(atDate).getTime();
};

/**
 * Derives whether an administrative override is currently active.
 * @param {Date} [atDate=new Date()]
 * @returns {boolean}
 */
customerCodRestrictionSchema.methods.isOverrideActive = function isOverrideActive(atDate = new Date()) {
  if (this.overrideMode === 'INDEFINITE') return true;
  if (this.overrideMode === 'UNTIL') {
    if (!this.overrideUntil) return false;
    return new Date(this.overrideUntil).getTime() > new Date(atDate).getTime();
  }
  return false;
};

/**
 * Computes the effective COD restriction status for the customer.
 * @param {Date} [atDate=new Date()]
 * @returns {{ restricted: boolean, reasonCode: string|null, overrideActive: boolean }}
 */
customerCodRestrictionSchema.methods.evaluateStatus = function evaluateStatus(atDate = new Date()) {
  const hasOverride = this.isOverrideActive(atDate);
  if (hasOverride) {
    return { restricted: false, reasonCode: null, overrideActive: true };
  }

  if (this.manualBlockActive) {
    return {
      restricted: true,
      reasonCode: this.manualBlockReasonCode || 'COD_CUSTOMER_BLOCKED',
      overrideActive: false
    };
  }

  if (this.isTemporaryLockActive(atDate)) {
    return {
      restricted: true,
      reasonCode: this.temporaryLockReasonCode || 'COD_CUSTOMER_TEMPORARILY_LOCKED',
      overrideActive: false
    };
  }

  return { restricted: false, reasonCode: null, overrideActive: false };
};

module.exports = mongoose.models.CustomerCodRestriction
  || mongoose.model('CustomerCodRestriction', customerCodRestrictionSchema);

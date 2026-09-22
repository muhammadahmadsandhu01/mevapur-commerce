/**
 * @file CodServiceabilityRule.js
 * @description Merchant-Scoped Domestic COD Serviceability Rule Model.
 * Governs Pakistan postal code and city COD availability.
 * Specific postal/zone rules take precedence over city-wide rules.
 */

'use strict';

const mongoose = require('mongoose');

const codServiceabilityRuleSchema = new mongoose.Schema(
  {
    merchantScopeId: {
      type: String,
      required: true,
      trim: true,
      default: 'default',
      maxlength: 100,
      index: true
    },
    countryCode: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      default: 'PK',
      match: /^[A-Z]{2}$/,
      index: true
    },
    normalizedCity: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      maxlength: 100,
      index: true
    },
    normalizedPostalCode: {
      type: String,
      trim: true,
      default: '',
      maxlength: 20,
      index: true
    },
    zoneKey: {
      type: String,
      trim: true,
      uppercase: true,
      default: '',
      maxlength: 50
    },
    isServiceable: {
      type: Boolean,
      default: true,
      required: true
    },
    status: {
      type: String,
      enum: ['active', 'inactive'],
      default: 'active',
      required: true,
      index: true
    },
    effectiveFrom: {
      type: Date,
      default: Date.now,
      required: true
    },
    effectiveTo: {
      type: Date,
      default: null
    },
    notes: {
      type: String,
      trim: true,
      maxlength: 500,
      default: ''
    },
    lockVersion: {
      type: Number,
      default: 1,
      min: 1,
      required: true
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    }
  },
  {
    timestamps: true
  }
);

// Compound Index 1: Postal code specificity within merchant scope and country
codServiceabilityRuleSchema.index(
  { merchantScopeId: 1, countryCode: 1, normalizedPostalCode: 1, status: 1 },
  { name: 'merchantScopeId_1_countryCode_1_normalizedPostalCode_1_status_1' }
);

// Compound Index 2: City specificity within merchant scope and country
codServiceabilityRuleSchema.index(
  { merchantScopeId: 1, countryCode: 1, normalizedCity: 1, status: 1 },
  { name: 'merchantScopeId_1_countryCode_1_normalizedCity_1_status_1' }
);

// Normalization Pre-validate Hook
codServiceabilityRuleSchema.pre('validate', function normalizeFields(next) {
  if (this.countryCode) {
    this.countryCode = String(this.countryCode).trim().toUpperCase();
  }
  if (this.normalizedCity) {
    this.normalizedCity = String(this.normalizedCity).trim().toUpperCase();
  }
  if (this.normalizedPostalCode != null) {
    this.normalizedPostalCode = String(this.normalizedPostalCode).trim();
  }
  if (this.zoneKey != null) {
    this.zoneKey = String(this.zoneKey).trim().toUpperCase();
  }
  next();
});

/**
 * Checks whether this rule is currently effective at the provided timestamp.
 * @param {Date} [atDate=new Date()]
 * @returns {boolean}
 */
codServiceabilityRuleSchema.methods.isCurrentlyEffective = function isCurrentlyEffective(atDate = new Date()) {
  if (this.status !== 'active') return false;
  const time = new Date(atDate).getTime();
  const from = new Date(this.effectiveFrom).getTime();
  const to = this.effectiveTo ? new Date(this.effectiveTo).getTime() : Infinity;
  return time >= from && time <= to;
};

module.exports = mongoose.models.CodServiceabilityRule
  || mongoose.model('CodServiceabilityRule', codServiceabilityRuleSchema);

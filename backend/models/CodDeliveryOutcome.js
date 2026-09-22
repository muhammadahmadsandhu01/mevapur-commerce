/**
 * @file CodDeliveryOutcome.js
 * @description Append-Only Immutable COD Delivery Outcome Event Record.
 * Captures verified courier delivery outcomes for rolling COD risk evaluation.
 * Qualifying status is server-derived from canonical outcome codes.
 */

'use strict';

const mongoose = require('mongoose');

const QUALIFYING_COD_OUTCOMES = Object.freeze([
  'COD_REFUSED_BY_CUSTOMER',
  'COD_RETURN_TO_ORIGIN'
]);

const NON_QUALIFYING_COD_OUTCOMES = Object.freeze([
  'COURIER_DAMAGE',
  'SELLER_CANCELLATION',
  'INVENTORY_CANCELLATION',
  'PREPAID_PAYMENT_FAILURE',
  'CUSTOMER_RETURN_AFTER_DELIVERY',
  'DELIVERY_SUCCESSFUL'
]);

const ALL_COD_OUTCOMES = Object.freeze([
  ...QUALIFYING_COD_OUTCOMES,
  ...NON_QUALIFYING_COD_OUTCOMES
]);

const codDeliveryOutcomeMetadataSchema = new mongoose.Schema(
  {
    courierName: { type: String, trim: true, maxlength: 100, default: null },
    trackingNumber: { type: String, trim: true, maxlength: 100, default: null },
    refusalReason: { type: String, trim: true, maxlength: 200, default: null },
    rtoReason: { type: String, trim: true, maxlength: 200, default: null },
    notes: { type: String, trim: true, maxlength: 500, default: null }
  },
  { _id: false }
);

const codDeliveryOutcomeSchema = new mongoose.Schema(
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
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      required: true,
      index: true
    },
    publicOrderId: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100
    },
    eventId: {
      type: String,
      required: true,
      trim: true,
      maxlength: 128
    },
    outcomeCode: {
      type: String,
      enum: ALL_COD_OUTCOMES,
      required: true
    },
    occurredAt: {
      type: Date,
      required: true
    },
    recordedAt: {
      type: Date,
      default: Date.now,
      required: true
    },
    recordedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    metadata: {
      type: codDeliveryOutcomeMetadataSchema,
      default: () => ({})
    }
  },
  {
    timestamps: true
  }
);

// Compound Unique Index: merchantScopeId + eventId
codDeliveryOutcomeSchema.index(
  { merchantScopeId: 1, eventId: 1 },
  { unique: true, name: 'merchantScopeId_1_eventId_1_unique' }
);

// Rolling Window Query Index: customerId + outcomeCode + occurredAt
codDeliveryOutcomeSchema.index(
  { merchantScopeId: 1, customerId: 1, outcomeCode: 1, occurredAt: -1 },
  { name: 'merchantScopeId_1_customerId_1_outcomeCode_1_occurredAt_minus1' }
);

/**
 * Checks if a given outcome code is a qualifying risk event.
 * @param {string} code
 * @returns {boolean}
 */
codDeliveryOutcomeSchema.statics.isQualifyingOutcome = function isQualifyingOutcome(code) {
  return QUALIFYING_COD_OUTCOMES.includes(code);
};

codDeliveryOutcomeSchema.statics.QUALIFYING_COD_OUTCOMES = QUALIFYING_COD_OUTCOMES;
codDeliveryOutcomeSchema.statics.NON_QUALIFYING_COD_OUTCOMES = NON_QUALIFYING_COD_OUTCOMES;
codDeliveryOutcomeSchema.statics.ALL_COD_OUTCOMES = ALL_COD_OUTCOMES;

module.exports = mongoose.models.CodDeliveryOutcome
  || mongoose.model('CodDeliveryOutcome', codDeliveryOutcomeSchema);

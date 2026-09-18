/**
 * @file InventoryHold.js
 * @description Dedicated pre-order stock hold lease model for Phase 6D-5A.
 * Tracks temporary expiring inventory holds during checkout sessions, completely decoupled
 * from permanent InventoryReservation records to protect historical order data.
 */

'use strict';

const mongoose = require('mongoose');

const holdAllocationItemSchema = new mongoose.Schema({
  locationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'FulfillmentLocation',
    required: true
  },
  locationCode: {
    type: String,
    required: true,
    trim: true,
    uppercase: true,
    maxlength: 50
  },
  originCountry: {
    type: String,
    required: true,
    trim: true,
    uppercase: true,
    maxlength: 2
  },
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  variantId: {
    type: mongoose.Schema.Types.ObjectId,
    default: null
  },
  canonicalSku: {
    type: String,
    required: true,
    trim: true,
    uppercase: true,
    maxlength: 100
  },
  quantity: {
    type: Number,
    required: true,
    min: [1, 'Allocation quantity must be at least 1'],
    validate: {
      validator: Number.isInteger,
      message: 'Quantity must be an integer'
    }
  },
  physicalReservedQuantity: {
    type: Number,
    required: true,
    default: 0,
    min: 0,
    validate: {
      validator: Number.isInteger,
      message: 'physicalReservedQuantity must be a non-negative integer'
    }
  },
  backorderedQuantity: {
    type: Number,
    required: true,
    default: 0,
    min: 0,
    validate: {
      validator: Number.isInteger,
      message: 'backorderedQuantity must be a non-negative integer'
    }
  },
  inventoryPositionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'InventoryPosition',
    required: true
  },
  inventoryLockVersion: {
    type: Number,
    required: true,
    default: 1
  },
  fulfillmentMode: {
    type: String,
    enum: ['local', 'cross_border', 'hybrid'],
    default: 'local'
  },
  shipmentGroup: {
    type: String,
    default: 'group_1',
    maxlength: 50
  }
}, { _id: false });

const HOLD_STATUSES = Object.freeze({
  ACTIVE: 'active',
  CAPTURE_COMMITTED: 'capture_committed',
  CONVERTED: 'converted',
  RELEASING: 'releasing',
  RELEASED: 'released',
  EXPIRED: 'expired',
  CONFLICT: 'conflict'
});

const inventoryHoldSchema = new mongoose.Schema({
  merchantScopeId: {
    type: String,
    required: true,
    trim: true,
    default: 'default',
    maxlength: 100
  },
  sessionId: {
    type: String,
    required: [true, 'Session identifier is required'],
    trim: true,
    maxlength: 128
  },
  holdKey: {
    type: String,
    required: [true, 'Hold key is required'],
    trim: true,
    maxlength: 128
  },
  status: {
    type: String,
    enum: Object.values(HOLD_STATUSES),
    default: HOLD_STATUSES.ACTIVE,
    required: true
  },
  expiresAt: {
    type: Date,
    required: true
  },
  renewalCount: {
    type: Number,
    default: 0,
    min: 0,
    max: 2
  },
  maxLifetimeExpiresAt: {
    type: Date,
    required: true
  },
  convertedAt: {
    type: Date,
    default: null
  },
  releasedAt: {
    type: Date,
    default: null
  },
  convertedOrderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    default: null
  },
  releaseReason: {
    type: String,
    default: null,
    trim: true,
    maxlength: 300
  },
  allocations: {
    type: [holdAllocationItemSchema],
    required: true,
    validate: {
      validator: (val) => Array.isArray(val) && val.length > 0,
      message: 'Hold must contain at least one allocation line item'
    }
  },
  lockVersion: {
    type: Number,
    default: 1,
    min: 1
  }
}, {
  timestamps: true,
  versionKey: false
});

inventoryHoldSchema.statics.STATUSES = HOLD_STATUSES;

inventoryHoldSchema.index(
  { holdKey: 1 },
  { unique: true, name: 'unique_inventory_hold_key' }
);

inventoryHoldSchema.index(
  { merchantScopeId: 1, sessionId: 1 },
  { unique: true, name: 'unique_tenant_session_hold' }
);

inventoryHoldSchema.index(
  { status: 1, expiresAt: 1 },
  { name: 'hold_expiry_reconciliation_idx' }
);

inventoryHoldSchema.index(
  { merchantScopeId: 1, createdAt: -1 },
  { name: 'tenant_hold_history_idx' }
);

module.exports = mongoose.models.InventoryHold || mongoose.model('InventoryHold', inventoryHoldSchema);

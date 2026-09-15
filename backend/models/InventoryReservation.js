/**
 * @file InventoryReservation.js
 * @description Durable inventory reservation state machine for Phase 6D-2.
 * Manages reservation lifecycle: pending -> confirmed -> consumed / released / expired / cancelled.
 * Tracks line-item origin location snapshots, locks, and provides atomic transition guards.
 */

const mongoose = require('mongoose');

const allocationItemSchema = new mongoose.Schema({
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

const RESERVATION_STATUSES = Object.freeze({
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  RELEASED: 'released',
  EXPIRED: 'expired',
  CONSUMED: 'consumed',
  CANCELLED: 'cancelled'
});

const inventoryReservationSchema = new mongoose.Schema({
  merchantScopeId: {
    type: String,
    required: true,
    trim: true,
    default: 'default',
    maxlength: 100
  },
  reservationKey: {
    type: String,
    required: [true, 'Reservation key is required'],
    trim: true,
    maxlength: 128
  },
  orderId: {
    type: String,
    required: [true, 'Order identifier is required'],
    trim: true,
    maxlength: 100
  },
  orderObjectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    default: null
  },
  checkoutAttempt: {
    type: String,
    default: null,
    trim: true,
    maxlength: 128
  },
  status: {
    type: String,
    enum: Object.values(RESERVATION_STATUSES),
    default: RESERVATION_STATUSES.PENDING,
    required: true
  },
  expiresAt: {
    type: Date,
    required: true,
    default: () => new Date(Date.now() + 30 * 60 * 1000) // 30 minutes default
  },
  confirmedAt: {
    type: Date,
    default: null
  },
  releasedAt: {
    type: Date,
    default: null
  },
  consumedAt: {
    type: Date,
    default: null
  },
  cancelledAt: {
    type: Date,
    default: null
  },
  releaseReason: {
    type: String,
    default: null,
    trim: true,
    maxlength: 300
  },
  allocations: {
    type: [allocationItemSchema],
    required: true,
    validate: {
      validator: (val) => Array.isArray(val) && val.length > 0,
      message: 'Reservation must contain at least one allocation line item'
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

inventoryReservationSchema.statics.STATUSES = RESERVATION_STATUSES;

// Unique index on reservationKey
inventoryReservationSchema.index(
  { reservationKey: 1 },
  { unique: true, name: 'unique_reservation_key' }
);

// Unique index on tenant scope + orderId
inventoryReservationSchema.index(
  { merchantScopeId: 1, orderId: 1 },
  { unique: true, name: 'unique_tenant_order_reservation' }
);

// Index for expiry reconciliation worker
inventoryReservationSchema.index(
  { status: 1, expiresAt: 1 },
  { name: 'reservation_expiry_reconciliation_idx' }
);

inventoryReservationSchema.index(
  { merchantScopeId: 1, createdAt: -1 },
  { name: 'tenant_reservation_history_idx' }
);

module.exports = mongoose.models.InventoryReservation || mongoose.model('InventoryReservation', inventoryReservationSchema);

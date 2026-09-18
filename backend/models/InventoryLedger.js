/**
 * @file InventoryLedger.js
 * @description Immutable append-only inventory ledger for Phase 6D-2.
 * Records every physical or reservation stock movement inside the same transaction
 * with before/after state snapshots, reason codes, actor attribution, and unique idempotency protection.
 */

const mongoose = require('mongoose');

const snapshotSchema = new mongoose.Schema({
  onHand: { type: Number, required: true },
  reserved: { type: Number, required: true },
  unavailable: { type: Number, required: true },
  safetyStock: { type: Number, required: true },
  atp: { type: Number, required: true }
}, { _id: false });

const MOVEMENT_TYPES = Object.freeze([
  'OPENING_BALANCE',
  'ADMIN_ADJUSTMENT',
  'RESERVATION_CREATED',
  'RESERVATION_RELEASED',
  'RESERVATION_EXPIRED',
  'HOLD_CREATED',
  'HOLD_RELEASED',
  'HOLD_EXPIRED',
  'SHIPMENT_CONSUMED',
  'ORDER_CANCELLED_RELEASE',
  'PAYMENT_FAILED_RELEASE',
  'RETURN_RECEIVED',
  'RETURN_RESTOCKED',
  'RETURN_QUARANTINED',
  'DAMAGE',
  'LOSS',
  'TRANSFER_OUT',
  'TRANSFER_IN',
  'RECONCILIATION'
]);

const inventoryLedgerSchema = new mongoose.Schema({
  merchantScopeId: {
    type: String,
    required: true,
    trim: true,
    default: 'default',
    maxlength: 100
  },
  locationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'FulfillmentLocation',
    default: null
  },
  locationCode: {
    type: String,
    default: '',
    trim: true,
    uppercase: true,
    maxlength: 50
  },
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: [true, 'Product ID is required']
  },
  variantId: {
    type: mongoose.Schema.Types.ObjectId,
    default: null
  },
  canonicalSku: {
    type: String,
    required: [true, 'Canonical SKU is required'],
    trim: true,
    uppercase: true,
    maxlength: 100
  },
  movementType: {
    type: String,
    enum: MOVEMENT_TYPES,
    required: [true, 'Movement type is required']
  },
  quantityDelta: {
    type: Number,
    required: true,
    default: 0,
    validate: {
      validator: Number.isInteger,
      message: 'quantityDelta must be an integer'
    }
  },
  reservationDelta: {
    type: Number,
    required: true,
    default: 0,
    validate: {
      validator: Number.isInteger,
      message: 'reservationDelta must be an integer'
    }
  },
  beforeSnapshot: {
    type: snapshotSchema,
    required: true
  },
  afterSnapshot: {
    type: snapshotSchema,
    required: true
  },
  reasonCode: {
    type: String,
    required: [true, 'Reason code is required'],
    trim: true,
    maxlength: 200
  },
  sourceType: {
    type: String,
    enum: ['order', 'reservation', 'adjustment', 'return', 'reconciliation', 'migration', 'transfer', 'checkout_session'],
    required: true
  },
  sourceId: {
    type: String,
    default: '',
    trim: true,
    maxlength: 100
  },
  orderId: {
    type: String,
    default: null,
    trim: true,
    maxlength: 100
  },
  reservationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'InventoryReservation',
    default: null
  },
  idempotencyKey: {
    type: String,
    required: [true, 'Idempotency key is required'],
    trim: true,
    maxlength: 200
  },
  actorType: {
    type: String,
    enum: ['user', 'admin', 'system', 'webhook'],
    default: 'system'
  },
  actorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  correlationId: {
    type: String,
    default: '',
    trim: true,
    maxlength: 100
  }
}, {
  timestamps: { createdAt: true, updatedAt: false },
  versionKey: false
});

inventoryLedgerSchema.statics.MOVEMENT_TYPES = MOVEMENT_TYPES;

// Unique Idempotency Key Index
inventoryLedgerSchema.index(
  { idempotencyKey: 1 },
  {
    unique: true,
    partialFilterExpression: { idempotencyKey: { $type: 'string', $gt: '' } },
    name: 'unique_inventory_ledger_idempotency'
  }
);

inventoryLedgerSchema.index(
  { merchantScopeId: 1, productId: 1, createdAt: -1 },
  { name: 'tenant_product_ledger_idx' }
);

inventoryLedgerSchema.index(
  { merchantScopeId: 1, locationId: 1, createdAt: -1 },
  { name: 'tenant_location_ledger_idx' }
);

inventoryLedgerSchema.index(
  { merchantScopeId: 1, orderId: 1 },
  { name: 'tenant_order_ledger_idx' }
);

inventoryLedgerSchema.index(
  { merchantScopeId: 1, movementType: 1, createdAt: -1 },
  { name: 'tenant_movement_type_idx' }
);

module.exports = mongoose.models.InventoryLedger || mongoose.model('InventoryLedger', inventoryLedgerSchema);

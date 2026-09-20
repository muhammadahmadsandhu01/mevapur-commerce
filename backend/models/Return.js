const crypto = require('crypto');
const mongoose = require('mongoose');
const { MoneySchema } = require('../modules/commerce');

const generateReturnNumber = () => {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const entropy = crypto.randomBytes(10).toString('hex').toUpperCase();
  return `RET-${date}-${entropy}`;
};

const {
  returnPolicySnapshotSchema,
  returnRoutingSnapshotSchema
} = require('./schemas/commerceSnapshotSchemas');

const returnRefundAllocationSnapshotSchema = new mongoose.Schema({
  merchandiseRefundExact: { type: MoneySchema, default: null },
  taxRefundExact: { type: MoneySchema, default: null },
  dutyRefundExact: { type: MoneySchema, default: null },
  shippingRefundExact: { type: MoneySchema, default: null },
  totalRefundExact: { type: MoneySchema, default: null },
  taxRefundPolicy: {
    type: String,
    enum: ['REFUNDABLE', 'NON_REFUNDABLE', 'PROPORTIONAL', 'MANUAL_REVIEW', null],
    default: null
  },
  dutyRefundPolicy: {
    type: String,
    enum: ['REFUNDABLE', 'NON_REFUNDABLE', 'MANUAL_REVIEW', null],
    default: null
  },
  taxTreatment: {
    type: String,
    enum: ['INCLUSIVE', 'EXCLUSIVE', null],
    default: null
  },
  incoterm: {
    type: String,
    enum: ['DDP', 'DAP', 'DOMESTIC', null],
    default: null
  },
  allocationVersion: { type: String, default: '6D-4C' },
  calculatedAt: { type: Date, default: Date.now }
}, { _id: false });

const returnSchema = new mongoose.Schema({
  returnNumber: {
    type: String,
    unique: true,
    required: true,
    immutable: true,
    default: generateReturnNumber
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
  items: [{
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true
    },
    variantId: { type: mongoose.Schema.Types.ObjectId, default: null },
    isDefaultVariant: { type: Boolean, default: false },
    orderLineKey: { type: String, default: '', maxlength: 100 },
    name: String,
    quantity: { type: Number, required: true, min: 1, validate: Number.isInteger },
    price: { type: Number, required: true, min: 0 },
    priceExact: { type: MoneySchema, default: null },
    refundAmount: { type: Number, min: 0, default: 0 },
    refundAmountExact: { type: MoneySchema, default: null },
    merchandiseRefundExact: { type: MoneySchema, default: null },
    taxRefundExact: { type: MoneySchema, default: null },
    dutyRefundExact: { type: MoneySchema, default: null },
    includedTaxExact: { type: MoneySchema, default: null },
    reason: {
      type: String,
      enum: ['damaged', 'wrong_item', 'not_as_described', 'not_satisfied', 'duplicate', 'other'],
      required: true
    },
    reasonDetails: String,
    images: [String],
    condition: {
      type: String,
      enum: ['new', 'used', 'damaged'],
      default: 'new'
    }
  }],
  status: {
    type: String,
    enum: [
      'pending',
      'approved',
      'received',
      'inspected',
      'inventory_reconciliation',
      'refunded',
      'rejected',
      'cancelled'
    ],
    default: 'pending'
  },
  refundMethod: {
    type: String,
    enum: ['original_payment', 'store_credit', 'bank_transfer'],
    default: 'original_payment'
  },
  refundAmount: {
    type: Number,
    default: 0
  },
  refundAmountExact: { type: MoneySchema, default: null },
  merchandiseRefundExact: { type: MoneySchema, default: null },
  taxRefundExact: { type: MoneySchema, default: null },
  dutyRefundExact: { type: MoneySchema, default: null },
  shippingRefundExact: { type: MoneySchema, default: null },
  refundAllocationSnapshot: { type: returnRefundAllocationSnapshotSchema, default: null },
  returnPolicySnapshot: { type: returnPolicySnapshotSchema, default: null },
  returnRoutingSnapshot: { type: returnRoutingSnapshotSchema, default: null },
  routingStatus: {
    type: String,
    enum: [
      'PENDING',
      'LABEL_GENERATED',
      'IN_TRANSIT',
      'RECEIVED_AT_HUB',
      'RECEIVED_AT_ORIGIN',
      'DISPOSED',
      'KEPT_BY_CUSTOMER'
    ],
    default: 'PENDING'
  },
  isRto: { type: Boolean, default: false },
  rtoReason: { type: String, default: null, trim: true, maxlength: 200 },
  shippingCost: {
    type: Number,
    default: 0
  },
  shippingCostExact: { type: MoneySchema, default: null },
  returnShippingLabel: String,
  trackingNumber: String,
  courierCompany: String,
  adminNotes: [{
    note: String,
    addedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    addedAt: {
      type: Date,
      default: Date.now
    }
  }],
  customerNotes: String,
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  approvedAt: Date,
  receivedAt: Date,
  refundedAt: Date,
  refund: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Refund',
    default: null,
    select: false
  },
  inventoryRestockedAt: { type: Date, default: null, select: false },
  rejectedReason: String
}, {
  timestamps: true
});

returnSchema.index({ status: 1, createdAt: -1 });
returnSchema.index({ customer: 1, createdAt: -1 });
returnSchema.index({ order: 1 });
returnSchema.index(
  { refund: 1 },
  {
    unique: true,
    name: 'unique_return_refund',
    partialFilterExpression: { refund: { $type: 'objectId' } }
  }
);

module.exports = mongoose.model('Return', returnSchema);

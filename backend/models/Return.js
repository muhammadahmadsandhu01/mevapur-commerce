const crypto = require('crypto');
const mongoose = require('mongoose');

const generateReturnNumber = () => {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const entropy = crypto.randomBytes(10).toString('hex').toUpperCase();
  return `RET-${date}-${entropy}`;
};

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
    refundAmount: { type: Number, min: 0, default: 0 },
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
  shippingCost: {
    type: Number,
    default: 0
  },
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

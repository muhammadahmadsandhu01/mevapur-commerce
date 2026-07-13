const mongoose = require('mongoose');

const returnSchema = new mongoose.Schema({
  returnNumber: {
    type: String,
    unique: true
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
      ref: 'Product'
    },
    name: String,
    quantity: Number,
    price: Number,
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
    enum: ['pending', 'approved', 'received', 'inspected', 'refunded', 'rejected', 'cancelled'],
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
  rejectedReason: String
}, {
  timestamps: true
});

// Auto-generate return number
returnSchema.pre('save', async function(next) {
  if (!this.returnNumber) {
    const count = await mongoose.model('Return').countDocuments();
    this.returnNumber = `RET-${String(count + 1).padStart(6, '0')}`;
  }
  next();
});

returnSchema.index({ status: 1, createdAt: -1 });
returnSchema.index({ customer: 1, createdAt: -1 });
returnSchema.index({ order: 1 });

module.exports = mongoose.model('Return', returnSchema);
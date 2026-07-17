const mongoose = require('mongoose');

const refundSchema = new mongoose.Schema({
  refundNumber: {
    type: String,
    unique: true,
    required: true
  },
  returnId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Return',
    required: true
  },
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    required: true
  },
  customer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  currency: {
    type: String,
    default: 'PKR'
  },
  method: {
    type: String,
    enum: ['original_payment', 'store_credit', 'bank_transfer', 'cash'],
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed', 'cancelled'],
    default: 'pending'
  },
  transactionId: {
    type: String,
    default: '',
    trim: true // Payment gateway ka reference ID
  },
  processedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User' // Admin jisne refund process kiya
  },
  notes: {
    type: String,
    default: ''
  },
  failureReason: {
    type: String,
    default: ''
  }
}, {
  timestamps: true
});

// Auto-generate refund number (e.g., REF-000001)
refundSchema.pre('save', async function(next) {
  if (!this.refundNumber) {
    const count = await mongoose.model('Refund').countDocuments();
    this.refundNumber = `REF-${String(count + 1).padStart(6, '0')}`;
  }
  next();
});

// Indexes for lightning-fast querying
refundSchema.index({ status: 1, createdAt: -1 });
refundSchema.index({ customer: 1, createdAt: -1 });
refundSchema.index({ returnId: 1 });
refundSchema.index({ orderId: 1 });

module.exports = mongoose.model('Refund', refundSchema);
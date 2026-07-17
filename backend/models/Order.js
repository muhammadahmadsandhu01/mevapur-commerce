const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  orderId: {
    type: String,
    unique: true,
    required: true
  },
  user: {
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
    name: { type: String, required: true },
    price: { type: Number, required: true },
    quantity: { type: Number, required: true },
    image: { type: String, default: '' },
    variant: { type: String, default: '' }, // 🌟 ADDED: For variant support
    sku: { type: String, default: '' }      // 🌟 ADDED: For variant support
  }],
  shippingAddress: {
    fullName: { type: String, required: true },
    phone: { type: String, required: true },
    address: { type: String, required: true },
    city: { type: String, required: true },
    province: { type: String, default: '' }, // 🌟 ADDED
    postalCode: { type: String, default: '' },
    country: { type: String, default: 'Pakistan' } // 🌟 ADDED
  },
  paymentMethod: {
    type: String,
    required: true,
    enum: ['COD', 'jazzcash', 'visa', 'mastercard', 'Card', 'Bank Transfer']
  },
  paymentStatus: {
    type: String,
    enum: ['Pending', 'Paid', 'Failed', 'Refunded'],
    default: 'Pending'
  },
  orderStatus: {
    type: String,
    enum: ['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled'],
    default: 'Pending'
  },
  subtotal: { type: Number, required: true },
  shippingCost: { type: Number, default: 0 },
  discount: { type: Number, default: 0 },
  totalAmount: { type: Number, required: true },
  
  notes: { type: String, default: '' }, // 🌟 ADDED: Customer checkout notes
  
  adminNotes: [{
    note: String,
    addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    addedAt: { type: Date, default: Date.now }
  }],
  statusTimeline: [{
    status: String,
    timestamp: Date,
    note: String
  }],
  trackingNumber: { type: String, default: '' },
  courierCompany: { type: String, default: '' },
  deliveredAt: Date,
  cancelledAt: Date,
  cancelReason: String
}, {
  timestamps: true
});

// 🌟 SAFE ORDER ID GENERATION (Prevents race conditions)
orderSchema.pre('save', async function(next) {
  if (!this.orderId) {
    const randomStr = Math.random().toString(36).substring(2, 8).toUpperCase();
    this.orderId = `ORD-${Date.now().toString().slice(-4)}${randomStr}`;
  }
  next();
});

module.exports = mongoose.model('Order', orderSchema);
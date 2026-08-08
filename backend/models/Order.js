const crypto = require('crypto');
const mongoose = require('mongoose');
const {
  PAYMENT_METHODS,
  SUPPORTED_ORDER_PAYMENT_METHODS,
  ORDER_STATUSES
} = require('../constants/orderConstants');

const generateOrderId = () => {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const entropy = crypto.randomBytes(6).toString('hex').toUpperCase();
  return `ORD-${date}-${entropy}`;
};

const orderItemSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  variantId: {
    type: mongoose.Schema.Types.ObjectId,
    default: null
  },
  isDefaultVariant: {
    type: Boolean,
    default: false
  },
  name: { type: String, required: true, trim: true, maxlength: 200 },
  sku: { type: String, default: '', trim: true, maxlength: 100 },
  variant: { type: String, default: '', trim: true, maxlength: 200 },
  price: { type: Number, required: true, min: 0 },
  quantity: {
    type: Number,
    required: true,
    min: 1,
    validate: Number.isInteger
  },
  lineTotal: { type: Number, required: true, min: 0 },
  image: { type: String, default: '', maxlength: 1000 }
}, { _id: false });

const statusHistorySchema = new mongoose.Schema({
  status: {
    type: String,
    enum: Object.values(ORDER_STATUSES),
    required: true
  },
  actor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  actorRole: {
    type: String,
    enum: ['customer', 'admin', 'super_admin', 'system'],
    required: true
  },
  timestamp: { type: Date, default: Date.now, required: true },
  note: { type: String, default: '', maxlength: 500 }
}, { _id: false });

const orderSchema = new mongoose.Schema({
  orderId: {
    type: String,
    default: generateOrderId,
    unique: true,
    required: true,
    immutable: true
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  idempotencyKey: {
    type: String,
    required: true,
    select: false,
    maxlength: 128
  },
  requestHash: {
    type: String,
    required: true,
    select: false,
    immutable: true
  },
  items: {
    type: [orderItemSchema],
    required: true,
    validate: {
      validator: (items) => Array.isArray(items) && items.length > 0,
      message: 'Order must contain at least one item'
    }
  },
  shippingAddress: {
    fullName: { type: String, required: true, trim: true, maxlength: 100 },
    phone: { type: String, required: true, trim: true, maxlength: 20 },
    address: { type: String, required: true, trim: true, maxlength: 300 },
    addressLine2: { type: String, default: '', trim: true, maxlength: 200 },
    city: { type: String, required: true, trim: true, maxlength: 100 },
    province: { type: String, required: true, trim: true, maxlength: 100 },
    postalCode: { type: String, default: '', trim: true, maxlength: 20 },
    country: {
      type: String,
      default: 'Pakistan',
      trim: true,
      minlength: 2,
      maxlength: 100
    }
  },
  paymentMethod: {
    type: String,
    required: true,
    enum: SUPPORTED_ORDER_PAYMENT_METHODS
  },
  paymentStatus: {
    type: String,
    enum: ['Pending', 'Paid', 'Failed', 'PartiallyRefunded', 'Refunded'],
    default: 'Pending'
  },
  payment: {
    provider: {
      type: String,
      default: 'Cash on Delivery',
      trim: true,
      maxlength: 100
    },
    transactionId: { type: String, default: '' },
    paymentIntentId: { type: String, default: '' },
    clientSecret: { type: String, default: '', select: false },
    currency: { type: String, default: 'PKR', trim: true, uppercase: true, match: /^[A-Z]{3}$/ },
    paidAt: { type: Date, default: null },
    gatewayResponse: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
      select: false
    }
  },
  coupon: {
    couponId: { type: mongoose.Schema.Types.ObjectId, ref: 'Coupon' },
    code: { type: String, trim: true, uppercase: true },
    type: { type: String, enum: ['percentage', 'fixed', 'freeshipping'] },
    value: { type: Number, min: 0 },
    discountAmount: { type: Number, min: 0, default: 0 }
  },
  orderStatus: {
    type: String,
    enum: Object.values(ORDER_STATUSES),
    default: ORDER_STATUSES.PENDING
  },
  subtotal: { type: Number, required: true, min: 0 },
  shippingCost: { type: Number, default: 0, min: 0 },
  shippingQuote: {
    zoneId: { type: mongoose.Schema.Types.ObjectId, ref: 'ShippingZone', default: null },
    zoneName: { type: String, default: '', maxlength: 100 },
    deliveryMinDays: { type: Number, default: null },
    deliveryMaxDays: { type: Number, default: null },
    remoteArea: { type: Boolean, default: false }
  },
  taxAmount: { type: Number, default: 0, min: 0 },
  discount: { type: Number, default: 0, min: 0 },
  totalAmount: { type: Number, required: true, min: 0 },
  customerNote: { type: String, default: '', maxlength: 500 },
  adminNotes: [{
    note: { type: String, maxlength: 500 },
    addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    addedAt: { type: Date, default: Date.now }
  }],
  statusTimeline: {
    type: [statusHistorySchema],
    required: true,
    validate: {
      validator: (history) => Array.isArray(history) && history.length > 0,
      message: 'Order status history is required'
    }
  },
  trackingNumber: { type: String, default: '', maxlength: 100 },
  courierCompany: { type: String, default: '', maxlength: 100 },
  deliveredAt: { type: Date, default: null },
  cancelledAt: { type: Date, default: null },
  cancelReason: { type: String, default: '', maxlength: 500 },
  inventoryRestoredAt: { type: Date, default: null },
  couponRestoredAt: { type: Date, default: null }
}, {
  timestamps: true,
  toJSON: {
    transform: (_document, value) => {
      delete value.idempotencyKey;
      delete value.requestHash;
      return value;
    }
  }
});

orderSchema.index(
  { user: 1, idempotencyKey: 1 },
  { unique: true, name: 'unique_user_order_idempotency' }
);
orderSchema.index({ user: 1, createdAt: -1, _id: -1 });
orderSchema.index({ orderStatus: 1, createdAt: -1, _id: -1 });

orderSchema.pre('validate', function ensureOrderId() {
  if (!this.orderId) {
    this.orderId = generateOrderId();
  }
});

orderSchema.statics.generateOrderId = generateOrderId;
orderSchema.statics.paymentMethods = PAYMENT_METHODS;

module.exports = mongoose.models.Order || mongoose.model('Order', orderSchema);

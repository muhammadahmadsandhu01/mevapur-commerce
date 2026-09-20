const crypto = require('crypto');
const mongoose = require('mongoose');
const { MoneySchema } = require('../modules/commerce');
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
  unitPriceExact: { type: MoneySchema, default: null },
  quantity: {
    type: Number,
    required: true,
    min: 1,
    validate: Number.isInteger
  },
  lineTotal: { type: Number, required: true, min: 0 },
  lineTotalExact: { type: MoneySchema, default: null },
  image: { type: String, default: '', maxlength: 1000 },
  offeringId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ProductMarketOffering',
    default: null
  },
  offeringLockVersion: { type: Number, default: null },
  offeringVersion: { type: Number, default: null },
  priceBookEntryId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'MarketPriceBook',
    default: null
  },
  priceBookLockVersion: { type: Number, default: null },
  priceBookVersion: { type: Number, default: null },
  pricingPolicy: {
    type: String,
    enum: ['inherit_product_price', 'variant_override_optional', 'variant_override_required', 'legacy'],
    default: 'legacy'
  },
  pricingPolicyApplied: {
    type: String,
    enum: ['variant_override', 'inherit_product_price', 'product_price', 'legacy_home_fallback'],
    default: 'legacy_home_fallback'
  },
  priceSource: {
    type: String,
    enum: ['manual', 'governed_fx_snapshot', 'legacy'],
    default: 'manual'
  },
  fulfillmentMode: {
    type: String,
    enum: ['local', 'cross_border', 'hybrid'],
    default: 'local'
  },
  fulfillmentLocationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'FulfillmentLocation',
    default: null
  },
  locationCode: { type: String, default: '', trim: true, uppercase: true, maxlength: 50 },
  originCountry: { type: String, default: '', trim: true, uppercase: true, maxlength: 2 },
  shipmentGroup: { type: String, default: 'group_1', trim: true, maxlength: 50 },
  inventoryReservationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'InventoryReservation',
    default: null
  },
  inventoryPositionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'InventoryPosition',
    default: null
  },
  returnLocationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'FulfillmentLocation',
    default: null
  }
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

const {
  deMinimisDecisionSchema,
  taxProvenanceSchema,
  customsItemSnapshotSchema,
  returnPolicySnapshotSchema
} = require('./schemas/commerceSnapshotSchemas');

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
    province: { type: String, default: '', trim: true, maxlength: 100 },
    postalCode: { type: String, default: '', trim: true, maxlength: 20 },
    country: {
      type: String,
      default: 'Pakistan',
      trim: true,
      minlength: 2,
      maxlength: 100
    },
    countryCode: {
      type: String,
      trim: true,
      uppercase: true,
      match: /^[A-Z]{2}$/,
      default: null
    },
    administrativeArea: { type: String, default: '', trim: true, maxlength: 100 },
    phoneE164: { type: String, default: '', trim: true, maxlength: 30 },
    phoneExtension: { type: String, default: '', trim: true, maxlength: 10 }
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
  currency: {
    type: String,
    default: null,
    trim: true,
    uppercase: true,
    match: /^[A-Z]{3}$/
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
    currency: { type: String, default: null, trim: true, uppercase: true, match: /^[A-Z]{3}$/ },
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
  subtotalExact: { type: MoneySchema, default: null },
  shippingCost: { type: Number, default: 0, min: 0 },
  shippingCostExact: { type: MoneySchema, default: null },
  shippingQuote: {
    zoneId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ShippingZone',
      default: null
    },
    ruleId: { type: String, default: null, trim: true, maxlength: 64 },
    serviceLevel: { type: String, default: 'standard', trim: true, maxlength: 50 },
    zoneName: { type: String, default: '', maxlength: 100 },
    deliveryMinDays: { type: Number, default: null },
    deliveryMaxDays: { type: Number, default: null },
    remoteArea: { type: Boolean, default: false },
    deliveryPromise: {
      dispatchDate: { type: String, default: null },
      minDeliveryDate: { type: String, default: null },
      maxDeliveryDate: { type: String, default: null },
      isSameDayDispatch: { type: Boolean, default: false },
      isPastCutoff: { type: Boolean, default: false },
      isRemote: { type: Boolean, default: false },
      promiseText: { type: String, default: null }
    },
    provenance: {
      source: { type: String, default: 'GOVERNED_SHIPPING_TABLE' },
      configVersionId: { type: String, default: null },
      ruleId: { type: String, default: null },
      timestamp: { type: String, default: null }
    },
    shipmentGroups: [{
      groupId: { type: String, default: 'group_1' },
      locationId: { type: mongoose.Schema.Types.ObjectId, ref: 'FulfillmentLocation', default: null },
      locationCode: { type: String, default: '' },
      originCountry: { type: String, default: '' },
      serviceLevel: { type: String, default: 'standard' },
      shippingAmount: { type: Number, default: 0 },
      shippingAmountExact: { type: MoneySchema, default: null },
      deliveryEstimate: {
        minDays: { type: Number, default: null },
        maxDays: { type: Number, default: null }
      },
      deliveryPromise: {
        dispatchDate: { type: String, default: null },
        minDeliveryDate: { type: String, default: null },
        maxDeliveryDate: { type: String, default: null },
        isSameDayDispatch: { type: Boolean, default: false },
        isPastCutoff: { type: Boolean, default: false },
        isRemote: { type: Boolean, default: false },
        promiseText: { type: String, default: null }
      },
      provenance: {
        source: { type: String, default: 'GOVERNED_SHIPPING_TABLE' },
        configVersionId: { type: String, default: null },
        ruleId: { type: String, default: null },
        timestamp: { type: String, default: null }
      },
      items: [{
        productId: { type: String },
        variantId: { type: String, default: null },
        quantity: { type: Number, default: 1 }
      }]
    }]
  },
  quote: {
    quoteId: { type: String, default: null, trim: true, maxlength: 64 },
    kid: { type: String, default: null, trim: true, maxlength: 32 },
    incoterm: { type: String, default: null, trim: true, maxlength: 20 },
    configVersionId: { type: String, default: null, trim: true, maxlength: 64 },
    merchantScopeId: { type: String, default: 'default', trim: true, maxlength: 64 },
    issuedAt: { type: String, default: null },
    expiresAt: { type: String, default: null }
  },
  taxesAndDuties: {
    taxType: { type: String, default: null },
    taxTreatment: { type: String, default: null },
    taxableBasis: { type: String, default: null },
    taxRatePercent: { type: Number, default: 0 },
    taxAmount: { type: Number, default: 0 },
    taxAmountExact: { type: MoneySchema, default: null },
    additionalTaxAmount: { type: Number, default: 0 },
    additionalTaxAmountExact: { type: MoneySchema, default: null },
    taxIncludedAmount: { type: Number, default: 0 },
    taxIncludedAmountExact: { type: MoneySchema, default: null },
    goodsValue: { type: Number, default: 0 },
    goodsValueExact: { type: MoneySchema, default: null },
    customsValue: { type: Number, default: 0 },
    customsValueExact: { type: MoneySchema, default: null },
    cifValue: { type: Number, default: 0 },
    cifValueExact: { type: MoneySchema, default: null },
    customsValueIncludesShipping: { type: Boolean, default: false },
    customsValueIncludesInsurance: { type: Boolean, default: false },
    dutyRatePercent: { type: Number, default: 0 },
    estimatedDutyAmount: { type: Number, default: 0 },
    estimatedDutyExact: { type: MoneySchema, default: null },
    payableDutyAmount: { type: Number, default: 0 },
    payableDutyExact: { type: MoneySchema, default: null },
    dutyDeMinimis: { type: deMinimisDecisionSchema, default: null },
    taxDeMinimis: { type: deMinimisDecisionSchema, default: null },
    incoterm: { type: String, default: null },
    provenance: { type: taxProvenanceSchema, default: null },
    customsItems: { type: [customsItemSnapshotSchema], default: undefined }
  },
  taxAmount: { type: Number, default: 0, min: 0 },
  taxAmountExact: { type: MoneySchema, default: null },
  duties: { type: Number, default: 0, min: 0 },
  dutiesExact: { type: MoneySchema, default: null },
  discount: { type: Number, default: 0, min: 0 },
  discountExact: { type: MoneySchema, default: null },
  totalAmount: { type: Number, required: true, min: 0 },
  totalAmountExact: { type: MoneySchema, default: null },
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
  couponRestoredAt: { type: Date, default: null },
  inventoryReservationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'InventoryReservation',
    default: null
  },
  checkoutSessionObjectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CheckoutSession',
    default: null
  },
  checkoutSessionId: {
    type: String,
    default: null,
    trim: true,
    maxlength: 128
  },
  returnPolicySnapshot: { type: returnPolicySnapshotSchema, default: null },
  isRto: { type: Boolean, default: false },
  rtoReason: { type: String, default: '', maxlength: 500 },
  returnReservationVersion: { type: Number, default: 0, select: false }
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
orderSchema.index(
  { checkoutSessionObjectId: 1 },
  {
    unique: true,
    partialFilterExpression: { checkoutSessionObjectId: { $type: 'objectId' } },
    name: 'unique_order_checkout_session_object_id'
  }
);
orderSchema.index(
  { checkoutSessionId: 1 },
  {
    unique: true,
    partialFilterExpression: { checkoutSessionId: { $type: 'string', $gt: '' } },
    name: 'unique_order_checkout_session_id'
  }
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

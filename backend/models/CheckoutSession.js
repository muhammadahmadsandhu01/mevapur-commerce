/**
 * @file CheckoutSession.js
 * @description Authoritative Checkout Session model for Phase 6D-5A.
 * Implements durable, tenant-isolated two-phase checkout lifecycle for prepaid orders.
 * Encapsulates immutable quote snapshot, exact rational taxes/duties, inventory hold binding,
 * and reconciliation liability states with zero floating-point financial storage.
 */

'use strict';

const mongoose = require('mongoose');
const { MoneySchema } = require('../modules/commerce');
const {
  deMinimisDecisionSchema,
  taxProvenanceSchema,
  customsItemSnapshotSchema,
  shipmentGroupSnapshotSchema,
  quoteBindingSnapshotSchema
} = require('./schemas/commerceSnapshotSchemas');

const CHECKOUT_SESSION_STATUSES = Object.freeze({
  ACTIVE: 'active',
  PAYMENT_PENDING: 'payment_pending',
  PAYMENT_CAPTURED: 'payment_captured',
  CONVERTING: 'converting',
  CONVERTED: 'converted',
  CANCELLATION_REQUESTED: 'cancellation_requested',
  CANCELLED: 'cancelled',
  EXPIRED: 'expired',
  FAILED: 'failed',
  CONFLICT: 'conflict'
});

const sessionItemSchema = new mongoose.Schema({
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
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  quantity: {
    type: Number,
    required: true,
    min: 1,
    validate: {
      validator: Number.isInteger,
      message: 'Quantity must be an integer'
    }
  },
  unitPriceExact: {
    type: MoneySchema,
    required: true
  },
  lineTotalExact: {
    type: MoneySchema,
    required: true
  },
  weightGrams: {
    type: Number,
    required: true,
    min: 1,
    validate: {
      validator: Number.isInteger,
      message: 'weightGrams must be an integer'
    }
  },
  hsCode: {
    type: String,
    default: null,
    trim: true
  },
  countryOfOrigin: {
    type: String,
    default: null,
    trim: true,
    uppercase: true
  },
  fulfillmentLocationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'FulfillmentLocation',
    default: null
  },
  locationCode: {
    type: String,
    default: '',
    trim: true,
    uppercase: true
  },
  originCountry: {
    type: String,
    default: '',
    trim: true,
    uppercase: true
  },
  shipmentGroup: {
    type: String,
    default: 'group_1',
    trim: true
  }
}, { _id: false });

const sessionAddressSchema = new mongoose.Schema({
  fullName: { type: String, required: true, trim: true, maxlength: 100 },
  addressLine1: { type: String, required: true, trim: true, maxlength: 300 },
  addressLine2: { type: String, default: '', trim: true, maxlength: 200 },
  locality: { type: String, required: true, trim: true, maxlength: 100 },
  administrativeArea: { type: String, default: '', trim: true, maxlength: 100 },
  postalCode: { type: String, default: '', trim: true, maxlength: 20 },
  countryCode: { type: String, required: true, uppercase: true, trim: true, minlength: 2, maxlength: 2 },
  phone: { type: String, default: '', trim: true, maxlength: 50 },
  phoneE164: { type: String, default: null, trim: true, maxlength: 30 }
}, { _id: false });

const taxesAndDutiesSnapshotSchema = new mongoose.Schema({
  taxType: { type: String, required: true },
  taxTreatment: { type: String, required: true },
  taxableBasis: { type: String, required: true },
  taxRateNumerator: { type: Number, required: true },
  taxRateDenominator: { type: Number, required: true, default: 10000 },
  dutyRateNumerator: { type: Number, required: true, default: 0 },
  dutyRateDenominator: { type: Number, required: true, default: 10000 },
  taxAmountExact: { type: MoneySchema, required: true },
  additionalTaxAmountExact: { type: MoneySchema, required: true },
  taxIncludedAmountExact: { type: MoneySchema, required: true },
  goodsValueExact: { type: MoneySchema, required: true },
  customsValueExact: { type: MoneySchema, default: null },
  cifValueExact: { type: MoneySchema, default: null },
  estimatedDutyExact: { type: MoneySchema, default: null },
  payableDutyExact: { type: MoneySchema, required: true },
  dutyDeMinimis: { type: deMinimisDecisionSchema, default: null },
  taxDeMinimis: { type: deMinimisDecisionSchema, default: null },
  provenance: { type: taxProvenanceSchema, default: null },
  customsItems: { type: [customsItemSnapshotSchema], default: [] }
}, { _id: false });

const shippingSnapshotSchema = new mongoose.Schema({
  serviceLevel: { type: String, required: true, trim: true, maxlength: 50 },
  zoneName: { type: String, default: '', trim: true, maxlength: 100 },
  deliveryMinDays: { type: Number, default: 2 },
  deliveryMaxDays: { type: Number, default: 5 },
  shippingAmountExact: { type: MoneySchema, required: true },
  shipmentGroups: { type: [shipmentGroupSnapshotSchema], default: [] }
}, { _id: false });

const sessionAmountsSchema = new mongoose.Schema({
  subtotalExact: { type: MoneySchema, required: true },
  discountExact: { type: MoneySchema, required: true },
  shippingCostExact: { type: MoneySchema, required: true },
  taxAmountExact: { type: MoneySchema, required: true },
  additionalTaxAmountExact: { type: MoneySchema, required: true },
  taxIncludedAmountExact: { type: MoneySchema, required: true },
  dutiesExact: { type: MoneySchema, required: true },
  totalAmountExact: { type: MoneySchema, required: true }
}, { _id: false });

const reconciliationSchema = new mongoose.Schema({
  reasonCode: { type: String, default: null, maxlength: 100 },
  capturedAmountExact: { type: MoneySchema, default: null },
  capturedCurrency: { type: String, default: null, uppercase: true, trim: true },
  providerPaymentId: { type: String, default: null, trim: true },
  detectedAt: { type: Date, default: null },
  stockReacquisitionEligible: { type: Boolean, default: false },
  reconciliationActionRequired: {
    type: String,
    enum: ['MANUAL_REVIEW', 'REFUND_PENDING', 'NONE'],
    default: 'NONE'
  },
  reconciliationStatus: {
    type: String,
    enum: ['UNRESOLVED', 'RESOLVED', 'DISMISSED'],
    default: 'UNRESOLVED'
  },
  notes: { type: String, default: '', maxlength: 500 }
}, { _id: false });

const cancellationSchema = new mongoose.Schema({
  requestedAt: { type: Date, default: null },
  reason: { type: String, default: '', maxlength: 300 },
  providerCancelAttemptCount: { type: Number, default: 0, min: 0 },
  lastAttemptAt: { type: Date, default: null }
}, { _id: false });

const checkoutSessionSchema = new mongoose.Schema({
  sessionId: {
    type: String,
    required: [true, 'Session identifier is required'],
    trim: true,
    maxlength: 128
  },
  merchantScopeId: {
    type: String,
    required: true,
    trim: true,
    default: 'default',
    maxlength: 100
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  customerEmail: {
    type: String,
    required: true,
    trim: true,
    lowercase: true,
    maxlength: 255
  },
  status: {
    type: String,
    enum: Object.values(CHECKOUT_SESSION_STATUSES),
    default: CHECKOUT_SESSION_STATUSES.ACTIVE,
    required: true,
    index: true
  },
  destinationCountry: {
    type: String,
    required: true,
    uppercase: true,
    trim: true,
    minlength: 2,
    maxlength: 2
  },
  currency: {
    type: String,
    required: true,
    uppercase: true,
    trim: true,
    minlength: 3,
    maxlength: 3
  },
  quoteId: {
    type: String,
    required: true,
    trim: true,
    maxlength: 128
  },
  quoteTokenHash: {
    type: String,
    required: true,
    trim: true,
    maxlength: 128
  },
  quoteSnapshot: {
    type: quoteBindingSnapshotSchema,
    required: true
  },
  orderData: {
    items: {
      type: [sessionItemSchema],
      required: true,
      validate: (val) => Array.isArray(val) && val.length > 0
    },
    shippingAddress: {
      type: sessionAddressSchema,
      required: true
    },
    paymentMethod: {
      type: String,
      required: true,
      trim: true,
      maxlength: 50
    },
    shippingServiceLevel: {
      type: String,
      default: 'standard',
      trim: true,
      maxlength: 50
    },
    couponCode: {
      type: String,
      default: null,
      trim: true,
      maxlength: 50
    },
    customerNote: {
      type: String,
      default: '',
      trim: true,
      maxlength: 300
    }
  },
  taxesAndDutiesSnapshot: {
    type: taxesAndDutiesSnapshotSchema,
    required: true
  },
  shippingSnapshot: {
    type: shippingSnapshotSchema,
    required: true
  },
  amounts: {
    type: sessionAmountsSchema,
    required: true
  },
  inventoryHoldId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'InventoryHold',
    required: true
  },
  leaseExpiresAt: {
    type: Date,
    required: true,
    index: true
  },
  paymentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Payment',
    default: null
  },
  convertedOrderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    default: null
  },
  convertedOrderDisplayId: {
    type: String,
    default: null,
    trim: true
  },
  idempotencyKey: {
    type: String,
    required: true,
    trim: true,
    maxlength: 128
  },
  requestHash: {
    type: String,
    required: true,
    trim: true,
    maxlength: 128
  },
  reconciliation: {
    type: reconciliationSchema,
    default: () => ({})
  },
  cancellation: {
    type: cancellationSchema,
    default: () => ({})
  },
  redactedAt: {
    type: Date,
    default: null
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

checkoutSessionSchema.statics.STATUSES = CHECKOUT_SESSION_STATUSES;

checkoutSessionSchema.index(
  { sessionId: 1 },
  { unique: true, name: 'unique_checkout_session_id' }
);

checkoutSessionSchema.index(
  { merchantScopeId: 1, idempotencyKey: 1 },
  {
    unique: true,
    partialFilterExpression: { idempotencyKey: { $type: 'string', $gt: '' } },
    name: 'unique_tenant_session_idempotency'
  }
);

checkoutSessionSchema.index(
  { convertedOrderId: 1 },
  {
    unique: true,
    partialFilterExpression: { convertedOrderId: { $type: 'objectId' } },
    name: 'unique_converted_order_id'
  }
);

checkoutSessionSchema.index(
  { status: 1, leaseExpiresAt: 1 },
  { name: 'session_expiry_reconciliation_idx' }
);

checkoutSessionSchema.index(
  { merchantScopeId: 1, createdAt: -1 },
  { name: 'tenant_session_history_idx' }
);

module.exports = mongoose.models.CheckoutSession || mongoose.model('CheckoutSession', checkoutSessionSchema);

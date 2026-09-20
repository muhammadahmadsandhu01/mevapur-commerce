/**
 * @file commerceSnapshotSchemas.js
 * @description Canonical, bounded typed Mongoose sub-schemas for exact financial,
 * tax, customs, de-minimis, shipping quote, and accepted quote snapshots.
 * Shared between Order and CheckoutSession models to maintain single-source-of-truth integrity.
 */

'use strict';

const mongoose = require('mongoose');
const { MoneySchema } = require('../../modules/commerce');

const deMinimisDecisionSchema = new mongoose.Schema({
  configured: { type: Boolean, default: false },
  thresholdExact: { type: MoneySchema, default: null },
  basisType: { type: String, default: null },
  basisAmountExact: { type: MoneySchema, default: null },
  comparison: {
    type: String,
    enum: ['LT', 'LTE', 'BELOW_OR_EQUAL_DEMINIMIS', 'ABOVE_DEMINIMIS', 'NOT_APPLICABLE', null],
    default: null
  },
  exempt: { type: Boolean, default: false },
  reasonCode: { type: String, default: null }
}, { _id: false });

const taxProvenanceSchema = new mongoose.Schema({
  ruleId: { type: String, default: null },
  priority: { type: Number, default: 100 },
  taxType: { type: String, default: null },
  taxTreatment: { type: String, default: null },
  taxableBasis: { type: String, default: null },
  taxRateNumerator: { type: Number, default: 0 },
  taxRateDenominator: { type: Number, default: 10000 },
  dutyRateNumerator: { type: Number, default: 0 },
  dutyRateDenominator: { type: Number, default: 10000 },
  roundingMode: { type: String, default: 'HALF_UP' },
  roundingScope: { type: String, default: 'subtotal' },
  incoterm: { type: String, default: null },
  providerType: { type: String, default: 'MANUAL_GOVERNED' },
  sourceAuthority: { type: String, default: null },
  sourceReference: { type: String, default: null },
  verificationStatus: { type: String, default: 'VERIFIED_LEGAL_RULE' },
  dutyRefundPolicy: { type: String, default: null },
  taxRefundPolicy: { type: String, default: null },
  customsValueIncludesShipping: { type: Boolean, default: false },
  customsValueIncludesInsurance: { type: Boolean, default: false },
  insuranceAmountExact: { type: MoneySchema, default: null },
  insuranceProvenance: {
    type: String,
    enum: ['NO_INSURANCE_CHARGE', 'EXPLICIT_INSURANCE_CHARGE', null],
    default: null
  },
  calculatedAt: { type: String, default: null }
}, { _id: false });

const customsItemSnapshotSchema = new mongoose.Schema({
  productId: { type: String, default: null },
  variantId: { type: String, default: null },
  quantity: { type: Number, default: 1 },
  hsCode: { type: String, default: null },
  countryOfOrigin: { type: String, default: null },
  customsDescription: { type: String, default: '' },
  declaredValueEligibility: { type: String, default: 'UNKNOWN' },
  dangerousGoodsClassification: { type: String, default: 'UNKNOWN' },
  weightGrams: { type: Number, default: 0 },
  itemValueExact: { type: MoneySchema, default: null },
  dutyAmountExact: { type: MoneySchema, default: null },
  taxAmountExact: { type: MoneySchema, default: null }
}, { _id: false });

const shipmentGroupItemSchema = new mongoose.Schema({
  productId: { type: String, required: true },
  variantId: { type: String, default: null },
  quantity: { type: Number, required: true, min: 1, validate: Number.isInteger }
}, { _id: false });

const shipmentGroupSnapshotSchema = new mongoose.Schema({
  groupId: { type: String, default: 'group_1', trim: true, maxlength: 50 },
  locationId: { type: mongoose.Schema.Types.ObjectId, ref: 'FulfillmentLocation', default: null },
  locationCode: { type: String, default: '', trim: true, uppercase: true, maxlength: 50 },
  originCountry: { type: String, default: '', trim: true, uppercase: true, maxlength: 2 },
  serviceLevel: { type: String, default: 'standard', trim: true, maxlength: 50 },
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
  items: { type: [shipmentGroupItemSchema], default: [] }
}, { _id: false });

const quoteBindingSnapshotSchema = new mongoose.Schema({
  quoteId: { type: String, required: true, trim: true, maxlength: 128 },
  kid: { type: String, required: true, trim: true, maxlength: 128 },
  incoterm: { type: String, enum: ['DAP', 'DDP', 'DOMESTIC'], required: true },
  configVersionId: { type: String, default: null, trim: true, maxlength: 64 },
  merchantScopeId: { type: String, required: true, trim: true, default: 'default', maxlength: 100 },
  issuedAt: { type: Date, required: true },
  expiresAt: { type: Date, required: true },
  itemsHash: { type: String, default: null, trim: true, maxlength: 128 }
}, { _id: false });

const returnPolicySnapshotSchema = new mongoose.Schema({
  windowDays: { type: Number, default: 30, min: 0, max: 365 },
  eligibleStatus: { type: String, default: 'Delivered' },
  restockingFeePercentage: { type: Number, default: 0, min: 0, max: 100 },
  restockingFeeExact: { type: MoneySchema, default: null },
  returnShippingCostPayer: {
    type: String,
    enum: ['CUSTOMER', 'MERCHANT', 'SHARED'],
    default: 'CUSTOMER'
  },
  nonReturnableCategories: {
    type: [{ type: String, trim: true }],
    default: []
  },
  requireApproval: { type: Boolean, default: true },
  allowPartialReturns: { type: Boolean, default: true },
  policyVersion: { type: String, default: '7.0' },
  snapshotCreatedAt: { type: Date, default: Date.now }
}, { _id: false });

const returnRoutingSnapshotSchema = new mongoose.Schema({
  routingStrategy: {
    type: String,
    enum: [
      'LOCAL_HUB',
      'RETURN_TO_ORIGIN',
      'MERCHANT_WAREHOUSE',
      'CARRIER_DISPOSAL',
      'CUSTOMER_KEEPS_ITEM',
      'RESTRICTED_GOODS'
    ],
    required: true
  },
  destinationLocationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'FulfillmentLocation',
    default: null
  },
  destinationLocationCode: {
    type: String,
    default: '',
    trim: true,
    uppercase: true,
    maxlength: 50
  },
  destinationCountry: {
    type: String,
    default: '',
    trim: true,
    uppercase: true,
    maxlength: 2
  },
  responsibleParty: {
    type: String,
    enum: ['CUSTOMER', 'MERCHANT', 'CARRIER'],
    default: 'CUSTOMER'
  },
  costResponsibility: {
    type: String,
    enum: ['CUSTOMER', 'MERCHANT', 'CARRIER', 'WAIVED'],
    default: 'CUSTOMER'
  },
  estimatedReturnShippingCostExact: { type: MoneySchema, default: null },
  routingReason: { type: String, default: '', maxlength: 500 },
  decidedAt: { type: Date, default: Date.now }
}, { _id: false });

module.exports = {
  deMinimisDecisionSchema,
  taxProvenanceSchema,
  customsItemSnapshotSchema,
  shipmentGroupItemSchema,
  shipmentGroupSnapshotSchema,
  quoteBindingSnapshotSchema,
  returnPolicySnapshotSchema,
  returnRoutingSnapshotSchema
};

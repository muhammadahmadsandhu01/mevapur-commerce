/**
 * @file ProductMarketOffering.js
 * @description Market-Specific Product Offering Model.
 * Governs product availability, lifecycle status, visibility, fulfillment mode,
 * and eligible origin routing per merchant shopping/delivery market.
 * Implements immutable versioning and active authority CAS indices.
 */

const mongoose = require('mongoose');

const saleConstraintsSchema = new mongoose.Schema({
  minQuantity: {
    type: Number,
    min: 1,
    default: 1
  },
  maxQuantity: {
    type: Number,
    min: 1,
    default: null
  }
}, { _id: false });

const productMarketOfferingSchema = new mongoose.Schema({
  merchantScopeId: {
    type: String,
    required: true,
    trim: true,
    default: 'default',
    maxlength: 100,
    index: true
  },
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true,
    index: true
  },
  scopeType: {
    type: String,
    enum: ['product', 'variant'],
    default: 'product',
    required: true
  },
  scopeKey: {
    type: String,
    required: true,
    trim: true,
    default: 'product',
    maxlength: 100
  },
  variantId: {
    type: mongoose.Schema.Types.ObjectId,
    default: null
  },
  sku: {
    type: String,
    default: '',
    trim: true,
    maxlength: 100
  },
  marketCountry: {
    type: String,
    required: true,
    trim: true,
    uppercase: true,
    match: /^[A-Z]{2}$/,
    index: true
  },
  pricingPolicy: {
    type: String,
    enum: ['inherit_product_price', 'variant_override_optional', 'variant_override_required'],
    default: 'variant_override_optional',
    required: true
  },
  version: {
    type: Number,
    default: 1,
    min: 1,
    required: true
  },
  status: {
    type: String,
    enum: ['draft', 'scheduled', 'active', 'superseded', 'suspended', 'retired'],
    default: 'draft',
    required: true,
    index: true
  },
  visibility: {
    type: String,
    enum: ['visible', 'hidden'],
    default: 'visible',
    required: true,
    index: true
  },
  fulfillmentMode: {
    type: String,
    enum: ['local', 'cross_border', 'hybrid'],
    default: 'local',
    required: true
  },
  eligibleFulfillmentOriginIds: {
    type: [{
      type: String,
      trim: true,
      maxlength: 64
    }],
    default: [],
    validate: [(val) => !val || val.length <= 50, 'eligibleFulfillmentOriginIds cannot exceed 50 items']
  },
  effectiveFrom: {
    type: Date,
    default: Date.now,
    required: true
  },
  effectiveTo: {
    type: Date,
    default: null
  },
  saleConstraints: {
    type: saleConstraintsSchema,
    default: () => ({ minQuantity: 1, maxQuantity: null })
  },
  lockVersion: {
    type: Number,
    default: 1,
    min: 1,
    required: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  }
}, {
  timestamps: true
});

// A. Immutable version identity index
productMarketOfferingSchema.index(
  {
    merchantScopeId: 1,
    productId: 1,
    scopeType: 1,
    scopeKey: 1,
    marketCountry: 1,
    version: 1
  },
  {
    unique: true,
    name: 'merchantScopeId_1_productId_1_scopeType_1_scopeKey_1_marketCountry_1_version_1'
  }
);

// B. One currently active authority index
productMarketOfferingSchema.index(
  {
    merchantScopeId: 1,
    productId: 1,
    scopeType: 1,
    scopeKey: 1,
    marketCountry: 1
  },
  {
    unique: true,
    partialFilterExpression: { status: 'active' },
    name: 'merchantScopeId_1_productId_1_scopeType_1_scopeKey_1_marketCountry_1_status_active_unique'
  }
);

// C. Catalog Query Optimization Indexes
productMarketOfferingSchema.index(
  { merchantScopeId: 1, marketCountry: 1, status: 1, visibility: 1, effectiveFrom: 1, effectiveTo: 1 },
  { name: 'merchantScopeId_1_marketCountry_1_status_1_visibility_1_effectiveFrom_1_effectiveTo_1' }
);

productMarketOfferingSchema.index(
  { merchantScopeId: 1, productId: 1, marketCountry: 1, status: 1 },
  { name: 'merchantScopeId_1_productId_1_marketCountry_1_status_1' }
);

/**
 * Pre-validation hook to align scopeKey and scopeType deterministically.
 */
productMarketOfferingSchema.pre('validate', function syncScope(next) {
  if (this.variantId) {
    this.scopeType = 'variant';
    this.scopeKey = String(this.variantId);
  } else {
    this.scopeType = 'product';
    this.scopeKey = 'product';
    this.variantId = null;
  }
  next();
});

/**
 * Checks if the offering is currently effective and active.
 * @param {Date} [atDate=new Date()]
 * @returns {boolean}
 */
productMarketOfferingSchema.methods.isCurrentlyEffective = function isCurrentlyEffective(atDate = new Date()) {
  if (this.status !== 'active' || this.visibility !== 'visible') {
    return false;
  }
  const now = new Date(atDate).getTime();
  const from = new Date(this.effectiveFrom).getTime();
  const to = this.effectiveTo ? new Date(this.effectiveTo).getTime() : Infinity;
  return now >= from && now <= to;
};

module.exports = mongoose.models.ProductMarketOffering
  || mongoose.model('ProductMarketOffering', productMarketOfferingSchema);

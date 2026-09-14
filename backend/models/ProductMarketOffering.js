/**
 * @file ProductMarketOffering.js
 * @description Market-Specific Product Offering Model.
 * Governs product availability, lifecycle status, visibility, fulfillment mode,
 * and eligible origin routing per merchant shopping/delivery market.
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
  status: {
    type: String,
    enum: ['draft', 'active', 'suspended', 'retired'],
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

// Scoped Unique Index for Product + Variant + Market
productMarketOfferingSchema.index(
  { merchantScopeId: 1, productId: 1, variantId: 1, marketCountry: 1 },
  { unique: true, name: 'unique_merchant_product_variant_market_offering' }
);

// Catalog Query Optimization Indexes
productMarketOfferingSchema.index(
  { merchantScopeId: 1, marketCountry: 1, status: 1, visibility: 1, effectiveFrom: 1, effectiveTo: 1 },
  { name: 'market_active_catalog_offering_idx' }
);

productMarketOfferingSchema.index(
  { merchantScopeId: 1, productId: 1, marketCountry: 1, status: 1 },
  { name: 'merchant_product_market_status_idx' }
);

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

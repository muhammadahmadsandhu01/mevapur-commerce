/**
 * @file MarketPriceBook.js
 * @description Exact Market Price Book Model.
 * Enforces exact-money string integer minor units, explicit currency exponents,
 * compare-at pricing, and governed price provenance per product/market/currency.
 */

const mongoose = require('mongoose');

const fxSnapshotSchema = new mongoose.Schema({
  snapshotId: { type: String, trim: true, maxlength: 64 },
  baseCurrency: { type: String, trim: true, uppercase: true, match: /^[A-Z]{3}$/ },
  targetCurrency: { type: String, trim: true, uppercase: true, match: /^[A-Z]{3}$/ },
  rateNumerator: { type: Number, min: 1 },
  rateDenominator: { type: Number, min: 1, default: 10000 },
  capturedAt: { type: Date, default: Date.now }
}, { _id: false });

const marketPriceBookSchema = new mongoose.Schema({
  merchantScopeId: {
    type: String,
    required: true,
    trim: true,
    default: 'default',
    maxlength: 100,
    index: true
  },
  marketCountry: {
    type: String,
    required: true,
    trim: true,
    uppercase: true,
    match: /^[A-Z]{2}$/,
    index: true
  },
  currency: {
    type: String,
    required: true,
    trim: true,
    uppercase: true,
    match: /^[A-Z]{3}$/,
    index: true
  },
  currencyExponent: {
    type: Number,
    required: true,
    min: 0,
    max: 4,
    validate: {
      validator: Number.isInteger,
      message: 'currencyExponent must be an integer'
    }
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
  amountMinor: {
    type: String,
    required: true,
    trim: true,
    match: [/^\d+$/, 'amountMinor must be a non-negative integer string']
  },
  compareAtAmountMinor: {
    type: String,
    default: null,
    trim: true,
    validate: {
      validator: (val) => val === null || val === undefined || /^\d+$/.test(val),
      message: 'compareAtAmountMinor must be a non-negative integer string if provided'
    }
  },
  priceSource: {
    type: String,
    enum: ['manual', 'governed_fx_snapshot'],
    default: 'manual',
    required: true
  },
  fxSnapshotReference: {
    type: fxSnapshotSchema,
    default: null
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
  status: {
    type: String,
    enum: ['draft', 'active', 'superseded', 'retired'],
    default: 'active',
    required: true,
    index: true
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

// Compound Index for scoped lookup
marketPriceBookSchema.index(
  { merchantScopeId: 1, productId: 1, variantId: 1, marketCountry: 1, currency: 1, status: 1 },
  { name: 'merchant_product_market_currency_status_idx' }
);

// Unique Active Price Book Entry Index (at most one active entry per scope+product+variant+market+currency)
marketPriceBookSchema.index(
  { merchantScopeId: 1, productId: 1, variantId: 1, marketCountry: 1, currency: 1 },
  {
    unique: true,
    partialFilterExpression: { status: 'active' },
    name: 'unique_active_market_price_book_idx'
  }
);

marketPriceBookSchema.index(
  { merchantScopeId: 1, marketCountry: 1, currency: 1, status: 1, effectiveFrom: 1, effectiveTo: 1 },
  { name: 'market_active_pricing_idx' }
);

/**
 * Validates integrity of price fields before save.
 */
marketPriceBookSchema.pre('validate', function validatePriceIntegrity(next) {
  if (this.amountMinor !== undefined && this.amountMinor !== null) {
    if (typeof this.amountMinor !== 'string' || !/^\d+$/.test(this.amountMinor)) {
      return next(new Error('amountMinor must be a non-negative integer string'));
    }
  }
  if (this.compareAtAmountMinor) {
    if (typeof this.compareAtAmountMinor !== 'string' || !/^\d+$/.test(this.compareAtAmountMinor)) {
      return next(new Error('compareAtAmountMinor must be a non-negative integer string'));
    }
  }
  next();
});

/**
 * Checks if this price book entry is currently effective and active.
 * @param {Date} [atDate=new Date()]
 * @returns {boolean}
 */
marketPriceBookSchema.methods.isCurrentlyEffective = function isCurrentlyEffective(atDate = new Date()) {
  if (this.status !== 'active') {
    return false;
  }
  const now = new Date(atDate).getTime();
  const from = new Date(this.effectiveFrom).getTime();
  const to = this.effectiveTo ? new Date(this.effectiveTo).getTime() : Infinity;
  return now >= from && now <= to;
};

/**
 * Converts exact minor string to floating decimal number (display only, never for settlement math).
 * @returns {number}
 */
marketPriceBookSchema.methods.getDecimalAmount = function getDecimalAmount() {
  const exp = Number(this.currencyExponent !== undefined && this.currencyExponent !== null ? this.currencyExponent : 2);
  const minor = BigInt(this.amountMinor || '0');
  const divisor = BigInt(10 ** exp);
  const integerPart = minor / divisor;
  const remainder = minor % divisor;
  const fractionalPart = remainder.toString().padStart(exp, '0');
  return Number(exp > 0 ? `${integerPart}.${fractionalPart}` : `${integerPart}`);
};

module.exports = mongoose.models.MarketPriceBook
  || mongoose.model('MarketPriceBook', marketPriceBookSchema);

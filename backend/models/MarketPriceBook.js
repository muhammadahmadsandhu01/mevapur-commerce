/**
 * @file MarketPriceBook.js
 * @description Exact Market Price Book Model.
 * Enforces exact-money string integer minor units, CurrencyRegistry validation,
 * exact currency exponents (0, 1, 2, 3, 4), compare-at pricing, immutable versioning,
 * and governed price provenance per product/variant/market/currency.
 */

const mongoose = require('mongoose');
const { CurrencyRegistry } = require('../modules/commerce');

const fxSnapshotSchema = new mongoose.Schema({
  snapshotId: { type: String, trim: true, maxlength: 64 },
  baseCurrency: { type: String, trim: true, uppercase: true, match: /^[A-Z]{3}$/ },
  targetCurrency: { type: String, trim: true, uppercase: true, match: /^[A-Z]{3}$/ },
  rateNumerator: { type: Number, min: 1 },
  rateDenominator: { type: Number, min: 1, default: 10000 },
  roundingPolicy: {
    type: String,
    enum: ['HALF_EVEN', 'HALF_UP', 'DOWN', 'UP', 'NONE'],
    default: 'HALF_EVEN'
  },
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
  currency: {
    type: String,
    required: true,
    trim: true,
    uppercase: true,
    match: [/^[A-Z]{3}$/, 'currency must be a 3-letter ISO code'],
    validate: {
      validator: (val) => {
        try {
          return CurrencyRegistry.has(val, { allowNonCommercial: true });
        } catch {
          return false;
        }
      },
      message: (props) => `Currency '${props.value}' is not recognized in canonical CurrencyRegistry`
    },
    index: true
  },
  currencyExponent: {
    type: Number,
    required: true,
    min: 0,
    max: 4,
    validate: {
      validator: function(val) {
        if (!Number.isInteger(val)) return false;
        if (this.currency && CurrencyRegistry.has(this.currency)) {
          const meta = CurrencyRegistry.get(this.currency, { allowNonCommercial: true });
          if (meta && meta.exponent !== null) {
            return val === meta.exponent;
          }
        }
        return true;
      },
      message: function(props) {
        const meta = this.currency && CurrencyRegistry.has(this.currency) ? CurrencyRegistry.get(this.currency, { allowNonCommercial: true }) : null;
        return `currencyExponent ${props.value} does not match CurrencyRegistry exponent ${meta?.exponent} for ${this.currency}`;
      }
    }
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
    enum: ['manual', 'governed_fx_snapshot', 'custom_rule'],
    default: 'manual',
    required: true
  },
  roundingPolicy: {
    type: String,
    enum: ['HALF_EVEN', 'HALF_UP', 'DOWN', 'UP', 'NONE'],
    default: 'HALF_EVEN'
  },
  fxSnapshotReference: {
    type: fxSnapshotSchema,
    default: null
  },
  offeringId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ProductMarketOffering',
    default: null
  },
  version: {
    type: Number,
    default: 1,
    min: 1,
    required: true
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
    enum: ['draft', 'scheduled', 'active', 'superseded', 'retired'],
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

// A. Immutable version identity index
marketPriceBookSchema.index(
  {
    merchantScopeId: 1,
    productId: 1,
    scopeType: 1,
    scopeKey: 1,
    marketCountry: 1,
    currency: 1,
    version: 1
  },
  {
    unique: true,
    name: 'merchantScopeId_1_productId_1_scopeType_1_scopeKey_1_marketCountry_1_currency_1_version_1'
  }
);

// B. One currently active authority index
marketPriceBookSchema.index(
  {
    merchantScopeId: 1,
    productId: 1,
    scopeType: 1,
    scopeKey: 1,
    marketCountry: 1,
    currency: 1
  },
  {
    unique: true,
    partialFilterExpression: { status: 'active' },
    name: 'merchantScopeId_1_productId_1_scopeType_1_scopeKey_1_marketCountry_1_currency_1_status_active_unique'
  }
);

// C. Query index
marketPriceBookSchema.index(
  { merchantScopeId: 1, marketCountry: 1, currency: 1, status: 1, effectiveFrom: 1, effectiveTo: 1 },
  { name: 'merchantScopeId_1_marketCountry_1_currency_1_status_1_effectiveFrom_1_effectiveTo_1' }
);

/**
 * Pre-validation hook to validate currency against CurrencyRegistry,
 * enforce currencyExponent match, and sync scopeType/scopeKey.
 */
marketPriceBookSchema.pre('validate', function validatePriceIntegrity(next) {
  if (this.variantId) {
    this.scopeType = 'variant';
    this.scopeKey = String(this.variantId);
  } else {
    this.scopeType = 'product';
    this.scopeKey = 'product';
    this.variantId = null;
  }

  if (this.currency) {
    try {
      const meta = CurrencyRegistry.get(this.currency, { allowNonCommercial: true });
      if (meta && meta.exponent !== null) {
        if (this.currencyExponent === undefined || this.currencyExponent === null) {
          this.currencyExponent = meta.exponent;
        } else if (this.currencyExponent !== meta.exponent) {
          return next(new Error(`currencyExponent ${this.currencyExponent} does not match CurrencyRegistry exponent ${meta.exponent} for ${this.currency}`));
        }
      }
    } catch (err) {
      return next(new Error(`Currency '${this.currency}' is not recognized in canonical CurrencyRegistry: ${err.message}`));
    }
  }

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
 * Converts exact minor string to exact formatted decimal string (display only, never Number).
 * @returns {string} Exact decimal string (e.g. "15.50" or "1500")
 */
marketPriceBookSchema.methods.getDecimalAmount = function getDecimalAmount() {
  const exp = Number(this.currencyExponent !== undefined && this.currencyExponent !== null ? this.currencyExponent : 2);
  const minor = BigInt(this.amountMinor || '0');
  if (exp === 0) {
    return minor.toString();
  }
  const divisor = BigInt(10 ** exp);
  const integerPart = minor / divisor;
  const remainder = minor % divisor;
  const fractionalPart = remainder.toString().padStart(exp, '0');
  return `${integerPart}.${fractionalPart}`;
};

module.exports = mongoose.models.MarketPriceBook
  || mongoose.model('MarketPriceBook', marketPriceBookSchema);

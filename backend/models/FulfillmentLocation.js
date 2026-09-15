/**
 * @file FulfillmentLocation.js
 * @description Tenant-scoped fulfillment location authority for Phase 6D-2 multi-origin inventory.
 * Enforces ISO country validation, IANA timezone validation, deterministic priority ordering,
 * market eligibility scoping, and explicit lifecycle transitions (draft/active/suspended/retired).
 */

const mongoose = require('mongoose');
const { CountryRegistry } = require('../modules/commerce');

const isValidTimeZone = (tz) => {
  if (!tz || typeof tz !== 'string') return false;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz.trim() });
    return true;
  } catch {
    return false;
  }
};

const fulfillmentLocationSchema = new mongoose.Schema({
  merchantScopeId: {
    type: String,
    required: true,
    trim: true,
    default: 'default',
    maxlength: 100
  },
  locationCode: {
    type: String,
    required: [true, 'Location code is required'],
    trim: true,
    uppercase: true,
    maxlength: 50,
    match: [/^[A-Z0-9_-]{2,50}$/, 'Location code must contain only uppercase alphanumeric characters, dashes or underscores']
  },
  displayName: {
    type: String,
    required: [true, 'Display name is required'],
    trim: true,
    maxlength: 100
  },
  status: {
    type: String,
    enum: ['draft', 'active', 'suspended', 'retired'],
    default: 'active',
    required: true
  },
  countryCode: {
    type: String,
    required: [true, 'Country code is required'],
    trim: true,
    uppercase: true,
    match: [/^[A-Z]{2}$/, 'Country code must be a valid 2-letter ISO 3166-1 alpha-2 code'],
    validate: {
      validator: (v) => CountryRegistry.hasCountry(v),
      message: (props) => `'${props.value}' is not a recognized ISO 3166-1 country code`
    }
  },
  subdivision: {
    type: String,
    default: '',
    trim: true,
    uppercase: true,
    maxlength: 50
  },
  city: {
    type: String,
    required: [true, 'City is required'],
    trim: true,
    maxlength: 100
  },
  postalCode: {
    type: String,
    default: '',
    trim: true,
    maxlength: 20
  },
  addressLine1: {
    type: String,
    default: '',
    trim: true,
    maxlength: 200
  },
  addressLine2: {
    type: String,
    default: '',
    trim: true,
    maxlength: 200
  },
  timeZone: {
    type: String,
    required: [true, 'Time zone is required'],
    trim: true,
    maxlength: 60,
    validate: {
      validator: isValidTimeZone,
      message: (props) => `'${props.value}' is not a valid IANA timezone identifier`
    }
  },
  priority: {
    type: Number,
    default: 100,
    min: 0,
    max: 10000
  },
  supportedMarketCountries: {
    type: [{
      type: String,
      trim: true,
      uppercase: true,
      match: [/^[A-Z]{2}$/, 'Supported market country must be a valid 2-letter ISO alpha-2 code'],
      validate: {
        validator: (v) => CountryRegistry.hasCountry(v),
        message: (props) => `'${props.value}' is not a recognized ISO 3166-1 country code`
      }
    }],
    default: function() {
      return this.countryCode ? [this.countryCode] : [];
    }
  },
  supportedServiceLevels: {
    type: [{
      type: String,
      trim: true,
      lowercase: true,
      maxlength: 50
    }],
    default: ['standard', 'express']
  },
  capabilities: {
    type: [{
      type: String,
      trim: true,
      lowercase: true,
      maxlength: 50
    }],
    default: ['local_delivery', 'cross_border']
  },
  returnCapabilities: {
    type: [{
      type: String,
      trim: true,
      lowercase: true,
      maxlength: 50
    }],
    default: ['accept_returns', 'inspection', 'restock']
  },
  isDefault: {
    type: Boolean,
    default: false
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
  lockVersion: {
    type: Number,
    default: 1,
    min: 1
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
  timestamps: true,
  versionKey: false
});

// Guard Clause: Unique index on tenant scope + locationCode
fulfillmentLocationSchema.index(
  { merchantScopeId: 1, locationCode: 1 },
  { unique: true, name: 'unique_tenant_location_code' }
);

fulfillmentLocationSchema.index(
  { merchantScopeId: 1, status: 1, priority: 1 },
  { name: 'tenant_status_priority_idx' }
);

fulfillmentLocationSchema.index(
  { merchantScopeId: 1, supportedMarketCountries: 1, status: 1 },
  { name: 'tenant_market_support_idx' }
);

// Enforce at most one active default location per merchant scope
fulfillmentLocationSchema.index(
  { merchantScopeId: 1, isDefault: 1 },
  {
    unique: true,
    partialFilterExpression: { isDefault: true, status: 'active' },
    name: 'unique_active_default_location'
  }
);

// Strip warehouse street address PII in public serialization
fulfillmentLocationSchema.methods.toPublic = function() {
  return {
    id: String(this._id),
    locationCode: this.locationCode,
    displayName: this.displayName,
    countryCode: this.countryCode,
    city: this.city,
    timeZone: this.timeZone,
    priority: this.priority,
    supportedMarketCountries: this.supportedMarketCountries,
    supportedServiceLevels: this.supportedServiceLevels,
    capabilities: this.capabilities,
    isDefault: this.isDefault
  };
};

module.exports = mongoose.models.FulfillmentLocation || mongoose.model('FulfillmentLocation', fulfillmentLocationSchema);

/**
 * @file CommerceConfigurationVersion.js
 * @description Versioned, multi-scope governance model for global market, shipping, tax, and customs configuration.
 * Enforces explicit lifecycles (draft -> validated -> scheduled/active -> superseded/retired),
 * exact rational rate structures, bounded shipping rules, and immutable version snapshots.
 */

const mongoose = require('mongoose');
const { MoneySchema, CountryRegistry, CurrencyRegistry } = require('../modules/commerce');
const { validateTaxRulesIntegrity } = require('../validators/taxRuleIntegrityValidator');

const postalCodeRangeSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['exact', 'prefix', 'numeric_range'],
    required: true
  },
  value: { type: String, trim: true, maxlength: 20 },
  min: { type: String, trim: true, maxlength: 20 },
  max: { type: String, trim: true, maxlength: 20 }
}, { _id: false });

const weightBandSchema = new mongoose.Schema({
  minWeightGrams: { type: Number, required: true, min: 0 },
  maxWeightGrams: { type: Number, required: true, min: 0 },
  rateExact: { type: MoneySchema, required: true },
  pricingMode: {
    type: String,
    enum: ['REPLACE_BASE', 'ADD_TO_BASE'],
    default: 'REPLACE_BASE',
    required: true
  }
}, { _id: false });

const shippingRuleSchema = new mongoose.Schema({
  ruleId: { type: String, required: true, trim: true, maxlength: 64 },
  name: { type: String, required: true, trim: true, maxlength: 100 },
  serviceCode: {
    type: String,
    required: true,
    trim: true,
    uppercase: true,
    maxlength: 50
  },
  displayName: { type: String, required: true, trim: true, maxlength: 100 },
  originCountry: { type: String, required: true, trim: true, uppercase: true, match: /^[A-Z]{2}$/ },
  destinationCountry: { type: String, required: true, trim: true, uppercase: true, match: /^[A-Z]{2}$/ },
  destinationSubdivisions: {
    type: [{ type: String, trim: true, uppercase: true, maxlength: 50 }],
    validate: [(val) => !val || val.length <= 100, 'destinationSubdivisions cannot exceed 100 entries']
  },
  postalCodeRanges: {
    type: [postalCodeRangeSchema],
    validate: [(val) => !val || val.length <= 100, 'postalCodeRanges cannot exceed 100 entries']
  },
  currency: { type: String, required: true, trim: true, uppercase: true, match: /^[A-Z]{3}$/ },
  baseRateExact: { type: MoneySchema, required: true },
  freeShippingThresholdExact: { type: MoneySchema, default: null },
  remoteRateExact: { type: MoneySchema, default: null },
  remotePostalPrefixes: {
    type: [{ type: String, trim: true, maxlength: 20 }],
    validate: [(val) => !val || val.length <= 100, 'remotePostalPrefixes cannot exceed 100 entries']
  },
  remoteCities: {
    type: [{ type: String, trim: true, maxlength: 100 }],
    validate: [(val) => !val || val.length <= 100, 'remoteCities cannot exceed 100 entries']
  },
  deliveryMinDays: { type: Number, required: true, min: 0, max: 120 },
  deliveryMaxDays: { type: Number, required: true, min: 0, max: 120 },
  remoteDeliveryMinDays: { type: Number, default: null, min: 0, max: 120 },
  remoteDeliveryMaxDays: { type: Number, default: null, min: 0, max: 120 },
  processingCutoffLocal: {
    type: String,
    trim: true,
    match: /^(?:[01]\d|2[0-3]):[0-5]\d$/
  },
  workingDays: {
    type: [{ type: Number, min: 1, max: 7 }],
    validate: [(val) => !val || val.length <= 7, 'workingDays cannot exceed 7 entries']
  },
  processingMinBusinessDays: { type: Number, min: 0, max: 120 },
  processingMaxBusinessDays: { type: Number, min: 0, max: 120 },
  weightBands: {
    type: [weightBandSchema],
    validate: [(val) => !val || val.length <= 20, 'weightBands cannot exceed 20 entries']
  },
  priority: { type: Number, default: 100, min: 0, max: 10000 },
  supportedIncoterms: {
    type: [{
      type: String,
      enum: ['DOMESTIC', 'DAP', 'DDP', 'CIF', 'FOB', 'EXW']
    }],
    validate: [(val) => !val || val.length <= 10, 'supportedIncoterms cannot exceed 10 entries']
  },
  enabled: { type: Boolean, default: true }
}, { _id: false });

const taxRuleSchema = new mongoose.Schema({
  ruleId: { type: String, required: true, trim: true, maxlength: 64 },
  destinationCountry: { type: String, required: true, trim: true, uppercase: true, match: /^[A-Z]{2}$/ },
  destinationSubdivision: { type: String, default: '', trim: true, uppercase: true, maxlength: 50 },
  taxType: {
    type: String,
    enum: ['VAT', 'GST', 'SALES_TAX', 'CUSTOMS_VAT', 'EXEMPT'],
    required: true
  },
  taxTreatment: {
    type: String,
    enum: ['inclusive', 'exclusive'],
    default: 'exclusive',
    required: true
  },
  taxableBasis: {
    type: String,
    enum: ['subtotal', 'subtotal_shipping', 'cif'],
    default: 'subtotal',
    required: true
  },
  taxRateNumerator: { type: Number, required: true, min: 0, max: 10000000 },
  taxRateDenominator: { type: Number, required: true, min: 1, max: 10000000, default: 10000 },
  dutyRateNumerator: { type: Number, default: 0, min: 0, max: 10000000 },
  dutyRateDenominator: { type: Number, default: 10000, min: 1, max: 10000000 },
  roundingMode: {
    type: String,
    enum: ['HALF_UP', 'HALF_EVEN', 'FLOOR', 'CEIL'],
    default: 'HALF_UP',
    required: true
  },
  roundingScope: {
    type: String,
    enum: ['subtotal', 'per_item'],
    default: 'subtotal',
    required: true
  },
  incoterm: {
    type: String,
    enum: ['DOMESTIC', 'DAP', 'DDP'],
    required: true
  },
  priority: { type: Number, default: 100, min: 0, max: 10000 },
  customsDutyDeMinimisExact: { type: MoneySchema, default: null },
  importTaxDeMinimisExact: { type: MoneySchema, default: null },
  deMinimisBasis: {
    type: String,
    enum: ['GOODS_VALUE', 'CUSTOMS_VALUE', 'CIF'],
    default: null
  },
  deMinimisComparison: {
    type: String,
    enum: ['LT', 'LTE'],
    default: null
  },
  customsValueIncludesShipping: { type: Boolean, default: null },
  customsValueIncludesInsurance: { type: Boolean, default: null },
  dutyRefundPolicy: {
    type: String,
    enum: ['REFUNDABLE', 'NON_REFUNDABLE', 'MANUAL_REVIEW'],
    default: null
  },
  taxRefundPolicy: {
    type: String,
    enum: ['REFUNDABLE', 'NON_REFUNDABLE', 'PROPORTIONAL', 'MANUAL_REVIEW'],
    default: null
  },
  providerType: {
    type: String,
    enum: ['MANUAL_GOVERNED', 'EXTERNAL_PROVIDER'],
    default: 'MANUAL_GOVERNED'
  },
  providerReference: { type: String, default: null, trim: true, maxlength: 200 },
  exemptionThresholdExact: { type: MoneySchema, default: null },
  sourceAuthority: { type: String, required: true, trim: true, maxlength: 200 },
  sourceReference: { type: String, required: true, trim: true, maxlength: 200 },
  sourcePublicationDate: { type: Date, default: null },
  verificationStatus: {
    type: String,
    enum: ['UNVERIFIED_ESTIMATE', 'VERIFIED_LEGAL_RULE'],
    default: 'UNVERIFIED_ESTIMATE',
    required: true
  },
  requiresTax: { type: Boolean, default: true },
  requiresDuty: { type: Boolean, default: false },
  enabled: { type: Boolean, default: true }
}, { _id: false });

const fulfillmentOriginSchema = new mongoose.Schema({
  originId: { type: String, required: true, trim: true, maxlength: 64 },
  name: { type: String, required: true, trim: true, maxlength: 100 },
  country: { type: String, required: true, trim: true, uppercase: true, match: /^[A-Z]{2}$/ },
  subdivision: { type: String, default: '', trim: true, uppercase: true, maxlength: 50 },
  city: { type: String, required: true, trim: true, maxlength: 100 },
  postalCode: { type: String, default: '', trim: true, maxlength: 20 },
  addressLine1: { type: String, default: '', trim: true, maxlength: 200 },
  addressLine2: { type: String, default: '', trim: true, maxlength: 200 },
  timeZone: { type: String, required: true, trim: true, maxlength: 60 },
  enabled: { type: Boolean, default: true },
  isDefault: { type: Boolean, default: false }
}, { _id: false });

const merchantProfileSchema = new mongoose.Schema({
  merchantCountry: { type: String, required: true, trim: true, uppercase: true, match: /^[A-Z]{2}$/ },
  legalName: { type: String, default: '', trim: true, maxlength: 200 },
  sellingMode: {
    type: String,
    enum: ['domestic', 'international', 'hybrid'],
    default: 'hybrid',
    required: true
  },
  baseCurrency: { type: String, required: true, trim: true, uppercase: true, match: /^[A-Z]{3}$/ },
  defaultCurrency: { type: String, required: true, trim: true, uppercase: true, match: /^[A-Z]{3}$/ },
  enabledCurrencies: {
    type: [{ type: String, trim: true, uppercase: true, match: /^[A-Z]{3}$/ }],
    validate: [(val) => !val || val.length <= 50, 'enabledCurrencies cannot exceed 50 items']
  },
  enabledCountries: {
    type: [{ type: String, trim: true, uppercase: true, match: /^[A-Z]{2}$/ }],
    validate: [(val) => !val || val.length <= 250, 'enabledCountries cannot exceed 250 items']
  },
  defaultLocale: { type: String, default: 'en-PK', trim: true, maxlength: 35 },
  defaultTimeZone: { type: String, default: 'Asia/Karachi', trim: true, maxlength: 60 },
  fulfillmentOrigins: {
    type: [fulfillmentOriginSchema],
    validate: [(val) => !val || val.length <= 20, 'fulfillmentOrigins cannot exceed 20 items']
  },
  supportedIncoterms: {
    type: [{
      type: String,
      enum: ['DOMESTIC', 'DAP', 'DDP', 'CIF', 'FOB', 'EXW']
    }],
    validate: [(val) => !val || val.length <= 10, 'supportedIncoterms cannot exceed 10 items']
  },
  taxCalculationMode: {
    type: String,
    enum: ['exact_rational'],
    default: 'exact_rational',
    required: true
  }
}, { _id: false });

const validationErrorSchema = new mongoose.Schema({
  code: { type: String, required: true, trim: true, maxlength: 100 },
  path: { type: String, required: true, trim: true, maxlength: 200 },
  message: { type: String, required: true, trim: true, maxlength: 500 }
}, { _id: false });

const commerceConfigurationVersionSchema = new mongoose.Schema({
  merchantScopeId: {
    type: String,
    required: true,
    trim: true,
    default: 'default',
    maxlength: 100
  },
  version: {
    type: Number,
    required: true,
    min: 1
  },
  lockVersion: {
    type: Number,
    required: true,
    default: 1,
    min: 1
  },
  status: {
    type: String,
    enum: ['draft', 'validated', 'scheduled', 'active', 'superseded', 'retired'],
    default: 'draft',
    required: true
  },
  merchantProfile: {
    type: merchantProfileSchema,
    required: true
  },
  shippingRules: {
    type: [shippingRuleSchema],
    validate: [(val) => !val || val.length <= 250, 'shippingRules cannot exceed 250 entries']
  },
  taxRules: {
    type: [taxRuleSchema],
    validate: [(val) => !val || val.length <= 500, 'taxRules cannot exceed 500 entries']
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
  quoteAcceptUntil: {
    type: Date,
    default: null
  },
  revokedAt: {
    type: Date,
    default: null
  },
  revocationReason: {
    type: String,
    default: null,
    trim: true,
    maxlength: 500
  },
  changeNotes: {
    type: String,
    default: '',
    trim: true,
    maxlength: 1000
  },
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  validatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  validatedAt: {
    type: Date,
    default: null
  },
  validationErrors: {
    type: [validationErrorSchema],
    validate: [(val) => !val || val.length <= 100, 'validationErrors cannot exceed 100 entries']
  },
  activatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  activatedAt: {
    type: Date,
    default: null
  },
  supersededBy: {
    type: Number,
    default: null
  },
  supersededAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

commerceConfigurationVersionSchema.pre('validate', function normalizeMoneyFields(next) {
  const defaultSnapshot = 'MevaPur currency snapshot 2026-09';
  if (Array.isArray(this.shippingRules)) {
    for (const rule of this.shippingRules) {
      if (Array.isArray(rule.workingDays)) {
        const uniqueAscending = Array.from(new Set(
          rule.workingDays
            .map((d) => parseInt(d, 10))
            .filter((d) => Number.isInteger(d) && d >= 1 && d <= 7)
        )).sort((a, b) => a - b);
        rule.workingDays = uniqueAscending;
      }
      if (rule.baseRateExact && !rule.baseRateExact.registrySnapshot) {
        rule.baseRateExact.registrySnapshot = defaultSnapshot;
      }
      if (rule.freeShippingThresholdExact && !rule.freeShippingThresholdExact.registrySnapshot) {
        rule.freeShippingThresholdExact.registrySnapshot = defaultSnapshot;
      }
      if (rule.remoteRateExact && !rule.remoteRateExact.registrySnapshot) {
        rule.remoteRateExact.registrySnapshot = defaultSnapshot;
      }
      if (Array.isArray(rule.weightBands)) {
        for (const band of rule.weightBands) {
          if (band.rateExact && !band.rateExact.registrySnapshot) {
            band.rateExact.registrySnapshot = defaultSnapshot;
          }
        }
      }
    }
  }
  if (Array.isArray(this.taxRules)) {
    for (const rule of this.taxRules) {
      if (rule.exemptionThresholdExact && !rule.exemptionThresholdExact.registrySnapshot) {
        rule.exemptionThresholdExact.registrySnapshot = defaultSnapshot;
      }
      if (rule.customsDutyDeMinimisExact && !rule.customsDutyDeMinimisExact.registrySnapshot) {
        rule.customsDutyDeMinimisExact.registrySnapshot = defaultSnapshot;
      }
      if (rule.importTaxDeMinimisExact && !rule.importTaxDeMinimisExact.registrySnapshot) {
        rule.importTaxDeMinimisExact.registrySnapshot = defaultSnapshot;
      }
    }
  }
  next();
});

// Scoped Unique and Query Indexes
commerceConfigurationVersionSchema.index(
  { merchantScopeId: 1, version: 1 },
  { unique: true }
);

commerceConfigurationVersionSchema.index(
  { merchantScopeId: 1, status: 1, effectiveFrom: 1, effectiveTo: 1 }
);

// Database-backed invariant: At most one active configuration per merchantScopeId
commerceConfigurationVersionSchema.index(
  { merchantScopeId: 1 },
  {
    unique: true,
    partialFilterExpression: { status: 'active' },
    name: 'merchantScopeId_1_status_active_unique'
  }
);

/**
 * Validates BCP-47 locale tag format.
 * @param {string} locale
 * @returns {boolean}
 */
function isValidBCP47(locale) {
  if (!locale || typeof locale !== 'string') return false;
  try {
    Intl.getCanonicalLocales(locale);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validates IANA Time Zone string.
 * @param {string} tz
 * @returns {boolean}
 */
function isValidIANATimeZone(tz) {
  if (!tz || typeof tz !== 'string') return false;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * Comprehensive validation engine for commerce configuration drafts.
 * Collects structured error codes and paths rather than throwing raw unformatted exceptions.
 * @returns {Array<{ code: string, path: string, message: string }>}
 */
commerceConfigurationVersionSchema.methods.validateIntegrity = function validateIntegrity() {
  const errors = [];
  const profile = this.merchantProfile;

  if (!profile) {
    errors.push({ code: 'MERCHANT_PROFILE_REQUIRED', path: 'merchantProfile', message: 'Merchant profile is required' });
    return errors;
  }

  // 1. Merchant Country & Currency
  if (!CountryRegistry.hasCountry(profile.merchantCountry)) {
    errors.push({
      code: 'INVALID_MERCHANT_COUNTRY',
      path: 'merchantProfile.merchantCountry',
      message: `Merchant country '${profile.merchantCountry}' is not a recognized ISO 3166-1 alpha-2 code`
    });
  }

  if (!CurrencyRegistry.has(profile.baseCurrency)) {
    errors.push({
      code: 'INVALID_BASE_CURRENCY',
      path: 'merchantProfile.baseCurrency',
      message: `Base currency '${profile.baseCurrency}' is not a recognized ISO 4217 code`
    });
  }

  // 2. Locale and Timezone
  if (!isValidBCP47(profile.defaultLocale)) {
    errors.push({
      code: 'INVALID_LOCALE_BCP47',
      path: 'merchantProfile.defaultLocale',
      message: `Locale '${profile.defaultLocale}' is not a valid BCP 47 language tag`
    });
  }

  if (!isValidIANATimeZone(profile.defaultTimeZone)) {
    errors.push({
      code: 'INVALID_TIME_ZONE',
      path: 'merchantProfile.defaultTimeZone',
      message: `Time zone '${profile.defaultTimeZone}' is not a valid IANA time zone identifier`
    });
  }

  // 3. Enabled Countries & Currencies
  for (const c of profile.enabledCountries || []) {
    if (!CountryRegistry.hasCountry(c)) {
      errors.push({
        code: 'INVALID_ENABLED_COUNTRY',
        path: 'merchantProfile.enabledCountries',
        message: `Enabled country '${c}' is not recognized in ISO 3166-1`
      });
    }
  }

  for (const curr of profile.enabledCurrencies || []) {
    if (!CurrencyRegistry.has(curr)) {
      errors.push({
        code: 'INVALID_ENABLED_CURRENCY',
        path: 'merchantProfile.enabledCurrencies',
        message: `Enabled currency '${curr}' is not recognized in ISO 4217`
      });
    }
  }

  // 4. Fulfillment Origins
  const origins = profile.fulfillmentOrigins || [];
  if (origins.length === 0) {
    errors.push({
      code: 'FULFILLMENT_ORIGIN_REQUIRED',
      path: 'merchantProfile.fulfillmentOrigins',
      message: 'At least one fulfillment origin is required'
    });
  }

  const defaultOrigins = origins.filter((o) => o.enabled && o.isDefault);
  if (origins.length > 0 && defaultOrigins.length !== 1) {
    errors.push({
      code: 'EXACTLY_ONE_DEFAULT_ORIGIN_REQUIRED',
      path: 'merchantProfile.fulfillmentOrigins',
      message: `Expected exactly 1 enabled default fulfillment origin, found ${defaultOrigins.length}`
    });
  }

  const originIds = new Set();
  for (let i = 0; i < origins.length; i++) {
    const origin = origins[i];
    if (originIds.has(origin.originId)) {
      errors.push({
        code: 'DUPLICATE_ORIGIN_ID',
        path: `merchantProfile.fulfillmentOrigins[${i}].originId`,
        message: `Duplicate originId '${origin.originId}'`
      });
    }
    originIds.add(origin.originId);

    if (!CountryRegistry.hasCountry(origin.country)) {
      errors.push({
        code: 'INVALID_ORIGIN_COUNTRY',
        path: `merchantProfile.fulfillmentOrigins[${i}].country`,
        message: `Origin country '${origin.country}' is invalid`
      });
    }

    if (!isValidIANATimeZone(origin.timeZone)) {
      errors.push({
        code: 'INVALID_ORIGIN_TIME_ZONE',
        path: `merchantProfile.fulfillmentOrigins[${i}].timeZone`,
        message: `Origin time zone '${origin.timeZone}' is invalid`
      });
    }
  }

  // 5. Shipping Rules Integrity
  const shippingRules = this.shippingRules || [];
  const shippingRuleIds = new Set();
  const priorityMap = new Map();

  for (let i = 0; i < shippingRules.length; i++) {
    const rule = shippingRules[i];
    if (shippingRuleIds.has(rule.ruleId)) {
      errors.push({
        code: 'DUPLICATE_SHIPPING_RULE_ID',
        path: `shippingRules[${i}].ruleId`,
        message: `Duplicate shipping ruleId '${rule.ruleId}'`
      });
    }
    shippingRuleIds.add(rule.ruleId);

    if (!CountryRegistry.hasCountry(rule.originCountry)) {
      errors.push({
        code: 'INVALID_SHIPPING_ORIGIN_COUNTRY',
        path: `shippingRules[${i}].originCountry`,
        message: `Shipping origin country '${rule.originCountry}' is invalid`
      });
    }

    if (!CountryRegistry.hasCountry(rule.destinationCountry)) {
      errors.push({
        code: 'INVALID_SHIPPING_DESTINATION_COUNTRY',
        path: `shippingRules[${i}].destinationCountry`,
        message: `Shipping destination country '${rule.destinationCountry}' is invalid`
      });
    }

    if (rule.deliveryMaxDays < rule.deliveryMinDays) {
      errors.push({
        code: 'INVALID_DELIVERY_DAYS_RANGE',
        path: `shippingRules[${i}].deliveryMaxDays`,
        message: 'Delivery maximum days must not be lower than minimum days'
      });
    }

    // Check ambiguous priority overlaps
    const routeKey = `${rule.originCountry}:${rule.destinationCountry}:${rule.serviceCode}:${rule.priority}`;
    if (priorityMap.has(routeKey)) {
      errors.push({
        code: 'AMBIGUOUS_EQUAL_PRIORITY_SHIPPING_RULE',
        path: `shippingRules[${i}].priority`,
        message: `Shipping rule '${rule.ruleId}' has equal priority (${rule.priority}) on identical route '${routeKey}' to rule '${priorityMap.get(routeKey)}'`
      });
    } else {
      priorityMap.set(routeKey, rule.ruleId);
    }

    // Weight bands validation (non-overlapping, ordered, gapless)
    const bands = rule.weightBands || [];
    for (let b = 0; b < bands.length; b++) {
      const band = bands[b];
      if (band.maxWeightGrams <= band.minWeightGrams) {
        errors.push({
          code: 'INVALID_WEIGHT_BAND_BOUNDS',
          path: `shippingRules[${i}].weightBands[${b}]`,
          message: `Weight band maxWeightGrams (${band.maxWeightGrams}) must be greater than minWeightGrams (${band.minWeightGrams})`
        });
      }
      if (b > 0) {
        const prev = bands[b - 1];
        if (band.minWeightGrams !== prev.maxWeightGrams) {
          errors.push({
            code: 'WEIGHT_BAND_GAP_OR_OVERLAP',
            path: `shippingRules[${i}].weightBands[${b}]`,
            message: `Weight band gap or overlap: band ${b} min (${band.minWeightGrams}) does not match band ${b - 1} max (${prev.maxWeightGrams})`
          });
        }
      }
    }

    // Postal code range bounds
    for (let p = 0; p < (rule.postalCodeRanges || []).length; p++) {
      const pr = rule.postalCodeRanges[p];
      if (pr.type === 'prefix' && (!pr.value || pr.value.length > 10)) {
        errors.push({
          code: 'INVALID_POSTAL_PREFIX',
          path: `shippingRules[${i}].postalCodeRanges[${p}]`,
          message: 'Postal prefix pattern must be bounded between 1 and 10 characters'
        });
      }
      if (pr.type === 'numeric_range') {
        const minNum = parseInt(pr.min, 10);
        const maxNum = parseInt(pr.max, 10);
        if (Number.isNaN(minNum) || Number.isNaN(maxNum) || maxNum < minNum) {
          errors.push({
            code: 'INVALID_NUMERIC_POSTAL_RANGE',
            path: `shippingRules[${i}].postalCodeRanges[${p}]`,
            message: 'Numeric postal range requires valid integer bounds with max >= min'
          });
        }
      }
    }

    // Governed Processing Promise Fields (Required for enabled shipping rules)
    if (rule.enabled !== false) {
      // 1. processingCutoffLocal
      if (!rule.processingCutoffLocal || typeof rule.processingCutoffLocal !== 'string') {
        errors.push({
          code: 'PROCESSING_CUTOFF_REQUIRED',
          path: `shippingRules[${i}].processingCutoffLocal`,
          message: 'Processing cutoff (HH:mm) is required for enabled shipping rules'
        });
      } else if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(rule.processingCutoffLocal.trim())) {
        errors.push({
          code: 'INVALID_PROCESSING_CUTOFF',
          path: `shippingRules[${i}].processingCutoffLocal`,
          message: `Processing cutoff '${rule.processingCutoffLocal}' must be in strict HH:mm 24-hour format (00:00 - 23:59)`
        });
      }

      // 2. workingDays
      if (!Array.isArray(rule.workingDays) || rule.workingDays.length === 0) {
        errors.push({
          code: 'WORKING_DAYS_REQUIRED',
          path: `shippingRules[${i}].workingDays`,
          message: 'At least one working day (1=Mon..7=Sun) is required for enabled shipping rules'
        });
      } else {
        const seenDays = new Set();
        let hasInvalid = false;
        let hasDuplicate = false;
        for (const day of rule.workingDays) {
          const numDay = Number(day);
          if (!Number.isInteger(numDay) || numDay < 1 || numDay > 7) {
            hasInvalid = true;
          }
          if (seenDays.has(numDay)) {
            hasDuplicate = true;
          }
          seenDays.add(numDay);
        }
        if (hasInvalid) {
          errors.push({
            code: 'INVALID_WORKING_DAYS',
            path: `shippingRules[${i}].workingDays`,
            message: 'Working days must be integers between 1 (Monday) and 7 (Sunday)'
          });
        }
        if (hasDuplicate) {
          errors.push({
            code: 'DUPLICATE_WORKING_DAYS',
            path: `shippingRules[${i}].workingDays`,
            message: 'Working days array cannot contain duplicate days'
          });
        }
      }

      // 3. processingMinBusinessDays & processingMaxBusinessDays
      if (rule.processingMinBusinessDays == null || !Number.isInteger(Number(rule.processingMinBusinessDays)) || Number(rule.processingMinBusinessDays) < 0) {
        errors.push({
          code: 'INVALID_PROCESSING_MIN_DAYS',
          path: `shippingRules[${i}].processingMinBusinessDays`,
          message: 'Processing minimum business days must be a non-negative integer'
        });
      }
      if (rule.processingMaxBusinessDays == null || !Number.isInteger(Number(rule.processingMaxBusinessDays)) || Number(rule.processingMaxBusinessDays) < 0) {
        errors.push({
          code: 'INVALID_PROCESSING_MAX_DAYS',
          path: `shippingRules[${i}].processingMaxBusinessDays`,
          message: 'Processing maximum business days must be a non-negative integer'
        });
      }
      if (
        rule.processingMinBusinessDays != null &&
        rule.processingMaxBusinessDays != null &&
        Number.isInteger(Number(rule.processingMinBusinessDays)) &&
        Number.isInteger(Number(rule.processingMaxBusinessDays)) &&
        Number(rule.processingMaxBusinessDays) < Number(rule.processingMinBusinessDays)
      ) {
        errors.push({
          code: 'INVALID_PROCESSING_DAYS_RANGE',
          path: `shippingRules[${i}].processingMaxBusinessDays`,
          message: 'Processing maximum business days must not be lower than minimum days'
        });
      }
    }
  }

  // 6. Tax Rules Integrity
  const taxErrors = validateTaxRulesIntegrity(this.taxRules, this.merchantProfile);
  errors.push(...taxErrors);

  return errors;
};

/**
 * Checks if this version is acceptable for fulfilling a newly placed order with a signed quote.
 * @param {Date} [atDate=new Date()]
 * @returns {boolean}
 */
commerceConfigurationVersionSchema.methods.isOrderAcceptable = function isOrderAcceptable(atDate = new Date()) {
  const now = new Date(atDate).getTime();

  // Emergency revoked versions are immediately unacceptable
  if (this.revokedAt != null) {
    return false;
  }

  if (this.status === 'active') {
    const from = new Date(this.effectiveFrom).getTime();
    const to = this.effectiveTo ? new Date(this.effectiveTo).getTime() : Infinity;
    return now >= from && now <= to;
  }

  if (this.status === 'superseded') {
    if (!this.quoteAcceptUntil) return false;
    const graceEnd = new Date(this.quoteAcceptUntil).getTime();
    return now <= graceEnd;
  }

  return false;
};

module.exports = mongoose.models.CommerceConfigurationVersion
  || mongoose.model('CommerceConfigurationVersion', commerceConfigurationVersionSchema);

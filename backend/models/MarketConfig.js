/**
 * @file MarketConfig.js
 * @description Isolated Merchant Deployment Configuration for Global Commerce.
 */

const mongoose = require('mongoose');
const { CountryRegistry, CurrencyRegistry, RolloutAuthority } = require('../modules/commerce');

const marketConfigSchema = new mongoose.Schema({
  key: { type: String, default: 'default', unique: true, immutable: true },
  merchantCountry: { type: String, trim: true, uppercase: true, match: /^[A-Z]{2}$/, default: 'PK' },
  homeCountry: { type: String, trim: true, uppercase: true, match: /^[A-Z]{2}$/, default: 'PK' },
  sellingMode: { type: String, enum: ['domestic', 'international', 'hybrid'], default: 'hybrid', required: true },
  enabledCountries: [{ type: String, trim: true, uppercase: true, match: /^[A-Z]{2}$/ }],
  baseCurrency: { type: String, trim: true, uppercase: true, match: /^[A-Z]{3}$/, default: 'PKR' },
  defaultCurrency: { type: String, trim: true, uppercase: true, match: /^[A-Z]{3}$/, default: 'PKR' },
  enabledCurrencies: [{ type: String, trim: true, uppercase: true, match: /^[A-Z]{3}$/ }],
  defaultLocale: { type: String, trim: true, maxlength: 35, default: 'en-PK' },
  defaultTimeZone: { type: String, trim: true, maxlength: 50, default: 'Asia/Karachi' },
  fulfillmentOriginCountry: { type: String, trim: true, uppercase: true, match: /^[A-Z]{2}$/, default: 'PK' },
  returnDestinationCountry: { type: String, trim: true, uppercase: true, match: /^[A-Z]{2}$/, default: 'PK' },
  rolloutMode: {
    type: String,
    enum: Object.values(RolloutAuthority.MODES),
    default: RolloutAuthority.MODES.LEGACY
  },
  registrySnapshot: {
    type: String,
    trim: true,
    maxlength: 120,
    default: 'MevaPur currency snapshot 2026-09'
  },
  isEnabled: { type: Boolean, default: true }
}, { timestamps: true });

marketConfigSchema.pre('validate', function normalizeMarketConfig(next) {
  // Sync legacy and explicit field names
  if (this.merchantCountry) this.homeCountry = this.merchantCountry;
  else if (this.homeCountry) this.merchantCountry = this.homeCountry;

  if (this.baseCurrency) this.defaultCurrency = this.baseCurrency;
  else if (this.defaultCurrency) this.baseCurrency = this.defaultCurrency;

  this.enabledCountries = [...new Set((this.enabledCountries || []).map((entry) => String(entry).trim().toUpperCase()))];
  this.enabledCurrencies = [...new Set((this.enabledCurrencies || []).map((entry) => String(entry).trim().toUpperCase()))];

  if (!this.enabledCountries.includes(this.merchantCountry)) {
    this.enabledCountries.push(this.merchantCountry);
  }
  if (!this.enabledCountries.includes(this.fulfillmentOriginCountry)) {
    this.enabledCountries.push(this.fulfillmentOriginCountry);
  }
  if (!this.enabledCurrencies.includes(this.baseCurrency)) {
    this.enabledCurrencies.push(this.baseCurrency);
  }

  // Validate countries against CountryRegistry
  for (const c of this.enabledCountries) {
    if (!CountryRegistry.hasCountry(c)) {
      return next(new Error(`Invalid enabledCountry '${c}': not recognized in ISO 3166-1 CountryRegistry`));
    }
  }

  // Validate currencies against CurrencyRegistry (rejecting non-commercial / deprecated)
  for (const curr of this.enabledCurrencies) {
    try {
      const meta = CurrencyRegistry.get(curr, { allowDeprecated: false, allowNonCommercial: false });
      if (!meta.commerciallyUsable) {
        return next(new Error(`Currency '${curr}' is not commercially usable for market checkout`));
      }
    } catch (err) {
      return next(new Error(`Invalid enabledCurrency '${curr}': ${err.message}`));
    }
  }

  next();
});

module.exports = mongoose.models.MarketConfig || mongoose.model('MarketConfig', marketConfigSchema);

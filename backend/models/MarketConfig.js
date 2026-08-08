const mongoose = require('mongoose');

const marketConfigSchema = new mongoose.Schema({
  key: { type: String, default: 'default', unique: true, immutable: true },
  homeCountry: { type: String, required: true, trim: true, uppercase: true, match: /^[A-Z]{2}$/ },
  sellingMode: { type: String, enum: ['domestic', 'international', 'hybrid'], required: true },
  enabledCountries: [{ type: String, trim: true, uppercase: true, match: /^[A-Z]{2}$/ }],
  defaultCurrency: { type: String, required: true, trim: true, uppercase: true, match: /^[A-Z]{3}$/ },
  enabledCurrencies: [{ type: String, trim: true, uppercase: true, match: /^[A-Z]{3}$/ }],
  defaultLocale: { type: String, trim: true, maxlength: 35, default: 'en-PK' },
  isEnabled: { type: Boolean, default: true }
}, { timestamps: true });

marketConfigSchema.pre('validate', function normalizeMarketConfig(next) {
  this.enabledCountries = [...new Set((this.enabledCountries || []).map((entry) => String(entry).toUpperCase()))];
  this.enabledCurrencies = [...new Set((this.enabledCurrencies || []).map((entry) => String(entry).toUpperCase()))];
  if (!this.enabledCountries.includes(this.homeCountry)) this.enabledCountries.push(this.homeCountry);
  if (!this.enabledCurrencies.includes(this.defaultCurrency)) this.enabledCurrencies.push(this.defaultCurrency);
  next();
});

module.exports = mongoose.models.MarketConfig || mongoose.model('MarketConfig', marketConfigSchema);

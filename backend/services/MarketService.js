/**
 * @file MarketService.js
 * @description Market & Currency Eligibility Service.
 */

const MarketConfig = require('../models/MarketConfig');
const { RolloutAuthority } = require('../modules/commerce');
const { AppError } = require('../common/errors/AppError');

const DEMO_MARKET = Object.freeze({
  key: 'default',
  merchantCountry: 'PK',
  homeCountry: 'PK',
  sellingMode: 'hybrid',
  enabledCountries: ['PK'],
  baseCurrency: 'PKR',
  defaultCurrency: 'PKR',
  enabledCurrencies: ['PKR'],
  defaultLocale: 'en-PK',
  defaultTimeZone: 'Asia/Karachi',
  fulfillmentOriginCountry: 'PK',
  returnDestinationCountry: 'PK',
  rolloutMode: 'legacy',
  registrySnapshot: 'MevaPur currency snapshot 2026-09',
  isEnabled: true
});

class MarketService {
  async getConfig() {
    const existing = await MarketConfig.findOne({ key: 'default' });
    if (existing) return existing;
    try {
      return await MarketConfig.create(DEMO_MARKET);
    } catch (error) {
      if (error?.code === 11000) {
        return MarketConfig.findOne({ key: 'default' });
      }
      throw error;
    }
  }

  async getPublicConfig() {
    const config = await this.getConfig();
    return {
      merchantCountry: config.merchantCountry || config.homeCountry,
      homeCountry: config.homeCountry,
      sellingMode: config.sellingMode,
      enabledCountries: config.enabledCountries,
      baseCurrency: config.baseCurrency || config.defaultCurrency,
      defaultCurrency: config.defaultCurrency,
      enabledCurrencies: config.enabledCurrencies,
      defaultLocale: config.defaultLocale,
      defaultTimeZone: config.defaultTimeZone,
      fulfillmentOriginCountry: config.fulfillmentOriginCountry,
      returnDestinationCountry: config.returnDestinationCountry,
      rolloutMode: this.getEffectiveRolloutMode(config),
      isEnabled: config.isEnabled
    };
  }

  getEffectiveRolloutMode(config, readinessEvidence = null) {
    const requestedMode = config?.rolloutMode || RolloutAuthority.MODES.LEGACY;
    return RolloutAuthority.resolveEffectiveMode({
      requestedMode,
      readinessEvidence
    });
  }

  async assertEligible({ country, currency }) {
    const config = await this.getConfig();
    if (!config.isEnabled || !config.enabledCountries.includes(country)) {
      throw new AppError('Shipping is not available for this country', 409, 'MARKET_COUNTRY_INELIGIBLE');
    }
    if (!config.enabledCurrencies.includes(currency)) {
      throw new AppError('Currency is not enabled for this market', 409, 'MARKET_CURRENCY_INELIGIBLE');
    }
    return config;
  }

  async isCurrencyEnabled(currency) {
    const config = await this.getConfig();
    return config.isEnabled && config.enabledCurrencies.includes(currency);
  }

  async isCountryEnabled(country) {
    const config = await this.getConfig();
    return config.isEnabled && config.enabledCountries.includes(country);
  }

  async update(input) {
    return MarketConfig.findOneAndUpdate(
      { key: 'default' },
      { $set: input },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    );
  }
}

module.exports = new MarketService();

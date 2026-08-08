const MarketConfig = require('../models/MarketConfig');
const { AppError } = require('../common/errors/AppError');

const DEMO_MARKET = Object.freeze({
  key: 'default', homeCountry: 'PK', sellingMode: 'hybrid', enabledCountries: ['PK'],
  defaultCurrency: 'PKR', enabledCurrencies: ['PKR'], defaultLocale: 'en-PK', isEnabled: true
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
      homeCountry: config.homeCountry, sellingMode: config.sellingMode,
      enabledCountries: config.enabledCountries, defaultCurrency: config.defaultCurrency,
      enabledCurrencies: config.enabledCurrencies, defaultLocale: config.defaultLocale,
      isEnabled: config.isEnabled
    };
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

  async update(input) {
    return MarketConfig.findOneAndUpdate({ key: 'default' }, { $set: input }, { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true });
  }
}

module.exports = new MarketService();

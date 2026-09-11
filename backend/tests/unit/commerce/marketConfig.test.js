'use strict';

const MarketConfig = require('../../../models/MarketConfig');
const MarketService = require('../../../services/MarketService');

describe('MarketConfig & MarketService — Isolated Merchant Deployment Unit Tests', () => {
  afterEach(async () => {
    await MarketConfig.deleteMany({});
  });

  it('initializes default merchant configuration safely for Pakistan/PKR', async () => {
    const config = await MarketService.getConfig();

    expect(config.key).toBe('default');
    expect(config.merchantCountry).toBe('PK');
    expect(config.homeCountry).toBe('PK');
    expect(config.baseCurrency).toBe('PKR');
    expect(config.defaultCurrency).toBe('PKR');
    expect(config.enabledCountries).toContain('PK');
    expect(config.enabledCurrencies).toContain('PKR');
    expect(config.defaultLocale).toBe('en-PK');
    expect(config.defaultTimeZone).toBe('Asia/Karachi');
    expect(config.fulfillmentOriginCountry).toBe('PK');
    expect(config.returnDestinationCountry).toBe('PK');
    expect(config.rolloutMode).toBe('legacy');
    expect(config.isEnabled).toBe(true);
  });

  it('validates supported ISO 3166-1 country codes and rejects unknown country codes', async () => {
    const validConfig = new MarketConfig({
      merchantCountry: 'AE',
      baseCurrency: 'AED',
      enabledCountries: ['AE', 'SA', 'GB', 'US'],
      enabledCurrencies: ['AED', 'SAR', 'GBP', 'USD'],
      sellingMode: 'international'
    });
    await expect(validConfig.validate()).resolves.toBeUndefined();

    const invalidCountryConfig = new MarketConfig({
      merchantCountry: 'PK',
      baseCurrency: 'PKR',
      enabledCountries: ['PK', 'UNKNOWN_COUNTRY'],
      enabledCurrencies: ['PKR'],
      sellingMode: 'domestic'
    });
    await expect(invalidCountryConfig.validate()).rejects.toThrow(/not recognized in ISO 3166-1 CountryRegistry/);
  });

  it('validates active commercial ISO 4217 currencies and rejects non-commercial / deprecated codes', async () => {
    // Precious metals (XAU) rejected
    const metalConfig = new MarketConfig({
      merchantCountry: 'US',
      baseCurrency: 'USD',
      enabledCurrencies: ['USD', 'XAU'],
      sellingMode: 'domestic'
    });
    await expect(metalConfig.validate()).rejects.toThrow(/non-commercial/);

    // Deprecated currency (BGN) rejected
    const bgnConfig = new MarketConfig({
      merchantCountry: 'DE',
      baseCurrency: 'EUR',
      enabledCurrencies: ['EUR', 'BGN'],
      sellingMode: 'domestic'
    });
    await expect(bgnConfig.validate()).rejects.toThrow(/deprecated/);

    // Unknown currency code (XYZ) rejected
    const unknownCurrConfig = new MarketConfig({
      merchantCountry: 'PK',
      baseCurrency: 'PKR',
      enabledCurrencies: ['PKR', 'XYZ'],
      sellingMode: 'domestic'
    });
    await expect(unknownCurrConfig.validate()).rejects.toThrow(/Unknown or unsupported currency code/);
  });

  it('automatically ensures merchantCountry and baseCurrency are included in enabled lists', async () => {
    const config = await MarketConfig.create({
      merchantCountry: 'GB',
      baseCurrency: 'GBP',
      enabledCountries: ['US', 'DE'], // Omits GB
      enabledCurrencies: ['USD', 'EUR'], // Omits GBP
      fulfillmentOriginCountry: 'GB',
      returnDestinationCountry: 'GB',
      sellingMode: 'international'
    });

    expect(config.enabledCountries).toContain('GB');
    expect(config.enabledCurrencies).toContain('GBP');
  });

  it('supports international white-label deployments without source code modification', async () => {
    // UK deployment configuration
    const ukConfig = await MarketConfig.create({
      key: 'default',
      merchantCountry: 'GB',
      baseCurrency: 'GBP',
      enabledCountries: ['GB', 'DE', 'FR', 'US'],
      enabledCurrencies: ['GBP', 'EUR', 'USD'],
      defaultLocale: 'en-GB',
      defaultTimeZone: 'Europe/London',
      fulfillmentOriginCountry: 'GB',
      returnDestinationCountry: 'GB',
      sellingMode: 'international'
    });

    expect(ukConfig.merchantCountry).toBe('GB');
    expect(ukConfig.baseCurrency).toBe('GBP');

    // Assert eligibility
    await expect(MarketService.assertEligible({ country: 'DE', currency: 'EUR' })).resolves.toBeDefined();
    await expect(MarketService.assertEligible({ country: 'PK', currency: 'PKR' })).rejects.toThrow(/Shipping is not available/);
  });
});

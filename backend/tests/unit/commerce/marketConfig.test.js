'use strict';

const MarketConfig = require('../../../models/MarketConfig');
const CommerceConfigurationVersion = require('../../../models/CommerceConfigurationVersion');
const MarketService = require('../../../services/MarketService');

describe('MarketConfig & MarketService — Isolated Merchant Deployment Unit Tests', () => {
  afterEach(async () => {
    await MarketConfig.deleteMany({});
    await CommerceConfigurationVersion.deleteMany({});
  });

  it('fails closed when no governed commerce configuration version is active', async () => {
    await expect(MarketService.getConfig()).rejects.toThrow(/No active commerce configuration version found/);
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
    await CommerceConfigurationVersion.create({
      merchantScopeId: 'default',
      version: 1,
      status: 'active',
      effectiveFrom: new Date(Date.now() - 60000),
      effectiveTo: null,
      lockVersion: 1,
      merchantProfile: {
        merchantCountry: 'GB',
        baseCurrency: 'GBP',
        defaultCurrency: 'GBP',
        enabledCountries: ['GB', 'DE', 'FR', 'US'],
        enabledCurrencies: ['GBP', 'EUR', 'USD'],
        sellingMode: 'international',
        defaultLocale: 'en-GB',
        defaultTimeZone: 'Europe/London',
        supportedIncoterms: ['DOMESTIC', 'DDP', 'DAP'],
        taxCalculationMode: 'exact_rational',
        fulfillmentOrigins: [
          {
            originId: 'origin-gb-main',
            name: 'Main UK Warehouse',
            country: 'GB',
            subdivision: 'ENG',
            city: 'London',
            postalCode: 'SW1A 1AA',
            timeZone: 'Europe/London',
            isDefault: true,
            enabled: true
          }
        ]
      },
      shippingRules: [],
      taxRules: []
    });

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

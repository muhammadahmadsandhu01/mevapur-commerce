/**
 * @file market-context-resolver.unit.test.js
 * @description Unit tests for canonical server-side MarketContextResolver.
 */

const MarketContextResolver = require('../../services/market/MarketContextResolver');
const MarketService = require('../../services/MarketService');
const { AppError } = require('../../common/errors/AppError');

jest.mock('../../services/MarketService');

describe('MarketContextResolver Unit Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const mockConfig = {
    merchantCountry: 'PK',
    homeCountry: 'PK',
    baseCurrency: 'PKR',
    defaultCurrency: 'PKR',
    enabledCountries: ['PK', 'AE', 'GB', 'US', 'DE'],
    enabledCurrencies: ['PKR', 'AED', 'GBP', 'USD', 'EUR'],
    configVersionId: 'v1'
  };

  describe('normalizeCountryCode', () => {
    it('normalizes valid 2-letter uppercase ISO codes', () => {
      expect(MarketContextResolver.normalizeCountryCode('PK')).toBe('PK');
      expect(MarketContextResolver.normalizeCountryCode('gb')).toBe('GB');
      expect(MarketContextResolver.normalizeCountryCode('US')).toBe('US');
      expect(MarketContextResolver.normalizeCountryCode('ae')).toBe('AE');
    });

    it('normalizes common names like PAKISTAN to PK', () => {
      expect(MarketContextResolver.normalizeCountryCode('Pakistan')).toBe('PK');
      expect(MarketContextResolver.normalizeCountryCode('pakistan')).toBe('PK');
    });

    it('returns null for invalid or injection strings', () => {
      expect(MarketContextResolver.normalizeCountryCode('XX')).toBeNull();
      expect(MarketContextResolver.normalizeCountryCode('123')).toBeNull();
      expect(MarketContextResolver.normalizeCountryCode('')).toBeNull();
      expect(MarketContextResolver.normalizeCountryCode(null)).toBeNull();
      expect(MarketContextResolver.normalizeCountryCode('{"$gt": ""}')).toBeNull();
    });
  });

  describe('extractExplicitMarketCandidate', () => {
    it('extracts from query parameter ?market=GB', () => {
      const req = { query: { market: 'GB' } };
      expect(MarketContextResolver.extractExplicitMarketCandidate(req)).toBe('GB');
    });

    it('extracts from query parameter ?marketCountry=AE', () => {
      const req = { query: { marketCountry: 'AE' } };
      expect(MarketContextResolver.extractExplicitMarketCandidate(req)).toBe('AE');
    });

    it('extracts from header X-Market-Country', () => {
      const req = { headers: { 'x-market-country': 'US' } };
      expect(MarketContextResolver.extractExplicitMarketCandidate(req)).toBe('US');
    });

    it('extracts from cookies market_country', () => {
      const req = { cookies: { market_country: 'DE' } };
      expect(MarketContextResolver.extractExplicitMarketCandidate(req)).toBe('DE');
    });

    it('returns null when no candidate is present', () => {
      expect(MarketContextResolver.extractExplicitMarketCandidate({})).toBeNull();
    });
  });

  describe('resolve', () => {
    it('precedence 1: resolves explicit customer-selected market when enabled', async () => {
      MarketService.getConfig.mockResolvedValue(mockConfig);

      const req = { query: { market: 'GB' } };
      const context = await MarketContextResolver.resolve(req);

      expect(context.marketCountry).toBe('GB');
      expect(context.currency).toBe('GBP');
      expect(context.source).toBe('explicit_request');
      expect(context.isCustomerSelected).toBe(true);
    });

    it('rejects explicit market candidate if not enabled in active config', async () => {
      MarketService.getConfig.mockResolvedValue(mockConfig);

      const req = { query: { market: 'FR' } }; // FR not in enabledCountries
      await expect(MarketContextResolver.resolve(req)).rejects.toThrow('Market \'FR\' is not enabled');
    });

    it('rejects malformed explicit market candidate safely', async () => {
      MarketService.getConfig.mockResolvedValue(mockConfig);

      const req = { query: { market: 'INVALID_CODE' } };
      await expect(MarketContextResolver.resolve(req)).rejects.toThrow('Invalid market identifier');
    });

    it('precedence 2: resolves authenticated user preferredMarketCountry when valid and enabled', async () => {
      MarketService.getConfig.mockResolvedValue(mockConfig);

      const req = {
        user: {
          residenceCountry: 'PK',
          preferredMarketCountry: 'AE'
        }
      };
      const context = await MarketContextResolver.resolve(req);

      expect(context.marketCountry).toBe('AE');
      expect(context.currency).toBe('AED');
      expect(context.source).toBe('user_preference');
      expect(context.isCustomerSelected).toBe(true);
    });

    it('precedence 3: resolves authenticated user residenceCountry when enabled and preferredMarketCountry is missing', async () => {
      MarketService.getConfig.mockResolvedValue(mockConfig);

      const req = {
        user: {
          residenceCountry: 'US',
          preferredMarketCountry: null
        }
      };
      const context = await MarketContextResolver.resolve(req);

      expect(context.marketCountry).toBe('US');
      expect(context.currency).toBe('USD');
      expect(context.source).toBe('user_residence');
      expect(context.isCustomerSelected).toBe(false);
    });

    it('precedence 4: resolves merchant home/default market for guests without explicit selection', async () => {
      MarketService.getConfig.mockResolvedValue(mockConfig);

      const req = {};
      const context = await MarketContextResolver.resolve(req);

      expect(context.marketCountry).toBe('PK');
      expect(context.currency).toBe('PKR');
      expect(context.source).toBe('merchant_default');
      expect(context.isCustomerSelected).toBe(false);
    });
  });

  describe('getCachePartitionKey', () => {
    it('builds scoped cache key partition', () => {
      const key = MarketContextResolver.getCachePartitionKey({
        merchantScopeId: 'tenant-123',
        marketCountry: 'GB',
        entity: 'products'
      });
      expect(key).toBe('products:tenant-123:GB');
    });
  });
});

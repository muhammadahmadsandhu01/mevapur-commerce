/**
 * @file market-price-book.unit.test.js
 * @description Unit tests for MarketPriceBook model and exact pricing calculations.
 */

const mongoose = require('mongoose');
const MarketPriceBook = require('../../models/MarketPriceBook');
const ProductMarketOfferingService = require('../../services/product/ProductMarketOfferingService');
const Product = require('../../models/Product');
const MarketService = require('../../services/MarketService');

jest.mock('../../models/Product');
jest.mock('../../services/MarketService');

describe('MarketPriceBook Unit Tests', () => {
  const dummyProductId = new mongoose.Types.ObjectId();
  const dummyUserId = new mongoose.Types.ObjectId();

  describe('Model Validation & Invariants', () => {
    it('validates a standard 2-decimal price book entry (e.g. GBP 15.50 -> 1550 minor)', () => {
      const entry = new MarketPriceBook({
        merchantScopeId: 'default',
        productId: dummyProductId,
        marketCountry: 'GB',
        currency: 'GBP',
        currencyExponent: 2,
        amountMinor: '1550',
        compareAtAmountMinor: '2000',
        priceSource: 'manual',
        status: 'active'
      });

      const err = entry.validateSync();
      expect(err).toBeUndefined();
      expect(entry.getDecimalAmount()).toBe('15.50');
      expect(entry.scopeType).toBe('product');
      expect(entry.scopeKey).toBe('product');
    });

    it('validates zero-decimal currency (e.g. JPY 1500 -> 1500 minor)', () => {
      const entry = new MarketPriceBook({
        merchantScopeId: 'default',
        productId: dummyProductId,
        marketCountry: 'JP',
        currency: 'JPY',
        currencyExponent: 0,
        amountMinor: '1500',
        priceSource: 'manual',
        status: 'active'
      });

      const err = entry.validateSync();
      expect(err).toBeUndefined();
      expect(entry.getDecimalAmount()).toBe('1500');
    });

    it('validates 3-decimal currency (e.g. BHD 1.550 -> 1550 minor)', () => {
      const entry = new MarketPriceBook({
        merchantScopeId: 'default',
        productId: dummyProductId,
        marketCountry: 'BH',
        currency: 'BHD',
        currencyExponent: 3,
        amountMinor: '1550',
        priceSource: 'manual',
        status: 'active'
      });

      const err = entry.validateSync();
      expect(err).toBeUndefined();
      expect(entry.getDecimalAmount()).toBe('1.550');
    });

    it('validates 4-decimal currency (e.g. CLF 0.0123 -> 123 minor)', () => {
      const entry = new MarketPriceBook({
        merchantScopeId: 'default',
        productId: dummyProductId,
        marketCountry: 'CL',
        currency: 'CLF',
        currencyExponent: 4,
        amountMinor: '123',
        priceSource: 'manual',
        status: 'active'
      });

      const err = entry.validateSync();
      expect(err).toBeUndefined();
      expect(entry.getDecimalAmount()).toBe('0.0123');
    });

    it('preserves exact precision for values above MAX_SAFE_INTEGER without floating point distortion', () => {
      const hugeMinor = '900719925474099300'; // > Number.MAX_SAFE_INTEGER (9007199254740991)
      const entry = new MarketPriceBook({
        merchantScopeId: 'default',
        productId: dummyProductId,
        marketCountry: 'PK',
        currency: 'PKR',
        currencyExponent: 2,
        amountMinor: hugeMinor,
        priceSource: 'manual',
        status: 'active'
      });

      const err = entry.validateSync();
      expect(err).toBeUndefined();
      expect(entry.amountMinor).toBe(hugeMinor);
    });

    it('rejects floating-point or non-digit strings in amountMinor', () => {
      const entry = new MarketPriceBook({
        merchantScopeId: 'default',
        productId: dummyProductId,
        marketCountry: 'GB',
        currency: 'GBP',
        currencyExponent: 2,
        amountMinor: '15.50', // Invalid: not an integer string
        status: 'active'
      });

      const err = entry.validateSync();
      expect(err).toBeDefined();
      expect(err.errors.amountMinor).toBeDefined();
    });

    it('rejects negative amountMinor', () => {
      const entry = new MarketPriceBook({
        merchantScopeId: 'default',
        productId: dummyProductId,
        marketCountry: 'GB',
        currency: 'GBP',
        currencyExponent: 2,
        amountMinor: '-500', // Invalid
        status: 'active'
      });

      const err = entry.validateSync();
      expect(err).toBeDefined();
    });

    it('supports governed FX snapshot reference metadata', () => {
      const entry = new MarketPriceBook({
        merchantScopeId: 'default',
        productId: dummyProductId,
        marketCountry: 'AE',
        currency: 'AED',
        currencyExponent: 2,
        amountMinor: '4500',
        priceSource: 'governed_fx_snapshot',
        fxSnapshotReference: {
          snapshotId: 'fx-snap-2026-09-01',
          baseCurrency: 'PKR',
          targetCurrency: 'AED',
          rateNumerator: 100,
          rateDenominator: 7600
        },
        status: 'active'
      });

      const err = entry.validateSync();
      expect(err).toBeUndefined();
      expect(entry.fxSnapshotReference.snapshotId).toBe('fx-snap-2026-09-01');
      expect(entry.priceSource).toBe('governed_fx_snapshot');
    });

    it('rejects currency exponent mismatch against CurrencyRegistry', () => {
      const entry = new MarketPriceBook({
        merchantScopeId: 'default',
        productId: dummyProductId,
        marketCountry: 'GB',
        currency: 'GBP',
        currencyExponent: 3, // GBP is exponent 2
        amountMinor: '1550',
        status: 'active'
      });

      const err = entry.validateSync();
      expect(err).toBeDefined();
      expect(err.message).toMatch(/does not match CurrencyRegistry/i);
    });

    it('rejects unknown currency not in CurrencyRegistry', () => {
      const entry = new MarketPriceBook({
        merchantScopeId: 'default',
        productId: dummyProductId,
        marketCountry: 'GB',
        currency: 'XYZ',
        currencyExponent: 2,
        amountMinor: '1550',
        status: 'active'
      });

      const err = entry.validateSync();
      expect(err).toBeDefined();
      expect(err.message).toMatch(/not recognized in canonical CurrencyRegistry/i);
    });
  });

  describe('ProductMarketOfferingService Pricing Operations', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('rejects currency not enabled in active configuration', async () => {
      Product.findById.mockResolvedValue({ _id: dummyProductId, name: 'Walnuts', sku: 'WAL-001' });
      MarketService.getConfig.mockResolvedValue({
        enabledCurrencies: ['PKR', 'GBP']
      });

      await expect(
        ProductMarketOfferingService.upsertPrices(
          dummyProductId,
          [{ marketCountry: 'AE', currency: 'AED', amountMinor: '5000', status: 'active' }],
          { actorId: dummyUserId, merchantScopeId: 'default' }
        )
      ).rejects.toThrow('Currency \'AED\' is not enabled');
    });

    it('rejects invalid currency code', async () => {
      Product.findById.mockResolvedValue({ _id: dummyProductId, name: 'Walnuts', sku: 'WAL-001' });
      MarketService.getConfig.mockResolvedValue({
        enabledCurrencies: ['PKR', 'GBP']
      });

      await expect(
        ProductMarketOfferingService.upsertPrices(
          dummyProductId,
          [{ marketCountry: 'GB', currency: 'XYZ', amountMinor: '5000' }],
          { actorId: dummyUserId, merchantScopeId: 'default' }
        )
      ).rejects.toThrow('Currency \'XYZ\' is unknown');
    });

    it('detects optimistic concurrency conflicts on price updates', async () => {
      Product.findById.mockResolvedValue({ _id: dummyProductId, name: 'Walnuts', sku: 'WAL-001' });
      MarketService.getConfig.mockResolvedValue({
        enabledCurrencies: ['PKR', 'GBP']
      });

      const mockQuery = {
        session: jest.fn().mockResolvedValue({
          _id: new mongoose.Types.ObjectId(),
          lockVersion: 5,
          version: 1,
          amountMinor: '1200',
          save: jest.fn()
        })
      };
      jest.spyOn(MarketPriceBook, 'findOne').mockReturnValue(mockQuery);

      await expect(
        ProductMarketOfferingService.upsertPrices(
          dummyProductId,
          [{ marketCountry: 'GB', currency: 'GBP', amountMinor: '1400', lockVersion: 4 }],
          { actorId: dummyUserId, merchantScopeId: 'default' }
        )
      ).rejects.toThrow('Optimistic concurrency conflict');
    });

    it('rejects mismatched caller-supplied SKU against canonical product variant', async () => {
      const variantId = new mongoose.Types.ObjectId();
      Product.findById.mockResolvedValue({
        _id: dummyProductId,
        name: 'Walnuts',
        sku: 'WAL-ROOT',
        variants: [{ _id: variantId, sku: 'WAL-500G' }]
      });
      MarketService.getConfig.mockResolvedValue({
        enabledCurrencies: ['PKR', 'GBP']
      });

      await expect(
        ProductMarketOfferingService.upsertPrices(
          dummyProductId,
          [{
            marketCountry: 'GB',
            currency: 'GBP',
            variantId: String(variantId),
            sku: 'WRONG-SKU',
            amountMinor: '1400'
          }],
          { actorId: dummyUserId, merchantScopeId: 'default' }
        )
      ).rejects.toThrow('Supplied SKU \'WRONG-SKU\' does not match variant SKU \'WAL-500G\'');
    });
  });
});

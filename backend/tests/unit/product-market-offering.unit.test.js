/**
 * @file product-market-offering.unit.test.js
 * @description Unit tests for ProductMarketOffering model and ProductMarketOfferingService.
 */

const mongoose = require('mongoose');
const ProductMarketOffering = require('../../models/ProductMarketOffering');
const ProductMarketOfferingService = require('../../services/product/ProductMarketOfferingService');
const Product = require('../../models/Product');
const MarketService = require('../../services/MarketService');

jest.mock('../../models/Product');
jest.mock('../../services/MarketService');

describe('ProductMarketOffering Unit Tests', () => {
  const dummyProductId = new mongoose.Types.ObjectId();
  const dummyUserId = new mongoose.Types.ObjectId();

  describe('Model Validation & Invariants', () => {
    it('validates a correct market offering document', () => {
      const offering = new ProductMarketOffering({
        merchantScopeId: 'default',
        productId: dummyProductId,
        marketCountry: 'GB',
        status: 'active',
        visibility: 'visible',
        fulfillmentMode: 'local',
        eligibleFulfillmentOriginIds: ['origin-gb-1'],
        effectiveFrom: new Date('2026-01-01'),
        effectiveTo: new Date('2026-12-31'),
        saleConstraints: { minQuantity: 1, maxQuantity: 10 },
        lockVersion: 1
      });

      const err = offering.validateSync();
      expect(err).toBeUndefined();
      expect(offering.marketCountry).toBe('GB');
      expect(offering.status).toBe('active');
    });

    it('rejects invalid market country code format', () => {
      const offering = new ProductMarketOffering({
        merchantScopeId: 'default',
        productId: dummyProductId,
        marketCountry: 'GREAT_BRITAIN', // Invalid: not 2 uppercase chars
        status: 'active'
      });

      const err = offering.validateSync();
      expect(err).toBeDefined();
      expect(err.errors.marketCountry).toBeDefined();
    });

    it('rejects invalid status enum value', () => {
      const offering = new ProductMarketOffering({
        merchantScopeId: 'default',
        productId: dummyProductId,
        marketCountry: 'GB',
        status: 'invalid_status'
      });

      const err = offering.validateSync();
      expect(err).toBeDefined();
      expect(err.errors.status).toBeDefined();
    });

    it('correctly evaluates isCurrentlyEffective()', () => {
      const activeOffering = new ProductMarketOffering({
        productId: dummyProductId,
        marketCountry: 'GB',
        status: 'active',
        visibility: 'visible',
        effectiveFrom: new Date(Date.now() - 10000),
        effectiveTo: new Date(Date.now() + 10000)
      });
      expect(activeOffering.isCurrentlyEffective()).toBe(true);

      const draftOffering = new ProductMarketOffering({
        productId: dummyProductId,
        marketCountry: 'GB',
        status: 'draft',
        visibility: 'visible',
        effectiveFrom: new Date(Date.now() - 10000)
      });
      expect(draftOffering.isCurrentlyEffective()).toBe(false);

      const hiddenOffering = new ProductMarketOffering({
        productId: dummyProductId,
        marketCountry: 'GB',
        status: 'active',
        visibility: 'hidden',
        effectiveFrom: new Date(Date.now() - 10000)
      });
      expect(hiddenOffering.isCurrentlyEffective()).toBe(false);

      const expiredOffering = new ProductMarketOffering({
        productId: dummyProductId,
        marketCountry: 'GB',
        status: 'active',
        visibility: 'visible',
        effectiveFrom: new Date(Date.now() - 20000),
        effectiveTo: new Date(Date.now() - 10000)
      });
      expect(expiredOffering.isCurrentlyEffective()).toBe(false);
    });
  });

  describe('ProductMarketOfferingService Operations', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('rejects upserting an active offering for a disabled market country', async () => {
      Product.findById.mockResolvedValue({ _id: dummyProductId, name: 'Premium Almonds', sku: 'ALM-001' });
      MarketService.getConfig.mockResolvedValue({
        enabledCountries: ['PK', 'AE']
      });

      await expect(
        ProductMarketOfferingService.upsertOfferings(
          dummyProductId,
          [{ marketCountry: 'GB', status: 'active' }],
          { actorId: dummyUserId, merchantScopeId: 'default' }
        )
      ).rejects.toThrow('Market country \'GB\' is not enabled');
    });

    it('detects optimistic concurrency conflicts when lockVersion does not match', async () => {
      Product.findById.mockResolvedValue({ _id: dummyProductId, name: 'Premium Almonds', sku: 'ALM-001' });
      MarketService.getConfig.mockResolvedValue({
        enabledCountries: ['PK', 'GB']
      });

      jest.spyOn(ProductMarketOffering, 'findOne').mockResolvedValue({
        _id: new mongoose.Types.ObjectId(),
        lockVersion: 3, // existing in DB is version 3
        marketCountry: 'GB',
        status: 'active',
        save: jest.fn()
      });

      await expect(
        ProductMarketOfferingService.upsertOfferings(
          dummyProductId,
          [{ marketCountry: 'GB', status: 'active', lockVersion: 2 }], // client submitted stale version 2
          { actorId: dummyUserId, merchantScopeId: 'default' }
        )
      ).rejects.toThrow('Optimistic concurrency conflict');
    });
  });
});

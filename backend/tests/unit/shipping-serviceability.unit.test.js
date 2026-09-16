/**
 * @file shipping-serviceability.unit.test.js
 * @description Unit tests for ShippingServiceabilityService.
 */

const ShippingServiceabilityService = require('../../services/shipping/ShippingServiceabilityService');
const ManualTableShippingAdapter = require('../../services/checkout/shipping/ManualTableShippingAdapter');
const { Money, MoneyMapper } = require('../../modules/commerce');

describe('Phase 6D-3: ShippingServiceabilityService Unit Tests', () => {
  let service;
  let mockRules;

  beforeEach(() => {
    service = new ShippingServiceabilityService();
    mockRules = [
      {
        ruleId: 'rule-pk-std',
        name: 'PK Domestic Standard',
        serviceCode: 'standard',
        displayName: 'Standard TCS',
        originCountry: 'PK',
        destinationCountry: 'PK',
        currency: 'PKR',
        baseRateExact: MoneyMapper.fromLegacy(250, 'PKR'),
        freeShippingThresholdExact: MoneyMapper.fromLegacy(5000, 'PKR'),
        remoteRateExact: MoneyMapper.fromLegacy(350, 'PKR'),
        remoteCities: ['Gwadar', 'Skardu'],
        remotePostalPrefixes: ['89100'],
        deliveryMinDays: 2,
        deliveryMaxDays: 4,
        weightBands: [
          { minWeightGrams: 0, maxWeightGrams: 1000, rateExact: MoneyMapper.fromLegacy(250, 'PKR'), pricingMode: 'REPLACE_BASE' },
          { minWeightGrams: 1000, maxWeightGrams: 5000, rateExact: MoneyMapper.fromLegacy(100, 'PKR'), pricingMode: 'ADD_TO_BASE' }
        ],
        supportedIncoterms: ['DOMESTIC'],
        enabled: true
      },
      {
        ruleId: 'rule-pk-exp',
        name: 'PK Domestic Express',
        serviceCode: 'express',
        displayName: 'Express TCS Overnight',
        originCountry: 'PK',
        destinationCountry: 'PK',
        currency: 'PKR',
        baseRateExact: MoneyMapper.fromLegacy(500, 'PKR'),
        deliveryMinDays: 1,
        deliveryMaxDays: 2,
        supportedIncoterms: ['DOMESTIC'],
        enabled: true
      },
      {
        ruleId: 'rule-ae-std',
        name: 'UAE International Standard',
        serviceCode: 'standard',
        displayName: 'DHL Standard Tracked',
        originCountry: 'PK',
        destinationCountry: 'AE',
        currency: 'AED',
        baseRateExact: MoneyMapper.fromLegacy(35, 'AED'),
        freeShippingThresholdExact: MoneyMapper.fromLegacy(250, 'AED'),
        deliveryMinDays: 3,
        deliveryMaxDays: 6,
        supportedIncoterms: ['DDP', 'DOMESTIC'],
        enabled: true
      }
    ];
  });

  describe('1. Route Serviceability & Rule Filtering', () => {
    it('1.1 evaluates serviceability successfully for valid domestic route', async () => {
      const result = await service.evaluateServiceability({
        countryCode: 'PK',
        originCountry: 'PK',
        currency: 'PKR',
        subtotalMoney: Money.fromLegacyNumber(1000, 'PKR'),
        shippingRules: mockRules
      });

      expect(result.isServiceable).toBe(true);
      expect(result.countryCode).toBe('PK');
      expect(result.options.length).toBe(2);
      expect(result.options.some((o) => o.serviceLevel === 'standard')).toBe(true);
      expect(result.options.some((o) => o.serviceLevel === 'express')).toBe(true);
    });

    it('1.2 evaluates specific service level if requested', async () => {
      const result = await service.evaluateServiceability({
        countryCode: 'PK',
        originCountry: 'PK',
        currency: 'PKR',
        subtotalMoney: Money.fromLegacyNumber(1000, 'PKR'),
        serviceLevel: 'express',
        shippingRules: mockRules
      });

      expect(result.isServiceable).toBe(true);
      expect(result.options.length).toBe(1);
      expect(result.options[0].serviceLevel === 'express').toBe(true);
      expect(result.options[0].shippingAmount).toBe(500);
    });

    it('1.3 returns isServiceable=false for unconfigured destination country', async () => {
      const result = await service.evaluateServiceability({
        countryCode: 'FR',
        originCountry: 'PK',
        currency: 'EUR',
        shippingRules: mockRules
      });

      expect(result.isServiceable).toBe(false);
      expect(result.reason).toBe('NO_MATCHING_RULES');
      expect(result.options).toEqual([]);
    });

    it('1.4 returns isServiceable=false for invalid ISO country code', async () => {
      const result = await service.evaluateServiceability({
        countryCode: 'XX',
        originCountry: 'PK',
        shippingRules: mockRules
      });

      expect(result.isServiceable).toBe(false);
      expect(result.reason).toBe('INVALID_COUNTRY');
    });

    it('1.5 throws AppError if countryCode is omitted', async () => {
      await expect(service.evaluateServiceability({})).rejects.toThrow('Destination country code is required');
    });
  });

  describe('2. Weight Bands, Remote Areas & Free Shipping Invariants', () => {
    it('2.1 applies ADD_TO_BASE weight tier when cart exceeds first tier', async () => {
      const result = await service.evaluateServiceability({
        countryCode: 'PK',
        originCountry: 'PK',
        currency: 'PKR',
        subtotalMoney: Money.fromLegacyNumber(1000, 'PKR'),
        weightGrams: 2500,
        serviceLevel: 'standard',
        shippingRules: mockRules
      });

      expect(result.isServiceable).toBe(true);
      expect(result.options[0].shippingAmount).toBe(350); // 250 base + 100 add
    });

    it('2.2 applies remote surcharge for remote city', async () => {
      const result = await service.evaluateServiceability({
        countryCode: 'PK',
        originCountry: 'PK',
        city: 'Gwadar',
        currency: 'PKR',
        subtotalMoney: Money.fromLegacyNumber(1000, 'PKR'),
        serviceLevel: 'standard',
        shippingRules: mockRules
      });

      expect(result.isServiceable).toBe(true);
      expect(result.isRemote).toBe(true);
      expect(result.options[0].shippingAmount).toBe(350);
    });

    it('2.3 grants free shipping for qualifying subtotal on non-remote route', async () => {
      const result = await service.evaluateServiceability({
        countryCode: 'PK',
        originCountry: 'PK',
        city: 'Lahore',
        currency: 'PKR',
        subtotalMoney: Money.fromLegacyNumber(6000, 'PKR'),
        serviceLevel: 'standard',
        shippingRules: mockRules
      });

      expect(result.isServiceable).toBe(true);
      expect(result.options[0].shippingAmount).toBe(0);
      expect(result.options[0].freeShippingApplied).toBe(true);
    });

    it('2.4 excludes remote destinations from free shipping threshold', async () => {
      const result = await service.evaluateServiceability({
        countryCode: 'PK',
        originCountry: 'PK',
        city: 'Gwadar',
        currency: 'PKR',
        subtotalMoney: Money.fromLegacyNumber(10000, 'PKR'),
        serviceLevel: 'standard',
        shippingRules: mockRules
      });

      expect(result.isServiceable).toBe(true);
      expect(result.options[0].shippingAmount).toBe(350);
      expect(result.options[0].freeShippingApplied).toBe(false);
    });
  });

  describe('3. Multi-Origin Fulfillment & Rule Filtering', () => {
    it('3.1 filterMatchingRules matches domestic route with DOMESTIC incoterm', () => {
      const matching = service.filterMatchingRules(mockRules, {
        originCountry: 'AE',
        destinationCountry: 'AE',
        serviceCode: 'standard'
      });

      expect(matching.length).toBe(1);
      expect(matching[0].ruleId).toBe('rule-ae-std');
    });

    it('3.2 filterMatchingRules returns empty when origin mismatches international rule', () => {
      const matching = service.filterMatchingRules(mockRules, {
        originCountry: 'GB',
        destinationCountry: 'AE',
        serviceCode: 'standard'
      });

      expect(matching.length).toBe(0);
    });
  });
});

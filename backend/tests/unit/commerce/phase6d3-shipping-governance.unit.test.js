/**
 * @file phase6d3-shipping-governance.unit.test.js
 * @description Comprehensive unit tests for Phase 6D-3: Shipping Rules, Multi-Service Rate Calculation,
 * Weight Bands, Remote Areas, Routing Invariants, and Migration Guard Logic.
 */

const ManualTableShippingAdapter = require('../../../services/checkout/shipping/ManualTableShippingAdapter');
const { Money, MoneyMapper } = require('../../../modules/commerce');
const {
  TARGET_INDEXES,
  findIndexMatch,
  inspectPreflightAnomalies
} = require('../../../scripts/migrations/phase6d3-shipping-governance');

const GOVERNED_SHIPPING_FIXTURES = [
  {
    ruleId: 'RULE-PK-STD-01',
    name: 'Pakistan Domestic Standard',
    serviceCode: 'standard',
    displayName: 'Standard Ground Delivery (PK)',
    originCountry: 'PK',
    destinationCountry: 'PK',
    currency: 'PKR',
    baseRateExact: { amountMinor: '25000', currency: 'PKR', exponent: 2 },
    freeShippingThresholdExact: { amountMinor: '500000', currency: 'PKR', exponent: 2 },
    remoteRateExact: { amountMinor: '40000', currency: 'PKR', exponent: 2 },
    remoteCities: ['Gwadar', 'Skardu', 'Turbat', 'Chitral'],
    remotePostalPrefixes: ['89', '90'],
    deliveryMinDays: 2,
    deliveryMaxDays: 4,
    remoteDeliveryMinDays: 5,
    remoteDeliveryMaxDays: 8,
    priority: 100,
    supportedIncoterms: ['DOMESTIC'],
    enabled: true
  },
  {
    ruleId: 'RULE-PK-EXP-01',
    name: 'Pakistan Domestic Express',
    serviceCode: 'express',
    displayName: 'Next-Day Express Courier (PK)',
    originCountry: 'PK',
    destinationCountry: 'PK',
    currency: 'PKR',
    baseRateExact: { amountMinor: '55000', currency: 'PKR', exponent: 2 },
    deliveryMinDays: 1,
    deliveryMaxDays: 2,
    priority: 50,
    supportedIncoterms: ['DOMESTIC'],
    enabled: true
  },
  {
    ruleId: 'RULE-PK-ECO-01',
    name: 'Pakistan Domestic Economy',
    serviceCode: 'economy',
    displayName: 'Economy Postal (PK)',
    originCountry: 'PK',
    destinationCountry: 'PK',
    currency: 'PKR',
    baseRateExact: { amountMinor: '18000', currency: 'PKR', exponent: 2 },
    deliveryMinDays: 5,
    deliveryMaxDays: 10,
    priority: 150,
    supportedIncoterms: ['DOMESTIC'],
    enabled: true
  },
  {
    ruleId: 'RULE-PK-US-TIERED',
    name: 'US Cross-Border Bounded Tiers',
    serviceCode: 'standard',
    displayName: 'DHL Global Forwarding (US)',
    originCountry: 'PK',
    destinationCountry: 'US',
    currency: 'USD',
    baseRateExact: { amountMinor: '2500', currency: 'USD', exponent: 2 },
    postalCodeRanges: [
      { type: 'prefix', value: '100' },
      { type: 'numeric_range', min: '90000', max: '96162' } // California range
    ],
    weightBands: [
      { minWeightGrams: 0, maxWeightGrams: 1000, rateExact: { amountMinor: '2500', currency: 'USD', exponent: 2 }, pricingMode: 'REPLACE_BASE' },
      { minWeightGrams: 1000, maxWeightGrams: 3000, rateExact: { amountMinor: '1200', currency: 'USD', exponent: 2 }, pricingMode: 'ADD_TO_BASE' },
      { minWeightGrams: 3000, maxWeightGrams: 10000, rateExact: { amountMinor: '2800', currency: 'USD', exponent: 2 }, pricingMode: 'ADD_TO_BASE' }
    ],
    deliveryMinDays: 5,
    deliveryMaxDays: 8,
    priority: 10,
    supportedIncoterms: ['DDP', 'DAP'],
    enabled: true
  },
  {
    ruleId: 'RULE-AE-US-TIERED',
    name: 'AE to US Alternate Origin',
    serviceCode: 'standard',
    displayName: 'Emirates Post to US',
    originCountry: 'AE',
    destinationCountry: 'US',
    currency: 'USD',
    baseRateExact: { amountMinor: '1900', currency: 'USD', exponent: 2 },
    deliveryMinDays: 4,
    deliveryMaxDays: 7,
    priority: 10,
    supportedIncoterms: ['DDP'],
    enabled: true
  }
];

describe('Phase 6D-3: Shipping Governance & Multi-Service Engine Unit Tests', () => {
  let adapter;

  beforeEach(() => {
    adapter = new ManualTableShippingAdapter(GOVERNED_SHIPPING_FIXTURES);
  });

  describe('1. Multi-Service Rate Calculation & Dynamic Options Discovery', () => {
    it('1.1 Computes exact rates for Standard, Express, and Economy service levels', async () => {
      const subtotalMoney = Money.fromMinor('200000', 'PKR'); // 2000 PKR (below 5000 threshold)

      const std = await adapter.quote({
        countryCode: 'PK',
        currency: 'PKR',
        subtotalMoney,
        serviceLevel: 'standard'
      });
      const exp = await adapter.quote({
        countryCode: 'PK',
        currency: 'PKR',
        subtotalMoney,
        serviceLevel: 'express'
      });
      const eco = await adapter.quote({
        countryCode: 'PK',
        currency: 'PKR',
        subtotalMoney,
        serviceLevel: 'economy'
      });

      expect(std.shippingAmount).toBe(250);
      expect(std.shippingAmountExact.amountMinor.toString()).toBe('25000');
      expect(exp.shippingAmount).toBe(550);
      expect(exp.shippingAmountExact.amountMinor.toString()).toBe('55000');
      expect(eco.shippingAmount).toBe(180);
      expect(eco.shippingAmountExact.amountMinor.toString()).toBe('18000');
    });

    it('1.2 quoteAllServices dynamically discovers all 3 available options for destination route', async () => {
      const options = await adapter.quoteAllServices({
        countryCode: 'PK',
        currency: 'PKR',
        subtotalMoney: Money.fromMinor('100000', 'PKR'),
        city: 'Lahore'
      });

      expect(options).toHaveLength(3);
      const codes = options.map((o) => o.serviceLevel);
      expect(codes).toContain('standard');
      expect(codes).toContain('express');
      expect(codes).toContain('economy');
    });
  });

  describe('2. Multi-Origin Fulfillment Routing Constraints', () => {
    it('2.1 Matches rule matching explicit originCountry parameter (PK -> US)', async () => {
      const quote = await adapter.quote({
        countryCode: 'US',
        originCountry: 'PK',
        currency: 'USD',
        subtotalMoney: Money.fromMinor('5000', 'USD'),
        postalCode: '10001'
      });

      expect(quote.ruleId).toBe('RULE-PK-US-TIERED');
      expect(quote.shippingAmount).toBe(25);
    });

    it('2.2 Matches distinct rule for alternate merchant fulfillment origin (AE -> US)', async () => {
      const quote = await adapter.quote({
        countryCode: 'US',
        originCountry: 'AE',
        currency: 'USD',
        subtotalMoney: Money.fromMinor('5000', 'USD')
      });

      expect(quote.ruleId).toBe('RULE-AE-US-TIERED');
      expect(quote.shippingAmount).toBe(19);
    });

    it('2.3 Fails closed with 409 if no rule satisfies the origin/destination combination', async () => {
      await expect(
        adapter.quote({
          countryCode: 'US',
          originCountry: 'GB',
          currency: 'USD',
          subtotalMoney: Money.fromMinor('5000', 'USD')
        })
      ).rejects.toThrow('No shipping rules configured for destination country \'US\'');
    });
  });

  describe('3. Weight Band Arithmetic & Bounds Evaluation', () => {
    it('3.1 Applies REPLACE_BASE for first weight tier (0-1000g)', async () => {
      const quote = await adapter.quote({
        countryCode: 'US',
        originCountry: 'PK',
        currency: 'USD',
        subtotalMoney: Money.fromMinor('5000', 'USD'),
        postalCode: '10005',
        weightGrams: 500
      });

      // Band rate = 25.00 USD (REPLACE_BASE)
      expect(quote.shippingAmount).toBe(25);
      expect(quote.shippingAmountExact.amountMinor.toString()).toBe('2500');
    });

    it('3.2 Applies ADD_TO_BASE for second weight tier (1000-3000g)', async () => {
      const quote = await adapter.quote({
        countryCode: 'US',
        originCountry: 'PK',
        currency: 'USD',
        subtotalMoney: Money.fromMinor('5000', 'USD'),
        postalCode: '90210', // In California numeric range 90000-96162
        weightGrams: 2500
      });

      // Base 25.00 + Surcharge 12.00 = 37.00 USD
      expect(quote.shippingAmount).toBe(37);
      expect(quote.shippingAmountExact.amountMinor.toString()).toBe('3700');
    });

    it('3.3 Applies ADD_TO_BASE for heavy tier (3000-10000g)', async () => {
      const quote = await adapter.quote({
        countryCode: 'US',
        originCountry: 'PK',
        currency: 'USD',
        subtotalMoney: Money.fromMinor('5000', 'USD'),
        postalCode: '90210',
        weightGrams: 8000
      });

      // Base 25.00 + Heavy Surcharge 28.00 = 53.00 USD
      expect(quote.shippingAmount).toBe(53);
      expect(quote.shippingAmountExact.amountMinor.toString()).toBe('5300');
    });
  });

  describe('4. Remote Area Surcharges & Free Shipping Invariants', () => {
    it('4.1 Applies remote rate and extended delivery window for remote city', async () => {
      const quote = await adapter.quote({
        countryCode: 'PK',
        currency: 'PKR',
        subtotalMoney: Money.fromMinor('100000', 'PKR'),
        city: 'Gwadar',
        serviceLevel: 'standard'
      });

      expect(quote.isRemote).toBe(true);
      expect(quote.shippingAmount).toBe(400);
      expect(quote.deliveryEstimate.minDays).toBe(5);
      expect(quote.deliveryEstimate.maxDays).toBe(8);
      expect(quote.freeShippingApplied).toBe(false);
    });

    it('4.2 Applies remote rate for remote postal prefix (e.g. 89100)', async () => {
      const quote = await adapter.quote({
        countryCode: 'PK',
        currency: 'PKR',
        subtotalMoney: Money.fromMinor('100000', 'PKR'),
        postalCode: '89100',
        serviceLevel: 'standard'
      });

      expect(quote.isRemote).toBe(true);
      expect(quote.shippingAmount).toBe(400);
    });

    it('4.3 Enforces that remote destinations are strictly excluded from free shipping threshold', async () => {
      const quote = await adapter.quote({
        countryCode: 'PK',
        currency: 'PKR',
        subtotalMoney: Money.fromMinor('800000', 'PKR'), // 8000 PKR > 5000 threshold
        city: 'Skardu',
        serviceLevel: 'standard'
      });

      expect(quote.isRemote).toBe(true);
      expect(quote.freeShippingApplied).toBe(false);
      expect(quote.shippingAmount).toBe(400);
    });

    it('4.4 Grants free shipping for eligible non-remote subtotal exceeding threshold', async () => {
      const quote = await adapter.quote({
        countryCode: 'PK',
        currency: 'PKR',
        subtotalMoney: Money.fromMinor('600000', 'PKR'), // 6000 PKR > 5000 threshold
        city: 'Islamabad',
        serviceLevel: 'standard'
      });

      expect(quote.isRemote).toBe(false);
      expect(quote.freeShippingApplied).toBe(true);
      expect(quote.shippingAmount).toBe(0);
      expect(quote.shippingAmountExact.amountMinor.toString()).toBe('0');
    });
  });

  describe('5. Migration Runtime Invariant & Anomaly Checks', () => {
    it('5.1 findIndexMatch accurately detects key and name match', () => {
      const existing = [
        { name: 'unique_tenant_config_version', key: { merchantScopeId: 1, version: 1 } }
      ];
      const target = TARGET_INDEXES[0];
      const match = findIndexMatch(existing, target);
      expect(match).toBeDefined();
      expect(match.name).toBe('unique_tenant_config_version');
    });

    it('5.2 inspectPreflightAnomalies identifies invalid country codes and inverted weight bands', async () => {
      const mockDb = {
        collection: jest.fn().mockReturnValue({
          find: jest.fn().mockReturnValue({
            toArray: jest.fn().mockResolvedValue([
              {
                version: 1,
                status: 'active',
                shippingRules: [
                  {
                    ruleId: 'BAD-RULE-1',
                    destinationCountry: 'ZZ', // invalid
                    weightBands: [
                      { minWeightGrams: 5000, maxWeightGrams: 1000 } // inverted
                    ]
                  }
                ]
              }
            ])
          })
        })
      };

      const anomalies = await inspectPreflightAnomalies(mockDb);
      expect(anomalies).toHaveLength(2);
      expect(anomalies.some((a) => a.type === 'INVALID_DESTINATION_COUNTRY')).toBe(true);
      expect(anomalies.some((a) => a.type === 'INVALID_WEIGHT_BAND_BOUNDS')).toBe(true);
    });
  });
});

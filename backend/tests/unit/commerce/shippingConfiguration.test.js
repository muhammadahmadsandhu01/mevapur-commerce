/**
 * @file shippingConfiguration.test.js
 * @description Unit tests for Phase 6B versioned Shipping Adapter.
 * Covers bounded postal patterns, weight bands, priority ordering, and remote surcharges.
 */

const ManualTableShippingAdapter = require('../../../services/checkout/shipping/ManualTableShippingAdapter');
const { Money } = require('../../../modules/commerce');

const TEST_SHIPPING_RULES = [
  {
    ruleId: 'SHIP-PK-STD',
    name: 'Pakistan Standard Delivery',
    serviceCode: 'standard',
    displayName: 'Standard Courier (PK)',
    originCountry: 'PK',
    destinationCountry: 'PK',
    currency: 'PKR',
    baseRateExact: { amountMinor: '25000', currency: 'PKR', exponent: 2 },
    freeShippingThresholdExact: { amountMinor: '500000', currency: 'PKR', exponent: 2 },
    remoteRateExact: { amountMinor: '45000', currency: 'PKR', exponent: 2 },
    remoteCities: ['gwadar', 'chitral', 'skardu'],
    deliveryMinDays: 2,
    deliveryMaxDays: 4,
    remoteDeliveryMinDays: 5,
    remoteDeliveryMaxDays: 9,
    processingCutoffLocal: '14:00',
    workingDays: [1, 2, 3, 4, 5],
    processingMinBusinessDays: 0,
    processingMaxBusinessDays: 1,
    priority: 100,
    enabled: true
  },
  {
    ruleId: 'SHIP-PK-EXP',
    name: 'Pakistan Express Delivery',
    serviceCode: 'express',
    displayName: 'Overnight Express (PK)',
    originCountry: 'PK',
    destinationCountry: 'PK',
    currency: 'PKR',
    baseRateExact: { amountMinor: '50000', currency: 'PKR', exponent: 2 },
    deliveryMinDays: 1,
    deliveryMaxDays: 2,
    processingCutoffLocal: '14:00',
    workingDays: [1, 2, 3, 4, 5],
    processingMinBusinessDays: 0,
    processingMaxBusinessDays: 1,
    priority: 50,
    enabled: true
  },
  {
    ruleId: 'SHIP-US-POSTAL-RANGE',
    name: 'US East Coast Standard',
    serviceCode: 'standard',
    displayName: 'USPS Priority (US)',
    originCountry: 'PK',
    destinationCountry: 'US',
    currency: 'USD',
    baseRateExact: { amountMinor: '2000', currency: 'USD', exponent: 2 },
    postalCodeRanges: [
      { type: 'numeric_range', min: '10000', max: '19999' } // NY / PA range
    ],
    weightBands: [
      { minWeightGrams: 0, maxWeightGrams: 1000, rateExact: { amountMinor: '2000', currency: 'USD', exponent: 2 }, pricingMode: 'REPLACE_BASE' },
      { minWeightGrams: 1000, maxWeightGrams: 5000, rateExact: { amountMinor: '1000', currency: 'USD', exponent: 2 }, pricingMode: 'ADD_TO_BASE' }
    ],
    deliveryMinDays: 5,
    deliveryMaxDays: 10,
    processingCutoffLocal: '14:00',
    workingDays: [1, 2, 3, 4, 5],
    processingMinBusinessDays: 0,
    processingMaxBusinessDays: 1,
    priority: 10,
    enabled: true
  }
];

describe('Phase 6B: Shipping Configuration & Adapter', () => {
  let adapter;

  beforeEach(() => {
    adapter = new ManualTableShippingAdapter(TEST_SHIPPING_RULES);
  });

  it('1.1 Standard and Express service levels quote distinct rates', async () => {
    const stdQuote = await adapter.quote({
      countryCode: 'PK',
      currency: 'PKR',
      subtotalMoney: Money.fromLegacyNumber(1000, 'PKR'),
      serviceLevel: 'standard'
    });

    const expQuote = await adapter.quote({
      countryCode: 'PK',
      currency: 'PKR',
      subtotalMoney: Money.fromLegacyNumber(1000, 'PKR'),
      serviceLevel: 'express'
    });

    expect(stdQuote.shippingAmount).toBe(250);
    expect(expQuote.shippingAmount).toBe(500);
    expect(expQuote.deliveryEstimate.maxDays).toBeLessThan(stdQuote.deliveryEstimate.maxDays);
  });

  it('1.2 Free shipping threshold applies to subtotal above threshold', async () => {
    const freeQuote = await adapter.quote({
      countryCode: 'PK',
      currency: 'PKR',
      subtotalMoney: Money.fromLegacyNumber(6000, 'PKR'), // > 5000 threshold
      serviceLevel: 'standard'
    });

    expect(freeQuote.freeShippingApplied).toBe(true);
    expect(freeQuote.shippingAmount).toBe(0);
  });

  it('1.3 Remote area matches and applies remote rate and days', async () => {
    const remoteQuote = await adapter.quote({
      countryCode: 'PK',
      currency: 'PKR',
      subtotalMoney: Money.fromLegacyNumber(1000, 'PKR'),
      city: 'Gwadar',
      serviceLevel: 'standard'
    });

    expect(remoteQuote.isRemote).toBe(true);
    expect(remoteQuote.shippingAmount).toBe(450);
    expect(remoteQuote.deliveryEstimate.minDays).toBe(5);
    expect(remoteQuote.deliveryEstimate.maxDays).toBe(9);
  });

  it('1.4 Bounded numeric postal range matches and evaluates weight bands', async () => {
    // Within 10000-19999 range with 2000g weight (matches ADD_TO_BASE band of +10.00 USD)
    const quote = await adapter.quote({
      countryCode: 'US',
      currency: 'USD',
      subtotalMoney: Money.fromLegacyNumber(100, 'USD'),
      postalCode: '10001',
      weightGrams: 2000,
      serviceLevel: 'standard'
    });

    // Base 20.00 + 10.00 weight band = 30.00 USD
    expect(quote.shippingAmount).toBe(30);
    expect(quote.currency).toBe('USD');
  });

  it('1.5 Out-of-range postal code or unconfigured country fails closed', async () => {
    // 90210 is outside the configured 10000-19999 range
    await expect(
      adapter.quote({
        countryCode: 'US',
        currency: 'USD',
        subtotalMoney: Money.fromLegacyNumber(100, 'USD'),
        postalCode: '90210',
        serviceLevel: 'standard'
      })
    ).rejects.toThrow('No shipping rules configured for destination country \'US\'');
  });
});

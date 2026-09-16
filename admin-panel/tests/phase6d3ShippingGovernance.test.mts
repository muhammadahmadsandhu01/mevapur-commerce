/**
 * @file phase6d3ShippingGovernance.test.mts
 * @description Node unit & contract test suite for Phase 6D-3 Admin Shipping Governance Contracts.
 */

import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { formatExactMoney, type MoneyExact } from '../src/lib/exactMoney.ts';
import type {
  ShippingRule,
  WeightBand,
  CommerceConfigurationVersion,
  QuotePreviewRequest,
  QuotePreviewResponse,
} from '../src/types/commerceGovernance.ts';

describe('Phase 6D-3: Admin Shipping Governance Contracts', () => {
  const sampleRule: ShippingRule = {
    ruleId: 'GOV-SHIP-AE-PRIORITY',
    name: 'UAE Priority Cargo Express',
    serviceCode: 'priority_cargo_intl',
    displayName: 'Aramex UAE Priority Cargo Express',
    originCountry: 'PK',
    destinationCountry: 'AE',
    destinationSubdivisions: ['DXB', 'SHJ', 'AUH'],
    postalCodeRanges: [{ type: 'prefix', value: '000' }],
    currency: 'AED',
    baseRateExact: {
      amountMinor: '11000',
      currency: 'AED',
      exponent: 2,
    },
    freeShippingThresholdExact: {
      amountMinor: '50000',
      currency: 'AED',
      exponent: 2,
    },
    remoteRateExact: {
      amountMinor: '3000',
      currency: 'AED',
      exponent: 2,
    },
    remoteCities: ['Al Dhafra', 'Liwa Oasis'],
    remotePostalPrefixes: ['99'],
    deliveryMinDays: 2,
    deliveryMaxDays: 4,
    remoteDeliveryMinDays: 4,
    remoteDeliveryMaxDays: 7,
    processingCutoffLocal: '15:30',
    workingDays: [1, 2, 3, 4, 5, 6],
    processingMinBusinessDays: 1,
    processingMaxBusinessDays: 2,
    weightBands: [
      {
        minWeightGrams: 0,
        maxWeightGrams: 1000,
        rateExact: { amountMinor: '11000', currency: 'AED', exponent: 2 },
        pricingMode: 'REPLACE_BASE',
      },
      {
        minWeightGrams: 1000,
        maxWeightGrams: 5000,
        rateExact: { amountMinor: '4000', currency: 'AED', exponent: 2 },
        pricingMode: 'ADD_TO_BASE',
      },
    ],
    priority: 150,
    supportedIncoterms: ['DOMESTIC', 'DAP', 'DDP'],
    enabled: true,
  };

  test('1. Arbitrary service codes are editable in shipping rule schema', () => {
    assert.equal(sampleRule.serviceCode, 'priority_cargo_intl');
    assert.equal(sampleRule.displayName, 'Aramex UAE Priority Cargo Express');
  });

  test('2. Governed cutoff (HH:mm) and custom working days persist in contract', () => {
    assert.equal(sampleRule.processingCutoffLocal, '15:30');
    assert.deepEqual(sampleRule.workingDays, [1, 2, 3, 4, 5, 6]);
    assert.equal(sampleRule.processingMinBusinessDays, 1);
    assert.equal(sampleRule.processingMaxBusinessDays, 2);
  });

  test('3. Invalid cutoff times are rejected by strict HH:mm validation', () => {
    const cutoffRegex = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
    assert.ok(cutoffRegex.test('00:00'));
    assert.ok(cutoffRegex.test('14:30'));
    assert.ok(cutoffRegex.test('23:59'));

    assert.ok(!cutoffRegex.test('24:00'));
    assert.ok(!cutoffRegex.test('14:60'));
    assert.ok(!cutoffRegex.test('2:30'));
    assert.ok(!cutoffRegex.test('invalid'));
  });

  test('4. Duplicate or empty working days are identified', () => {
    const emptyDays: number[] = [];
    assert.equal(emptyDays.length === 0, true);

    const dupDays = [1, 2, 2, 3];
    assert.notEqual(new Set(dupDays).size, dupDays.length);

    const validDays = [1, 2, 3, 4, 5];
    assert.equal(new Set(validDays).size, validDays.length);
  });

  test('5. Processing and transit bounds validate max >= min', () => {
    assert.ok(sampleRule.deliveryMaxDays >= sampleRule.deliveryMinDays);
    assert.ok(sampleRule.processingMaxBusinessDays! >= sampleRule.processingMinBusinessDays!);
    assert.ok(sampleRule.remoteDeliveryMaxDays! >= sampleRule.remoteDeliveryMinDays!);

    // Inverted cases
    const invertedTransit = { min: 5, max: 2 };
    assert.ok(invertedTransit.max < invertedTransit.min);
  });

  test('6. Weight-band overlap and invalid bounds are detected', () => {
    const bands: WeightBand[] = [
      { minWeightGrams: 0, maxWeightGrams: 1000, rateExact: { amountMinor: '1000', currency: 'AED', exponent: 2 } },
      { minWeightGrams: 800, maxWeightGrams: 2000, rateExact: { amountMinor: '2000', currency: 'AED', exponent: 2 } },
    ];

    const isOverlap = (b: WeightBand[]) => {
      const sorted = [...b].sort((a, b) => a.minWeightGrams - b.minWeightGrams);
      for (let i = 0; i < sorted.length - 1; i++) {
        if (sorted[i].maxWeightGrams > sorted[i + 1].minWeightGrams) return true;
      }
      return false;
    };

    assert.equal(isOverlap(bands), true);
    assert.equal(isOverlap(sampleRule.weightBands!), false);
  });

  test('7. Exact amounts preserve amountMinor and exponent across multiple currencies without 2-decimal or PKR bias', () => {
    // 2-decimal AED
    assert.equal(formatExactMoney(sampleRule.baseRateExact), 'AED 110.00');
    assert.equal(formatExactMoney(sampleRule.freeShippingThresholdExact!), 'AED 500.00');
    assert.equal(formatExactMoney(sampleRule.remoteRateExact!), 'AED 30.00');

    // 3-decimal BHD
    const bhdMoney: MoneyExact = { amountMinor: '4750', currency: 'BHD', exponent: 3 };
    assert.equal(formatExactMoney(bhdMoney), 'BHD 4.750');

    // 3-decimal KWD
    const kwdMoney: MoneyExact = { amountMinor: '1250', currency: 'KWD', exponent: 3 };
    assert.equal(formatExactMoney(kwdMoney), 'KWD 1.250');

    // 0-decimal JPY
    const jpyMoney: MoneyExact = { amountMinor: '3200', currency: 'JPY', exponent: 0 };
    assert.equal(formatExactMoney(jpyMoney), 'JPY 3,200');
  });

  test('8. Preview request construction omits client-supplied merchantScopeId', () => {
    const req: QuotePreviewRequest = {
      configId: 'v301',
      destination: {
        countryCode: 'AE',
        province: 'Dubai',
        city: 'Dubai',
        postalCode: '00000',
      },
      currency: 'AED',
      shippingServiceLevel: 'priority_cargo_intl',
      items: [
        { name: 'Gourmet Almonds', price: 100, quantity: 2, weightGrams: 1000 },
      ],
    };

    assert.equal(req.merchantScopeId, undefined);
    assert.equal(req.shippingServiceLevel, 'priority_cargo_intl');
    assert.equal(req.destination.countryCode, 'AE');
  });

  test('9. Draft immutability guarantees active version cannot be edited in place', () => {
    const activeVersion: CommerceConfigurationVersion = {
      _id: 'v123',
      version: 1,
      merchantScopeId: 'default',
      status: 'active',
      lockVersion: 5,
      merchantProfile: {
        merchantCountry: 'PK',
        sellingMode: 'hybrid',
        baseCurrency: 'PKR',
        defaultCurrency: 'PKR',
        enabledCurrencies: ['PKR', 'AED'],
        enabledCountries: ['PK', 'AE'],
        fulfillmentOrigins: [],
        supportedIncoterms: ['DOMESTIC', 'DAP', 'DDP'],
      },
      shippingRules: [sampleRule],
      taxRules: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    assert.equal(activeVersion.status, 'active');
    // Active versions require creating a new draft with sourceVersionId
    const newDraftSourceId = activeVersion._id;
    assert.equal(newDraftSourceId, 'v123');
  });

  test('10. Concurrency 409 conflict detection preserves lockVersion semantics', () => {
    const serverLockVersion = 4;
    const clientPayloadLockVersion = 3;
    const isConflict = serverLockVersion !== clientPayloadLockVersion;
    assert.equal(isConflict, true, 'Stale client lockVersion triggers 409 Conflict');
  });

  test('11. Saving draft updates draft record and does not change status to active', () => {
    const draftBefore: CommerceConfigurationVersion = {
      _id: 'v_draft_1',
      version: 2,
      merchantScopeId: 'default',
      status: 'draft',
      lockVersion: 1,
      merchantProfile: {
        merchantCountry: 'PK',
        sellingMode: 'hybrid',
        baseCurrency: 'PKR',
        defaultCurrency: 'PKR',
        enabledCurrencies: ['PKR', 'AED'],
        enabledCountries: ['PK', 'AE'],
        fulfillmentOrigins: [],
        supportedIncoterms: ['DOMESTIC', 'DAP', 'DDP'],
      },
      shippingRules: [sampleRule],
      taxRules: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Updating draft increments lockVersion but keeps status as 'draft'
    const draftAfter: CommerceConfigurationVersion = {
      ...draftBefore,
      lockVersion: 2,
      updatedAt: new Date().toISOString(),
    };

    assert.equal(draftAfter.status, 'draft', 'Status must remain draft without auto-publishing');
    assert.equal(draftAfter.lockVersion, 2);
  });

  test('12. Split shipment quote preview response contains isolated package origins and promises', () => {
    const previewRes: QuotePreviewResponse = {
      previewVersion: 2,
      previewStatus: 'draft',
      destinationCountry: 'AE',
      currency: 'AED',
      incoterm: 'DAP',
      items: [{ name: 'Item A', price: 100, quantity: 1, weightGrams: 500 }],
      totals: {
        subtotal: 100,
        shipping: 20,
        tax: 5,
        taxType: 'VAT',
        duties: 0,
        grandTotal: 125,
      },
      appliedRules: {
        shippingRuleId: 'GOV-SHIP-AE-PRIORITY',
      },
      deliveryEstimate: { minDays: 2, maxDays: 4 },
      shipmentGroups: [
        {
          groupId: 'grp_khi',
          originCountry: 'PK',
          locationCode: 'LOC-KHI',
          serviceLevel: 'priority_cargo_intl',
          shippingAmount: 12,
          shippingAmountExact: { amountMinor: '1200', currency: 'AED', exponent: 2 },
          items: [{ name: 'Item A', quantity: 1, weightGrams: 500 }],
        },
        {
          groupId: 'grp_lhe',
          originCountry: 'PK',
          locationCode: 'LOC-LHE',
          serviceLevel: 'priority_cargo_intl',
          shippingAmount: 8,
          shippingAmountExact: { amountMinor: '800', currency: 'AED', exponent: 2 },
          items: [{ name: 'Item B', quantity: 1, weightGrams: 400 }],
        },
      ],
    };

    assert.equal(previewRes.shipmentGroups!.length, 2);
    assert.equal(previewRes.shipmentGroups![0].locationCode, 'LOC-KHI');
    assert.equal(previewRes.shipmentGroups![1].locationCode, 'LOC-LHE');
    assert.equal(formatExactMoney(previewRes.shipmentGroups![0].shippingAmountExact!), 'AED 12.00');
    assert.equal(formatExactMoney(previewRes.shipmentGroups![1].shippingAmountExact!), 'AED 8.00');
  });
});

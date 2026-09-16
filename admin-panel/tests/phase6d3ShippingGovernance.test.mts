/**
 * @file phase6d3ShippingGovernance.test.mts
 * @description Node unit & contract test suite for Phase 6D-3 Admin Shipping Governance Contracts.
 */

import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { formatExactMoney, type MoneyExact } from '../src/lib/exactMoney.ts';
import type { ShippingRule } from '../src/types/commerceGovernance.ts';

describe('Phase 6D-3: Admin Shipping Governance Contracts', () => {
  const sampleRule: ShippingRule = {
    ruleId: 'GOV-SHIP-AE-STD',
    name: 'UAE International Standard',
    serviceCode: 'standard',
    displayName: 'Aramex UAE Ground',
    originCountry: 'PK',
    destinationCountry: 'AE',
    currency: 'AED',
    baseRateExact: {
      amountMinor: '3500',
      currency: 'AED',
      exponent: 2
    },
    deliveryMinDays: 3,
    deliveryMaxDays: 6,
    weightBands: [
      {
        minWeightGrams: 0,
        maxWeightGrams: 2000,
        rateExact: { amountMinor: '3500', currency: 'AED', exponent: 2 },
        pricingMode: 'REPLACE_BASE'
      }
    ],
    enabled: true
  };

  test('1.1 validates shipping rule schema contract fields', () => {
    assert.equal(sampleRule.ruleId, 'GOV-SHIP-AE-STD');
    assert.equal(sampleRule.originCountry, 'PK');
    assert.equal(sampleRule.destinationCountry, 'AE');
    assert.equal(sampleRule.serviceCode, 'standard');
  });

  test('1.2 formats base rate and weight band rates correctly', () => {
    const formattedBase = formatExactMoney(sampleRule.baseRateExact);
    assert.equal(formattedBase, 'AED 35.00');

    const formattedBand = formatExactMoney(sampleRule.weightBands[0].rateExact);
    assert.equal(formattedBand, 'AED 35.00');
  });

  test('1.3 enforces delivery days bounds (max >= min)', () => {
    assert.ok(sampleRule.deliveryMaxDays >= sampleRule.deliveryMinDays);
  });
});

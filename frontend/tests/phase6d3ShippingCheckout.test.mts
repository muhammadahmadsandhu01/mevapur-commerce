/**
 * @file phase6d3ShippingCheckout.test.mts
 * @description Node unit & contract test suite for Phase 6D-3 Storefront Shipping & Quoting Contracts.
 */

import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { formatExactMoney, type MoneyExact } from '../src/lib/exactMoney.ts';
import { getCountryPolicy } from '../src/lib/countryPolicy.ts';
import type { AuthoritativeQuote } from '../src/types/commerce.ts';

describe('Phase 6D-3: Storefront Shipping Checkout Contracts', () => {
  const sampleQuote: AuthoritativeQuote = {
    kid: 'v2',
    quoteId: 'QUO-20260916-ABCD12',
    merchantScopeId: 'default',
    configVersionId: 'v301',
    merchantCountry: 'PK',
    fulfillmentOriginCountry: 'PK',
    isDomestic: false,
    incoterm: 'DDP',
    destination: {
      fullName: 'Hamad Al-Maktoum',
      address: 'Sheikh Zayed Road 14',
      city: 'Dubai',
      province: 'Dubai',
      postalCode: '00000',
      countryCode: 'AE',
      country: 'United Arab Emirates',
      phone: '+971501234567'
    },
    currency: 'AED',
    items: [
      {
        productId: '60c72b2f9b1d8b2bad000001',
        name: 'Organic Almonds',
        quantity: 1,
        unitPrice: 100,
        unitPriceExact: { amountMinor: '10000', currency: 'AED', exponent: 2 },
        lineTotal: 100,
        lineTotalExact: { amountMinor: '10000', currency: 'AED', exponent: 2 },
        weightGrams: 500
      }
    ],
    itemsHash: 'abc123hash',
    shipping: {
      selectedOption: {
        serviceLevel: 'standard',
        zoneId: 'GOV-SHIP-AE-STD',
        zoneName: 'Aramex UAE Ground',
        amount: 35,
        amountExact: { amountMinor: '3500', currency: 'AED', exponent: 2 },
        freeShippingApplied: false,
        isRemote: false,
        deliveryEstimate: { minDays: 3, maxDays: 6 }
      },
      availableOptions: [
        {
          serviceLevel: 'standard',
          amount: 35,
          amountExact: { amountMinor: '3500', currency: 'AED', exponent: 2 },
          deliveryEstimate: { minDays: 3, maxDays: 6 }
        },
        {
          serviceLevel: 'express',
          amount: 70,
          amountExact: { amountMinor: '7000', currency: 'AED', exponent: 2 },
          deliveryEstimate: { minDays: 1, maxDays: 3 }
        }
      ]
    },
    taxesAndDuties: {
      taxType: 'VAT',
      taxRatePercent: 5,
      taxAmount: 6.75,
      taxAmountExact: { amountMinor: '675', currency: 'AED', exponent: 2 },
      dutyRatePercent: 5,
      dutyAmount: 6.75,
      dutyAmountExact: { amountMinor: '675', currency: 'AED', exponent: 2 },
      incoterm: 'DDP',
      provenance: 'UAE Federal Tax Authority'
    },
    totals: {
      subtotal: 100,
      subtotalExact: { amountMinor: '10000', currency: 'AED', exponent: 2 },
      discount: 0,
      discountExact: { amountMinor: '0', currency: 'AED', exponent: 2 },
      shipping: 35,
      shippingExact: { amountMinor: '3500', currency: 'AED', exponent: 2 },
      tax: 6.75,
      taxExact: { amountMinor: '675', currency: 'AED', exponent: 2 },
      duties: 6.75,
      dutiesExact: { amountMinor: '675', currency: 'AED', exponent: 2 },
      grandTotal: 148.50,
      grandTotalExact: { amountMinor: '14850', currency: 'AED', exponent: 2 }
    },
    eligiblePaymentMethods: [
      { code: 'stripe', displayName: 'Credit / Debit Card (Stripe)', paymentType: 'online', isPrepaid: true }
    ]
  };

  test('1.1 validates multi-service shipping options in quote contract', () => {
    assert.equal(sampleQuote.shipping.availableOptions.length, 2);
    assert.equal(sampleQuote.shipping.availableOptions[0].serviceLevel, 'standard');
    assert.equal(sampleQuote.shipping.availableOptions[1].serviceLevel, 'express');
  });

  test('1.2 formats shipping amounts with exact precision', () => {
    const stdAmount = formatExactMoney(sampleQuote.shipping.availableOptions[0].amountExact);
    const expAmount = formatExactMoney(sampleQuote.shipping.availableOptions[1].amountExact);

    assert.equal(stdAmount, 'AED 35.00');
    assert.equal(expAmount, 'AED 70.00');
  });

  test('1.3 parses destination country policy for UAE shipping requirements', () => {
    const policy = getCountryPolicy('AE');
    assert.equal(policy.name, 'United Arab Emirates');
    assert.equal(policy.adminPolicy, 'required');
    assert.equal(policy.adminType, 'emirate');
  });
});

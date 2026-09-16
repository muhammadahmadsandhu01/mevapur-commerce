/**
 * @file phase6d3ShippingCheckout.test.mts
 * @description Node unit & contract test suite for Phase 6D-3 Storefront Shipping & Quoting Contracts.
 */

import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { formatExactMoney, type MoneyExact } from '../src/lib/exactMoney.ts';
import { getCountryPolicy } from '../src/lib/countryPolicy.ts';
import { serializeCheckoutPayload, detectMaterialQuoteChange } from '../src/lib/checkoutService.ts';
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
      phone: '+971501234567',
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
        weightGrams: 500,
      },
    ],
    itemsHash: 'abc123hash',
    shipping: {
      selectedOption: {
        serviceLevel: 'standard',
        displayName: 'Standard Ground Shipping',
        zoneId: 'GOV-SHIP-AE-STD',
        zoneName: 'Aramex UAE Ground',
        amount: 35,
        amountExact: { amountMinor: '3500', currency: 'AED', exponent: 2 },
        freeShippingApplied: false,
        isRemote: false,
        deliveryEstimate: { minDays: 3, maxDays: 6 },
        deliveryPromise: {
          dispatchDate: '2026-09-18',
          promiseText: 'Estimated delivery September 21 - September 24',
          isRemote: false,
        },
      },
      availableOptions: [
        {
          serviceLevel: 'standard',
          displayName: 'Standard Ground Shipping',
          amount: 35,
          amountExact: { amountMinor: '3500', currency: 'AED', exponent: 2 },
          deliveryEstimate: { minDays: 3, maxDays: 6 },
          deliveryPromise: {
            dispatchDate: '2026-09-18',
            promiseText: 'Estimated delivery September 21 - September 24',
          },
        },
        {
          serviceLevel: 'express',
          displayName: 'Express Air Priority',
          amount: 70,
          amountExact: { amountMinor: '7000', currency: 'AED', exponent: 2 },
          deliveryEstimate: { minDays: 1, maxDays: 3 },
          deliveryPromise: {
            dispatchDate: '2026-09-17',
            promiseText: 'Estimated delivery September 18 - September 20',
          },
        },
        {
          serviceLevel: 'priority_overnight',
          displayName: 'Priority Overnight Cargo',
          amount: 120,
          amountExact: { amountMinor: '12000', currency: 'AED', exponent: 2 },
          deliveryEstimate: { minDays: 1, maxDays: 1 },
          deliveryPromise: {
            dispatchDate: '2026-09-16',
            promiseText: 'Next business day delivery by 12:00 PM',
          },
        },
      ],
      shipmentGroups: [
        {
          groupId: 'grp_dxb_01',
          originCountry: 'PK',
          locationCode: 'ISB-WH-01',
          serviceLevel: 'standard',
          shippingAmount: 35,
          shippingAmountExact: { amountMinor: '3500', currency: 'AED', exponent: 2 },
          deliveryEstimate: { minDays: 3, maxDays: 6 },
          deliveryPromise: {
            dispatchDate: '2026-09-18',
            promiseText: 'Estimated delivery September 21 - September 24',
          },
          items: [
            {
              productId: '60c72b2f9b1d8b2bad000001',
              quantity: 1,
              weightGrams: 500,
            },
          ],
        },
      ],
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
      provenance: 'UAE Federal Tax Authority',
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
      grandTotal: 148.5,
      grandTotalExact: { amountMinor: '14850', currency: 'AED', exponent: 2 },
    },
    eligiblePaymentMethods: [
      { code: 'stripe', displayName: 'Credit / Debit Card (Stripe)', paymentType: 'online', isPrepaid: true },
    ],
    issuedAt: new Date(Date.now() - 60000).toISOString(),
    expiresAt: new Date(Date.now() + 15 * 60000).toISOString(),
    quoteToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.signedQuoteTokenData',
  };

  test('1.1 validates multi-service shipping options in quote contract', () => {
    assert.equal(sampleQuote.shipping.availableOptions.length, 3);
    assert.equal(sampleQuote.shipping.availableOptions[0].serviceLevel, 'standard');
    assert.equal(sampleQuote.shipping.availableOptions[1].serviceLevel, 'express');
    assert.equal(sampleQuote.shipping.availableOptions[2].serviceLevel, 'priority_overnight');
  });

  test('1.2 formats shipping amounts with exact precision across currencies and exponents', () => {
    const stdAmount = formatExactMoney(sampleQuote.shipping.availableOptions[0].amountExact);
    const expAmount = formatExactMoney(sampleQuote.shipping.availableOptions[1].amountExact);
    const pOvernight = formatExactMoney(sampleQuote.shipping.availableOptions[2].amountExact);

    assert.equal(stdAmount, 'AED 35.00');
    assert.equal(expAmount, 'AED 70.00');
    assert.equal(pOvernight, 'AED 120.00');

    // 3-decimal currency (BHD)
    const bhdShipping: MoneyExact = { amountMinor: '4500', currency: 'BHD', exponent: 3 };
    assert.equal(formatExactMoney(bhdShipping), 'BHD 4.500');

    // 0-decimal currency (JPY)
    const jpyShipping: MoneyExact = { amountMinor: '2500', currency: 'JPY', exponent: 0 };
    assert.equal(formatExactMoney(jpyShipping), 'JPY 2,500');
  });

  test('1.3 parses destination country policy for UAE shipping requirements', () => {
    const policy = getCountryPolicy('AE');
    assert.equal(policy.name, 'United Arab Emirates');
    assert.equal(policy.adminPolicy, 'required');
    assert.equal(policy.adminType, 'emirate');
  });

  test('1.4 supports arbitrary governed shipping service level in payload serialization', () => {
    const payload = serializeCheckoutPayload(
      [{ id: '60c72b2f9b1d8b2bad000001', name: 'Almonds', price: 100, quantity: 2 }],
      {
        fullName: 'Hamad Al-Maktoum',
        phone: '+971501234567',
        address: 'Sheikh Zayed Rd',
        city: 'Dubai',
        province: 'Dubai',
        postalCode: '00000',
        country: 'United Arab Emirates',
        countryCode: 'AE',
      },
      'stripe',
      sampleQuote.quoteToken,
      'priority_overnight',
      undefined,
      'Leave at front desk',
      'AED'
    );

    assert.equal(payload.shippingServiceLevel, 'priority_overnight');
    assert.equal(payload.quoteToken, sampleQuote.quoteToken);
    assert.equal(payload.currency, 'AED');
    assert.equal(payload.paymentMethod, 'stripe');
  });

  test('1.5 detects material quote changes when shipping service or cost changes', () => {
    const modifiedQuote: AuthoritativeQuote = {
      ...sampleQuote,
      shipping: {
        ...sampleQuote.shipping,
        selectedOption: {
          ...sampleQuote.shipping.selectedOption,
          serviceLevel: 'express',
          amount: 70,
          amountExact: { amountMinor: '7000', currency: 'AED', exponent: 2 },
        },
      },
      totals: {
        ...sampleQuote.totals,
        shipping: 70,
        shippingExact: { amountMinor: '7000', currency: 'AED', exponent: 2 },
        grandTotal: 183.5,
        grandTotalExact: { amountMinor: '18350', currency: 'AED', exponent: 2 },
      },
    };

    const result = detectMaterialQuoteChange(sampleQuote, modifiedQuote);
    assert.equal(result.changed, true);
  });

  test('1.6 verifies multi-origin split shipment group contracts', () => {
    const splitQuote: AuthoritativeQuote = {
      ...sampleQuote,
      shipping: {
        ...sampleQuote.shipping,
        shipmentGroups: [
          {
            groupId: 'grp_01',
            originCountry: 'PK',
            locationCode: 'LHE-FC',
            serviceLevel: 'standard',
            shippingAmount: 20,
            shippingAmountExact: { amountMinor: '2000', currency: 'AED', exponent: 2 },
            items: [{ productId: '60c72b2f9b1d8b2bad000001', quantity: 1 }],
          },
          {
            groupId: 'grp_02',
            originCountry: 'AE',
            locationCode: 'DXB-HUB',
            serviceLevel: 'express',
            shippingAmount: 15,
            shippingAmountExact: { amountMinor: '1500', currency: 'AED', exponent: 2 },
            items: [{ productId: '60c72b2f9b1d8b2bad000002', quantity: 2 }],
          },
        ],
      },
    };

    assert.equal(splitQuote.shipping.shipmentGroups!.length, 2);
    assert.equal(splitQuote.shipping.shipmentGroups![0].originCountry, 'PK');
    assert.equal(splitQuote.shipping.shipmentGroups![1].originCountry, 'AE');
    assert.equal(formatExactMoney(splitQuote.shipping.shipmentGroups![0].shippingAmountExact), 'AED 20.00');
    assert.equal(formatExactMoney(splitQuote.shipping.shipmentGroups![1].shippingAmountExact), 'AED 15.00');
  });
});

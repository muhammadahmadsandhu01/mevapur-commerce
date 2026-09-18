/**
 * Phase 6D-4D Storefront Tax, Customs, Incoterm & Exact Money Contract Test Suite
 * Validates exact-money scale separation, authoritative quote replacement,
 * DDP vs DAP semantics, and material quote change detection.
 */

import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { formatExactMoney } from '../src/lib/exactMoney.ts';
import { detectMaterialQuoteChange } from '../src/lib/checkoutService.ts';
import type { AuthoritativeQuote } from '../src/types/commerce.ts';

describe('Phase 6D-4D: Storefront Tax & Customs Checkout Contracts', () => {

  describe('1. Exact Money Formatting Parity & Edge Cases', () => {
    test('formats zero with exact currency decimal scale', () => {
      assert.equal(formatExactMoney({ amountMinor: '0', currency: 'USD' }), 'USD 0.00');
      assert.equal(formatExactMoney({ amountMinor: '0', currency: 'PKR' }), 'PKR 0.00');
      assert.equal(formatExactMoney({ amountMinor: '0', currency: 'JPY' }), 'JPY 0');
      assert.equal(formatExactMoney({ amountMinor: '0', currency: 'KWD' }), 'KWD 0.000');
      assert.equal(formatExactMoney({ amountMinor: '0', currency: 'CLF' }), 'CLF 0.0000');
    });

    test('formats exponent 0 currencies correctly', () => {
      assert.equal(formatExactMoney({ amountMinor: '12000', currency: 'JPY' }), 'JPY 12,000');
      assert.equal(formatExactMoney({ amountMinor: '450000', currency: 'KRW' }), 'KRW 450,000');
    });

    test('formats exponent 2 currencies correctly', () => {
      assert.equal(formatExactMoney({ amountMinor: '1999', currency: 'USD' }), 'USD 19.99');
      assert.equal(formatExactMoney({ amountMinor: '250000', currency: 'PKR' }), 'PKR 2,500.00');
      assert.equal(formatExactMoney({ amountMinor: '100', currency: 'EUR' }), 'EUR 1.00');
    });

    test('formats exponent 3 currencies correctly', () => {
      assert.equal(formatExactMoney({ amountMinor: '12345', currency: 'BHD' }), 'BHD 12.345');
      assert.equal(formatExactMoney({ amountMinor: '500', currency: 'KWD' }), 'KWD 0.500');
    });

    test('formats exponent 4 currencies correctly', () => {
      assert.equal(formatExactMoney({ amountMinor: '123456', currency: 'CLF' }), 'CLF 12.3456');
      assert.equal(formatExactMoney({ amountMinor: '500', currency: 'UYW' }), 'UYW 0.0500');
    });

    test('formats 18-digit numbers without floating point loss', () => {
      const huge18Digit = '999888777666555444';
      const formatted = formatExactMoney({ amountMinor: huge18Digit, currency: 'USD' });
      assert.equal(formatted, 'USD 9,998,887,776,665,554.44');
    });

    test('formats negative minor strings safely', () => {
      assert.equal(formatExactMoney({ amountMinor: '-2500', currency: 'USD' }), '-USD 25.00');
      assert.equal(formatExactMoney({ amountMinor: '-99', currency: 'EUR' }), '-EUR 0.99');
    });

    test('fails safely when currency is unknown and no explicit exponent provided', () => {
      assert.throws(() => formatExactMoney({ amountMinor: '100', currency: 'XYZ' }), /Unknown currency code/);
      assert.equal(formatExactMoney({ amountMinor: '100', currency: 'XYZ', exponent: 2 }), 'XYZ 1.00');
    });
  });

  const baseQuote: AuthoritativeQuote = {
    kid: 'key_1',
    quoteId: 'QUO-20260918-001',
    merchantScopeId: 'default',
    configVersionId: 'v4',
    merchantCountry: 'PK',
    fulfillmentOriginCountry: 'PK',
    isDomestic: false,
    incoterm: 'DDP',
    destination: {
      fullName: 'Ahmad Sandhu',
      address: 'Downtown Dubai',
      city: 'Dubai',
      countryCode: 'AE',
      country: 'United Arab Emirates',
    },
    currency: 'AED',
    items: [
      {
        productId: 'prod_1',
        name: 'Pistachios 1kg',
        quantity: 1,
        unitPrice: 100,
        unitPriceExact: { amountMinor: '10000', currency: 'AED', exponent: 2 },
        lineTotal: 100,
        lineTotalExact: { amountMinor: '10000', currency: 'AED', exponent: 2 },
      },
    ],
    itemsHash: 'hash_1',
    coupon: null,
    shipping: {
      selectedOption: {
        serviceLevel: 'standard',
        displayName: 'Standard Cargo',
        amount: 20,
        amountExact: { amountMinor: '2000', currency: 'AED', exponent: 2 },
        freeShippingApplied: false,
      },
      availableOptions: [],
    },
    taxesAndDuties: {
      taxType: 'VAT',
      taxRatePercent: 5,
      taxAmount: 5,
      taxAmountExact: { amountMinor: '500', currency: 'AED', exponent: 2 },
      additionalTaxAmountExact: { amountMinor: '500', currency: 'AED', exponent: 2 },
      dutyRatePercent: 5,
      dutyAmount: 5,
      dutyAmountExact: { amountMinor: '500', currency: 'AED', exponent: 2 },
      incoterm: 'DDP',
      provenance: 'tax_rule_ae_1',
    },
    totals: {
      subtotal: 100,
      subtotalExact: { amountMinor: '10000', currency: 'AED', exponent: 2 },
      discount: 0,
      discountExact: { amountMinor: '0', currency: 'AED', exponent: 2 },
      shipping: 20,
      shippingExact: { amountMinor: '2000', currency: 'AED', exponent: 2 },
      tax: 5,
      taxExact: { amountMinor: '500', currency: 'AED', exponent: 2 },
      duties: 5,
      dutiesExact: { amountMinor: '500', currency: 'AED', exponent: 2 },
      grandTotal: 130,
      grandTotalExact: { amountMinor: '13000', currency: 'AED', exponent: 2 },
    },
    eligiblePaymentMethods: [],
    issuedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 600000).toISOString(),
    quoteToken: 'token_abc_123',
  };

  describe('2. Material Quote Change Detection', () => {

    test('detects material change when tax amounts differ upon revalidation', () => {
      const updatedQuote: AuthoritativeQuote = {
        ...baseQuote,
        totals: {
          ...baseQuote.totals,
          tax: 10,
          taxExact: { amountMinor: '1000', currency: 'AED', exponent: 2 },
          grandTotal: 135,
          grandTotalExact: { amountMinor: '13500', currency: 'AED', exponent: 2 },
        },
      };

      const result = detectMaterialQuoteChange(baseQuote, updatedQuote);
      assert.equal(result.changed, true);
    });

    test('detects material change when incoterm changes from DDP to DAP', () => {
      const updatedQuote: AuthoritativeQuote = {
        ...baseQuote,
        incoterm: 'DAP',
        taxesAndDuties: {
          ...baseQuote.taxesAndDuties,
          incoterm: 'DAP',
        },
      };

      const result = detectMaterialQuoteChange(baseQuote, updatedQuote);
      assert.equal(result.changed, true);
    });

    test('returns changed=false when quotes have identical exact totals and terms', () => {
      const result = detectMaterialQuoteChange(baseQuote, { ...baseQuote });
      assert.equal(result.changed, false);
    });
  });

  describe('3. De-Minimis Decision & Type Guard Contracts', () => {
    test('isDeMinimisBasis type guard strictly validates valid bases and rejects invalid strings/aliases', async () => {
      const { isDeMinimisBasis } = await import('../src/types/commerce.ts');

      assert.equal(isDeMinimisBasis('GOODS_VALUE'), true);
      assert.equal(isDeMinimisBasis('CUSTOMS_VALUE'), true);
      assert.equal(isDeMinimisBasis('CIF'), true);

      assert.equal(isDeMinimisBasis('CIF_VALUE'), false);
      assert.equal(isDeMinimisBasis('SUBTOTAL'), false);
      assert.equal(isDeMinimisBasis('NONE'), false);
      assert.equal(isDeMinimisBasis(''), false);
      assert.equal(isDeMinimisBasis(null), false);
      assert.equal(isDeMinimisBasis(undefined), false);
      assert.equal(isDeMinimisBasis(123), false);
    });

    test('validates storefront authoritative quote with deMinimis decisions', () => {
      const quoteWithDeMinimis: AuthoritativeQuote = {
        ...baseQuote,
        dutyDeMinimis: {
          configured: true,
          exempt: true,
          basisType: 'CIF',
          basisAmountExact: { amountMinor: '10000', currency: 'AED', exponent: 2 },
          thresholdExact: { amountMinor: '30000', currency: 'AED', exponent: 2 },
          comparison: 'LTE',
          reasonCode: 'DE_MINIMIS_EXEMPT',
        },
        taxDeMinimis: {
          configured: false,
          exempt: false,
          reasonCode: 'NO_THRESHOLD_CONFIGURED',
        },
      };

      assert.equal(quoteWithDeMinimis.dutyDeMinimis?.exempt, true);
      assert.equal(quoteWithDeMinimis.dutyDeMinimis?.basisType, 'CIF');
      assert.equal(quoteWithDeMinimis.dutyDeMinimis?.reasonCode, 'DE_MINIMIS_EXEMPT');
      assert.equal(quoteWithDeMinimis.taxDeMinimis?.configured, false);
    });
  });
});

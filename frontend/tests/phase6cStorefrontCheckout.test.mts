/**
 * Phase 6C Storefront Global Checkout Unit & Contract Test Suite
 * Covers Exact Money Arithmetic, Country-Aware Address Serialization,
 * Idempotency Key Stability, Quote Race Protection, and Material Quote Change Policies.
 */

import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatExactMoney,
  normalizeMinorString,
  isExactMoneyEqual,
  getCurrencyExponent,
  type MoneyExact
} from '../src/lib/exactMoney.ts';
import {
  getCountryPolicy,
  getSubdivisionLabel,
  getAllCountryCodes,
  REGISTRY_PROVENANCE,
} from '../src/lib/countryPolicy.ts';
import {
  getOrCreateCheckoutAttempt,
  clearCheckoutAttempt,
  detectMaterialQuoteChange,
  serializeCheckoutPayload,
} from '../src/lib/checkoutService.ts';
import type { AuthoritativeQuote } from '../src/types/commerce.ts';

describe('Phase 6C: Storefront Global Checkout Contracts', () => {

  describe('1. Exact Money Formatting & Precision Safety', () => {
    test('formats zero-decimal currencies (JPY, CLP, KRW) without decimal points', () => {
      assert.equal(formatExactMoney({ amountMinor: '5000', currency: 'JPY' }), 'JPY 5,000');
      assert.equal(formatExactMoney({ amountMinor: 12500, currency: 'KRW' }), 'KRW 12,500');
      assert.equal(formatExactMoney({ amountMinor: BigInt(300), currency: 'CLP' }), 'CLP 300');
    });

    test('formats standard two-decimal currencies (USD, EUR, PKR, GBP, AED)', () => {
      assert.equal(formatExactMoney({ amountMinor: '142000', currency: 'PKR' }), 'PKR 1,420.00');
      assert.equal(formatExactMoney({ amountMinor: '99', currency: 'USD' }), 'USD 0.99');
      assert.equal(formatExactMoney({ amountMinor: '5', currency: 'EUR' }), 'EUR 0.05');
      assert.equal(formatExactMoney({ amountMinor: '0', currency: 'AED' }), 'AED 0.00');
    });

    test('formats three-decimal currencies (KWD, BHD, OMR, JOD)', () => {
      assert.equal(formatExactMoney({ amountMinor: '123456', currency: 'KWD' }), 'KWD 123.456');
      assert.equal(formatExactMoney({ amountMinor: '75', currency: 'BHD' }), 'BHD 0.075');
    });

    test('formats four-decimal currencies (CLF, UYW)', () => {
      assert.equal(formatExactMoney({ amountMinor: '123456', currency: 'CLF' }), 'CLF 12.3456');
      assert.equal(formatExactMoney({ amountMinor: '500', currency: 'UYW' }), 'UYW 0.0500');
    });

    test('supports locale-aware grouping and decimal separators (en-US, de-DE, en-IN)', () => {
      // en-US: 1,234,567.89
      const usFormatted = formatExactMoney({ amountMinor: '123456789', currency: 'USD' }, { locale: 'en-US' });
      assert.equal(usFormatted, 'USD 1,234,567.89');

      // de-DE: 1.234.567,89 (with currency placement according to German locale)
      const deFormatted = formatExactMoney({ amountMinor: '123456789', currency: 'EUR' }, { locale: 'de-DE' });
      assert.ok(deFormatted.includes('1.234.567,89'));

      // en-IN: Lakh / Crore grouping: 12,34,567.89
      const inFormatted = formatExactMoney({ amountMinor: '123456789', currency: 'INR' }, { locale: 'en-IN' });
      assert.equal(inFormatted, 'INR 12,34,567.89');
    });

    test('handles values beyond JavaScript Number.MAX_SAFE_INTEGER without precision loss', () => {
      const hugeMinor = '900719925474099199999'; // Far beyond 2^53 - 1
      const formatted = formatExactMoney({ amountMinor: hugeMinor, currency: 'USD' });
      assert.equal(formatted, 'USD 9,007,199,254,740,991,999.99');
    });

    test('handles negative monetary amounts safely', () => {
      assert.equal(formatExactMoney({ amountMinor: '-5000', currency: 'USD' }), '-USD 50.00');
      assert.equal(formatExactMoney({ amountMinor: '-5', currency: 'USD' }), '-USD 0.05');
    });

    test('rejects malformed minor amount strings', () => {
      assert.throws(() => normalizeMinorString('12.34'), /Invalid minor amount format/);
      assert.throws(() => normalizeMinorString('abc'), /Invalid minor amount format/);
      assert.throws(() => normalizeMinorString('1e5'), /Invalid minor amount format/);
      assert.throws(() => normalizeMinorString(NaN), /Invalid integer minor amount/);
    });

    test('deterministic exact money equality comparison', () => {
      const a: MoneyExact = { amountMinor: '10000', currency: 'PKR', exponent: 2 };
      const b: MoneyExact = { amountMinor: '10000', currency: 'PKR', exponent: 2 };
      const c: MoneyExact = { amountMinor: '10001', currency: 'PKR', exponent: 2 };
      const d: MoneyExact = { amountMinor: '10000', currency: 'USD', exponent: 2 };

      assert.equal(isExactMoneyEqual(a, b), true);
      assert.equal(isExactMoneyEqual(a, c), false);
      assert.equal(isExactMoneyEqual(a, d), false);
    });

    test('fails safely for unknown currency when no explicit server exponent is supplied', () => {
      assert.throws(
        () => formatExactMoney({ amountMinor: '1000', currency: 'UNKNOWN_CURRENCY' }),
        /Unknown currency code/
      );
      assert.throws(
        () => getCurrencyExponent('XYZ'),
        /Unknown currency code/
      );
    });

    test('formats unknown currency correctly when explicit server exponent is supplied', () => {
      const formatted = formatExactMoney({ amountMinor: '1000', currency: 'XYZ', exponent: 3 });
      assert.equal(formatted, 'XYZ 1.000');
    });
  });

  describe('2. Country-Aware Address Handling & Full ISO-3166-1 Registry', () => {
    test('adapts subdivision labels and requirement per country policy', () => {
      const ae = getCountryPolicy('AE');
      assert.equal(ae.adminPolicy, 'required');
      assert.equal(ae.adminType, 'emirate');
      assert.equal(getSubdivisionLabel(ae), 'Emirate');

      const us = getCountryPolicy('US');
      assert.equal(us.adminPolicy, 'required');
      assert.equal(us.adminType, 'state');
      assert.equal(getSubdivisionLabel(us), 'State');

      const pk = getCountryPolicy('PK');
      assert.equal(pk.adminPolicy, 'required');
      assert.equal(pk.adminType, 'province');
      assert.equal(getSubdivisionLabel(pk), 'Province');

      const de = getCountryPolicy('DE');
      assert.equal(de.adminType, 'state');
      assert.equal(de.callingCode, '+49');
    });

    test('adapts postal code policies per country policy', () => {
      const ae = getCountryPolicy('AE');
      assert.equal(ae.postalPolicy, 'not_used');

      const gb = getCountryPolicy('GB');
      assert.equal(gb.postalPolicy, 'required');

      const pk = getCountryPolicy('PK');
      assert.equal(pk.postalPolicy, 'required');

      const kw = getCountryPolicy('KW');
      assert.equal(kw.postalPolicy, 'optional');
    });

    test('preserves calling codes and formats without fabricating', () => {
      const ae = getCountryPolicy('AE');
      assert.equal(ae.callingCode, '+971');
      const gb = getCountryPolicy('GB');
      assert.equal(gb.callingCode, '+44');
      const pk = getCountryPolicy('PK');
      assert.equal(pk.callingCode, '+92');
    });

    test('guarantees complete 249 ISO-3166-1 country coverage and standards metadata only', () => {
      const allCodes = getAllCountryCodes();
      assert.equal(allCodes.length, 249, 'Must contain exactly 249 ISO 3166-1 country records');
      assert.equal(REGISTRY_PROVENANCE.identityStandard, 'ISO 3166-1');
      assert.equal(REGISTRY_PROVENANCE.telecomStandard, 'ITU-T E.164');

      // Verify sample coverage across regions
      for (const code of ['PK', 'AE', 'US', 'GB', 'SA', 'DE', 'JP', 'CA', 'AU', 'BH', 'KW', 'OM', 'QA']) {
        const p = getCountryPolicy(code);
        assert.ok(p.code, `Missing code for ${code}`);
        assert.ok(p.name, `Missing name for ${code}`);
        assert.ok(p.callingCode, `Missing callingCode for ${code}`);
        assert.ok(['required', 'optional', 'not_used', 'unknown'].includes(p.postalPolicy));
        assert.ok(['required', 'optional', 'unknown'].includes(p.adminPolicy));
      }
    });

    test('serializes checkout address without country or PKR hardcoding', () => {
      const payload = serializeCheckoutPayload(
        [{ productId: '60c72b2f9b1d8b2bad000001', quantity: 2 }],
        {
          fullName: 'Jane Doe',
          phone: '+447911123456',
          address: '10 Downing Street',
          city: 'London',
          province: 'Greater London',
          postalCode: 'SW1A 2AA',
          country: 'United Kingdom',
          countryCode: 'GB',
        },
        'stripe',
        'sample-quote-token',
        'express',
        'PROMO10',
        'Leave at reception',
        'GBP'
      );

      assert.equal(payload.currency, 'GBP');
      assert.equal(payload.shippingAddress.countryCode, 'GB');
      assert.equal(payload.shippingAddress.country, 'United Kingdom');
      assert.equal(payload.shippingServiceLevel, 'express');
      assert.equal(payload.quoteToken, 'sample-quote-token');
    });
  });

  describe('3. Durable CheckoutAttempt Idempotency & Re-quote Stability', () => {
    test('preserves the same idempotency key across multiple quote re-fetches for identical intent', () => {
      clearCheckoutAttempt();

      const items = [{ productId: 'prod_1', quantity: 1 }];
      const address = {
        fullName: 'Ali Khan',
        phone: '+923001234567',
        address: 'Main Boulevard',
        city: 'Lahore',
        countryCode: 'PK',
      };

      const attempt1 = getOrCreateCheckoutAttempt(items, address, 'cod', 'standard', undefined);
      const key1 = attempt1.idempotencyKey;

      // Re-fetch or retry with exact same intent
      const attempt2 = getOrCreateCheckoutAttempt(items, address, 'cod', 'standard', undefined);
      assert.equal(attempt2.idempotencyKey, key1);
      assert.equal(attempt2.attemptId, attempt1.attemptId);
    });

    test('rotates idempotency key when customer modifies cart, address, or payment method', () => {
      clearCheckoutAttempt();

      const items1 = [{ productId: 'prod_1', quantity: 1 }];
      const address1 = {
        fullName: 'Ali Khan',
        phone: '+923001234567',
        address: 'Main Boulevard',
        city: 'Lahore',
        countryCode: 'PK',
      };

      const attempt1 = getOrCreateCheckoutAttempt(items1, address1, 'cod', 'standard');
      const key1 = attempt1.idempotencyKey;

      // Customer changes item quantity
      const items2 = [{ productId: 'prod_1', quantity: 2 }];
      const attempt2 = getOrCreateCheckoutAttempt(items2, address1, 'cod', 'standard');
      assert.notEqual(attempt2.idempotencyKey, key1);

      // Customer changes payment method
      const attempt3 = getOrCreateCheckoutAttempt(items2, address1, 'stripe', 'standard');
      assert.notEqual(attempt3.idempotencyKey, attempt2.idempotencyKey);
    });
  });

  describe('4. Material Quote Change Policy & Offsetting Shifts', () => {
    const baseQuote: AuthoritativeQuote = {
      kid: 'v1',
      quoteId: 'QUO-20260914-112233',
      merchantScopeId: 'default',
      configVersionId: 'v1',
      merchantCountry: 'PK',
      fulfillmentOriginCountry: 'PK',
      isDomestic: true,
      incoterm: 'DOMESTIC',
      destination: {
        countryCode: 'PK',
        country: 'Pakistan',
        address: 'Street 1',
        city: 'Lahore',
      },
      currency: 'PKR',
      items: [],
      itemsHash: 'hash1',
      shipping: {
        selectedOption: {
          serviceLevel: 'standard',
          amount: 250,
          amountExact: { amountMinor: '25000', currency: 'PKR', exponent: 2 },
          freeShippingApplied: false,
          deliveryEstimate: { minDays: 3, maxDays: 5 },
        },
        availableOptions: [],
      },
      taxesAndDuties: {
        taxType: 'GST',
        taxRatePercent: 17,
        taxAmount: 170,
        taxAmountExact: { amountMinor: '17000', currency: 'PKR', exponent: 2 },
        dutyRatePercent: 0,
        dutyAmount: 0,
        dutyAmountExact: { amountMinor: '0', currency: 'PKR', exponent: 2 },
        incoterm: 'DOMESTIC',
        provenance: 'governed',
      },
      totals: {
        subtotal: 1000,
        subtotalExact: { amountMinor: '100000', currency: 'PKR', exponent: 2 },
        discount: 0,
        discountExact: { amountMinor: '0', currency: 'PKR', exponent: 2 },
        shipping: 250,
        shippingExact: { amountMinor: '25000', currency: 'PKR', exponent: 2 },
        tax: 170,
        taxExact: { amountMinor: '17000', currency: 'PKR', exponent: 2 },
        duties: 0,
        dutiesExact: { amountMinor: '0', currency: 'PKR', exponent: 2 },
        grandTotal: 1420,
        grandTotalExact: { amountMinor: '142000', currency: 'PKR', exponent: 2 },
      },
      eligiblePaymentMethods: [{ code: 'cod', displayName: 'Cash on Delivery', paymentType: 'offline', isPrepaid: false }],
      issuedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 900000).toISOString(),
      quoteToken: 'token-123',
    };

    test('detects unchanged quote terms as non-material', () => {
      const result = detectMaterialQuoteChange(baseQuote, { ...baseQuote });
      assert.equal(result.changed, false);
    });

    test('detects grand total payable change as material', () => {
      const updatedQuote = {
        ...baseQuote,
        totals: {
          ...baseQuote.totals,
          grandTotalExact: { amountMinor: '150000', currency: 'PKR', exponent: 2 },
        },
      };
      const result = detectMaterialQuoteChange(baseQuote, updatedQuote);
      assert.equal(result.changed, true);
    });

    test('detects offsetting changes (tax increases by 500, discount increases by 500, grand total unchanged) as material', () => {
      const offsettingQuote: AuthoritativeQuote = {
        ...baseQuote,
        totals: {
          ...baseQuote.totals,
          discountExact: { amountMinor: '5000', currency: 'PKR', exponent: 2 }, // Discount +50.00
          taxExact: { amountMinor: '22000', currency: 'PKR', exponent: 2 }, // Tax +50.00 (from 17000 to 22000)
          grandTotalExact: { amountMinor: '142000', currency: 'PKR', exponent: 2 }, // Grand Total UNCHANGED
        },
      };
      const result = detectMaterialQuoteChange(baseQuote, offsettingQuote);
      assert.equal(result.changed, true);
    });

    test('detects Incoterm modification (DOMESTIC -> DDP) as material', () => {
      const updatedQuote = {
        ...baseQuote,
        taxesAndDuties: {
          ...baseQuote.taxesAndDuties,
          incoterm: 'DDP' as const,
        },
      };
      const result = detectMaterialQuoteChange(baseQuote, updatedQuote);
      assert.equal(result.changed, true);
      assert.match(result.reason || '', /Incoterm/i);
    });

    test('detects currency change as material', () => {
      const updatedQuote = {
        ...baseQuote,
        currency: 'USD',
      };
      const result = detectMaterialQuoteChange(baseQuote, updatedQuote);
      assert.equal(result.changed, true);
      assert.match(result.reason || '', /Currency/i);
    });

    test('detects destination country change as material', () => {
      const updatedQuote = {
        ...baseQuote,
        destination: {
          ...baseQuote.destination,
          countryCode: 'AE',
          country: 'United Arab Emirates',
        },
      };
      const result = detectMaterialQuoteChange(baseQuote, updatedQuote);
      assert.equal(result.changed, true);
      assert.match(result.reason || '', /country/i);
    });

    test('detects tax classification modification as material', () => {
      const updatedQuote: AuthoritativeQuote = {
        ...baseQuote,
        taxesAndDuties: {
          ...baseQuote.taxesAndDuties,
          taxType: 'SALES_TAX',
        },
      };
      const result = detectMaterialQuoteChange(baseQuote, updatedQuote);
      assert.equal(result.changed, true);
      assert.match(result.reason || '', /Tax classification/i);
    });
  });
});

/**
 * @file checkout-quote.unit.test.js
 * @description Unit tests for TaxDutyEngine, ManualTableShippingAdapter, and CheckoutQuoteService.
 */

const { Money, MoneyMapper } = require('../../../modules/commerce');
const TaxDutyEngine = require('../../../services/checkout/TaxDutyEngine');
const ManualTableShippingAdapter = require('../../../services/checkout/shipping/ManualTableShippingAdapter');
const CheckoutQuoteService = require('../../../services/checkout/CheckoutQuoteService');

describe('Phase 6A: Unit Tests — Global Checkout Eligibility & Quote Engines', () => {
  describe('1. TaxDutyEngine Unit Tests', () => {
    test('1.1 Computes exact 0% tax for domestic PK route', () => {
      const subtotal = Money.fromDecimal('5000.00', 'PKR');
      const result = TaxDutyEngine.calculate({
        destinationCountry: 'PK',
        originCountry: 'PK',
        taxableSubtotal: subtotal,
        currency: 'PKR'
      });

      expect(result.isDomestic).toBe(true);
      expect(result.taxRatePercent).toBe(0);
      expect(result.taxAmount).toBe(0);
      expect(MoneyMapper.toMoney(result.taxAmountExact).amountMinor).toBe(0n);
      expect(result.dutyAmount).toBe(0);
      expect(MoneyMapper.toMoney(result.dutyAmountExact).amountMinor).toBe(0n);
      expect(result.incoterm).toBe('DOMESTIC');
    });

    test('1.2 Computes exact 5% VAT and 5% Duty for international AE (DDP) route', () => {
      const subtotal = Money.fromDecimal('100.00', 'AED');
      const shipping = Money.fromDecimal('20.00', 'AED');
      const result = TaxDutyEngine.calculate({
        destinationCountry: 'AE',
        originCountry: 'PK',
        taxableSubtotal: subtotal,
        shippingAmount: shipping,
        currency: 'AED'
      });

      expect(result.isDomestic).toBe(false);
      expect(result.taxType).toBe('VAT');
      expect(result.taxRatePercent).toBe(5.0);
      // Tax: 5% on 100 AED = 5.00 AED (500 minor units)
      expect(result.taxAmount).toBe(5.0);
      expect(MoneyMapper.toMoney(result.taxAmountExact).amountMinor).toBe(500n);
      // Duty (DDP on CIF: 100 + 20 = 120 AED * 5% = 6.00 AED)
      expect(result.dutyAmount).toBe(6.0);
      expect(MoneyMapper.toMoney(result.dutyAmountExact).amountMinor).toBe(600n);
      expect(result.incoterm).toBe('DDP');
    });

    test('1.3 Computes exact 20% VAT and 2.5% Duty for international GB (DDP) route', () => {
      const subtotal = Money.fromDecimal('200.00', 'GBP');
      const shipping = Money.fromDecimal('30.00', 'GBP');
      const result = TaxDutyEngine.calculate({
        destinationCountry: 'GB',
        originCountry: 'PK',
        taxableSubtotal: subtotal,
        shippingAmount: shipping,
        currency: 'GBP'
      });

      expect(result.taxRatePercent).toBe(20.0);
      // Tax: 20% on 200 GBP = 40.00 GBP
      expect(result.taxAmount).toBe(40.0);
      expect(MoneyMapper.toMoney(result.taxAmountExact).amountMinor).toBe(4000n);
      // Duty (DDP on CIF: 230 GBP * 2.5% = 5.75 GBP = 575 minor units)
      expect(result.dutyAmount).toBe(5.75);
      expect(MoneyMapper.toMoney(result.dutyAmountExact).amountMinor).toBe(575n);
      expect(result.incoterm).toBe('DDP');
    });

    test('1.4 Computes exact tax and duties for 3-decimal currencies (e.g. KWD)', () => {
      const subtotal = Money.fromDecimal('10.000', 'KWD');
      const shipping = Money.fromDecimal('2.000', 'KWD');

      const customEngine = new TaxDutyEngine.TaxDutyEngine({
        KW: {
          taxType: 'VAT',
          standardRatePercent: 5.0,
          requiresTax: true,
          dutyPercent: 5.0,
          incoterm: 'DDP'
        }
      });

      const result = customEngine.calculate({
        destinationCountry: 'KW',
        originCountry: 'PK',
        taxableSubtotal: subtotal,
        shippingAmount: shipping,
        currency: 'KWD'
      });

      // 5% of 10.000 KWD = 0.500 KWD = 500 minor units in exponent 3
      expect(result.taxAmount).toBe(0.5);
      expect(MoneyMapper.toMoney(result.taxAmountExact).amountMinor).toBe(500n);
      // 5% of 12.000 KWD = 0.600 KWD = 600 minor units in exponent 3
      expect(result.dutyAmount).toBe(0.6);
      expect(MoneyMapper.toMoney(result.dutyAmountExact).amountMinor).toBe(600n);
    });

    test('1.5 Computes exact tax and duties for 0-decimal currencies (e.g. JPY)', () => {
      const subtotal = Money.fromDecimal('10000', 'JPY');
      const shipping = Money.fromDecimal('1500', 'JPY');

      const customEngine = new TaxDutyEngine.TaxDutyEngine({
        JP: {
          taxType: 'CONSUMPTION_TAX',
          standardRatePercent: 10.0,
          requiresTax: true,
          dutyPercent: 0,
          incoterm: 'DAP'
        }
      });

      const result = customEngine.calculate({
        destinationCountry: 'JP',
        originCountry: 'PK',
        taxableSubtotal: subtotal,
        shippingAmount: shipping,
        currency: 'JPY'
      });

      // 10% of 10000 JPY = 1000 JPY
      expect(result.taxAmount).toBe(1000);
      expect(MoneyMapper.toMoney(result.taxAmountExact).amountMinor).toBe(1000n);
      expect(result.dutyAmount).toBe(0);
      expect(MoneyMapper.toMoney(result.dutyAmountExact).amountMinor).toBe(0n);
    });

    test('1.6 Fails closed on missing destination or mismatched currency', () => {
      expect(() => TaxDutyEngine.calculate({
        destinationCountry: '',
        taxableSubtotal: Money.fromDecimal('100', 'PKR')
      })).toThrow();

      expect(() => TaxDutyEngine.calculate({
        destinationCountry: 'AE',
        taxableSubtotal: Money.fromDecimal('100', 'USD'),
        currency: 'AED'
      })).toThrow();
    });
  });

  describe('2. CheckoutQuoteService Item & Signature Hash Verification', () => {
    test('2.1 Deterministic items hashing produces identical hash for identical items regardless of input array order', () => {
      const itemsA = [
        { product: '6aa6e8711cbcb735551fdc28', variantId: '6aa6e8711cbcb735551fdc29', quantity: 2, unitPriceExact: { amountMinor: 1000n } },
        { product: '6aa6e8711cbcb735551fdc30', variantId: null, quantity: 1, unitPriceExact: { amountMinor: 2500n } }
      ];

      const itemsB = [
        { product: '6aa6e8711cbcb735551fdc30', variantId: null, quantity: 1, unitPriceExact: { amountMinor: 2500n } },
        { product: '6aa6e8711cbcb735551fdc28', variantId: '6aa6e8711cbcb735551fdc29', quantity: 2, unitPriceExact: { amountMinor: 1000n } }
      ];

      const hashA = CheckoutQuoteService.hashItems(itemsA);
      const hashB = CheckoutQuoteService.hashItems(itemsB);

      expect(hashA).toBe(hashB);
      expect(hashA.length).toBe(64);
    });

    test('2.2 Mutated quantity or price alters items hash', () => {
      const itemsA = [
        { product: '6aa6e8711cbcb735551fdc28', variantId: null, quantity: 2, unitPriceExact: { amountMinor: 1000n } }
      ];
      const itemsB = [
        { product: '6aa6e8711cbcb735551fdc28', variantId: null, quantity: 3, unitPriceExact: { amountMinor: 1000n } }
      ];

      expect(CheckoutQuoteService.hashItems(itemsA)).not.toBe(CheckoutQuoteService.hashItems(itemsB));
    });

    test('2.3 Sign and verify quote token integrity', () => {
      const quotePayload = {
        quoteId: 'QUO-20260913-ABCD1234EF56',
        merchantCountry: 'PK',
        destination: { countryCode: 'AE' },
        currency: 'AED',
        itemsHash: 'a'.repeat(64),
        totals: {
          grandTotalExact: { amountMinor: 15000n },
          shippingExact: { amountMinor: 2000n },
          taxExact: { amountMinor: 500n },
          dutiesExact: { amountMinor: 600n }
        },
        issuedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 900000).toISOString()
      };

      const sig = CheckoutQuoteService.signQuote(quotePayload);
      quotePayload.quoteToken = Buffer.from(JSON.stringify({
        quoteId: quotePayload.quoteId,
        quoteSignature: sig,
        issuedAt: quotePayload.issuedAt,
        expiresAt: quotePayload.expiresAt
      })).toString('base64url');

      expect(CheckoutQuoteService.verifyQuoteIntegrity(quotePayload)).toBe(true);

      // Altering total amount minor should fail integrity
      const tamperedQuote = {
        ...quotePayload,
        totals: {
          ...quotePayload.totals,
          grandTotalExact: { amountMinor: 10000n } // tampered
        }
      };

      expect(() => CheckoutQuoteService.verifyQuoteIntegrity(tamperedQuote)).toThrow(/tampered|invalid/i);
    });

    test('2.4 Rejects expired quote', () => {
      const quotePayload = {
        quoteId: 'QUO-20260913-EXPIRED',
        merchantCountry: 'PK',
        destination: { countryCode: 'PK' },
        currency: 'PKR',
        itemsHash: 'b'.repeat(64),
        totals: {
          grandTotalExact: { amountMinor: 5000n },
          shippingExact: { amountMinor: 250n },
          taxExact: { amountMinor: 0n },
          dutiesExact: { amountMinor: 0n }
        },
        issuedAt: new Date(Date.now() - 1800000).toISOString(),
        expiresAt: new Date(Date.now() - 60000).toISOString() // 1 min ago
      };

      const sig = CheckoutQuoteService.signQuote(quotePayload);
      quotePayload.quoteToken = Buffer.from(JSON.stringify({
        quoteId: quotePayload.quoteId,
        quoteSignature: sig,
        issuedAt: quotePayload.issuedAt,
        expiresAt: quotePayload.expiresAt
      })).toString('base64url');

      expect(() => CheckoutQuoteService.verifyQuoteIntegrity(quotePayload)).toThrow(/expired/i);
    });
  });
});

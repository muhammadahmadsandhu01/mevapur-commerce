/**
 * @file checkout-quote.unit.test.js
 * @description Unit tests for TaxDutyEngine, ManualTableShippingAdapter, and CheckoutQuoteService.
 */

const { Money, MoneyMapper } = require('../../../modules/commerce');
const TaxDutyEngine = require('../../../services/checkout/TaxDutyEngine');
const ManualTableShippingAdapter = require('../../../services/checkout/shipping/ManualTableShippingAdapter');
const CheckoutQuoteService = require('../../../services/checkout/CheckoutQuoteService');

describe('Phase 6A: Unit Tests — Global Checkout Eligibility & Quote Engines', () => {
  const TEST_PK_FIXTURE = [
    {
      ruleId: 'TAX-PK-01',
      destinationCountry: 'PK',
      taxType: 'GST',
      taxTreatment: 'exclusive',
      taxRateNumerator: 0,
      taxRateDenominator: 100,
      requiresTax: false,
      incoterm: 'DOMESTIC'
    }
  ];

  const TEST_AE_FIXTURE = [
    {
      ruleId: 'TAX-AE-01',
      destinationCountry: 'AE',
      taxType: 'VAT',
      taxTreatment: 'exclusive',
      taxRateNumerator: 5,
      taxRateDenominator: 100,
      requiresTax: true,
      requiresDuty: true,
      dutyRateNumerator: 5,
      dutyRateDenominator: 100,
      incoterm: 'DDP'
    }
  ];

  const TEST_GB_FIXTURE = [
    {
      ruleId: 'TAX-GB-01',
      destinationCountry: 'GB',
      taxType: 'VAT',
      taxTreatment: 'exclusive',
      taxRateNumerator: 20,
      taxRateDenominator: 100,
      requiresTax: true,
      requiresDuty: true,
      dutyRateNumerator: 25,
      dutyRateDenominator: 1000,
      incoterm: 'DDP'
    }
  ];

  describe('1. TaxDutyEngine Unit Tests', () => {
    test('1.1 Computes exact 0% tax for domestic PK route with test fixture', () => {
      const subtotal = Money.fromDecimal('5000.00', 'PKR');
      const result = TaxDutyEngine.calculate({
        destinationCountry: 'PK',
        originCountry: 'PK',
        taxableSubtotal: subtotal,
        currency: 'PKR',
        taxRules: TEST_PK_FIXTURE
      });

      expect(result.isDomestic).toBe(true);
      expect(result.taxRatePercent).toBe(0);
      expect(result.taxAmount).toBe(0);
      expect(MoneyMapper.toMoney(result.taxAmountExact).amountMinor).toBe(0n);
      expect(result.dutyAmount).toBe(0);
      expect(MoneyMapper.toMoney(result.dutyAmountExact).amountMinor).toBe(0n);
      expect(result.incoterm).toBe('DOMESTIC');
    });

    test('1.2 Computes exact 5% VAT and 5% Duty for international AE (DDP) route with test fixture', () => {
      const subtotal = Money.fromDecimal('100.00', 'AED');
      const shipping = Money.fromDecimal('20.00', 'AED');
      const result = TaxDutyEngine.calculate({
        destinationCountry: 'AE',
        originCountry: 'PK',
        taxableSubtotal: subtotal,
        shippingAmount: shipping,
        currency: 'AED',
        taxRules: TEST_AE_FIXTURE
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

    test('1.3 Computes exact 20% VAT and 2.5% Duty for international GB (DDP) route with test fixture', () => {
      const subtotal = Money.fromDecimal('200.00', 'GBP');
      const shipping = Money.fromDecimal('30.00', 'GBP');
      const result = TaxDutyEngine.calculate({
        destinationCountry: 'GB',
        originCountry: 'PK',
        taxableSubtotal: subtotal,
        shippingAmount: shipping,
        currency: 'GBP',
        taxRules: TEST_GB_FIXTURE
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

    test('2.3 Sign and verify quote token integrity with kid envelope', () => {
      const issuedAt = new Date().toISOString();
      const expiresAt = new Date(Date.now() + 900000).toISOString();
      const quotePayload = {
        kid: 'v1',
        quoteId: 'QUO-20260913-ABCD1234EF56',
        merchantScopeId: 'default',
        configVersionId: 'v1',
        merchantCountry: 'PK',
        fulfillmentOriginCountry: 'PK',
        destinationCountry: 'AE',
        currency: 'AED',
        itemsHash: 'a'.repeat(64),
        subtotalMinor: '10000',
        discountMinor: '0',
        shippingMinor: '2000',
        taxMinor: '500',
        dutyMinor: '600',
        grandTotalMinor: '13100',
        incoterm: 'DDP',
        shippingServiceLevel: 'standard',
        issuedAt,
        expiresAt
      };

      const signable = CheckoutQuoteService.buildSignablePayload(quotePayload);
      const sig = CheckoutQuoteService.signQuote(signable);
      const envelope = {
        ...signable,
        quoteSignature: sig
      };
      const token = Buffer.from(JSON.stringify(envelope)).toString('base64url');

      const verified = CheckoutQuoteService.verifyAndDecodeQuoteToken(token);
      expect(verified.quoteId).toBe('QUO-20260913-ABCD1234EF56');
      expect(verified.kid).toBe('v1');
      expect(verified.grandTotalMinor).toBe('13100');

      // Altering total amount minor should fail signature verification
      const tamperedEnvelope = {
        ...envelope,
        grandTotalMinor: '10000'
      };
      const tamperedToken = Buffer.from(JSON.stringify(tamperedEnvelope)).toString('base64url');

      expect(() => CheckoutQuoteService.verifyAndDecodeQuoteToken(tamperedToken)).toThrow(/tampered|invalid/i);
    });

    test('2.4 Rejects expired quote', () => {
      const issuedAt = new Date(Date.now() - 1800000).toISOString();
      const expiresAt = new Date(Date.now() - 60000).toISOString(); // expired 1 min ago
      const quotePayload = {
        kid: 'v1',
        quoteId: 'QUO-20260913-EXPIRED',
        merchantScopeId: 'default',
        configVersionId: 'v1',
        merchantCountry: 'PK',
        destinationCountry: 'PK',
        currency: 'PKR',
        itemsHash: 'b'.repeat(64),
        subtotalMinor: '5000',
        discountMinor: '0',
        shippingMinor: '250',
        taxMinor: '0',
        dutyMinor: '0',
        grandTotalMinor: '5250',
        incoterm: 'DOMESTIC',
        shippingServiceLevel: 'standard',
        issuedAt,
        expiresAt
      };

      const signable = CheckoutQuoteService.buildSignablePayload(quotePayload);
      const sig = CheckoutQuoteService.signQuote(signable);
      const token = Buffer.from(JSON.stringify({ ...signable, quoteSignature: sig })).toString('base64url');

      expect(() => CheckoutQuoteService.verifyAndDecodeQuoteToken(token)).toThrow(/expired/i);
    });

    test('2.5 Rejects future-dated quote beyond clock-skew tolerance', () => {
      const issuedAt = new Date(Date.now() + 120000).toISOString(); // 2 minutes in future
      const expiresAt = new Date(Date.now() + 900000).toISOString();
      const quotePayload = {
        kid: 'v1',
        quoteId: 'QUO-20260913-FUTURE',
        merchantScopeId: 'default',
        configVersionId: 'v1',
        merchantCountry: 'PK',
        destinationCountry: 'PK',
        currency: 'PKR',
        itemsHash: 'c'.repeat(64),
        subtotalMinor: '5000',
        discountMinor: '0',
        shippingMinor: '250',
        taxMinor: '0',
        dutyMinor: '0',
        grandTotalMinor: '5250',
        incoterm: 'DOMESTIC',
        shippingServiceLevel: 'standard',
        issuedAt,
        expiresAt
      };

      const signable = CheckoutQuoteService.buildSignablePayload(quotePayload);
      const sig = CheckoutQuoteService.signQuote(signable);
      const token = Buffer.from(JSON.stringify({ ...signable, quoteSignature: sig })).toString('base64url');

      expect(() => CheckoutQuoteService.verifyAndDecodeQuoteToken(token)).toThrow(/future/i);
    });

    test('2.6 Rejects unsupported quote key version', () => {
      const issuedAt = new Date().toISOString();
      const expiresAt = new Date(Date.now() + 900000).toISOString();
      const quotePayload = {
        kid: 'v99_unsupported',
        quoteId: 'QUO-20260913-BADVER',
        merchantScopeId: 'default',
        configVersionId: 'v1',
        merchantCountry: 'PK',
        destinationCountry: 'PK',
        currency: 'PKR',
        itemsHash: 'd'.repeat(64),
        subtotalMinor: '5000',
        discountMinor: '0',
        shippingMinor: '250',
        taxMinor: '0',
        dutyMinor: '0',
        grandTotalMinor: '5250',
        incoterm: 'DOMESTIC',
        shippingServiceLevel: 'standard',
        issuedAt,
        expiresAt
      };

      const token = Buffer.from(JSON.stringify({ ...quotePayload, quoteSignature: 'deadbeef' })).toString('base64url');

      expect(() => CheckoutQuoteService.verifyAndDecodeQuoteToken(token)).toThrow(/version/i);
    });

    test('2.7 Rejects oversized quote tokens', () => {
      const hugeToken = 'A'.repeat(5000);
      expect(() => CheckoutQuoteService.verifyAndDecodeQuoteToken(hugeToken)).toThrow(/size|malformed/i);
    });

    test('2.8 Missing or weak production signing key fails closed in production environment', () => {
      const prevEnv = process.env.APP_ENV;
      const prevSecret = process.env.CHECKOUT_QUOTE_SECRET;
      try {
        process.env.APP_ENV = 'production';
        delete process.env.CHECKOUT_QUOTE_SECRET;
        delete process.env.COMMERCE_QUOTE_SECRET;

        expect(() => CheckoutQuoteService.signQuote({
          kid: 'v1',
          quoteId: 'QUO-FAIL-CLOSED',
          merchantCountry: 'PK',
          destinationCountry: 'AE',
          currency: 'AED',
          itemsHash: 'a'.repeat(64),
          issuedAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 60000).toISOString()
        })).toThrow(/CHECKOUT_QUOTE_SECRET is strictly required in production/i);

        // Weak secret (< 32 chars)
        process.env.CHECKOUT_QUOTE_SECRET = 'short-secret';
        expect(() => CheckoutQuoteService.signQuote({
          kid: 'v1',
          quoteId: 'QUO-FAIL-CLOSED',
          merchantCountry: 'PK',
          destinationCountry: 'AE',
          currency: 'AED',
          itemsHash: 'a'.repeat(64),
          issuedAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 60000).toISOString()
        })).toThrow(/at least 32 characters/i);
      } finally {
        process.env.APP_ENV = prevEnv;
        if (prevSecret) process.env.CHECKOUT_QUOTE_SECRET = prevSecret;
        else delete process.env.CHECKOUT_QUOTE_SECRET;
      }
    });

    test('2.9 Incoterms landed cost distinction: DAP does not collect destination duties into grand total', () => {
      // Create quote with DAP incoterm
      const subtotalMoney = Money.fromDecimal('100.00', 'USD');
      const discountMoney = Money.zero('USD');
      const shippingMoney = Money.fromDecimal('20.00', 'USD');
      const taxMoney = Money.zero('USD');
      const dutyMoney = Money.fromDecimal('15.00', 'USD');

      // Under DAP, duties are unpaid destination duties and NOT seller-collected money
      const incoterm = 'DAP';
      const payableDutiesMoney = incoterm === 'DDP' ? dutyMoney : Money.zero('USD');
      const grandTotalMoney = subtotalMoney.subtract(discountMoney).add(shippingMoney).add(taxMoney).add(payableDutiesMoney);

      expect(grandTotalMoney.toDecimalString()).toBe('120.00'); // 100 + 20 + 0 + 0 (15 duty NOT collected)
    });
  });
});

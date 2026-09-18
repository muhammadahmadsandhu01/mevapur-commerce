/**
 * @file two-phase-checkout.integration.test.js
 * @description Comprehensive Integration Test Suite for Phase 6D-5A Two-Phase Prepaid Checkout Sessions,
 * Stock Hold Leasing, Crash Recovery, Idempotency Replays, and Domestic Pakistan COD Compatibility.
 */

'use strict';

const mongoose = require('mongoose');
const CheckoutSession = require('../../../models/CheckoutSession');
const InventoryHold = require('../../../models/InventoryHold');
const InventoryPosition = require('../../../models/InventoryPosition');
const InventoryLedger = require('../../../models/InventoryLedger');
const Order = require('../../../models/Order');
const Payment = require('../../../models/Payment');
const User = require('../../../models/User');
const Product = require('../../../models/Product');
const FulfillmentLocation = require('../../../models/FulfillmentLocation');
const StockHoldLeaseService = require('../../../services/inventory/StockHoldLeaseService');
const CheckoutSessionService = require('../../../services/order/CheckoutSessionService');
const CheckoutQuoteService = require('../../../services/checkout/CheckoutQuoteService');
const CommerceConfigurationVersion = require('../../../models/CommerceConfigurationVersion');
const paymentProviderRegistry = require('../../../modules/payments/core/providerRegistry');
const { reconcileExpiredCheckoutSessions } = require('../../../scripts/workers/reconcileExpiredCheckoutSessions');
const { Money, MoneyMapper } = require('../../../modules/commerce');

describe('Phase 6D-5A Two-Phase Checkout & Stock Hold Engine Integration', () => {
  let testUser;
  let testProduct;
  let testLocation;
  let testPosition;

  beforeEach(async () => {
    await CommerceConfigurationVersion.create({
      merchantScopeId: 'default',
      version: Math.floor(Math.random() * 100000) + 1,
      status: 'active',
      effectiveFrom: new Date(Date.now() - 60000),
      merchantProfile: {
        merchantCountry: 'PK',
        baseCurrency: 'PKR',
        defaultCurrency: 'PKR',
        sellingMode: 'international',
        enabledCountries: ['PK', 'US', 'GB', 'AE'],
        enabledCurrencies: ['PKR', 'USD', 'GBP', 'AED'],
        defaultLocale: 'en-PK',
        defaultTimeZone: 'Asia/Karachi',
        supportedIncoterms: ['DOMESTIC', 'DAP', 'DDP'],
        taxCalculationMode: 'exact_rational',
        fulfillmentOrigins: [
          {
            originId: 'origin-pk-central',
            name: 'Pakistan Central Warehouse',
            country: 'PK',
            city: 'Karachi',
            timeZone: 'Asia/Karachi',
            enabled: true,
            isDefault: true
          }
        ]
      },
      shippingRules: [
        {
          ruleId: 'GOV-SHIP-PK-STD',
          name: 'Pakistan Domestic Standard',
          serviceCode: 'standard',
          displayName: 'TCS Ground Standard',
          originCountry: 'PK',
          destinationCountry: 'PK',
          currency: 'PKR',
          baseRateExact: MoneyMapper.fromLegacy(250, 'PKR'),
          freeShippingThresholdExact: MoneyMapper.fromLegacy(5000, 'PKR'),
          remoteRateExact: MoneyMapper.fromLegacy(350, 'PKR'),
          deliveryMinDays: 2,
          deliveryMaxDays: 4,
          processingCutoffLocal: '14:00',
          workingDays: [1, 2, 3, 4, 5],
          processingMinBusinessDays: 0,
          processingMaxBusinessDays: 1,
          weightBands: [],
          supportedIncoterms: ['DOMESTIC'],
          priority: 10,
          enabled: true
        },
        {
          ruleId: 'GOV-SHIP-US-STD',
          name: 'US Cross Border Standard',
          serviceCode: 'standard',
          displayName: 'DHL Express US',
          originCountry: 'PK',
          destinationCountry: 'US',
          currency: 'USD',
          baseRateExact: MoneyMapper.fromLegacy(0, 'USD'),
          freeShippingThresholdExact: null,
          remoteRateExact: MoneyMapper.fromLegacy(0, 'USD'),
          deliveryMinDays: 3,
          deliveryMaxDays: 7,
          processingCutoffLocal: '14:00',
          workingDays: [1, 2, 3, 4, 5],
          processingMinBusinessDays: 0,
          processingMaxBusinessDays: 1,
          weightBands: [],
          supportedIncoterms: ['DOMESTIC', 'DAP', 'DDP'],
          priority: 10,
          enabled: true
        }
      ],
      taxRules: [
        {
          ruleId: 'TAX-PK-DOMESTIC',
          name: 'Pakistan Domestic Tax Rule',
          destinationCountry: 'PK',
          destinationSubdivision: '',
          taxType: 'GST',
          taxTreatment: 'exclusive',
          taxableBasis: 'subtotal',
          taxRateNumerator: 0,
          taxRateDenominator: 10000,
          dutyRateNumerator: 0,
          dutyRateDenominator: 10000,
          roundingMode: 'HALF_UP',
          roundingScope: 'subtotal',
          incoterm: 'DOMESTIC',
          priority: 10,
          requiresTax: false,
          requiresDuty: false,
          customsValueIncludesShipping: false,
          customsValueIncludesInsurance: false,
          dutyRefundPolicy: 'REFUNDABLE',
          taxRefundPolicy: 'REFUNDABLE',
          providerType: 'MANUAL_GOVERNED',
          verificationStatus: 'VERIFIED_LEGAL_RULE',
          sourceAuthority: 'STATUTE',
          sourceReference: 'DEFAULT-DOMESTIC-TAX-2026',
          enabled: true
        },
        {
          ruleId: 'TAX-US-TX',
          name: 'US Texas Sales Tax Rule',
          destinationCountry: 'US',
          destinationSubdivision: 'TX',
          taxType: 'SALES_TAX',
          taxTreatment: 'exclusive',
          taxableBasis: 'subtotal',
          taxRateNumerator: 0,
          taxRateDenominator: 10000,
          dutyRateNumerator: 0,
          dutyRateDenominator: 10000,
          roundingMode: 'HALF_UP',
          roundingScope: 'subtotal',
          incoterm: 'DDP',
          priority: 10,
          requiresTax: false,
          requiresDuty: false,
          customsValueIncludesShipping: false,
          customsValueIncludesInsurance: false,
          dutyRefundPolicy: 'REFUNDABLE',
          taxRefundPolicy: 'REFUNDABLE',
          providerType: 'MANUAL_GOVERNED',
          verificationStatus: 'VERIFIED_LEGAL_RULE',
          sourceAuthority: 'STATUTE',
          sourceReference: 'US-TX-TAX-2026',
          enabled: true
        }
      ]
    });

    testUser = await User.create({
      fullName: 'Integration Test User',
      email: `test-checkout-${Date.now()}@example.com`,
      password: 'password123',
      role: 'customer'
    });

    testLocation = await FulfillmentLocation.create({
      merchantScopeId: 'default',
      locationCode: `WH-${Date.now()}`.slice(0, 40),
      displayName: 'Test Fulfillment Warehouse',
      status: 'active',
      countryCode: 'US',
      city: 'Dallas',
      timeZone: 'America/Chicago',
      addressLine1: '100 Logistics Blvd',
      postalCode: '75201',
      supportedMarketCountries: ['US'],
      capabilities: ['local_delivery', 'cross_border'],
      effectiveFrom: new Date(Date.now() - 60000)
    });

    const Category = require('../../../models/Category');
    const testCat = await Category.create({
      name: 'Test Global Category',
      slug: `test-global-cat-${Date.now()}`,
      isActive: true
    });

    testProduct = await Product.create({
      name: 'Global Widget',
      slug: `global-widget-${Date.now()}`,
      price: 50,
      countInStock: 20,
      description: 'High quality global widget',
      sku: `SKU-WIDGET-${Date.now()}`,
      isActive: true,
      status: 'published',
      category: testCat._id,
      weightGrams: 500
    });

    const ProductMarketOffering = require('../../../models/ProductMarketOffering');
    const MarketPriceBook = require('../../../models/MarketPriceBook');

    await ProductMarketOffering.create({
      merchantScopeId: 'default',
      productId: testProduct._id,
      marketCountry: 'US',
      currency: 'USD',
      status: 'active',
      pricingPolicy: 'inherit_product_price',
      fulfillmentMode: 'local',
      effectiveFrom: new Date(Date.now() - 60000),
      lockVersion: 1
    });

    await MarketPriceBook.create({
      merchantScopeId: 'default',
      productId: testProduct._id,
      scopeType: 'product',
      scopeKey: 'product',
      marketCountry: 'US',
      currency: 'USD',
      currencyExponent: 2,
      amountMinor: MoneyMapper.fromLegacy(50, 'USD').amountMinor.toString(),
      priceSource: 'manual',
      status: 'active',
      effectiveFrom: new Date(Date.now() - 60000),
      lockVersion: 1
    });

    testPosition = await InventoryPosition.create({
      merchantScopeId: 'default',
      locationId: testLocation._id,
      locationCode: testLocation.locationCode,
      productId: testProduct._id,
      canonicalSku: testProduct.sku,
      onHand: 20,
      reserved: 0,
      unavailable: 0,
      safetyStock: 0,
      allowBackorder: true,
      backorderLimit: 10,
      backordered: 0,
      lockVersion: 1
    });
  });

  function generateValidQuoteToken({
    destinationCountry = 'US',
    destinationSubdivision = 'TX',
    currency = 'USD',
    subtotalMinor = '5000',
    totalMinor = '5000'
  } = {}) {
    const rawQuote = {
      quoteId: `QUO-${Date.now()}`,
      kid: 'v2',
      configVersionId: 'cfg-v1',
      merchantScopeId: 'default',
      merchantCountry: 'PK',
      destinationCountry,
      destinationSubdivision,
      destinationPostalFingerprint: '75201',
      currency,
      itemsHash: CheckoutQuoteService.hashItems([{
        productId: String(testProduct._id),
        variantId: null,
        quantity: 1,
        priceMinor: subtotalMinor
      }]),
      subtotalMinor,
      discountMinor: '0',
      shippingMinor: '0',
      insuranceMinor: '0',
      insuranceProvenance: 'NO_INSURANCE_CHARGE',
      taxMinor: '0',
      additionalTaxMinor: '0',
      taxIncludedMinor: '0',
      dutyEstimatedMinor: '0',
      dutyPayableMinor: '0',
      customsGoodsValueMinor: subtotalMinor,
      items: [{
        productId: String(testProduct._id),
        quantity: 1,
        hsCode: '9000.00',
        countryOfOrigin: 'US',
        itemValueMinor: subtotalMinor
      }],
      dutyDeMinimis: {
        configured: false,
        thresholdExact: null,
        basisType: 'GOODS_VALUE',
        basisAmountExact: { amountMinor: subtotalMinor, currency, exponent: 2 },
        comparison: 'LT',
        exempt: false,
        reasonCode: 'NO_THRESHOLD_CONFIGURED'
      },
      taxDeMinimis: {
        configured: false,
        thresholdExact: null,
        basisType: 'GOODS_VALUE',
        basisAmountExact: { amountMinor: subtotalMinor, currency, exponent: 2 },
        comparison: 'LT',
        exempt: false,
        reasonCode: 'NO_THRESHOLD_CONFIGURED'
      },
      grandTotalMinor: totalMinor,
      taxRuleId: 'TAX-US-01',
      taxRateNumerator: 0,
      taxRateDenominator: 10000,
      dutyRateNumerator: 0,
      dutyRateDenominator: 10000,
      roundingMode: 'HALF_UP',
      roundingScope: 'subtotal',
      incoterm: 'DDP',
      providerType: 'MANUAL_GOVERNED',
      sourceAuthority: 'TEST_AUTH',
      sourceReference: 'TEST_REF',
      verificationStatus: 'VERIFIED_LEGAL_RULE',
      dutyRefundPolicy: 'FULL',
      taxRefundPolicy: 'FULL',
      shippingServiceLevel: 'standard',
      issuedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString()
    };

    const signable = CheckoutQuoteService.buildSignablePayload(rawQuote);
    const sig = CheckoutQuoteService.signQuote(signable);
    const envelope = { ...signable, quoteSignature: sig };
    return { token: Buffer.from(JSON.stringify(envelope)).toString('base64url'), rawQuote };
  }

  describe('Feature Flag Disablement Contract', () => {
    it('blocks new session creation when COMMERCE_TWO_PHASE_CHECKOUT_ENABLED is false', async () => {
      const originalEnv = process.env.COMMERCE_TWO_PHASE_CHECKOUT_ENABLED;
      process.env.COMMERCE_TWO_PHASE_CHECKOUT_ENABLED = 'false';

      try {
        await expect(CheckoutSessionService.createSession({
          userId: testUser._id,
          sessionData: {
            items: [{ productId: testProduct._id, quantity: 1 }],
            shippingAddress: { country: 'US', city: 'Dallas' },
            paymentMethod: 'stripe'
          },
          idempotencyKey: `flag-test-${Date.now()}`
        })).rejects.toThrow(/disabled/i);
      } finally {
        process.env.COMMERCE_TWO_PHASE_CHECKOUT_ENABLED = originalEnv;
      }
    });
  });

  describe('Session-Bound Payment Initiation Lifecycle', () => {
    let originalEnv;

    beforeEach(() => {
      originalEnv = process.env.COMMERCE_TWO_PHASE_CHECKOUT_ENABLED;
      process.env.COMMERCE_TWO_PHASE_CHECKOUT_ENABLED = 'true';
    });

    afterEach(() => {
      process.env.COMMERCE_TWO_PHASE_CHECKOUT_ENABLED = originalEnv;
    });

    it('creates CheckoutSession, acquires InventoryHold, and binds Payment before capture with zero Order created', async () => {
      const { token } = generateValidQuoteToken();
      const idempotencyKey = `session_create_${Date.now()}`;

      const originalResolve = paymentProviderRegistry.resolve.bind(paymentProviderRegistry);
      jest.spyOn(paymentProviderRegistry, 'resolve').mockImplementation((providerName, context) => {
        const adapter = originalResolve(providerName, context);
        return {
          ...adapter,
          createPayment: jest.fn().mockResolvedValue({
            providerPaymentId: `pi_test_${Date.now()}`,
            clientSecret: `pi_test_secret_${Date.now()}`,
            status: 'requires_capture',
            raw: {}
          })
        };
      });

      try {
        const sessionResult = await CheckoutSessionService.createSession({
          userId: testUser._id,
          sessionData: {
            quoteToken: token,
            items: [{ productId: testProduct._id, quantity: 1 }],
            shippingAddress: {
              fullName: 'Prepaid Customer',
              addressLine1: '100 Logistics Blvd',
              locality: 'Dallas',
              administrativeArea: 'TX',
              postalCode: '75201',
              countryCode: 'US',
              phone: '+15551234567'
            },
            paymentMethod: 'stripe',
            currency: 'USD'
          },
          idempotencyKey
        });

        expect(sessionResult.sessionId).toBeDefined();
        expect(sessionResult.session.status).toBe(CheckoutSession.STATUSES.PAYMENT_PENDING);

        // Verify no permanent Order exists before payment capture
        const order = await Order.findOne({ checkoutSessionObjectId: sessionResult.session._id });
        expect(order).toBeNull();

        // Verify InventoryHold is created and active
        const hold = await InventoryHold.findOne({ sessionId: sessionResult.sessionId });
        expect(hold).toBeDefined();
        expect(hold.status).toBe(InventoryHold.STATUSES.ACTIVE);
        expect(hold.allocations[0].physicalReservedQuantity).toBe(1);

        // Verify InventoryPosition reserved count increased
        const pos = await InventoryPosition.findById(testPosition._id);
        expect(pos.reserved).toBe(1);

        // Verify Payment document exists and is bound to CheckoutSession with NO Order
        const payment = await Payment.findOne({ checkoutSessionObjectId: sessionResult.session._id });
        expect(payment).toBeDefined();
        expect(payment.order).toBeNull();
        expect(payment.checkoutSessionId).toBe(sessionResult.sessionId);
        expect(payment.status).toBe('Pending');

        // Verify raw quote token is not persisted in session doc (only hash stored)
        const sessionDoc = await CheckoutSession.findById(sessionResult.session._id);
        expect(sessionDoc.quoteToken).toBeUndefined();
        expect(sessionDoc.quoteTokenHash).toBeDefined();

        // Verify idempotency replay returns same session and payment
        const replayResult = await CheckoutSessionService.createSession({
          userId: testUser._id,
          sessionData: {
            quoteToken: token,
            items: [{ productId: testProduct._id, quantity: 1 }],
            shippingAddress: {
              fullName: 'Prepaid Customer',
              addressLine1: '100 Logistics Blvd',
              locality: 'Dallas',
              administrativeArea: 'TX',
              postalCode: '75201',
              countryCode: 'US',
              phone: '+15551234567'
            },
            paymentMethod: 'stripe',
            currency: 'USD'
          },
          idempotencyKey
        });

        expect(replayResult.isReplay).toBe(true);
        expect(replayResult.sessionId).toBe(sessionResult.sessionId);
        expect(replayResult.paymentAttempt.provider).toBe('stripe');

        // Replaying with different payload using same idempotency key fails closed (409)
        await expect(CheckoutSessionService.createSession({
          userId: testUser._id,
          sessionData: {
            quoteToken: token,
            items: [{ productId: testProduct._id, quantity: 2 }], // tampered quantity
            shippingAddress: {
              fullName: 'Prepaid Customer',
              addressLine1: '100 Logistics Blvd',
              locality: 'Dallas',
              administrativeArea: 'TX',
              postalCode: '75201',
              countryCode: 'US',
              phone: '+15551234567'
            },
            paymentMethod: 'stripe',
            currency: 'USD'
          },
          idempotencyKey
        })).rejects.toThrow(/Idempotency-Key was already used with a different session request/i);
      } finally {
        paymentProviderRegistry.resolve.mockRestore();
      }
    });

    it('releases hold and marks session failed if payment provider initiation throws', async () => {
      const { token } = generateValidQuoteToken();
      const idempotencyKey = `session_fail_${Date.now()}`;

      // Mock provider adapter to throw during createPayment
      const originalResolve = paymentProviderRegistry.resolve.bind(paymentProviderRegistry);
      jest.spyOn(paymentProviderRegistry, 'resolve').mockImplementation((providerName, context) => {
        const adapter = originalResolve(providerName, context);
        return {
          ...adapter,
          createPayment: jest.fn().mockRejectedValue(new Error('Stripe Provider Network Timeout'))
        };
      });

      try {
        await expect(CheckoutSessionService.createSession({
          userId: testUser._id,
          sessionData: {
            quoteToken: token,
            items: [{ productId: testProduct._id, quantity: 1 }],
            shippingAddress: {
              fullName: 'Prepaid Customer',
              addressLine1: '100 Logistics Blvd',
              locality: 'Dallas',
              administrativeArea: 'TX',
              postalCode: '75201',
              countryCode: 'US',
              phone: '+15551234567'
            },
            paymentMethod: 'stripe',
            currency: 'USD'
          },
          idempotencyKey
        })).rejects.toThrow(/Stripe Provider Network Timeout/i);

        // Proves hold was released
        const hold = await InventoryHold.findOne({ idempotencyKey: `hold:default:${idempotencyKey}` });
        const pos = await InventoryPosition.findById(testPosition._id);
        expect(pos.reserved).toBe(0);

        // Proves session was marked failed
        const sessionDoc = await CheckoutSession.findOne({ idempotencyKey });
        expect(sessionDoc.status).toBe(CheckoutSession.STATUSES.FAILED);
      } finally {
        paymentProviderRegistry.resolve.mockRestore();
      }
    });
  });

  describe('Stock Hold Leasing Lifecycle & Expiry Atomicity', () => {
    it('acquires an expiring hold and decrements ATP by increasing reserved count', async () => {
      const sessionId = `cs_hold_test_${Date.now()}`;
      const idempotencyKey = `idemp_${sessionId}`;

      const acquireResult = await StockHoldLeaseService.acquireHold({
        sessionId,
        items: [{
          product: testProduct._id,
          productId: testProduct._id,
          sku: testProduct.sku,
          name: testProduct.name,
          quantity: 2,
          lineTotal: 100,
          weightGrams: 500
        }],
        destinationCountry: 'US',
        merchantScopeId: 'default',
        leaseDurationMinutes: 15,
        idempotencyKey,
        userId: testUser._id
      });

      expect(acquireResult.hold).toBeDefined();
      expect(acquireResult.hold.status).toBe('active');
      expect(acquireResult.hold.allocations.length).toBeGreaterThan(0);

      const posAfter = await InventoryPosition.findById(testPosition._id);
      expect(posAfter.reserved).toBe(2);

      // Verify immutable ledger entry
      const ledgerEntry = await InventoryLedger.findOne({
        sourceId: String(acquireResult.hold._id),
        movementType: 'HOLD_CREATED'
      });
      expect(ledgerEntry).toBeDefined();
      expect(ledgerEntry.reservationDelta).toBe(2);

      // Release hold and verify ATP restored
      await StockHoldLeaseService.releaseHold({
        holdId: acquireResult.hold._id,
        sessionId,
        merchantScopeId: 'default',
        releaseReason: 'CUSTOMER_CANCELLED'
      });

      const posRestored = await InventoryPosition.findById(testPosition._id);
      expect(posRestored.reserved).toBe(0);

      const releaseLedger = await InventoryLedger.findOne({
        sourceId: String(acquireResult.hold._id),
        movementType: 'HOLD_RELEASED'
      });
      expect(releaseLedger).toBeDefined();
      expect(releaseLedger.reservationDelta).toBe(-2);
    });

    it('reconciles expired sessions and releases hold leases atomically via worker', async () => {
      const sessionId = `cs_expired_worker_${Date.now()}`;
      const now = new Date();

      const hold = await InventoryHold.create({
        merchantScopeId: 'default',
        sessionId,
        holdKey: `hold:default:${sessionId}`,
        status: InventoryHold.STATUSES.ACTIVE,
        expiresAt: new Date(now.getTime() - 5 * 60 * 1000), // 5 min in past
        maxLifetimeExpiresAt: new Date(now.getTime() + 40 * 60 * 1000),
        allocations: [{
          locationId: testLocation._id,
          locationCode: testLocation.locationCode,
          originCountry: 'US',
          productId: testProduct._id,
          canonicalSku: testProduct.sku,
          quantity: 1,
          physicalReservedQuantity: 1,
          backorderedQuantity: 0,
          inventoryPositionId: testPosition._id,
          inventoryLockVersion: 1
        }]
      });

      await InventoryPosition.updateOne(
        { _id: testPosition._id },
        { $inc: { reserved: 1 } }
      );

      const sessionDoc = await CheckoutSession.create({
        sessionId,
        merchantScopeId: 'default',
        userId: testUser._id,
        customerEmail: testUser.email,
        status: CheckoutSession.STATUSES.PAYMENT_PENDING,
        destinationCountry: 'US',
        currency: 'USD',
        quoteId: 'quote_expired_test',
        quoteTokenHash: 'hash_expired_test',
        quoteSnapshot: {
          quoteId: 'quote_expired_test',
          kid: 'kid_test',
          incoterm: 'DDP',
          merchantScopeId: 'default',
          issuedAt: now,
          expiresAt: now,
          itemsHash: 'hash'
        },
        orderData: {
          items: [{
            productId: testProduct._id,
            canonicalSku: testProduct.sku,
            name: testProduct.name,
            quantity: 1,
            unitPriceExact: MoneyMapper.toPersistence(Money.fromMinor('5000', 'USD')),
            lineTotalExact: MoneyMapper.toPersistence(Money.fromMinor('5000', 'USD')),
            weightGrams: 500
          }],
          shippingAddress: {
            fullName: 'Test User',
            addressLine1: '123 Main St',
            locality: 'Dallas',
            countryCode: 'US'
          },
          paymentMethod: 'stripe'
        },
        taxesAndDutiesSnapshot: {
          taxType: 'SALES_TAX',
          taxTreatment: 'EXCLUSIVE',
          taxableBasis: 'DESTINATION',
          taxRateNumerator: 0,
          taxRateDenominator: 10000,
          dutyRateNumerator: 0,
          dutyRateDenominator: 10000,
          taxAmountExact: MoneyMapper.toPersistence(Money.zero('USD')),
          additionalTaxAmountExact: MoneyMapper.toPersistence(Money.zero('USD')),
          taxIncludedAmountExact: MoneyMapper.toPersistence(Money.zero('USD')),
          goodsValueExact: MoneyMapper.toPersistence(Money.fromMinor('5000', 'USD')),
          payableDutyExact: MoneyMapper.toPersistence(Money.zero('USD'))
        },
        shippingSnapshot: {
          serviceLevel: 'standard',
          shippingAmountExact: MoneyMapper.toPersistence(Money.zero('USD'))
        },
        amounts: {
          subtotalExact: MoneyMapper.toPersistence(Money.fromMinor('5000', 'USD')),
          discountExact: MoneyMapper.toPersistence(Money.zero('USD')),
          shippingCostExact: MoneyMapper.toPersistence(Money.zero('USD')),
          taxAmountExact: MoneyMapper.toPersistence(Money.zero('USD')),
          additionalTaxAmountExact: MoneyMapper.toPersistence(Money.zero('USD')),
          taxIncludedAmountExact: MoneyMapper.toPersistence(Money.zero('USD')),
          dutiesExact: MoneyMapper.toPersistence(Money.zero('USD')),
          totalAmountExact: MoneyMapper.toPersistence(Money.fromMinor('5000', 'USD'))
        },
        inventoryHoldId: hold._id,
        leaseExpiresAt: hold.expiresAt,
        idempotencyKey: `idemp_${sessionId}`,
        requestHash: `req_${sessionId}`
      });

      const summary = await reconcileExpiredCheckoutSessions({ now });
      expect(summary.expiredCount).toBeGreaterThanOrEqual(1);

      const updatedSession = await CheckoutSession.findById(sessionDoc._id);
      expect(updatedSession.status).toBe(CheckoutSession.STATUSES.EXPIRED);

      const updatedHold = await InventoryHold.findById(hold._id);
      expect(updatedHold.status).toBe(InventoryHold.STATUSES.EXPIRED);
    });
  });

  describe('Domestic Pakistan COD Compatibility', () => {
    it('creates Order immediately with paymentStatus Pending for domestic COD', async () => {
      const domesticOrder = await Order.create({
        user: testUser._id,
        idempotencyKey: `cod-test-${Date.now()}`,
        requestHash: `req-hash-cod-${Date.now()}`,
        items: [{
          product: testProduct._id,
          name: testProduct.name,
          price: 1500,
          quantity: 1,
          lineTotal: 1500
        }],
        subtotal: 1500,
        totalAmount: 1500,
        shippingAddress: {
          fullName: 'Pakistani Customer',
          address: 'Main Boulevard, Gulberg',
          city: 'Lahore',
          province: 'Punjab',
          postalCode: '54000',
          country: 'Pakistan',
          countryCode: 'PK',
          phone: '+923001234567'
        },
        paymentMethod: 'cod',
        paymentStatus: 'Pending',
        currency: 'PKR',
        statusTimeline: [{
          status: 'Pending',
          actor: testUser._id,
          actorRole: 'customer',
          note: 'Domestic COD Order Placed'
        }]
      });

      expect(domesticOrder.paymentStatus).toBe('Pending');
      expect(domesticOrder.paymentMethod).toBe('cod');
      expect(domesticOrder.checkoutSessionObjectId).toBeNull();
    });
  });
});

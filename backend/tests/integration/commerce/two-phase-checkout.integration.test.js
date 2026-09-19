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
const InventoryReservation = require('../../../models/InventoryReservation');
const InventoryLedger = require('../../../models/InventoryLedger');
const crypto = require('crypto');
const request = require('supertest');
const app = require('../../../app');
const Order = require('../../../models/Order');
const Payment = require('../../../models/Payment');
const User = require('../../../models/User');
const Product = require('../../../models/Product');
const Session = require('../../../models/Session');
const FulfillmentLocation = require('../../../models/FulfillmentLocation');
const StockHoldLeaseService = require('../../../services/inventory/StockHoldLeaseService');
const InventoryReservationService = require('../../../services/inventory/InventoryReservationService');
const CheckoutSessionService = require('../../../services/order/CheckoutSessionService');
const CheckoutQuoteService = require('../../../services/checkout/CheckoutQuoteService');
const PaymentWebhookProcessor = require('../../../services/payment/webhooks/PaymentWebhookProcessor');
const CommerceConfigurationVersion = require('../../../models/CommerceConfigurationVersion');
const TokenService = require('../../../services/TokenService');
const paymentProviderRegistry = require('../../../modules/payments/core/providerRegistry');
const PaymentWebhookEvent = require('../../../models/PaymentWebhookEvent');
const { reconcileExpiredCheckoutSessions } = require('../../../scripts/workers/reconcileExpiredCheckoutSessions');
const { Money, MoneyMapper } = require('../../../modules/commerce');
const { PAYMENT_STATUSES } = require('../../../constants/paymentConstants');

const nativeResolve = paymentProviderRegistry.resolve.bind(paymentProviderRegistry);

async function getUserAuth(user) {
  const session = await Session.create({
    user: user._id,
    refreshTokenHash: crypto.randomBytes(32).toString('hex'),
    tokenFamilyId: crypto.randomUUID(),
    isActive: true,
    isRevoked: false,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000)
  });
  const accessToken = TokenService.generateAccessToken({
    userId: user._id,
    sessionId: session._id,
    tokenVersion: user.tokenVersion || 0
  });
  return `Bearer ${accessToken}`;
}

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
      role: 'customer',
      isVerified: true
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

    process.env.COMMERCE_TWO_PHASE_CHECKOUT_ENABLED = 'true';

    jest.spyOn(paymentProviderRegistry, 'resolve').mockImplementation((providerName, context) => {
      const adapter = nativeResolve(providerName, context);
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
  });

  afterEach(() => {
    process.env.COMMERCE_TWO_PHASE_CHECKOUT_ENABLED = 'true';
    jest.restoreAllMocks();
  });

  function generateValidQuoteToken({
    destinationCountry = 'US',
    destinationSubdivision = 'TX',
    currency = 'USD',
    quantity = 1,
    subtotalMinor,
    totalMinor
  } = {}) {
    const calculatedSubtotalMinor = subtotalMinor || (5000 * quantity).toString();
    const calculatedTotalMinor = totalMinor || calculatedSubtotalMinor;
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
        quantity,
        priceMinor: '5000'
      }]),
      subtotalMinor: calculatedSubtotalMinor,
      discountMinor: '0',
      shippingMinor: '0',
      insuranceMinor: '0',
      insuranceProvenance: 'NO_INSURANCE_CHARGE',
      taxMinor: '0',
      additionalTaxMinor: '0',
      taxIncludedMinor: '0',
      dutyEstimatedMinor: '0',
      dutyPayableMinor: '0',
      customsGoodsValueMinor: calculatedSubtotalMinor,
      items: [{
        productId: String(testProduct._id),
        quantity,
        hsCode: '9000.00',
        countryOfOrigin: 'US',
        itemValueMinor: calculatedSubtotalMinor
      }],
      dutyDeMinimis: {
        configured: false,
        thresholdExact: null,
        basisType: 'GOODS_VALUE',
        basisAmountExact: { amountMinor: calculatedSubtotalMinor, currency, exponent: 2 },
        comparison: 'LT',
        exempt: false,
        reasonCode: 'NO_THRESHOLD_CONFIGURED'
      },
      taxDeMinimis: {
        configured: false,
        thresholdExact: null,
        basisType: 'GOODS_VALUE',
        basisAmountExact: { amountMinor: calculatedSubtotalMinor, currency, exponent: 2 },
        comparison: 'LT',
        exempt: false,
        reasonCode: 'NO_THRESHOLD_CONFIGURED'
      },
      grandTotalMinor: calculatedTotalMinor,
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

      jest.spyOn(paymentProviderRegistry, 'resolve').mockImplementation((providerName, context) => {
        const adapter = nativeResolve(providerName, context);
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
    });

    it('releases hold and marks session failed if payment provider initiation throws', async () => {
      const { token } = generateValidQuoteToken();
      const idempotencyKey = `session_fail_${Date.now()}`;

      // Mock provider adapter to throw during createPayment
      jest.spyOn(paymentProviderRegistry, 'resolve').mockImplementation((providerName, context) => {
        const adapter = nativeResolve(providerName, context);
        return {
          ...adapter,
          createPayment: jest.fn().mockRejectedValue(new Error('Stripe Provider Network Timeout'))
        };
      });

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

  describe('Group A: Idempotency, Crash Recovery, and Secret Isolation', () => {
    it('same idempotency key + identical request returns the same session, hold, Payment, and provider attempt', async () => {
      const { token: quoteToken } = generateValidQuoteToken();
      const idempotencyKey = `idemp_replay_${Date.now()}`;
      const sessionData = {
        items: [{
          productId: testProduct._id,
          quantity: 1
        }],
        shippingAddress: {
          fullName: 'Replay User',
          addressLine1: '100 Logistics Blvd',
          locality: 'Dallas',
          administrativeArea: 'TX',
          postalCode: '75201',
          countryCode: 'US',
          phone: '+15551234567'
        },
        paymentMethod: 'stripe',
        currency: 'USD',
        quoteToken
      };

      const res1 = await CheckoutSessionService.createSession({
        userId: testUser._id,
        sessionData,
        idempotencyKey
      });

      expect(res1.isReplay).toBe(false);
      expect(res1.session.sessionId).toBeDefined();
      expect(res1.paymentAttempt.provider).toBe('stripe');

      const res2 = await CheckoutSessionService.createSession({
        userId: testUser._id,
        sessionData,
        idempotencyKey
      });

      expect(res2.isReplay).toBe(true);
      expect(res2.session.sessionId).toBe(res1.session.sessionId);
      expect(res2.session._id.toString()).toBe(res1.session._id.toString());
      expect(res2.paymentAttempt.provider).toBe('stripe');
    });

    it('same key + changed payload returns IDEMPOTENCY_CONFLICT', async () => {
      const { token: quoteToken } = generateValidQuoteToken();
      const idempotencyKey = `idemp_conflict_${Date.now()}`;
      const sessionData1 = {
        items: [{
          productId: testProduct._id,
          quantity: 1
        }],
        shippingAddress: {
          fullName: 'Conflict User 1',
          addressLine1: '100 Logistics Blvd',
          locality: 'Dallas',
          administrativeArea: 'TX',
          postalCode: '75201',
          countryCode: 'US',
          phone: '+15551234567'
        },
        paymentMethod: 'stripe',
        currency: 'USD',
        quoteToken
      };

      await CheckoutSessionService.createSession({
        userId: testUser._id,
        sessionData: sessionData1,
        idempotencyKey
      });

      const sessionData2 = {
        ...sessionData1,
        shippingAddress: {
          ...sessionData1.shippingAddress,
          fullName: 'Changed User Name'
        }
      };

      await expect(CheckoutSessionService.createSession({
        userId: testUser._id,
        sessionData: sessionData2,
        idempotencyKey
      })).rejects.toThrow(/Idempotency-Key was already used with a different session request/i);
    });

    it('provider invocation failure compensates session and hold without creating an Order', async () => {
      const { token: quoteToken } = generateValidQuoteToken();
      const idempotencyKey = `idemp_crash_before_prov_${Date.now()}`;
      const sessionData = {
        items: [{
          productId: testProduct._id,
          quantity: 1
        }],
        shippingAddress: {
          fullName: 'Crash Recovery User',
          addressLine1: '100 Logistics Blvd',
          locality: 'Dallas',
          administrativeArea: 'TX',
          postalCode: '75201',
          countryCode: 'US',
          phone: '+15551234567'
        },
        paymentMethod: 'stripe',
        currency: 'USD',
        quoteToken
      };

      // 1. First attempt: intercept and throw inside provider createPayment
      let providerInvocationAttempted = false;

      jest.spyOn(paymentProviderRegistry, 'resolve').mockImplementation((providerName, context) => {
        const adapter = nativeResolve(providerName, context);
        return {
          ...adapter,
          createPayment: jest.fn().mockImplementation(async () => {
            providerInvocationAttempted = true;
            throw new Error('Simulated Process Crash / Network Failure Before Provider Returns');
          })
        };
      });

      await expect(CheckoutSessionService.createSession({
          userId: testUser._id,
          sessionData,
          idempotencyKey
        })).rejects.toThrow(/Simulated Process Crash/i);

      expect(providerInvocationAttempted).toBe(true);

      const sessionBeforeRetry = await CheckoutSession.findOne({ idempotencyKey });
      expect(sessionBeforeRetry.status).toBe(CheckoutSession.STATUSES.FAILED);

      // Verify hold was released and session marked failed on unhandled error
      const holdBeforeRetry = await InventoryHold.findById(sessionBeforeRetry.inventoryHoldId);
      expect(holdBeforeRetry.status).toBe(InventoryHold.STATUSES.RELEASED);
    });

    it('genuine pre-provider crash-state recovery: replays unlinked session, invokes provider once, links payment and reaches payment_pending', async () => {
      const { token: quoteToken, rawQuote } = generateValidQuoteToken();
      const idempotencyKey = `idemp_pre_prov_crash_${Date.now()}`;
      const sessionId = `cs_crash_recov_${Date.now()}`;
      const totalAmountMoney = Money.fromMinor(rawQuote.grandTotalMinor, 'USD');
      const totalAmountExact = MoneyMapper.toPersistence(totalAmountMoney);

      const sessionData = {
        items: [{
          productId: testProduct._id,
          quantity: 1
        }],
        shippingAddress: {
          fullName: 'Pre-Provider Crash User',
          addressLine1: '100 Logistics Blvd',
          locality: 'Dallas',
          administrativeArea: 'TX',
          postalCode: '75201',
          countryCode: 'US',
          phone: '+15551234567'
        },
        paymentMethod: 'stripe',
        currency: 'USD',
        quoteToken
      };

      const requestHash = CheckoutSessionService.hashRequest(sessionData);

      // 1. Create durable pre-provider crash state
      const hold = await InventoryHold.create({
        merchantScopeId: 'default',
        sessionId,
        holdKey: `hold:default:${sessionId}`,
        status: InventoryHold.STATUSES.ACTIVE,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
        maxLifetimeExpiresAt: new Date(Date.now() + 30 * 60 * 1000),
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

      const sessionDoc = await CheckoutSession.create({
        sessionId,
        merchantScopeId: 'default',
        userId: testUser._id,
        customerEmail: testUser.email,
        status: CheckoutSession.STATUSES.ACTIVE,
        destinationCountry: 'US',
        currency: 'USD',
        quoteId: rawQuote.quoteId,
        quoteTokenHash: crypto.createHash('sha256').update(quoteToken).digest('hex'),
        quoteSnapshot: rawQuote,
        orderData: {
          items: [{
            productId: testProduct._id,
            canonicalSku: testProduct.sku,
            name: testProduct.name,
            quantity: 1,
            unitPriceExact: totalAmountExact,
            lineTotalExact: totalAmountExact,
            weightGrams: testProduct.weightGrams
          }],
          shippingAddress: sessionData.shippingAddress,
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
          goodsValueExact: totalAmountExact,
          payableDutyExact: MoneyMapper.toPersistence(Money.zero('USD'))
        },
        shippingSnapshot: {
          serviceLevel: 'standard',
          shippingAmountExact: MoneyMapper.toPersistence(Money.zero('USD'))
        },
        amounts: {
          subtotalExact: totalAmountExact,
          discountExact: MoneyMapper.toPersistence(Money.zero('USD')),
          shippingCostExact: MoneyMapper.toPersistence(Money.zero('USD')),
          taxAmountExact: MoneyMapper.toPersistence(Money.zero('USD')),
          additionalTaxAmountExact: MoneyMapper.toPersistence(Money.zero('USD')),
          taxIncludedAmountExact: MoneyMapper.toPersistence(Money.zero('USD')),
          dutiesExact: MoneyMapper.toPersistence(Money.zero('USD')),
          totalAmountExact
        },
        inventoryHoldId: hold._id,
        leaseExpiresAt: hold.expiresAt,
        paymentId: null,
        idempotencyKey,
        requestHash
      });

      const payment = await Payment.create({
        merchantScopeId: 'default',
        checkoutSessionObjectId: sessionDoc._id,
        checkoutSessionId: sessionId,
        order: null,
        user: testUser._id,
        provider: 'stripe',
        gateway: 'stripe',
        status: PAYMENT_STATUSES.PENDING,
        amount: Number(totalAmountMoney.toDecimalString()),
        amountExact: totalAmountExact,
        currency: 'USD',
        providerPaymentId: '',
        providerDisplayName: 'Stripe Payment',
        providerIntegrationVersion: '1.0.0',
        paymentType: 'automated',
        capabilitySnapshot: {
          createPayment: true,
          accountAlias: 'default',
          environment: 'sandbox'
        },
        idempotencyKey: `pay:${sessionId}`,
        requestHash: crypto.createHash('sha256').update(JSON.stringify({ sessionId, amountMinor: String(totalAmountExact.amountMinor) })).digest('hex'),
        providerIdempotencyKey: `prov:${sessionId}`,
        history: []
      });

      // Verify pre-crash state
      expect(sessionDoc.paymentId).toBeNull();
      expect(payment.providerPaymentId).toBe('');
      const orderBefore = await Order.findOne({ checkoutSessionObjectId: sessionDoc._id });
      expect(orderBefore).toBeNull();

      // 2. Setup spy for single provider call on replay
      const createPaymentSpy = jest.fn().mockResolvedValue({
        providerPaymentId: 'pi_genuine_recovered_123',
        clientSecret: 'secret_transient_recovered_456',
        status: PAYMENT_STATUSES.PENDING
      });

      jest.spyOn(paymentProviderRegistry, 'resolve').mockImplementation((providerName, context) => {
        const adapter = nativeResolve(providerName, context);
        return {
          ...adapter,
          createPayment: createPaymentSpy
        };
      });

      // 3. Replay createSession with identical request and idempotency key
      const recoveryResult = await CheckoutSessionService.createSession({
        userId: testUser._id,
        sessionData,
        idempotencyKey
      });

      // Assert behavioral recovery
      // 1. Existing CheckoutSession is reused
      expect(recoveryResult.sessionId).toBe(sessionDoc.sessionId);
      expect(recoveryResult.session._id.toString()).toBe(sessionDoc._id.toString());
      expect(recoveryResult.isReplay).toBe(true);

      // 2. Existing InventoryHold is reused
      expect(recoveryResult.session.inventoryHoldId.toString()).toBe(hold._id.toString());

      // 3. Existing Payment is reused
      expect(recoveryResult.paymentAttempt.providerPaymentId).toBe('pi_genuine_recovered_123');

      // 4. No duplicate Session, Hold, or Payment created
      const sessionCount = await CheckoutSession.countDocuments({ idempotencyKey });
      expect(sessionCount).toBe(1);
      const holdCount = await InventoryHold.countDocuments({ sessionId });
      expect(holdCount).toBe(1);
      const paymentCount = await Payment.countDocuments({ checkoutSessionId: sessionId });
      expect(paymentCount).toBe(1);

      // 5. Provider createPayment called exactly once
      expect(createPaymentSpy).toHaveBeenCalledTimes(1);

      // 6. Stable provider idempotency identity reused
      expect(createPaymentSpy).toHaveBeenCalledWith(expect.objectContaining({
        idempotencyKey: payment.providerIdempotencyKey
      }));

      // 7. Provider payment ID persisted
      const updatedPayment = await Payment.findById(payment._id);
      expect(updatedPayment.providerPaymentId).toBe('pi_genuine_recovered_123');

      // 8. CheckoutSession.paymentId linked
      const updatedSession = await CheckoutSession.findById(sessionDoc._id);
      expect(updatedSession.paymentId.toString()).toBe(payment._id.toString());

      // 9. Session reaches payment_pending
      expect(updatedSession.status).toBe(CheckoutSession.STATUSES.PAYMENT_PENDING);

      // 10. Client secret is returned transiently but is absent from persisted documents
      expect(recoveryResult.paymentAttempt.clientSecret).toBe('secret_transient_recovered_456');
      expect(updatedSession.toObject()).not.toHaveProperty('clientSecret');
      expect(updatedPayment.toObject()).not.toHaveProperty('clientSecret');

      // 11. No Order created
      const orderAfter = await Order.findOne({ checkoutSessionObjectId: sessionDoc._id });
      expect(orderAfter).toBeNull();
    });

    it('simulates provider success followed by failure before session-payment linking and recovers cleanly on retry', async () => {
      const { token: quoteToken } = generateValidQuoteToken();
      const idempotencyKey = `idemp_crash_before_link_${Date.now()}`;
      const sessionData = {
        items: [{
          productId: testProduct._id,
          quantity: 1
        }],
        shippingAddress: {
          fullName: 'Linking Crash User',
          addressLine1: '100 Logistics Blvd',
          locality: 'Dallas',
          administrativeArea: 'TX',
          postalCode: '75201',
          countryCode: 'US',
          phone: '+15551234567'
        },
        paymentMethod: 'stripe',
        currency: 'USD',
        quoteToken
      };

      // 1. Manually setup an orphaned Payment record (provider succeeded, returned providerPaymentId, but process crashed before CheckoutSession.updateOne)
      const initialCreation = await CheckoutSessionService.createSession({
        userId: testUser._id,
        sessionData,
        idempotencyKey
      });

      // Simulate unlinked state by clearing paymentId on session
      await CheckoutSession.updateOne(
        { _id: initialCreation.session._id },
        { $set: { paymentId: null } }
      );

      const sessionUnlinked = await CheckoutSession.findById(initialCreation.session._id);
      expect(sessionUnlinked.paymentId).toBeNull();

      // 2. Spy on provider createPayment
      const createPaymentSpy = jest.fn();
      jest.spyOn(paymentProviderRegistry, 'resolve').mockImplementation((providerName, context) => {
        const adapter = nativeResolve(providerName, context);
        return {
          ...adapter,
          createPayment: createPaymentSpy
        };
      });

      // 3. Replay with same idempotency key
      const retryResult = await CheckoutSessionService.createSession({
          userId: testUser._id,
          sessionData,
          idempotencyKey
        });

        // Proves createPayment was NOT called again
        expect(createPaymentSpy).not.toHaveBeenCalled();

        // Proves session was relinked
        expect(retryResult.isReplay).toBe(true);
        expect(retryResult.sessionId).toBe(initialCreation.sessionId);

        const sessionRelinked = await CheckoutSession.findById(initialCreation.session._id);
        expect(sessionRelinked.paymentId).toBeDefined();
    });

    it('retry proves provider createPayment is not called twice', async () => {
      const { token: quoteToken } = generateValidQuoteToken();
      const idempotencyKey = `idemp_single_call_${Date.now()}`;
      const sessionData = {
        items: [{
          productId: testProduct._id,
          quantity: 1
        }],
        shippingAddress: {
          fullName: 'Single Call User',
          addressLine1: '100 Logistics Blvd',
          locality: 'Dallas',
          administrativeArea: 'TX',
          postalCode: '75201',
          countryCode: 'US',
          phone: '+15551234567'
        },
        paymentMethod: 'stripe',
        currency: 'USD',
        quoteToken
      };

      const createPaymentSpy = jest.fn().mockResolvedValue({
        providerPaymentId: `pi_test_${Date.now()}`,
        clientSecret: `secret_${Date.now()}`,
        status: 'requires_capture'
      });

      jest.spyOn(paymentProviderRegistry, 'resolve').mockImplementation((providerName, context) => {
        const adapter = nativeResolve(providerName, context);
        return {
          ...adapter,
          createPayment: createPaymentSpy
        };
      });

      const res1 = await CheckoutSessionService.createSession({
          userId: testUser._id,
          sessionData,
          idempotencyKey
        });
        expect(res1.isReplay).toBe(false);
        expect(createPaymentSpy).toHaveBeenCalledTimes(1);

        const res2 = await CheckoutSessionService.createSession({
          userId: testUser._id,
          sessionData,
          idempotencyKey
        });
        expect(res2.isReplay).toBe(true);
        expect(createPaymentSpy).toHaveBeenCalledTimes(1);
    });

    it('asserts raw quoteToken and clientSecret are absent from persisted Session, Payment, logs, and serialized database objects', async () => {
      const { token: quoteToken } = generateValidQuoteToken();
      const idempotencyKey = `idemp_secret_${Date.now()}`;
      const sessionData = {
        items: [{
          productId: testProduct._id,
          quantity: 1
        }],
        shippingAddress: {
          fullName: 'Secret Test User',
          addressLine1: '100 Logistics Blvd',
          locality: 'Dallas',
          administrativeArea: 'TX',
          postalCode: '75201',
          countryCode: 'US',
          phone: '+15551234567'
        },
        paymentMethod: 'stripe',
        currency: 'USD',
        quoteToken
      };

      const result = await CheckoutSessionService.createSession({
        userId: testUser._id,
        sessionData,
        idempotencyKey
      });

      const persistedSession = await CheckoutSession.findById(result.session._id).lean();
      const persistedPayment = await Payment.findOne({ checkoutSessionObjectId: result.session._id }).lean();

      // Ensure raw quoteToken is NOT persisted in session object or serialized DB
      expect(JSON.stringify(persistedSession)).not.toContain(quoteToken);
      expect(persistedSession.quoteTokenHash).toBeDefined();

      // Ensure clientSecret is not stored in persisted Session or Payment
      expect(persistedSession.clientSecret).toBeUndefined();
      if (persistedPayment) {
        expect(persistedPayment.clientSecret).toBeUndefined();
        expect(JSON.stringify(persistedPayment)).not.toContain('clientSecret');
      }
    });
  });

  describe('Group E: Feature Flag Runtime Controls', () => {
    it('returns HTTP 503 and code TWO_PHASE_CHECKOUT_DISABLED on POST route when feature flag is disabled', async () => {
      const originalEnv = process.env.COMMERCE_TWO_PHASE_CHECKOUT_ENABLED;
      process.env.COMMERCE_TWO_PHASE_CHECKOUT_ENABLED = 'false';

      try {
        const { token: quoteToken } = generateValidQuoteToken();
        const authHeader = await getUserAuth(testUser);

        const res = await request(app)
          .post('/api/commerce/checkout/session')
          .set('Authorization', authHeader)
          .set('Idempotency-Key', `idemp_ff_route_${Date.now()}`)
          .send({
            quoteToken,
            items: [{ productId: String(testProduct._id), quantity: 1 }],
            shippingAddress: {
              fullName: 'Disabled Feature User',
              address: '100 Logistics Blvd',
              city: 'Dallas',
              province: 'TX',
              postalCode: '75201',
              countryCode: 'US',
              phone: '+15551234567'
            },
            paymentMethod: 'stripe',
            currency: 'USD'
          });

        expect(res.status).toBe(503);
        expect(res.body.success).toBe(false);
        expect(res.body.error?.code || res.body.code).toBe('TWO_PHASE_CHECKOUT_DISABLED');
      } finally {
        process.env.COMMERCE_TWO_PHASE_CHECKOUT_ENABLED = originalEnv;
      }
    });

    it('allows existing captured session conversion when feature flag is disabled', async () => {
      // 1. Create session with feature enabled
      process.env.COMMERCE_TWO_PHASE_CHECKOUT_ENABLED = 'true';
      const { token: quoteToken } = generateValidQuoteToken();

      const idempotencyKey = `idemp_ff_conv_${Date.now()}`;
      const sessionData = {
        items: [{
          productId: testProduct._id,
          quantity: 1
        }],
        shippingAddress: {
          fullName: 'FF Test User',
          addressLine1: '100 Logistics Blvd',
          locality: 'Dallas',
          administrativeArea: 'TX',
          postalCode: '75201',
          countryCode: 'US',
          phone: '+15551234567'
        },
        paymentMethod: 'stripe',
        currency: 'USD',
        quoteToken
      };

      const created = await CheckoutSessionService.createSession({
        userId: testUser._id,
        sessionData,
        idempotencyKey
      });

      // 2. Disable feature flag
      process.env.COMMERCE_TWO_PHASE_CHECKOUT_ENABLED = 'false';

      try {
        // 3. Existing captured session conversion must still succeed (reconciliation safety)
        const convertResult = await CheckoutSessionService.convertSessionToOrder({
          sessionId: created.session.sessionId,
          paymentEvidence: {
            amountExact: created.session.amounts.totalAmountExact,
            currency: 'USD',
            providerPaymentId: 'pi_ff_test'
          }
        });

        expect(convertResult.isReplay).toBe(false);
        expect(convertResult.order).toBeDefined();
        expect(convertResult.order.paymentStatus).toBe('Paid');
      } finally {
        process.env.COMMERCE_TWO_PHASE_CHECKOUT_ENABLED = 'true';
      }
    });

    it('allows existing expiry reconciliation when feature flag is disabled', async () => {
      process.env.COMMERCE_TWO_PHASE_CHECKOUT_ENABLED = 'true';
      const { token: quoteToken } = generateValidQuoteToken();

      const sessionId = `cs_ff_expiry_${Date.now()}`;
      const created = await CheckoutSessionService.createSession({
        userId: testUser._id,
        sessionData: {
          items: [{ productId: testProduct._id, quantity: 1 }],
          shippingAddress: {
            fullName: 'FF Expiry User',
            addressLine1: '100 Logistics Blvd',
            locality: 'Dallas',
            administrativeArea: 'TX',
            postalCode: '75201',
            countryCode: 'US',
            phone: '+15551234567'
          },
          paymentMethod: 'stripe',
          currency: 'USD',
          quoteToken
        },
        idempotencyKey: `idemp_${sessionId}`
      });

      // Manually backdate lease expiry
      const pastDate = new Date(Date.now() - 10 * 60 * 1000);
      await CheckoutSession.updateOne({ _id: created.session._id }, { $set: { leaseExpiresAt: pastDate } });
      await InventoryHold.updateOne({ _id: created.session.inventoryHoldId }, { $set: { expiresAt: pastDate } });

      // Disable feature flag
      process.env.COMMERCE_TWO_PHASE_CHECKOUT_ENABLED = 'false';

      try {
        const summary = await reconcileExpiredCheckoutSessions({ now: new Date() });
        expect(summary.expiredCount).toBeGreaterThanOrEqual(1);

        const sessionAfter = await CheckoutSession.findById(created.session._id);
        expect(sessionAfter.status).toBe(CheckoutSession.STATUSES.EXPIRED);
      } finally {
        process.env.COMMERCE_TWO_PHASE_CHECKOUT_ENABLED = 'true';
      }
    });

    it('allows existing webhook processing when feature flag is disabled', async () => {
      process.env.COMMERCE_TWO_PHASE_CHECKOUT_ENABLED = 'true';
      const { token: quoteToken } = generateValidQuoteToken();

      const sessionId = `cs_ff_webhook_${Date.now()}`;
      const created = await CheckoutSessionService.createSession({
        userId: testUser._id,
        sessionData: {
          items: [{ productId: testProduct._id, quantity: 1 }],
          shippingAddress: {
            fullName: 'FF Webhook User',
            addressLine1: '100 Logistics Blvd',
            locality: 'Dallas',
            administrativeArea: 'TX',
            postalCode: '75201',
            countryCode: 'US',
            phone: '+15551234567'
          },
          paymentMethod: 'stripe',
          currency: 'USD',
          quoteToken
        },
        idempotencyKey: `idemp_${sessionId}`
      });

      const payment = await Payment.findOne({ checkoutSessionObjectId: created.session._id });

      // Disable feature flag
      process.env.COMMERCE_TWO_PHASE_CHECKOUT_ENABLED = 'false';

      try {
        const payloadHash = crypto.createHash('sha256').update(JSON.stringify({ test: 'ff_webhook' })).digest('hex');
        await PaymentWebhookEvent.create({
          provider: 'stripe',
          environment: 'sandbox',
          accountAlias: 'default',
          providerEventId: `evt_ff_${Date.now()}`,
          eventType: 'payment_intent.succeeded',
          providerPaymentId: payment.providerPaymentId || `pi_${sessionId}`,
          amountMinor: 5000,
          currency: 'USD',
          providerCreatedAt: new Date(),
          payloadHash,
          eventData: {
            providerEventId: `evt_ff_${Date.now()}`,
            eventType: 'payment_intent.succeeded',
            providerPaymentId: payment.providerPaymentId || `pi_${sessionId}`,
            amountMinor: 5000,
            currency: 'USD',
            environment: 'sandbox',
            eventCreatedAt: new Date(),
            metadata: {
              sessionId: created.session.sessionId,
              paymentId: String(payment._id),
              accountAlias: 'default'
            }
          },
          status: 'received',
          receivedAt: new Date()
        });

        const summary = await PaymentWebhookProcessor.processPending({ batchSize: 10 });
        expect(summary.processed).toBe(1);

        const sessionAfter = await CheckoutSession.findById(created.session._id);
        expect(sessionAfter.status).toBe(CheckoutSession.STATUSES.CONVERTED);
      } finally {
        process.env.COMMERCE_TWO_PHASE_CHECKOUT_ENABLED = 'true';
      }
    });
  });

  describe('Group F: Downstream Reservation and Fulfillment Lifecycle Compatibility', () => {
    it('converts session to order and allows standard fulfillment shipment consumption and release', async () => {
      const { token: quoteToken } = generateValidQuoteToken({ quantity: 2 });
      const idempotencyKey = `idemp_downstream_${Date.now()}`;
      const sessionData = {
        items: [{
          productId: testProduct._id,
          quantity: 2
        }],
        shippingAddress: {
          fullName: 'Fulfillment User',
          addressLine1: '100 Logistics Blvd',
          locality: 'Dallas',
          administrativeArea: 'TX',
          postalCode: '75201',
          countryCode: 'US',
          phone: '+15551234567'
        },
        paymentMethod: 'stripe',
        currency: 'USD',
        quoteToken
      };

      const created = await CheckoutSessionService.createSession({
        userId: testUser._id,
        sessionData,
        idempotencyKey
      });

      const convertResult = await CheckoutSessionService.convertSessionToOrder({
        sessionId: created.session.sessionId,
        paymentEvidence: {
          amountExact: created.session.amounts.totalAmountExact,
          currency: 'USD',
          providerPaymentId: 'pi_fulfillment_test'
        }
      });

      const order = convertResult.order;
      const reservation = await InventoryReservation.findById(order.inventoryReservationId);
      expect(reservation).toBeDefined();
      expect(reservation.status).toBe('confirmed');
      expect(reservation.allocations[0].physicalReservedQuantity).toBe(2);

      // Verify InventoryPosition reserved is 2
      const posBeforeShipment = await InventoryPosition.findById(testPosition._id);
      expect(posBeforeShipment.reserved).toBe(2);
      expect(posBeforeShipment.onHand).toBe(20);

      // Consume shipment of the order via InventoryReservationService
      await InventoryReservationService.consumeShipment({
        order,
        userId: testUser._id
      });

      const posAfterShipment = await InventoryPosition.findById(testPosition._id);
      expect(posAfterShipment.reserved).toBe(0);
      expect(posAfterShipment.onHand).toBe(18);

      // Verify reservation is consumed
      const resAfterShipment = await InventoryReservation.findById(order.inventoryReservationId);
      expect(resAfterShipment.status).toBe('consumed');

      // Verify ledger records SHIPMENT_CONSUMED
      const consumptionLedger = await InventoryLedger.findOne({
        orderId: order.orderId,
        movementType: 'SHIPMENT_CONSUMED'
      });
      expect(consumptionLedger).toBeDefined();
      expect(consumptionLedger.quantityDelta).toBe(-2);
      expect(consumptionLedger.reservationDelta).toBe(-2);
    });
  });
});

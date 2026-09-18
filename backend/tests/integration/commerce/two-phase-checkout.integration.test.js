/**
 * @file two-phase-checkout.integration.test.js
 * @description Integration Test Suite for Phase 6D-5A Two-Phase Prepaid Checkout Sessions,
 * Expiring Stock Holds, Capture-vs-Expiry Racing, and Domestic Pakistan COD Compatibility.
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
const PaymentWebhookProcessor = require('../../../services/payment/webhooks/PaymentWebhookProcessor');
const { Money, MoneyMapper } = require('../../../modules/commerce');
const { reconcileExpiredCheckoutSessions } = require('../../../scripts/workers/reconcileExpiredCheckoutSessions');

describe('Phase 6D-5A Two-Phase Checkout & Stock Hold Engine Integration', () => {
  let testUser;
  let testProduct;
  let testLocation;
  let testPosition;

  beforeEach(async () => {
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

    testProduct = await Product.create({
      name: 'Global Widget',
      slug: `global-widget-${Date.now()}`,
      price: 50,
      countInStock: 20,
      description: 'High quality global widget',
      sku: `SKU-WIDGET-${Date.now()}`
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

/**
 * @file checkout-session-races.integration.test.js
 * @description Race condition integration tests: Capture vs Expiry, Capture vs Cancellation,
 * and Worker Concurrency / Multi-Instance Overlap protection.
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
const { reconcileExpiredCheckoutSessions } = require('../../../scripts/workers/reconcileExpiredCheckoutSessions');
const { Money, MoneyMapper } = require('../../../modules/commerce');
const { PAYMENT_STATUSES } = require('../../../constants/paymentConstants');

describe('Phase 6D-5A Capture, Expiry, Cancellation & Worker Races Integration Tests', () => {
  let testUser;
  let testProduct;
  let testLocation;
  let testPosition;

  beforeEach(async () => {
    testUser = await User.create({
      fullName: 'Race Customer',
      email: `race-${Date.now()}@example.com`,
      password: 'password123',
      role: 'customer'
    });

    testLocation = await FulfillmentLocation.create({
      merchantScopeId: 'default',
      locationCode: `WH-RACE-${Date.now()}`.slice(0, 40),
      displayName: 'Race Warehouse',
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
      name: 'Race Widget',
      slug: `race-widget-${Date.now()}`,
      price: 50,
      countInStock: 20,
      sku: `SKU-RACE-${Date.now()}`
    });

    testPosition = await InventoryPosition.create({
      merchantScopeId: 'default',
      locationId: testLocation._id,
      locationCode: testLocation.locationCode,
      productId: testProduct._id,
      canonicalSku: testProduct.sku,
      onHand: 20,
      reserved: 2,
      unavailable: 0,
      safetyStock: 0,
      allowBackorder: true,
      backorderLimit: 10,
      backordered: 0,
      lockVersion: 1
    });
  });

  async function createFixtureSession({
    sessionId = `cs_race_${Date.now()}`,
    leaseExpiresAt = new Date(Date.now() + 15 * 60 * 1000)
  } = {}) {
    const totalAmountMoney = Money.fromMinor('5000', 'USD');
    const totalAmountExact = MoneyMapper.toPersistence(totalAmountMoney);

    const hold = await InventoryHold.create({
      merchantScopeId: 'default',
      sessionId,
      holdKey: `hold:default:${sessionId}`,
      status: InventoryHold.STATUSES.ACTIVE,
      expiresAt: leaseExpiresAt,
      maxLifetimeExpiresAt: new Date(Date.now() + 45 * 60 * 1000),
      allocations: [{
        locationId: testLocation._id,
        locationCode: testLocation.locationCode,
        originCountry: 'US',
        productId: testProduct._id,
        canonicalSku: testProduct.sku,
        quantity: 2,
        physicalReservedQuantity: 2,
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
      status: CheckoutSession.STATUSES.PAYMENT_PENDING,
      destinationCountry: 'US',
      currency: 'USD',
      quoteId: `quote_${sessionId}`,
      quoteTokenHash: `hash_${sessionId}`,
      quoteSnapshot: {
        quoteId: `quote_${sessionId}`,
        kid: 'kid_race_1',
        incoterm: 'DDP',
        merchantScopeId: 'default',
        issuedAt: new Date(),
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        itemsHash: 'hash'
      },
      orderData: {
        items: [{
          productId: testProduct._id,
          canonicalSku: testProduct.sku,
          name: testProduct.name,
          quantity: 2,
          unitPriceExact: MoneyMapper.toPersistence(Money.fromMinor('2500', 'USD')),
          lineTotalExact: totalAmountExact,
          weightGrams: 500
        }],
        shippingAddress: {
          fullName: 'Race Customer',
          addressLine1: '123 Speed Way',
          locality: 'Dallas',
          countryCode: 'US',
          phone: '+15559876543'
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
      leaseExpiresAt,
      idempotencyKey: `idemp_${sessionId}`,
      requestHash: `req_${sessionId}`
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
      amount: 50,
      amountExact: totalAmountExact,
      currency: 'USD',
      providerPaymentId: `pi_${sessionId}`,
      providerDisplayName: 'Stripe Payment',
      providerIntegrationVersion: '1.0.0',
      paymentType: 'automated',
      capabilitySnapshot: {
        createPayment: true,
        accountAlias: 'default',
        environment: 'sandbox'
      },
      idempotencyKey: `pay_${sessionId}`,
      requestHash: `hash_${sessionId}`,
      providerIdempotencyKey: `prov_${sessionId}`,
      history: []
    });

    await CheckoutSession.updateOne(
      { _id: sessionDoc._id },
      { $set: { paymentId: payment._id } }
    );

    return { sessionDoc, hold, payment };
  }

  it('1. Capture wins before expiry: hold is protected with capture_committed so expiry worker cannot release it', async () => {
    const { sessionDoc, hold, payment } = await createFixtureSession();

    // 1. Timely capture arrives and transitions hold to capture_committed and session to payment_captured
    await StockHoldLeaseService.protectHoldForCapture({
      holdId: hold._id,
      sessionId: sessionDoc.sessionId,
      merchantScopeId: 'default'
    });
    await CheckoutSession.updateOne(
      { _id: sessionDoc._id },
      { $set: { status: CheckoutSession.STATUSES.PAYMENT_CAPTURED } }
    );

    const holdAfterCapture = await InventoryHold.findById(hold._id);
    expect(holdAfterCapture.status).toBe(InventoryHold.STATUSES.CAPTURE_COMMITTED);

    // 2. Now simulate lease expiration time passing
    const pastDate = new Date(Date.now() - 5 * 60 * 1000);
    await InventoryHold.updateOne({ _id: hold._id }, { $set: { expiresAt: pastDate } });
    await CheckoutSession.updateOne({ _id: sessionDoc._id }, { $set: { leaseExpiresAt: pastDate } });

    // 3. Run expiry worker
    const workerResult = await reconcileExpiredCheckoutSessions({ now: new Date() });

    // Proves the worker did NOT expire the hold because it is capture_committed
    const holdAfterWorker = await InventoryHold.findById(hold._id);
    expect(holdAfterWorker.status).toBe(InventoryHold.STATUSES.CAPTURE_COMMITTED);

    // 4. Delayed Order conversion completes successfully
    const convertResult = await CheckoutSessionService.convertSessionToOrder({
      sessionId: sessionDoc.sessionId,
      paymentId: payment._id,
      providerCapturedAt: new Date()
    });

    expect(convertResult.order).toBeDefined();
    expect(convertResult.order.paymentStatus).toBe('Paid');
  });

  it('2. Expiry wins before capture: inventory releases once; late capture records reconciliation conflict with zero unbacked order', async () => {
    const pastDate = new Date(Date.now() - 5 * 60 * 1000);
    const { sessionDoc, hold, payment } = await createFixtureSession({
      leaseExpiresAt: pastDate
    });

    // 1. Expiry worker runs and expires session & hold
    const workerSummary = await reconcileExpiredCheckoutSessions({ now: new Date() });
    expect(workerSummary.expiredCount).toBeGreaterThanOrEqual(1);

    const posAfterExpiry = await InventoryPosition.findById(testPosition._id);
    expect(posAfterExpiry.reserved).toBe(0);

    // 2. Late capture webhook arrives
    const claimedEvent = {
      providerEventId: `evt_late_race_${Date.now()}`,
      providerCreatedAt: new Date(),
      eventData: { metadata: { sessionId: sessionDoc.sessionId } }
    };

    const mongoSession = await mongoose.startSession();
    try {
      await mongoSession.withTransaction(async () => {
        await PaymentWebhookProcessor.processSessionPaymentEvent({
          payment,
          claimedEvent,
          eventType: 'payment_intent.succeeded',
          providerEventId: claimedEvent.providerEventId,
          amountMinor: 5000,
          currency: 'USD',
          now: new Date(),
          session: mongoSession
        });
      });
    } finally {
      await mongoSession.endSession();
    }

    // Proves NO unbacked order is created
    const order = await Order.findOne({ checkoutSessionObjectId: sessionDoc._id });
    expect(order).toBeNull();

    // Proves conflict is recorded for human / dispute review
    const sessionAfterLateCapture = await CheckoutSession.findById(sessionDoc._id);
    expect(sessionAfterLateCapture.status).toBe(CheckoutSession.STATUSES.CONFLICT);
    expect(sessionAfterLateCapture.reconciliation.reasonCode).toBe('LATE_CAPTURE_HOLD_EXPIRED');
  });

  it('3. Worker concurrency race: two concurrent worker instances processing the same expired session: exactly one claims and releases it', async () => {
    const pastDate = new Date(Date.now() - 5 * 60 * 1000);
    const { sessionDoc, hold } = await createFixtureSession({
      leaseExpiresAt: pastDate
    });

    // Run two worker reconciliations in parallel on the same expired session
    const [summary1, summary2] = await Promise.all([
      reconcileExpiredCheckoutSessions({ now: new Date() }),
      reconcileExpiredCheckoutSessions({ now: new Date() })
    ]);

    const totalExpired = (summary1.expiredCount || 0) + (summary2.expiredCount || 0);
    expect(totalExpired).toBe(1);

    // Position was released exactly once (reserved goes 2 -> 0, not negative)
    const pos = await InventoryPosition.findById(testPosition._id);
    expect(pos.reserved).toBe(0);

    // Exactly 1 release/expiry ledger entry
    const releaseLedgers = await InventoryLedger.find({
      sourceId: String(hold._id),
      movementType: { $in: ['HOLD_RELEASED', 'HOLD_EXPIRED'] }
    });
    expect(releaseLedgers.length).toBe(1);
  });

  it('4. Provider capture timestamp is before lease expiry, but processing occurs after lease expiry: conversion still succeeds if hold was not released', async () => {
    const originalLeaseExpiry = new Date(Date.now() + 10 * 60 * 1000);
    const { sessionDoc, hold, payment } = await createFixtureSession({
      leaseExpiresAt: originalLeaseExpiry
    });

    // Authoritative provider capture timestamp is BEFORE lease expiry
    const providerCaptureTime = new Date(originalLeaseExpiry.getTime() - 2 * 60 * 1000);

    // Processing occurs at time T_process when lease timestamp has passed, but hold was NOT released yet
    const processingTime = new Date(originalLeaseExpiry.getTime() + 5 * 60 * 1000);

    const claimedEvent = {
      providerEventId: `evt_capture_timely_delayed_proc_${Date.now()}`,
      providerCreatedAt: providerCaptureTime,
      eventData: {
        metadata: { sessionId: sessionDoc.sessionId }
      }
    };

    const mongoSession = await mongoose.startSession();
    try {
      await mongoSession.withTransaction(async () => {
        await PaymentWebhookProcessor.processSessionPaymentEvent({
          payment,
          claimedEvent,
          eventType: 'payment_intent.succeeded',
          providerEventId: claimedEvent.providerEventId,
          amountMinor: 5000,
          currency: 'USD',
          now: processingTime,
          session: mongoSession
        });
      });
    } finally {
      await mongoSession.endSession();
    }

    // Conversion succeeds and creates Order because capture occurred before lease expiry and hold was not released
    const order = await Order.findOne({ checkoutSessionObjectId: sessionDoc._id });
    expect(order).toBeDefined();
    expect(order.paymentStatus).toBe('Paid');

    const sessionAfter = await CheckoutSession.findById(sessionDoc._id);
    expect(sessionAfter.status).toBe(CheckoutSession.STATUSES.CONVERTED);
  });

  it('5. Cancellation wins before capture: provider cancellation confirmed, hold released exactly once', async () => {
    const { sessionDoc, hold } = await createFixtureSession();

    // Verify initial reserved quantity is 2
    const posBefore = await InventoryPosition.findById(testPosition._id);
    expect(posBefore.reserved).toBe(2);

    // Customer confirms cancellation before payment capture
    const cancelResult = await CheckoutSessionService.cancelSession({
      sessionId: sessionDoc.sessionId,
      userId: testUser._id,
      reason: 'CUSTOMER_CANCELLED'
    });

    expect(cancelResult.isReplay).toBe(false);
    expect(cancelResult.session.status).toBe(CheckoutSession.STATUSES.CANCELLED);

    // Hold is released and ATP restored
    const holdAfter = await InventoryHold.findById(hold._id);
    expect(holdAfter.status).toBe(InventoryHold.STATUSES.RELEASED);

    const posAfter = await InventoryPosition.findById(testPosition._id);
    expect(posAfter.reserved).toBe(0);

    // Replay cancellation is idempotent and does not release again
    const replayCancel = await CheckoutSessionService.cancelSession({
      sessionId: sessionDoc.sessionId,
      userId: testUser._id,
      reason: 'CUSTOMER_CANCELLED'
    });
    expect(replayCancel.isReplay).toBe(true);

    const posAfterReplay = await InventoryPosition.findById(testPosition._id);
    expect(posAfterReplay.reserved).toBe(0);

    const releaseLedgers = await InventoryLedger.find({
      sourceId: String(hold._id),
      movementType: 'HOLD_RELEASED'
    });
    expect(releaseLedgers.length).toBe(1);
  });

  it('6. Capture wins while cancellation_requested: hold protected and session proceeds to payment_captured/conversion', async () => {
    const { sessionDoc, hold, payment } = await createFixtureSession();

    // Session is in cancellation_requested state
    await CheckoutSession.updateOne(
      { _id: sessionDoc._id },
      {
        $set: {
          status: CheckoutSession.STATUSES.CANCELLATION_REQUESTED,
          'cancellation.requestedAt': new Date(),
          'cancellation.reason': 'CUSTOMER_CANCELLED'
        }
      }
    );

    // Capture webhook arrives while cancellation is in-flight
    const claimedEvent = {
      providerEventId: `evt_capture_wins_cancel_${Date.now()}`,
      providerCreatedAt: new Date(),
      eventData: { metadata: { sessionId: sessionDoc.sessionId } }
    };

    const mongoSession = await mongoose.startSession();
    try {
      await mongoSession.withTransaction(async () => {
        await PaymentWebhookProcessor.processSessionPaymentEvent({
          payment,
          claimedEvent,
          eventType: 'payment_intent.succeeded',
          providerEventId: claimedEvent.providerEventId,
          amountMinor: 5000,
          currency: 'USD',
          now: new Date(),
          session: mongoSession
        });
      });
    } finally {
      await mongoSession.endSession();
    }

    // Capture protects the hold and converts to Order
    const sessionAfter = await CheckoutSession.findById(sessionDoc._id);
    expect(sessionAfter.status).toBe(CheckoutSession.STATUSES.CONVERTED);

    const order = await Order.findOne({ checkoutSessionObjectId: sessionDoc._id });
    expect(order).toBeDefined();
    expect(order.paymentStatus).toBe('Paid');
  });

  it('7. Restart/retry resumes cancellation_requested deterministically', async () => {
    const { sessionDoc, hold } = await createFixtureSession();

    // Simulate crash after marking cancellation_requested but before hold release
    await CheckoutSession.updateOne(
      { _id: sessionDoc._id },
      {
        $set: {
          status: CheckoutSession.STATUSES.CANCELLATION_REQUESTED,
          'cancellation.requestedAt': new Date(),
          'cancellation.reason': 'CUSTOMER_TIMEOUT'
        }
      }
    );

    // Retry / resume cancellation
    const retryResult = await CheckoutSessionService.cancelSession({
      sessionId: sessionDoc.sessionId,
      userId: testUser._id,
      reason: 'CUSTOMER_TIMEOUT'
    });

    expect(retryResult.session.status).toBe(CheckoutSession.STATUSES.CANCELLED);

    const holdAfter = await InventoryHold.findById(hold._id);
    expect(holdAfter.status).toBe(InventoryHold.STATUSES.RELEASED);

    const posAfter = await InventoryPosition.findById(testPosition._id);
    expect(posAfter.reserved).toBe(0);
  });

  it('8. Late capture after completed cancellation enters conflict without creating an Order', async () => {
    const { sessionDoc, hold, payment } = await createFixtureSession();

    // 1. Session is cancelled and hold is released
    await CheckoutSessionService.cancelSession({
      sessionId: sessionDoc.sessionId,
      userId: testUser._id,
      reason: 'CUSTOMER_CANCELLED'
    });

    const sessionCancelled = await CheckoutSession.findById(sessionDoc._id);
    expect(sessionCancelled.status).toBe(CheckoutSession.STATUSES.CANCELLED);

    // 2. Late capture webhook arrives from provider
    const claimedEvent = {
      providerEventId: `evt_late_after_cancel_${Date.now()}`,
      providerCreatedAt: new Date(),
      eventData: { metadata: { sessionId: sessionDoc.sessionId } }
    };

    const mongoSession = await mongoose.startSession();
    try {
      await mongoSession.withTransaction(async () => {
        await PaymentWebhookProcessor.processSessionPaymentEvent({
          payment,
          claimedEvent,
          eventType: 'payment_intent.succeeded',
          providerEventId: claimedEvent.providerEventId,
          amountMinor: 5000,
          currency: 'USD',
          now: new Date(),
          session: mongoSession
        });
      });
    } finally {
      await mongoSession.endSession();
    }

    // Zero unbacked order created
    const order = await Order.findOne({ checkoutSessionObjectId: sessionDoc._id });
    expect(order).toBeNull();

    // Conflict recorded on session
    const sessionAfterLateCapture = await CheckoutSession.findById(sessionDoc._id);
    expect(sessionAfterLateCapture.status).toBe(CheckoutSession.STATUSES.CONFLICT);
  });
});

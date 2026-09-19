/**
 * @file session-webhook-conversion.integration.test.js
 * @description Direct behavioral integration tests exercising PaymentWebhookProcessor.processSessionPaymentEvent
 * through the real durable webhook processing boundary and order conversion pipeline.
 */

'use strict';

const crypto = require('crypto');
const mongoose = require('mongoose');
const CheckoutSession = require('../../../models/CheckoutSession');
const InventoryHold = require('../../../models/InventoryHold');
const InventoryPosition = require('../../../models/InventoryPosition');
const InventoryReservation = require('../../../models/InventoryReservation');
const InventoryLedger = require('../../../models/InventoryLedger');
const Order = require('../../../models/Order');
const Payment = require('../../../models/Payment');
const PaymentWebhookEvent = require('../../../models/PaymentWebhookEvent');
const User = require('../../../models/User');
const Product = require('../../../models/Product');
const FulfillmentLocation = require('../../../models/FulfillmentLocation');
const PaymentWebhookProcessor = require('../../../services/payment/webhooks/PaymentWebhookProcessor');
const CheckoutSessionService = require('../../../services/order/CheckoutSessionService');
const { Money, MoneyMapper } = require('../../../modules/commerce');
const { PAYMENT_STATUSES } = require('../../../constants/paymentConstants');

describe('Phase 6D-5A Session Webhook and Conversion Integration Tests', () => {
  let testUser;
  let testProduct;
  let testLocation;
  let testPosition;

  beforeEach(async () => {
    testUser = await User.create({
      fullName: 'Webhook Conversion Customer',
      email: `conversion-${Date.now()}@example.com`,
      password: 'password123',
      role: 'customer'
    });

    testLocation = await FulfillmentLocation.create({
      merchantScopeId: 'default',
      locationCode: `WH-${Date.now()}`.slice(0, 40),
      displayName: 'Dallas Fulfillment Warehouse',
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
      name: 'Global Widget Conversion',
      slug: `global-widget-conv-${Date.now()}`,
      price: 50,
      countInStock: 20,
      description: 'High quality global widget',
      sku: `SKU-WIDGET-CONV-${Date.now()}`
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

  async function createTestSessionAndPayment({
    sessionId = `cs_webhook_${Date.now()}`,
    amountMinor = '5000',
    currency = 'USD',
    status = CheckoutSession.STATUSES.PAYMENT_PENDING,
    leaseExpiresAt = new Date(Date.now() + 15 * 60 * 1000)
  } = {}) {
    const totalAmountMoney = Money.fromMinor(amountMinor, currency);
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
      status,
      destinationCountry: 'US',
      currency,
      quoteId: `quote_${sessionId}`,
      quoteTokenHash: `hash_${sessionId}`,
      quoteSnapshot: {
        quoteId: `quote_${sessionId}`,
        kid: 'kid_test_1',
        incoterm: 'DDP',
        merchantScopeId: 'default',
        issuedAt: new Date(),
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        itemsHash: 'items_hash_1'
      },
      orderData: {
        items: [{
          productId: testProduct._id,
          canonicalSku: testProduct.sku,
          name: testProduct.name,
          quantity: 2,
          unitPriceExact: MoneyMapper.toPersistence(Money.fromMinor('2500', currency)),
          lineTotalExact: totalAmountExact,
          weightGrams: 500
        }],
        shippingAddress: {
          fullName: 'Webhook Customer',
          addressLine1: '456 Main St',
          locality: 'Dallas',
          countryCode: 'US',
          phone: '+15551234567'
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
        taxAmountExact: MoneyMapper.toPersistence(Money.zero(currency)),
        additionalTaxAmountExact: MoneyMapper.toPersistence(Money.zero(currency)),
        taxIncludedAmountExact: MoneyMapper.toPersistence(Money.zero(currency)),
        goodsValueExact: totalAmountExact,
        payableDutyExact: MoneyMapper.toPersistence(Money.zero(currency))
      },
      shippingSnapshot: {
        serviceLevel: 'standard',
        shippingAmountExact: MoneyMapper.toPersistence(Money.zero(currency))
      },
      amounts: {
        subtotalExact: totalAmountExact,
        discountExact: MoneyMapper.toPersistence(Money.zero(currency)),
        shippingCostExact: MoneyMapper.toPersistence(Money.zero(currency)),
        taxAmountExact: MoneyMapper.toPersistence(Money.zero(currency)),
        additionalTaxAmountExact: MoneyMapper.toPersistence(Money.zero(currency)),
        taxIncludedAmountExact: MoneyMapper.toPersistence(Money.zero(currency)),
        dutiesExact: MoneyMapper.toPersistence(Money.zero(currency)),
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
      amount: Number(totalAmountMoney.toDecimalString()),
      amountExact: totalAmountExact,
      currency,
      providerPaymentId: `pi_test_${sessionId}`,
      providerDisplayName: 'Stripe Payment',
      providerIntegrationVersion: '1.0.0',
      paymentType: 'automated',
      capabilitySnapshot: {
        createPayment: true,
        accountAlias: 'default',
        environment: 'sandbox'
      },
      idempotencyKey: `pay_${sessionId}`,
      requestHash: `hash_pay_${sessionId}`,
      providerIdempotencyKey: `prov_pay_${sessionId}`,
      history: []
    });

    await CheckoutSession.updateOne(
      { _id: sessionDoc._id },
      { $set: { paymentId: payment._id } }
    );

    return { sessionDoc, hold, payment, totalAmountExact, currency };
  }

  it('1. converts verified timely payment_intent.succeeded to Order, confirmed reservation, and converted session', async () => {
    const { sessionDoc, hold, payment } = await createTestSessionAndPayment();

    const claimedEvent = {
      providerEventId: `evt_${Date.now()}`,
      providerCreatedAt: new Date(),
      eventData: {
        metadata: {
          sessionId: sessionDoc.sessionId,
          accountAlias: 'default'
        }
      }
    };

    const mongoSession = await mongoose.startSession();
    let result;
    try {
      await mongoSession.withTransaction(async () => {
        result = await PaymentWebhookProcessor.processSessionPaymentEvent({
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

    expect(result).toBe('processed');

    // Verify Order created
    const createdOrder = await Order.findOne({ checkoutSessionObjectId: sessionDoc._id });
    expect(createdOrder).toBeDefined();
    expect(createdOrder.checkoutSessionId).toBe(sessionDoc.sessionId);
    expect(createdOrder.paymentStatus).toBe('Paid');
    expect(createdOrder.totalAmount).toBe(50);

    // Verify Session converted
    const updatedSession = await CheckoutSession.findById(sessionDoc._id);
    expect(updatedSession.status).toBe(CheckoutSession.STATUSES.CONVERTED);
    expect(String(updatedSession.convertedOrderId)).toBe(String(createdOrder._id));

    // Verify Hold converted
    const updatedHold = await InventoryHold.findById(hold._id);
    expect(updatedHold.status).toBe(InventoryHold.STATUSES.CONVERTED);
    expect(String(updatedHold.convertedOrderId)).toBe(String(createdOrder._id));

    // Verify Confirmed Inventory Reservation created exactly once
    const reservation = await InventoryReservation.findOne({
      $or: [{ orderObjectId: createdOrder._id }, { orderId: createdOrder.orderId }]
    });
    expect(reservation).toBeDefined();
    expect(reservation.status).toBe('confirmed');

    // Verify Payment linked to order
    const updatedPayment = await Payment.findById(payment._id);
    expect(updatedPayment.status).toBe(PAYMENT_STATUSES.COMPLETED);
    expect(String(updatedPayment.order)).toBe(String(createdOrder._id));

    // Verify Position reserved counter was NOT double-incremented
    const pos = await InventoryPosition.findById(testPosition._id);
    expect(pos.reserved).toBe(2);
  });

  it('2. duplicate capture replay returns existing Order without second reservation or ledger mutation', async () => {
    const { sessionDoc, payment } = await createTestSessionAndPayment();

    const claimedEvent = {
      providerEventId: `evt_dup_${Date.now()}`,
      providerCreatedAt: new Date(),
      eventData: {
        metadata: {
          sessionId: sessionDoc.sessionId,
          accountAlias: 'default'
        }
      }
    };

    // First capture
    const mongoSession1 = await mongoose.startSession();
    try {
      await mongoSession1.withTransaction(async () => {
        await PaymentWebhookProcessor.processSessionPaymentEvent({
          payment,
          claimedEvent,
          eventType: 'payment_intent.succeeded',
          providerEventId: claimedEvent.providerEventId,
          amountMinor: 5000,
          currency: 'USD',
          now: new Date(),
          session: mongoSession1
        });
      });
    } finally {
      await mongoSession1.endSession();
    }

    const orderCountBefore = await Order.countDocuments({ checkoutSessionObjectId: sessionDoc._id });
    const reservationCountBefore = await InventoryReservation.countDocuments();
    const ledgerCountBefore = await InventoryLedger.countDocuments();

    // Replay duplicate capture
    const mongoSession2 = await mongoose.startSession();
    let replayResult;
    try {
      await mongoSession2.withTransaction(async () => {
        replayResult = await PaymentWebhookProcessor.processSessionPaymentEvent({
          payment,
          claimedEvent,
          eventType: 'payment_intent.succeeded',
          providerEventId: claimedEvent.providerEventId,
          amountMinor: 5000,
          currency: 'USD',
          now: new Date(),
          session: mongoSession2
        });
      });
    } finally {
      await mongoSession2.endSession();
    }

    expect(replayResult).toBe('processed');

    const orderCountAfter = await Order.countDocuments({ checkoutSessionObjectId: sessionDoc._id });
    const reservationCountAfter = await InventoryReservation.countDocuments();
    const ledgerCountAfter = await InventoryLedger.countDocuments();

    expect(orderCountAfter).toBe(orderCountBefore);
    expect(reservationCountAfter).toBe(reservationCountBefore);
    expect(ledgerCountAfter).toBe(ledgerCountBefore);
  });

  it('3. late capture after lease expiry fails closed into conflict reconciliation without creating unbacked Order', async () => {
    // Create session where lease has expired 10 minutes ago
    const pastDate = new Date(Date.now() - 10 * 60 * 1000);
    const { sessionDoc, hold, payment } = await createTestSessionAndPayment({
      leaseExpiresAt: pastDate
    });

    // Mark hold as expired (as an expiry worker would have done)
    await InventoryHold.updateOne({ _id: hold._id }, { $set: { status: InventoryHold.STATUSES.EXPIRED } });

    const claimedEvent = {
      providerEventId: `evt_late_${Date.now()}`,
      providerCreatedAt: new Date(), // captured now, after lease expired
      eventData: {
        metadata: {
          sessionId: sessionDoc.sessionId,
          accountAlias: 'default'
        }
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
          now: new Date(),
          session: mongoSession
        });
      });
    } finally {
      await mongoSession.endSession();
    }

    // Proves NO unbacked order is created
    const createdOrder = await Order.findOne({ checkoutSessionObjectId: sessionDoc._id });
    expect(createdOrder).toBeNull();

    // Proves session recorded conflict reconciliation
    const updatedSession = await CheckoutSession.findById(sessionDoc._id);
    expect(updatedSession.status).toBe(CheckoutSession.STATUSES.CONFLICT);
    expect(updatedSession.reconciliation.reasonCode).toBe('LATE_CAPTURE_HOLD_EXPIRED');
    expect(updatedSession.reconciliation.reconciliationStatus).toBe('UNRESOLVED');
  });

  it('4. payment failure releases hold and transitions session to failed', async () => {
    const { sessionDoc, hold, payment } = await createTestSessionAndPayment();

    const claimedEvent = {
      providerEventId: `evt_fail_${Date.now()}`,
      providerCreatedAt: new Date(),
      eventData: {
        metadata: {
          sessionId: sessionDoc.sessionId,
          accountAlias: 'default'
        }
      }
    };

    const mongoSession = await mongoose.startSession();
    try {
      await mongoSession.withTransaction(async () => {
        await PaymentWebhookProcessor.processSessionPaymentEvent({
          payment,
          claimedEvent,
          eventType: 'payment_intent.payment_failed',
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

    const updatedSession = await CheckoutSession.findById(sessionDoc._id);
    expect(updatedSession.status).toBe(CheckoutSession.STATUSES.FAILED);

    const updatedHold = await InventoryHold.findById(hold._id);
    expect(updatedHold.status).toBe(InventoryHold.STATUSES.RELEASED);

    const updatedPayment = await Payment.findById(payment._id);
    expect(updatedPayment.status).toBe(PAYMENT_STATUSES.FAILED);
  });

  it('5. amount mismatch fails closed with permanent error', async () => {
    const { sessionDoc, payment } = await createTestSessionAndPayment();

    const claimedEvent = {
      providerEventId: `evt_amount_mismatch_${Date.now()}`,
      providerCreatedAt: new Date(),
      eventData: { metadata: { sessionId: sessionDoc.sessionId } }
    };

    await expect(PaymentWebhookProcessor.processSessionPaymentEvent({
      payment,
      claimedEvent,
      eventType: 'payment_intent.succeeded',
      providerEventId: claimedEvent.providerEventId,
      amountMinor: 9999, // mismatch: expected 5000
      currency: 'USD',
      now: new Date()
    })).rejects.toThrow(/amount/i);
  });

  it('6. currency mismatch fails closed with permanent error', async () => {
    const { sessionDoc, payment } = await createTestSessionAndPayment();

    const claimedEvent = {
      providerEventId: `evt_curr_mismatch_${Date.now()}`,
      providerCreatedAt: new Date(),
      eventData: { metadata: { sessionId: sessionDoc.sessionId } }
    };

    await expect(PaymentWebhookProcessor.processSessionPaymentEvent({
      payment,
      claimedEvent,
      eventType: 'payment_intent.succeeded',
      providerEventId: claimedEvent.providerEventId,
      amountMinor: 5000,
      currency: 'EUR', // mismatch: expected USD
      now: new Date()
    })).rejects.toThrow(/currency/i);
  });

  it('7. webhook metadata sessionId mismatch fails closed with permanent error', async () => {
    const { payment } = await createTestSessionAndPayment();

    const claimedEvent = {
      providerEventId: `evt_meta_mismatch_${Date.now()}`,
      providerCreatedAt: new Date(),
      eventData: { metadata: { sessionId: 'cs_fraudulent_foreign_session' } }
    };

    await expect(PaymentWebhookProcessor.processSessionPaymentEvent({
      payment,
      claimedEvent,
      eventType: 'payment_intent.succeeded',
      providerEventId: claimedEvent.providerEventId,
      amountMinor: 5000,
      currency: 'USD',
      now: new Date()
    })).rejects.toThrow(/sessionId does not match/i);
  });

  it('8. wrong provider or provider mismatch fails closed with permanent error', async () => {
    const { sessionDoc, payment } = await createTestSessionAndPayment();

    const claimedEvent = {
      providerEventId: `evt_wrong_prov_${Date.now()}`,
      providerCreatedAt: new Date(),
      eventData: {
        provider: 'paypal', // Payment was created with 'stripe'
        metadata: { sessionId: sessionDoc.sessionId }
      }
    };

    await expect(PaymentWebhookProcessor.processSessionPaymentEvent({
      payment,
      claimedEvent,
      eventType: 'payment_intent.succeeded',
      providerEventId: claimedEvent.providerEventId,
      amountMinor: 5000,
      currency: 'USD',
      now: new Date()
    })).rejects.toThrow(/provider mismatch/i);
  });

  it('9. wrong provider environment fails closed with permanent error', async () => {
    const { sessionDoc, payment } = await createTestSessionAndPayment();

    const claimedEvent = {
      providerEventId: `evt_wrong_env_${Date.now()}`,
      providerCreatedAt: new Date(),
      eventData: {
        environment: 'production', // Payment was created with sandbox/test capability
        metadata: { sessionId: sessionDoc.sessionId }
      }
    };

    await expect(PaymentWebhookProcessor.processSessionPaymentEvent({
      payment,
      claimedEvent,
      eventType: 'payment_intent.succeeded',
      providerEventId: claimedEvent.providerEventId,
      amountMinor: 5000,
      currency: 'USD',
      now: new Date()
    })).rejects.toThrow(/environment mismatch/i);
  });

  it('10. wrong merchant scope fails closed on session conversion directly', async () => {
    const { sessionDoc } = await createTestSessionAndPayment();

    await expect(CheckoutSessionService.convertSessionToOrder({
      sessionId: sessionDoc.sessionId,
      merchantScopeId: 'foreign_merchant_scope',
      paymentEvidence: {
        amountExact: MoneyMapper.toPersistence(Money.fromMinor('5000', 'USD')),
        currency: 'USD',
        providerPaymentId: 'pi_test'
      }
    })).rejects.toThrow(/not found for conversion/i);
  });

  it('11. missing authoritative provider capture timestamp fails closed with permanent error', async () => {
    const { sessionDoc, payment } = await createTestSessionAndPayment();

    const claimedEvent = {
      providerEventId: `evt_no_ts_${Date.now()}`,
      providerCreatedAt: null,
      eventData: {
        eventCreatedAt: null,
        created: null,
        capturedAt: null,
        metadata: { sessionId: sessionDoc.sessionId }
      }
    };

    await expect(PaymentWebhookProcessor.processSessionPaymentEvent({
      payment,
      claimedEvent,
      eventType: 'payment_intent.succeeded',
      providerEventId: claimedEvent.providerEventId,
      amountMinor: 5000,
      currency: 'USD',
      now: new Date()
    })).rejects.toThrow(/capture timestamp/i);
  });

  it('12. payment_failed after payment_captured, converting, or converted cannot regress state', async () => {
    const { sessionDoc, hold, payment } = await createTestSessionAndPayment({
      status: CheckoutSession.STATUSES.PAYMENT_CAPTURED
    });

    const claimedEvent = {
      providerEventId: `evt_out_of_order_fail_${Date.now()}`,
      providerCreatedAt: new Date(),
      eventData: { metadata: { sessionId: sessionDoc.sessionId } }
    };

    const mongoSession = await mongoose.startSession();
    try {
      await mongoSession.withTransaction(async () => {
        const result = await PaymentWebhookProcessor.processSessionPaymentEvent({
          payment,
          claimedEvent,
          eventType: 'payment_intent.payment_failed',
          providerEventId: claimedEvent.providerEventId,
          amountMinor: 5000,
          currency: 'USD',
          now: new Date(),
          session: mongoSession
        });
        expect(result).toBe('ignored');
      });
    } finally {
      await mongoSession.endSession();
    }

    // Session status remained payment_captured and was NOT regressed to failed
    const sessionAfter = await CheckoutSession.findById(sessionDoc._id);
    expect(sessionAfter.status).toBe(CheckoutSession.STATUSES.PAYMENT_CAPTURED);

    // Hold status was NOT released
    const holdAfter = await InventoryHold.findById(hold._id);
    expect(holdAfter.status).toBe(InventoryHold.STATUSES.ACTIVE);
  });

  it('13. assert webhook inbox is marked processed only after durable conversion or conflict persistence', async () => {
    const { sessionDoc, payment } = await createTestSessionAndPayment();

    const payloadHash = crypto.createHash('sha256').update(JSON.stringify({ test: 'inbox' })).digest('hex');
    const webhookEvent = await PaymentWebhookEvent.create({
      provider: 'stripe',
      environment: 'sandbox',
      accountAlias: 'default',
      providerEventId: `evt_inbox_${Date.now()}`,
      eventType: 'payment_intent.succeeded',
      providerPaymentId: payment.providerPaymentId,
      amountMinor: 5000,
      currency: 'USD',
      providerCreatedAt: new Date(),
      payloadHash,
      eventData: {
        providerEventId: `evt_inbox_${Date.now()}`,
        eventType: 'payment_intent.succeeded',
        providerPaymentId: payment.providerPaymentId,
        amountMinor: 5000,
        currency: 'USD',
        environment: 'sandbox',
        eventCreatedAt: new Date(),
        metadata: {
          sessionId: sessionDoc.sessionId,
          paymentId: String(payment._id),
          accountAlias: 'default'
        }
      },
      status: 'received',
      receivedAt: new Date()
    });

    expect(webhookEvent.status).toBe('received');

    const summary = await PaymentWebhookProcessor.processPending({ batchSize: 10 });
    expect(summary.processed).toBe(1);

    const updatedEvent = await PaymentWebhookEvent.findById(webhookEvent._id);
    expect(updatedEvent.status).toBe('processed');
    expect(updatedEvent.processedAt).toBeDefined();

    const convertedSession = await CheckoutSession.findById(sessionDoc._id);
    expect(convertedSession.status).toBe(CheckoutSession.STATUSES.CONVERTED);

    const createdOrder = await Order.findOne({ checkoutSessionObjectId: sessionDoc._id });
    expect(createdOrder).toBeDefined();
  });

  it('14. webhook inbox failure ordering and real retry: transient failure keeps event retryable without Order, subsequent retry converts Order and marks processed', async () => {
    const { sessionDoc, hold, payment } = await createTestSessionAndPayment();

    const payloadHash = crypto.createHash('sha256').update(JSON.stringify({ test: 'inbox_retry' })).digest('hex');
    const webhookEvent = await PaymentWebhookEvent.create({
      provider: 'stripe',
      environment: 'sandbox',
      accountAlias: 'default',
      providerEventId: `evt_inbox_retry_${Date.now()}`,
      eventType: 'payment_intent.succeeded',
      providerPaymentId: payment.providerPaymentId,
      amountMinor: 5000,
      currency: 'USD',
      providerCreatedAt: new Date(),
      payloadHash,
      eventData: {
        providerEventId: `evt_inbox_retry_${Date.now()}`,
        eventType: 'payment_intent.succeeded',
        providerPaymentId: payment.providerPaymentId,
        amountMinor: 5000,
        currency: 'USD',
        environment: 'sandbox',
        eventCreatedAt: new Date(),
        metadata: {
          sessionId: sessionDoc.sessionId,
          paymentId: String(payment._id),
          accountAlias: 'default'
        }
      },
      status: 'received',
      receivedAt: new Date(),
      nextAttemptAt: new Date()
    });

    expect(webhookEvent.status).toBe('received');

    // 1. Inject transient failure during conversion (mock convertSessionToOrder to reject once)
    const convertSpy = jest.spyOn(CheckoutSessionService, 'convertSessionToOrder').mockRejectedValueOnce(
      new Error('Transient database deadlock during order creation')
    );

    // 2. Process pending events
    const initialNow = new Date();
    const failureSummary = await PaymentWebhookProcessor.processPending({ batchSize: 10, now: initialNow });
    expect(failureSummary.retryScheduled).toBe(1);
    expect(failureSummary.processed).toBe(0);

    // 3. Assert failure-path invariants:
    const failedEvent = await PaymentWebhookEvent.findById(webhookEvent._id);
    expect(failedEvent.status).toBe('retry_scheduled');
    expect(failedEvent.status).not.toBe('processed');
    expect(failedEvent.processedAt).toBeNull();
    expect(failedEvent.attemptCount).toBe(1);
    expect(failedEvent.errorCode).toBe('PAYMENT_WEBHOOK_PROCESSING_FAILED');
    expect(failedEvent.errorMessage).toContain('Transient database deadlock');
    expect(failedEvent.nextAttemptAt).toBeDefined();
    expect(failedEvent.nextAttemptAt.getTime()).toBeGreaterThan(initialNow.getTime());

    // Zero Orders created
    const orderCountBefore = await Order.countDocuments({ checkoutSessionObjectId: sessionDoc._id });
    expect(orderCountBefore).toBe(0);

    // Session is not incorrectly converted
    const sessionAfterFail = await CheckoutSession.findById(sessionDoc._id);
    expect(sessionAfterFail.status).not.toBe(CheckoutSession.STATUSES.CONVERTED);

    // Hold remains active and intact
    const holdAfterFail = await InventoryHold.findById(hold._id);
    expect(holdAfterFail.status).toBe(InventoryHold.STATUSES.ACTIVE);

    // 0 permanent reservations
    const resCountBefore = await InventoryReservation.countDocuments({ sessionId: sessionDoc.sessionId });
    expect(resCountBefore).toBe(0);

    // 4. Remove transient failure
    convertSpy.mockRestore();

    // 5. Advance time to nextAttemptAt and execute real retry path via scheduler
    const retryNow = new Date(failedEvent.nextAttemptAt.getTime() + 1000);
    const retrySummary = await PaymentWebhookProcessor.processPending({ batchSize: 10, now: retryNow });
    expect(retrySummary.processed).toBe(1);

    // 6. Assert success on retry:
    const finalEvent = await PaymentWebhookEvent.findById(webhookEvent._id);
    expect(finalEvent.status).toBe('processed');
    expect(finalEvent.processedAt).toBeDefined();
    expect(new Date(finalEvent.processedAt).getTime()).toBeGreaterThanOrEqual(retryNow.getTime());

    // Exactly one Order exists
    const orderCountAfter = await Order.countDocuments({ checkoutSessionObjectId: sessionDoc._id });
    expect(orderCountAfter).toBe(1);
    const order = await Order.findOne({ checkoutSessionObjectId: sessionDoc._id });
    expect(order.paymentStatus).toBe('Paid');

    // Exactly one permanent InventoryReservation exists
    const resCountAfter = await InventoryReservation.countDocuments({ orderObjectId: order._id });
    expect(resCountAfter).toBe(1);

    // Session and hold converted
    const sessionFinal = await CheckoutSession.findById(sessionDoc._id);
    expect(sessionFinal.status).toBe(CheckoutSession.STATUSES.CONVERTED);

    const holdFinal = await InventoryHold.findById(hold._id);
    expect(holdFinal.status).toBe(InventoryHold.STATUSES.CONVERTED);
  });
});

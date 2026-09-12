/**
 * @file payment-webhook-processing.integration.test.js
 * @description Integration tests for Webhook Lease-Based Processor, State Machine Transitions,
 *              Out-of-Order Safety, Currency Resolution, Refund Reconciliation, and Admin Health RBAC.
 */

'use strict';

const crypto = require('crypto');
const request = require('supertest');
const app = require('../../app');
const TokenService = require('../../services/TokenService');
const PaymentWebhookEvent = require('../../models/PaymentWebhookEvent');
const Payment = require('../../models/Payment');
const Order = require('../../models/Order');
const Session = require('../../models/Session');
const EmailService = require('../../services/EmailService');
const paymentWebhookProcessor = require('../../services/payment/webhooks/PaymentWebhookProcessor');
const {
  PAYMENT_STATUSES,
  WEBHOOK_PROCESSING_STATUSES
} = require('../../constants/paymentConstants');

let sequence = 0;

const createAuth = async (role = 'customer') => {
  sequence += 1;
  const user = await global.createTestUser({
    email: `webhook-test-${sequence}@example.com`,
    role
  });
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
    tokenVersion: user.tokenVersion
  });
  return {
    user,
    authorization: `Bearer ${accessToken}`
  };
};

const createTestOrderAndPayment = async ({
  amount = 50,
  currency = 'USD',
  provider = 'stripe',
  paymentStatus = PAYMENT_STATUSES.PROCESSING,
  paymentIntentId = `pi_${crypto.randomUUID()}`
} = {}) => {
  const { user } = await createAuth('customer');
  sequence += 1;

  const order = await Order.create({
    user: user._id,
    idempotencyKey: crypto.randomUUID(),
    requestHash: crypto.createHash('sha256').update(crypto.randomUUID()).digest('hex'),
    items: [{
      product: new (require('mongoose').Types.ObjectId)(),
      name: 'Webhook Test Item',
      sku: `SKU-${sequence}`,
      price: amount,
      quantity: 1,
      lineTotal: amount
    }],
    shippingAddress: {
      fullName: 'Webhook Customer',
      phone: '+1234567890',
      address: '100 Commerce Way',
      city: 'New York',
      province: 'NY',
      country: 'United States'
    },
    paymentMethod: provider,
    payment: {
      provider,
      paymentIntentId,
      status: paymentStatus === PAYMENT_STATUSES.COMPLETED ? 'Completed' : 'Pending',
      currency
    },
    currency,
    subtotal: amount,
    shippingCost: 0,
    taxAmount: 0,
    discount: 0,
    totalAmount: amount,
    orderStatus: paymentStatus === PAYMENT_STATUSES.COMPLETED ? 'Processing' : 'Pending',
    paymentStatus: paymentStatus === PAYMENT_STATUSES.COMPLETED ? 'Paid' : 'Pending',
    statusTimeline: [{
      status: 'Pending',
      actor: user._id,
      actorRole: user.role,
      timestamp: new Date()
    }]
  });

  const idempotencyKey = crypto.randomUUID();
  const requestHash = crypto.createHash('sha256').update(idempotencyKey).digest('hex');
  const providerIdempotencyKey = `pip_${crypto.randomUUID()}`;

  const payment = await Payment.create({
    order: order._id,
    user: user._id,
    amount,
    currency,
    provider,
    paymentIntentId,
    providerPaymentId: paymentIntentId,
    status: paymentStatus,
    idempotencyKey,
    requestHash,
    providerIdempotencyKey,
    providerAttemptStatus: 'Claimed'
  });

  return { user, order, payment, paymentIntentId };
};

describe('Phase 5B: Payment Webhook Processor Integration Tests', () => {
  beforeAll(async () => {
    await Promise.all([
      PaymentWebhookEvent.syncIndexes(),
      Payment.syncIndexes(),
      Order.syncIndexes(),
      Session.syncIndexes()
    ]);
  });

  beforeEach(async () => {
    await Promise.all([
      PaymentWebhookEvent.deleteMany({}),
      Payment.deleteMany({}),
      Order.deleteMany({}),
      Session.deleteMany({})
    ]);
    jest.clearAllMocks();
  });

  describe('1. Atomic Lease Claiming & Safety', () => {
    test('worker atomically claims a due event with bounded lease', async () => {
      const eventDoc = await PaymentWebhookEvent.create({
        provider: 'stripe',
        accountAlias: 'default',
        environment: 'sandbox',
        providerEventId: `evt_${crypto.randomUUID()}`,
        eventType: 'payment_intent.succeeded',
        providerPaymentId: 'pi_test_1',
        amountMinor: 5000,
        currency: 'USD',
        payloadHash: 'hash1',
        status: WEBHOOK_PROCESSING_STATUSES.RECEIVED,
        nextAttemptAt: new Date(Date.now() - 1000)
      });

      const leaseId = crypto.randomUUID();
      const claimed = await paymentWebhookProcessor.claimEvent({
        leaseId,
        leaseDurationMs: 30000
      });

      expect(claimed).not.toBeNull();
      expect(String(claimed._id)).toBe(String(eventDoc._id));
      expect(claimed.status).toBe(WEBHOOK_PROCESSING_STATUSES.PROCESSING);
      expect(claimed.leaseId).toBe(leaseId);
      expect(claimed.attemptCount).toBe(1);
    });

    test('active lease cannot be stolen by another worker concurrently', async () => {
      await PaymentWebhookEvent.create({
        provider: 'stripe',
        accountAlias: 'default',
        environment: 'sandbox',
        providerEventId: `evt_${crypto.randomUUID()}`,
        eventType: 'payment_intent.succeeded',
        providerPaymentId: 'pi_test_2',
        amountMinor: 5000,
        currency: 'USD',
        payloadHash: 'hash2',
        status: WEBHOOK_PROCESSING_STATUSES.RECEIVED,
        nextAttemptAt: new Date(Date.now() - 1000)
      });

      const worker1 = await paymentWebhookProcessor.claimEvent({ leaseDurationMs: 60000 });
      expect(worker1).not.toBeNull();

      // Worker 2 tries to claim while lease is active
      const worker2 = await paymentWebhookProcessor.claimEvent({ leaseDurationMs: 60000 });
      expect(worker2).toBeNull();
    });

    test('expired lease is safely reclaimed by another worker', async () => {
      const expiredTime = new Date(Date.now() - 5000);
      const pastEvent = await PaymentWebhookEvent.create({
        provider: 'stripe',
        accountAlias: 'default',
        environment: 'sandbox',
        providerEventId: `evt_${crypto.randomUUID()}`,
        eventType: 'payment_intent.succeeded',
        providerPaymentId: 'pi_test_3',
        amountMinor: 5000,
        currency: 'USD',
        payloadHash: 'hash3',
        status: WEBHOOK_PROCESSING_STATUSES.PROCESSING,
        leaseId: 'stale-lease-id',
        leaseAcquiredAt: new Date(Date.now() - 70000),
        leaseExpiresAt: expiredTime,
        attemptCount: 1
      });

      const newLeaseId = crypto.randomUUID();
      const reclaimed = await paymentWebhookProcessor.claimEvent({
        leaseId: newLeaseId,
        leaseDurationMs: 60000
      });

      expect(reclaimed).not.toBeNull();
      expect(String(reclaimed._id)).toBe(String(pastEvent._id));
      expect(reclaimed.leaseId).toBe(newLeaseId);
      expect(reclaimed.attemptCount).toBe(2);
    });
  });

  describe('2. State Machine Transitions & Out-of-Order Safety', () => {
    test('valid payment_intent.succeeded transitions payment to Completed and order to Paid', async () => {
      const { payment, order, paymentIntentId } = await createTestOrderAndPayment({
        amount: 100,
        currency: 'USD',
        paymentStatus: PAYMENT_STATUSES.PROCESSING
      });

      const sendEmailSpy = jest.spyOn(EmailService, 'send').mockResolvedValue({ success: true });

      const eventDoc = await PaymentWebhookEvent.create({
        provider: 'stripe',
        accountAlias: 'default',
        environment: 'sandbox',
        providerEventId: `evt_${crypto.randomUUID()}`,
        eventType: 'payment_intent.succeeded',
        providerPaymentId: paymentIntentId,
        amountMinor: 10000,
        currency: 'USD',
        payloadHash: 'hash_succeeded',
        status: WEBHOOK_PROCESSING_STATUSES.RECEIVED,
        nextAttemptAt: new Date(Date.now() - 1000)
      });

      const summary = await paymentWebhookProcessor.processPending({ batchSize: 10 });
      expect(summary.processed).toBe(1);

      // Verify payment updated
      const updatedPayment = await Payment.findById(payment._id);
      expect(updatedPayment.status).toBe(PAYMENT_STATUSES.COMPLETED);
      expect(updatedPayment.paidAmount).toBe(100);

      // Verify order updated
      const updatedOrder = await Order.findById(order._id);
      expect(updatedOrder.paymentStatus).toBe('Paid');
      expect(updatedOrder.payment.paymentIntentId).toBe(paymentIntentId);
      expect(updatedOrder.payment.paidAt).not.toBeNull();

      // Verify event doc updated
      const updatedEvent = await PaymentWebhookEvent.findById(eventDoc._id).select('+leaseId');
      expect(updatedEvent.status).toBe(WEBHOOK_PROCESSING_STATUSES.PROCESSED);
      expect(updatedEvent.processedAt).not.toBeNull();
      expect(updatedEvent.leaseId).toBe('');

      // Verify zero notification boundary
      expect(sendEmailSpy).not.toHaveBeenCalled();
      sendEmailSpy.mockRestore();
    });

    test('duplicate payment_intent.succeeded produces zero duplicate side effects', async () => {
      const { payment, order, paymentIntentId } = await createTestOrderAndPayment({
        amount: 100,
        currency: 'USD',
        paymentStatus: PAYMENT_STATUSES.COMPLETED
      });

      await PaymentWebhookEvent.create({
        provider: 'stripe',
        accountAlias: 'default',
        environment: 'sandbox',
        providerEventId: `evt_dup_${crypto.randomUUID()}`,
        eventType: 'payment_intent.succeeded',
        providerPaymentId: paymentIntentId,
        amountMinor: 10000,
        currency: 'USD',
        payloadHash: 'hash_dup',
        status: WEBHOOK_PROCESSING_STATUSES.RECEIVED,
        nextAttemptAt: new Date(Date.now() - 1000)
      });

      const initialTimelineLength = order.statusTimeline.length;

      const summary = await paymentWebhookProcessor.processPending({ batchSize: 10 });
      expect(summary.processed).toBe(1);

      const refreshedOrder = await Order.findById(order._id);
      expect(refreshedOrder.statusTimeline.length).toBe(initialTimelineLength);
    });

    test('out-of-order older failure event cannot reverse terminal Completed state', async () => {
      const { payment, order, paymentIntentId } = await createTestOrderAndPayment({
        amount: 100,
        currency: 'USD',
        paymentStatus: PAYMENT_STATUSES.COMPLETED
      });

      await PaymentWebhookEvent.create({
        provider: 'stripe',
        accountAlias: 'default',
        environment: 'sandbox',
        providerEventId: `evt_failed_late_${crypto.randomUUID()}`,
        eventType: 'payment_intent.payment_failed',
        providerPaymentId: paymentIntentId,
        amountMinor: 10000,
        currency: 'USD',
        payloadHash: 'hash_failed_late',
        status: WEBHOOK_PROCESSING_STATUSES.RECEIVED,
        nextAttemptAt: new Date(Date.now() - 1000)
      });

      const summary = await paymentWebhookProcessor.processPending({ batchSize: 10 });
      expect(summary.ignored).toBe(1);

      // Payment and order remain Completed / Paid
      const refreshedPayment = await Payment.findById(payment._id);
      expect(refreshedPayment.status).toBe(PAYMENT_STATUSES.COMPLETED);

      const refreshedOrder = await Order.findById(order._id);
      expect(refreshedOrder.paymentStatus).toBe('Paid');
    });

    test('unsupported authentic provider event is safely marked ignored', async () => {
      await PaymentWebhookEvent.create({
        provider: 'stripe',
        accountAlias: 'default',
        environment: 'sandbox',
        providerEventId: `evt_charge_${crypto.randomUUID()}`,
        eventType: 'charge.dispute.created',
        providerPaymentId: 'pi_unsupported',
        amountMinor: 5000,
        currency: 'USD',
        payloadHash: 'hash_unsupported',
        status: WEBHOOK_PROCESSING_STATUSES.RECEIVED,
        nextAttemptAt: new Date(Date.now() - 1000)
      });

      const summary = await paymentWebhookProcessor.processPending({ batchSize: 10 });
      expect(summary.ignored).toBe(1);

      const savedDoc = await PaymentWebhookEvent.findOne({ eventType: 'charge.dispute.created' });
      expect(savedDoc.status).toBe(WEBHOOK_PROCESSING_STATUSES.IGNORED);
      expect(savedDoc.processedAt).not.toBeNull();
    });
  });

  describe('3. Currency Resolution & Exact Amount Validation', () => {
    test('event with currency mismatch immediately transitions to dead-letter', async () => {
      const { paymentIntentId } = await createTestOrderAndPayment({
        amount: 100,
        currency: 'USD',
        paymentStatus: PAYMENT_STATUSES.PROCESSING
      });

      const eventDoc = await PaymentWebhookEvent.create({
        provider: 'stripe',
        accountAlias: 'default',
        environment: 'sandbox',
        providerEventId: `evt_curr_${crypto.randomUUID()}`,
        eventType: 'payment_intent.succeeded',
        providerPaymentId: paymentIntentId,
        amountMinor: 10000,
        currency: 'EUR', // MISMATCH (USD vs EUR)
        payloadHash: 'hash_curr_mismatch',
        status: WEBHOOK_PROCESSING_STATUSES.RECEIVED,
        nextAttemptAt: new Date(Date.now() - 1000)
      });

      const summary = await paymentWebhookProcessor.processPending({ batchSize: 10 });
      expect(summary.deadLettered).toBe(1);

      const updatedEvent = await PaymentWebhookEvent.findById(eventDoc._id);
      expect(updatedEvent.status).toBe(WEBHOOK_PROCESSING_STATUSES.DEAD_LETTER);
      expect(updatedEvent.errorCode).toBe('PAYMENT_ORDER_CURRENCY_MISMATCH');
    });

    test('event with amount mismatch immediately transitions to dead-letter', async () => {
      const { paymentIntentId } = await createTestOrderAndPayment({
        amount: 100, // 100.00 -> 10000 minor
        currency: 'USD',
        paymentStatus: PAYMENT_STATUSES.PROCESSING
      });

      const eventDoc = await PaymentWebhookEvent.create({
        provider: 'stripe',
        accountAlias: 'default',
        environment: 'sandbox',
        providerEventId: `evt_amt_${crypto.randomUUID()}`,
        eventType: 'payment_intent.succeeded',
        providerPaymentId: paymentIntentId,
        amountMinor: 5000, // MISMATCH (5000 vs 10000 minor)
        currency: 'USD',
        payloadHash: 'hash_amt_mismatch',
        status: WEBHOOK_PROCESSING_STATUSES.RECEIVED,
        nextAttemptAt: new Date(Date.now() - 1000)
      });

      const summary = await paymentWebhookProcessor.processPending({ batchSize: 10 });
      expect(summary.deadLettered).toBe(1);

      const updatedEvent = await PaymentWebhookEvent.findById(eventDoc._id);
      expect(updatedEvent.status).toBe(WEBHOOK_PROCESSING_STATUSES.DEAD_LETTER);
      expect(updatedEvent.errorCode).toBe('PAYMENT_AMOUNT_MISMATCH');
    });

    test('missing payment reference schedules bounded retry until maxAttempts', async () => {
      const eventDoc = await PaymentWebhookEvent.create({
        provider: 'stripe',
        accountAlias: 'default',
        environment: 'sandbox',
        providerEventId: `evt_missing_${crypto.randomUUID()}`,
        eventType: 'payment_intent.succeeded',
        providerPaymentId: 'pi_non_existent',
        amountMinor: 5000,
        currency: 'USD',
        payloadHash: 'hash_missing',
        status: WEBHOOK_PROCESSING_STATUSES.RECEIVED,
        nextAttemptAt: new Date(Date.now() - 1000)
      });

      // Attempt 1: retry_scheduled
      const summary1 = await paymentWebhookProcessor.processPending({ batchSize: 10, maxAttempts: 3 });
      expect(summary1.retryScheduled).toBe(1);

      let updatedEvent = await PaymentWebhookEvent.findById(eventDoc._id);
      expect(updatedEvent.status).toBe(WEBHOOK_PROCESSING_STATUSES.RETRY_SCHEDULED);
      expect(updatedEvent.attemptCount).toBe(1);

      // Force nextAttemptAt to past to simulate next retry
      updatedEvent.nextAttemptAt = new Date(Date.now() - 1000);
      await updatedEvent.save();

      // Attempt 2: retry_scheduled
      const summary2 = await paymentWebhookProcessor.processPending({ batchSize: 10, maxAttempts: 3 });
      expect(summary2.retryScheduled).toBe(1);

      updatedEvent = await PaymentWebhookEvent.findById(eventDoc._id);
      expect(updatedEvent.attemptCount).toBe(2);
      updatedEvent.nextAttemptAt = new Date(Date.now() - 1000);
      await updatedEvent.save();

      // Attempt 3: maxAttempts reached -> dead_letter
      const summary3 = await paymentWebhookProcessor.processPending({ batchSize: 10, maxAttempts: 3 });
      expect(summary3.deadLettered).toBe(1);

      updatedEvent = await PaymentWebhookEvent.findById(eventDoc._id);
      expect(updatedEvent.status).toBe(WEBHOOK_PROCESSING_STATUSES.DEAD_LETTER);
      expect(updatedEvent.deadLetteredAt).not.toBeNull();
    });
  });

  describe('4. Admin Webhook Health RBAC & Privacy', () => {
    test('anonymous request to admin health endpoint returns 401', async () => {
      const response = await request(app).get('/api/admin/payments/webhooks/health');
      expect(response.status).toBe(401);
    });

    test('customer and manager roles are forbidden (403)', async () => {
      const customerAuth = await createAuth('customer');
      const res1 = await request(app)
        .get('/api/admin/payments/webhooks/health')
        .set('Authorization', customerAuth.authorization);
      expect(res1.status).toBe(403);

      const managerAuth = await createAuth('manager');
      const res2 = await request(app)
        .get('/api/admin/payments/webhooks/health')
        .set('Authorization', managerAuth.authorization);
      expect(res2.status).toBe(403);
    });

    test('admin receives sanitized aggregate statistics with zero sensitive fields', async () => {
      await PaymentWebhookEvent.create({
        provider: 'stripe',
        accountAlias: 'default',
        environment: 'sandbox',
        providerEventId: 'evt_health_1',
        eventType: 'payment_intent.succeeded',
        providerPaymentId: 'pi_health_1',
        amountMinor: 5000,
        currency: 'USD',
        payloadHash: 'hash_secret_123',
        status: WEBHOOK_PROCESSING_STATUSES.PROCESSED,
        processedAt: new Date()
      });

      const adminAuth = await createAuth('admin');
      const response = await request(app)
        .get('/api/admin/payments/webhooks/health')
        .set('Authorization', adminAuth.authorization);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toMatchObject({
        counts: {
          received: 0,
          processing: 0,
          retry_scheduled: 0,
          processed: 1,
          ignored: 0,
          dead_letter: 0
        },
        totalCount: 1
      });

      // Assert zero sensitive data exposure
      const responseStr = JSON.stringify(response.body);
      expect(responseStr).not.toContain('hash_secret_123');
      expect(responseStr).not.toContain('payloadHash');
      expect(responseStr).not.toContain('pi_health_1');
      expect(responseStr).not.toContain('evt_health_1');
    });
  });
});

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
const Refund = require('../../models/Refund');
const Product = require('../../models/Product');
const Session = require('../../models/Session');
const EmailService = require('../../services/EmailService');
const paymentWebhookProcessor = require('../../services/payment/webhooks/PaymentWebhookProcessor');
const {
  PAYMENT_STATUSES,
  REFUND_STATUSES,
  WEBHOOK_PROCESSING_STATUSES
} = require('../../constants/paymentConstants');
const { Money, MoneyMapper } = require('../../modules/commerce');

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
  amountExact = null,
  currency = 'USD',
  provider = 'stripe',
  accountAlias = 'default',
  environment = 'sandbox',
  paymentStatus = PAYMENT_STATUSES.PROCESSING,
  paymentIntentId = `pi_${crypto.randomUUID()}`
} = {}) => {
  const { user } = await createAuth('customer');
  sequence += 1;

  const resolvedAmountExact = amountExact
    ? (amountExact.registrySnapshot ? amountExact : MoneyMapper.toPersistence(amountExact))
    : MoneyMapper.fromLegacy(amount, currency);

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
    totalAmountExact: resolvedAmountExact,
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
    amountExact: resolvedAmountExact,
    currency,
    provider,
    paymentIntentId,
    providerPaymentId: paymentIntentId,
    status: paymentStatus,
    capabilitySnapshot: {
      accountAlias,
      environment
    },
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
      Refund.syncIndexes(),
      Product.syncIndexes(),
      Session.syncIndexes()
    ]);
  });

  beforeEach(async () => {
    await Promise.all([
      PaymentWebhookEvent.deleteMany({}),
      Payment.deleteMany({}),
      Order.deleteMany({}),
      Refund.deleteMany({}),
      Product.deleteMany({}),
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
        status: WEBHOOK_PROCESSING_STATUSES.PROCESSING,
        leaseId: crypto.randomUUID(),
        leaseExpiresAt: new Date(Date.now() + 60000),
        nextAttemptAt: new Date(Date.now() - 1000)
      });

      const secondClaim = await paymentWebhookProcessor.claimEvent({
        leaseId: crypto.randomUUID(),
        now: new Date()
      });

      expect(secondClaim).toBeNull();
    });

    test('expired lease is safely reclaimed by another worker', async () => {
      const eventDoc = await PaymentWebhookEvent.create({
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
        leaseId: crypto.randomUUID(),
        leaseExpiresAt: new Date(Date.now() - 5000), // Expired 5 seconds ago
        nextAttemptAt: new Date(Date.now() - 1000)
      });

      const newLeaseId = crypto.randomUUID();
      const reclaimed = await paymentWebhookProcessor.claimEvent({
        leaseId: newLeaseId,
        now: new Date()
      });

      expect(reclaimed).not.toBeNull();
      expect(String(reclaimed._id)).toBe(String(eventDoc._id));
      expect(reclaimed.leaseId).toBe(newLeaseId);
      expect(reclaimed.status).toBe(WEBHOOK_PROCESSING_STATUSES.PROCESSING);
    });
  });

  describe('2. State Machine Transitions & Out-of-Order Safety', () => {
    test('valid payment_intent.succeeded transitions payment to Completed and order to Paid', async () => {
      const { order, payment, paymentIntentId } = await createTestOrderAndPayment({
        amount: 50,
        currency: 'USD',
        paymentStatus: PAYMENT_STATUSES.PROCESSING
      });

      await PaymentWebhookEvent.create({
        provider: 'stripe',
        accountAlias: 'default',
        environment: 'sandbox',
        providerEventId: `evt_${crypto.randomUUID()}`,
        eventType: 'payment_intent.succeeded',
        providerPaymentId: paymentIntentId,
        amountMinor: 5000,
        currency: 'USD',
        payloadHash: 'hash_succeeded',
        status: WEBHOOK_PROCESSING_STATUSES.RECEIVED,
        nextAttemptAt: new Date(Date.now() - 1000)
      });

      const summary = await paymentWebhookProcessor.processPending({ batchSize: 10 });
      expect(summary.processed).toBe(1);

      const updatedPayment = await Payment.findById(payment._id);
      expect(updatedPayment.status).toBe(PAYMENT_STATUSES.COMPLETED);
      expect(updatedPayment.paidAmount).toBe(50);

      const updatedOrder = await Order.findById(order._id);
      expect(updatedOrder.paymentStatus).toBe('Paid');
    });

    test('duplicate payment_intent.succeeded produces zero duplicate side effects', async () => {
      const { payment, paymentIntentId } = await createTestOrderAndPayment({
        amount: 50,
        currency: 'USD',
        paymentStatus: PAYMENT_STATUSES.COMPLETED
      });

      // First webhook event
      await PaymentWebhookEvent.create({
        provider: 'stripe',
        accountAlias: 'default',
        environment: 'sandbox',
        providerEventId: `evt_dup_1_${crypto.randomUUID()}`,
        eventType: 'payment_intent.succeeded',
        providerPaymentId: paymentIntentId,
        amountMinor: 5000,
        currency: 'USD',
        payloadHash: 'hash_dup1',
        status: WEBHOOK_PROCESSING_STATUSES.RECEIVED,
        nextAttemptAt: new Date(Date.now() - 1000)
      });

      const summary1 = await paymentWebhookProcessor.processPending({ batchSize: 10 });
      expect(summary1.processed).toBe(1);

      // Duplicate delivery
      await PaymentWebhookEvent.create({
        provider: 'stripe',
        accountAlias: 'default',
        environment: 'sandbox',
        providerEventId: `evt_dup_2_${crypto.randomUUID()}`,
        eventType: 'payment_intent.succeeded',
        providerPaymentId: paymentIntentId,
        amountMinor: 5000,
        currency: 'USD',
        payloadHash: 'hash_dup2',
        status: WEBHOOK_PROCESSING_STATUSES.RECEIVED,
        nextAttemptAt: new Date(Date.now() - 1000)
      });

      const summary2 = await paymentWebhookProcessor.processPending({ batchSize: 10 });
      expect(summary2.processed).toBe(1);

      const currentPayment = await Payment.findById(payment._id);
      expect(currentPayment.status).toBe(PAYMENT_STATUSES.COMPLETED);
      expect(currentPayment.paidAmount).toBe(0); // Untouched duplicate
    });

    test('out-of-order older failure event cannot reverse terminal Completed state', async () => {
      const { order, payment, paymentIntentId } = await createTestOrderAndPayment({
        amount: 70,
        currency: 'USD',
        paymentStatus: PAYMENT_STATUSES.COMPLETED
      });

      await PaymentWebhookEvent.create({
        provider: 'stripe',
        accountAlias: 'default',
        environment: 'sandbox',
        providerEventId: `evt_fail_old_${crypto.randomUUID()}`,
        eventType: 'payment_intent.payment_failed',
        providerPaymentId: paymentIntentId,
        amountMinor: 7000,
        currency: 'USD',
        payloadHash: 'hash_fail_old',
        status: WEBHOOK_PROCESSING_STATUSES.RECEIVED,
        nextAttemptAt: new Date(Date.now() - 1000)
      });

      const summary = await paymentWebhookProcessor.processPending({ batchSize: 10 });
      expect(summary.ignored).toBe(1);

      // Payment remains Completed
      const currentPayment = await Payment.findById(payment._id);
      expect(currentPayment.status).toBe(PAYMENT_STATUSES.COMPLETED);

      // Order remains Paid
      const currentOrder = await Order.findById(order._id);
      expect(currentOrder.paymentStatus).toBe('Paid');
    });

    test('unsupported authentic provider event is safely marked ignored', async () => {
      const { paymentIntentId } = await createTestOrderAndPayment({
        amount: 30,
        currency: 'USD',
        paymentStatus: PAYMENT_STATUSES.PROCESSING
      });

      await PaymentWebhookEvent.create({
        provider: 'stripe',
        accountAlias: 'default',
        environment: 'sandbox',
        providerEventId: `evt_unsupported_${crypto.randomUUID()}`,
        eventType: 'radar.early_fraud_warning.created',
        providerPaymentId: paymentIntentId,
        amountMinor: 3000,
        currency: 'USD',
        payloadHash: 'hash_unsupported',
        status: WEBHOOK_PROCESSING_STATUSES.RECEIVED,
        nextAttemptAt: new Date(Date.now() - 1000)
      });

      const summary = await paymentWebhookProcessor.processPending({ batchSize: 10 });
      expect(summary.ignored).toBe(1);
    });
  });

  describe('3. Currency Resolution & Exact Amount Validation', () => {
    test('event with currency mismatch immediately transitions to dead-letter', async () => {
      const { paymentIntentId } = await createTestOrderAndPayment({
        amount: 50,
        currency: 'USD',
        paymentStatus: PAYMENT_STATUSES.PROCESSING
      });

      const eventDoc = await PaymentWebhookEvent.create({
        provider: 'stripe',
        accountAlias: 'default',
        environment: 'sandbox',
        providerEventId: `evt_cur_mismatch_${crypto.randomUUID()}`,
        eventType: 'payment_intent.succeeded',
        providerPaymentId: paymentIntentId,
        amountMinor: 5000,
        currency: 'EUR', // Mismatch with USD
        payloadHash: 'hash_cur_mismatch',
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
        amount: 50,
        currency: 'USD',
        paymentStatus: PAYMENT_STATUSES.PROCESSING
      });

      const eventDoc = await PaymentWebhookEvent.create({
        provider: 'stripe',
        accountAlias: 'default',
        environment: 'sandbox',
        providerEventId: `evt_amt_mismatch_${crypto.randomUUID()}`,
        eventType: 'payment_intent.succeeded',
        providerPaymentId: paymentIntentId,
        amountMinor: 9999, // Mismatch with 5000
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
      expect(updatedEvent.attemptCount).toBe(3);
    });
  });

  describe('4. Admin Webhook Health RBAC & Privacy', () => {
    test('enforces comprehensive RBAC across all role and token states for health inspection', async () => {
      // 1. Missing Authorization header -> 401
      const noAuthRes = await request(app).get('/api/admin/payments/webhooks/health');
      expect(noAuthRes.status).toBe(401);
      expect(noAuthRes.body.error?.code || noAuthRes.body.code).toBe('AUTH_TOKEN_REQUIRED');

      // 2. Malformed token -> 401
      const malformedRes = await request(app)
        .get('/api/admin/payments/webhooks/health')
        .set('Authorization', 'Bearer invalid_garbage_token');
      expect(malformedRes.status).toBe(401);
      expect(malformedRes.body.error?.code || malformedRes.body.code).toBe('AUTH_TOKEN_INVALID');

      // 3. Expired session -> 401
      const expiredUser = await global.createTestUser({ email: 'expired-admin@example.com', role: 'admin' });
      const expiredSession = await Session.create({
        user: expiredUser._id,
        refreshTokenHash: crypto.randomBytes(32).toString('hex'),
        tokenFamilyId: crypto.randomUUID(),
        isActive: true,
        isRevoked: false,
        expiresAt: new Date(Date.now() - 10000) // Expired in past
      });
      const expiredToken = TokenService.generateAccessToken({
        userId: expiredUser._id,
        sessionId: expiredSession._id,
        tokenVersion: expiredUser.tokenVersion
      });
      const expiredRes = await request(app)
        .get('/api/admin/payments/webhooks/health')
        .set('Authorization', `Bearer ${expiredToken}`);
      expect(expiredRes.status).toBe(401);

      // 4. Revoked session -> 401
      const revokedUser = await global.createTestUser({ email: 'revoked-admin@example.com', role: 'admin' });
      const revokedSession = await Session.create({
        user: revokedUser._id,
        refreshTokenHash: crypto.randomBytes(32).toString('hex'),
        tokenFamilyId: crypto.randomUUID(),
        isActive: false,
        isRevoked: true,
        expiresAt: new Date(Date.now() + 60000)
      });
      const revokedToken = TokenService.generateAccessToken({
        userId: revokedUser._id,
        sessionId: revokedSession._id,
        tokenVersion: revokedUser.tokenVersion
      });
      const revokedRes = await request(app)
        .get('/api/admin/payments/webhooks/health')
        .set('Authorization', `Bearer ${revokedToken}`);
      expect(revokedRes.status).toBe(401);
      expect(revokedRes.body.error?.code || revokedRes.body.code).toBe('AUTH_SESSION_REVOKED');

      // 5-8. Non-admin roles (customer, support, inventory, manager) -> 403
      for (const forbiddenRole of ['customer', 'support', 'inventory', 'manager']) {
        const auth = await createAuth(forbiddenRole);
        const forbiddenRes = await request(app)
          .get('/api/admin/payments/webhooks/health')
          .set('Authorization', auth.authorization);
        expect(forbiddenRes.status).toBe(403);
        expect(forbiddenRes.body.error?.code || forbiddenRes.body.code).toBe('AUTH_FORBIDDEN');
      }

      // 9. Admin role -> 200
      const adminAuth = await createAuth('admin');
      const adminRes = await request(app)
        .get('/api/admin/payments/webhooks/health')
        .set('Authorization', adminAuth.authorization);
      expect(adminRes.status).toBe(200);
      expect(adminRes.body.success).toBe(true);

      // 10. Super Admin role -> 200
      const superAdminAuth = await createAuth('super_admin');
      const superAdminRes = await request(app)
        .get('/api/admin/payments/webhooks/health')
        .set('Authorization', superAdminAuth.authorization);
      expect(superAdminRes.status).toBe(200);
      expect(superAdminRes.body.success).toBe(true);
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

  describe('5. Real Transaction, Rollback, Cross-Account Isolation & Lease Safety', () => {
    test('mid-transaction failure rolls back payment and order mutations completely', async () => {
      const { payment, order, paymentIntentId } = await createTestOrderAndPayment({
        amount: 80,
        currency: 'USD',
        paymentStatus: PAYMENT_STATUSES.PROCESSING
      });

      const eventDoc = await PaymentWebhookEvent.create({
        provider: 'stripe',
        accountAlias: 'default',
        environment: 'sandbox',
        providerEventId: `evt_tx_fail_${crypto.randomUUID()}`,
        eventType: 'payment_intent.succeeded',
        providerPaymentId: paymentIntentId,
        amountMinor: 8000,
        currency: 'USD',
        payloadHash: 'hash_tx_fail',
        status: WEBHOOK_PROCESSING_STATUSES.RECEIVED,
        nextAttemptAt: new Date(Date.now() - 1000)
      });

      // Inject error on Order.prototype.save during transaction
      const originalSave = Order.prototype.save;
      let saveCalled = false;
      Order.prototype.save = function saveWithInjectedFailure(...args) {
        saveCalled = true;
        throw new Error('Injected mid-transaction database failure');
      };

      try {
        const summary = await paymentWebhookProcessor.processPending({ batchSize: 10 });
        expect(summary.retryScheduled).toBe(1);
        expect(saveCalled).toBe(true);

        // Verify transaction rollback: Payment remains PROCESSING and Order remains Pending
        const rolledBackPayment = await Payment.findById(payment._id);
        expect(rolledBackPayment.status).toBe(PAYMENT_STATUSES.PROCESSING);
        expect(rolledBackPayment.paidAmount).toBe(0);

        const rolledBackOrder = await Order.findById(order._id);
        expect(rolledBackOrder.paymentStatus).toBe('Pending');

        const updatedEvent = await PaymentWebhookEvent.findById(eventDoc._id);
        expect(updatedEvent.status).toBe(WEBHOOK_PROCESSING_STATUSES.RETRY_SCHEDULED);
      } finally {
        Order.prototype.save = originalSave;
      }
    });

    test('cross-account isolation fails closed when accountAlias differs and leaves payment untouched', async () => {
      const { payment, order, paymentIntentId } = await createTestOrderAndPayment({
        amount: 60,
        currency: 'USD',
        paymentStatus: PAYMENT_STATUSES.PROCESSING,
        accountAlias: 'merchant_account_A'
      });

      // Webhook event arriving for merchant account B
      await PaymentWebhookEvent.create({
        provider: 'stripe',
        accountAlias: 'merchant_account_B',
        environment: 'sandbox',
        providerEventId: `evt_cross_account_${crypto.randomUUID()}`,
        eventType: 'payment_intent.succeeded',
        providerPaymentId: paymentIntentId,
        amountMinor: 6000,
        currency: 'USD',
        payloadHash: 'hash_cross_acc',
        eventData: {
          providerEventId: 'evt_cross_account',
          eventType: 'payment_intent.succeeded',
          metadata: {
            accountAlias: 'merchant_account_B'
          }
        },
        status: WEBHOOK_PROCESSING_STATUSES.RECEIVED,
        nextAttemptAt: new Date(Date.now() - 1000)
      });

      const summary = await paymentWebhookProcessor.processPending({ batchSize: 10, maxAttempts: 1 });
      expect(summary.deadLettered).toBe(1);

      // Payment remains untouched in PROCESSING
      const unaffectedPayment = await Payment.findById(payment._id);
      expect(unaffectedPayment.status).toBe(PAYMENT_STATUSES.PROCESSING);

      const unaffectedOrder = await Order.findById(order._id);
      expect(unaffectedOrder.paymentStatus).toBe('Pending');
    });

    test('multi-account collision: only correctly scoped payment is selected when two accounts share provider payment ID', async () => {
      const sharedPaymentIntentId = `pi_shared_collision_${crypto.randomUUID()}`;

      // Payment A in Account A with providerPaymentId
      const { payment: paymentA } = await createTestOrderAndPayment({
        amount: 100,
        currency: 'USD',
        accountAlias: 'merchant_account_A',
        environment: 'sandbox',
        paymentStatus: PAYMENT_STATUSES.PROCESSING,
        paymentIntentId: sharedPaymentIntentId
      });

      // Payment B in Account B with paymentIntentId (historical ref without unique constraint collision on providerPaymentId)
      const { user: userB } = await createAuth('customer');
      const orderB = await Order.create({
        user: userB._id,
        idempotencyKey: crypto.randomUUID(),
        requestHash: crypto.createHash('sha256').update(crypto.randomUUID()).digest('hex'),
        items: [{
          product: new (require('mongoose').Types.ObjectId)(),
          name: 'Collision Item B',
          sku: 'SKU-COL-B',
          price: 100,
          quantity: 1,
          lineTotal: 100
        }],
        shippingAddress: {
          fullName: 'Customer B',
          phone: '+1234567890',
          address: '200 Commerce Way',
          city: 'New York',
          province: 'NY',
          country: 'United States'
        },
        paymentMethod: 'stripe',
        payment: { provider: 'stripe', paymentIntentId: sharedPaymentIntentId, status: 'Pending', currency: 'USD' },
        currency: 'USD',
        subtotal: 100,
        shippingCost: 0,
        taxAmount: 0,
        discount: 0,
        totalAmount: 100,
        orderStatus: 'Pending',
        paymentStatus: 'Pending',
        statusTimeline: [{ status: 'Pending', actor: userB._id, actorRole: 'customer', timestamp: new Date() }]
      });

      const paymentB = await Payment.create({
        order: orderB._id,
        user: userB._id,
        amount: 100,
        currency: 'USD',
        provider: 'stripe',
        paymentIntentId: sharedPaymentIntentId,
        status: PAYMENT_STATUSES.PROCESSING,
        capabilitySnapshot: {
          accountAlias: 'merchant_account_B',
          environment: 'sandbox'
        },
        idempotencyKey: crypto.randomUUID(),
        requestHash: crypto.createHash('sha256').update(crypto.randomUUID()).digest('hex'),
        providerIdempotencyKey: `pip_${crypto.randomUUID()}`,
        providerAttemptStatus: 'Claimed'
      });

      // Webhook arrives strictly scoped to merchant_account_A
      await PaymentWebhookEvent.create({
        provider: 'stripe',
        accountAlias: 'merchant_account_A',
        environment: 'sandbox',
        providerEventId: `evt_scope_a_${crypto.randomUUID()}`,
        eventType: 'payment_intent.succeeded',
        providerPaymentId: sharedPaymentIntentId,
        amountMinor: 10000,
        currency: 'USD',
        payloadHash: 'hash_scope_a',
        status: WEBHOOK_PROCESSING_STATUSES.RECEIVED,
        nextAttemptAt: new Date(Date.now() - 1000)
      });

      const summary = await paymentWebhookProcessor.processPending({ batchSize: 10 });
      expect(summary.processed).toBe(1);

      // Payment A must be COMPLETED
      const refreshedA = await Payment.findById(paymentA._id);
      expect(refreshedA.status).toBe(PAYMENT_STATUSES.COMPLETED);

      // Payment B must remain untouched in PROCESSING
      const refreshedB = await Payment.findById(paymentB._id);
      expect(refreshedB.status).toBe(PAYMENT_STATUSES.PROCESSING);
    });

    test('wrong-environment isolation fails closed and leaves payment untouched', async () => {
      const { payment, paymentIntentId } = await createTestOrderAndPayment({
        amount: 75,
        currency: 'USD',
        environment: 'sandbox',
        accountAlias: 'default',
        paymentStatus: PAYMENT_STATUSES.PROCESSING
      });

      // Webhook event arriving with environment = 'production'
      await PaymentWebhookEvent.create({
        provider: 'stripe',
        accountAlias: 'default',
        environment: 'production',
        providerEventId: `evt_wrong_env_${crypto.randomUUID()}`,
        eventType: 'payment_intent.succeeded',
        providerPaymentId: paymentIntentId,
        amountMinor: 7500,
        currency: 'USD',
        payloadHash: 'hash_wrong_env',
        status: WEBHOOK_PROCESSING_STATUSES.RECEIVED,
        nextAttemptAt: new Date(Date.now() - 1000)
      });

      const summary = await paymentWebhookProcessor.processPending({ batchSize: 10, maxAttempts: 1 });
      expect(summary.deadLettered).toBe(1);

      // Sandbox payment must remain untouched in PROCESSING
      const refreshedPayment = await Payment.findById(payment._id);
      expect(refreshedPayment.status).toBe(PAYMENT_STATUSES.PROCESSING);
    });

    test('wrong-provider isolation fails closed and leaves payment untouched', async () => {
      const { payment, paymentIntentId } = await createTestOrderAndPayment({
        amount: 50,
        currency: 'USD',
        provider: 'stripe',
        paymentStatus: PAYMENT_STATUSES.PROCESSING
      });

      // Webhook event arriving for wrong provider 'custom_gateway'
      await PaymentWebhookEvent.create({
        provider: 'custom_gateway',
        accountAlias: 'default',
        environment: 'sandbox',
        providerEventId: `evt_wrong_prov_${crypto.randomUUID()}`,
        eventType: 'payment_intent.succeeded',
        providerPaymentId: paymentIntentId,
        amountMinor: 5000,
        currency: 'USD',
        payloadHash: 'hash_wrong_prov',
        status: WEBHOOK_PROCESSING_STATUSES.RECEIVED,
        nextAttemptAt: new Date(Date.now() - 1000)
      });

      const summary = await paymentWebhookProcessor.processPending({ batchSize: 10, maxAttempts: 1 });
      expect(summary.deadLettered).toBe(1);

      const refreshedPayment = await Payment.findById(payment._id);
      expect(refreshedPayment.status).toBe(PAYMENT_STATUSES.PROCESSING);
    });

    test('stale lease owner performs zero event mutation when lease was expired and reclaimed', async () => {
      const { paymentIntentId } = await createTestOrderAndPayment({
        amount: 40,
        currency: 'USD',
        paymentStatus: PAYMENT_STATUSES.PROCESSING
      });

      const eventDoc = await PaymentWebhookEvent.create({
        provider: 'stripe',
        accountAlias: 'default',
        environment: 'sandbox',
        providerEventId: `evt_stale_${crypto.randomUUID()}`,
        eventType: 'payment_intent.succeeded',
        providerPaymentId: paymentIntentId,
        amountMinor: 4000,
        currency: 'USD',
        payloadHash: 'hash_stale',
        status: WEBHOOK_PROCESSING_STATUSES.RECEIVED,
        nextAttemptAt: new Date(Date.now() - 1000)
      });

      // Claim event with worker 1
      const lease1 = crypto.randomUUID();
      const claim1 = await paymentWebhookProcessor.claimEvent({
        now: new Date(),
        leaseDurationMs: 1000,
        leaseId: lease1
      });
      expect(claim1).not.toBeNull();
      expect(claim1.leaseId).toBe(lease1);

      // Simulate lease expiration
      claim1.leaseExpiresAt = new Date(Date.now() - 5000);
      await claim1.save();

      // Worker 2 reclaims the expired event
      const lease2 = crypto.randomUUID();
      const claim2 = await paymentWebhookProcessor.claimEvent({
        now: new Date(),
        leaseDurationMs: 60000,
        leaseId: lease2
      });
      expect(claim2).not.toBeNull();
      expect(claim2.leaseId).toBe(lease2);

      // Worker 1 attempts to finalize with stale lease1 -> loses lease without mutating doc
      const staleResult = await paymentWebhookProcessor.processClaimedEvent(claim1);
      expect(staleResult.outcome).toBe('lease_lost');
      expect(staleResult.status).toBe(WEBHOOK_PROCESSING_STATUSES.PROCESSING);

      // Document still has active lease2 and status PROCESSING (never dead-lettered)
      const currentDoc = await PaymentWebhookEvent.findById(eventDoc._id).select('+leaseId');
      expect(currentDoc.leaseId).toBe(lease2);
      expect(currentDoc.status).toBe(WEBHOOK_PROCESSING_STATUSES.PROCESSING);
    });

    test('deterministic retry delay calculation is bounded and capped at 1 hour', () => {
      const delays = [];
      for (let attempt = 0; attempt <= 12; attempt += 1) {
        const delay = paymentWebhookProcessor.calculateRetryDelay(attempt, { jitterMs: 100 });
        delays.push(delay);
        expect(delay).toBeGreaterThanOrEqual(1000);
        expect(delay).toBeLessThanOrEqual(3600000);
      }

      // Check exponential growth
      expect(delays[1]).toBeGreaterThan(delays[0]);
      expect(delays[2]).toBeGreaterThan(delays[1]);

      // Check cap at attempt 12
      expect(delays[12]).toBe(3600000);
    });
  });

  describe('6. Refund Reconciliation, Multi-Currency Exponent & Boundary Safety', () => {
    test('1. reconciles USD two-decimal refund event with exact minor units (40.50 USD = 4050 minor units)', async () => {
      const { user, order, payment, paymentIntentId } = await createTestOrderAndPayment({
        amount: 100.50,
        amountExact: MoneyMapper.fromLegacy(100.50, 'USD'),
        currency: 'USD',
        paymentStatus: PAYMENT_STATUSES.COMPLETED
      });

      const providerRefundId = `re_usd_${crypto.randomUUID()}`;
      const refundDoc = await Refund.create({
        payment: payment._id,
        order: order._id,
        customer: user._id,
        provider: 'stripe',
        amount: 40.50,
        amountExact: MoneyMapper.fromLegacy(40.50, 'USD'),
        currency: 'USD',
        status: REFUND_STATUSES.PENDING,
        providerRefundId,
        idempotencyKey: crypto.randomUUID(),
        requestHash: crypto.createHash('sha256').update(crypto.randomUUID()).digest('hex'),
        providerIdempotencyKey: `prk_usd_${crypto.randomUUID()}`,
        providerAttemptStatus: 'Ready',
        reservationActive: true,
        processingMode: 'provider',
        providerOutcome: 'pending',
        processedBy: user._id
      });

      await PaymentWebhookEvent.create({
        provider: 'stripe',
        accountAlias: 'default',
        environment: 'sandbox',
        providerEventId: `evt_usd_${crypto.randomUUID()}`,
        eventType: 'refund.created',
        providerPaymentId: paymentIntentId,
        providerRefundId,
        amountMinor: 4050,
        currency: 'USD',
        payloadHash: 'hash_usd',
        status: WEBHOOK_PROCESSING_STATUSES.RECEIVED,
        eventData: {
          providerEventId: 'evt_usd_1',
          eventType: 'refund.created',
          providerPaymentId: paymentIntentId,
          providerRefundId,
          amountMinor: 4050,
          currency: 'USD',
          rawObjectStatus: 'succeeded',
          metadata: {
            paymentId: String(payment._id),
            orderId: String(order._id),
            refundId: String(refundDoc._id)
          }
        },
        nextAttemptAt: new Date(Date.now() - 1000)
      });

      const summary = await paymentWebhookProcessor.processPending({ batchSize: 10 });
      expect(summary.processed).toBe(1);

      const updatedPayment = await Payment.findById(payment._id);
      expect(updatedPayment.refundedAmount).toBe(40.50);
      expect(updatedPayment.status).toBe(PAYMENT_STATUSES.PARTIALLY_REFUNDED);

      const updatedRefund = await Refund.findById(refundDoc._id);
      expect(updatedRefund.status).toBe(REFUND_STATUSES.COMPLETED);
    });

    test('2. reconciles JPY zero-decimal refund event (5000 JPY = 5000 minor units, exponent 0)', async () => {
      const { user, order, payment, paymentIntentId } = await createTestOrderAndPayment({
        amount: 10000,
        amountExact: MoneyMapper.fromLegacy(10000, 'JPY'),
        currency: 'JPY',
        paymentStatus: PAYMENT_STATUSES.COMPLETED
      });

      const providerRefundId = `re_jpy_${crypto.randomUUID()}`;
      const refundDoc = await Refund.create({
        payment: payment._id,
        order: order._id,
        customer: user._id,
        provider: 'stripe',
        amount: 5000,
        amountExact: MoneyMapper.fromLegacy(5000, 'JPY'),
        currency: 'JPY',
        status: REFUND_STATUSES.PENDING,
        providerRefundId,
        idempotencyKey: crypto.randomUUID(),
        requestHash: crypto.createHash('sha256').update(crypto.randomUUID()).digest('hex'),
        providerIdempotencyKey: `prk_jpy_${crypto.randomUUID()}`,
        providerAttemptStatus: 'Ready',
        reservationActive: true,
        processingMode: 'provider',
        providerOutcome: 'pending',
        processedBy: user._id
      });

      await PaymentWebhookEvent.create({
        provider: 'stripe',
        accountAlias: 'default',
        environment: 'sandbox',
        providerEventId: `evt_jpy_${crypto.randomUUID()}`,
        eventType: 'refund.created',
        providerPaymentId: paymentIntentId,
        providerRefundId,
        amountMinor: 5000,
        currency: 'JPY',
        payloadHash: 'hash_jpy',
        status: WEBHOOK_PROCESSING_STATUSES.RECEIVED,
        eventData: {
          providerEventId: 'evt_jpy_1',
          eventType: 'refund.created',
          providerPaymentId: paymentIntentId,
          providerRefundId,
          amountMinor: 5000,
          currency: 'JPY',
          rawObjectStatus: 'succeeded',
          metadata: {
            paymentId: String(payment._id),
            orderId: String(order._id),
            refundId: String(refundDoc._id)
          }
        },
        nextAttemptAt: new Date(Date.now() - 1000)
      });

      const summary = await paymentWebhookProcessor.processPending({ batchSize: 10 });
      expect(summary.processed).toBe(1);

      const updatedPayment = await Payment.findById(payment._id);
      expect(updatedPayment.refundedAmount).toBe(5000);
      expect(updatedPayment.status).toBe(PAYMENT_STATUSES.PARTIALLY_REFUNDED);

      const updatedRefund = await Refund.findById(refundDoc._id);
      expect(updatedRefund.status).toBe(REFUND_STATUSES.COMPLETED);
    });

    test('3. reconciles KWD three-decimal refund event (12.345 KWD = 12345 minor units, exponent 3)', async () => {
      const { user, order, payment, paymentIntentId } = await createTestOrderAndPayment({
        amount: 25.000,
        amountExact: MoneyMapper.fromLegacy(25.000, 'KWD'),
        currency: 'KWD',
        paymentStatus: PAYMENT_STATUSES.COMPLETED
      });

      const providerRefundId = `re_kwd_${crypto.randomUUID()}`;
      const refundDoc = await Refund.create({
        payment: payment._id,
        order: order._id,
        customer: user._id,
        provider: 'stripe',
        amount: 12.345,
        amountExact: MoneyMapper.fromLegacy(12.345, 'KWD'),
        currency: 'KWD',
        status: REFUND_STATUSES.PENDING,
        providerRefundId,
        idempotencyKey: crypto.randomUUID(),
        requestHash: crypto.createHash('sha256').update(crypto.randomUUID()).digest('hex'),
        providerIdempotencyKey: `prk_kwd_${crypto.randomUUID()}`,
        providerAttemptStatus: 'Ready',
        reservationActive: true,
        processingMode: 'provider',
        providerOutcome: 'pending',
        processedBy: user._id
      });

      await PaymentWebhookEvent.create({
        provider: 'stripe',
        accountAlias: 'default',
        environment: 'sandbox',
        providerEventId: `evt_kwd_${crypto.randomUUID()}`,
        eventType: 'refund.created',
        providerPaymentId: paymentIntentId,
        providerRefundId,
        amountMinor: 12345,
        currency: 'KWD',
        payloadHash: 'hash_kwd',
        status: WEBHOOK_PROCESSING_STATUSES.RECEIVED,
        eventData: {
          providerEventId: 'evt_kwd_1',
          eventType: 'refund.created',
          providerPaymentId: paymentIntentId,
          providerRefundId,
          amountMinor: 12345,
          currency: 'KWD',
          rawObjectStatus: 'succeeded',
          metadata: {
            paymentId: String(payment._id),
            orderId: String(order._id),
            refundId: String(refundDoc._id)
          }
        },
        nextAttemptAt: new Date(Date.now() - 1000)
      });

      const summary = await paymentWebhookProcessor.processPending({ batchSize: 10 });
      expect(summary.processed).toBe(1);

      const updatedPayment = await Payment.findById(payment._id);
      expect(updatedPayment.refundedAmount).toBe(12.345);
      expect(updatedPayment.status).toBe(PAYMENT_STATUSES.PARTIALLY_REFUNDED);

      const updatedRefund = await Refund.findById(refundDoc._id);
      expect(updatedRefund.status).toBe(REFUND_STATUSES.COMPLETED);
    });

    test('4. rejects excessive fractional precision on refund reconciliation', async () => {
      // Trying to construct money with 4 decimal places for 2-decimal USD without rounding throws
      expect(() => Money.fromDecimal('50.1234', 'USD')).toThrow();
    });

    test('5. rejects currency mismatch between provider refund event and internal refund record', async () => {
      const { user, order, payment, paymentIntentId } = await createTestOrderAndPayment({
        amount: 100,
        currency: 'USD',
        paymentStatus: PAYMENT_STATUSES.COMPLETED
      });

      const providerRefundId = `re_cur_mismatch_${crypto.randomUUID()}`;
      const refundDoc = await Refund.create({
        payment: payment._id,
        order: order._id,
        customer: user._id,
        provider: 'stripe',
        amount: 40,
        currency: 'USD',
        status: REFUND_STATUSES.PENDING,
        providerRefundId,
        idempotencyKey: crypto.randomUUID(),
        requestHash: crypto.randomBytes(32).toString('hex'),
        providerIdempotencyKey: `prk_cur_${crypto.randomUUID()}`,
        providerAttemptStatus: 'Ready',
        reservationActive: true,
        processingMode: 'provider',
        providerOutcome: 'pending',
        processedBy: user._id
      });

      // Provider event claims EUR currency
      await PaymentWebhookEvent.create({
        provider: 'stripe',
        accountAlias: 'default',
        environment: 'sandbox',
        providerEventId: `evt_cur_mismatch_${crypto.randomUUID()}`,
        eventType: 'refund.created',
        providerPaymentId: paymentIntentId,
        providerRefundId,
        amountMinor: 4000,
        currency: 'EUR',
        payloadHash: 'hash_cur_mismatch',
        status: WEBHOOK_PROCESSING_STATUSES.RECEIVED,
        eventData: {
          providerEventId: 'evt_cur_1',
          eventType: 'refund.created',
          providerPaymentId: paymentIntentId,
          providerRefundId,
          amountMinor: 4000,
          currency: 'EUR',
          rawObjectStatus: 'succeeded',
          metadata: {
            paymentId: String(payment._id),
            orderId: String(order._id),
            refundId: String(refundDoc._id)
          }
        },
        nextAttemptAt: new Date(Date.now() - 1000)
      });

      const summary = await paymentWebhookProcessor.processPending({ batchSize: 10 });
      expect(summary.deadLettered).toBe(1);

      const unrefundedDoc = await Refund.findById(refundDoc._id);
      expect(unrefundedDoc.status).toBe(REFUND_STATUSES.PENDING);
    });

    test('6. rejects amount mismatch between provider refund event and internal refund record', async () => {
      const { user, order, payment, paymentIntentId } = await createTestOrderAndPayment({
        amount: 100,
        currency: 'USD',
        paymentStatus: PAYMENT_STATUSES.COMPLETED
      });

      const providerRefundId = `re_amt_mismatch_${crypto.randomUUID()}`;
      const refundDoc = await Refund.create({
        payment: payment._id,
        order: order._id,
        customer: user._id,
        provider: 'stripe',
        amount: 40,
        currency: 'USD',
        status: REFUND_STATUSES.PENDING,
        providerRefundId,
        idempotencyKey: crypto.randomUUID(),
        requestHash: crypto.randomBytes(32).toString('hex'),
        providerIdempotencyKey: `prk_amt_${crypto.randomUUID()}`,
        providerAttemptStatus: 'Ready',
        reservationActive: true,
        processingMode: 'provider',
        providerOutcome: 'pending',
        processedBy: user._id
      });

      // Provider event claims 3000 minor units ($30) instead of 4000 ($40)
      await PaymentWebhookEvent.create({
        provider: 'stripe',
        accountAlias: 'default',
        environment: 'sandbox',
        providerEventId: `evt_amt_mismatch_${crypto.randomUUID()}`,
        eventType: 'refund.created',
        providerPaymentId: paymentIntentId,
        providerRefundId,
        amountMinor: 3000,
        currency: 'USD',
        payloadHash: 'hash_amt_mismatch',
        status: WEBHOOK_PROCESSING_STATUSES.RECEIVED,
        eventData: {
          providerEventId: 'evt_amt_1',
          eventType: 'refund.created',
          providerPaymentId: paymentIntentId,
          providerRefundId,
          amountMinor: 3000,
          currency: 'USD',
          rawObjectStatus: 'succeeded',
          metadata: {
            paymentId: String(payment._id),
            orderId: String(order._id),
            refundId: String(refundDoc._id)
          }
        },
        nextAttemptAt: new Date(Date.now() - 1000)
      });

      const summary = await paymentWebhookProcessor.processPending({ batchSize: 10 });
      expect(summary.deadLettered).toBe(1);

      const unrefundedDoc = await Refund.findById(refundDoc._id);
      expect(unrefundedDoc.status).toBe(REFUND_STATUSES.PENDING);
    });

    test('7. reconciles partial refund provider event against authorized internal refund record', async () => {
      const { user, order, payment, paymentIntentId } = await createTestOrderAndPayment({
        amount: 100,
        currency: 'USD',
        paymentStatus: PAYMENT_STATUSES.COMPLETED
      });

      const providerRefundId = `re_partial_${crypto.randomUUID()}`;
      const refundDoc = await Refund.create({
        payment: payment._id,
        order: order._id,
        customer: user._id,
        provider: 'stripe',
        amount: 40,
        currency: 'USD',
        status: REFUND_STATUSES.PENDING,
        providerRefundId,
        idempotencyKey: crypto.randomUUID(),
        requestHash: crypto.randomBytes(32).toString('hex'),
        providerIdempotencyKey: `prk_part_${crypto.randomUUID()}`,
        providerAttemptStatus: 'Ready',
        reservationActive: true,
        processingMode: 'provider',
        providerOutcome: 'pending',
        processedBy: user._id
      });

      await PaymentWebhookEvent.create({
        provider: 'stripe',
        accountAlias: 'default',
        environment: 'sandbox',
        providerEventId: `evt_ref_partial_${crypto.randomUUID()}`,
        eventType: 'refund.created',
        providerPaymentId: paymentIntentId,
        providerRefundId,
        amountMinor: 4000,
        currency: 'USD',
        payloadHash: 'hash_refund_partial',
        status: WEBHOOK_PROCESSING_STATUSES.RECEIVED,
        eventData: {
          providerEventId: 'evt_ref_1',
          eventType: 'refund.created',
          providerPaymentId: paymentIntentId,
          providerRefundId,
          amountMinor: 4000,
          currency: 'USD',
          rawObjectStatus: 'succeeded',
          metadata: {
            paymentId: String(payment._id),
            orderId: String(order._id),
            refundId: String(refundDoc._id)
          }
        },
        nextAttemptAt: new Date(Date.now() - 1000)
      });

      const summary = await paymentWebhookProcessor.processPending({ batchSize: 10 });
      expect(summary.processed).toBe(1);

      const updatedPayment = await Payment.findById(payment._id);
      expect(updatedPayment.refundedAmount).toBe(40);
      expect(updatedPayment.status).toBe(PAYMENT_STATUSES.PARTIALLY_REFUNDED);

      const updatedOrder = await Order.findById(order._id);
      expect(updatedOrder.paymentStatus).toBe('PartiallyRefunded');

      const updatedRefund = await Refund.findById(refundDoc._id);
      expect(updatedRefund.status).toBe(REFUND_STATUSES.COMPLETED);
    });

    test('8. reconciles full refund provider event against authorized internal refund record', async () => {
      const { user, order, payment, paymentIntentId } = await createTestOrderAndPayment({
        amount: 100,
        currency: 'USD',
        paymentStatus: PAYMENT_STATUSES.COMPLETED
      });

      const providerRefundId = `re_full_${crypto.randomUUID()}`;
      const refundDoc = await Refund.create({
        payment: payment._id,
        order: order._id,
        customer: user._id,
        provider: 'stripe',
        amount: 100,
        currency: 'USD',
        status: REFUND_STATUSES.PENDING,
        providerRefundId,
        idempotencyKey: crypto.randomUUID(),
        requestHash: crypto.randomBytes(32).toString('hex'),
        providerIdempotencyKey: `prk_full_${crypto.randomUUID()}`,
        providerAttemptStatus: 'Ready',
        reservationActive: true,
        processingMode: 'provider',
        providerOutcome: 'pending',
        processedBy: user._id
      });

      await PaymentWebhookEvent.create({
        provider: 'stripe',
        accountAlias: 'default',
        environment: 'sandbox',
        providerEventId: `evt_ref_full_${crypto.randomUUID()}`,
        eventType: 'refund.created',
        providerPaymentId: paymentIntentId,
        providerRefundId,
        amountMinor: 10000,
        currency: 'USD',
        payloadHash: 'hash_refund_full',
        status: WEBHOOK_PROCESSING_STATUSES.RECEIVED,
        eventData: {
          providerEventId: 'evt_ref_full',
          eventType: 'refund.created',
          providerPaymentId: paymentIntentId,
          providerRefundId,
          amountMinor: 10000,
          currency: 'USD',
          rawObjectStatus: 'succeeded',
          metadata: {
            paymentId: String(payment._id),
            orderId: String(order._id),
            refundId: String(refundDoc._id)
          }
        },
        nextAttemptAt: new Date(Date.now() - 1000)
      });

      const summary = await paymentWebhookProcessor.processPending({ batchSize: 10 });
      expect(summary.processed).toBe(1);

      const updatedPayment = await Payment.findById(payment._id);
      expect(updatedPayment.refundedAmount).toBe(100);
      expect(updatedPayment.status).toBe(PAYMENT_STATUSES.REFUNDED);

      const updatedOrder = await Order.findById(order._id);
      expect(updatedOrder.paymentStatus).toBe('Refunded');

      const updatedRefund = await Refund.findById(refundDoc._id);
      expect(updatedRefund.status).toBe(REFUND_STATUSES.COMPLETED);
    });

    test('9. rejects aggregate over-refund exceeding payment available amount', async () => {
      const { user, order, payment } = await createTestOrderAndPayment({
        amount: 100,
        currency: 'USD',
        paymentStatus: PAYMENT_STATUSES.COMPLETED
      });

      // Set already refunded to 80
      payment.refundedAmount = 80;
      payment.status = PAYMENT_STATUSES.PARTIALLY_REFUNDED;
      await payment.save();

      // Attempting to reserve a new refund of 50 (80 + 50 = 130 > 100) must fail
      const refundServiceInstance = require('../../services/payment/RefundService');
      await expect(refundServiceInstance.createRefund({
        paymentId: payment._id,
        orderId: order._id,
        amount: 50,
        currency: 'USD',
        reason: 'Over-refund test',
        idempotencyKey: crypto.randomUUID(),
        adminId: user._id
      })).rejects.toThrow();
    });

    test('10. duplicate refund event produces zero additional adjustment', async () => {
      const { user, order, payment, paymentIntentId } = await createTestOrderAndPayment({
        amount: 100,
        currency: 'USD',
        paymentStatus: PAYMENT_STATUSES.COMPLETED
      });

      const providerRefundId = `re_dup_${crypto.randomUUID()}`;
      const refundDoc = await Refund.create({
        payment: payment._id,
        order: order._id,
        customer: user._id,
        provider: 'stripe',
        amount: 50,
        currency: 'USD',
        status: REFUND_STATUSES.PENDING,
        providerRefundId,
        idempotencyKey: crypto.randomUUID(),
        requestHash: crypto.randomBytes(32).toString('hex'),
        providerIdempotencyKey: `prk_dup_${crypto.randomUUID()}`,
        providerAttemptStatus: 'Ready',
        reservationActive: true,
        processingMode: 'provider',
        providerOutcome: 'pending',
        processedBy: user._id
      });

      // First webhook delivery
      const event1 = await PaymentWebhookEvent.create({
        provider: 'stripe',
        accountAlias: 'default',
        environment: 'sandbox',
        providerEventId: `evt_dup_1_${crypto.randomUUID()}`,
        eventType: 'refund.created',
        providerPaymentId: paymentIntentId,
        providerRefundId,
        amountMinor: 5000,
        currency: 'USD',
        payloadHash: 'hash_dup_1',
        status: WEBHOOK_PROCESSING_STATUSES.RECEIVED,
        eventData: {
          providerEventId: 'evt_dup_1',
          eventType: 'refund.created',
          providerPaymentId: paymentIntentId,
          providerRefundId,
          amountMinor: 5000,
          currency: 'USD',
          rawObjectStatus: 'succeeded',
          metadata: {
            paymentId: String(payment._id),
            orderId: String(order._id),
            refundId: String(refundDoc._id)
          }
        },
        nextAttemptAt: new Date(Date.now() - 1000)
      });

      const summary1 = await paymentWebhookProcessor.processPending({ batchSize: 10 });
      expect(summary1.processed).toBe(1);

      const paymentAfterFirst = await Payment.findById(payment._id);
      expect(paymentAfterFirst.refundedAmount).toBe(50);

      // Duplicate webhook delivery for already completed refund
      const event2 = await PaymentWebhookEvent.create({
        provider: 'stripe',
        accountAlias: 'default',
        environment: 'sandbox',
        providerEventId: `evt_dup_2_${crypto.randomUUID()}`,
        eventType: 'refund.created',
        providerPaymentId: paymentIntentId,
        providerRefundId,
        amountMinor: 5000,
        currency: 'USD',
        payloadHash: 'hash_dup_2',
        status: WEBHOOK_PROCESSING_STATUSES.RECEIVED,
        eventData: {
          providerEventId: 'evt_dup_2',
          eventType: 'refund.created',
          providerPaymentId: paymentIntentId,
          providerRefundId,
          amountMinor: 5000,
          currency: 'USD',
          rawObjectStatus: 'succeeded',
          metadata: {
            paymentId: String(payment._id),
            orderId: String(order._id),
            refundId: String(refundDoc._id)
          }
        },
        nextAttemptAt: new Date(Date.now() - 1000)
      });

      const summary2 = await paymentWebhookProcessor.processPending({ batchSize: 10 });
      expect(summary2.processed + summary2.ignored).toBe(1);

      // Assert refundedAmount remains exactly 50 (zero additional adjustment)
      const paymentAfterSecond = await Payment.findById(payment._id);
      expect(paymentAfterSecond.refundedAmount).toBe(50);
    });

    test('11. fails closed with dead-letter on unknown refund reference', async () => {
      await PaymentWebhookEvent.create({
        provider: 'stripe',
        accountAlias: 'default',
        environment: 'sandbox',
        providerEventId: `evt_ref_unknown_${crypto.randomUUID()}`,
        eventType: 'refund.created',
        providerPaymentId: 'pi_unknown',
        providerRefundId: 're_nonexistent',
        amountMinor: 5000,
        currency: 'USD',
        payloadHash: 'hash_ref_unknown',
        status: WEBHOOK_PROCESSING_STATUSES.RECEIVED,
        eventData: {
          providerRefundId: 're_nonexistent',
          metadata: { refundId: new (require('mongoose').Types.ObjectId)().toString() }
        },
        nextAttemptAt: new Date(Date.now() - 1000)
      });

      const summary = await paymentWebhookProcessor.processPending({ batchSize: 10 });
      expect(summary.deadLettered).toBe(1);

      const event = await PaymentWebhookEvent.findOne({ providerRefundId: 're_nonexistent' });
      expect(event.status).toBe(WEBHOOK_PROCESSING_STATUSES.DEAD_LETTER);
    });

    test('12. payment failure or cancellation does not mutate product inventory or dispatch communications', async () => {
      const initialStock = 50;
      const testProduct = await Product.create({
        name: 'Inventory Test Product',
        slug: `inv-test-prod-${Date.now()}`,
        description: 'Test description',
        price: 30,
        stock: initialStock,
        sku: `SKU-INV-${Date.now()}`,
        isActive: true
      });

      const { order, paymentIntentId } = await createTestOrderAndPayment({
        amount: 60,
        currency: 'USD',
        paymentStatus: PAYMENT_STATUSES.PROCESSING
      });

      order.items = [{
        product: testProduct._id,
        name: testProduct.name,
        sku: testProduct.sku,
        price: 30,
        quantity: 2,
        lineTotal: 60
      }];
      await order.save();

      const sendEmailSpy = jest.spyOn(EmailService, 'send').mockResolvedValue({ success: true });

      await PaymentWebhookEvent.create({
        provider: 'stripe',
        accountAlias: 'default',
        environment: 'sandbox',
        providerEventId: `evt_inv_test_${crypto.randomUUID()}`,
        eventType: 'payment_intent.payment_failed',
        providerPaymentId: paymentIntentId,
        amountMinor: 6000,
        currency: 'USD',
        payloadHash: 'hash_inv_test',
        status: WEBHOOK_PROCESSING_STATUSES.RECEIVED,
        nextAttemptAt: new Date(Date.now() - 1000)
      });

      const summary = await paymentWebhookProcessor.processPending({ batchSize: 10 });
      expect(summary.processed).toBe(1);

      // Verify product stock is completely untouched
      const refreshedProduct = await Product.findById(testProduct._id);
      expect(refreshedProduct.stock).toBe(initialStock);

      // Verify zero external email/SMS dispatch
      expect(sendEmailSpy).not.toHaveBeenCalled();
      sendEmailSpy.mockRestore();
    });
  });
});

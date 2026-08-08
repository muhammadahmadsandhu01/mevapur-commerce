const crypto = require('crypto');
const request = require('supertest');
const app = require('../../app');
const TokenService = require('../../services/TokenService');
const stripeProvider = require('../../services/payment/providers/StripeProvider');
const PaymentService = require('../../services/payment/PaymentService');
const Order = require('../../models/Order');
const Payment = require('../../models/Payment');
const Refund = require('../../models/Refund');
const PaymentWebhookEvent = require('../../models/PaymentWebhookEvent');
const Session = require('../../models/Session');

let sequence = 0;
let currentEvent;
let createdIntents;
let idempotentIntents;
let fakeStripe;

const createAuth = async (role = 'customer') => {
  sequence += 1;
  const user = await global.createTestUser({
    email: `payment-${sequence}@example.com`,
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

const createOrder = async (user, {
  amount = 100,
  paymentMethod = 'stripe'
} = {}) => {
  const productId = new (require('mongoose').Types.ObjectId)();
  return Order.create({
    user: user._id,
    idempotencyKey: crypto.randomUUID(),
    requestHash: crypto.createHash('sha256').update(crypto.randomUUID()).digest('hex'),
    items: [{
      product: productId,
      name: 'Payment test product',
      sku: `PAY-${++sequence}`,
      price: amount,
      quantity: 1,
      lineTotal: amount
    }],
    shippingAddress: {
      fullName: 'Payment Test',
      phone: '03001234567',
      address: '12 Payment Integration Street',
      city: 'Lahore',
      province: 'Punjab',
      country: 'Pakistan'
    },
    paymentMethod,
    payment: {
      provider: paymentMethod === 'stripe' ? 'Stripe' : 'COD',
      currency: 'PKR'
    },
    subtotal: amount,
    shippingCost: 0,
    taxAmount: 0,
    discount: 0,
    totalAmount: amount,
    orderStatus: 'Pending',
    statusTimeline: [{
      status: 'Pending',
      actor: user._id,
      actorRole: user.role,
      timestamp: new Date()
    }]
  });
};

const beginPayment = (auth, order, idempotencyKey = crypto.randomUUID()) => request(app)
  .post('/api/payments')
  .set('Authorization', auth.authorization)
  .set('Idempotency-Key', idempotencyKey)
  .send({
    orderId: order._id.toString(),
    provider: 'stripe'
  });

const eventForPayment = (payment, {
  id = `evt_${crypto.randomUUID()}`,
  type = 'payment_intent.succeeded',
  amount = Math.round(payment.amount * 100),
  currency = 'pkr',
  metadata
} = {}) => ({
  id,
  type,
  data: {
    object: {
      id: payment.providerPaymentId,
      status: type === 'payment_intent.succeeded'
        ? 'succeeded'
        : type === 'payment_intent.processing'
          ? 'processing'
          : type === 'payment_intent.canceled'
            ? 'canceled'
            : 'requires_payment_method',
      amount,
      amount_received: type === 'payment_intent.succeeded' ? amount : 0,
      currency,
      metadata: metadata || {
        paymentId: payment._id.toString(),
        orderId: payment.order.toString(),
        environment: 'non-production'
      }
    }
  }
});

const postCurrentWebhook = () => request(app)
  .post('/api/payments/webhook/stripe')
  .set('Stripe-Signature', 'test-signature')
  .set('Content-Type', 'application/json')
  .send(currentEvent);

describe('Payment API and provider reconciliation', () => {
  beforeAll(async () => {
    await Promise.all([
      Order.syncIndexes(),
      Payment.syncIndexes(),
      Refund.syncIndexes(),
      PaymentWebhookEvent.syncIndexes()
    ]);
  });

  beforeEach(() => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_isolated_fake';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_isolated_fake';
    createdIntents = new Map();
    idempotentIntents = new Map();
    let intentSequence = 0;
    let refundSequence = 0;

    fakeStripe = {
      paymentIntents: {
        create: jest.fn(async (params, options) => {
          if (idempotentIntents.has(options.idempotencyKey)) {
            return idempotentIntents.get(options.idempotencyKey);
          }
          intentSequence += 1;
          const intent = {
            id: `pi_test_${intentSequence}`,
            client_secret: `pi_test_${intentSequence}_secret_fake`,
            status: 'requires_payment_method',
            amount: params.amount,
            currency: params.currency,
            metadata: params.metadata
          };
          createdIntents.set(intent.id, intent);
          idempotentIntents.set(options.idempotencyKey, intent);
          return intent;
        }),
        retrieve: jest.fn(async (id) => createdIntents.get(id))
      },
      refunds: {
        create: jest.fn(async () => {
          refundSequence += 1;
          return {
            id: `re_test_${refundSequence}`,
            status: 'succeeded'
          };
        })
      },
      webhooks: {
        constructEvent: jest.fn((rawBody, signature) => {
          if (!Buffer.isBuffer(rawBody) || signature !== 'test-signature') {
            throw new Error('invalid test signature');
          }
          return currentEvent;
        })
      }
    };
    stripeProvider.setClientForTests(fakeStripe);
  });

  afterAll(() => {
    stripeProvider.resetClientForTests();
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_WEBHOOK_SECRET;
  });

  test('enforces auth, strict body, server totals, supported provider, and Idempotency-Key', async () => {
    const auth = await createAuth();
    const other = await createAuth();
    const stripeOrder = await createOrder(auth.user, { amount: 321.45 });
    const codOrder = await createOrder(auth.user, { paymentMethod: 'cod' });

    const unauthenticated = await request(app)
      .post('/api/payments')
      .set('Idempotency-Key', crypto.randomUUID())
      .send({ orderId: stripeOrder._id.toString(), provider: 'stripe' });
    expect(unauthenticated.status).toBe(401);

    const missingKey = await request(app)
      .post('/api/payments')
      .set('Authorization', auth.authorization)
      .send({ orderId: stripeOrder._id.toString(), provider: 'stripe' });
    expect(missingKey.status).toBe(400);
    expect(missingKey.body.error.code).toBe('PAYMENT_VALIDATION_FAILED');

    const retiredBody = await request(app)
      .post('/api/payments')
      .set('Authorization', auth.authorization)
      .set('Idempotency-Key', crypto.randomUUID())
      .send({
        orderId: stripeOrder._id.toString(),
        provider: 'stripe',
        gateway: 'stripe',
        amount: 1,
        currency: 'USD'
      });
    expect(retiredBody.status).toBe(400);
    expect(await Payment.countDocuments()).toBe(0);

    const nonOwner = await beginPayment(other, stripeOrder);
    expect(nonOwner.status).toBe(403);
    expect(nonOwner.body.error.code).toBe('PAYMENT_FORBIDDEN');

    const cod = await beginPayment(auth, codOrder);
    expect(cod.status).toBe(409);
    expect(cod.body.error.code).toBe('PAYMENT_ORDER_NOT_PAYABLE');

    const created = await beginPayment(auth, stripeOrder);
    expect(created.status).toBe(201);
    expect(created.body.data.payment).toMatchObject({
      order: stripeOrder._id.toString(),
      provider: 'stripe',
      amount: 321.45,
      currency: 'PKR',
      status: 'Processing'
    });
    expect(created.body.data.clientSecret).toMatch(/^pi_test_1_secret_fake$/);
    expect(created.body.data.payment).not.toHaveProperty('providerResponse');
    expect(fakeStripe.paymentIntents.create.mock.calls[0][0].amount).toBe(32145);
    expect((await Order.findById(stripeOrder._id)).paymentStatus).toBe('Pending');
  });

  test('replays, rejects a conflicting payload, and creates one provider intent concurrently', async () => {
    const auth = await createAuth();
    const firstOrder = await createOrder(auth.user);
    const secondOrder = await createOrder(auth.user);
    const key = crypto.randomUUID();

    const concurrent = await Promise.all([
      beginPayment(auth, firstOrder, key),
      beginPayment(auth, firstOrder, key)
    ]);

    expect(concurrent.map((response) => response.status).sort())
      .toEqual(expect.arrayContaining([201]));
    expect(concurrent.every((response) => [200, 201, 202].includes(response.status)))
      .toBe(true);
    expect(fakeStripe.paymentIntents.create).toHaveBeenCalledTimes(1);
    expect(await Payment.countDocuments()).toBe(1);

    const replay = await beginPayment(auth, firstOrder, key);
    expect(replay.status).toBe(200);
    expect(replay.body.data.idempotentReplay).toBe(true);
    expect(replay.body.data.clientSecret).toBeTruthy();
    expect(fakeStripe.paymentIntents.create).toHaveBeenCalledTimes(1);

    const conflict = await beginPayment(auth, secondOrder, key);
    expect(conflict.status).toBe(409);
    expect(conflict.body.error.code).toBe('PAYMENT_IDEMPOTENCY_CONFLICT');
  });

  test('recovers a provider success followed by a local persistence failure with the same provider key', async () => {
    const auth = await createAuth();
    const order = await createOrder(auth.user);
    const key = crypto.randomUUID();
    const originalFindOneAndUpdate = Payment.findOneAndUpdate.bind(Payment);
    let injectedFailure = false;
    const persistenceSpy = jest.spyOn(Payment, 'findOneAndUpdate')
      .mockImplementation((filter, update, options) => {
        if (
          !injectedFailure
          && update?.$set?.providerPaymentId
        ) {
          injectedFailure = true;
          return Promise.resolve(null);
        }
        return originalFindOneAndUpdate(filter, update, options);
      });

    const failed = await beginPayment(auth, order, key);
    persistenceSpy.mockRestore();
    expect(failed.status).toBe(503);
    expect((await Payment.findOne()).status).toBe('Failed');
    expect(fakeStripe.paymentIntents.create).toHaveBeenCalledTimes(1);

    const recovered = await beginPayment(auth, order, key);
    expect(recovered.status).toBe(200);
    expect(recovered.body.data.payment.providerPaymentId).toBe('pi_test_1');
    expect(fakeStripe.paymentIntents.create).toHaveBeenCalledTimes(2);
    expect(fakeStripe.paymentIntents.create.mock.calls[0][1])
      .toEqual(fakeStripe.paymentIntents.create.mock.calls[1][1]);
    expect(createdIntents.size).toBe(1);
  });

  test('keeps the Order unpaid and stores no raw response when provider creation fails', async () => {
    const auth = await createAuth();
    const order = await createOrder(auth.user);
    fakeStripe.paymentIntents.create.mockRejectedValueOnce(
      new Error('isolated provider creation failure')
    );

    const response = await beginPayment(auth, order);

    expect(response.status).toBe(502);
    expect(response.body.error.code).toBe('PAYMENT_PROVIDER_ERROR');
    expect((await Payment.findOne())).toMatchObject({
      status: 'Failed',
      failureCode: 'PAYMENT_PROVIDER_ERROR'
    });
    expect((await Payment.findOne()).toObject()).not.toHaveProperty(
      'providerResponse'
    );
    expect((await Order.findById(order._id)).paymentStatus).toBe('Pending');
  });

  test('keeps completion provider-authoritative and reconciles one valid raw webhook once', async () => {
    const auth = await createAuth();
    const order = await createOrder(auth.user, { amount: 275 });
    const created = await beginPayment(auth, order);
    const payment = await Payment.findById(created.body.data.payment._id);

    expect(payment.status).toBe('Processing');
    expect((await Order.findById(order._id)).paymentStatus).toBe('Pending');

    currentEvent = eventForPayment(payment, { id: 'evt_complete_once' });
    const first = await postCurrentWebhook();
    const duplicate = await postCurrentWebhook();

    expect(first.status).toBe(200);
    expect(first.body.data).toMatchObject({
      received: true,
      duplicate: false,
      outcome: 'processed'
    });
    expect(duplicate.status).toBe(200);
    expect(duplicate.body.data.duplicate).toBe(true);
    expect(fakeStripe.webhooks.constructEvent.mock.calls.every(
      ([rawBody]) => Buffer.isBuffer(rawBody)
    )).toBe(true);
    expect(await PaymentWebhookEvent.countDocuments()).toBe(1);

    const reconciledPayment = await Payment.findById(payment._id);
    const reconciledOrder = await Order.findById(order._id);
    expect(reconciledPayment).toMatchObject({
      status: 'Completed',
      paidAmount: 275
    });
    expect(reconciledOrder.paymentStatus).toBe('Paid');
    expect(reconciledOrder.payment.paymentIntentId).toBe(payment.providerPaymentId);
  });

  test('rejects invalid signatures before persistence and retries transient processing failures', async () => {
    const auth = await createAuth();
    const order = await createOrder(auth.user);
    const created = await beginPayment(auth, order);
    const payment = await Payment.findById(created.body.data.payment._id);
    currentEvent = eventForPayment(payment, { id: 'evt_transient_retry' });

    const invalid = await request(app)
      .post('/api/payments/webhook/stripe')
      .set('Stripe-Signature', 'invalid-signature')
      .set('Content-Type', 'application/json')
      .send(currentEvent);
    expect(invalid.status).toBe(400);
    expect(await PaymentWebhookEvent.countDocuments()).toBe(0);

    const original = PaymentService.processVerifiedStripeEvent;
    const transient = jest.spyOn(PaymentService, 'processVerifiedStripeEvent')
      .mockRejectedValueOnce(new Error('isolated transient test failure'))
      .mockImplementation(original.bind(PaymentService));

    const first = await postCurrentWebhook();
    const retry = await postCurrentWebhook();
    transient.mockRestore();

    expect(first.status).toBe(503);
    expect(retry.status).toBe(200);
    expect((await Payment.findById(payment._id)).status).toBe('Completed');
    expect((await PaymentWebhookEvent.findOne({
      providerEventId: 'evt_transient_retry'
    })).attemptCount).toBe(2);
  });

  test('does not complete on amount, currency, or metadata mismatch', async () => {
    const auth = await createAuth();
    const scenarios = [
      { amount: 1 },
      { currency: 'usd' },
      { metadata: { paymentId: new (require('mongoose').Types.ObjectId)().toString() } }
    ];

    for (const [index, override] of scenarios.entries()) {
      const order = await createOrder(auth.user);
      const created = await beginPayment(auth, order);
      const payment = await Payment.findById(created.body.data.payment._id);
      currentEvent = eventForPayment(payment, {
        id: `evt_mismatch_${index}`,
        ...override
      });

      const response = await postCurrentWebhook();
      expect(response.status).toBe(422);
      expect((await Payment.findById(payment._id)).status).toBe('Processing');
      expect((await Order.findById(order._id)).paymentStatus).toBe('Pending');
    }
  });

  test('ignores a late failed event after payment completion', async () => {
    const auth = await createAuth();
    const order = await createOrder(auth.user);
    const created = await beginPayment(auth, order);
    const payment = await Payment.findById(created.body.data.payment._id);

    currentEvent = eventForPayment(payment, { id: 'evt_first_success' });
    expect((await postCurrentWebhook()).status).toBe(200);

    currentEvent = eventForPayment(payment, {
      id: 'evt_late_failure',
      type: 'payment_intent.payment_failed'
    });
    const late = await postCurrentWebhook();

    expect(late.status).toBe(200);
    expect(late.body.data.outcome).toBe('ignored');
    expect((await Payment.findById(payment._id)).status).toBe('Completed');
    expect((await Order.findById(order._id)).paymentStatus).toBe('Paid');
  });

  test('deduplicates simultaneous webhook delivery and applies completion once', async () => {
    const auth = await createAuth();
    const order = await createOrder(auth.user);
    const created = await beginPayment(auth, order);
    const payment = await Payment.findById(created.body.data.payment._id);
    currentEvent = eventForPayment(payment, {
      id: 'evt_simultaneous_duplicate'
    });

    const responses = await Promise.all([
      postCurrentWebhook(),
      postCurrentWebhook()
    ]);

    expect(responses.every((response) => response.status === 200)).toBe(true);
    expect(await PaymentWebhookEvent.countDocuments({
      providerEventId: 'evt_simultaneous_duplicate'
    })).toBe(1);
    const completed = await Payment.findById(payment._id);
    expect(completed.status).toBe('Completed');
    expect(completed.history.filter(
      (entry) => entry.newStatus === 'Completed'
    )).toHaveLength(1);
  });

  test('records unsupported valid events as ignored and missing payments as retryable failures', async () => {
    currentEvent = {
      id: 'evt_unsupported_valid',
      type: 'customer.updated',
      data: { object: { id: 'cus_test_safe' } }
    };
    const unsupported = await postCurrentWebhook();
    expect(unsupported.status).toBe(200);
    expect(unsupported.body.data.outcome).toBe('ignored');

    currentEvent = {
      id: 'evt_missing_payment',
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: 'pi_missing_payment',
          amount: 10000,
          amount_received: 10000,
          currency: 'pkr',
          metadata: {}
        }
      }
    };
    const missing = await postCurrentWebhook();
    expect(missing.status).toBe(404);
    expect((await PaymentWebhookEvent.findOne({
      providerEventId: 'evt_missing_payment'
    })).status).toBe('Failed');
  });
});

describe('Admin refund orchestration', () => {
  beforeEach(() => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_isolated_fake';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_isolated_fake';
    let refundSequence = 0;
    fakeStripe = {
      paymentIntents: {
        create: jest.fn(),
        retrieve: jest.fn()
      },
      refunds: {
        create: jest.fn(async () => ({
          id: `re_test_${++refundSequence}`,
          status: 'succeeded'
        }))
      },
      webhooks: {
        constructEvent: jest.fn(() => currentEvent)
      }
    };
    stripeProvider.setClientForTests(fakeStripe);
  });

  const createCompletedPayment = async (owner, amount = 100) => {
    const order = await createOrder(owner.user, { amount });
    const payment = await Payment.create({
      order: order._id,
      user: owner.user._id,
      provider: 'stripe',
      gateway: 'stripe',
      providerPaymentId: `pi_refund_${++sequence}`,
      status: 'Completed',
      amount,
      currency: 'PKR',
      paidAmount: amount,
      idempotencyKey: crypto.randomUUID(),
      requestHash: crypto.createHash('sha256').update(crypto.randomUUID()).digest('hex'),
      providerIdempotencyKey: `payment-test-${crypto.randomUUID()}`,
      providerAttemptStatus: 'Ready',
      completedAt: new Date()
    });
    order.paymentStatus = 'Paid';
    order.payment.provider = 'Stripe';
    order.payment.paymentIntentId = payment.providerPaymentId;
    order.payment.paidAt = new Date();
    await order.save();
    return { order, payment };
  };

  const refundRequest = (auth, payment, amount, key = crypto.randomUUID()) => request(app)
    .post(`/api/payments/${payment._id}/refunds`)
    .set('Authorization', auth.authorization)
    .set('Idempotency-Key', key)
    .send({ amount, reason: 'Approved customer refund' });

  test('is admin-only, supports partial/full idempotent refunds, and never restores inventory', async () => {
    const owner = await createAuth();
    const admin = await createAuth('admin');
    const { order, payment } = await createCompletedPayment(owner, 100);
    const key = crypto.randomUUID();

    const forbidden = await refundRequest(owner, payment, 40);
    expect(forbidden.status).toBe(403);

    const partial = await refundRequest(admin, payment, 40, key);
    const replay = await refundRequest(admin, payment, 40, key);
    expect(partial.status).toBe(201);
    expect(replay.status).toBe(200);
    expect(fakeStripe.refunds.create).toHaveBeenCalledTimes(1);
    expect((await Payment.findById(payment._id))).toMatchObject({
      status: 'PartiallyRefunded',
      refundedAmount: 40
    });
    expect((await Order.findById(order._id)).paymentStatus)
      .toBe('PartiallyRefunded');

    const full = await refundRequest(admin, payment, 60);
    expect(full.status).toBe(201);
    expect((await Payment.findById(payment._id))).toMatchObject({
      status: 'Refunded',
      refundedAmount: 100
    });
    const finalOrder = await Order.findById(order._id);
    expect(finalOrder.paymentStatus).toBe('Refunded');
    expect(finalOrder.inventoryRestoredAt).toBeNull();
  });

  test('caps concurrent refunds at the remaining paid amount', async () => {
    const owner = await createAuth();
    const admin = await createAuth('admin');
    const { payment } = await createCompletedPayment(owner, 100);

    const responses = await Promise.all([
      refundRequest(admin, payment, 80),
      refundRequest(admin, payment, 80)
    ]);

    expect(responses.filter((response) => response.status === 201)).toHaveLength(1);
    expect(responses.filter((response) => response.status === 409)).toHaveLength(1);
    expect(fakeStripe.refunds.create).toHaveBeenCalledTimes(1);
    expect((await Payment.findById(payment._id)).refundedAmount).toBe(80);
  });

  test('rejects zero and above-remaining refund amounts before provider execution', async () => {
    const owner = await createAuth();
    const admin = await createAuth('admin');
    const { payment } = await createCompletedPayment(owner, 100);

    const zero = await refundRequest(admin, payment, 0);
    const excessive = await refundRequest(admin, payment, 101);

    expect(zero.status).toBe(400);
    expect(excessive.status).toBe(409);
    expect(excessive.body.error.code).toBe('REFUND_AMOUNT_EXCEEDS_AVAILABLE');
    expect(fakeStripe.refunds.create).not.toHaveBeenCalled();
    expect((await Payment.findById(payment._id))).toMatchObject({
      status: 'Completed',
      refundedAmount: 0
    });
  });

  test('keeps a successful payment successful when the provider refund fails', async () => {
    const owner = await createAuth();
    const admin = await createAuth('admin');
    const { order, payment } = await createCompletedPayment(owner, 100);
    fakeStripe.refunds.create.mockRejectedValueOnce(
      new Error('isolated provider failure')
    );

    const response = await refundRequest(admin, payment, 25);

    expect(response.status).toBe(502);
    expect((await Payment.findById(payment._id))).toMatchObject({
      status: 'Completed',
      refundedAmount: 0
    });
    expect((await Order.findById(order._id)).paymentStatus).toBe('Paid');
    expect((await Refund.findOne()).status).toBe('Failed');
  });

  test('finalizes a pending refund only after its verified provider event', async () => {
    const owner = await createAuth();
    const admin = await createAuth('admin');
    const { order, payment } = await createCompletedPayment(owner, 100);
    fakeStripe.refunds.create.mockResolvedValueOnce({
      id: 're_pending_webhook',
      status: 'pending'
    });

    const response = await refundRequest(admin, payment, 30);
    expect(response.status).toBe(201);
    const refund = await Refund.findOne();
    expect(refund.status).toBe('Processing');
    expect((await Payment.findById(payment._id)).status).toBe('Completed');

    currentEvent = {
      id: 'evt_refund_succeeded',
      type: 'refund.updated',
      data: {
        object: {
          id: 're_pending_webhook',
          status: 'succeeded',
          amount: 3000,
          currency: 'pkr',
          metadata: {
            refundId: refund._id.toString(),
            paymentId: payment._id.toString(),
            orderId: order._id.toString()
          }
        }
      }
    };
    const webhook = await postCurrentWebhook();

    expect(webhook.status).toBe(200);
    expect((await Refund.findById(refund._id)).status).toBe('Completed');
    expect((await Payment.findById(payment._id))).toMatchObject({
      status: 'PartiallyRefunded',
      refundedAmount: 30
    });
    expect((await Order.findById(order._id)).paymentStatus)
      .toBe('PartiallyRefunded');
  });
});

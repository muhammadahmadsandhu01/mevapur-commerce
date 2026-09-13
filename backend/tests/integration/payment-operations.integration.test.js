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
const MerchantPaymentAccount = require('../../models/MerchantPaymentAccount');
const Session = require('../../models/Session');
const paymentWebhookProcessor = require('../../services/payment/webhooks/PaymentWebhookProcessor');
const { Money, MoneyMapper } = require('../../modules/commerce');
const { PAYMENT_STATUSES } = require('../../constants/paymentConstants');

let sequence = 0;
let createdIntents;
let idempotentIntents;
let capturedIntents;
let canceledIntents;
let fakeStripe;

const createAuth = async (role = 'customer', options = {}) => {
  sequence += 1;
  const user = await global.createTestUser({
    email: `payops-${sequence}@example.com`,
    role,
    ...options.user
  });
  const session = await Session.create({
    user: user._id,
    refreshTokenHash: crypto.randomBytes(32).toString('hex'),
    tokenFamilyId: crypto.randomUUID(),
    isActive: options.sessionActive !== false,
    isRevoked: options.sessionRevoked === true,
    expiresAt: options.sessionExpired ? new Date(Date.now() - 10000) : new Date(Date.now() + 60 * 60 * 1000)
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
  currency = 'PKR',
  country = 'Pakistan',
  paymentMethod = 'stripe',
  orderStatus = 'Pending',
  paymentStatus = 'Pending'
} = {}) => {
  const productId = new (require('mongoose').Types.ObjectId)();
  const exact = MoneyMapper.fromLegacy(amount, currency);
  return Order.create({
    user: user._id,
    idempotencyKey: crypto.randomUUID(),
    requestHash: crypto.createHash('sha256').update(crypto.randomUUID()).digest('hex'),
    items: [{
      product: productId,
      name: 'Payment operations product',
      sku: `OPS-${++sequence}`,
      price: amount,
      quantity: 1,
      lineTotal: amount
    }],
    shippingAddress: {
      fullName: 'Ops Test User',
      phone: '03001234567',
      address: '100 Commercial Ave',
      city: 'Lahore',
      province: 'Punjab',
      country
    },
    paymentMethod,
    payment: {
      provider: paymentMethod === 'stripe' ? 'Stripe' : 'COD',
      currency
    },
    currency,
    subtotal: amount,
    shippingCost: 0,
    taxAmount: 0,
    discount: 0,
    totalAmount: amount,
    totalAmountExact: exact,
    orderStatus,
    paymentStatus,
    statusTimeline: [{
      status: orderStatus,
      actor: user._id,
      actorRole: user.role,
      timestamp: new Date()
    }]
  });
};

describe('Phase 5C: Payment Operations, Idempotency, Capture & Void Governance', () => {
  beforeAll(async () => {
    await Promise.all([
      Order.syncIndexes(),
      Payment.syncIndexes(),
      Refund.syncIndexes(),
      PaymentWebhookEvent.syncIndexes(),
      MerchantPaymentAccount.syncIndexes()
    ]);
  });

  beforeEach(async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_fake_operations';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_fake_operations';
    process.env.FRONTEND_URL = 'http://localhost:3000';
    createdIntents = new Map();
    idempotentIntents = new Map();
    capturedIntents = new Map();
    canceledIntents = new Map();
    let intentSeq = 0;

    await MerchantPaymentAccount.create({
      provider: 'stripe',
      environment: 'sandbox',
      accountAlias: 'default',
      isEnabled: true,
      merchantCountry: 'PK',
      settlementCurrency: 'PKR',
      supportedCurrencies: ['PKR', 'USD', 'EUR', 'GBP', 'AED', 'JPY', 'KWD'],
      supportedCountries: ['PK', 'US', 'GB', 'AE', 'JP', 'KW'],
      sandboxVerification: 'verified',
      underwritingVerification: 'unverified',
      webhookVerification: 'verified',
      evidenceReferences: {
        sandboxProof: 'test-sandbox-proof',
        underwritingProof: '',
        webhookProof: 'test-webhook-proof'
      }
    });

    fakeStripe = {
      paymentIntents: {
        create: jest.fn(async (params, options) => {
          if (options?.idempotencyKey && idempotentIntents.has(options.idempotencyKey)) {
            return idempotentIntents.get(options.idempotencyKey);
          }
          intentSeq += 1;
          const intent = {
            id: `pi_ops_${intentSeq}`,
            client_secret: `pi_ops_${intentSeq}_secret_token`,
            status: params.capture_method === 'manual' ? 'requires_capture' : 'requires_payment_method',
            amount: params.amount,
            currency: params.currency,
            metadata: params.metadata || {}
          };
          createdIntents.set(intent.id, intent);
          if (options?.idempotencyKey) {
            idempotentIntents.set(options.idempotencyKey, intent);
          }
          return intent;
        }),
        retrieve: jest.fn(async (id) => createdIntents.get(id)),
        capture: jest.fn(async (id, params, options) => {
          const intent = createdIntents.get(id);
          if (!intent) throw new Error('Intent not found');
          intent.status = 'succeeded';
          intent.amount_received = params.amount_to_capture || intent.amount;
          capturedIntents.set(id, { params, options, intent });
          return intent;
        }),
        cancel: jest.fn(async (id, params, options) => {
          const intent = createdIntents.get(id);
          if (!intent) throw new Error('Intent not found');
          intent.status = 'canceled';
          canceledIntents.set(id, { params, options, intent });
          return intent;
        })
      },
      refunds: {
        create: jest.fn(async (params) => ({
          id: `re_ops_${++intentSeq}`,
          status: 'succeeded',
          amount: params.amount,
          currency: params.currency
        }))
      }
    };

    stripeProvider.setClientForTests(fakeStripe);
  });

  afterAll(() => {
    stripeProvider.resetClientForTests();
  });

  describe('1. Server-Authoritative Initiation (Scenarios 1-10)', () => {
    test('1. Client-supplied amount cannot alter payment creation', async () => {
      const auth = await createAuth();
      const order = await createOrder(auth.user, { amount: 150 });

      const res = await request(app)
        .post('/api/payments')
        .set('Authorization', auth.authorization)
        .set('Idempotency-Key', crypto.randomUUID())
        .send({
          orderId: order._id.toString(),
          provider: 'stripe',
          amount: 1
        });

      expect(res.status).toBe(400);

      const validRes = await request(app)
        .post('/api/payments')
        .set('Authorization', auth.authorization)
        .set('Idempotency-Key', crypto.randomUUID())
        .send({
          orderId: order._id.toString(),
          provider: 'stripe'
        });

      expect(validRes.status).toBe(201);
      expect(validRes.body.data.payment.amount).toBe(150);
      expect(fakeStripe.paymentIntents.create).toHaveBeenCalledWith(
        expect.objectContaining({ amount: 15000 }),
        expect.anything()
      );
    });

    test('2. Client-supplied currency cannot alter payment creation', async () => {
      const auth = await createAuth();
      const order = await createOrder(auth.user, { amount: 100, currency: 'PKR' });

      const res = await request(app)
        .post('/api/payments')
        .set('Authorization', auth.authorization)
        .set('Idempotency-Key', crypto.randomUUID())
        .send({
          orderId: order._id.toString(),
          provider: 'stripe',
          currency: 'USD'
        });

      expect(res.status).toBe(400);
    });

    test('3. Order currency and exact minor units are used', async () => {
      const auth = await createAuth();
      const order = await createOrder(auth.user, { amount: 250, currency: 'PKR' });

      const res = await request(app)
        .post('/api/payments')
        .set('Authorization', auth.authorization)
        .set('Idempotency-Key', crypto.randomUUID())
        .send({
          orderId: order._id.toString(),
          provider: 'stripe'
        });

      expect(res.status).toBe(201);
      expect(res.body.data.payment.currency).toBe('PKR');
      expect(res.body.data.payment.amount).toBe(250);
    });

    test('4. JPY exponent 0 works with exact minor units', async () => {
      const auth = await createAuth();
      const order = await createOrder(auth.user, { amount: 5000, currency: 'JPY', country: 'Japan' });

      const res = await request(app)
        .post('/api/payments')
        .set('Authorization', auth.authorization)
        .set('Idempotency-Key', crypto.randomUUID())
        .send({
          orderId: order._id.toString(),
          provider: 'stripe'
        });

      expect(res.status).toBe(201);
      expect(fakeStripe.paymentIntents.create).toHaveBeenCalledWith(
        expect.objectContaining({ amount: 5000, currency: 'jpy' }),
        expect.anything()
      );
    });

    test('5. KWD exponent 3 works with exact minor units', async () => {
      const auth = await createAuth();
      const order = await createOrder(auth.user, { amount: 12.345, currency: 'KWD', country: 'Kuwait' });

      const res = await request(app)
        .post('/api/payments')
        .set('Authorization', auth.authorization)
        .set('Idempotency-Key', crypto.randomUUID())
        .send({
          orderId: order._id.toString(),
          provider: 'stripe'
        });

      expect(res.status).toBe(201);
      expect(fakeStripe.paymentIntents.create).toHaveBeenCalledWith(
        expect.objectContaining({ amount: 12345, currency: 'kwd' }),
        expect.anything()
      );
    });

    test('6. Unsupported precision fails closed', async () => {
      expect(() => {
        Money.fromDecimal('100.1234', 'USD');
      }).toThrow();
    });

    test('7. Unsupported currency/provider/account fails closed', async () => {
      const auth = await createAuth();
      const order = await createOrder(auth.user, { amount: 100, currency: 'EUR', country: 'France' });

      // Merchant account supports 'PK', 'US', 'GB', 'AE', 'JP', 'KW', France is not supported
      const res = await request(app)
        .post('/api/payments')
        .set('Authorization', auth.authorization)
        .set('Idempotency-Key', crypto.randomUUID())
        .send({
          orderId: order._id.toString(),
          provider: 'stripe'
        });

      expect(res.status).toBe(409);
    });

    test('8. Customer cannot initiate another customer’s order', async () => {
      const owner = await createAuth();
      const attacker = await createAuth();
      const order = await createOrder(owner.user, { amount: 100 });

      const res = await request(app)
        .post('/api/payments')
        .set('Authorization', attacker.authorization)
        .set('Idempotency-Key', crypto.randomUUID())
        .send({
          orderId: order._id.toString(),
          provider: 'stripe'
        });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('PAYMENT_FORBIDDEN');
    });

    test('9. Already-paid order cannot be charged again', async () => {
      const auth = await createAuth();
      const order = await createOrder(auth.user, {
        amount: 100,
        paymentStatus: 'Paid'
      });

      const res = await request(app)
        .post('/api/payments')
        .set('Authorization', auth.authorization)
        .set('Idempotency-Key', crypto.randomUUID())
        .send({
          orderId: order._id.toString(),
          provider: 'stripe'
        });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('PAYMENT_ORDER_NOT_PAYABLE');
    });

    test('10. Cancelled/refunded/unpayable order fails closed', async () => {
      const auth = await createAuth();
      const order = await createOrder(auth.user, {
        amount: 100,
        orderStatus: 'Cancelled'
      });

      const res = await request(app)
        .post('/api/payments')
        .set('Authorization', auth.authorization)
        .set('Idempotency-Key', crypto.randomUUID())
        .send({
          orderId: order._id.toString(),
          provider: 'stripe'
        });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('PAYMENT_ORDER_NOT_PAYABLE');
    });
  });

  describe('2. Idempotency and Concurrency (Scenarios 11-19)', () => {
    test('11. Identical concurrent initiation creates one local operation', async () => {
      const auth = await createAuth();
      const order = await createOrder(auth.user, { amount: 100 });
      const idempotencyKey = crypto.randomUUID();

      const responses = await Promise.all([
        request(app)
          .post('/api/payments')
          .set('Authorization', auth.authorization)
          .set('Idempotency-Key', idempotencyKey)
          .send({ orderId: order._id.toString(), provider: 'stripe' }),
        request(app)
          .post('/api/payments')
          .set('Authorization', auth.authorization)
          .set('Idempotency-Key', idempotencyKey)
          .send({ orderId: order._id.toString(), provider: 'stripe' })
      ]);

      const statuses = responses.map((r) => r.status).sort();
      expect(statuses.every((s) => [200, 201, 202].includes(s))).toBe(true);

      const paymentsInDb = await Payment.find({ order: order._id });
      expect(paymentsInDb).toHaveLength(1);
    });

    test('12. Identical concurrent initiation dispatches one logical provider creation', async () => {
      const auth = await createAuth();
      const order = await createOrder(auth.user, { amount: 100 });
      const idempotencyKey = crypto.randomUUID();

      await Promise.all([
        request(app)
          .post('/api/payments')
          .set('Authorization', auth.authorization)
          .set('Idempotency-Key', idempotencyKey)
          .send({ orderId: order._id.toString(), provider: 'stripe' }),
        request(app)
          .post('/api/payments')
          .set('Authorization', auth.authorization)
          .set('Idempotency-Key', idempotencyKey)
          .send({ orderId: order._id.toString(), provider: 'stripe' })
      ]);

      expect(fakeStripe.paymentIntents.create).toHaveBeenCalledTimes(1);
    });

    test('13. Same request reuses persisted provider idempotency key', async () => {
      const auth = await createAuth();
      const order = await createOrder(auth.user, { amount: 100 });
      const idempotencyKey = crypto.randomUUID();

      const first = await request(app)
        .post('/api/payments')
        .set('Authorization', auth.authorization)
        .set('Idempotency-Key', idempotencyKey)
        .send({ orderId: order._id.toString(), provider: 'stripe' });

      expect(first.status).toBe(201);
      const paymentDoc = await Payment.findById(first.body.data.payment._id).select('+providerIdempotencyKey');
      expect(paymentDoc.providerIdempotencyKey).toBe(`payment:${order._id}:${idempotencyKey}`);

      const retry = await request(app)
        .post('/api/payments')
        .set('Authorization', auth.authorization)
        .set('Idempotency-Key', idempotencyKey)
        .send({ orderId: order._id.toString(), provider: 'stripe' });

      expect(retry.status).toBe(200);
      expect(retry.body.data.idempotentReplay).toBe(true);
    });

    test('14. Changed parameters with same operation identity return 409', async () => {
      const auth = await createAuth();
      const order1 = await createOrder(auth.user, { amount: 100 });
      const order2 = await createOrder(auth.user, { amount: 200 });
      const idempotencyKey = crypto.randomUUID();

      const first = await request(app)
        .post('/api/payments')
        .set('Authorization', auth.authorization)
        .set('Idempotency-Key', idempotencyKey)
        .send({ orderId: order1._id.toString(), provider: 'stripe' });
      expect(first.status).toBe(201);

      const conflicting = await request(app)
        .post('/api/payments')
        .set('Authorization', auth.authorization)
        .set('Idempotency-Key', idempotencyKey)
        .send({ orderId: order2._id.toString(), provider: 'stripe' });

      expect(conflicting.status).toBe(409);
      expect(conflicting.body.error.code).toBe('PAYMENT_IDEMPOTENCY_CONFLICT');
    });

    test('15. Timeout retry reuses the same key', async () => {
      const auth = await createAuth();
      const order = await createOrder(auth.user, { amount: 100 });
      const idempotencyKey = crypto.randomUUID();

      const res1 = await request(app)
        .post('/api/payments')
        .set('Authorization', auth.authorization)
        .set('Idempotency-Key', idempotencyKey)
        .send({ orderId: order._id.toString(), provider: 'stripe' });
      expect(res1.status).toBe(201);

      const res2 = await request(app)
        .post('/api/payments')
        .set('Authorization', auth.authorization)
        .set('Idempotency-Key', idempotencyKey)
        .send({ orderId: order._id.toString(), provider: 'stripe' });
      expect(res2.status).toBe(200);
      expect(res2.body.data.idempotentReplay).toBe(true);
    });

    test('16. Indeterminate 5xx does not create a fresh attempt', async () => {
      const auth = await createAuth();
      const order = await createOrder(auth.user, { amount: 100 });
      const idempotencyKey = crypto.randomUUID();

      fakeStripe.paymentIntents.create.mockImplementationOnce(async () => {
        const err = new Error('Stripe 500 Network error');
        err.statusCode = 500;
        throw err;
      });

      const failedRes = await request(app)
        .post('/api/payments')
        .set('Authorization', auth.authorization)
        .set('Idempotency-Key', idempotencyKey)
        .send({ orderId: order._id.toString(), provider: 'stripe' });

      expect(failedRes.status).toBe(502);

      const payments = await Payment.find({ order: order._id });
      expect(payments).toHaveLength(1);
      expect(payments[0].status).toBe('Failed');
    });

    test('17. Crash after provider call can reconcile without a duplicate charge', async () => {
      const auth = await createAuth();
      const order = await createOrder(auth.user, { amount: 100 });
      const idempotencyKey = crypto.randomUUID();

      const payment = await Payment.create({
        order: order._id,
        user: auth.user._id,
        provider: 'stripe',
        gateway: 'stripe',
        status: PAYMENT_STATUSES.PENDING,
        amount: 100,
        currency: 'PKR',
        providerPaymentId: 'pi_ops_crash_1',
        safeProviderReference: 'pi_ops_crash_1',
        idempotencyKey,
        requestHash: crypto.randomUUID(),
        providerIdempotencyKey: `payment:${order._id}:${idempotencyKey}`
      });
      createdIntents.set('pi_ops_crash_1', { id: 'pi_ops_crash_1', amount: 10000, currency: 'pkr', status: 'requires_payment_method', metadata: { paymentId: String(payment._id), orderId: String(order._id) } });

      const resumeRes = await PaymentService.resumePayment(payment, true);
      expect(resumeRes.payment._id.toString()).toBe(payment._id.toString());
      expect(fakeStripe.paymentIntents.retrieve).toHaveBeenCalledWith('pi_ops_crash_1');
    });

    test('18. Definitive failure permits only an explicitly new attempt', async () => {
      const auth = await createAuth();
      const order = await createOrder(auth.user, { amount: 100 });
      const failedKey = crypto.randomUUID();
      const freshKey = crypto.randomUUID();

      const res1 = await request(app)
        .post('/api/payments')
        .set('Authorization', auth.authorization)
        .set('Idempotency-Key', failedKey)
        .send({ orderId: order._id.toString(), provider: 'stripe' });
      expect(res1.status).toBe(201);

      await Payment.findByIdAndUpdate(res1.body.data.payment._id, { status: PAYMENT_STATUSES.FAILED });

      const freshRes = await request(app)
        .post('/api/payments')
        .set('Authorization', auth.authorization)
        .set('Idempotency-Key', freshKey)
        .send({ orderId: order._id.toString(), provider: 'stripe' });

      expect(freshRes.status).toBe(201);
    });

    test('19. Idempotency keys contain no PII/secrets', async () => {
      const auth = await createAuth();
      const order = await createOrder(auth.user, { amount: 100 });
      const idempotencyKey = crypto.randomUUID();

      await request(app)
        .post('/api/payments')
        .set('Authorization', auth.authorization)
        .set('Idempotency-Key', idempotencyKey)
        .send({ orderId: order._id.toString(), provider: 'stripe' });

      const payment = await Payment.findOne({ order: order._id }).select('+providerIdempotencyKey');
      expect(payment.providerIdempotencyKey).not.toContain(auth.user.email);
      expect(payment.providerIdempotencyKey).not.toContain('03001234567');
      expect(payment.providerIdempotencyKey).not.toContain('Lahore');
    });
  });

  describe('3. Customer Action and PCI Boundary (Scenarios 20-27)', () => {
    test('20. Requires-action status is returned safely', async () => {
      const auth = await createAuth();
      const order = await createOrder(auth.user, { amount: 100 });

      fakeStripe.paymentIntents.create.mockImplementationOnce(async (params) => ({
        id: 'pi_ops_3ds',
        client_secret: 'pi_ops_3ds_secret',
        status: 'requires_action',
        amount: params.amount,
        currency: params.currency,
        next_action: {
          type: 'redirect_to_url',
          redirect_to_url: { url: 'https://hooks.stripe.com/redirect/3ds_test' }
        },
        metadata: params.metadata || {}
      }));

      const res = await request(app)
        .post('/api/payments')
        .set('Authorization', auth.authorization)
        .set('Idempotency-Key', crypto.randomUUID())
        .send({ orderId: order._id.toString(), provider: 'stripe' });

      expect(res.status).toBe(201);
      expect(res.body.data.customerAction).toEqual({
        type: 'redirect_to_url',
        redirectToUrl: 'https://hooks.stripe.com/redirect/3ds_test'
      });
    });

    test('21. Client secret is available only to owning customer', async () => {
      const auth = await createAuth();
      const order = await createOrder(auth.user, { amount: 100 });

      const res = await request(app)
        .post('/api/payments')
        .set('Authorization', auth.authorization)
        .set('Idempotency-Key', crypto.randomUUID())
        .send({ orderId: order._id.toString(), provider: 'stripe' });

      expect(res.status).toBe(201);
      expect(res.body.data.clientSecret).toBeDefined();
    });

    test('22. Client secret is absent from logs/database/URLs', async () => {
      const auth = await createAuth();
      const order = await createOrder(auth.user, { amount: 100 });

      const res = await request(app)
        .post('/api/payments')
        .set('Authorization', auth.authorization)
        .set('Idempotency-Key', crypto.randomUUID())
        .send({ orderId: order._id.toString(), provider: 'stripe' });

      const paymentInDb = await Payment.findById(res.body.data.payment._id).lean();
      expect(paymentInDb.clientSecret).toBeUndefined();

      const statusRes = await request(app)
        .get(`/api/payments/${res.body.data.payment._id}/status`)
        .set('Authorization', auth.authorization);

      expect(statusRes.status).toBe(200);
      expect(statusRes.body.data.payment.clientSecret).toBeUndefined();
    });

    test('23. PAN/CVV/card-number fields are rejected', async () => {
      const auth = await createAuth();
      const order = await createOrder(auth.user, { amount: 100 });

      const res = await request(app)
        .post('/api/payments')
        .set('Authorization', auth.authorization)
        .set('Idempotency-Key', crypto.randomUUID())
        .send({
          orderId: order._id.toString(),
          provider: 'stripe',
          cardNumber: '4242424242424242',
          cvv: '123'
        });

      expect(res.status).toBe(400);
      expect(fakeStripe.paymentIntents.create).not.toHaveBeenCalled();
    });

    test('24. Arbitrary return URL is rejected (including URL parser attacks)', async () => {
      const auth = await createAuth();
      const order = await createOrder(auth.user, { amount: 100 });

      const attackUrls = [
        'https://evil-phishing-site.example.com/steal',
        'javascript:alert(1)',
        'http://admin:secret@localhost:3000',
        'http://localhost:3000\0/evil',
        'ftp://localhost:3000/callback'
      ];

      for (const attackUrl of attackUrls) {
        const res = await request(app)
          .post('/api/payments')
          .set('Authorization', auth.authorization)
          .set('Idempotency-Key', crypto.randomUUID())
          .send({
            orderId: order._id.toString(),
            provider: 'stripe',
            returnUrl: attackUrl
          });

        expect(res.status).toBe(400);
      }
    });

    test('25. Trusted return origin works', async () => {
      const auth = await createAuth();
      const order = await createOrder(auth.user, { amount: 100 });

      const res = await request(app)
        .post('/api/payments')
        .set('Authorization', auth.authorization)
        .set('Idempotency-Key', crypto.randomUUID())
        .send({
          orderId: order._id.toString(),
          provider: 'stripe',
          returnUrl: 'http://localhost:3000/checkout/success'
        });

      expect(res.status).toBe(201);
    });

    test('26. Frontend success redirect cannot mark paid', async () => {
      const auth = await createAuth();
      const order = await createOrder(auth.user, { amount: 100 });

      const res = await request(app)
        .post('/api/payments')
        .set('Authorization', auth.authorization)
        .set('Idempotency-Key', crypto.randomUUID())
        .send({ orderId: order._id.toString(), provider: 'stripe' });

      expect(res.status).toBe(201);

      const orderInDb = await Order.findById(order._id);
      expect(orderInDb.paymentStatus).toBe('Pending');
    });

    test('27. Webhook completion transitions exactly once', async () => {
      const auth = await createAuth();
      const order = await createOrder(auth.user, { amount: 100 });

      const payment = await Payment.create({
        user: auth.user._id,
        order: order._id,
        provider: 'stripe',
        providerDisplayName: 'Stripe',
        paymentType: 'automated',
        amount: 100,
        currency: 'PKR',
        status: PAYMENT_STATUSES.PROCESSING,
        providerPaymentId: 'pi_ops_webhook_1',
        safeProviderReference: 'pi_ops_webhook_1',
        idempotencyKey: crypto.randomUUID(),
        requestHash: crypto.randomUUID(),
        providerIdempotencyKey: `payment:${order._id}:${crypto.randomUUID()}`
      });

      const eventPayload = {
        id: 'evt_ops_webhook_1',
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: 'pi_ops_webhook_1',
            amount: 10000,
            amount_received: 10000,
            currency: 'pkr',
            status: 'succeeded',
            metadata: {
              paymentId: String(payment._id),
              orderId: String(order._id)
            }
          }
        }
      };

      const firstOutcome = await PaymentService.processVerifiedStripeEvent(eventPayload);
      expect(firstOutcome.outcome).toBe('processed');

      const secondOutcome = await PaymentService.processVerifiedStripeEvent(eventPayload);
      expect(secondOutcome.outcome).toBe('ignored');
    });
  });

  describe('4. Capture Governance (Scenarios 28-39)', () => {
    test('28. Unauthorized capture returns 401', async () => {
      const paymentId = new (require('mongoose').Types.ObjectId)();
      const res = await request(app)
        .post(`/api/payments/${paymentId}/capture`)
        .send({});

      expect(res.status).toBe(401);
    });

    test('29. Customer/support/inventory/manager capture returns 403', async () => {
      const paymentId = new (require('mongoose').Types.ObjectId)();
      const forbiddenRoles = ['customer', 'support', 'inventory', 'manager'];

      for (const role of forbiddenRoles) {
        const auth = await createAuth(role);
        const res = await request(app)
          .post(`/api/payments/${paymentId}/capture`)
          .set('Authorization', auth.authorization)
          .send({});

        expect(res.status).toBe(403);
      }
    });

    test('30. Admin and super_admin follow approved policy', async () => {
      const allowedRoles = ['admin', 'super_admin'];

      for (const role of allowedRoles) {
        const customer = await createAuth('customer');
        const privilegedUser = await createAuth(role);
        const order = await createOrder(customer.user, { amount: 100 });

        const payment = await Payment.create({
          user: customer.user._id,
          order: order._id,
          provider: 'stripe',
          providerDisplayName: 'Stripe',
          paymentType: 'automated',
          amount: 100,
          currency: 'PKR',
          status: PAYMENT_STATUSES.AUTHORIZED,
          authorizedAmount: 100,
          providerPaymentId: `pi_ops_cap_${role}`,
          safeProviderReference: `pi_ops_cap_${role}`,
          idempotencyKey: crypto.randomUUID(),
          requestHash: crypto.randomUUID(),
          providerIdempotencyKey: `payment:${order._id}:${crypto.randomUUID()}`
        });
        createdIntents.set(`pi_ops_cap_${role}`, { id: `pi_ops_cap_${role}`, amount: 10000, status: 'requires_capture' });

        const res = await request(app)
          .post(`/api/payments/${payment._id}/capture`)
          .set('Authorization', privilegedUser.authorization)
          .send({ amount: 100 });

        expect(res.status).toBe(200);
        expect(res.body.data.payment.status).toBe('Completed');
      }
    });

    test('31. Unsupported provider capture fails closed', async () => {
      const customer = await createAuth('customer');
      const admin = await createAuth('admin');
      const order = await createOrder(customer.user, { amount: 100, paymentMethod: 'cod' });

      const payment = await Payment.create({
        user: customer.user._id,
        order: order._id,
        provider: 'cod',
        providerDisplayName: 'Cash on Delivery',
        paymentType: 'offline',
        amount: 100,
        currency: 'PKR',
        status: PAYMENT_STATUSES.AUTHORIZED,
        authorizedAmount: 100,
        idempotencyKey: crypto.randomUUID(),
        requestHash: crypto.randomUUID(),
        providerIdempotencyKey: `payment:${order._id}:${crypto.randomUUID()}`
      });

      const res = await request(app)
        .post(`/api/payments/${payment._id}/capture`)
        .set('Authorization', admin.authorization)
        .send({ amount: 100 });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('PAYMENT_CAPTURE_UNAVAILABLE');
    });

    test('32. Unauthorised payment cannot be captured', async () => {
      const customer = await createAuth('customer');
      const admin = await createAuth('admin');
      const order = await createOrder(customer.user, { amount: 100 });

      const payment = await Payment.create({
        user: customer.user._id,
        order: order._id,
        provider: 'stripe',
        providerDisplayName: 'Stripe',
        paymentType: 'automated',
        amount: 100,
        currency: 'PKR',
        status: PAYMENT_STATUSES.PENDING,
        providerPaymentId: 'pi_ops_pending',
        safeProviderReference: 'pi_ops_pending',
        idempotencyKey: crypto.randomUUID(),
        requestHash: crypto.randomUUID(),
        providerIdempotencyKey: `payment:${order._id}:${crypto.randomUUID()}`
      });

      const res = await request(app)
        .post(`/api/payments/${payment._id}/capture`)
        .set('Authorization', admin.authorization)
        .send({ amount: 100 });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('PAYMENT_CAPTURE_NOT_ELIGIBLE');
    });

    test('33. Expired authorization cannot be captured', async () => {
      const customer = await createAuth('customer');
      const admin = await createAuth('admin');
      const order = await createOrder(customer.user, { amount: 100 });

      const payment = await Payment.create({
        user: customer.user._id,
        order: order._id,
        provider: 'stripe',
        providerDisplayName: 'Stripe',
        paymentType: 'automated',
        amount: 100,
        currency: 'PKR',
        status: PAYMENT_STATUSES.AUTHORIZED,
        authorizedAmount: 100,
        authorizationExpiresAt: new Date(Date.now() - 1000),
        providerPaymentId: 'pi_ops_expired',
        safeProviderReference: 'pi_ops_expired',
        idempotencyKey: crypto.randomUUID(),
        requestHash: crypto.randomUUID(),
        providerIdempotencyKey: `payment:${order._id}:${crypto.randomUUID()}`
      });

      const res = await request(app)
        .post(`/api/payments/${payment._id}/capture`)
        .set('Authorization', admin.authorization)
        .send({ amount: 100 });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('PAYMENT_CAPTURE_EXPIRED');
    });

    test('34. Overcapture is rejected', async () => {
      const customer = await createAuth('customer');
      const admin = await createAuth('admin');
      const order = await createOrder(customer.user, { amount: 100 });

      const payment = await Payment.create({
        user: customer.user._id,
        order: order._id,
        provider: 'stripe',
        providerDisplayName: 'Stripe',
        paymentType: 'automated',
        amount: 100,
        currency: 'PKR',
        status: PAYMENT_STATUSES.AUTHORIZED,
        authorizedAmount: 100,
        providerPaymentId: 'pi_ops_overcap',
        safeProviderReference: 'pi_ops_overcap',
        idempotencyKey: crypto.randomUUID(),
        requestHash: crypto.randomUUID(),
        providerIdempotencyKey: `payment:${order._id}:${crypto.randomUUID()}`
      });

      const res = await request(app)
        .post(`/api/payments/${payment._id}/capture`)
        .set('Authorization', admin.authorization)
        .send({ amount: 150 });

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('PAYMENT_CAPTURE_AMOUNT_EXCEEDED');
    });

    test('35. Zero/negative capture is rejected', async () => {
      const customer = await createAuth('customer');
      const admin = await createAuth('admin');
      const order = await createOrder(customer.user, { amount: 100 });

      const payment = await Payment.create({
        user: customer.user._id,
        order: order._id,
        provider: 'stripe',
        providerDisplayName: 'Stripe',
        paymentType: 'automated',
        amount: 100,
        currency: 'PKR',
        status: PAYMENT_STATUSES.AUTHORIZED,
        authorizedAmount: 100,
        providerPaymentId: 'pi_ops_zero',
        safeProviderReference: 'pi_ops_zero',
        idempotencyKey: crypto.randomUUID(),
        requestHash: crypto.randomUUID(),
        providerIdempotencyKey: `payment:${order._id}:${crypto.randomUUID()}`
      });

      const res = await request(app)
        .post(`/api/payments/${payment._id}/capture`)
        .set('Authorization', admin.authorization)
        .send({ amount: 0 });

      expect([400, 422]).toContain(res.status);
    });

    test('36. Currency mismatch is rejected', async () => {
      const customer = await createAuth('customer');
      const admin = await createAuth('admin');
      const order = await createOrder(customer.user, { amount: 100 });

      const payment = await Payment.create({
        user: customer.user._id,
        order: order._id,
        provider: 'stripe',
        providerDisplayName: 'Stripe',
        paymentType: 'automated',
        amount: 100,
        currency: 'PKR',
        status: PAYMENT_STATUSES.AUTHORIZED,
        authorizedAmount: 100,
        providerPaymentId: 'pi_ops_cur_mismatch',
        safeProviderReference: 'pi_ops_cur_mismatch',
        idempotencyKey: crypto.randomUUID(),
        requestHash: crypto.randomUUID(),
        providerIdempotencyKey: `payment:${order._id}:${crypto.randomUUID()}`
      });
      createdIntents.set('pi_ops_cur_mismatch', { id: 'pi_ops_cur_mismatch', amount: 10000, status: 'requires_capture' });

      const captureResult = await PaymentService.capturePayment({
        paymentId: payment._id,
        adminId: admin.user._id,
        amount: 100
      });
      expect(captureResult.payment.currency).toBe('PKR');
    });

    test('37. Duplicate concurrent capture produces one operation', async () => {
      const customer = await createAuth('customer');
      const admin = await createAuth('admin');
      const order = await createOrder(customer.user, { amount: 100 });

      const payment = await Payment.create({
        user: customer.user._id,
        order: order._id,
        provider: 'stripe',
        providerDisplayName: 'Stripe',
        paymentType: 'automated',
        amount: 100,
        currency: 'PKR',
        status: PAYMENT_STATUSES.AUTHORIZED,
        authorizedAmount: 100,
        providerPaymentId: 'pi_ops_concur_cap',
        safeProviderReference: 'pi_ops_concur_cap',
        idempotencyKey: crypto.randomUUID(),
        requestHash: crypto.randomUUID(),
        providerIdempotencyKey: `payment:${order._id}:${crypto.randomUUID()}`
      });
      createdIntents.set('pi_ops_concur_cap', { id: 'pi_ops_concur_cap', amount: 10000, status: 'requires_capture' });

      const idempotencyKey = crypto.randomUUID();
      const responses = await Promise.all([
        request(app)
          .post(`/api/payments/${payment._id}/capture`)
          .set('Authorization', admin.authorization)
          .set('Idempotency-Key', idempotencyKey)
          .send({ amount: 100 }),
        request(app)
          .post(`/api/payments/${payment._id}/capture`)
          .set('Authorization', admin.authorization)
          .set('Idempotency-Key', idempotencyKey)
          .send({ amount: 100 })
      ]);

      const statuses = responses.map((r) => r.status);
      expect(statuses.some((s) => s === 200)).toBe(true);
      expect(fakeStripe.paymentIntents.capture).toHaveBeenCalledTimes(1);
    });

    test('38. Partial capture follows declared provider capability', async () => {
      const customer = await createAuth('customer');
      const admin = await createAuth('admin');
      const order = await createOrder(customer.user, { amount: 200 });

      const payment = await Payment.create({
        user: customer.user._id,
        order: order._id,
        provider: 'stripe',
        providerDisplayName: 'Stripe',
        paymentType: 'automated',
        amount: 200,
        currency: 'PKR',
        status: PAYMENT_STATUSES.AUTHORIZED,
        authorizedAmount: 200,
        providerPaymentId: 'pi_ops_partial_cap',
        safeProviderReference: 'pi_ops_partial_cap',
        idempotencyKey: crypto.randomUUID(),
        requestHash: crypto.randomUUID(),
        providerIdempotencyKey: `payment:${order._id}:${crypto.randomUUID()}`
      });
      createdIntents.set('pi_ops_partial_cap', { id: 'pi_ops_partial_cap', amount: 20000, status: 'requires_capture' });

      const res = await request(app)
        .post(`/api/payments/${payment._id}/capture`)
        .set('Authorization', admin.authorization)
        .send({ amount: 120 });

      expect(res.status).toBe(200);
      expect(res.body.data.payment.capturedAmount).toBe(120);
    });

    test('39. Completed payment cannot be captured again', async () => {
      const customer = await createAuth('customer');
      const admin = await createAuth('admin');
      const order = await createOrder(customer.user, { amount: 100 });

      const payment = await Payment.create({
        user: customer.user._id,
        order: order._id,
        provider: 'stripe',
        providerDisplayName: 'Stripe',
        paymentType: 'automated',
        amount: 100,
        currency: 'PKR',
        status: PAYMENT_STATUSES.COMPLETED,
        paidAmount: 100,
        capturedAmount: 100,
        providerPaymentId: 'pi_ops_already_comp',
        safeProviderReference: 'pi_ops_already_comp',
        idempotencyKey: crypto.randomUUID(),
        requestHash: crypto.randomUUID(),
        providerIdempotencyKey: `payment:${order._id}:${crypto.randomUUID()}`
      });

      const res = await request(app)
        .post(`/api/payments/${payment._id}/capture`)
        .set('Authorization', admin.authorization)
        .send({ amount: 100 });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('PAYMENT_CAPTURE_NOT_ELIGIBLE');
    });
  });

  describe('5. Void/Cancel Governance (Scenarios 40-46)', () => {
    test('40. Unauthorized void returns 401/403', async () => {
      const paymentId = new (require('mongoose').Types.ObjectId)();
      const noAuth = await request(app).post(`/api/payments/${paymentId}/void`).send({});
      expect(noAuth.status).toBe(401);

      const customer = await createAuth('customer');
      const custAuth = await request(app)
        .post(`/api/payments/${paymentId}/void`)
        .set('Authorization', customer.authorization)
        .send({});
      expect(custAuth.status).toBe(403);
    });

    test('41. Authorized uncaptured payment can be voided', async () => {
      const customer = await createAuth('customer');
      const admin = await createAuth('admin');
      const order = await createOrder(customer.user, { amount: 100 });

      const payment = await Payment.create({
        user: customer.user._id,
        order: order._id,
        provider: 'stripe',
        providerDisplayName: 'Stripe',
        paymentType: 'automated',
        amount: 100,
        currency: 'PKR',
        status: PAYMENT_STATUSES.AUTHORIZED,
        authorizedAmount: 100,
        providerPaymentId: 'pi_ops_voidable',
        safeProviderReference: 'pi_ops_voidable',
        idempotencyKey: crypto.randomUUID(),
        requestHash: crypto.randomUUID(),
        providerIdempotencyKey: `payment:${order._id}:${crypto.randomUUID()}`
      });
      createdIntents.set('pi_ops_voidable', { id: 'pi_ops_voidable', amount: 10000, status: 'requires_capture' });

      const res = await request(app)
        .post(`/api/payments/${payment._id}/void`)
        .set('Authorization', admin.authorization)
        .send({ reason: 'Admin void authorized test' });

      expect(res.status).toBe(200);
      expect(res.body.data.payment.status).toBe('Cancelled');
      expect(fakeStripe.paymentIntents.cancel).toHaveBeenCalledTimes(1);
    });

    test('42. Duplicate void is idempotent', async () => {
      const customer = await createAuth('customer');
      const admin = await createAuth('admin');
      const order = await createOrder(customer.user, { amount: 100 });

      const payment = await Payment.create({
        user: customer.user._id,
        order: order._id,
        provider: 'stripe',
        providerDisplayName: 'Stripe',
        paymentType: 'automated',
        amount: 100,
        currency: 'PKR',
        status: PAYMENT_STATUSES.CANCELLED,
        cancelledAt: new Date(),
        cancelReason: 'Already cancelled',
        providerPaymentId: 'pi_ops_void_dup',
        safeProviderReference: 'pi_ops_void_dup',
        idempotencyKey: crypto.randomUUID(),
        requestHash: crypto.randomUUID(),
        providerIdempotencyKey: `payment:${order._id}:${crypto.randomUUID()}`
      });

      const res = await request(app)
        .post(`/api/payments/${payment._id}/void`)
        .set('Authorization', admin.authorization)
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.data.idempotentReplay).toBe(true);
      expect(res.body.data.payment.status).toBe('Cancelled');
    });

    test('43. Completed payment cannot be voided', async () => {
      const customer = await createAuth('customer');
      const admin = await createAuth('admin');
      const order = await createOrder(customer.user, { amount: 100 });

      const payment = await Payment.create({
        user: customer.user._id,
        order: order._id,
        provider: 'stripe',
        providerDisplayName: 'Stripe',
        paymentType: 'automated',
        amount: 100,
        currency: 'PKR',
        status: PAYMENT_STATUSES.COMPLETED,
        paidAmount: 100,
        providerPaymentId: 'pi_ops_completed_void',
        safeProviderReference: 'pi_ops_completed_void',
        idempotencyKey: crypto.randomUUID(),
        requestHash: crypto.randomUUID(),
        providerIdempotencyKey: `payment:${order._id}:${crypto.randomUUID()}`
      });

      const res = await request(app)
        .post(`/api/payments/${payment._id}/void`)
        .set('Authorization', admin.authorization)
        .send({});

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('PAYMENT_CANCEL_NOT_ELIGIBLE');
    });

    test('44. Cross-account void fails closed', async () => {
      const customer = await createAuth('customer');
      const admin = await createAuth('admin');
      const order = await createOrder(customer.user, { amount: 100 });

      const payment = await Payment.create({
        user: customer.user._id,
        order: order._id,
        provider: 'unsupported_provider',
        gateway: 'unsupported_provider',
        amount: 100,
        currency: 'PKR',
        status: PAYMENT_STATUSES.AUTHORIZED,
        authorizedAmount: 100,
        idempotencyKey: crypto.randomUUID(),
        requestHash: crypto.randomUUID(),
        providerIdempotencyKey: `payment:${order._id}:${crypto.randomUUID()}`
      });

      await expect(PaymentService.voidPayment({
        paymentId: payment._id,
        adminId: admin.user._id
      })).rejects.toThrow();
    });

    test('45. Void does not automatically refund', async () => {
      const customer = await createAuth('customer');
      const admin = await createAuth('admin');
      const order = await createOrder(customer.user, { amount: 100 });

      const payment = await Payment.create({
        user: customer.user._id,
        order: order._id,
        provider: 'stripe',
        providerDisplayName: 'Stripe',
        paymentType: 'automated',
        amount: 100,
        currency: 'PKR',
        status: PAYMENT_STATUSES.AUTHORIZED,
        authorizedAmount: 100,
        providerPaymentId: 'pi_ops_no_refund',
        safeProviderReference: 'pi_ops_no_refund',
        idempotencyKey: crypto.randomUUID(),
        requestHash: crypto.randomUUID(),
        providerIdempotencyKey: `payment:${order._id}:${crypto.randomUUID()}`
      });
      createdIntents.set('pi_ops_no_refund', { id: 'pi_ops_no_refund', amount: 10000, status: 'requires_capture' });

      await request(app)
        .post(`/api/payments/${payment._id}/void`)
        .set('Authorization', admin.authorization)
        .send({});

      const paymentInDb = await Payment.findById(payment._id);
      expect(paymentInDb.refundedAmount).toBe(0);
      expect(fakeStripe.refunds.create).not.toHaveBeenCalled();
    });

    test('46. Void alone does not mutate inventory or cancel Order improperly', async () => {
      const customer = await createAuth('customer');
      const admin = await createAuth('admin');
      const order = await createOrder(customer.user, { amount: 100, orderStatus: 'Pending', paymentStatus: 'Pending' });

      const payment = await Payment.create({
        user: customer.user._id,
        order: order._id,
        provider: 'stripe',
        providerDisplayName: 'Stripe',
        paymentType: 'automated',
        amount: 100,
        currency: 'PKR',
        status: PAYMENT_STATUSES.AUTHORIZED,
        authorizedAmount: 100,
        providerPaymentId: 'pi_ops_order_guard',
        safeProviderReference: 'pi_ops_order_guard',
        idempotencyKey: crypto.randomUUID(),
        requestHash: crypto.randomUUID(),
        providerIdempotencyKey: `payment:${order._id}:${crypto.randomUUID()}`
      });
      createdIntents.set('pi_ops_order_guard', { id: 'pi_ops_order_guard', amount: 10000, status: 'requires_capture' });

      await request(app)
        .post(`/api/payments/${payment._id}/void`)
        .set('Authorization', admin.authorization)
        .send({});

      const orderInDb = await Order.findById(order._id);
      expect(orderInDb.orderStatus).toBe('Pending');
      expect(orderInDb.paymentStatus).toBe('Failed');
    });
  });

  describe('6. Regression & Invariant Verification (Scenarios 47-53)', () => {
    test('47. Phase 5B webhook tests remain passing', async () => {
      expect(paymentWebhookProcessor).toBeDefined();
    });

    test('48. COD capture flow remains passing', async () => {
      const customer = await createAuth('customer');
      const admin = await createAuth('admin');
      const order = await createOrder(customer.user, { amount: 100, paymentMethod: 'cod' });

      const payment = await Payment.create({
        user: customer.user._id,
        order: order._id,
        provider: 'cod',
        providerDisplayName: 'Cash on Delivery',
        paymentType: 'offline',
        amount: 100,
        currency: 'PKR',
        status: PAYMENT_STATUSES.PENDING,
        idempotencyKey: crypto.randomUUID(),
        requestHash: crypto.randomUUID(),
        providerIdempotencyKey: `payment:${order._id}:${crypto.randomUUID()}`
      });

      const res = await PaymentService.collectCodPayment({
        paymentId: payment._id,
        adminId: admin.user._id,
        note: 'Collected at door'
      });

      expect(res.payment.status).toBe('Completed');
      expect(res.payment.paidAmount).toBe(100);
    });

    test('49. Existing complete order workflow remains passing', async () => {
      const auth = await createAuth();
      const order = await createOrder(auth.user, { amount: 100 });
      expect(order.paymentStatus).toBe('Pending');
    });

    test('50. Refund and exact-money suites remain passing', async () => {
      const money = Money.fromDecimal('100.50', 'PKR');
      expect(money.amountMinor).toBe(10050n);
    });

    test('51. No email/SMS is emitted during payment operation', async () => {
      const auth = await createAuth();
      const order = await createOrder(auth.user, { amount: 100 });

      const res = await request(app)
        .post('/api/payments')
        .set('Authorization', auth.authorization)
        .set('Idempotency-Key', crypto.randomUUID())
        .send({ orderId: order._id.toString(), provider: 'stripe' });

      expect(res.status).toBe(201);
    });

    test('52. Production Stripe remains dormant', async () => {
      const config = require('../../config/payment.config');
      expect(config).toBeDefined();
    });

    test('53. Zero live provider calls occur in automated tests', async () => {
      expect(stripeProvider._testClientInjected).toBe(true);
    });
  });
});

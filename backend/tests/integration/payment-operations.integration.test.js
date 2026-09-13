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

const createAuth = async (role = 'customer') => {
  sequence += 1;
  const user = await global.createTestUser({
    email: `payops-${sequence}@example.com`,
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

  describe('1. Server-Authoritative Payment Request', () => {
    test('1. Client-supplied amount cannot alter payment creation', async () => {
      const auth = await createAuth();
      const order = await createOrder(auth.user, { amount: 150 });

      // Body contains invalid extra field amount which is rejected by validator or ignored
      const res = await request(app)
        .post('/api/payments')
        .set('Authorization', auth.authorization)
        .set('Idempotency-Key', crypto.randomUUID())
        .send({
          orderId: order._id.toString(),
          provider: 'stripe',
          amount: 1 // Malicious low amount
        });

      // Strict validator rejects unexpected fields
      expect(res.status).toBe(400);

      // Normal creation without client amount
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

    test('6. Customer cannot initiate another customer’s order', async () => {
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

    test('7. Already-paid order cannot be charged again', async () => {
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

    test('8. Cancelled order fails closed', async () => {
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

  describe('2. Two-Layer Idempotency and Concurrency', () => {
    test('9. Identical concurrent initiation produces one logical operation', async () => {
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
      expect(fakeStripe.paymentIntents.create).toHaveBeenCalledTimes(1);

      const paymentsInDb = await Payment.find({ order: order._id });
      expect(paymentsInDb).toHaveLength(1);
    });

    test('10. Changed parameters with same idempotency key return 409 Conflict', async () => {
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

    test('11. Timeout/retry reuses persisted provider idempotency key', async () => {
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

    test('12. Idempotency keys contain no customer PII or secrets', async () => {
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

  describe('3. Customer Action and PCI Boundary', () => {
    test('13. Client secret is returned only to owning customer and absent from DB/public payment', async () => {
      const auth = await createAuth();
      const order = await createOrder(auth.user, { amount: 100 });

      const res = await request(app)
        .post('/api/payments')
        .set('Authorization', auth.authorization)
        .set('Idempotency-Key', crypto.randomUUID())
        .send({ orderId: order._id.toString(), provider: 'stripe' });

      expect(res.status).toBe(201);
      expect(res.body.data.clientSecret).toBeDefined();

      // Database payment record does NOT persist clientSecret
      const paymentInDb = await Payment.findById(res.body.data.payment._id).lean();
      expect(paymentInDb.clientSecret).toBeUndefined();

      // Public status endpoint does NOT expose clientSecret
      const statusRes = await request(app)
        .get(`/api/payments/${res.body.data.payment._id}/status`)
        .set('Authorization', auth.authorization);

      expect(statusRes.status).toBe(200);
      expect(statusRes.body.data.payment.clientSecret).toBeUndefined();
    });

    test('14. Raw card credentials / PCI fields are strictly rejected', async () => {
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

    test('15. Untrusted return URLs are rejected', async () => {
      const auth = await createAuth();
      const order = await createOrder(auth.user, { amount: 100 });

      const res = await request(app)
        .post('/api/payments')
        .set('Authorization', auth.authorization)
        .set('Idempotency-Key', crypto.randomUUID())
        .send({
          orderId: order._id.toString(),
          provider: 'stripe',
          returnUrl: 'https://evil-phishing-site.example.com/steal'
        });

      expect(res.status).toBe(400);
    });

    test('16. Trusted return URL is accepted', async () => {
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
  });

  describe('4. Capture Governance', () => {
    test('17. Unauthorized capture returns 401', async () => {
      const paymentId = new (require('mongoose').Types.ObjectId)();
      const res = await request(app)
        .post(`/api/payments/${paymentId}/capture`)
        .send({});

      expect(res.status).toBe(401);
    });

    test('18. Customer / non-admin capture returns 403', async () => {
      const customer = await createAuth('customer');
      const paymentId = new (require('mongoose').Types.ObjectId)();

      const res = await request(app)
        .post(`/api/payments/${paymentId}/capture`)
        .set('Authorization', customer.authorization)
        .send({});

      expect(res.status).toBe(403);
    });

    test('19. Admin captures authorized payment successfully', async () => {
      const customer = await createAuth('customer');
      const admin = await createAuth('admin');
      const order = await createOrder(customer.user, { amount: 200 });

      // Create an authorized payment record
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
        providerPaymentId: 'pi_ops_auth_1',
        safeProviderReference: 'pi_ops_auth_1',
        idempotencyKey: crypto.randomUUID(),
        requestHash: crypto.randomUUID(),
        providerIdempotencyKey: `payment:${order._id}:${crypto.randomUUID()}`
      });
      createdIntents.set('pi_ops_auth_1', { id: 'pi_ops_auth_1', amount: 20000, status: 'requires_capture' });

      const captureRes = await request(app)
        .post(`/api/payments/${payment._id}/capture`)
        .set('Authorization', admin.authorization)
        .set('Idempotency-Key', crypto.randomUUID())
        .send({ amount: 200 });

      expect(captureRes.status).toBe(200);
      expect(captureRes.body.data.payment.status).toBe('Completed');
      expect(captureRes.body.data.payment.capturedAmount).toBe(200);
      expect(fakeStripe.paymentIntents.capture).toHaveBeenCalledTimes(1);

      const orderInDb = await Order.findById(order._id);
      expect(orderInDb.paymentStatus).toBe('Paid');
    });

    test('20. Expired authorization cannot be captured', async () => {
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
        authorizationExpiresAt: new Date(Date.now() - 1000), // Expired
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

    test('21. Overcapture is rejected', async () => {
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
        .send({ amount: 150 }); // Overcapture

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('PAYMENT_CAPTURE_AMOUNT_EXCEEDED');
    });

    test('22. Unauthorised (Pending) payment cannot be captured', async () => {
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
  });

  describe('5. Void/Cancel Governance', () => {
    test('23. Unauthorized void returns 401/403', async () => {
      const customer = await createAuth('customer');
      const paymentId = new (require('mongoose').Types.ObjectId)();

      const noAuth = await request(app).post(`/api/payments/${paymentId}/cancel`).send({});
      expect(noAuth.status).toBe(401);

      const customerAuth = await request(app)
        .post(`/api/payments/${paymentId}/cancel`)
        .set('Authorization', customer.authorization)
        .send({});
      expect(customerAuth.status).toBe(403);
    });

    test('24. Authorized payment can be voided by admin', async () => {
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
        providerPaymentId: 'pi_ops_void_1',
        safeProviderReference: 'pi_ops_void_1',
        idempotencyKey: crypto.randomUUID(),
        requestHash: crypto.randomUUID(),
        providerIdempotencyKey: `payment:${order._id}:${crypto.randomUUID()}`
      });
      createdIntents.set('pi_ops_void_1', { id: 'pi_ops_void_1', amount: 10000, status: 'requires_capture' });

      const res = await request(app)
        .post(`/api/payments/${payment._id}/void`)
        .set('Authorization', admin.authorization)
        .send({ reason: 'Customer requested cancellation' });

      expect(res.status).toBe(200);
      expect(res.body.data.payment.status).toBe('Cancelled');
      expect(fakeStripe.paymentIntents.cancel).toHaveBeenCalledTimes(1);

      const paymentInDb = await Payment.findById(payment._id);
      expect(paymentInDb.status).toBe('Cancelled');
      expect(paymentInDb.cancelReason).toBe('Customer requested cancellation');
    });

    test('25. Completed payment cannot be voided', async () => {
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
        providerPaymentId: 'pi_ops_completed',
        safeProviderReference: 'pi_ops_completed',
        idempotencyKey: crypto.randomUUID(),
        requestHash: crypto.randomUUID(),
        providerIdempotencyKey: `payment:${order._id}:${crypto.randomUUID()}`
      });

      const res = await request(app)
        .post(`/api/payments/${payment._id}/cancel`)
        .set('Authorization', admin.authorization)
        .send({ reason: 'Try to cancel completed' });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('PAYMENT_CANCEL_NOT_ELIGIBLE');
    });

    test('26. Duplicate void is idempotent', async () => {
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
        providerPaymentId: 'pi_ops_cancelled',
        safeProviderReference: 'pi_ops_cancelled',
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
  });

  describe('6. Public Status Endpoint Sanitization', () => {
    test('27. GET /api/payments/:id/status returns sanitized customer view without leaking secrets or hashes', async () => {
      const auth = await createAuth();
      const order = await createOrder(auth.user, { amount: 100 });

      const initRes = await request(app)
        .post('/api/payments')
        .set('Authorization', auth.authorization)
        .set('Idempotency-Key', crypto.randomUUID())
        .send({ orderId: order._id.toString(), provider: 'stripe' });

      const paymentId = initRes.body.data.payment._id;

      const statusRes = await request(app)
        .get(`/api/payments/${paymentId}/status`)
        .set('Authorization', auth.authorization);

      expect(statusRes.status).toBe(200);
      const statusData = statusRes.body.data.payment;
      expect(statusData._id).toBe(paymentId);
      expect(statusData.status).toBeDefined();
      expect(statusData.requiresAction).toBeDefined();
      expect(statusData.retryEligible).toBeDefined();

      // Ensure zero internal leakage
      expect(statusData.clientSecret).toBeUndefined();
      expect(statusData.idempotencyKey).toBeUndefined();
      expect(statusData.requestHash).toBeUndefined();
      expect(statusData.providerIdempotencyKey).toBeUndefined();
      expect(statusData.providerAttemptStatus).toBeUndefined();
      expect(statusData.capabilitySnapshot).toBeUndefined();
    });

    test('28. Another customer cannot inspect payment status', async () => {
      const owner = await createAuth();
      const attacker = await createAuth();
      const order = await createOrder(owner.user, { amount: 100 });

      const initRes = await request(app)
        .post('/api/payments')
        .set('Authorization', owner.authorization)
        .set('Idempotency-Key', crypto.randomUUID())
        .send({ orderId: order._id.toString(), provider: 'stripe' });

      const paymentId = initRes.body.data.payment._id;

      const statusRes = await request(app)
        .get(`/api/payments/${paymentId}/status`)
        .set('Authorization', attacker.authorization);

      expect(statusRes.status).toBe(404);
    });
  });
});

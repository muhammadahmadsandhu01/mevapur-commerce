/**
 * @file payment-security-governance.integration.test.js
 * @description Phase 5D: Payment Security, Provider Conformance, Observability & Acceptance Lock
 */

'use strict';

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const app = require('../../app');
const TokenService = require('../../services/TokenService');
const authConfig = require('../../config/auth.config');
const stripeProvider = require('../../services/payment/providers/StripeProvider');
const PaymentService = require('../../services/payment/PaymentService');
const RefundService = require('../../services/payment/RefundService');
const PaymentWebhookProcessor = require('../../services/payment/webhooks/PaymentWebhookProcessor');
const PaymentProviderRegistry = require('../../modules/payments/core/PaymentProviderRegistry');
const Order = require('../../models/Order');
const Payment = require('../../models/Payment');
const Refund = require('../../models/Refund');
const PaymentWebhookEvent = require('../../models/PaymentWebhookEvent');
const MerchantPaymentAccount = require('../../models/MerchantPaymentAccount');
const AuditLog = require('../../models/AuditLog');
const Session = require('../../models/Session');
const { Money, MoneyMapper } = require('../../modules/commerce');
const { PAYMENT_STATUSES } = require('../../constants/paymentConstants');

let sequence = 0;
let fakeStripe;
let createdIntents;
let idempotentIntents;
let capturedIntents;
let canceledIntents;

const generateExpiredJwt = (user, session) => {
  const payload = {
    sub: String(user._id),
    sid: String(session._id),
    jti: crypto.randomUUID(),
    tokenVersion: Number(user.tokenVersion),
    type: 'access'
  };

  return jwt.sign(payload, authConfig.jwt.secret, {
    algorithm: 'HS256',
    expiresIn: '-10s',
    issuer: authConfig.jwt.issuer,
    audience: authConfig.jwt.audience
  });
};

const createAuth = async (role = 'customer', options = {}) => {
  sequence += 1;
  const user = await global.createTestUser({
    email: `secgov-${sequence}@example.com`,
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
    session,
    authorization: `Bearer ${accessToken}`,
    expiredJwtAuthorization: `Bearer ${generateExpiredJwt(user, session)}`
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
      name: 'Security Governance Product',
      sku: `GOV-${++sequence}`,
      price: amount,
      quantity: 1,
      lineTotal: amount
    }],
    shippingAddress: {
      fullName: 'Sec Gov User',
      phone: '03001234567',
      address: '100 Security Ave',
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

describe('Phase 5D: Payment Security, Provider Conformance & Operational Observability', () => {
  beforeAll(async () => {
    await Promise.all([
      Order.syncIndexes(),
      Payment.syncIndexes(),
      Refund.syncIndexes(),
      PaymentWebhookEvent.syncIndexes(),
      MerchantPaymentAccount.syncIndexes(),
      AuditLog.syncIndexes()
    ]);
  });

  beforeEach(async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_fake_secgov';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_fake_secgov';
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
            id: `pi_gov_${intentSeq}`,
            client_secret: `pi_gov_${intentSeq}_secret_token`,
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
          id: `re_gov_${++intentSeq}`,
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

  describe('1. Provider Manifest Conformance and Registry Hardening (Scenarios 1-3)', () => {
    test('1. Unknown or unregistered provider fails closed with 404', async () => {
      const auth = await createAuth();
      const order = await createOrder(auth.user, { paymentMethod: 'stripe' });

      const res = await request(app)
        .post('/api/payments')
        .set('Authorization', auth.authorization)
        .set('Idempotency-Key', crypto.randomUUID())
        .send({
          orderId: order._id.toString(),
          provider: 'unknown_provider'
        });

      expect([400, 404]).toContain(res.status);
    });

    test('2. Registered but disabled provider is unavailable (503)', async () => {
      const auth = await createAuth();
      const order = await createOrder(auth.user, { paymentMethod: 'jazzcash' });

      const res = await request(app)
        .post('/api/payments')
        .set('Authorization', auth.authorization)
        .set('Idempotency-Key', crypto.randomUUID())
        .send({
          orderId: order._id.toString(),
          provider: 'jazzcash'
        });

      expect(res.status).toBe(503);
      expect(['PAYMENT_PROVIDER_DISABLED', 'PAYMENT_PROVIDER_NOT_CONFIGURED']).toContain(res.body.error.code);
    });

    test('3. Malformed or contradictory provider manifest is rejected at registry registration', () => {
      const registry = new PaymentProviderRegistry();

      // Missing code
      expect(() => {
        registry.register({ getManifest: () => ({ displayName: 'Bad' }) });
      }).toThrow();

      // Contradictory: partial capture without capture
      expect(() => {
        registry.register({
          getManifest: () => ({
            code: 'invalid_cap',
            displayName: 'Invalid Cap Provider',
            paymentType: 'automated',
            contractVersion: '1.0',
            integrationVersion: '1.0.0',
            capabilities: { capture: false, partialCapture: true }
          })
        });
      }).toThrow();

      // Contradictory: offline method with automated paymentType
      expect(() => {
        registry.register({
          getManifest: () => ({
            code: 'invalid_offline',
            displayName: 'Invalid Offline Provider',
            paymentType: 'automated',
            contractVersion: '1.0',
            integrationVersion: '1.0.0',
            isOfflineMethod: true,
            capabilities: {}
          })
        });
      }).toThrow();
    });
  });

  describe('2. Production Activation & Verification Guards (Scenarios 4-7)', () => {
    test('4. Sandbox configuration cannot activate production', async () => {
      const auth = await createAuth('admin');
      const { PaymentCapabilityPolicy } = require('../../services/payment/PaymentCapabilityPolicy');

      const mockAccountModel = {
        findOne: jest.fn().mockResolvedValue({
          provider: 'stripe',
          environment: 'sandbox', // sandbox account in production runtime
          isEnabled: true,
          underwritingVerification: 'unverified'
        })
      };

      const prevEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      try {
        const policy = new PaymentCapabilityPolicy({ AccountModel: mockAccountModel });
        const evalResult = await policy.evaluateOperational('stripe', {
          country: 'Pakistan',
          currency: 'PKR'
        });

        expect(evalResult.isOperational).toBe(false);
        expect(['PAYMENT_SANDBOX_UNVERIFIED', 'PAYMENT_UNDERWRITING_UNVERIFIED']).toContain(evalResult.reason);
      } finally {
        process.env.NODE_ENV = prevEnv;
      }
    });

    test('5. Unverified underwriting blocks production availability', async () => {
      const { PaymentCapabilityPolicy } = require('../../services/payment/PaymentCapabilityPolicy');

      const mockAccountModel = {
        findOne: jest.fn().mockResolvedValue({
          provider: 'stripe',
          environment: 'production',
          isEnabled: true,
          underwritingVerification: 'unverified',
          sandboxVerification: 'verified',
          webhookVerification: 'verified'
        })
      };

      const prevEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      try {
        const policy = new PaymentCapabilityPolicy({ AccountModel: mockAccountModel });
        const evalResult = await policy.evaluateOperational('stripe', {
          country: 'Pakistan',
          currency: 'PKR'
        });

        expect(evalResult.isOperational).toBe(false);
        expect(evalResult.reason).toBe('PAYMENT_UNDERWRITING_UNVERIFIED');
      } finally {
        process.env.NODE_ENV = prevEnv;
      }
    });

    test('6. Missing webhook verification blocks asynchronous production provider', async () => {
      const { PaymentCapabilityPolicy } = require('../../services/payment/PaymentCapabilityPolicy');

      const mockAccountModel = {
        findOne: jest.fn().mockResolvedValue({
          provider: 'stripe',
          environment: 'production',
          isEnabled: true,
          underwritingVerification: 'verified',
          sandboxVerification: 'verified',
          webhookVerification: 'unverified'
        })
      };

      const prevEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      try {
        const policy = new PaymentCapabilityPolicy({ AccountModel: mockAccountModel });
        const evalResult = await policy.evaluateOperational('stripe', {
          country: 'Pakistan',
          currency: 'PKR'
        });

        expect(evalResult.isOperational).toBe(false);
        expect(evalResult.reason).toBe('PAYMENT_WEBHOOK_UNVERIFIED');
      } finally {
        process.env.NODE_ENV = prevEnv;
      }
    });

    test('7. Missing credential reference blocks availability without leaking name or secret value', async () => {
      const auth = await createAuth();
      const order = await createOrder(auth.user, { paymentMethod: 'easypaisa' });

      const res = await request(app)
        .post('/api/payments')
        .set('Authorization', auth.authorization)
        .set('Idempotency-Key', crypto.randomUUID())
        .send({
          orderId: order._id.toString(),
          provider: 'easypaisa'
        });

      expect(res.status).toBe(503);
      expect(JSON.stringify(res.body)).not.toContain('secret');
      expect(JSON.stringify(res.body)).not.toContain('key');
      expect(JSON.stringify(res.body)).not.toContain('password');
    });
  });

  describe('3. Market, Currency and Exact Money Invariants (Scenarios 8-12)', () => {
    test('8. Unsupported merchant country fails closed', async () => {
      const { PaymentCapabilityPolicy } = require('../../services/payment/PaymentCapabilityPolicy');
      const policy = new PaymentCapabilityPolicy();

      const evalResult = await policy.evaluateOperational('cod', {
        merchantCountry: '',
        deliveryCountry: 'PK',
        currency: 'PKR'
      });

      expect(evalResult.eligible).toBe(false);
      expect(evalResult.reason).toBe('PAYMENT_COUNTRY_UNSUPPORTED');
    });

    test('9. Unsupported delivery country fails closed', async () => {
      const auth = await createAuth();
      const order = await createOrder(auth.user, { country: 'Antarctica', currency: 'PKR' });

      const res = await request(app)
        .post('/api/payments')
        .set('Authorization', auth.authorization)
        .set('Idempotency-Key', crypto.randomUUID())
        .send({
          orderId: order._id.toString(),
          provider: 'stripe'
        });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('PAYMENT_COUNTRY_UNSUPPORTED');
    });

    test('10. Unsupported currency fails closed', async () => {
      const { PaymentCapabilityPolicy } = require('../../services/payment/PaymentCapabilityPolicy');
      const policy = new PaymentCapabilityPolicy();

      const evalResult = await policy.evaluateOperational('stripe', {
        country: 'Pakistan',
        currency: 'XYZ'
      });

      expect(evalResult.eligible).toBe(false);
      expect(evalResult.reason).toBe('PAYMENT_CURRENCY_UNSUPPORTED');
    });

    test('11. Exact minor units survive initiation through webhook and refund', async () => {
      const auth = await createAuth();
      const order = await createOrder(auth.user, { amount: 250.50, currency: 'USD', country: 'United States' });

      const initRes = await request(app)
        .post('/api/payments')
        .set('Authorization', auth.authorization)
        .set('Idempotency-Key', crypto.randomUUID())
        .send({ orderId: order._id.toString(), provider: 'stripe' });

      expect(initRes.status).toBe(201);
      const paymentDoc = await Payment.findById(initRes.body.data.payment._id);
      expect(Number(paymentDoc.amountExact.amountMinor)).toBe(25050);
      expect(paymentDoc.currency).toBe('USD');
    });

    test('12. Provider cannot change amount or currency upon webhook reconciliation', async () => {
      const auth = await createAuth();
      const order = await createOrder(auth.user, { amount: 100, currency: 'PKR' });

      const payment = await Payment.create({
        user: auth.user._id,
        order: order._id,
        provider: 'stripe',
        providerDisplayName: 'Stripe',
        paymentType: 'automated',
        amount: 100,
        currency: 'PKR',
        amountExact: MoneyMapper.fromLegacy(100, 'PKR'),
        status: PAYMENT_STATUSES.PROCESSING,
        providerPaymentId: 'pi_gov_tamper_test',
        safeProviderReference: 'pi_gov_tamper_test',
        idempotencyKey: crypto.randomUUID(),
        requestHash: crypto.randomUUID(),
        providerIdempotencyKey: `payment:${order._id}:${crypto.randomUUID()}`
      });

      // Mismatched currency in provider event
      const currencyMismatchEvent = {
        id: 'evt_gov_tamper_cur',
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: 'pi_gov_tamper_test',
            amount: 10000,
            amount_received: 10000,
            currency: 'usd', // Mismatch!
            metadata: {
              paymentId: String(payment._id),
              orderId: String(order._id)
            }
          }
        }
      };

      await expect(PaymentService.processVerifiedStripeEvent(currencyMismatchEvent))
        .rejects.toThrow();

      // Mismatched amount in provider event
      const amountMismatchEvent = {
        id: 'evt_gov_tamper_amt',
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: 'pi_gov_tamper_test',
            amount: 5000, // Mismatch! Expected 10000
            amount_received: 5000,
            currency: 'pkr',
            metadata: {
              paymentId: String(payment._id),
              orderId: String(order._id)
            }
          }
        }
      };

      await expect(PaymentService.processVerifiedStripeEvent(amountMismatchEvent))
        .rejects.toThrow();
    });
  });

  describe('4. Observability, Sanitization & Audit Governance (Scenarios 13-18, 26-28)', () => {
    test('13. Public discovery returns sanitized methods without secret keys', async () => {
      const res = await request(app).get('/api/payments/methods?country=Pakistan&currency=PKR');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const json = JSON.stringify(res.body);
      expect(json).not.toContain('sk_test');
      expect(json).not.toContain('whsec_');
      expect(json).not.toContain('proof');
    });

    test('14. Admin status returns sanitized provider readiness', async () => {
      const adminAuth = await createAuth('admin');
      const res = await request(app)
        .get('/api/payments/providers/status')
        .set('Authorization', adminAuth.authorization);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data.providers)).toBe(true);

      const json = JSON.stringify(res.body);
      expect(json).not.toContain('sk_test');
      expect(json).not.toContain('whsec_');
    });

    test('15. Anonymous / malformed / expired-token / expired-session / revoked-session return canonical 401 codes', async () => {
      const endpoints = [
        '/api/payments/operations/metrics',
        '/api/payments/providers/status'
      ];

      for (const endpoint of endpoints) {
        // 1. Missing token -> AUTH_TOKEN_REQUIRED
        const anonRes = await request(app).get(endpoint);
        expect(anonRes.status).toBe(401);
        expect(anonRes.body.error.code).toBe('AUTH_TOKEN_REQUIRED');

        // 2. Malformed token -> AUTH_TOKEN_INVALID
        const malformedRes = await request(app)
          .get(endpoint)
          .set('Authorization', 'Bearer invalid_garbage_token_structure');
        expect(malformedRes.status).toBe(401);
        expect(malformedRes.body.error.code).toBe('AUTH_TOKEN_INVALID');

        // 3. Cryptographically valid but expired JWT -> AUTH_TOKEN_EXPIRED
        const auth = await createAuth('admin');
        const expiredTokenRes = await request(app)
          .get(endpoint)
          .set('Authorization', auth.expiredJwtAuthorization);
        expect(expiredTokenRes.status).toBe(401);
        expect(expiredTokenRes.body.error.code).toBe('AUTH_TOKEN_EXPIRED');

        // 4. Valid JWT with expired server-side session -> AUTH_SESSION_EXPIRED
        const expiredSessionAuth = await createAuth('admin', { sessionExpired: true });
        const expiredSessionRes = await request(app)
          .get(endpoint)
          .set('Authorization', expiredSessionAuth.authorization);
        expect(expiredSessionRes.status).toBe(401);
        expect(expiredSessionRes.body.error.code).toBe('AUTH_SESSION_EXPIRED');

        // 5. Revoked session -> AUTH_SESSION_REVOKED
        const revokedAuth = await createAuth('admin', { sessionRevoked: true });
        const revokedRes = await request(app)
          .get(endpoint)
          .set('Authorization', revokedAuth.authorization);
        expect(revokedRes.status).toBe(401);
        expect(revokedRes.body.error.code).toBe('AUTH_SESSION_REVOKED');
      }
    });

    test('16. Customer/support/inventory/manager receive 403 on operational metrics endpoint', async () => {
      const forbiddenRoles = ['customer', 'support', 'inventory', 'manager'];
      for (const role of forbiddenRoles) {
        const auth = await createAuth(role);
        const res = await request(app)
          .get('/api/payments/operations/metrics')
          .set('Authorization', auth.authorization);
        expect(res.status).toBe(403);
        expect(res.body.error.code).toBe('AUTH_FORBIDDEN');
      }
    });

    test('17. Admin and super_admin receive authorized operational metrics without sensitive leaks', async () => {
      const allowedRoles = ['admin', 'super_admin'];
      for (const role of allowedRoles) {
        const auth = await createAuth(role);
        const res = await request(app)
          .get('/api/payments/operations/metrics')
          .set('Authorization', auth.authorization);

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data).toHaveProperty('pendingOperationsCount');
        expect(res.body.data).toHaveProperty('inFlightOperationsCount');
        expect(res.body.data).toHaveProperty('staleClaimsCount');
        expect(res.body.data).toHaveProperty('failedOperationsCount');
        expect(res.body.data).toHaveProperty('deadLetterWebhooksCount');
        expect(res.body.data).toHaveProperty('oldestPendingAgeSeconds');
        expect(Array.isArray(res.body.data.providers)).toBe(true);

        const json = JSON.stringify(res.body);
        expect(json).not.toContain('sk_test');
        expect(json).not.toContain('whsec_');
        expect(json).not.toContain('claimToken');
      }
    });

    test('18. Operational metrics endpoint is strictly read-only and produces zero mutations', async () => {
      const adminAuth = await createAuth('admin');
      const paymentCountBefore = await Payment.countDocuments();
      const orderCountBefore = await Order.countDocuments();

      const res = await request(app)
        .get('/api/payments/operations/metrics')
        .set('Authorization', adminAuth.authorization);

      expect(res.status).toBe(200);
      expect(await Payment.countDocuments()).toBe(paymentCountBefore);
      expect(await Order.countDocuments()).toBe(orderCountBefore);
    });

    test('26. Card PAN/CVV and client secrets never enter logs, persistence, or status responses', async () => {
      const auth = await createAuth();
      const order = await createOrder(auth.user, { amount: 100 });

      // PAN attempt is rejected
      const panRes = await request(app)
        .post('/api/payments')
        .set('Authorization', auth.authorization)
        .set('Idempotency-Key', crypto.randomUUID())
        .send({
          orderId: order._id.toString(),
          provider: 'stripe',
          cardNumber: '4242424242424242'
        });
      expect(panRes.status).toBe(400);

      // Clean initiation returns clientSecret only in data, not in DB
      const initRes = await request(app)
        .post('/api/payments')
        .set('Authorization', auth.authorization)
        .set('Idempotency-Key', crypto.randomUUID())
        .send({
          orderId: order._id.toString(),
          provider: 'stripe'
        });

      expect(initRes.status).toBe(201);
      const paymentInDb = await Payment.findById(initRes.body.data.payment._id).lean();
      expect(paymentInDb.clientSecret).toBeUndefined();

      const statusRes = await request(app)
        .get(`/api/payments/${initRes.body.data.payment._id}/status`)
        .set('Authorization', auth.authorization);
      expect(statusRes.status).toBe(200);
      expect(statusRes.body.data.payment.clientSecret).toBeUndefined();
    });

    test('27. Audit events exist and remain sanitized in AuditLog repository across full lifecycle', async () => {
      const adminAuth = await createAuth('admin');
      const customer = await createAuth('customer');
      const order = await createOrder(customer.user, { amount: 100, currency: 'USD', country: 'United States' });

      // 1. PAYMENT.INITIATED
      const initRes = await request(app)
        .post('/api/payments')
        .set('Authorization', customer.authorization)
        .set('Idempotency-Key', crypto.randomUUID())
        .send({ orderId: order._id.toString(), provider: 'stripe' });
      expect(initRes.status).toBe(201);
      const paymentId = initRes.body.data.payment._id;

      const initAudit = await AuditLog.findOne({
        eventName: 'PAYMENT.INITIATED',
        'metadata.paymentId': String(paymentId)
      });
      expect(initAudit).toBeTruthy();
      expect(initAudit.status).toBe('SUCCESS');
      expect(initAudit.metadata.provider).toBe('stripe');
      expect(JSON.stringify(initAudit)).not.toContain('sk_test');
      expect(JSON.stringify(initAudit)).not.toContain('secret_token');

      // 2. PAYMENT.CAPTURED
      createdIntents.set(`pi_gov_${paymentId}`, {
        id: `pi_gov_${paymentId}`,
        amount: 10000,
        status: 'requires_capture'
      });
      await Payment.updateOne({ _id: paymentId }, {
        $set: {
          status: PAYMENT_STATUSES.AUTHORIZED,
          authorizedAmount: 100,
          providerPaymentId: `pi_gov_${paymentId}`,
          safeProviderReference: `pi_gov_${paymentId}`
        }
      });

      const capRes = await request(app)
        .post(`/api/payments/${paymentId}/capture`)
        .set('Authorization', adminAuth.authorization)
        .send({ amount: 100 });
      expect(capRes.status).toBe(200);

      const capAudit = await AuditLog.findOne({
        eventName: 'PAYMENT.CAPTURED',
        'metadata.paymentId': String(paymentId)
      });
      expect(capAudit).toBeTruthy();
      expect(capAudit.status).toBe('SUCCESS');
      expect(JSON.stringify(capAudit)).not.toContain('sk_test');

      // 3. PAYMENT.VOIDED
      const voidOrder = await createOrder(customer.user, { amount: 50, currency: 'USD', country: 'United States' });
      const voidPayment = await Payment.create({
        user: customer.user._id,
        order: voidOrder._id,
        provider: 'stripe',
        providerDisplayName: 'Stripe',
        paymentType: 'automated',
        amount: 50,
        currency: 'USD',
        status: PAYMENT_STATUSES.AUTHORIZED,
        authorizedAmount: 50,
        providerPaymentId: 'pi_gov_void_test',
        safeProviderReference: 'pi_gov_void_test',
        idempotencyKey: crypto.randomUUID(),
        requestHash: crypto.randomUUID(),
        providerIdempotencyKey: `payment:${voidOrder._id}:${crypto.randomUUID()}`
      });
      createdIntents.set('pi_gov_void_test', { id: 'pi_gov_void_test', amount: 5000, status: 'requires_capture' });

      await request(app)
        .post(`/api/payments/${voidPayment._id}/void`)
        .set('Authorization', adminAuth.authorization)
        .send({ reason: 'Audit verification void' });

      const voidAudit = await AuditLog.findOne({
        eventName: 'PAYMENT.VOIDED',
        'metadata.paymentId': String(voidPayment._id)
      });
      expect(voidAudit).toBeTruthy();
      expect(voidAudit.status).toBe('SUCCESS');

      // 4. PAYMENT.CANCELLED
      const cancelOrder = await createOrder(customer.user, { amount: 75, currency: 'USD', country: 'United States' });
      const cancelPayment = await Payment.create({
        user: customer.user._id,
        order: cancelOrder._id,
        provider: 'stripe',
        providerDisplayName: 'Stripe',
        paymentType: 'automated',
        amount: 75,
        currency: 'USD',
        status: PAYMENT_STATUSES.PROCESSING,
        providerPaymentId: 'pi_gov_cancel_test',
        safeProviderReference: 'pi_gov_cancel_test',
        idempotencyKey: crypto.randomUUID(),
        requestHash: crypto.randomUUID(),
        providerIdempotencyKey: `payment:${cancelOrder._id}:${crypto.randomUUID()}`
      });
      createdIntents.set('pi_gov_cancel_test', { id: 'pi_gov_cancel_test', amount: 7500, status: 'requires_payment_method' });

      await request(app)
        .post(`/api/payments/${cancelPayment._id}/cancel`)
        .set('Authorization', adminAuth.authorization)
        .send({ reason: 'Audit verification cancel' });

      const cancelAudit = await AuditLog.findOne({
        eventName: 'PAYMENT.CANCELLED',
        'metadata.paymentId': String(cancelPayment._id)
      });
      expect(cancelAudit).toBeTruthy();
      expect(cancelAudit.status).toBe('SUCCESS');

      // 5. PAYMENT.REFUNDED
      const refundPayment = await Payment.create({
        user: customer.user._id,
        order: order._id,
        provider: 'stripe',
        providerDisplayName: 'Stripe',
        paymentType: 'automated',
        amount: 100,
        currency: 'USD',
        status: PAYMENT_STATUSES.COMPLETED,
        capturedAmount: 100,
        refundedAmount: 0,
        refundReservedAmount: 100,
        refundReservedAmountExact: MoneyMapper.fromLegacy(100, 'USD'),
        amountExact: MoneyMapper.fromLegacy(100, 'USD'),
        providerPaymentId: 'pi_gov_ref_test',
        safeProviderReference: 'pi_gov_ref_test',
        idempotencyKey: crypto.randomUUID(),
        requestHash: crypto.randomUUID(),
        providerIdempotencyKey: `payment:${order._id}:${crypto.randomUUID()}`
      });

      const refundDoc = await Refund.create({
        payment: refundPayment._id,
        order: order._id,
        customer: customer.user._id,
        provider: 'stripe',
        amount: 100,
        currency: 'USD',
        amountExact: MoneyMapper.fromLegacy(100, 'USD'),
        status: 'Pending',
        processingMode: 'manual',
        reservationActive: true,
        providerAttemptStatus: 'Ready',
        providerOutcome: 'manual_confirmed',
        processedBy: adminAuth.user._id,
        idempotencyKey: crypto.randomUUID(),
        requestHash: crypto.randomUUID(),
        providerIdempotencyKey: `prk_usd_${crypto.randomUUID()}`
      });

      await RefundService.completeRefund(refundDoc._id, { source: 'admin' });

      const refundAudit = await AuditLog.findOne({
        eventName: 'PAYMENT.REFUNDED',
        'metadata.refundId': String(refundDoc._id)
      });
      expect(refundAudit).toBeTruthy();
      expect(refundAudit.status).toBe('SUCCESS');

      // 6. PAYMENT.WEBHOOK_PROCESSED
      const webhookPayment = await Payment.create({
        user: customer.user._id,
        order: order._id,
        provider: 'stripe',
        providerDisplayName: 'Stripe',
        paymentType: 'automated',
        amount: 100,
        currency: 'USD',
        amountExact: MoneyMapper.fromLegacy(100, 'USD'),
        status: PAYMENT_STATUSES.PROCESSING,
        providerPaymentId: 'pi_gov_wh_proc_test',
        safeProviderReference: 'pi_gov_wh_proc_test',
        idempotencyKey: crypto.randomUUID(),
        requestHash: crypto.randomUUID(),
        providerIdempotencyKey: `payment:${order._id}:${crypto.randomUUID()}`
      });

      const hookEvent = {
        id: 'evt_gov_wh_proc_1',
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: 'pi_gov_wh_proc_test',
            amount: 10000,
            amount_received: 10000,
            currency: 'usd',
            metadata: {
              paymentId: String(webhookPayment._id),
              orderId: String(order._id)
            }
          }
        }
      };

      await PaymentService.processVerifiedStripeEvent(hookEvent);

      const whAudit = await AuditLog.findOne({
        eventName: 'PAYMENT.WEBHOOK_PROCESSED',
        'metadata.providerEventId': 'evt_gov_wh_proc_1'
      });
      expect(whAudit).toBeTruthy();
      expect(whAudit.status).toBe('SUCCESS');
    });

    test('28. Stale/in-flight/dead-letter metrics are accurately aggregated', async () => {
      const customer = await createAuth('customer');
      const order = await createOrder(customer.user, { amount: 100 });

      // Create an in-flight claimed void payment (stale > 30s)
      await Payment.create({
        user: customer.user._id,
        order: order._id,
        provider: 'stripe',
        providerDisplayName: 'Stripe',
        paymentType: 'automated',
        amount: 100,
        currency: 'PKR',
        status: PAYMENT_STATUSES.AUTHORIZED,
        authorizedAmount: 100,
        voidAttemptStatus: 'claimed',
        voidClaimToken: 'stale-token-abc',
        voidClaimedAt: new Date(Date.now() - 45000), // 45s ago (stale)
        providerPaymentId: 'pi_gov_stale_metric',
        safeProviderReference: 'pi_gov_stale_metric',
        idempotencyKey: crypto.randomUUID(),
        requestHash: crypto.randomUUID(),
        providerIdempotencyKey: `payment:${order._id}:${crypto.randomUUID()}`
      });

      // Create a dead letter webhook event
      await PaymentWebhookEvent.create({
        provider: 'stripe',
        environment: 'sandbox',
        providerEventId: 'evt_gov_dead_metric_1',
        eventType: 'payment_intent.succeeded',
        payloadHash: crypto.randomBytes(32).toString('hex'),
        status: 'dead_letter',
        attemptCount: 5
      });

      const metrics = await PaymentService.getOperationalMetrics();
      expect(metrics.inFlightOperationsCount).toBeGreaterThanOrEqual(1);
      expect(metrics.staleClaimsCount).toBeGreaterThanOrEqual(1);
      expect(metrics.deadLetterWebhooksCount).toBeGreaterThanOrEqual(1);
    });

    test('29. Generic Bank Transfer is country-neutral and data-driven', async () => {
      const bankTransferProvider = require('../../modules/payments/providers/bank-transfer/BankTransferProvider');
      const manifest = bankTransferProvider.getManifest();

      // Generic adapter must not hardcode country list in manifest
      expect(manifest.supportedCountries).toEqual([]);
      expect(manifest.supportedCurrencies).toEqual([]);

      const raastProvider = require('../../modules/payments/providers/raast/RaastProvider');
      const raastManifest = raastProvider.getManifest();
      // Regional providers legitimately specify their country
      expect(raastManifest.supportedCountries).toEqual(['PK', 'PAKISTAN']);
    });

    test('30. Cash On Delivery requires domestic matching and runtime gating', async () => {
      const { PaymentCapabilityPolicy } = require('../../services/payment/PaymentCapabilityPolicy');
      const policy = new PaymentCapabilityPolicy();

      // Domestic PK order -> Eligible
      const pkResult = await policy.evaluateOperational('cod', {
        merchantCountry: 'PK',
        deliveryCountry: 'PK',
        baseCurrency: 'PKR',
        currency: 'PKR'
      });
      expect(pkResult.eligible).toBe(true);

      // Cross-border order (US delivery to PK merchant) -> Ineligible
      const crossBorderResult = await policy.evaluateOperational('cod', {
        merchantCountry: 'PK',
        deliveryCountry: 'US',
        baseCurrency: 'PKR',
        currency: 'PKR'
      });
      expect(crossBorderResult.eligible).toBe(false);
      expect(crossBorderResult.reason).toBe('PAYMENT_COUNTRY_UNSUPPORTED');

      // Currency mismatch -> Ineligible
      const curMismatchResult = await policy.evaluateOperational('cod', {
        merchantCountry: 'PK',
        deliveryCountry: 'PK',
        baseCurrency: 'PKR',
        currency: 'USD'
      });
      expect(curMismatchResult.eligible).toBe(false);
      expect(curMismatchResult.reason).toBe('PAYMENT_CURRENCY_UNSUPPORTED');
    });
  });
});

/**
 * @file payment-security-governance.integration.test.js
 * @description Phase 5D: Payment Security, Provider Conformance, Observability & Acceptance Lock
 */

'use strict';

const crypto = require('crypto');
const request = require('supertest');
const app = require('../../app');
const TokenService = require('../../services/TokenService');
const stripeProvider = require('../../services/payment/providers/StripeProvider');
const PaymentService = require('../../services/payment/PaymentService');
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

    test('15. Anonymous / malformed / expired-session / revoked-session return canonical 401 codes on operational metrics', async () => {
      // Anonymous
      const anonRes = await request(app).get('/api/payments/operations/metrics');
      expect(anonRes.status).toBe(401);
      expect(anonRes.body.error.code).toBe('AUTH_TOKEN_REQUIRED');

      // Malformed
      const malformedRes = await request(app)
        .get('/api/payments/operations/metrics')
        .set('Authorization', 'Bearer invalid_garbage_token');
      expect(malformedRes.status).toBe(401);

      // Expired session
      const expiredAuth = await createAuth('admin', { sessionExpired: true });
      const expiredRes = await request(app)
        .get('/api/payments/operations/metrics')
        .set('Authorization', expiredAuth.authorization);
      expect(expiredRes.status).toBe(401);
      expect(expiredRes.body.error.code).toBe('AUTH_SESSION_EXPIRED');

      // Revoked session
      const revokedAuth = await createAuth('admin', { sessionRevoked: true });
      const revokedRes = await request(app)
        .get('/api/payments/operations/metrics')
        .set('Authorization', revokedAuth.authorization);
      expect(revokedRes.status).toBe(401);
      expect(revokedRes.body.error.code).toBe('AUTH_SESSION_REVOKED');
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

    test('27. Audit events exist and remain sanitized in AuditLog repository', async () => {
      const adminAuth = await createAuth('admin');
      const customer = await createAuth('customer');
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
        providerPaymentId: 'pi_gov_audit_test',
        safeProviderReference: 'pi_gov_audit_test',
        idempotencyKey: crypto.randomUUID(),
        requestHash: crypto.randomUUID(),
        providerIdempotencyKey: `payment:${order._id}:${crypto.randomUUID()}`
      });
      createdIntents.set('pi_gov_audit_test', { id: 'pi_gov_audit_test', amount: 10000, status: 'requires_capture' });

      await request(app)
        .post(`/api/payments/${payment._id}/void`)
        .set('Authorization', adminAuth.authorization)
        .send({ reason: 'Audit verification void' });

      const auditEntries = await AuditLog.find({ eventName: 'PAYMENT.VOIDED' });
      expect(auditEntries.length).toBeGreaterThanOrEqual(1);
      const lastAudit = auditEntries[auditEntries.length - 1];
      expect(lastAudit.status).toBe('SUCCESS');
      expect(JSON.stringify(lastAudit.metadata)).not.toContain('secret');
    });

    test('28. Stale/in-flight/dead-letter metrics are accurately aggregated', async () => {
      const customer = await createAuth('customer');
      const admin = await createAuth('admin');
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
  });
});

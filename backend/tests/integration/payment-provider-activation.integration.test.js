const crypto = require('crypto');
const request = require('supertest');
const app = require('../../app');
const TokenService = require('../../services/TokenService');
const Order = require('../../models/Order');
const Payment = require('../../models/Payment');
const Session = require('../../models/Session');
const MerchantPaymentAccount = require('../../models/MerchantPaymentAccount');

let sequence = 0;

const createAuth = async (role = 'customer') => {
  sequence += 1;
  const user = await global.createTestUser({
    email: `provider-activation-${sequence}@example.com`,
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

const createOrder = async (user, paymentMethod, amount = 250, currency = 'PKR') => Order.create({
  user: user._id,
  idempotencyKey: crypto.randomUUID(),
  requestHash: crypto.createHash('sha256').update(crypto.randomUUID()).digest('hex'),
  items: [{
    product: new (require('mongoose').Types.ObjectId)(),
    name: 'Activation test product',
    sku: `ACT-${++sequence}`,
    price: amount,
    quantity: 1,
    lineTotal: amount
  }],
  shippingAddress: {
    fullName: 'Activation Customer',
    phone: '03009876543',
    address: '45 Activation Boulevard',
    city: 'Lahore',
    province: 'Punjab',
    country: 'Pakistan'
  },
  paymentMethod,
  payment: {
    provider: paymentMethod,
    currency
  },
  currency,
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

describe('Phase 5A: Payment Provider Activation & Governance Integration', () => {
  beforeAll(async () => {
    await Promise.all([
      Order.syncIndexes(),
      Payment.syncIndexes(),
      MerchantPaymentAccount.syncIndexes()
    ]);
  });

  afterEach(async () => {
    await MerchantPaymentAccount.deleteMany({});
  });

  describe('1. Public Discovery Privacy', () => {
    test('public discovery returns only operational methods and no internal reasons or secrets', async () => {
      const response = await request(app)
        .get('/api/payments/methods?country=Pakistan&currency=PKR');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data.methods)).toBe(true);

      const codes = response.body.data.methods.map((m) => m.code);
      expect(codes).toContain('cod');
      expect(codes).toContain('bank_transfer');
      expect(codes).toContain('raast');

      response.body.data.methods.forEach((method) => {
        expect(method).not.toHaveProperty('reason');
        expect(method).not.toHaveProperty('auditClassification');
        expect(method).not.toHaveProperty('secretKey');
        expect(method).not.toHaveProperty('apiKey');
        expect(method).toHaveProperty('code');
        expect(method).toHaveProperty('displayName');
        expect(method).toHaveProperty('paymentType');
        expect(method).toHaveProperty('capabilities');
      });
    });
  });

  describe('2. Admin Status Inspection (Read-Only)', () => {
    test('regular customer cannot access provider status inspection endpoint', async () => {
      const customerAuth = await createAuth('customer');

      const response = await request(app)
        .get('/api/payments/providers/status')
        .set('Authorization', customerAuth.authorization);

      expect(response.status).toBe(403);
    });

    test('admin receives sanitized provider audit report with computed operational states', async () => {
      const adminAuth = await createAuth('admin');

      const response = await request(app)
        .get('/api/payments/providers/status')
        .set('Authorization', adminAuth.authorization);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data.providers)).toBe(true);

      const codStatus = response.body.data.providers.find((p) => p.code === 'cod');
      expect(codStatus).toBeDefined();
      expect(codStatus.auditClassification).toBe('IMPLEMENTED');
      expect(codStatus.isOperational).toBe(true);
      expect(codStatus.verificationStatus).toBeDefined();
      expect(codStatus).not.toHaveProperty('secretKey');
    });
  });

  describe('3. Authoritative Order Binding', () => {
    test('createPayment binds strictly to server-side Order amount and ignores arbitrary client payloads', async () => {
      const customerAuth = await createAuth('customer');
      const order = await createOrder(customerAuth.user, 'bank_transfer', 500);

      // Client attempts to tamper with amount or currency in request body
      const response = await request(app)
        .post('/api/payments')
        .set('Authorization', customerAuth.authorization)
        .set('Idempotency-Key', crypto.randomUUID())
        .send({
          orderId: order._id.toString(),
          provider: 'bank_transfer',
          amount: 1, // Tampered amount
          currency: 'USD' // Tampered currency
        });

      // Strict validation boundary rejects unpermitted fields
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('PAYMENT_VALIDATION_FAILED');
    });

    test('createPayment creates payment snapshot matching authoritative Order exactly', async () => {
      const customerAuth = await createAuth('customer');
      const order = await createOrder(customerAuth.user, 'bank_transfer', 750);

      const response = await request(app)
        .post('/api/payments')
        .set('Authorization', customerAuth.authorization)
        .set('Idempotency-Key', crypto.randomUUID())
        .send({
          orderId: order._id.toString(),
          provider: 'bank_transfer'
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.payment.amount).toBe(750);
      expect(response.body.data.payment.currency).toBe('PKR');
      expect(response.body.data.payment.order.toString()).toBe(order._id.toString());
    });

    test('createPayment rejects unauthorized user trying to pay for another user order', async () => {
      const user1Auth = await createAuth('customer');
      const user2Auth = await createAuth('customer');
      const order = await createOrder(user1Auth.user, 'bank_transfer', 300);

      const response = await request(app)
        .post('/api/payments')
        .set('Authorization', user2Auth.authorization)
        .set('Idempotency-Key', crypto.randomUUID())
        .send({
          orderId: order._id.toString(),
          provider: 'bank_transfer'
        });

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('PAYMENT_FORBIDDEN');
    });
  });

  describe('4. Isolated MerchantPaymentAccount Governance', () => {
    test('fixtures insert directly into MerchantPaymentAccount without general admin CRUD endpoint', async () => {
      const account = await MerchantPaymentAccount.create({
        provider: 'stripe',
        environment: 'production',
        isEnabled: true,
        merchantCountry: 'AE',
        settlementCurrency: 'AED',
        supportedCurrencies: ['AED', 'USD'],
        supportedCountries: ['AE', 'GB'],
        sandboxVerification: 'verified',
        underwritingVerification: 'verified',
        webhookVerification: 'verified',
        evidenceReferences: {
          sandboxProof: 'EVD-AE-001',
          underwritingProof: 'EVD-AE-002',
          webhookProof: 'EVD-AE-003'
        }
      });

      expect(account._id).toBeDefined();
      expect(account.provider).toBe('stripe');
      expect(account.underwritingVerification).toBe('verified');
    });

    test('rejection of secret fields on MerchantPaymentAccount persistence', async () => {
      expect(() => {
        new MerchantPaymentAccount({
          provider: 'stripe',
          secretKey: 'sk_test_forbidden'
        });
      }).toThrow();
    });
  });
});

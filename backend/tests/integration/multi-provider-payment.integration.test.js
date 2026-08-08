const crypto = require('crypto');
const request = require('supertest');
const app = require('../../app');
const TokenService = require('../../services/TokenService');
const Order = require('../../models/Order');
const Payment = require('../../models/Payment');
const Session = require('../../models/Session');
const AuditLog = require('../../models/AuditLog');

let sequence = 0;

const createAuth = async (role = 'customer') => {
  sequence += 1;
  const user = await global.createTestUser({
    email: `provider-${sequence}@example.com`,
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

const createOrder = async (user, paymentMethod, amount = 125) => Order.create({
  user: user._id,
  idempotencyKey: crypto.randomUUID(),
  requestHash: crypto.createHash('sha256').update(crypto.randomUUID()).digest('hex'),
  items: [{
    product: new (require('mongoose').Types.ObjectId)(),
    name: 'Provider integration product',
    sku: `PROVIDER-${++sequence}`,
    price: amount,
    quantity: 1,
    lineTotal: amount
  }],
  shippingAddress: {
    fullName: 'Provider Integration',
    phone: '03001234567',
    address: '12 Provider Integration Street',
    city: 'Lahore',
    province: 'Punjab',
    country: 'Pakistan'
  },
  paymentMethod,
  payment: {
    provider: paymentMethod,
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

const beginPayment = (auth, order, provider, key = crypto.randomUUID()) => request(app)
  .post('/api/payments')
  .set('Authorization', auth.authorization)
  .set('Idempotency-Key', key)
  .send({ orderId: order._id.toString(), provider });

describe('P2.2 multi-provider payment flows', () => {
  beforeAll(async () => {
    await Promise.all([
      Order.syncIndexes(),
      Payment.syncIndexes()
    ]);
  });

  test('availability API exposes only available methods and no secrets', async () => {
    const response = await request(app)
      .get('/api/payments/methods?country=Pakistan&currency=PKR');

    expect(response.status).toBe(200);
    expect(response.body.data.methods.map((method) => method.code)).toEqual([
      'cod',
      'bank_transfer',
      'raast',
      'stripe'
    ]);
    expect(JSON.stringify(response.body)).not.toMatch(
      /secret.?key|password|merchant.?secret|webhook.?secret/i
    );
  });

  test('COD stays Pending until an authorized idempotent collection', async () => {
    const customer = await createAuth();
    const admin = await createAuth('admin');
    const order = await createOrder(customer.user, 'cod');
    const created = await beginPayment(customer, order, 'cod');

    expect(created.status).toBe(201);
    expect(created.body.data.payment.status).toBe('Pending');

    const first = await request(app)
      .post(`/api/payments/${created.body.data.payment._id}/collect`)
      .set('Authorization', admin.authorization)
      .send({ note: 'Collected during isolated test delivery' });
    const replay = await request(app)
      .post(`/api/payments/${created.body.data.payment._id}/collect`)
      .set('Authorization', admin.authorization)
      .send({ note: 'Duplicate collection attempt' });

    expect(first.status).toBe(200);
    expect(first.body.data.payment.status).toBe('Completed');
    expect(replay.status).toBe(200);
    expect(replay.body.data.idempotentReplay).toBe(true);
    expect((await Order.findById(order._id)).paymentStatus).toBe('Paid');
    expect(await AuditLog.countDocuments({
      eventName: 'PAYMENT.COMPLETED',
      'metadata.operation': 'cod_collection'
    })).toBe(2);
  });

  test('a cancelled order cannot receive COD collection', async () => {
    const customer = await createAuth();
    const admin = await createAuth('admin');
    const order = await createOrder(customer.user, 'cod');
    const created = await beginPayment(customer, order, 'cod');
    order.orderStatus = 'Cancelled';
    order.cancelledAt = new Date();
    await order.save();

    const response = await request(app)
      .post(`/api/payments/${created.body.data.payment._id}/collect`)
      .set('Authorization', admin.authorization)
      .send({});

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('PAYMENT_COD_COLLECTION_INVALID');
  });

  test('bank transfer requires customer submission and admin approval', async () => {
    const customer = await createAuth();
    const admin = await createAuth('admin');
    const order = await createOrder(customer.user, 'bank_transfer');
    const created = await beginPayment(customer, order, 'bank_transfer');
    const paymentId = created.body.data.payment._id;

    expect(created.status).toBe(201);
    expect(created.body.data.payment.status).toBe('AwaitingCustomerPayment');
    expect(created.body.data.customerAction.kind).toBe('bank_transfer');

    const submitted = await request(app)
      .post(`/api/payments/${paymentId}/manual-submission`)
      .set('Authorization', customer.authorization)
      .send({ transactionReference: 'BANK-TRANSFER-0001' });
    expect(submitted.status).toBe(202);
    expect(submitted.body.data.payment.status).toBe('AwaitingVerification');
    expect((await Order.findById(order._id)).paymentStatus).toBe('Pending');

    const approved = await request(app)
      .post(`/api/payments/${paymentId}/manual-review`)
      .set('Authorization', admin.authorization)
      .send({ decision: 'approve', note: 'Matched isolated test ledger' });
    expect(approved.status).toBe(200);
    expect(approved.body.data.payment.status).toBe('Completed');
    expect((await Order.findById(order._id)).paymentStatus).toBe('Paid');
  });

  test('manual reference reuse is rejected across payment records', async () => {
    const customer = await createAuth();
    const firstOrder = await createOrder(customer.user, 'bank_transfer');
    const secondOrder = await createOrder(customer.user, 'raast');
    const first = await beginPayment(customer, firstOrder, 'bank_transfer');
    const second = await beginPayment(customer, secondOrder, 'raast');

    await request(app)
      .post(`/api/payments/${first.body.data.payment._id}/manual-submission`)
      .set('Authorization', customer.authorization)
      .send({ transactionReference: 'SHARED-REFERENCE-0001' });
    const reused = await request(app)
      .post(`/api/payments/${second.body.data.payment._id}/manual-submission`)
      .set('Authorization', customer.authorization)
      .send({ transactionReference: 'shared-reference-0001' });

    expect(reused.status).toBe(409);
    expect(reused.body.error.code).toBe('PAYMENT_MANUAL_REFERENCE_REUSED');
  });

  test('Raast rejection is admin-only and does not mark the order paid', async () => {
    const customer = await createAuth();
    const admin = await createAuth('admin');
    const order = await createOrder(customer.user, 'raast');
    const created = await beginPayment(customer, order, 'raast');
    const paymentId = created.body.data.payment._id;
    await request(app)
      .post(`/api/payments/${paymentId}/manual-submission`)
      .set('Authorization', customer.authorization)
      .send({ transactionReference: 'RAAST-REFERENCE-0001' });

    const customerReview = await request(app)
      .post(`/api/payments/${paymentId}/manual-review`)
      .set('Authorization', customer.authorization)
      .send({ decision: 'approve' });
    expect(customerReview.status).toBe(403);

    const rejected = await request(app)
      .post(`/api/payments/${paymentId}/manual-review`)
      .set('Authorization', admin.authorization)
      .send({ decision: 'reject', note: 'Reference not found' });
    expect(rejected.status).toBe(200);
    expect(rejected.body.data.payment.status).toBe('Rejected');
    expect((await Order.findById(order._id)).paymentStatus).toBe('Pending');
  });

  test('automated providers cannot be manually completed', async () => {
    const customer = await createAuth();
    const admin = await createAuth('admin');
    const order = await createOrder(customer.user, 'stripe');
    const payment = await Payment.create({
      order: order._id,
      user: customer.user._id,
      provider: 'stripe',
      providerDisplayName: 'Card / Stripe',
      providerIntegrationVersion: '2.0.0',
      paymentType: 'automated',
      capabilitySnapshot: { refund: true, manualReview: false },
      providerPaymentId: 'pi_isolated_manual_forbidden',
      status: 'AwaitingVerification',
      amount: order.totalAmount,
      currency: 'PKR',
      idempotencyKey: crypto.randomUUID(),
      requestHash: crypto.randomBytes(32).toString('hex'),
      providerIdempotencyKey: crypto.randomUUID()
    });

    const response = await request(app)
      .post(`/api/payments/${payment._id}/manual-review`)
      .set('Authorization', admin.authorization)
      .send({ decision: 'approve' });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('PAYMENT_MANUAL_REVIEW_INVALID');
  });

  test('historical provider records remain readable without an installed plugin', async () => {
    const customer = await createAuth();
    const order = await createOrder(customer.user, 'cod');
    const payment = await Payment.create({
      order: order._id,
      user: customer.user._id,
      provider: 'retired_wallet',
      providerDisplayName: 'Retired Wallet',
      providerIntegrationVersion: 'historical',
      paymentType: 'historical',
      capabilitySnapshot: {},
      status: 'Completed',
      amount: order.totalAmount,
      paidAmount: order.totalAmount,
      currency: 'PKR',
      idempotencyKey: crypto.randomUUID(),
      requestHash: crypto.randomBytes(32).toString('hex'),
      providerIdempotencyKey: crypto.randomUUID()
    });

    const response = await request(app)
      .get(`/api/payments/${payment._id}`)
      .set('Authorization', customer.authorization);

    expect(response.status).toBe(200);
    expect(response.body.data.payment).toEqual(expect.objectContaining({
      provider: 'retired_wallet',
      providerDisplayName: 'Retired Wallet',
      status: 'Completed'
    }));
  });

  test('admin can filter the payment ledger by provider', async () => {
    const customer = await createAuth();
    const admin = await createAuth('admin');
    const codOrder = await createOrder(customer.user, 'cod');
    const bankOrder = await createOrder(customer.user, 'bank_transfer');
    await beginPayment(customer, codOrder, 'cod');
    await beginPayment(customer, bankOrder, 'bank_transfer');

    const response = await request(app)
      .get('/api/payments?provider=bank_transfer&page=1&limit=20')
      .set('Authorization', admin.authorization);

    expect(response.status).toBe(200);
    expect(response.body.data.payments).toHaveLength(1);
    expect(response.body.data.payments[0].provider).toBe('bank_transfer');
  });
});

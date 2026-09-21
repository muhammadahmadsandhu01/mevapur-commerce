/**
 * @file phase8-customer-recovery.integration.test.js
 * @description Integration tests for Phase 8 Customer Recovery Endpoints,
 * Document Listings, Payment Retry Session Initiation, and Customer Isolation.
 */

'use strict';

const request = require('supertest');
const mongoose = require('mongoose');
const crypto = require('crypto');
const app = require('../../app');
const User = require('../../models/User');
const Session = require('../../models/Session');
const Order = require('../../models/Order');
const OrderDocument = require('../../models/OrderDocument');
const TokenService = require('../../services/TokenService');

describe('Phase 8 — Customer Recovery & Document Access Integration Tests', () => {
  let customerUser1;
  let customerUser2;
  let tokenUser1;
  let tokenUser2;
  let orderUser1;

  const createAuth = async (role = 'customer') => {
    const user = await global.createTestUser({
      email: `phase8-cust-${Date.now()}-${Math.random().toString(36).substring(7)}@example.test`,
      role
    });
    const session = await Session.create({
      user: user._id,
      refreshTokenHash: crypto.randomBytes(32).toString('hex'),
      tokenFamilyId: crypto.randomUUID(),
      isActive: true,
      isRevoked: false,
      expiresAt: new Date(Date.now() + 3600000)
    });
    const token = TokenService.generateAccessToken({
      userId: user._id,
      sessionId: session._id,
      tokenVersion: user.tokenVersion || 0
    });
    return { user, session, token };
  };

  beforeEach(async () => {
    await Order.deleteMany({});
    await OrderDocument.deleteMany({});

    const auth1 = await createAuth('customer');
    customerUser1 = auth1.user;
    tokenUser1 = auth1.token;

    const auth2 = await createAuth('customer');
    customerUser2 = auth2.user;
    tokenUser2 = auth2.token;
    await OrderDocument.deleteMany({});

    const productId = new mongoose.Types.ObjectId();
    orderUser1 = await Order.create({
      orderId: 'ORD-REC-9001',
      user: customerUser1._id,
      idempotencyKey: crypto.randomUUID(),
      requestHash: crypto.randomBytes(32).toString('hex'),
      items: [
        { product: productId, name: 'Walnut Kernels', sku: 'WAL-01', quantity: 1, price: 1500, lineTotal: 1500 }
      ],
      subtotal: 1500,
      discount: 0,
      shippingCost: 200,
      taxAmount: 0,
      totalAmount: 1700,
      orderStatus: 'Pending',
      paymentStatus: 'Failed',
      paymentMethod: 'stripe',
      shippingAddress: {
        fullName: 'Customer One',
        phone: '03001112233',
        address: 'House 1',
        city: 'Islamabad',
        province: 'Islamabad Capital Territory',
        country: 'PK',
        countryCode: 'PK'
      },
      statusTimeline: [{
        status: 'Pending',
        actor: customerUser1._id,
        actorRole: 'customer',
        timestamp: new Date()
      }]
    });
  });

  it('6.1 unauthenticated request returns 401', async () => {
    const res = await request(app).get(`/api/account/orders/${orderUser1._id}/recovery`);
    expect(res.status).toBe(401);
  });

  it('6.2 customer can get truthful recovery state for failed order', async () => {
    const res = await request(app)
      .get(`/api/account/orders/${orderUser1._id}/recovery`)
      .set('Authorization', `Bearer ${tokenUser1}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.recovery.orderNumber).toBe('ORD-REC-9001');
    expect(res.body.data.recovery.canRetryPayment).toBe(true);
    expect(res.body.data.recovery.recoveryGuidance).toContain('unsuccessful');
    expect(res.body.data.recovery.supportReference).toContain('SUP-');
  });

  it('6.3 customer can initiate safe payment retry for failed order', async () => {
    const res = await request(app)
      .post(`/api/account/orders/${orderUser1._id}/retry-payment`)
      .set('Authorization', `Bearer ${tokenUser1}`)
      .send({ paymentMethod: 'card' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.retry.status).toBe('RETRY_INITIATED');
    expect(res.body.data.retry.orderNumber).toBe('ORD-REC-9001');
  });

  it('6.4 customer can list and retrieve truthful documents for own order', async () => {
    const listRes = await request(app)
      .get(`/api/account/orders/${orderUser1._id}/documents`)
      .set('Authorization', `Bearer ${tokenUser1}`);

    expect(listRes.status).toBe(200);
    expect(listRes.body.success).toBe(true);
    expect(listRes.body.data.documents.length).toBeGreaterThan(0);

    const docNumber = listRes.body.data.documents[0].documentNumber;

    const singleRes = await request(app)
      .get(`/api/account/orders/${orderUser1._id}/documents/${docNumber}`)
      .set('Authorization', `Bearer ${tokenUser1}`);

    expect(singleRes.status).toBe(200);
    expect(singleRes.body.data.document.documentNumber).toBe(docNumber);
    expect(singleRes.body.data.document.total).toBe(1700);
  });

  it('6.5 isolation: another customer cannot access or retry another user order', async () => {
    const resRecovery = await request(app)
      .get(`/api/account/orders/${orderUser1._id}/recovery`)
      .set('Authorization', `Bearer ${tokenUser2}`);

    expect(resRecovery.status).toBe(404);

    const resRetry = await request(app)
      .post(`/api/account/orders/${orderUser1._id}/retry-payment`)
      .set('Authorization', `Bearer ${tokenUser2}`)
      .send({ paymentMethod: 'card' });

    expect(resRetry.status).toBe(404);
  });
});

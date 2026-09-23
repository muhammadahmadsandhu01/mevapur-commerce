/**
 * @file cod-governance-routes.integration.test.js
 * @description Integration tests for COD governance routes and guest phone endpoints.
 * Validates role-based access controls (RBAC), serviceability rule management,
 * customer block/unblock/override, delivery outcome recording with rolling 30-day locks,
 * and guest phone challenge/verify.
 */

'use strict';

const request = require('supertest');
const mongoose = require('mongoose');
const crypto = require('crypto');
const app = require('../../app');
const User = require('../../models/User');
const Order = require('../../models/Order');
const Session = require('../../models/Session');
const CodServiceabilityRule = require('../../models/CodServiceabilityRule');
const CustomerCodRestriction = require('../../models/CustomerCodRestriction');
const ProductMarketOffering = require('../../models/ProductMarketOffering');
const AuditLog = require('../../models/AuditLog');
const tokenService = require('../../services/TokenService');

const authenticateUser = async (user) => {
  const session = await Session.create({
    user: user._id,
    refreshTokenHash: crypto.randomBytes(32).toString('hex'),
    tokenFamilyId: crypto.randomUUID(),
    expiresAt: new Date(Date.now() + 86400000),
    isActive: true,
    isRevoked: false
  });

  return tokenService.generateAccessToken({
    userId: user._id,
    sessionId: session._id,
    tokenVersion: user.tokenVersion || 0
  });
};

describe('COD Governance & Phone Endpoints Integration', () => {
  let adminUser;
  let supportUser;
  let customerUser;
  let adminToken;
  let supportToken;
  let customerToken;

  beforeEach(async () => {
    adminUser = await User.create({
      fullName: 'Admin User',
      email: `admin-cod-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@mevapur.test`,
      password: 'Password123!',
      role: 'admin',
      isVerified: true
    });

    supportUser = await User.create({
      fullName: 'Support User',
      email: `support-cod-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@mevapur.test`,
      password: 'Password123!',
      role: 'support',
      isVerified: true
    });

    customerUser = await User.create({
      fullName: 'Customer User',
      email: `customer-cod-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@mevapur.test`,
      password: 'Password123!',
      role: 'customer',
      isVerified: true
    });

    adminToken = await authenticateUser(adminUser);
    supportToken = await authenticateUser(supportUser);
    customerToken = await authenticateUser(customerUser);
  });

  describe('1. Serviceability Rules RBAC & Management', () => {
    test('Unauthenticated user receives 401 on GET /api/admin/cod/rules', async () => {
      const res = await request(app).get('/api/admin/cod/rules');
      expect(res.status).toBe(401);
    });

    test('Customer receives 403 on GET /api/admin/cod/rules', async () => {
      const res = await request(app)
        .get('/api/admin/cod/rules')
        .set('Authorization', `Bearer ${customerToken}`);
      expect(res.status).toBe(403);
    });

    test('Support receives 200 on GET /api/admin/cod/rules', async () => {
      const res = await request(app)
        .get('/api/admin/cod/rules')
        .set('Authorization', `Bearer ${supportToken}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data.rules)).toBe(true);
    });

    test('Support receives 403 on POST /api/admin/cod/rules (write denied)', async () => {
      const res = await request(app)
        .post('/api/admin/cod/rules')
        .set('Authorization', `Bearer ${supportToken}`)
        .send({
          city: 'Islamabad',
          postalCode: '44000',
          isServiceable: true
        });
      expect(res.status).toBe(403);
    });

    test('Admin successfully upserts serviceability rule on POST /api/admin/cod/rules', async () => {
      const res = await request(app)
        .post('/api/admin/cod/rules')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          city: 'Islamabad',
          postalCode: '44000',
          zoneKey: 'ISB-NORTH',
          isServiceable: true
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.normalizedCity).toBe('ISLAMABAD');
      expect(res.body.data.normalizedPostalCode).toBe('44000');
      expect(res.body.data.isServiceable).toBe(true);
    });
  });

  describe('2. Customer COD Risk & Policy Controls', () => {
    test('Admin blocks customer COD on POST /api/admin/cod/customers/:id/block', async () => {
      const res = await request(app)
        .post(`/api/admin/cod/customers/${customerUser._id}/block`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          reasonCode: 'COD_CUSTOMER_BLOCKED',
          notes: 'High refusal history'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.manualBlockActive).toBe(true);
      expect(res.body.data.manualBlockReasonCode).toBe('COD_CUSTOMER_BLOCKED');
    });

    test('Support can read customer COD status but cannot unblock', async () => {
      // First block as admin
      await request(app)
        .post(`/api/admin/cod/customers/${customerUser._id}/block`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reasonCode: 'COD_CUSTOMER_BLOCKED' });

      const readRes = await request(app)
        .get(`/api/admin/cod/customers/${customerUser._id}/status`)
        .set('Authorization', `Bearer ${supportToken}`);

      expect(readRes.status).toBe(200);
      expect(readRes.body.data.manualBlockActive).toBe(true);

      const unblockRes = await request(app)
        .post(`/api/admin/cod/customers/${customerUser._id}/unblock`)
        .set('Authorization', `Bearer ${supportToken}`)
        .send({ reasonCode: 'SUPPORT_UNBLOCK_ATTEMPT' });

      expect(unblockRes.status).toBe(403);
    });

    test('Admin unblocks customer COD', async () => {
      await request(app)
        .post(`/api/admin/cod/customers/${customerUser._id}/block`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reasonCode: 'COD_CUSTOMER_BLOCKED' });

      const res = await request(app)
        .post(`/api/admin/cod/customers/${customerUser._id}/unblock`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reasonCode: 'CUSTOMER_APPEAL_APPROVED' });

      expect(res.status).toBe(200);
      expect(res.body.data.manualBlockActive).toBe(false);
    });

    test('Admin grants administrative override on customer COD', async () => {
      const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const res = await request(app)
        .post(`/api/admin/cod/customers/${customerUser._id}/override`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          overrideMode: 'UNTIL',
          overrideUntil: futureDate,
          reasonCode: 'VIP_EXCEPTION'
        });

      expect(res.status).toBe(200);
      expect(res.body.data.overrideMode).toBe('UNTIL');
    });
  });

  describe('3. Courier Delivery Outcome Recording & Rolling Lock', () => {
    const makeOrder = (orderId, total) => ({
      orderId,
      user: customerUser._id,
      idempotencyKey: `IDEM-${orderId}`,
      requestHash: `HASH-${orderId}`,
      items: [{
        product: new mongoose.Types.ObjectId(),
        name: 'Test Almonds',
        sku: 'SKU-ALM-500G',
        price: total,
        quantity: 1,
        lineTotal: total
      }],
      subtotal: total,
      totalAmount: total,
      currency: 'PKR',
      paymentMethod: 'cod',
      orderStatus: 'Processing',
      statusTimeline: [{
        status: 'Pending',
        actor: customerUser._id,
        actorRole: 'customer',
        timestamp: new Date()
      }],
      shippingAddress: {
        fullName: 'Test Customer',
        address: 'Main St',
        city: 'Lahore',
        phone: '+923001234567'
      }
    });

    test('1st RTO event records successfully and does not lock customer (qualifyingCount = 1)', async () => {
      const order = await Order.create(makeOrder('ORD-TEST-COD-001', 1500));

      const res = await request(app)
        .post(`/api/admin/cod/orders/${order.orderId}/delivery-outcome`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          outcomeCode: 'COD_REFUSED_BY_CUSTOMER',
          metadata: { refusalReason: 'Customer refused delivery at doorstep' }
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.outcome.outcomeCode).toBe('COD_REFUSED_BY_CUSTOMER');
      expect(res.body.data.qualifyingCount).toBe(1);

      const restriction = await CustomerCodRestriction.findOne({ customerId: customerUser._id });
      expect(restriction).toBeNull();
    });

    test('2nd RTO event within rolling 90 days triggers automatic 30-day temporary lock', async () => {
      const order1 = await Order.create(makeOrder('ORD-TEST-COD-002', 1500));
      const order2 = await Order.create(makeOrder('ORD-TEST-COD-003', 2000));

      // Event 1
      await request(app)
        .post(`/api/admin/cod/orders/${order1.orderId}/delivery-outcome`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ outcomeCode: 'COD_REFUSED_BY_CUSTOMER' });

      // Event 2
      const res = await request(app)
        .post(`/api/admin/cod/orders/${order2.orderId}/delivery-outcome`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          outcomeCode: 'COD_RETURN_TO_ORIGIN',
          metadata: { rtoReason: 'Customer unreachable after 3 attempts' }
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.qualifyingCount).toBe(2);
      expect(res.body.data.restriction).toBeDefined();

      const restriction = await CustomerCodRestriction.findOne({ customerId: customerUser._id });
      expect(restriction).toBeDefined();
      expect(restriction.isTemporaryLockActive()).toBe(true);
      expect(restriction.temporaryLockReasonCode).toBe('COD_CUSTOMER_TEMPORARILY_LOCKED');
    });

    test('Duplicate delivery outcome event with same eventId is ignored idempotently', async () => {
      const order = await Order.create(makeOrder('ORD-TEST-COD-004', 1500));
      const eventId = 'CUSTOM_EVENT_ID_001';

      const firstRes = await request(app)
        .post(`/api/admin/cod/orders/${order.orderId}/delivery-outcome`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          outcomeCode: 'DELIVERY_SUCCESSFUL',
          eventId
        });

      expect(firstRes.status).toBe(200);
      expect(firstRes.body.data.isDuplicate).toBe(false);

      const secondRes = await request(app)
        .post(`/api/admin/cod/orders/${order.orderId}/delivery-outcome`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          outcomeCode: 'DELIVERY_SUCCESSFUL',
          eventId
        });

      expect(secondRes.status).toBe(200);
      expect(secondRes.body.data.isDuplicate).toBe(true);
    });
  });

  describe('4. Guest COD Phone Challenge & Verify Endpoints', () => {
    let challengeId;

    test('POST /api/auth/phone/challenge generates challenge ID for valid PK phone', async () => {
      const res = await request(app)
        .post('/api/auth/phone/challenge')
        .send({ phone: '03001234567' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.challengeId).toBeDefined();
      expect(res.body.data.expiresInSeconds).toBe(600);

      challengeId = res.body.data.challengeId;
    });

    test('POST /api/auth/phone/verify rejects invalid OTP with 400', async () => {
      const res = await request(app)
        .post('/api/auth/phone/verify')
        .send({ challengeId, otp: '000000' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('OTP_MISMATCH');
    });
  });

  describe('5. ProductMarketOffering COD Eligibility & Governance Audit History', () => {
    let offering;

    beforeEach(async () => {
      offering = await ProductMarketOffering.create({
        merchantScopeId: 'global',
        productId: new mongoose.Types.ObjectId(),
        scopeType: 'global',
        scopeKey: 'default',
        marketCountry: 'PK',
        sku: `SKU-TEST-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        status: 'active',
        codEligible: true
      });
    });

    test('Support can list offerings via GET /api/admin/cod/offerings', async () => {
      const res = await request(app)
        .get('/api/admin/cod/offerings')
        .set('Authorization', `Bearer ${supportToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data.offerings)).toBe(true);
    });

    test('Support cannot update offering COD eligibility (403)', async () => {
      const res = await request(app)
        .put(`/api/admin/cod/offerings/${offering._id}/eligibility`)
        .set('Authorization', `Bearer ${supportToken}`)
        .send({ codEligible: false, reason: 'High return rate' });

      expect(res.status).toBe(403);
    });

    test('Admin can update offering COD eligibility to false and records audit log', async () => {
      const res = await request(app)
        .put(`/api/admin/cod/offerings/${offering._id}/eligibility`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ codEligible: false, reason: 'High return rate' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.offering.codEligible).toBe(false);

      // Verify audit history endpoint
      const auditRes = await request(app)
        .get('/api/admin/cod/audit-history')
        .set('Authorization', `Bearer ${supportToken}`);

      expect(auditRes.status).toBe(200);
      expect(auditRes.body.success).toBe(true);
      expect(auditRes.body.data.auditLogs.some(l => l.eventName === 'COD.OFFERING_ELIGIBILITY.UPDATED')).toBe(true);
    });
  });
});

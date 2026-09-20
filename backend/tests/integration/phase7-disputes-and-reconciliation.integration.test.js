/**
 * @file phase7-disputes-and-reconciliation.integration.test.js
 * @description Integration tests for payment dispute management, evidence upload,
 * finance reconciliation endpoints, and dispute webhook processing.
 */

'use strict';

const request = require('supertest');
const mongoose = require('mongoose');
const crypto = require('crypto');
const app = require('../../app');
const User = require('../../models/User');
const Session = require('../../models/Session');
const Order = require('../../models/Order');
const Payment = require('../../models/Payment');
const PaymentDispute = require('../../models/PaymentDispute');
const PaymentWebhookEvent = require('../../models/PaymentWebhookEvent');
const TokenService = require('../../services/TokenService');
const PaymentWebhookProcessor = require('../../services/payment/webhooks/PaymentWebhookProcessor');
const { Money, MoneyMapper } = require('../../modules/commerce');

describe('Phase 7 — Disputes & Finance Reconciliation Integration', () => {
  let adminUser;
  let adminAuth;
  let customerUser;
  let customerAuth;
  let payment;
  let order;

  const createAuth = async (role = 'customer') => {
    const user = await global.createTestUser({
      email: `phase7-auth-${Date.now()}-${Math.random().toString(36).substring(7)}@example.test`,
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
    return { user, authHeader: `Bearer ${token}` };
  };

  beforeEach(async () => {
    const admin = await createAuth('admin');
    adminUser = admin.user;
    adminAuth = admin.authHeader;

    const customer = await createAuth('customer');
    customerUser = customer.user;
    customerAuth = customer.authHeader;

    order = await Order.create({
      orderId: `ORD-P7-${Date.now()}`,
      user: customerUser._id,
      idempotencyKey: crypto.randomUUID(),
      requestHash: 'hash-p7-order',
      items: [{
        product: new mongoose.Types.ObjectId(),
        name: 'Phase 7 Item',
        price: 8000,
        quantity: 1,
        lineTotal: 8000
      }],
      shippingAddress: {
        fullName: customerUser.fullName,
        phone: '03001234567',
        address: '123 Phase 7 Lane',
        city: 'Lahore',
        country: 'PK'
      },
      paymentMethod: 'stripe',
      paymentStatus: 'Paid',
      subtotal: 8000,
      totalAmount: 8000,
      statusTimeline: [{ status: 'Processing', actor: customerUser._id, actorRole: 'customer', timestamp: new Date() }]
    });

    payment = await Payment.create({
      order: order._id,
      user: customerUser._id,
      provider: 'stripe',
      providerPaymentId: `pi_test_p7_${Date.now()}`,
      amount: 8000,
      paidAmount: 8000,
      currency: 'PKR',
      status: 'Completed',
      idempotencyKey: crypto.randomUUID(),
      requestHash: 'hash-p7-payment',
      providerIdempotencyKey: `p7-key-${Date.now()}`
    });
  });

  describe('Payment Dispute Endpoints & Ingestion', () => {
    it('ingests and processes a charge.dispute.created webhook event via PaymentWebhookProcessor', async () => {
      const providerDisputeId = `dp_webhook_${Date.now()}`;
      const claimedEvent = await PaymentWebhookEvent.create({
        provider: 'stripe',
        providerEventId: `evt_disp_${Date.now()}`,
        eventType: 'charge.dispute.created',
        providerPaymentId: payment.providerPaymentId,
        providerRefundId: providerDisputeId,
        amountMinor: 400000, // Rs.4000 in minor units
        currency: 'PKR',
        payloadHash: 'hash-disp-webhook',
        eventData: {
          providerDisputeId,
          providerPaymentId: payment.providerPaymentId,
          amountMinor: 400000,
          currency: 'PKR',
          reason: 'fraudulent',
          metadata: { paymentId: payment._id.toString() }
        },
        status: 'processing',
        leaseId: crypto.randomUUID(),
        leaseAcquiredAt: new Date(),
        leaseExpiresAt: new Date(Date.now() + 60000)
      });

      const result = await PaymentWebhookProcessor.processClaimedEvent(claimedEvent);
      expect(result.outcome).toBe('dispute_processed');
      expect(result.status).toBe('processed');

      // Check that PaymentDispute record was created
      const dispute = await PaymentDispute.findOne({ providerDisputeId });
      expect(dispute).toBeDefined();
      expect(dispute.amount).toBe(4000);
      expect(dispute.reason).toBe('fraudulent');

      // Verify payment dispute hold was updated
      const updatedPayment = await Payment.findById(payment._id);
      expect(updatedPayment.disputedAmount).toBe(4000);
      expect(updatedPayment.hasActiveDispute).toBe(true);
    });

    it('requires admin authorization to list and view disputes', async () => {
      const dispute = await PaymentDispute.create({
        providerDisputeId: `dp_test_${Date.now()}`,
        payment: payment._id,
        order: order._id,
        customer: customerUser._id,
        provider: 'stripe',
        amount: 3000,
        amountExact: MoneyMapper.toPersistence(Money.fromLegacyNumber(3000, 'PKR')),
        currency: 'PKR'
      });

      // Customer attempt -> 403 Forbidden
      const customerRes = await request(app)
        .get('/api/disputes')
        .set('Authorization', customerAuth);
      expect(customerRes.status).toBe(403);

      // Admin attempt -> 200 OK
      const adminRes = await request(app)
        .get('/api/disputes')
        .set('Authorization', adminAuth);
      expect(adminRes.status).toBe(200);
      expect(adminRes.body.success).toBe(true);
      expect(adminRes.body.data.length).toBeGreaterThanOrEqual(1);

      // Admin get dispute detail
      const detailRes = await request(app)
        .get(`/api/disputes/${dispute._id}`)
        .set('Authorization', adminAuth);
      expect(detailRes.status).toBe(200);
      expect(detailRes.body.data.disputeId).toBe(dispute.disputeId);
    });

    it('allows admin to submit dispute evidence and moves status to under_review', async () => {
      const dispute = await PaymentDispute.create({
        providerDisputeId: `dp_test_ev_${Date.now()}`,
        payment: payment._id,
        order: order._id,
        customer: customerUser._id,
        provider: 'stripe',
        amount: 2500,
        amountExact: MoneyMapper.toPersistence(Money.fromLegacyNumber(2500, 'PKR')),
        currency: 'PKR'
      });

      const res = await request(app)
        .post(`/api/disputes/${dispute._id}/evidence`)
        .set('Authorization', adminAuth)
        .send({
          trackingNumber: 'DHL987654321',
          customerCommunication: 'Customer acknowledged receipt via support ticket.',
          refundPolicyDisclosure: 'Customer agreed to standard 30-day policy.',
          notes: 'Signed proof of delivery attached.'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('under_review');
      expect(res.body.data.evidence.trackingNumber).toBe('DHL987654321');
    });
  });

  describe('Finance Reconciliation Endpoints', () => {
    it('requires admin authorization for finance reconciliation endpoints', async () => {
      const customerRes = await request(app)
        .get(`/api/finance-reconciliation/payment/${payment._id}`)
        .set('Authorization', customerAuth);
      expect(customerRes.status).toBe(403);

      const adminRes = await request(app)
        .get(`/api/finance-reconciliation/payment/${payment._id}`)
        .set('Authorization', adminAuth);
      expect(adminRes.status).toBe(200);
      expect(adminRes.body.success).toBe(true);
      expect(adminRes.body.data.paymentId.toString()).toBe(payment._id.toString());
      expect(adminRes.body.data.hasAnomalies).toBe(false);
    });

    it('returns periodic financial audit report for admin', async () => {
      const res = await request(app)
        .get('/api/finance-reconciliation/period')
        .set('Authorization', adminAuth);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.summary).toBeDefined();
      expect(res.body.data.summary.totalPaymentsAudited).toBeGreaterThanOrEqual(1);
    });
  });
});

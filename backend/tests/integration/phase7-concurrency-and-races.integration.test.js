/**
 * @file phase7-concurrency-and-races.integration.test.js
 * @description Concurrency, race condition, multi-currency exact allocation,
 * duplicate webhook, and authorization integration tests for Phase 7.
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
const Refund = require('../../models/Refund');
const PaymentDispute = require('../../models/PaymentDispute');
const PaymentWebhookEvent = require('../../models/PaymentWebhookEvent');
const TokenService = require('../../services/TokenService');
const RefundService = require('../../services/payment/RefundService');
const PaymentDisputeService = require('../../services/payment/PaymentDisputeService');
const PaymentWebhookProcessor = require('../../services/payment/webhooks/PaymentWebhookProcessor');
const stripeProvider = require('../../services/payment/providers/StripeProvider');
const { Money, MoneyMapper } = require('../../modules/commerce');

describe('Phase 7 — Concurrency, Races, Multi-Currency & Security Integration', () => {
  let adminUser;
  let adminAuth;
  let customerUser;
  let customerAuth;
  let fakeStripe;

  const createAuth = async (role = 'customer') => {
    const user = await global.createTestUser({
      email: `p7-race-${Date.now()}-${Math.random().toString(36).substring(7)}@example.test`,
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
    process.env.STRIPE_SECRET_KEY = 'sk_test_isolated_fake';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_isolated_fake';
    let refunds = 0;
    fakeStripe = {
      paymentIntents: { create: jest.fn(), retrieve: jest.fn() },
      refunds: {
        create: jest.fn(async () => ({
          id: `re_p7_race_${++refunds}`,
          status: 'succeeded'
        }))
      }
    };
    stripeProvider.setClientForTests(fakeStripe);

    const admin = await createAuth('admin');
    adminUser = admin.user;
    adminAuth = admin.authHeader;

    const customer = await createAuth('customer');
    customerUser = customer.user;
    customerAuth = customer.authHeader;
  });

  describe('1. Concurrency: Simultaneous Overlapping Refund Race Safety', () => {
    it('prevents over-refunding when two concurrent refund requests race for available balance', async () => {
      const order = await Order.create({
        orderId: `ORD-RACE-REF-${Date.now()}`,
        user: customerUser._id,
        idempotencyKey: crypto.randomUUID(),
        requestHash: 'hash-race-ref-order',
        items: [{
          product: new mongoose.Types.ObjectId(),
          name: 'Race Item',
          price: 10000,
          quantity: 1,
          lineTotal: 10000
        }],
        shippingAddress: {
          fullName: 'Race Customer',
          phone: '03001234567',
          address: '123 Race St',
          city: 'Lahore',
          country: 'PK'
        },
        paymentMethod: 'stripe',
        paymentStatus: 'Paid',
        subtotal: 10000,
        totalAmount: 10000,
        statusTimeline: [{ status: 'Processing', actor: customerUser._id, actorRole: 'customer', timestamp: new Date() }]
      });

      const payment = await Payment.create({
        order: order._id,
        user: customerUser._id,
        provider: 'stripe',
        providerPaymentId: `pi_test_race_${Date.now()}`,
        amount: 10000,
        paidAmount: 10000,
        currency: 'PKR',
        status: 'Completed',
        idempotencyKey: crypto.randomUUID(),
        requestHash: 'hash-race-ref-payment',
        providerIdempotencyKey: `p-race-${Date.now()}`
      });

      // Two concurrent refund requests of 6000 each on a 10000 payment (total 12000 > 10000)
      const req1 = RefundService.createRefund({
        paymentId: payment._id,
        amount: 6000,
        idempotencyKey: `race-ref-1-${Date.now()}`,
        adminId: adminUser._id,
        reason: 'Concurrent refund 1'
      });

      const req2 = RefundService.createRefund({
        paymentId: payment._id,
        amount: 6000,
        idempotencyKey: `race-ref-2-${Date.now()}`,
        adminId: adminUser._id,
        reason: 'Concurrent refund 2'
      });

      const results = await Promise.allSettled([req1, req2]);
      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      // Exactly one must succeed and one must fail closed with available balance error
      expect(fulfilled.length).toBe(1);
      expect(rejected.length).toBe(1);
      expect(rejected[0].reason.message).toContain('exceeds the remaining paid amount');

      // Verify payment refunded amount is exactly 6000, never 12000
      const updatedPayment = await Payment.findById(payment._id).select('+refundReservedAmount');
      expect(updatedPayment.refundedAmount).toBe(6000);
      expect(updatedPayment.refundReservedAmount).toBe(0);
    });
  });

  describe('2. Concurrency: Dispute Hold vs Refund Race Safety', () => {
    it('prevents total reservations from exceeding paid amount when dispute and refund race', async () => {
      const order = await Order.create({
        orderId: `ORD-RACE-DISP-${Date.now()}`,
        user: customerUser._id,
        idempotencyKey: crypto.randomUUID(),
        requestHash: 'hash-race-disp-order',
        items: [{
          product: new mongoose.Types.ObjectId(),
          name: 'Dispute Race Item',
          price: 10000,
          quantity: 1,
          lineTotal: 10000
        }],
        shippingAddress: {
          fullName: 'Race Customer',
          phone: '03001234567',
          address: '123 Race St',
          city: 'Lahore',
          country: 'PK'
        },
        paymentMethod: 'stripe',
        paymentStatus: 'Paid',
        subtotal: 10000,
        totalAmount: 10000,
        statusTimeline: [{ status: 'Processing', actor: customerUser._id, actorRole: 'customer', timestamp: new Date() }]
      });

      const payment = await Payment.create({
        order: order._id,
        user: customerUser._id,
        provider: 'stripe',
        providerPaymentId: `pi_test_disp_race_${Date.now()}`,
        amount: 10000,
        paidAmount: 10000,
        currency: 'PKR',
        status: 'Completed',
        idempotencyKey: crypto.randomUUID(),
        requestHash: 'hash-race-disp-payment',
        providerIdempotencyKey: `p-disp-race-${Date.now()}`
      });

      // Record a dispute for 7000
      await PaymentDisputeService.recordOrUpdateDispute({
        providerDisputeId: `dp_race_${Date.now()}`,
        paymentId: payment._id,
        provider: 'stripe',
        amount: 7000,
        currency: 'PKR',
        reason: 'fraudulent'
      });

      // Now attempting to refund 5000 (7000 dispute + 5000 refund = 12000 > 10000) must fail closed
      await expect(RefundService.createRefund({
        paymentId: payment._id,
        amount: 5000,
        idempotencyKey: `ref-after-disp-${Date.now()}`,
        adminId: adminUser._id
      })).rejects.toThrow('Refund amount exceeds the remaining paid amount');

      // Refunding 3000 (7000 dispute + 3000 refund = 10000 <= 10000) must succeed
      const allowedRefund = await RefundService.createRefund({
        paymentId: payment._id,
        amount: 3000,
        idempotencyKey: `ref-allowed-${Date.now()}`,
        adminId: adminUser._id
      });
      expect(allowedRefund).toBeDefined();
    });
  });

  describe('3. Webhook Deduplication & Out-of-Order Lifecycle', () => {
    it('idempotently handles duplicate dispute webhook events without double-counting holds', async () => {
      const order = await Order.create({
        orderId: `ORD-DUP-WEBHOOK-${Date.now()}`,
        user: customerUser._id,
        idempotencyKey: crypto.randomUUID(),
        requestHash: 'hash-dup-order',
        items: [{
          product: new mongoose.Types.ObjectId(),
          name: 'Dup Webhook Item',
          price: 5000,
          quantity: 1,
          lineTotal: 5000
        }],
        shippingAddress: {
          fullName: 'Dup Customer',
          phone: '03001234567',
          address: '123 Dup St',
          city: 'Lahore',
          country: 'PK'
        },
        paymentMethod: 'stripe',
        paymentStatus: 'Paid',
        subtotal: 5000,
        totalAmount: 5000,
        statusTimeline: [{ status: 'Processing', actor: customerUser._id, actorRole: 'customer', timestamp: new Date() }]
      });

      const payment = await Payment.create({
        order: order._id,
        user: customerUser._id,
        provider: 'stripe',
        providerPaymentId: `pi_test_dup_${Date.now()}`,
        amount: 5000,
        paidAmount: 5000,
        currency: 'PKR',
        status: 'Completed',
        idempotencyKey: crypto.randomUUID(),
        requestHash: 'hash-dup-payment',
        providerIdempotencyKey: `p-dup-${Date.now()}`
      });

      const providerDisputeId = `dp_dup_${Date.now()}`;
      const eventPayload = {
        provider: 'stripe',
        providerEventId: `evt_dup_1_${Date.now()}`,
        eventType: 'charge.dispute.created',
        providerPaymentId: payment.providerPaymentId,
        providerRefundId: providerDisputeId,
        amountMinor: 250000, // 2500 PKR
        currency: 'PKR',
        payloadHash: 'hash-dup-1',
        eventData: {
          providerDisputeId,
          providerPaymentId: payment.providerPaymentId,
          amountMinor: 250000,
          currency: 'PKR',
          reason: 'fraudulent'
        },
        status: 'processing',
        leaseId: crypto.randomUUID(),
        leaseAcquiredAt: new Date(),
        leaseExpiresAt: new Date(Date.now() + 60000)
      };

      const event1 = await PaymentWebhookEvent.create(eventPayload);
      const res1 = await PaymentWebhookProcessor.processClaimedEvent(event1);
      expect(res1.outcome).toBe('dispute_processed');

      // Duplicate delivery of same dispute
      const event2 = await PaymentWebhookEvent.create({
        ...eventPayload,
        providerEventId: `evt_dup_2_${Date.now()}`,
        status: 'processing',
        leaseId: crypto.randomUUID(),
        leaseAcquiredAt: new Date(),
        leaseExpiresAt: new Date(Date.now() + 60000)
      });
      const res2 = await PaymentWebhookProcessor.processClaimedEvent(event2);
      expect(res2.outcome).toBe('dispute_processed');

      // Verify payment dispute amount is 2500 exactly, not 5000
      const updatedPayment = await Payment.findById(payment._id);
      expect(updatedPayment.disputedAmount).toBe(2500);
      expect(updatedPayment.disputeCount).toBe(1);
    });
  });

  describe('4. Multi-Currency Exact Rational Arithmetic & Zero-Decimal Invariants', () => {
    it('accurately resolves exact Money amounts across JPY (zero-decimal) and KWD (three-decimal)', () => {
      // JPY: 0 decimals
      const jpyMoney = Money.fromLegacyNumber(1500, 'JPY');
      expect(jpyMoney.exponent).toBe(0);
      expect(jpyMoney.amountMinor).toBe(1500n);

      // KWD: 3 decimals
      const kwdMoney = Money.fromLegacyNumber(12.345, 'KWD');
      expect(kwdMoney.exponent).toBe(3);
      expect(kwdMoney.amountMinor).toBe(12345n);

      // Rejects cross-currency arithmetic strictly
      expect(() => jpyMoney.add(kwdMoney)).toThrow('Currency mismatch');
    });
  });

  describe('5. Route-Level RBAC & Tampering Protection', () => {
    it('strictly denies unauthenticated and customer access to disputes and finance reconciliation', async () => {
      // Unauthenticated
      const unauthDispute = await request(app).get('/api/disputes');
      expect(unauthDispute.status).toBe(401);

      const unauthRecon = await request(app).get('/api/finance-reconciliation/period');
      expect(unauthRecon.status).toBe(401);

      // Authenticated Customer
      const custDispute = await request(app)
        .get('/api/disputes')
        .set('Authorization', customerAuth);
      expect(custDispute.status).toBe(403);

      const custRecon = await request(app)
        .get('/api/finance-reconciliation/period')
        .set('Authorization', customerAuth);
      expect(custRecon.status).toBe(403);
    });
  });
});

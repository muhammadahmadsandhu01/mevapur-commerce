/**
 * @file phase7-dispute-service.unit.test.js
 * @description Unit tests for PaymentDisputeService, dispute lifecycle, dispute holds, and refund race prevention.
 */

'use strict';

const mongoose = require('mongoose');
const PaymentDisputeService = require('../../services/payment/PaymentDisputeService');
const RefundService = require('../../services/payment/RefundService');
const Payment = require('../../models/Payment');
const PaymentDispute = require('../../models/PaymentDispute');
const Order = require('../../models/Order');
const { Money, MoneyMapper } = require('../../modules/commerce');

describe('Phase 7 — Payment Dispute Lifecycle & Hold Management', () => {
  let payment;
  let order;
  const dummyUserId = new mongoose.Types.ObjectId();

  beforeEach(async () => {
    order = await Order.create({
      orderId: `ORD-DISP-${Date.now()}`,
      user: dummyUserId,
      idempotencyKey: new mongoose.Types.ObjectId().toString(),
      requestHash: 'hash-disp-order',
      items: [{
        product: new mongoose.Types.ObjectId(),
        name: 'Dispute Item',
        price: 5000,
        quantity: 1,
        lineTotal: 5000
      }],
      shippingAddress: {
        fullName: 'Dispute Test',
        phone: '03001234567',
        address: '123 Dispute Road',
        city: 'Lahore',
        country: 'PK'
      },
      paymentMethod: 'stripe',
      paymentStatus: 'Paid',
      subtotal: 5000,
      totalAmount: 5000,
      statusTimeline: [{ status: 'Processing', actor: dummyUserId, actorRole: 'customer', timestamp: new Date() }]
    });

    payment = await Payment.create({
      order: order._id,
      user: dummyUserId,
      provider: 'stripe',
      providerPaymentId: `pi_test_disp_${Date.now()}`,
      amount: 5000,
      paidAmount: 5000,
      currency: 'PKR',
      status: 'Completed',
      idempotencyKey: new mongoose.Types.ObjectId().toString(),
      requestHash: 'hash-disp-payment',
      providerIdempotencyKey: `disp-key-${Date.now()}`
    });
  });

  it('records a new dispute and establishes a financial hold reservation on payment', async () => {
    const dispute = await PaymentDisputeService.recordOrUpdateDispute({
      providerDisputeId: `dp_test_${Date.now()}`,
      paymentId: payment._id,
      provider: 'stripe',
      amount: 2000,
      currency: 'PKR',
      reason: 'fraudulent',
      evidenceDueBy: new Date(Date.now() + 7 * 86400000)
    });

    expect(dispute).toBeDefined();
    expect(dispute.amount).toBe(2000);
    expect(dispute.status).toBe('needs_response');
    expect(dispute.isResolved).toBe(false);

    // Verify payment dispute hold
    const updatedPayment = await Payment.findById(payment._id);
    expect(updatedPayment.disputedAmount).toBe(2000);
    expect(updatedPayment.hasActiveDispute).toBe(true);
    expect(updatedPayment.disputeCount).toBe(1);
  });

  it('allows submitting evidence and updates status to under_review', async () => {
    const dispute = await PaymentDisputeService.recordOrUpdateDispute({
      providerDisputeId: `dp_test_${Date.now()}`,
      paymentId: payment._id,
      provider: 'stripe',
      amount: 1500,
      currency: 'PKR',
      reason: 'product_not_received'
    });

    const updated = await PaymentDisputeService.submitEvidence(dispute._id, {
      adminId: dummyUserId,
      trackingNumber: 'TRK12345678',
      customerCommunication: 'Proof of delivery signed by customer.',
      notes: 'Delivered on time via DHL.'
    });

    expect(updated.status).toBe('under_review');
    expect(updated.evidence.trackingNumber).toBe('TRK12345678');
    expect(updated.evidence.submittedBy.toString()).toBe(dummyUserId.toString());
  });

  it('releases payment dispute hold when dispute is won or charge_refunded', async () => {
    const providerDisputeId = `dp_test_won_${Date.now()}`;
    await PaymentDisputeService.recordOrUpdateDispute({
      providerDisputeId,
      paymentId: payment._id,
      provider: 'stripe',
      amount: 2500,
      currency: 'PKR',
      reason: 'fraudulent'
    });

    // Update to won
    const resolvedDispute = await PaymentDisputeService.recordOrUpdateDispute({
      providerDisputeId,
      paymentId: payment._id,
      provider: 'stripe',
      amount: 2500,
      currency: 'PKR',
      status: 'won'
    });

    expect(resolvedDispute.status).toBe('won');
    expect(resolvedDispute.isResolved).toBe(true);

    const updatedPayment = await Payment.findById(payment._id);
    expect(updatedPayment.disputedAmount).toBe(0);
    expect(updatedPayment.hasActiveDispute).toBe(false);
  });

  it('prevents refund from exceeding remaining balance when dispute hold is active', async () => {
    // Payment total: 5000. Open dispute of 3500. Available for refund = 5000 - 3500 = 1500.
    await PaymentDisputeService.recordOrUpdateDispute({
      providerDisputeId: `dp_test_hold_${Date.now()}`,
      paymentId: payment._id,
      provider: 'stripe',
      amount: 3500,
      currency: 'PKR'
    });

    // Attempting to refund 2000 (exceeds 1500 available) should fail closed
    await expect(RefundService.createRefund({
      paymentId: payment._id,
      amount: 2000,
      idempotencyKey: `ref-fail-${Date.now()}`,
      adminId: dummyUserId
    })).rejects.toThrow('Refund amount exceeds the remaining paid amount');
  });
});

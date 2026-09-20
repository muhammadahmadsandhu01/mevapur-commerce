/**
 * @file phase7-finance-reconciliation.unit.test.js
 * @description Unit tests for FinanceReconciliationService, multi-ledger reconciliation, and anomaly detection.
 */

'use strict';

const mongoose = require('mongoose');
const FinanceReconciliationService = require('../../services/finance/FinanceReconciliationService');
const Payment = require('../../models/Payment');
const Refund = require('../../models/Refund');
const PaymentDispute = require('../../models/PaymentDispute');
const Order = require('../../models/Order');

describe('Phase 7 — Finance Reconciliation & Multi-Ledger Anomaly Detection', () => {
  let payment;
  let order;
  const dummyUserId = new mongoose.Types.ObjectId();

  beforeEach(async () => {
    order = await Order.create({
      orderId: `ORD-REC-${Date.now()}`,
      user: dummyUserId,
      idempotencyKey: new mongoose.Types.ObjectId().toString(),
      requestHash: 'hash-rec-order',
      items: [{
        product: new mongoose.Types.ObjectId(),
        name: 'Reconciliation Item',
        price: 10000,
        quantity: 1,
        lineTotal: 10000
      }],
      shippingAddress: {
        fullName: 'Rec Test',
        phone: '03001234567',
        address: '123 Rec Road',
        city: 'Lahore',
        country: 'PK'
      },
      paymentMethod: 'stripe',
      paymentStatus: 'Paid',
      subtotal: 10000,
      totalAmount: 10000,
      statusTimeline: [{ status: 'Processing', actor: dummyUserId, actorRole: 'customer', timestamp: new Date() }]
    });

    payment = await Payment.create({
      order: order._id,
      user: dummyUserId,
      provider: 'stripe',
      providerPaymentId: `pi_test_rec_${Date.now()}`,
      amount: 10000,
      paidAmount: 10000,
      currency: 'PKR',
      status: 'Completed',
      idempotencyKey: new mongoose.Types.ObjectId().toString(),
      requestHash: 'hash-rec-payment',
      providerIdempotencyKey: `rec-key-${Date.now()}`
    });
  });

  it('reconciles clean payment with zero anomalies when ledgers balance', async () => {
    const report = await FinanceReconciliationService.reconcilePayment(payment._id);
    expect(report.hasAnomalies).toBe(false);
    expect(report.anomalies).toHaveLength(0);
    expect(report.paidAmount).toBe(10000);
    expect(report.refundedAmount).toBe(0);
    expect(report.netRealizedAmount).toBe(10000);
  });

  it('detects REFUND_LEDGER_MISMATCH when completed refund documents do not match payment refundedAmount', async () => {
    // Payment records refundedAmount = 3000, but only 1000 Refund doc exists
    payment.refundedAmount = 3000;
    await payment.save();

    await Refund.create({
      refundNumber: `REF-REC-${Date.now()}`,
      payment: payment._id,
      order: order._id,
      customer: dummyUserId,
      provider: 'stripe',
      amount: 1000,
      currency: 'PKR',
      status: 'Completed',
      idempotencyKey: 'ref-key-1',
      requestHash: 'ref-hash-1',
      providerIdempotencyKey: 'p-ref-1',
      processedBy: dummyUserId
    });

    const report = await FinanceReconciliationService.reconcilePayment(payment._id);
    expect(report.hasAnomalies).toBe(true);
    expect(report.anomalies.some((a) => a.type === 'REFUND_LEDGER_MISMATCH')).toBe(true);
  });

  it('detects DISPUTE_LEDGER_MISMATCH when active dispute documents do not match payment disputedAmount', async () => {
    payment.disputedAmount = 5000;
    await payment.save();

    const report = await FinanceReconciliationService.reconcilePayment(payment._id);
    expect(report.hasAnomalies).toBe(true);
    expect(report.anomalies.some((a) => a.type === 'DISPUTE_LEDGER_MISMATCH')).toBe(true);
  });

  it('detects OVER_CLAIM_ANOMALY when claims exceed paid amount', async () => {
    payment.refundedAmount = 6000;
    payment.refundReservedAmount = 3000;
    payment.disputedAmount = 2000; // 6000 + 3000 + 2000 = 11000 > 10000
    await payment.save();

    const report = await FinanceReconciliationService.reconcilePayment(payment._id);
    expect(report.hasAnomalies).toBe(true);
    expect(report.anomalies.some((a) => a.type === 'OVER_CLAIM_ANOMALY')).toBe(true);
  });

  it('reconciles period summary across multiple payments', async () => {
    const periodReport = await FinanceReconciliationService.reconcilePeriod({
      startDate: new Date(Date.now() - 86400000),
      endDate: new Date(Date.now() + 86400000)
    });

    expect(periodReport.summary).toBeDefined();
    expect(periodReport.summary.totalPaymentsAudited).toBeGreaterThanOrEqual(1);
    expect(periodReport.items.length).toBe(periodReport.summary.totalPaymentsAudited);
  });
});

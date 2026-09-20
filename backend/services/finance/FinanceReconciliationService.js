/**
 * @file FinanceReconciliationService.js
 * @description Domain service for multi-ledger financial reconciliation between Orders,
 * Payments, Refunds, Disputes, and provider settlements. Identifies discrepancies,
 * orphan records, currency mismatches, and over-allocation anomalies.
 */

'use strict';

const Payment = require('../../models/Payment');
const Refund = require('../../models/Refund');
const PaymentDispute = require('../../models/PaymentDispute');
const Order = require('../../models/Order');
const { Money, MoneyMapper } = require('../../modules/commerce');
const { AppError } = require('../../common/errors/AppError');

class FinanceReconciliationService {
  /**
   * Reconciles a single payment record against its associated refunds and disputes.
   */
  async reconcilePayment(paymentId) {
    const payment = await Payment.findById(paymentId)
      .select('+refundReservedAmount +refundReservedAmountExact');
    if (!payment) {
      throw new AppError('Payment not found', 404, 'PAYMENT_NOT_FOUND');
    }

    const currency = payment.currency || 'PKR';
    const [refunds, disputes, order] = await Promise.all([
      Refund.find({ payment: payment._id }),
      PaymentDispute.find({ payment: payment._id }),
      payment.order ? Order.findById(payment.order) : null
    ]);

    const anomalies = [];

    // 1. Calculate sum of completed refunds
    const completedRefunds = refunds.filter((r) => r.status === 'Completed');
    let sumCompletedRefundsMinor = 0n;
    for (const r of completedRefunds) {
      if (r.currency !== currency) {
        anomalies.push({
          type: 'CURRENCY_MISMATCH',
          message: `Refund ${r.refundNumber} currency '${r.currency}' does not match payment currency '${currency}'`
        });
      }
      const minor = r.amountExact?.amountMinor !== undefined
        ? BigInt(r.amountExact.amountMinor)
        : Money.fromLegacyNumber(r.amount, currency).amountMinor;
      sumCompletedRefundsMinor += minor;
    }

    const recordedRefundedMinor = payment.refundedAmountExact?.amountMinor !== undefined
      ? BigInt(payment.refundedAmountExact.amountMinor)
      : Money.fromLegacyNumber(payment.refundedAmount || 0, currency).amountMinor;

    if (sumCompletedRefundsMinor !== recordedRefundedMinor) {
      anomalies.push({
        type: 'REFUND_LEDGER_MISMATCH',
        message: `Sum of completed refund records (${sumCompletedRefundsMinor}) does not match payment refundedAmount (${recordedRefundedMinor})`
      });
    }

    // 2. Calculate sum of active disputes
    const activeDisputes = disputes.filter((d) => !d.isResolved);
    let sumActiveDisputesMinor = 0n;
    for (const d of activeDisputes) {
      if (d.currency !== currency) {
        anomalies.push({
          type: 'CURRENCY_MISMATCH',
          message: `Dispute ${d.disputeId} currency '${d.currency}' does not match payment currency '${currency}'`
        });
      }
      const minor = d.amountExact?.amountMinor !== undefined
        ? BigInt(d.amountExact.amountMinor)
        : Money.fromLegacyNumber(d.amount, currency).amountMinor;
      sumActiveDisputesMinor += minor;
    }

    const recordedDisputedMinor = payment.disputedAmountExact?.amountMinor !== undefined
      ? BigInt(payment.disputedAmountExact.amountMinor)
      : Money.fromLegacyNumber(payment.disputedAmount || 0, currency).amountMinor;

    if (sumActiveDisputesMinor !== recordedDisputedMinor) {
      anomalies.push({
        type: 'DISPUTE_LEDGER_MISMATCH',
        message: `Sum of active dispute records (${sumActiveDisputesMinor}) does not match payment disputedAmount (${recordedDisputedMinor})`
      });
    }

    // 3. Paid amount vs total claims
    const paidMinor = payment.paidAmountExact?.amountMinor !== undefined
      ? BigInt(payment.paidAmountExact.amountMinor)
      : Money.fromLegacyNumber(payment.paidAmount || (payment.status === 'Completed' ? payment.amount : 0), currency).amountMinor;

    const reservedMinor = payment.refundReservedAmountExact?.amountMinor !== undefined
      ? BigInt(payment.refundReservedAmountExact.amountMinor)
      : Money.fromLegacyNumber(payment.refundReservedAmount || 0, currency).amountMinor;

    const totalClaimsMinor = recordedRefundedMinor + reservedMinor + recordedDisputedMinor;
    if (totalClaimsMinor > paidMinor) {
      anomalies.push({
        type: 'OVER_CLAIM_ANOMALY',
        message: `Total refund, reserved, and dispute claims (${totalClaimsMinor}) exceed paid amount (${paidMinor})`
      });
    }

    // 4. Order correlation check
    if (order) {
      const orderCurrency = order.currency || (order.totalAmountExact?.currency) || 'PKR';
      if (orderCurrency !== currency) {
        anomalies.push({
          type: 'ORDER_CURRENCY_MISMATCH',
          message: `Order currency '${orderCurrency}' does not match payment currency '${currency}'`
        });
      }
    }

    return {
      paymentId: payment._id,
      provider: payment.provider,
      providerPaymentId: payment.providerPaymentId || '',
      currency,
      paidAmount: Number(Money.fromMinor(paidMinor, currency).toDecimalString()),
      refundedAmount: Number(Money.fromMinor(recordedRefundedMinor, currency).toDecimalString()),
      reservedAmount: Number(Money.fromMinor(reservedMinor, currency).toDecimalString()),
      disputedAmount: Number(Money.fromMinor(recordedDisputedMinor, currency).toDecimalString()),
      netRealizedAmount: Number(Money.fromMinor(paidMinor > recordedRefundedMinor ? paidMinor - recordedRefundedMinor : 0n, currency).toDecimalString()),
      hasAnomalies: anomalies.length > 0,
      anomalies
    };
  }

  /**
   * Reconciles financial activity over a given date range.
   */
  async reconcilePeriod({ startDate, endDate, currency = null }) {
    const match = {};
    if (startDate && endDate) {
      match.createdAt = { $gte: new Date(startDate), $lte: new Date(endDate) };
    }
    if (currency) {
      match.currency = currency.toUpperCase();
    }

    const payments = await Payment.find(match)
      .select('+refundReservedAmount +refundReservedAmountExact')
      .populate('order', 'orderId orderStatus totalAmount currency');

    const results = [];
    let totalPaidMinor = 0n;
    let totalRefundedMinor = 0n;
    let totalDisputedMinor = 0n;
    let totalAnomaliesCount = 0;

    for (const payment of payments) {
      const rec = await this.reconcilePayment(payment._id);
      results.push(rec);

      const payCurrency = payment.currency || 'PKR';
      const paidM = payment.paidAmountExact?.amountMinor !== undefined
        ? BigInt(payment.paidAmountExact.amountMinor)
        : Money.fromLegacyNumber(payment.paidAmount || (payment.status === 'Completed' ? payment.amount : 0), payCurrency).amountMinor;
      const refM = payment.refundedAmountExact?.amountMinor !== undefined
        ? BigInt(payment.refundedAmountExact.amountMinor)
        : Money.fromLegacyNumber(payment.refundedAmount || 0, payCurrency).amountMinor;
      const dispM = payment.disputedAmountExact?.amountMinor !== undefined
        ? BigInt(payment.disputedAmountExact.amountMinor)
        : Money.fromLegacyNumber(payment.disputedAmount || 0, payCurrency).amountMinor;

      totalPaidMinor += paidM;
      totalRefundedMinor += refM;
      totalDisputedMinor += dispM;
      totalAnomaliesCount += rec.anomalies.length;
    }

    const reportCurrency = currency ? currency.toUpperCase() : (payments[0]?.currency || 'PKR');
    const netRealizedMinor = totalPaidMinor > totalRefundedMinor ? totalPaidMinor - totalRefundedMinor : 0n;

    return {
      period: {
        startDate: startDate || null,
        endDate: endDate || null,
        currency: reportCurrency
      },
      summary: {
        totalPaymentsAudited: payments.length,
        totalPaidExact: MoneyMapper.toPersistence(Money.fromMinor(totalPaidMinor, reportCurrency)),
        totalRefundedExact: MoneyMapper.toPersistence(Money.fromMinor(totalRefundedMinor, reportCurrency)),
        totalDisputedExact: MoneyMapper.toPersistence(Money.fromMinor(totalDisputedMinor, reportCurrency)),
        netRealizedExact: MoneyMapper.toPersistence(Money.fromMinor(netRealizedMinor, reportCurrency)),
        totalPaid: Number(Money.fromMinor(totalPaidMinor, reportCurrency).toDecimalString()),
        totalRefunded: Number(Money.fromMinor(totalRefundedMinor, reportCurrency).toDecimalString()),
        totalDisputed: Number(Money.fromMinor(totalDisputedMinor, reportCurrency).toDecimalString()),
        netRealized: Number(Money.fromMinor(netRealizedMinor, reportCurrency).toDecimalString()),
        totalAnomalies: totalAnomaliesCount
      },
      items: results
    };
  }
}

module.exports = new FinanceReconciliationService();

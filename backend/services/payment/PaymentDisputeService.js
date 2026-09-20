/**
 * @file PaymentDisputeService.js
 * @description Domain service managing payment dispute lifecycle, evidence handling,
 * dispute hold reservations on payments, and webhook reconciliation.
 */

'use strict';

const mongoose = require('mongoose');
const PaymentDispute = require('../../models/PaymentDispute');
const Payment = require('../../models/Payment');
const Order = require('../../models/Order');
const AuditService = require('../AuditService');
const { Money, MoneyMapper } = require('../../modules/commerce');
const { AppError } = require('../../common/errors/AppError');

class PaymentDisputeService {
  /**
   * Idempotently create or update a dispute from a provider webhook or admin action.
   */
  async recordOrUpdateDispute({
    providerDisputeId,
    providerPaymentId = '',
    paymentId = null,
    provider,
    amount,
    currency,
    fee = 0,
    status = 'needs_response',
    reason = 'general',
    evidenceDueBy = null,
    providerEventId = '',
    session = null
  }) {
    if (!providerDisputeId) {
      throw new AppError('Provider dispute ID is required', 400, 'DISPUTE_PROVIDER_ID_REQUIRED');
    }

    const ownSession = !session ? await mongoose.startSession() : null;
    const activeSession = session || ownSession;

    let resultDispute = null;

    const execute = async () => {
      // Find existing dispute
      let dispute = await PaymentDispute.findOne({
        provider,
        providerDisputeId
      }).session(activeSession);

      if (!dispute) {
        // Resolve payment
        let payment = null;
        if (paymentId) {
          payment = await Payment.findById(paymentId).session(activeSession);
        } else if (providerPaymentId) {
          payment = await Payment.findOne({
            provider,
            providerPaymentId
          }).session(activeSession);
        }

        if (!payment) {
          throw new AppError('Payment not found for dispute correlation', 404, 'PAYMENT_NOT_FOUND');
        }

        const disputeMoney = Money.fromLegacyNumber(amount, currency.toUpperCase());
        const feeMoney = fee > 0 ? Money.fromLegacyNumber(fee, currency.toUpperCase()) : null;

        // Atomically place dispute hold on payment
        payment.disputedAmount = (payment.disputedAmount || 0) + amount;
        const currentDisputedMoney = payment.disputedAmountExact
          ? MoneyMapper.toMoney(payment.disputedAmountExact)
          : Money.fromMinor(0n, currency.toUpperCase());
        payment.disputedAmountExact = MoneyMapper.toPersistence(currentDisputedMoney.add(disputeMoney));
        payment.disputeCount = (payment.disputeCount || 0) + 1;
        payment.hasActiveDispute = true;
        await payment.save({ session: activeSession });

        dispute = await PaymentDispute.create([{
          providerDisputeId,
          payment: payment._id,
          order: payment.order,
          customer: payment.user,
          provider,
          amount,
          amountExact: MoneyMapper.toPersistence(disputeMoney),
          currency: currency.toUpperCase(),
          fee,
          feeExact: feeMoney ? MoneyMapper.toPersistence(feeMoney) : null,
          status,
          reason,
          evidenceDueBy: evidenceDueBy ? new Date(evidenceDueBy) : null,
          history: [{
            status,
            source: 'provider',
            providerEventId,
            note: 'Dispute opened by provider event',
            timestamp: new Date()
          }]
        }], { session: activeSession }).then(([created]) => created);

        await AuditService.log({
          eventName: 'PAYMENT.DISPUTE_OPENED',
          status: 'SUCCESS',
          metadata: {
            disputeId: dispute.disputeId,
            providerDisputeId,
            paymentId: String(payment._id),
            amount,
            currency: currency.toUpperCase(),
            reason
          }
        });
      } else {
        // Dispute already exists; handle status updates or resolution
        const priorStatus = dispute.status;
        if (priorStatus !== status) {
          dispute.status = status;
          dispute.history.push({
            status,
            source: 'provider',
            providerEventId,
            note: `Dispute status transitioned from ${priorStatus} to ${status}`,
            timestamp: new Date()
          });

          if (['won', 'lost', 'charge_refunded'].includes(status)) {
            dispute.isResolved = true;
            dispute.resolvedAt = new Date();

            // Release dispute reservation hold on payment
            const payment = await Payment.findById(dispute.payment).session(activeSession);
            if (payment && payment.disputedAmount > 0) {
              payment.disputedAmount = Math.max(0, payment.disputedAmount - dispute.amount);
              const curMoney = payment.disputedAmountExact
                ? MoneyMapper.toMoney(payment.disputedAmountExact)
                : Money.fromMinor(0n, dispute.currency);
              const dispMoney = MoneyMapper.toMoney(dispute.amountExact);
              const remMinor = curMoney.amountMinor > dispMoney.amountMinor
                ? curMoney.amountMinor - dispMoney.amountMinor
                : 0n;
              payment.disputedAmountExact = MoneyMapper.toPersistence(Money.fromMinor(remMinor, dispute.currency));

              // Check if other active disputes remain
              const otherActive = await PaymentDispute.exists({
                payment: payment._id,
                _id: { $ne: dispute._id },
                isResolved: false
              }).session(activeSession);
              payment.hasActiveDispute = Boolean(otherActive);

              await payment.save({ session: activeSession });
            }
          }

          await dispute.save({ session: activeSession });

          await AuditService.log({
            eventName: 'PAYMENT.DISPUTE_UPDATED',
            status: 'SUCCESS',
            metadata: {
              disputeId: dispute.disputeId,
              providerDisputeId,
              priorStatus,
              newStatus: status
            }
          });
        }
      }

      resultDispute = dispute;
    };

    if (ownSession) {
      try {
        await ownSession.withTransaction(execute);
      } finally {
        await ownSession.endSession();
      }
    } else {
      await execute();
    }

    return resultDispute;
  }

  /**
   * Submit dispute defense evidence.
   */
  async submitEvidence(disputeId, {
    adminId,
    trackingNumber = '',
    customerCommunication = '',
    refundPolicyDisclosure = '',
    notes = '',
    documents = []
  }) {
    const dispute = await PaymentDispute.findById(disputeId);
    if (!dispute) {
      throw new AppError('Dispute not found', 404, 'DISPUTE_NOT_FOUND');
    }
    if (dispute.isResolved) {
      throw new AppError('Cannot submit evidence for a resolved dispute', 409, 'DISPUTE_ALREADY_RESOLVED');
    }

    dispute.evidence = {
      submittedAt: new Date(),
      submittedBy: adminId,
      trackingNumber: trackingNumber.trim(),
      customerCommunication: customerCommunication.trim(),
      refundPolicyDisclosure: refundPolicyDisclosure.trim(),
      notes: notes.trim(),
      documents: Array.isArray(documents) ? documents : []
    };
    dispute.status = 'under_review';
    dispute.history.push({
      status: 'under_review',
      source: 'admin',
      note: 'Evidence submitted by merchant/admin for provider review',
      timestamp: new Date()
    });

    await dispute.save();

    await AuditService.log({
      userId: adminId,
      eventName: 'PAYMENT.DISPUTE_EVIDENCE_SUBMITTED',
      status: 'SUCCESS',
      metadata: {
        disputeId: dispute.disputeId,
        providerDisputeId: dispute.providerDisputeId
      }
    });

    return dispute;
  }

  /**
   * List disputes for Admin panel.
   */
  async listDisputes({ page = 1, limit = 20, status = null, search = '' }) {
    const query = {};
    if (status) {
      query.status = status;
    }
    if (search) {
      query.$or = [
        { disputeId: { $regex: search, $options: 'i' } },
        { providerDisputeId: { $regex: search, $options: 'i' } }
      ];
    }

    const [disputes, total] = await Promise.all([
      PaymentDispute.find(query)
        .populate('customer', 'fullName email phone')
        .populate('order', 'orderId totalAmount currency orderStatus')
        .populate('payment', 'provider providerPaymentId amount currency status')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      PaymentDispute.countDocuments(query)
    ]);

    return {
      disputes,
      pagination: {
        page,
        limit,
        total,
        pages: Math.max(1, Math.ceil(total / limit))
      }
    };
  }

  /**
   * Get dispute details.
   */
  async getDispute(disputeId) {
    const dispute = await PaymentDispute.findById(disputeId)
      .populate('customer', 'fullName email phone')
      .populate('order', 'orderId totalAmount currency orderStatus shippingAddress items')
      .populate('payment', 'provider providerPaymentId amount currency status paidAmount refundedAmount disputedAmount')
      .populate('evidence.submittedBy', 'fullName email');

    if (!dispute) {
      throw new AppError('Dispute not found', 404, 'DISPUTE_NOT_FOUND');
    }

    return dispute;
  }
}

module.exports = new PaymentDisputeService();

/**
 * @file DocumentClassificationEngine.js
 * @description Authoritative Document Classification Engine for Phase 8.
 * Evaluates merchant registration, order payment states, tax jurisdictions,
 * and refund statuses to assign truthful document types without false tax labels.
 */

'use strict';

class DocumentClassificationEngine {
  classifyOrderDocument({ order, payment = null, merchantConfig = {} }) {
    const paymentStatus = (payment?.status || order?.paymentStatus || order?.payment?.status || '').trim().toLowerCase();
    const isPaid = paymentStatus === 'paid' || paymentStatus === 'completed';
    const isRefunded = paymentStatus === 'refunded';
    const isPartiallyRefunded = paymentStatus === 'partiallyrefunded' || paymentStatus === 'partially_refunded';
    const isFailed = paymentStatus === 'failed' || paymentStatus === 'rejected' || paymentStatus === 'expired';
    const isVerificationPending = paymentStatus === 'awaitingverification' || paymentStatus === 'awaiting_verification';

    const orderCountry = order?.shippingAddress?.countryCode
      || (typeof order?.shippingAddress?.country === 'string' && order?.shippingAddress?.country.length === 2 ? order.shippingAddress.country.toUpperCase() : 'PK');

    const merchantTaxId = merchantConfig?.taxId || '';
    const isTaxRegisteredInJurisdiction = Boolean(
      merchantConfig?.isTaxRegistered
      && merchantTaxId
      && (!merchantConfig?.jurisdiction || merchantConfig?.jurisdiction === orderCountry || merchantConfig?.registeredCountries?.includes(orderCountry))
    );

    const hasTaxAmount = Number(order?.taxAmount || order?.tax || 0) > 0;

    // 1. Paid Orders
    if (isPaid || isPartiallyRefunded) {
      if (isTaxRegisteredInJurisdiction && hasTaxAmount) {
        return {
          documentType: 'TAX_INVOICE',
          title: 'Tax Invoice',
          badgeLabel: 'Tax Compliant Invoice',
          isOfficialReceipt: true,
          classificationReason: `Merchant is tax-registered in ${orderCountry} with valid tax ID ${merchantTaxId} and order contains valid assessed tax.`,
          classificationVersion: '1.0'
        };
      }

      return {
        documentType: 'COMMERCIAL_INVOICE',
        title: 'Commercial Invoice & Payment Receipt',
        badgeLabel: 'Payment Confirmed',
        isOfficialReceipt: true,
        classificationReason: hasTaxAmount && !isTaxRegisteredInJurisdiction
          ? `Order includes local tax but merchant is not registered for official tax invoice issuance in ${orderCountry}; classified truthfully as Commercial Invoice.`
          : `Order is authoritatively settled; classified as Commercial Invoice & Payment Receipt.`,
        classificationVersion: '1.0'
      };
    }

    // 2. Fully Refunded
    if (isRefunded) {
      return {
        documentType: 'REFUND_RECEIPT',
        title: 'Payment Receipt (Refunded)',
        badgeLabel: 'Order Refunded',
        isOfficialReceipt: true,
        classificationReason: 'Order was authoritatively refunded in full.',
        classificationVersion: '1.0'
      };
    }

    // 3. Verification Pending
    if (isVerificationPending) {
      return {
        documentType: 'ORDER_CONFIRMATION',
        title: 'Order Confirmation — Payment Verification Pending',
        badgeLabel: 'Verification Pending',
        isOfficialReceipt: false,
        classificationReason: 'Payment reference submitted; awaiting authoritative settlement and merchant reconciliation.',
        classificationVersion: '1.0'
      };
    }

    // 4. Failed or Cancelled
    if (isFailed) {
      return {
        documentType: 'ORDER_CONFIRMATION',
        title: 'Order Confirmation — Payment Unsuccessful',
        badgeLabel: 'Payment Unsuccessful',
        isOfficialReceipt: false,
        classificationReason: 'Payment attempt was unsuccessful or expired. This is an order placement confirmation, not a receipt.',
        classificationVersion: '1.0'
      };
    }

    // 5. Default: Pending / Awaiting Payment
    return {
      documentType: 'ORDER_CONFIRMATION',
      title: 'Order Confirmation',
      badgeLabel: 'Payment Pending',
      isOfficialReceipt: false,
      classificationReason: 'Payment is pending settlement. This document confirms order placement, not payment clearance.',
      classificationVersion: '1.0'
    };
  }

  classifyRefundDocument({ refund, order }) {
    return {
      documentType: 'CREDIT_NOTE',
      title: 'Official Credit Note',
      badgeLabel: 'Credit Note Settled',
      isOfficialReceipt: true,
      classificationReason: `Credit Note issued for completed Refund #${refund?.refundNumber || refund?._id} against Order #${order?.orderId || order?._id}.`,
      classificationVersion: '1.0'
    };
  }
}

module.exports = new DocumentClassificationEngine();

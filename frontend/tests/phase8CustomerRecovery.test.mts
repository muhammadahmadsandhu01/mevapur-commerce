/**
 * Phase 8 Storefront Customer Recovery & Invoice Document Truthfulness Contract Tests
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyInvoiceDocument,
  formatDocumentBadge,
  isOfficialTaxInvoiceEligible,
} from '../src/lib/invoiceClassification.ts';

describe('Phase 8 — Storefront Customer Recovery & Document Truthfulness Contracts', () => {
  it('never classifies pending or unpaid orders as TAX_INVOICE or official paid receipts', () => {
    const pendingDoc = classifyInvoiceDocument('Pending', 'Pending');
    assert.equal(pendingDoc.type, 'ORDER_CONFIRMATION');
    assert.equal(pendingDoc.isOfficialReceipt, false);
    assert.match(pendingDoc.notes, /pending settlement/i);

    const unverifiedDoc = classifyInvoiceDocument('Pending', 'AwaitingVerification');
    assert.equal(unverifiedDoc.type, 'ORDER_CONFIRMATION_VERIFICATION_PENDING');
    assert.equal(unverifiedDoc.isOfficialReceipt, false);
    assert.equal(unverifiedDoc.badgeLabel, 'Verification Pending');
    assert.match(unverifiedDoc.notes, /reconciliation/i);

    const failedDoc = classifyInvoiceDocument('Failed', 'Failed');
    assert.equal(failedDoc.type, 'ORDER_CONFIRMATION_PAYMENT_FAILED');
    assert.equal(failedDoc.isOfficialReceipt, false);
    assert.match(failedDoc.title, /Unsuccessful/i);
  });

  it('never grants TAX_INVOICE classification without merchant tax registration in jurisdiction', () => {
    // Paid order with tax, but merchant is NOT tax registered -> Truthfully downgraded to PAYMENT_RECEIPT
    const unregisteredTaxDoc = classifyInvoiceDocument('Paid', 'Completed', {
      isTaxRegistered: false,
      hasTaxAmount: true,
    });
    assert.equal(unregisteredTaxDoc.type, 'PAYMENT_RECEIPT');
    assert.equal(unregisteredTaxDoc.isOfficialReceipt, true);
    assert.match(unregisteredTaxDoc.notes, /verified and settled/i);

    // Paid order with tax AND registered merchant -> TAX_INVOICE
    const registeredTaxDoc = classifyInvoiceDocument('Paid', 'Completed', {
      isTaxRegistered: true,
      taxId: 'NTN-1234567-8',
      hasTaxAmount: true,
    });
    assert.equal(registeredTaxDoc.type, 'TAX_INVOICE');
    assert.equal(registeredTaxDoc.isOfficialReceipt, true);
    assert.equal(registeredTaxDoc.title, 'Official Tax Invoice');
  });

  it('classifies refund states as truthful CREDIT_NOTE or REFUND_RECEIPT', () => {
    const refundDoc = classifyInvoiceDocument('Refunded', 'Refunded', { isRefund: true });
    assert.equal(refundDoc.type, 'CREDIT_NOTE');
    assert.equal(refundDoc.isOfficialReceipt, true);
    assert.equal(refundDoc.title, 'Official Credit Note');

    const partialRefundDoc = classifyInvoiceDocument('PartiallyRefunded', 'PartiallyRefunded');
    assert.equal(partialRefundDoc.type, 'PAYMENT_RECEIPT_PARTIALLY_REFUNDED');
    assert.equal(partialRefundDoc.isOfficialReceipt, true);
  });

  it('isOfficialTaxInvoiceEligible returns true only when paid, tax registered, and tax amount exists', () => {
    assert.equal(
      isOfficialTaxInvoiceEligible({
        paymentStatus: 'Paid',
        isTaxRegistered: true,
        taxId: 'STRN-987654',
        taxAmount: 250,
      }),
      true
    );

    assert.equal(
      isOfficialTaxInvoiceEligible({
        paymentStatus: 'Pending',
        isTaxRegistered: true,
        taxId: 'STRN-987654',
        taxAmount: 250,
      }),
      false
    );

    assert.equal(
      isOfficialTaxInvoiceEligible({
        paymentStatus: 'Paid',
        isTaxRegistered: false,
        taxAmount: 250,
      }),
      false
    );
  });

  it('formatDocumentBadge provides accessible text and styling tokens without color-only reliance', () => {
    const paidBadge = formatDocumentBadge('TAX_INVOICE');
    assert.equal(paidBadge.text, 'Official Tax Invoice');
    assert.match(paidBadge.className, /emerald/);

    const pendingBadge = formatDocumentBadge('ORDER_CONFIRMATION');
    assert.equal(pendingBadge.text, 'Order Confirmation');
    assert.match(pendingBadge.className, /amber/);

    const failedBadge = formatDocumentBadge('ORDER_CONFIRMATION_PAYMENT_FAILED');
    assert.equal(failedBadge.text, 'Payment Failed');
    assert.match(failedBadge.className, /rose/);
  });
});
